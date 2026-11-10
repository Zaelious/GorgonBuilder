/**
 * Test-only in-memory stand-in for the T0019 API contract (status codes, revisions, owner and
 * visibility rules, sanitized non-owner documents). UI tests use it through the real client;
 * the real Worker + native D1 path is covered by worker/frontend-client.test.ts.
 */
import type { BuildDocument } from '../../../core/build/document';
import { publicDocument } from '../../../persistence/remote/public-document';
import type { FetchLike, Visibility } from '../api';

interface Row { id: string; owner: string; visibility: Visibility; title: string; publicDescription: string; document: BuildDocument; revision: number; createdAt: number; updatedAt: number }
export interface FakeCall { method: string; path: string; body: Record<string, unknown> | null }

export function createFakeAccountServer(options: { mode?: 'enabled' | 'disabled' | 'unavailable' } = {}) {
  let mode = options.mode ?? 'enabled';
  /** null = guest; '' = signed in without a username yet. */
  let session: string | null = null;
  const usernames = new Set<string>();
  const rows = new Map<string, Row>();
  const calls: FakeCall[] = [];
  const failures: { match: (call: FakeCall) => boolean; status: number; code: string; message: string }[] = [];
  let held: { match: (call: FakeCall) => boolean; release: Promise<void> } | null = null;
  let clock = 1_700_000_000_000;
  let counter = 0;

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const error = (status: number, code: string, message = code) => json({ error: { code, message } }, status);
  const summary = (row: Row) => ({
    id: row.id, visibility: row.visibility, title: row.title, publicDescription: row.publicDescription,
    skillAId: row.document.skillSlotA.skillId, skillBId: row.document.skillSlotB.skillId, schemaVersion: 1,
    gameDataVersion: row.document.gameDataVersion, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt,
    author: { username: row.owner },
  });
  const dto = (row: Row, viewer: string | null) => ({ ...summary(row), document: viewer === row.owner ? structuredClone(row.document) : publicDocument(row.document) });
  const newId = () => `build${String(++counter).padStart(11, '0')}`;
  const readable = (row: Row | undefined, viewer: string | null) => row && (row.owner === viewer || row.visibility !== 'private');

  function insert(owner: string, document: BuildDocument, meta: { title?: string; publicDescription?: string; visibility?: Visibility } = {}) {
    clock += 1000;
    const row: Row = { id: newId(), owner, visibility: meta.visibility ?? 'private', title: meta.title ?? document.title, publicDescription: meta.publicDescription ?? '',
      document: structuredClone(document), revision: 1, createdAt: clock, updatedAt: clock };
    rows.set(row.id, row);
    return row;
  }

  async function handle(path: string, method: string, body: Record<string, unknown> | null): Promise<Response> {
    const url = new URL(path, 'https://staging.example');
    const route = url.pathname;
    if (mode === 'disabled') return error(503, 'not_configured');
    if (mode === 'unavailable') return error(503, 'unavailable');
    const viewer = session || null;
    if (route === '/api/auth/get-session') return json(session === null ? { authenticated: false } : { authenticated: true, profile: session ? { username: session } : null, needsUsername: !session });
    if (route === '/api/auth/sign-in/social') return json({ url: `https://accounts.example/${String(body?.provider)}?return=${encodeURIComponent(String(body?.callbackURL))}`, redirect: true });
    if (route === '/api/auth/sign-out') { session = null; return json({ success: true }); }
    const publicRead = method === 'GET' && (route.startsWith('/api/builds/') || route.startsWith('/api/users/'));
    if (session === null && !publicRead) return error(401, 'unauthenticated');
    if (route === '/api/me/username') {
      const name = String(body?.username);
      if (session) return error(409, 'username_conflict');
      if ([...usernames].some(existing => existing.toLowerCase() === name.toLowerCase())) return error(409, 'username_conflict');
      usernames.add(name); session = name;
      return json({ profile: { username: name }, needsUsername: false });
    }
    if (method !== 'GET' && session === '') return error(403, 'username_required');
    if (route === '/api/me/builds') {
      const items = [...rows.values()].filter(row => row.owner === viewer).sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : -1));
      return pageOf(items, url);
    }
    const author = /^\/api\/users\/([^/]+)\/builds$/.exec(route);
    if (author) {
      const name = decodeURIComponent(author[1]!);
      if (![...usernames].some(existing => existing.toLowerCase() === name.toLowerCase())) return error(404, 'not_found');
      return pageOf([...rows.values()].filter(row => row.owner.toLowerCase() === name.toLowerCase() && row.visibility === 'public').sort((a, b) => b.updatedAt - a.updatedAt), url);
    }
    if (route === '/api/builds' && method === 'POST') {
      const row = insert(viewer!, body!.document as BuildDocument, body as never);
      return json(dto(row, viewer), 201);
    }
    const copy = /^\/api\/builds\/([^/]+)\/copy$/.exec(route);
    if (copy) {
      const source = rows.get(copy[1]!);
      if (!readable(source, viewer)) return error(404, 'not_found');
      const document = source!.owner === viewer ? source!.document : publicDocument(source!.document);
      const row = insert(viewer!, document, { title: typeof body?.title === 'string' ? body.title : source!.title, publicDescription: source!.publicDescription });
      return json(dto(row, viewer), 201);
    }
    const id = /^\/api\/builds\/([^/]+)$/.exec(route)?.[1];
    const row = id ? rows.get(id) : undefined;
    if (!readable(row, viewer)) return error(404, 'not_found');
    if (method === 'GET') return json(dto(row!, viewer));
    if (row!.owner !== viewer) return error(403, 'forbidden');
    if (body?.expectedRevision !== row!.revision) return error(409, 'revision_conflict');
    if (method === 'DELETE') { rows.delete(row!.id); return json({ id: row!.id }); }
    clock += 1000;
    if (body.document) row!.document = structuredClone(body.document as BuildDocument);
    if (typeof body.title === 'string') row!.title = body.title;
    if (typeof body.publicDescription === 'string') row!.publicDescription = body.publicDescription;
    if (typeof body.visibility === 'string') row!.visibility = body.visibility as Visibility;
    row!.revision += 1; row!.updatedAt = clock;
    return json(dto(row!, viewer));
  }

  function pageOf(items: Row[], url: URL) {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const start = Number(url.searchParams.get('cursor') ?? 0);
    const slice = items.slice(start, start + limit);
    return json({ items: slice.map(summary), nextCursor: start + limit < items.length ? String(start + limit) : null });
  }

  const fetch: FetchLike = async (input, init = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    const call: FakeCall = { method, path: input, body };
    calls.push(call);
    if (held?.match(call)) { const wait = held.release; held = null; await wait; }
    const index = failures.findIndex(failure => failure.match(call));
    if (index >= 0) {
      const [failure] = failures.splice(index, 1);
      if (failure!.status === 0) throw new TypeError('Failed to fetch');
      return error(failure!.status, failure!.code, failure!.message);
    }
    return handle(input, method, body);
  };

  return {
    fetch, calls, rows,
    setMode(next: typeof mode) { mode = next; },
    /** Simulate a completed OAuth session (username null = new account still onboarding). */
    signInAs(username: string | null) { if (username) usernames.add(username); session = username ?? ''; },
    signOutServerSide() { session = null; },
    insert,
    failNext(match: (call: FakeCall) => boolean, status: number, code: string, message = '') { failures.push({ match, status, code, message }); },
    /** Hold the next matching request until the returned function is called. */
    hold(match: (call: FakeCall) => boolean) { let release!: () => void; held = { match, release: new Promise<void>(resolve => { release = resolve; }) }; return () => release(); },
    writes: () => calls.filter(call => call.method !== 'GET'),
  };
}
export type FakeAccountServer = ReturnType<typeof createFakeAccountServer>;

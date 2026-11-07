import { GUEST, isOwner, userActor } from '../../src/persistence/remote/access';
import { createD1BuildRepository } from '../../src/persistence/remote/d1-build-repository';
import type { PageRequest, RepositoryResult } from '../../src/persistence/remote/build-repository';
import { publicDocument } from '../../src/persistence/remote/public-document';
import { normalizeUsername, validateUsername } from '../../src/persistence/remote/username';
import { accountConfig, type AccountEnv } from '../auth/runtime';
import { buildDto, summaryDto, type MeDto } from './dto';
import { GAME_DATA_VERSION, isKnownCombatSkillId } from './game-policy';
import { apiError, jsonResponse } from './http';
import { checkOrigin, enforceRateLimit, onlyKeys, readJson, RequestFailure } from './security';

const AUTH_ROUTES: Record<string, string> = {
  '/api/auth/sign-in/social': 'POST', '/api/auth/sign-out': 'POST', '/api/auth/get-session': 'GET',
  '/api/auth/callback/discord': 'GET', '/api/auth/callback/google': 'GET', '/api/auth/error': 'GET',
};
export function accountMethods(path: string): string[] | null {
  if (AUTH_ROUTES[path]) return [AUTH_ROUTES[path]];
  if (path === '/api/me') return ['GET', 'DELETE'];
  if (path === '/api/me/builds' || /^\/api\/users\/[^/]+\/builds$/.test(path)) return ['GET'];
  if (path === '/api/me/username') return ['PUT'];
  if (path === '/api/builds') return ['POST'];
  if (/^\/api\/builds\/[A-Za-z0-9_-]{16}$/.test(path)) return ['GET', 'PATCH', 'DELETE'];
  if (/^\/api\/builds\/[A-Za-z0-9_-]{16}\/copy$/.test(path)) return ['POST'];
  return null;
}
function unwrap<T>(result: RepositoryResult<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  const status = { unauthenticated: 401, forbidden: 403, not_found: 404, revision_conflict: 409,
    payload_too_large: 413, invalid_request: 400, invalid_document: 422, unsupported_schema_version: 422, invalid_metadata: 422 }[code];
  throw new RequestFailure(status, code, result.error.message);
}
function pageRequest(url: URL): PageRequest {
  if ([...url.searchParams.keys()].some(key => key !== 'cursor' && key !== 'limit')) throw new RequestFailure(400, 'invalid_request', 'Unknown page parameter.');
  return { ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}), cursor: url.searchParams.get('cursor') };
}

export async function handleAccount(request: Request, env: AccountEnv): Promise<Response> {
  const config = await accountConfig(request, env);
  if (!config) return apiError(503, 'not_configured', 'Account features are not available on this deployment.');
  const { origin, db, auth } = config;
  const url = new URL(request.url);
  const path = url.pathname;
  const unsafe = !['GET', 'HEAD'].includes(request.method);
  if (unsafe) checkOrigin(request, origin);
  if (unsafe || path.includes('/callback/')) await enforceRateLimit(db, path.startsWith('/api/auth/') ? 'auth' : 'write-ip',
    request.headers.get('cf-connecting-ip') ?? 'local-or-unknown', path.startsWith('/api/auth/') ? 20 : 60);

  if (path === '/api/auth/error') return apiError(400, 'oauth_failed',
    'Sign-in could not be completed. Discord requires an available verified email. Try Google or your original sign-in provider.');
  if (path === '/api/auth/sign-in/social' || path === '/api/auth/sign-out') {
    const body = await readJson(request, 8192);
    if (path.endsWith('/social')) {
      onlyKeys(body, ['provider', 'callbackURL']);
      if (body.provider !== 'discord' && body.provider !== 'google') throw new RequestFailure(400, 'invalid_provider', 'Choose Discord or Google.');
      if (body.callbackURL !== undefined) {
        let valid = false;
        try { valid = typeof body.callbackURL === 'string' && new URL(body.callbackURL, origin).origin === origin; } catch { /* malformed URL */ }
        if (!valid) throw new RequestFailure(400, 'invalid_callback', 'Use a same-origin callback.');
      }
      body.callbackURL ??= '/';
      body.errorCallbackURL = '/api/auth/error';
    } else onlyKeys(body, []);
    const response = await auth.handler(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(body) }));
    if (!response.ok) return apiError(response.status, 'auth_failed', 'Sign-in or sign-out could not be completed. Try your original provider or Google.');
    return response;
  }
  if (path.includes('/api/auth/callback/')) {
    if (url.search.length > 16384) throw new RequestFailure(413, 'payload_too_large', 'Callback is too large.');
    return auth.handler(request);
  }

  // Better Auth verifies the signed cookie AND the database session/expiry. Cookie cache is off.
  const { response: session, headers: sessionHeaders } = await auth.api.getSession({ headers: request.headers, returnHeaders: true });
  const actor = session ? userActor(session.user.id) : GUEST;
  const respond = (body: unknown, status = 200) => {
    const response = jsonResponse(body, status);
    for (const cookie of sessionHeaders.getSetCookie()) response.headers.append('set-cookie', cookie);
    return response;
  };
  const profile = async (id: string) => db.prepare('SELECT username FROM profile WHERE user_id=?').bind(id).first<{ username: string }>();
  const usernameFor = async (id: string) => (await profile(id))?.username ?? null;
  if (path === '/api/auth/get-session' && actor.kind === 'guest') return respond({ authenticated: false });
  const publicRead = request.method === 'GET' && (path.startsWith('/api/builds/') || path.startsWith('/api/users/'));
  if (!publicRead && actor.kind === 'guest') throw new RequestFailure(401, 'unauthenticated', 'Sign in again to continue.');
  // T0018 ADR account-erasure requirement: explicit confirmation plus a fresh login.
  if (path === '/api/me' && request.method === 'DELETE' && actor.kind === 'user' && session) {
    const body = await readJson(request, 1024);
    onlyKeys(body, ['confirmation']);
    if (body.confirmation !== 'delete my account') throw new RequestFailure(400, 'confirmation_required', 'Confirm account deletion.');
    if (Date.now() - new Date(session.session.createdAt).getTime() > 10 * 60 * 1000) {
      throw new RequestFailure(403, 'fresh_session_required', 'Sign in again before deleting your account.');
    }
    await enforceRateLimit(db, 'account-delete', actor.userId, 3);
    await db.prepare('DELETE FROM "user" WHERE id=?').bind(actor.userId).run();
    // FK cascade erases profiles, builds, accounts and all sessions atomically.
    return auth.api.signOut({ headers: request.headers, asResponse: true });
  }
  if (path === '/api/me' || path === '/api/auth/get-session') {
    const current = actor.kind === 'user' ? await profile(actor.userId) : null;
    const dto: MeDto = { authenticated: true, profile: current, needsUsername: !current };
    return respond(dto);
  }
  if (unsafe && actor.kind === 'user') await enforceRateLimit(db, path === '/api/me/username' ? 'username' : 'write-user', actor.userId,
    path === '/api/me/username' ? 5 : 30);
  if (path === '/api/me/username' && actor.kind === 'user') {
    const body = await readJson(request, 1024);
    onlyKeys(body, ['username']);
    const username = validateUsername(body.username);
    if (!username.ok) throw new RequestFailure(422, 'invalid_username', username.message);
    const at = Date.now();
    // Atomic UNIQUE conflict, with no SQL-error inspection. Only initial onboarding or an
    // idempotent retry is allowed; renames/cooldowns await an explicit product policy.
    await db.prepare(`INSERT INTO profile(user_id,username,username_normalized,created_at,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(actor.userId, username.display, username.normalized, at, at).run();
    const current = await profile(actor.userId);
    if (!current || normalizeUsername(current.username) !== username.normalized) throw new RequestFailure(409, 'username_conflict', 'That username is unavailable or this account already has a username.');
    return respond({ profile: current, needsUsername: false });
  }
  if (unsafe && actor.kind === 'user' && !await profile(actor.userId)) throw new RequestFailure(403, 'username_required', 'Choose a username before saving builds.');
  const repo = createD1BuildRepository(db, { isKnownCombatSkillId, validateGameDataVersion: version => version === GAME_DATA_VERSION,
    foreignCopyDocument: publicDocument });
  if (path === '/api/me/builds') {
    const page = unwrap(await repo.listOwn(actor, pageRequest(url)));
    const username = actor.kind === 'user' ? await usernameFor(actor.userId) : null;
    return respond({ items: page.items.map(row => summaryDto(row, username)), nextCursor: page.nextCursor });
  }
  if (path.startsWith('/api/users/')) {
    let handle: string;
    try { handle = decodeURIComponent(path.split('/')[3]!); }
    catch { throw new RequestFailure(400, 'invalid_request', 'Invalid author handle.'); }
    const validated = validateUsername(handle);
    if (!validated.ok) throw new RequestFailure(404, 'not_found', 'Author not found.');
    const author = await db.prepare('SELECT user_id, username FROM profile WHERE username_normalized=?')
      .bind(validated.normalized).first<{ user_id: string; username: string }>();
    if (!author) throw new RequestFailure(404, 'not_found', 'Author not found.');
    const page = unwrap(await repo.listPublicByOwner(author.user_id, pageRequest(url)));
    return respond({ items: page.items.map(row => summaryDto(row, author.username)), nextCursor: page.nextCursor });
  }
  const id = path.split('/')[3]!;
  if (request.method === 'GET') {
    const row = unwrap(await repo.get(actor, id));
    return respond(buildDto(row, await usernameFor(row.ownerUserId), isOwner(actor, row)));
  }
  const body = await readJson(request, path.endsWith('/copy') ? 1024 : undefined);
  if (request.method === 'DELETE') {
    onlyKeys(body, ['expectedRevision']);
    return respond(unwrap(await repo.delete(actor, id, { expectedRevision: body.expectedRevision as number })));
  }
  if (path.endsWith('/copy')) {
    onlyKeys(body, ['title']);
    const row = unwrap(await repo.copy(actor, id, body));
    return respond(buildDto(row, await usernameFor(row.ownerUserId), true), 201);
  }
  onlyKeys(body, request.method === 'PATCH' ? ['document', 'title', 'publicDescription', 'visibility', 'expectedRevision']
    : ['document', 'title', 'publicDescription', 'visibility']);
  const row = unwrap(request.method === 'PATCH'
    ? await repo.update(actor, id, { ...body, expectedRevision: body.expectedRevision as number })
    : await repo.create(actor, { ...body, document: body.document }));
  return respond(buildDto(row, await usernameFor(row.ownerUserId), true), request.method === 'POST' ? 201 : 200);
}

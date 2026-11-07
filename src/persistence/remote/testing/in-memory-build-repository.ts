/**
 * TEST-ONLY deterministic in-memory BuildRepository (T0018).
 *
 * This is not persistence: nothing survives the process, and production code must
 * never import it (enforced by ESLint). It exists to pin down the repository contract
 * and its authorization boundaries before T0019's D1 implementation.
 */
import { canModify, canRead, type Actor } from '../access';
import { generateBuildId, isBuildId, seededRandomBytes } from '../build-id';
import {
  DEFAULT_BUILD_VISIBILITY, defaultRecordTitle, normalizeBuildTitle, normalizePublicDescription,
  normalizeVisibility, prepareBuildDocument, type BuildRecord, type BuildSummary, type PayloadResult,
  type PrepareOptions,
} from '../build-record';
import {
  PAGE_DEFAULT_LIMIT, PAGE_MAX_LIMIT, type BuildRepository, type Page, type PageRequest,
  type RepositoryError, type RepositoryResult,
} from '../build-repository';

export interface InMemoryBuildRepositoryOptions extends PrepareOptions {
  /** Epoch-ms clock. Default: starts at 2026-01-01T00:00:00Z and advances 1 s per call. */
  now?: () => number;
  /** Default: seeded, reproducible base64url IDs. */
  generateId?: () => string;
  seed?: number;
}

export interface InMemoryBuildRepository extends BuildRepository {
  /** Test inspection only: every stored record, including Private ones, as deep copies. */
  snapshot(): BuildRecord[];
}

const START = Date.UTC(2026, 0, 1);

export function createInMemoryBuildRepository(options: InMemoryBuildRepositoryOptions = {}): InMemoryBuildRepository {
  let tick = 0;
  const now = options.now ?? (() => START + 1000 * tick++);
  const random = seededRandomBytes(options.seed ?? 18);
  const generateId = options.generateId ?? (() => generateBuildId(random));
  const prepare: PrepareOptions = options.isKnownCombatSkillId ? { isKnownCombatSkillId: options.isKnownCombatSkillId } : {};
  const records = new Map<string, BuildRecord>();

  const clone = <T>(value: T): T => structuredClone(value);
  const summary = (record: BuildRecord): BuildSummary => {
    const copy: Partial<BuildRecord> = clone(record);
    delete copy.document;
    return copy as BuildSummary;
  };

  function newId(): string {
    const id = generateId();
    if (!isBuildId(id) || records.has(id)) throw new Error('Build ID generator produced an invalid or duplicate ID.');
    return id;
  }

  function readable(actor: Actor, buildId: string): RepositoryResult<BuildRecord> {
    const record = isBuildId(buildId) ? records.get(buildId) : undefined;
    return record && canRead(actor, record) ? { ok: true, value: record } : notFound();
  }

  function modifiable(actor: Actor, buildId: string, expectedRevision: unknown): RepositoryResult<BuildRecord> {
    if (actor.kind !== 'user') return err('unauthenticated', 'Sign in to change builds.');
    const found = readable(actor, buildId);
    if (!found.ok) return found;
    if (!canModify(actor, found.value)) return err('forbidden', 'Only the owner can change this build.');
    if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      return err('invalid_request', 'expectedRevision must be a positive integer.', 'expectedRevision');
    }
    if (found.value.revision !== expectedRevision) {
      return err('revision_conflict', 'The build changed since it was loaded.', 'expectedRevision');
    }
    return found;
  }

  function page(all: BuildRecord[], request: PageRequest = {}): RepositoryResult<Page<BuildSummary>> {
    const limit = request.limit ?? PAGE_DEFAULT_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_MAX_LIMIT) {
      return err('invalid_request', `limit must be 1–${PAGE_MAX_LIMIT}.`, 'limit');
    }
    const sorted = [...all].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    let start = 0;
    if (request.cursor) {
      const after = decodeCursor(request.cursor);
      if (!after) return err('invalid_request', 'Invalid cursor.', 'cursor');
      start = sorted.findIndex(r => r.updatedAt < after.updatedAt || (r.updatedAt === after.updatedAt && r.id < after.id));
      if (start < 0) start = sorted.length;
    }
    const items = sorted.slice(start, start + limit);
    const last = items.at(-1);
    const nextCursor = last && start + limit < sorted.length ? encodeCursor(last) : null;
    return { ok: true, value: { items: items.map(summary), nextCursor } };
  }

  return {
    async create(actor, input) {
      if (actor.kind !== 'user') return err('unauthenticated', 'Sign in to save builds to your account.');
      const prepared = prepareBuildDocument(input.document, prepare);
      if (!prepared.ok) return prepared;
      const title = input.title === undefined ? ok(defaultRecordTitle(prepared.value.document)) : normalizeBuildTitle(input.title);
      if (!title.ok) return title;
      const description = normalizePublicDescription(input.publicDescription ?? '');
      if (!description.ok) return description;
      const visibility = normalizeVisibility(input.visibility ?? DEFAULT_BUILD_VISIBILITY);
      if (!visibility.ok) return visibility;
      const at = now();
      const record: BuildRecord = {
        id: newId(), ownerUserId: actor.userId, visibility: visibility.value, title: title.value,
        publicDescription: description.value, ...prepared.value.metadata, revision: 1,
        createdAt: at, updatedAt: at, document: prepared.value.document,
      };
      records.set(record.id, record);
      return ok(clone(record));
    },

    async get(actor, buildId) {
      const found = readable(actor, buildId);
      return found.ok ? ok(clone(found.value)) : found;
    },

    async update(actor, buildId, input) {
      const found = modifiable(actor, buildId, input.expectedRevision);
      if (!found.ok) return found;
      const { document, title, publicDescription, visibility } = input;
      if (document === undefined && title === undefined && publicDescription === undefined && visibility === undefined) {
        return err('invalid_request', 'Nothing to update.');
      }
      const next: BuildRecord = { ...found.value };
      if (document !== undefined) {
        const prepared = prepareBuildDocument(document, prepare);
        if (!prepared.ok) return prepared;
        Object.assign(next, prepared.value.metadata, { document: prepared.value.document });
      }
      for (const [value, normalize, key] of [
        [title, normalizeBuildTitle, 'title'],
        [publicDescription, normalizePublicDescription, 'publicDescription'],
        [visibility, normalizeVisibility, 'visibility'],
      ] as const) {
        if (value === undefined) continue;
        const result: PayloadResult<string> = normalize(value);
        if (!result.ok) return result;
        Object.assign(next, { [key]: result.value });
      }
      next.revision += 1;
      next.updatedAt = Math.max(now(), found.value.updatedAt);
      records.set(buildId, next);
      return ok(clone(next));
    },

    async delete(actor, buildId, input) {
      const found = modifiable(actor, buildId, input.expectedRevision);
      if (!found.ok) return found;
      records.delete(buildId);
      return ok({ id: buildId });
    },

    async copy(actor, sourceBuildId, input = {}) {
      if (actor.kind !== 'user') return err('unauthenticated', 'Sign in to copy builds into your account.');
      const found = readable(actor, sourceBuildId);
      if (!found.ok) return found;
      const title = input.title === undefined ? ok(found.value.title) : normalizeBuildTitle(input.title);
      if (!title.ok) return title;
      const at = now();
      const source = found.value;
      const record: BuildRecord = {
        id: newId(), ownerUserId: actor.userId, visibility: 'private', title: title.value, publicDescription: '',
        skillAId: source.skillAId, skillBId: source.skillBId, schemaVersion: source.schemaVersion,
        gameDataVersion: source.gameDataVersion, revision: 1, createdAt: at, updatedAt: at,
        document: clone(source.document),
      };
      records.set(record.id, record);
      return ok(clone(record));
    },

    async listOwn(actor, request) {
      if (actor.kind !== 'user') return err('unauthenticated', 'Sign in to see your builds.');
      return page([...records.values()].filter(r => r.ownerUserId === actor.userId), request);
    },

    async listPublicByOwner(ownerUserId, request) {
      return page([...records.values()].filter(r => r.ownerUserId === ownerUserId && r.visibility === 'public'), request);
    },

    snapshot() {
      return [...records.values()].map(clone);
    },
  };
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function err(code: RepositoryError['code'], message: string, field?: string): { ok: false; error: RepositoryError } {
  return { ok: false, error: { code, message, ...(field ? { field } : {}) } };
}

function notFound(): { ok: false; error: RepositoryError } {
  return err('not_found', 'Build not found.');
}

function encodeCursor(record: Pick<BuildRecord, 'updatedAt' | 'id'>): string {
  return `${record.updatedAt.toString(36)}.${record.id}`;
}

function decodeCursor(cursor: string): { updatedAt: number; id: string } | null {
  const match = /^([0-9a-z]{1,12})\.([A-Za-z0-9_-]{16})$/.exec(cursor);
  if (!match) return null;
  const updatedAt = parseInt(match[1]!, 36);
  return Number.isSafeInteger(updatedAt) ? { updatedAt, id: match[2]! } : null;
}

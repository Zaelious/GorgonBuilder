import type { BuildDocument } from '../../core/build/document';
import { isOwner, type Actor } from './access';
import { generateBuildId, isBuildId } from './build-id';
import {
  defaultRecordTitle, normalizeBuildTitle, normalizePublicDescription, normalizeVisibility, prepareBuildDocument,
  type BuildRecord, type BuildSummary, type PrepareOptions,
} from './build-record';
import {
  PAGE_DEFAULT_LIMIT, PAGE_MAX_LIMIT, type BuildRepository, type PageRequest,
  type RepositoryErrorCode, type RepositoryResult,
} from './build-repository';
import type { BuildDatabase } from './d1';

const summaryColumns = `id, owner_user_id AS ownerUserId, visibility, title, public_description AS publicDescription,
  skill_a_id AS skillAId, skill_b_id AS skillBId, schema_version AS schemaVersion,
  game_data_version AS gameDataVersion, revision, created_at AS createdAt, updated_at AS updatedAt`;
const recordColumns = `${summaryColumns}, build_json AS json`;
type Row = BuildSummary & { json: string };
const record = ({ json, ...row }: Row): BuildRecord => ({ ...row, document: JSON.parse(json) as BuildDocument });
const ok = <T>(value: T): RepositoryResult<T> => ({ ok: true, value });
const fail = (code: RepositoryErrorCode, message: string): RepositoryResult<never> => ({ ok: false, error: { code, message } });
const missing = () => fail('not_found', 'Build not found.');
const conflict = () => fail('revision_conflict', 'The build changed since it was loaded.');

export interface D1RepositoryOptions extends PrepareOptions {
  now?: () => number;
  /** Worker applies the audited public projection to copies made by another account.
   * Internal contract defaults to an exact copy, as specified by the T0018 contract.
   */
  foreignCopyDocument?: (document: BuildDocument) => BuildDocument;
  validateGameDataVersion?: (version: string) => boolean;
}

/** Permanent D1 implementation. All SQL is parameterized. D1 sessions use primary by default;
 * no replica/session bookmark or cross-request record cache can delay privacy revocation.
 */
export function createD1BuildRepository(db: BuildDatabase, options: D1RepositoryOptions = {}): BuildRepository {
  const now = options.now ?? Date.now;
  const prepare = (document: unknown) => {
    const result = prepareBuildDocument(document, options);
    if (result.ok && options.validateGameDataVersion && !options.validateGameDataVersion(result.value.metadata.gameDataVersion)) {
      return fail('invalid_document', 'This game-data version is not supported.');
    }
    return result;
  };
  async function get(actor: Actor, id: string): Promise<RepositoryResult<BuildRecord>> {
    if (!isBuildId(id)) return missing();
    const row = await db.prepare(`SELECT ${recordColumns} FROM build WHERE id = ?
      AND (visibility <> 'private' OR owner_user_id = ?)`).bind(id, actor.kind === 'user' ? actor.userId : '').first<Row>();
    return row ? ok(record(row)) : missing();
  }
  async function modifiable(actor: Actor, id: string, revision: number) {
    if (actor.kind !== 'user') return fail('unauthenticated', 'Sign in to change builds.');
    const found = await get(actor, id);
    if (!found.ok) return found;
    if (!isOwner(actor, found.value)) return fail('forbidden', 'Only the owner can change this build.');
    if (!Number.isSafeInteger(revision) || revision < 1) return fail('invalid_request', 'expectedRevision must be a positive integer.');
    return revision === found.value.revision ? found : conflict();
  }
  async function list(owner: string, onlyPublic: boolean, page: PageRequest = {}) {
    const limit = page.limit ?? PAGE_DEFAULT_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_MAX_LIMIT) return fail('invalid_request', 'Invalid page limit.');
    let after: { at: number; id: string } | undefined;
    if (page.cursor) {
      const match = /^([0-9a-z]{1,12})\.([A-Za-z0-9_-]{16})$/.exec(page.cursor);
      if (!match || !Number.isSafeInteger(parseInt(match[1]!, 36))) return fail('invalid_request', 'Invalid cursor.');
      after = { at: parseInt(match[1]!, 36), id: match[2]! };
    }
    const rows = await db.prepare(`SELECT ${summaryColumns} FROM build WHERE owner_user_id = ?
      ${onlyPublic ? "AND visibility = 'public'" : ''}
      ${after ? 'AND (updated_at < ? OR (updated_at = ? AND id < ?))' : ''}
      ORDER BY updated_at DESC, id DESC LIMIT ?`).bind(owner,
        ...(after ? [after.at, after.at, after.id] : []), limit + 1).all<BuildSummary>();
    const items = rows.results.slice(0, limit);
    const last = items.at(-1);
    return ok({ items, nextCursor: rows.results.length > limit && last ? `${last.updatedAt.toString(36)}.${last.id}` : null });
  }
  return {
    get,
    async create(actor, input) {
      if (actor.kind !== 'user') return fail('unauthenticated', 'Sign in to save builds.');
      const prepared = prepare(input.document);
      if (!prepared.ok) return prepared;
      const title = normalizeBuildTitle(input.title === undefined ? defaultRecordTitle(prepared.value.document) : input.title);
      const description = normalizePublicDescription(input.publicDescription === undefined ? '' : input.publicDescription);
      const visibility = normalizeVisibility(input.visibility === undefined ? 'private' : input.visibility);
      if (!title.ok) return title;
      if (!description.ok) return description;
      if (!visibility.ok) return visibility;
      const { metadata, json } = prepared.value;
      const at = now();
      const row = await db.prepare(`INSERT INTO build
        (id, owner_user_id, visibility, title, public_description, skill_a_id, skill_b_id,
         schema_version, game_data_version, build_json, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) RETURNING ${recordColumns}`)
        .bind(generateBuildId(), actor.userId, visibility.value, title.value, description.value,
          metadata.skillAId, metadata.skillBId, metadata.schemaVersion, metadata.gameDataVersion, json, at, at).first<Row>();
      if (!row) throw new Error('Build insert failed');
      return ok(record(row));
    },
    async update(actor, id, input) {
      const found = await modifiable(actor, id, input.expectedRevision);
      if (!found.ok) return found;
      if (actor.kind !== 'user') return fail('unauthenticated', 'Sign in to change builds.');
      if (['document', 'title', 'publicDescription', 'visibility'].every(key => input[key as keyof typeof input] === undefined)) {
        return fail('invalid_request', 'Nothing to update.');
      }
      const next = found.value;
      const prepared = prepare(input.document === undefined ? next.document : input.document);
      const title = normalizeBuildTitle(input.title === undefined ? next.title : input.title);
      const description = normalizePublicDescription(input.publicDescription === undefined ? next.publicDescription : input.publicDescription);
      const visibility = normalizeVisibility(input.visibility === undefined ? next.visibility : input.visibility);
      if (!prepared.ok) return prepared;
      if (!title.ok) return title;
      if (!description.ok) return description;
      if (!visibility.ok) return visibility;
      const { metadata, json } = prepared.value;
      // One conditional write. The prior SELECT does not authorize a stale/concurrent write.
      const row = await db.prepare(`UPDATE build SET visibility=?, title=?, public_description=?, skill_a_id=?,
        skill_b_id=?, schema_version=?, game_data_version=?, build_json=?, revision=revision+1, updated_at=?
        WHERE id=? AND owner_user_id=? AND revision=? RETURNING ${recordColumns}`)
        .bind(visibility.value, title.value, description.value, metadata.skillAId, metadata.skillBId,
          metadata.schemaVersion, metadata.gameDataVersion, json, Math.max(now(), next.updatedAt),
          id, actor.userId, input.expectedRevision).first<Row>();
      return row ? ok(record(row)) : conflict();
    },
    async delete(actor, id, input) {
      const found = await modifiable(actor, id, input.expectedRevision);
      if (!found.ok) return found;
      if (actor.kind !== 'user') return fail('unauthenticated', 'Sign in to change builds.');
      const row = await db.prepare('DELETE FROM build WHERE id=? AND owner_user_id=? AND revision=? RETURNING id')
        .bind(id, actor.userId, input.expectedRevision).first<{ id: string }>();
      return row ? ok(row) : conflict();
    },
    async copy(actor, id, input = {}) {
      if (actor.kind !== 'user') return fail('unauthenticated', 'Sign in to copy builds.');
      const found = await get(actor, id);
      if (!found.ok) return found;
      const source = found.value;
      const title = normalizeBuildTitle(input.title === undefined ? source.title : input.title);
      if (!title.ok) return title;
      const document = !isOwner(actor, source) && options.foreignCopyDocument
        ? options.foreignCopyDocument(source.document) : source.document;
      const at = now();
      // Recheck source access + revision atomically at insertion. A concurrent privacy change
      // cannot copy content that has already been revoked or use an outdated projection.
      const row = await db.prepare(`INSERT INTO build
        (id, owner_user_id, visibility, title, public_description, skill_a_id, skill_b_id,
         schema_version, game_data_version, build_json, revision, created_at, updated_at)
        SELECT ?, ?, 'private', ?, '', skill_a_id, skill_b_id, schema_version, game_data_version, ?, 1, ?, ?
        FROM build WHERE id=? AND revision=? AND (visibility <> 'private' OR owner_user_id=?)
        RETURNING ${recordColumns}`).bind(generateBuildId(), actor.userId, title.value, JSON.stringify(document),
          at, at, id, source.revision, actor.userId).first<Row>();
      return row ? ok(record(row)) : missing();
    },
    async listOwn(actor, page) {
      return actor.kind === 'user' ? list(actor.userId, false, page) : fail('unauthenticated', 'Sign in to see your builds.');
    },
    listPublicByOwner: (owner, page) => list(owner, true, page),
  };
}

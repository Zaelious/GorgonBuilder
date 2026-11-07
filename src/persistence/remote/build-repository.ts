/**
 * Async, provider-neutral saved-build repository contract (T0018).
 *
 * T0018 ships only this interface and a deterministic in-memory fake for tests
 * (`testing/in-memory-build-repository.ts`). T0019 implements it on D1 behind
 * authenticated `/api/*` routes. Every implementation must satisfy the shared
 * contract tests in `build-repository.contract.ts`.
 *
 * Authorization rules (see access.ts):
 * - The `actor` comes from a server-verified session, never from request fields.
 * - Guests may read Public/Unlisted builds; they cannot create, copy, modify or list "own".
 * - Private builds are indistinguishable from missing ones to non-owners (`not_found`).
 * - Non-owners modifying a readable build get `forbidden`.
 * - Every write requires `expectedRevision`; a stale revision yields `revision_conflict`.
 */
import type { Actor } from './access';
import type { BuildPayloadError, BuildRecord, BuildSummary, BuildVisibility } from './build-record';

export type RepositoryErrorCode =
  | BuildPayloadError['code']
  | 'unauthenticated'
  | 'not_found'
  | 'forbidden'
  | 'revision_conflict'
  | 'invalid_request';

export interface RepositoryError {
  code: RepositoryErrorCode;
  message: string;
  field?: string;
}

export type RepositoryResult<T> = { ok: true; value: T } | { ok: false; error: RepositoryError };

export interface CreateBuildInput {
  /** Untrusted payload; must validate as BuildDocument v1. */
  document: unknown;
  /** Defaults to the document's title (or "Untitled build"). */
  title?: unknown;
  publicDescription?: unknown;
  /** Defaults to `private`. */
  visibility?: unknown;
}

export interface UpdateBuildInput {
  expectedRevision: number;
  document?: unknown;
  title?: unknown;
  publicDescription?: unknown;
  visibility?: unknown;
}

export interface DeleteBuildInput {
  expectedRevision: number;
}

export interface CopyBuildInput {
  /** Defaults to the source title. The source public description is not copied. */
  title?: unknown;
}

export const PAGE_DEFAULT_LIMIT = 20;
export const PAGE_MAX_LIMIT = 50;

export interface PageRequest {
  /** 1–50, default 20. */
  limit?: number;
  /** Opaque keyset cursor from a previous page; never an offset. */
  cursor?: string | null;
}

/** Sorted by `updatedAt` descending, then `id` descending. No total counts are exposed. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface BuildRepository {
  /** Account-only; the new record is owned by the actor and defaults to Private. */
  create(actor: Actor, input: CreateBuildInput): Promise<RepositoryResult<BuildRecord>>;
  /** Public/Unlisted: anyone. Private: owner only, otherwise `not_found`. */
  get(actor: Actor, buildId: string): Promise<RepositoryResult<BuildRecord>>;
  /** Owner-only. Re-derives indexed metadata whenever the document changes. */
  update(actor: Actor, buildId: string, input: UpdateBuildInput): Promise<RepositoryResult<BuildRecord>>;
  /** Owner-only hard delete. */
  delete(actor: Actor, buildId: string, input: DeleteBuildInput): Promise<RepositoryResult<{ id: string }>>;
  /**
   * Account-only independent copy of any build the actor can read: new ID, owner = actor,
   * visibility Private, revision 1. The source is unchanged. This is not A/B comparison.
   */
  copy(actor: Actor, sourceBuildId: string, input?: CopyBuildInput): Promise<RepositoryResult<BuildRecord>>;
  /** Signed-in owner's library across all visibility states. */
  listOwn(actor: Actor, page?: PageRequest): Promise<RepositoryResult<Page<BuildSummary>>>;
  /** Public author profile: that owner's Public builds only, identical for every viewer. */
  listPublicByOwner(ownerUserId: string, page?: PageRequest): Promise<RepositoryResult<Page<BuildSummary>>>;
}

export type { BuildVisibility };

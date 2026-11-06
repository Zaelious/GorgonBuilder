/**
 * T0018 provider-neutral saved-build record contract.
 *
 * A saved build is server-owned listing metadata wrapped around an unchanged
 * BuildDocument v1. Owner, visibility, title and description are record fields,
 * never BuildDocument fields; indexed skill IDs and versions are always derived
 * server-side from the validated document, never accepted from the client.
 */
import type { BuildDocument } from '../../core/build/document';
import { validateBuildDocument } from '../../core/build/validation';

export const BUILD_VISIBILITIES = ['private', 'unlisted', 'public'] as const;
/**
 * - `private` (default): owner-only. A link alone grants nothing.
 * - `unlisted`: anyone holding the link may read; never listed, searched or counted publicly.
 *   Not confidential once the link is shared.
 * - `public`: anyone may read; listed in public search and the author's public profile.
 */
export type BuildVisibility = typeof BUILD_VISIBILITIES[number];
export const DEFAULT_BUILD_VISIBILITY: BuildVisibility = 'private';

export const BUILD_TITLE_MAX_LENGTH = 120;
export const BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH = 2000;
/** UTF-8 bytes of the canonical serialized BuildDocument. Mirrored by the D1 CHECK constraint. */
export const BUILD_JSON_MAX_BYTES = 256 * 1024;

export function isBuildVisibility(value: unknown): value is BuildVisibility {
  return typeof value === 'string' && (BUILD_VISIBILITIES as readonly string[]).includes(value);
}

/** Server-derived columns; the client cannot supply any of these. */
export interface DerivedBuildMetadata {
  skillAId: string | null;
  skillBId: string | null;
  schemaVersion: BuildDocument['schemaVersion'];
  gameDataVersion: string;
}

export interface BuildSummary extends DerivedBuildMetadata {
  /** Immutable, opaque, nonsequential public identifier (see build-id.ts). */
  id: string;
  /** Stable server-generated account ID. Never a username, email or OAuth provider ID. */
  ownerUserId: string;
  visibility: BuildVisibility;
  title: string;
  publicDescription: string;
  /** Optimistic-concurrency counter; starts at 1 and increments on each accepted write. */
  revision: number;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

export interface BuildRecord extends BuildSummary {
  document: BuildDocument;
}

export type BuildPayloadErrorCode =
  | 'invalid_document'
  | 'unsupported_schema_version'
  | 'payload_too_large'
  | 'invalid_metadata';

export interface BuildPayloadError {
  code: BuildPayloadErrorCode;
  message: string;
  field?: 'document' | 'title' | 'publicDescription' | 'visibility' | 'skillSlotA' | 'skillSlotB';
}

export type PayloadResult<T> = { ok: true; value: T } | { ok: false; error: BuildPayloadError };

export interface PreparedBuildDocument {
  document: BuildDocument;
  /** Canonical JSON stored in D1 `build.build_json`. */
  json: string;
  bytes: number;
  metadata: DerivedBuildMetadata;
}

export interface PrepareOptions {
  /**
   * Optional canonical combat-skill check (T0019/T0020-F1 may supply a generated
   * allowlist). Without it, any nonempty official-looking skill ID is accepted.
   */
  isKnownCombatSkillId?: (skillId: string) => boolean;
}

const encoder = new TextEncoder();

/**
 * Validate an untrusted payload as BuildDocument v1, enforce the size cap and derive
 * indexed metadata. Raw CharacterSheet/Storage reports fail BuildDocument validation.
 */
export function prepareBuildDocument(value: unknown, options: PrepareOptions = {}): PayloadResult<PreparedBuildDocument> {
  const validated = validateBuildDocument(value);
  if (!validated.ok) {
    return validated.reason === 'unsupported-version'
      ? fail('unsupported_schema_version', `BuildDocument schema version ${validated.schemaVersion} is not supported.`, 'document')
      : fail('invalid_document', 'The build is not a valid BuildDocument v1.', 'document');
  }
  let json: string;
  try { json = JSON.stringify(validated.value); }
  catch { return fail('invalid_document', 'The build could not be serialized.', 'document'); }
  const bytes = encoder.encode(json).byteLength;
  if (bytes > BUILD_JSON_MAX_BYTES) {
    return fail('payload_too_large', `The build is ${bytes} bytes; the limit is ${BUILD_JSON_MAX_BYTES}.`, 'document');
  }
  // Re-parse so the stored document has no aliasing with caller-owned objects.
  const document = JSON.parse(json) as BuildDocument;
  const skillAId = document.skillSlotA.skillId;
  const skillBId = document.skillSlotB.skillId;
  for (const [field, id] of [['skillSlotA', skillAId], ['skillSlotB', skillBId]] as const) {
    if (id !== null && (!id.trim() || (options.isKnownCombatSkillId && !options.isKnownCombatSkillId(id)))) {
      return fail('invalid_document', `Skill slot ${field === 'skillSlotA' ? 'A' : 'B'} is not a known combat skill.`, field);
    }
  }
  return {
    ok: true,
    value: {
      document, json, bytes,
      metadata: { skillAId, skillBId, schemaVersion: document.schemaVersion, gameDataVersion: document.gameDataVersion },
    },
  };
}

// C0/C1 controls (except tab/newline in descriptions) and bidi overrides are rejected outright.
// eslint-disable-next-line no-control-regex
const TITLE_FORBIDDEN = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/u;
// eslint-disable-next-line no-control-regex
const DESCRIPTION_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/u;

const length = (text: string) => [...text].length;

/** Titles are trimmed plain text, 1–120 characters, rendered as text (never HTML). */
export function normalizeBuildTitle(value: unknown): PayloadResult<string> {
  if (typeof value !== 'string') return fail('invalid_metadata', 'Title must be text.', 'title');
  const title = value.normalize('NFC').trim();
  if (!title) return fail('invalid_metadata', 'Title is required.', 'title');
  if (length(title) > BUILD_TITLE_MAX_LENGTH) {
    return fail('invalid_metadata', `Title must be at most ${BUILD_TITLE_MAX_LENGTH} characters.`, 'title');
  }
  if (TITLE_FORBIDDEN.test(title)) return fail('invalid_metadata', 'Title contains unsupported control characters.', 'title');
  return { ok: true, value: title };
}

/** Public description: optional trimmed plain text up to 2,000 characters; newlines allowed. */
export function normalizePublicDescription(value: unknown): PayloadResult<string> {
  if (typeof value !== 'string') return fail('invalid_metadata', 'Description must be text.', 'publicDescription');
  const description = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (length(description) > BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH) {
    return fail('invalid_metadata',
      `Description must be at most ${BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH} characters.`, 'publicDescription');
  }
  if (DESCRIPTION_FORBIDDEN.test(description)) {
    return fail('invalid_metadata', 'Description contains unsupported control characters.', 'publicDescription');
  }
  return { ok: true, value: description };
}

export function normalizeVisibility(value: unknown): PayloadResult<BuildVisibility> {
  return isBuildVisibility(value)
    ? { ok: true, value }
    : fail('invalid_metadata', 'Visibility must be private, unlisted or public.', 'visibility');
}

/** Listing title used when the caller supplies none: the document's own title, else a fallback. */
export function defaultRecordTitle(document: BuildDocument): string {
  const result = normalizeBuildTitle(document.title);
  return result.ok ? result.value : 'Untitled build';
}

function fail<T>(code: BuildPayloadErrorCode, message: string, field?: BuildPayloadError['field']): PayloadResult<T> {
  return { ok: false, error: { code, message, ...(field ? { field } : {}) } };
}

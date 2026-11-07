/**
 * T0020 browser-local working-build bookkeeping, separate from the unchanged T0007 draft
 * (`gorgonbuilder.current-draft`) and from BuildDocument v1.
 *
 * - The cloud link records which owned My Builds record the local working draft came from
 *   (ID, revision, sharing metadata) plus a hash of the last saved document, so the planner
 *   can show "unsaved changes" truthfully after a reload. It holds no tokens or identities
 *   other than the public username that owns the record.
 * - The replaced-draft backup keeps one unsaved working build that an explicit "open" replaced,
 *   so opening a cloud build never silently erases local work.
 */
import { createDefaultBuildDocument, type BuildDocument } from '../../core/build/document';
import { validateBuildDocument } from '../../core/build/validation';
import type { BuildRecord, Visibility } from '../account/api';

export const CLOUD_LINK_KEY = 'gorgonbuilder.cloud-link';
export const REPLACED_DRAFT_KEY = 'gorgonbuilder.replaced-draft';

export interface CloudLink {
  version: 1;
  buildId: string;
  revision: number;
  visibility: Visibility;
  title: string;
  publicDescription: string;
  /** Public handle of the owner; a different signed-in account never saves over it. */
  ownerUsername: string;
  /** Hash of the document as last saved to (or opened from) the account. */
  savedHash: string;
  savedAt: number;
}

export interface ReplacedDraft { version: 1; replacedAt: number; document: BuildDocument; link: CloudLink | null }

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function browserStorage(): Store | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Key-order independent JSON so equal documents always hash equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/** 53-bit FNV-1a-style digest; change detection only, not security. */
export function documentHash(document: BuildDocument): string {
  const text = stableStringify(document);
  let h1 = 0xdeadbeef ^ text.length, h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const VISIBILITIES: readonly string[] = ['private', 'unlisted', 'public'];
function isLink(value: unknown): value is CloudLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Record<string, unknown>;
  return link.version === 1 && typeof link.buildId === 'string' && /^[A-Za-z0-9_-]{16}$/.test(link.buildId) &&
    Number.isSafeInteger(link.revision) && (link.revision as number) > 0 && VISIBILITIES.includes(link.visibility as string) &&
    typeof link.title === 'string' && typeof link.publicDescription === 'string' && typeof link.ownerUsername === 'string' &&
    typeof link.savedHash === 'string' && typeof link.savedAt === 'number';
}

function read(key: string, store: Store | null): unknown {
  try {
    const text = store?.getItem(key);
    return text ? JSON.parse(text) as unknown : null;
  } catch { return null; }
}
function write(key: string, value: unknown, store: Store | null): boolean {
  try {
    if (!store) return false;
    if (value === null) store.removeItem(key); else store.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function readCloudLink(store: Store | null = browserStorage()): CloudLink | null {
  const value = read(CLOUD_LINK_KEY, store);
  return isLink(value) ? value : null;
}
export function writeCloudLink(link: CloudLink | null, store: Store | null = browserStorage()): boolean {
  return write(CLOUD_LINK_KEY, link, store);
}

export function readReplacedDraft(store: Store | null = browserStorage()): ReplacedDraft | null {
  const value = read(REPLACED_DRAFT_KEY, store) as Partial<ReplacedDraft> | null;
  if (!value || value.version !== 1 || typeof value.replacedAt !== 'number') return null;
  const validated = validateBuildDocument(value.document);
  if (!validated.ok) return null;
  return { version: 1, replacedAt: value.replacedAt, document: validated.value, link: isLink(value.link) ? value.link : null };
}
export function writeReplacedDraft(backup: ReplacedDraft | null, store: Store | null = browserStorage()): boolean {
  return write(REPLACED_DRAFT_KEY, backup, store);
}

/** Link metadata for a record the signed-in owner just saved or opened. */
export function linkFor(record: BuildRecord, ownerUsername: string, savedDocument: BuildDocument, now = Date.now()): CloudLink {
  return {
    version: 1, buildId: record.id, revision: record.revision, visibility: record.visibility, title: record.title,
    publicDescription: record.publicDescription, ownerUsername, savedHash: documentHash(savedDocument), savedAt: now,
  };
}

export function isEmptyBuild(document: BuildDocument): boolean {
  const empty = createDefaultBuildDocument({ gameDataVersion: document.gameDataVersion });
  const comparable = { ...document };
  delete comparable.createdWithAppVersion;
  return documentHash(comparable) === documentHash(empty);
}

export type CloudState = 'local-only' | 'saved' | 'unsaved-changes';
export function cloudState(document: BuildDocument, link: CloudLink | null): CloudState {
  if (!link) return 'local-only';
  return documentHash(document) === link.savedHash ? 'saved' : 'unsaved-changes';
}

/**
 * Would replacing this working build lose anything? An empty draft or an unchanged copy of a
 * saved record loses nothing; everything else must be confirmed and is kept as a backup.
 */
export function hasUnsavedWork(document: BuildDocument, link: CloudLink | null): boolean {
  return link ? cloudState(document, link) === 'unsaved-changes' : !isEmptyBuild(document);
}

/** Record title wins when opening, so the planner heading and My Builds agree. */
export function documentForEditing(record: BuildRecord): BuildDocument {
  return record.document.title === record.title || !record.title.trim() ? record.document : { ...record.document, title: record.title };
}

/**
 * Apply a metadata-only change (visibility, description) made outside a document save. The
 * revision advances only if the server still holds exactly the document this link last saved;
 * otherwise the old revision is kept so the next Save changes reports the conflict instead of
 * silently overwriting edits made elsewhere.
 */
export function syncLinkMetadata(link: CloudLink, record: BuildRecord): CloudLink {
  if (link.buildId !== record.id) return link;
  const unchanged = documentHash(record.document) === link.savedHash;
  return { ...link, visibility: record.visibility, title: record.title, publicDescription: record.publicDescription,
    revision: unchanged ? Math.max(link.revision, record.revision) : link.revision };
}

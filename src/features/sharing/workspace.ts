/**
 * T0020 browser-local working-build bookkeeping, separate from the unchanged T0007 draft
 * (`gorgonbuilder.current-draft`) and from BuildDocument v1.
 *
 * - The cloud link records which owned My Builds record the local working draft came from
 *   (ID, revision, sharing metadata) plus a hash of the last saved document, so the planner
 *   can show "unsaved changes" truthfully after a reload. It holds no tokens or identities
 *   other than the public username that owns the record.
 * - The replaced-draft backups keep up to MAX_REPLACED_DRAFTS unsaved working builds that an
 *   explicit "open"/"load" replaced, so replacing the working build never silently erases local
 *   work. Every replacement fails closed: if a needed backup cannot be stored (unreadable list,
 *   list full, write failure) nothing is replaced.
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

export interface ReplacedDraft { replacedAt: number; document: BuildDocument; link: CloudLink | null }
/** Bounded so backups cannot exhaust browser storage; a full list must be cleared explicitly. */
export const MAX_REPLACED_DRAFTS = 5;

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

export type BackupsRead = { ok: true; entries: ReplacedDraft[] } | { ok: false };

function entryFrom(value: unknown): ReplacedDraft | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<ReplacedDraft>;
  if (typeof entry.replacedAt !== 'number') return null;
  const validated = validateBuildDocument(entry.document);
  if (!validated.ok || (entry.link !== null && entry.link !== undefined && !isLink(entry.link))) return null;
  return { replacedAt: entry.replacedAt, document: validated.value, link: entry.link ?? null };
}

/**
 * All kept backups, oldest first. Anything unreadable (storage error, malformed JSON, an invalid
 * entry) is reported as `ok: false`, so callers never overwrite backups they could not read.
 * The earlier single-entry `version: 1` form is read as a one-entry list.
 */
export function readReplacedDrafts(store: Store | null = browserStorage()): BackupsRead {
  if (!store) return { ok: false };
  let text: string | null;
  try { text = store.getItem(REPLACED_DRAFT_KEY); } catch { return { ok: false }; }
  if (text === null) return { ok: true, entries: [] };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { ok: false }; }
  const stored = value as { version?: unknown; entries?: unknown } | null;
  if (stored?.version === 1) {
    const entry = entryFrom(stored);
    return entry ? { ok: true, entries: [entry] } : { ok: false };
  }
  if (stored?.version !== 2 || !Array.isArray(stored.entries) || stored.entries.length > MAX_REPLACED_DRAFTS) return { ok: false };
  const entries = stored.entries.map(entryFrom);
  return entries.every(entry => entry !== null) ? { ok: true, entries: entries as ReplacedDraft[] } : { ok: false };
}

function writeReplacedDrafts(entries: readonly ReplacedDraft[], store: Store | null): boolean {
  return write(REPLACED_DRAFT_KEY, entries.length ? { version: 2, entries } : null, store);
}

export type StashResult =
  | { ok: true; entries: ReplacedDraft[]; kept: boolean }
  | { ok: false; reason: 'unreadable' | 'full' | 'write-failed'; message: string };

const STASH_MESSAGES = {
  unreadable: 'Nothing was replaced: the backups kept on this device could not be read, and replacing your current build now could lose work. Check that browser storage is available, then reload and try again.',
  full: `Nothing was replaced: ${MAX_REPLACED_DRAFTS} earlier builds are already kept as backups on this device. Restore or discard one in the planner, then try again.`,
  'write-failed': 'Nothing was replaced: this browser could not save a backup of your current build (storage may be full or blocked). Free some browser storage, then try again.',
} as const;

/**
 * Prepare to replace the working build. If it holds unsaved work it is appended to the kept
 * backups (never overwriting earlier ones); `consume` removes the backup being restored. Only
 * when this returns ok may the caller overwrite the working draft.
 */
export function stashWorkingBuild(current: BuildDocument, link: CloudLink | null, options: {
  store?: Store | null; now?: number; consume?: number;
} = {}): StashResult {
  const store = options.store === undefined ? browserStorage() : options.store;
  const needed = hasUnsavedWork(current, link);
  if (!needed && options.consume === undefined) {
    const existing = readReplacedDrafts(store);
    return { ok: true, entries: existing.ok ? existing.entries : [], kept: false };
  }
  const fail = (reason: keyof typeof STASH_MESSAGES): StashResult => ({ ok: false, reason, message: STASH_MESSAGES[reason] });
  const existing = readReplacedDrafts(store);
  if (!existing.ok) return fail('unreadable');
  const entries = existing.entries.filter((_, index) => index !== options.consume);
  if (needed) {
    if (entries.length >= MAX_REPLACED_DRAFTS) return fail('full');
    entries.push({ replacedAt: options.now ?? Date.now(), document: current, link });
  }
  if (!writeReplacedDrafts(entries, store)) return fail('write-failed');
  return { ok: true, entries, kept: needed };
}

/** Explicitly discard one kept backup (the caller confirms with the user first). */
export function discardReplacedDraft(index: number, store: Store | null = browserStorage()): BackupsRead {
  const existing = readReplacedDrafts(store);
  if (!existing.ok || !existing.entries[index]) return existing;
  const entries = existing.entries.filter((_, position) => position !== index);
  return writeReplacedDrafts(entries, store) ? { ok: true, entries } : { ok: false };
}

/** Raw snapshot/restore so a caller can undo a stash if its own draft write then fails. */
export function snapshotReplacedDrafts(store: Store | null = browserStorage()): { restore: () => void } {
  let text: string | null = null;
  try { text = store?.getItem(REPLACED_DRAFT_KEY) ?? null; } catch { /* unreadable: nothing to restore */ }
  return { restore: () => {
    try { if (text === null) store?.removeItem(REPLACED_DRAFT_KEY); else store?.setItem(REPLACED_DRAFT_KEY, text); } catch { /* best effort */ }
  } };
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

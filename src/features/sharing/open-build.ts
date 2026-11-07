/**
 * Open an owned My Builds record as the planner's working build, from a page where the planner
 * is not mounted (its autosave has already flushed on unmount). Never silently replaces
 * unsaved work: the user confirms, and the replaced build is kept as a restorable backup.
 */
import { createLocalPersistence } from '../../persistence/local/storage';
import type { BuildRecord } from '../account/api';
import { cloudState, documentForEditing, hasUnsavedWork, linkFor, readCloudLink, snapshotReplacedDrafts, stashWorkingBuild, writeCloudLink } from './workspace';

export type OpenResult =
  | { status: 'opened' }
  | { status: 'continued' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export function openRecordInPlanner(record: BuildRecord, ownerUsername: string, gameDataVersion: string, options: {
  confirm?: (message: string) => boolean; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; now?: number;
} = {}): OpenResult {
  const confirm = options.confirm ?? (message => window.confirm(message));
  const store = options.storage;
  const local = createLocalPersistence({ gameDataVersion, ...(store ? { storage: store } : {}) });
  const restored = local.restoreDraft();
  if (restored.status === 'fallback' && restored.error.reason !== 'invalid-data' && restored.error.reason !== 'invalid-json') {
    return { status: 'failed', message: 'The planner\'s local draft could not be read or is from a newer app version, so it was not replaced. Open the planner for recovery steps.' };
  }
  if (restored.status === 'fallback') {
    // Damaged bytes cannot be kept as a restorable build; replacing them needs explicit consent.
    const ok = confirm(`The planner's local draft is damaged and cannot be read as a build. Opening “${record.title}” will permanently replace it.\n\nContinue?`);
    if (!ok) return { status: 'cancelled' };
  }
  const current = restored.value;
  const link = readCloudLink(store);
  if (link?.buildId === record.id && cloudState(current, link) === 'unsaved-changes') return { status: 'continued' };
  if (hasUnsavedWork(current, link)) {
    const ok = confirm(`Replace the build in the planner (“${current.title}”) with “${record.title}”?\n\nThe current build has changes that are not saved to My Builds. It will be kept as a backup you can restore from the planner.`);
    if (!ok) return { status: 'cancelled' };
  }
  const before = snapshotReplacedDrafts(store);
  const stash = stashWorkingBuild(current, link, { ...(store ? { store } : {}), ...(options.now === undefined ? {} : { now: options.now }) });
  if (!stash.ok) return { status: 'failed', message: stash.message };
  const document = documentForEditing(record);
  const saved = local.saveDraft(document);
  if (!saved.ok) {
    before.restore();
    return { status: 'failed', message: 'This browser could not store the build for editing (storage may be full or blocked). Nothing was changed.' };
  }
  // A stale link must never point at a different record than the new draft.
  if (!writeCloudLink(linkFor(record, ownerUsername, document, options.now), store)) writeCloudLink(null, store);
  return { status: 'opened' };
}

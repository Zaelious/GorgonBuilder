/**
 * Open an owned My Builds record as the planner's working build, from a page where the planner
 * is not mounted (its autosave has already flushed on unmount). Never silently replaces
 * unsaved work: the user confirms, and the replaced build is kept as a restorable backup.
 */
import { createLocalPersistence } from '../../persistence/local/storage';
import type { BuildRecord } from '../account/api';
import { cloudState, documentForEditing, hasUnsavedWork, linkFor, readCloudLink } from './workspace';
import { replaceWorkingDraft } from './replace-working';

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
  const document = documentForEditing(record);
  const result = replaceWorkingDraft({
    current, currentLink: link, next: document, nextLink: linkFor(record, ownerUsername, document, options.now),
    saveDraft: value => local.saveDraft(value).ok,
    ...(store ? { store } : {}), ...(options.now === undefined ? {} : { now: options.now }),
  });
  return result.ok ? { status: 'opened' } : { status: 'failed', message: result.message };
}

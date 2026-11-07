/**
 * Open an owned My Builds record as the planner's working build, from a page where the planner
 * is not mounted (its autosave has already flushed on unmount). Never silently replaces
 * unsaved work: the user confirms, and the replaced build is kept as a restorable backup.
 */
import { createLocalPersistence } from '../../persistence/local/storage';
import type { BuildRecord } from '../account/api';
import { cloudState, documentForEditing, hasUnsavedWork, linkFor, readCloudLink, writeCloudLink, writeReplacedDraft } from './workspace';

export type OpenResult =
  | { status: 'opened' }
  | { status: 'continued' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export function openRecordInPlanner(record: BuildRecord, ownerUsername: string, gameDataVersion: string, options: {
  confirm?: (message: string) => boolean; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; now?: number;
} = {}): OpenResult {
  const confirm = options.confirm ?? (message => window.confirm(message));
  const local = createLocalPersistence({ gameDataVersion, ...(options.storage ? { storage: options.storage } : {}) });
  const restored = local.restoreDraft();
  if (restored.status === 'fallback' && (restored.error.reason === 'unsupported-version' || restored.error.reason === 'read-failed')) {
    return { status: 'failed', message: 'The planner\'s local draft is protected (unreadable or from a newer app version), so it was not replaced. Open the planner for recovery steps.' };
  }
  const current = restored.value;
  const link = readCloudLink(options.storage);
  if (link?.buildId === record.id && cloudState(current, link) === 'unsaved-changes') return { status: 'continued' };
  if (hasUnsavedWork(current, link)) {
    const ok = confirm(`Replace the build in the planner (“${current.title}”) with “${record.title}”?\n\nThe current build has changes that are not saved to My Builds. It will be kept as a backup you can restore from the planner.`);
    if (!ok) return { status: 'cancelled' };
    writeReplacedDraft({ version: 1, replacedAt: options.now ?? Date.now(), document: current, link }, options.storage);
  }
  const document = documentForEditing(record);
  const saved = local.saveDraft(document);
  if (!saved.ok) return { status: 'failed', message: 'This browser could not store the build for editing (storage may be full or blocked). Nothing was changed.' };
  writeCloudLink(linkFor(record, ownerUsername, document, options.now), options.storage);
  return { status: 'opened' };
}

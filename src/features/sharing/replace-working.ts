/**
 * The one transaction that switches the planner's persisted working build (T0020 review fix).
 * Used by "Open in planner" (planner unmounted) and by the planner itself (Restore a kept
 * backup, conflict "Load the saved version").
 *
 * Order, chosen so that no failure point can lose work or pair a draft with the wrong
 * My Builds record (all steps run synchronously in one task):
 *   1. Stash the current build if it has unsaved work (a restored backup is NOT removed yet).
 *   2. Write the incoming draft. On failure nothing else has changed: undo the stash.
 *   3. Write (or clear) the incoming draft's cloud link. On failure restore the previous draft,
 *      so the previous draft and its untouched link are exactly as before; undo the stash.
 *   4. Commit: remove the restored backup.
 * If even restoring the previous draft fails, the stale link is removed so the stored draft
 * can only ever be saved as a new build, and the stash is kept (the previous build stays in
 * the backups or in My Builds). The caller is told this was a partial failure.
 */
import type { BuildDocument } from '../../core/build/document';
import { snapshotReplacedDrafts, stashWorkingBuild, writeCloudLink, type CloudLink, type ReplacedDraft } from './workspace';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ReplaceResult =
  | { ok: true; backups: ReplacedDraft[] }
  | { ok: false; message: string; partial: boolean };

export const REPLACE_MESSAGES = {
  draft: 'Nothing was replaced: this browser could not store the build you chose (storage may be full or blocked). Your current build, its My Builds link and your kept backups are unchanged. Free some browser storage, then try again.',
  link: 'Nothing was replaced: this browser could not update which My Builds record the planner is linked to (storage may be full or blocked). Your current build and kept backups are unchanged. Free some browser storage, then try again.',
  partial: 'Browser storage failed partway through switching builds and could not be fully undone. Nothing is lost: your previous build is kept as a backup or in My Builds, and the stored build is no longer linked to any My Builds record (saving it creates a new build). Free some browser storage and reload the planner.',
} as const;

export function replaceWorkingDraft(input: {
  current: BuildDocument;
  currentLink: CloudLink | null;
  next: BuildDocument;
  nextLink: CloudLink | null;
  /** Persist a working draft; true only if it was durably stored. */
  saveDraft: (document: BuildDocument) => boolean;
  /** Index of the kept backup being restored; removed only after success. */
  consume?: number;
  store?: Store;
  now?: number;
}): ReplaceResult {
  const { current, currentLink, next, nextLink, saveDraft, store } = input;
  const before = snapshotReplacedDrafts(store);
  const stash = stashWorkingBuild(current, currentLink, {
    ...(store ? { store } : {}), ...(input.now === undefined ? {} : { now: input.now }), ...(input.consume === undefined ? {} : { consume: input.consume }),
  });
  if (!stash.ok) return { ok: false, message: stash.message, partial: false };
  const undo = (message: string): ReplaceResult => { before.restore(); return { ok: false, message, partial: false }; };

  // 2. Incoming draft; the stored link still describes the stored (previous) draft on failure.
  if (!saveDraft(next)) return undo(REPLACE_MESSAGES.draft);
  // 3. Incoming link (or none).
  if (!writeCloudLink(nextLink, store)) {
    if (saveDraft(current)) return undo(REPLACE_MESSAGES.link);
    // The previous draft could not be restored: never leave the old record's link beside the
    // incoming draft. Keep the stash; it may hold the only stored copy of the previous build.
    writeCloudLink(null, store);
    return { ok: false, message: REPLACE_MESSAGES.partial, partial: true };
  }
  // 4. Commit.
  return { ok: true, backups: stash.commit() };
}

/**
 * Persist the planner's cloud link after a server save. If it cannot be written the stale
 * link is removed (the build then reloads as unlinked, never linked to the wrong record).
 * Returns false when storage still holds something other than `link`.
 */
export function persistCloudLink(link: CloudLink | null, store?: Store): boolean {
  if (writeCloudLink(link, store)) return true;
  writeCloudLink(null, store);
  return false;
}

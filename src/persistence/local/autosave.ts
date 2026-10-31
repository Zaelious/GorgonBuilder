import type { BuildDocument } from '../../core/build/document';
import { deserializeBuildDocument, serializeBuildDocument } from '../../core/build/validation';
import type { LocalPersistence, SaveResult } from './storage';

export interface AutosaveOptions {
  delayMs?: number;
  onResult?: (result: SaveResult) => void;
}

/** Connect schedule to committed editor changes; flush on an appropriate
 * lifecycle event and cancel on cleanup. No React or browser event subscription.
 */
export function createDraftAutosave(persistence: Pick<LocalPersistence, 'saveDraft'>, options: AutosaveOptions = {}) {
  const delay = options.delayMs ?? 500;
  if (!Number.isFinite(delay) || delay < 0 || delay > 2_147_483_647) {
    throw new RangeError('Autosave delay must be a supported nonnegative timeout.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: BuildDocument | undefined;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function flush(): SaveResult | null {
    clearTimer();
    if (!pending) return null;
    const result = persistence.saveDraft(pending);
    // Keep a failed save available for explicit retry, without a retry loop.
    if (result.ok) pending = undefined;
    options.onResult?.(result);
    return result;
  }
  function schedule(build: BuildDocument): SaveResult {
    const serialized = serializeBuildDocument(build);
    if (!serialized.ok) {
      // Do not let an older pending snapshot overwrite a newer invalid edit.
      cancel();
      options.onResult?.(serialized);
      return serialized;
    }
    const snapshot = deserializeBuildDocument(serialized.value);
    if (!snapshot.ok) return snapshot;
    pending = snapshot.value;
    clearTimer();
    timer = setTimeout(flush, delay);
    return { ok: true };
  }
  function cancel() {
    clearTimer();
    pending = undefined;
  }

  return { schedule, flush, cancel };
}

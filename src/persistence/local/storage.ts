import { createDefaultBuildDocument } from '../../core/build/document';
import type { BuildDefaults, BuildDocument } from '../../core/build/document';
import { deserializeBuildDocument, serializeBuildDocument } from '../../core/build/validation';
import type { DataFailure, DataResult } from '../../core/build/validation';
import { createDefaultPreferences, deserializePreferences, validatePreferences } from './preferences';
import type { Preferences } from './preferences';

/** Deliberately separate from any future ownership/credential store. Versions
 * live in payloads so incompatible data remains discoverable, not abandoned.
 */
export const DRAFT_STORAGE_KEY = 'gorgonbuilder.current-draft';
export const PREFERENCES_STORAGE_KEY = 'gorgonbuilder.preferences';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type StorageFailure = { ok: false; reason: 'unavailable' | 'read-failed' | 'write-failed' };
export type SaveResult = { ok: true } | DataFailure | StorageFailure;
export type RestoreResult<T> =
  | { status: 'restored'; value: T }
  | { status: 'missing'; value: T }
  | { status: 'fallback'; value: T; error: DataFailure | StorageFailure };

export interface LocalPersistenceOptions extends BuildDefaults {
  /** Omit to resolve browser localStorage lazily. null explicitly disables it. */
  storage?: StorageLike | null;
}

export function createLocalPersistence(options: LocalPersistenceOptions) {
  // Copy defaults so later changes to the caller's options cannot alter recovery.
  const defaults: BuildDefaults = {
    gameDataVersion: options.gameDataVersion,
    createdWithAppVersion: options.createdWithAppVersion,
  };
  createDefaultBuildDocument(defaults);
  const injectedStorage = options.storage;

  function getStorage(): StorageLike | null {
    return injectedStorage === undefined
      ? (typeof window === 'undefined' ? null : window.localStorage) : injectedStorage;
  }
  function read(key: string): DataResult<string | null> | StorageFailure {
    try {
      const storage = getStorage();
      return storage ? { ok: true, value: storage.getItem(key) } : { ok: false, reason: 'unavailable' };
    } catch { return { ok: false, reason: 'read-failed' }; }
  }
  function restore<T>(key: string, decode: (text: string) => DataResult<T>, fallback: () => T): RestoreResult<T> {
    const stored = read(key);
    if (!stored.ok) return { status: 'fallback', value: fallback(), error: stored };
    if (stored.value === null) return { status: 'missing', value: fallback() };
    const decoded = decode(stored.value);
    return decoded.ok ? { status: 'restored', value: decoded.value }
      : { status: 'fallback', value: fallback(), error: decoded };
  }
  function write<T>(key: string, json: string, decode: (text: string) => DataResult<T>): SaveResult {
    // Never overwrite an unsupported draft/preferences payload, even if an
    // editor schedules its fallback document for autosave after restoration.
    const current = read(key);
    if (!current.ok) return current;
    if (current.value !== null) {
      const decoded = decode(current.value);
      if (!decoded.ok && decoded.reason === 'unsupported-version') return decoded;
    }
    try {
      const storage = getStorage();
      if (!storage) return { ok: false, reason: 'unavailable' };
      storage.setItem(key, json);
      return { ok: true };
    } catch { return { ok: false, reason: 'write-failed' }; }
  }

  const restoreDraft = () => restore(DRAFT_STORAGE_KEY, deserializeBuildDocument, () => createDefaultBuildDocument(defaults));
  const restorePreferences = () => restore(PREFERENCES_STORAGE_KEY, deserializePreferences, createDefaultPreferences);

  function saveDraft(build: BuildDocument): SaveResult {
    const serialized = serializeBuildDocument(build);
    return serialized.ok ? write(DRAFT_STORAGE_KEY, serialized.value, deserializeBuildDocument) : serialized;
  }
  function updatePreferences(patch: Partial<Omit<Preferences, 'schemaVersion'>>): SaveResult {
    const current = restorePreferences();
    if (current.status === 'fallback' &&
      current.error.reason !== 'invalid-data' && current.error.reason !== 'invalid-json') return current.error;
    const result = validatePreferences({ ...current.value, ...patch });
    if (!result.ok) return result;
    return write(PREFERENCES_STORAGE_KEY, JSON.stringify(result.value), deserializePreferences);
  }

  return { saveDraft, restoreDraft, updatePreferences, restorePreferences };
}

export type LocalPersistence = ReturnType<typeof createLocalPersistence>;

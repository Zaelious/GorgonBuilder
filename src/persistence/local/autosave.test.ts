import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultBuildDocument } from '../../core/build/document';
import { createDraftAutosave } from './autosave';
import { createLocalPersistence, DRAFT_STORAGE_KEY } from './storage';
import type { SaveResult } from './storage';

const defaults = { gameDataVersion: '490' };
afterEach(() => vi.useRealTimers());

describe('draft autosave', () => {
  it('debounces committed changes and saves an immutable snapshot of the newest build', () => {
    vi.useFakeTimers();
    const onResult = vi.fn();
    const saveDraft = vi.fn((): SaveResult => ({ ok: true }));
    const autosave = createDraftAutosave({ saveDraft }, { delayMs: 100, onResult });
    const build = createDefaultBuildDocument(defaults);
    expect(autosave.schedule(build)).toEqual({ ok: true });
    vi.advanceTimersByTime(75);
    build.title = 'Newest committed edit';
    autosave.schedule(build);
    build.title = 'Not scheduled';
    vi.advanceTimersByTime(99);
    expect(saveDraft).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(saveDraft).toHaveBeenCalledExactlyOnceWith({ ...build, title: 'Newest committed edit' });
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ ok: true });
    expect(autosave.flush()).toBeNull();
  });

  it('flushes before the timeout and cancels pending work on cleanup', () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn((): SaveResult => ({ ok: true }));
    const autosave = createDraftAutosave({ saveDraft });
    const build = createDefaultBuildDocument(defaults);
    autosave.schedule(build);
    expect(autosave.flush()).toEqual({ ok: true });
    vi.runAllTimers();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    autosave.schedule(build);
    autosave.cancel();
    vi.runAllTimers();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(autosave.flush()).toBeNull();
  });

  it('reports failed writes, retains the latest snapshot for retry, and never spins', () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn((): SaveResult => ({ ok: false, reason: 'write-failed' }));
    const onResult = vi.fn();
    const autosave = createDraftAutosave({ saveDraft }, { onResult });
    autosave.schedule(createDefaultBuildDocument(defaults));
    vi.runAllTimers();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({ ok: false, reason: 'write-failed' });
    saveDraft.mockReturnValue({ ok: true });
    expect(autosave.flush()).toEqual({ ok: true });
    expect(autosave.flush()).toBeNull();
  });

  it('rejects invalid schedules and cancels an older pending save', () => {
    vi.useFakeTimers();
    const saveDraft = vi.fn((): SaveResult => ({ ok: true }));
    const onResult = vi.fn();
    const autosave = createDraftAutosave({ saveDraft }, { onResult });
    const build = createDefaultBuildDocument(defaults);
    autosave.schedule(build);
    build.target.count = 0;
    expect(autosave.schedule(build)).toEqual({ ok: false, reason: 'invalid-data' });
    vi.runAllTimers();
    expect(saveDraft).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith({ ok: false, reason: 'invalid-data' });
  });

  it('restores an autosaved draft through a reconstructed persistence service', () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const build = createDefaultBuildDocument(defaults);
    build.title = 'Autosaved';
    const autosave = createDraftAutosave(createLocalPersistence({ ...defaults, storage }));
    autosave.schedule(build);
    vi.advanceTimersByTime(500);
    expect(createLocalPersistence({ ...defaults, storage }).restoreDraft()).toEqual({ status: 'restored', value: build });
    const future = JSON.stringify({ schemaVersion: 2, future: 'keep' });
    values.set(DRAFT_STORAGE_KEY, future);
    autosave.schedule(build);
    expect(autosave.flush()).toEqual({ ok: false, reason: 'unsupported-version', schemaVersion: 2 });
    expect(values.get(DRAFT_STORAGE_KEY)).toBe(future);
    autosave.cancel();
  });

  it.each([-1, NaN, Infinity, 2_147_483_648])('rejects an invalid delay (%s)', delayMs => {
    expect(() => createDraftAutosave({ saveDraft: () => ({ ok: true }) }, { delayMs })).toThrow(RangeError);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultBuildDocument } from '../../core/build/document';
import {
  createLocalPersistence, DRAFT_STORAGE_KEY, PREFERENCES_STORAGE_KEY,
} from './storage';
import type { StorageLike } from './storage';
import { createDefaultPreferences } from './preferences';

const defaults = { gameDataVersion: '490' };

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  return { storage, values };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('local drafts and preferences', () => {
  it('saves and restores independent current-draft and preference keys after reconstruction', () => {
    const { storage, values } = memoryStorage();
    const persistence = createLocalPersistence({ ...defaults, storage });
    const build = createDefaultBuildDocument(defaults);
    build.title = 'Saved draft';
    build.skillSlotA = { skillId: 'Cow', level: 90 };
    build.skillSlotB = { skillId: 'Cow', level: 70 };
    build.abilityBarA = [{ abilityId: 'ability_1001', rank: null }];
    build.abilityBarB = [{ abilityId: 'ability_1001', rank: 1 }];
    expect(persistence.saveDraft(build)).toEqual({ ok: true });
    expect(persistence.updatePreferences({ minimumEquipmentLevel: 95 })).toEqual({ ok: true });
    expect([...values.keys()]).toEqual([DRAFT_STORAGE_KEY, PREFERENCES_STORAGE_KEY]);
    const reloaded = createLocalPersistence({ ...defaults, storage });
    expect(reloaded.restoreDraft()).toEqual({ status: 'restored', value: build });
    expect(reloaded.restorePreferences()).toEqual({ status: 'restored', value: { schemaVersion: 1, minimumEquipmentLevel: 95 } });
    build.title = 'Not saved';
    expect(reloaded.restoreDraft().value.title).toBe('Saved draft');
  });

  it('uses browser localStorage by default and survives a new persistence instance', () => {
    const build = createDefaultBuildDocument(defaults);
    build.notes = 'Browser storage integration';
    expect(createLocalPersistence(defaults).saveDraft(build)).toEqual({ ok: true });
    expect(createLocalPersistence(defaults).restoreDraft()).toEqual({ status: 'restored', value: build });
  });

  it('preserves a different game-data snapshot instead of silently relabeling it', () => {
    const { storage } = memoryStorage();
    const build = createDefaultBuildDocument({ gameDataVersion: 'older-snapshot' });
    const persistence = createLocalPersistence({ ...defaults, storage });
    persistence.saveDraft(build);
    expect(persistence.restoreDraft()).toEqual({ status: 'restored', value: build });
  });

  it('returns fresh defaults for absent keys without writing anything', () => {
    const { storage, values } = memoryStorage();
    const persistence = createLocalPersistence({ ...defaults, storage });
    expect(persistence.restoreDraft()).toEqual({ status: 'missing', value: createDefaultBuildDocument(defaults) });
    expect(persistence.restorePreferences()).toEqual({ status: 'missing', value: createDefaultPreferences() });
    persistence.restoreDraft().value.target.count = 5;
    persistence.restorePreferences().value.minimumEquipmentLevel = 1;
    expect(persistence.restoreDraft().value.target.count).toBe(1);
    expect(persistence.restorePreferences().value.minimumEquipmentLevel).toBe(90);
    expect(values.size).toBe(0);
  });

  it('updates preferences from defaults, preserves an empty patch, and allows disabling the planned filter', () => {
    const { storage } = memoryStorage();
    const persistence = createLocalPersistence({ ...defaults, storage });
    expect(persistence.updatePreferences({ minimumEquipmentLevel: 100 })).toEqual({ ok: true });
    expect(persistence.updatePreferences({})).toEqual({ ok: true });
    expect(persistence.restorePreferences().value.minimumEquipmentLevel).toBe(100);
    expect(persistence.updatePreferences({ minimumEquipmentLevel: null })).toEqual({ ok: true });
    expect(persistence.restorePreferences().value.minimumEquipmentLevel).toBeNull();
  });

  it.each([-1, 1.5, NaN, Infinity])('rejects invalid preference updates (%s) without overwriting', minimumEquipmentLevel => {
    const { storage, values } = memoryStorage();
    const persistence = createLocalPersistence({ ...defaults, storage });
    persistence.updatePreferences({ minimumEquipmentLevel: 95 });
    const original = values.get(PREFERENCES_STORAGE_KEY);
    expect(persistence.updatePreferences({ minimumEquipmentLevel })).toEqual({ ok: false, reason: 'invalid-data' });
    expect(values.get(PREFERENCES_STORAGE_KEY)).toBe(original);
  });

  it.each([
    ['', 'invalid-json'], ['{broken', 'invalid-json'], ['null', 'invalid-data'], ['[]', 'invalid-data'],
    ['{"schemaVersion":1}', 'invalid-data'],
  ] as const)('recovers malformed stored data %j with %s, retaining the original', (json, reason) => {
    const { storage, values } = memoryStorage();
    values.set(DRAFT_STORAGE_KEY, json);
    values.set(PREFERENCES_STORAGE_KEY, json);
    const persistence = createLocalPersistence({ ...defaults, storage });
    expect(persistence.restoreDraft()).toEqual({
      status: 'fallback', value: createDefaultBuildDocument(defaults), error: { ok: false, reason },
    });
    expect(persistence.restorePreferences()).toEqual({
      status: 'fallback', value: createDefaultPreferences(), error: { ok: false, reason },
    });
    expect(values.get(DRAFT_STORAGE_KEY)).toBe(json);
    expect(values.get(PREFERENCES_STORAGE_KEY)).toBe(json);
    expect(persistence.saveDraft(createDefaultBuildDocument(defaults))).toEqual({ ok: true });
    expect(persistence.updatePreferences({ minimumEquipmentLevel: 100 })).toEqual({ ok: true });
    expect(persistence.restoreDraft().status).toBe('restored');
    expect(persistence.restorePreferences().value.minimumEquipmentLevel).toBe(100);
  });

  it.each([0, 2, 999])('keeps incompatible schema %s intact on restore and subsequent writes', schemaVersion => {
    const { storage, values } = memoryStorage();
    const json = JSON.stringify({ schemaVersion, future: 'preserve me' });
    values.set(DRAFT_STORAGE_KEY, json);
    values.set(PREFERENCES_STORAGE_KEY, json);
    const persistence = createLocalPersistence({ ...defaults, storage });
    const error = { ok: false, reason: 'unsupported-version', schemaVersion };
    expect(persistence.restoreDraft()).toEqual({ status: 'fallback', value: createDefaultBuildDocument(defaults), error });
    expect(persistence.restorePreferences()).toEqual({ status: 'fallback', value: createDefaultPreferences(), error });
    expect(persistence.saveDraft(createDefaultBuildDocument(defaults))).toEqual(error);
    expect(persistence.updatePreferences({ minimumEquipmentLevel: 99 })).toEqual(error);
    expect(values.get(DRAFT_STORAGE_KEY)).toBe(json);
    expect(values.get(PREFERENCES_STORAGE_KEY)).toBe(json);
  });

  it('rejects malformed draft writes without replacing a good draft', () => {
    const { storage, values } = memoryStorage();
    const persistence = createLocalPersistence({ ...defaults, storage });
    const build = createDefaultBuildDocument(defaults);
    persistence.saveDraft(build);
    const original = values.get(DRAFT_STORAGE_KEY);
    build.target.count = -1;
    expect(persistence.saveDraft(build)).toEqual({ ok: false, reason: 'invalid-data' });
    expect(values.get(DRAFT_STORAGE_KEY)).toBe(original);
  });
});

describe('storage availability and failures', () => {
  it.each(['disabled', 'server'] as const)('handles %s storage without throwing', mode => {
    if (mode === 'server') vi.stubGlobal('window', undefined);
    const persistence = createLocalPersistence({ ...defaults, ...(mode === 'disabled' ? { storage: null } : {}) });
    expect(persistence.restoreDraft()).toMatchObject({ status: 'fallback', error: { reason: 'unavailable' } });
    expect(persistence.restorePreferences()).toMatchObject({ status: 'fallback', error: { reason: 'unavailable' } });
    expect(persistence.saveDraft(createDefaultBuildDocument(defaults))).toEqual({ ok: false, reason: 'unavailable' });
    expect(persistence.updatePreferences({})).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('catches a browser security exception from the localStorage getter', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    const persistence = createLocalPersistence(defaults);
    expect(persistence.restoreDraft()).toMatchObject({ status: 'fallback', error: { reason: 'read-failed' } });
    expect(persistence.saveDraft(createDefaultBuildDocument(defaults))).toEqual({ ok: false, reason: 'read-failed' });
  });

  it('catches storage read failures and refuses blind writes', () => {
    const setItem = vi.fn();
    const persistence = createLocalPersistence({ ...defaults, storage: {
      getItem: () => { throw new Error('read denied'); }, setItem,
    } });
    expect(persistence.restoreDraft()).toMatchObject({ status: 'fallback', error: { reason: 'read-failed' } });
    expect(persistence.restorePreferences()).toMatchObject({ status: 'fallback', error: { reason: 'read-failed' } });
    expect(persistence.saveDraft(createDefaultBuildDocument(defaults))).toEqual({ ok: false, reason: 'read-failed' });
    expect(persistence.updatePreferences({})).toEqual({ ok: false, reason: 'read-failed' });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('catches quota/write failures without changing existing data', () => {
    const { storage, values } = memoryStorage();
    const persistence = createLocalPersistence({ ...defaults, storage });
    const original = createDefaultBuildDocument(defaults);
    persistence.saveDraft(original);
    persistence.updatePreferences({ minimumEquipmentLevel: 95 });
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(persistence.saveDraft({ ...original, title: 'New' })).toEqual({ ok: false, reason: 'write-failed' });
    expect(persistence.updatePreferences({ minimumEquipmentLevel: 1 })).toEqual({ ok: false, reason: 'write-failed' });
    expect(persistence.restoreDraft().value).toEqual(original);
    expect(persistence.restorePreferences().value.minimumEquipmentLevel).toBe(95);
    expect(values.size).toBe(2);
  });
});

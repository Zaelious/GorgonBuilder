// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDefaultBuildDocument, type BuildDocument } from '../../core/build/document';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import type { BuildRecord } from '../account/api';
import { openRecordInPlanner } from './open-build';
import {
  CLOUD_LINK_KEY, cloudState, documentHash, hasUnsavedWork, isEmptyBuild, linkFor, readCloudLink, readReplacedDraft,
  REPLACED_DRAFT_KEY, stableStringify, syncLinkMetadata, writeCloudLink,
} from './workspace';

const version = 'v490';
const empty = () => createDefaultBuildDocument({ gameDataVersion: version });
const built = (title = 'Cow/Unarmed'): BuildDocument => ({ ...empty(), title, skillSlotA: { skillId: 'Cow', level: 90 }, skillSlotB: { skillId: 'Unarmed', level: 80 } });
function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
}
const record = (document: BuildDocument, overrides: Partial<BuildRecord> = {}): BuildRecord => ({
  id: 'abcdefghijklmnop', visibility: 'private', title: document.title, publicDescription: '', skillAId: document.skillSlotA.skillId,
  skillBId: document.skillSlotB.skillId, schemaVersion: 1, gameDataVersion: version, revision: 1, createdAt: 1, updatedAt: 1,
  author: { username: 'CowFan' }, document, ...overrides,
});

describe('change detection', () => {
  it('hashes equal documents equally regardless of key order and undefined fields', () => {
    const a = built();
    const b = JSON.parse(stableStringify(a)) as BuildDocument;
    const reordered = Object.fromEntries(Object.entries(b).reverse()) as unknown as BuildDocument;
    expect(documentHash(reordered)).toBe(documentHash(a));
    expect(documentHash({ ...a, characterImport: undefined })).toBe(documentHash(a));
    expect(documentHash({ ...a, skillSlotA: { skillId: 'Cow', level: 91 } })).not.toBe(documentHash(a));
  });
  it('distinguishes local-only, saved and unsaved-changes work', () => {
    const doc = built();
    const link = linkFor(record(doc), 'CowFan', doc);
    expect(cloudState(doc, null)).toBe('local-only');
    expect(cloudState(doc, link)).toBe('saved');
    expect(cloudState({ ...doc, title: 'Tank' }, link)).toBe('unsaved-changes');
    expect(isEmptyBuild(empty())).toBe(true);
    expect(isEmptyBuild({ ...empty(), createdWithAppVersion: '0.1.0' })).toBe(true);
    expect(hasUnsavedWork(empty(), null)).toBe(false);
    expect(hasUnsavedWork(doc, null)).toBe(true);
    expect(hasUnsavedWork(doc, link)).toBe(false);
  });
});

describe('storage', () => {
  it('round-trips the link and rejects malformed or tampered links', () => {
    const store = memory();
    const link = linkFor(record(built()), 'CowFan', built(), 5);
    expect(writeCloudLink(link, store)).toBe(true);
    expect(readCloudLink(store)).toEqual(link);
    for (const bad of ['{', JSON.stringify({ ...link, buildId: '../evil' }), JSON.stringify({ ...link, revision: 0 }), JSON.stringify({ ...link, visibility: 'everyone' })]) {
      expect(readCloudLink(memory({ [CLOUD_LINK_KEY]: bad }))).toBeNull();
    }
    writeCloudLink(null, store);
    expect(store.map.has(CLOUD_LINK_KEY)).toBe(false);
    expect(JSON.stringify(link)).not.toMatch(/token|cookie|email|userId/i);
  });
  it('advances the revision for metadata-only changes but keeps it when the server document changed elsewhere', () => {
    const doc = built();
    const link = linkFor(record(doc), 'CowFan', doc);
    expect(syncLinkMetadata(link, record(doc, { revision: 2, visibility: 'public' }))).toMatchObject({ revision: 2, visibility: 'public', savedHash: link.savedHash });
    expect(syncLinkMetadata(link, record({ ...doc, title: 'Edited elsewhere' }, { revision: 3, visibility: 'unlisted' }))).toMatchObject({ revision: 1, visibility: 'unlisted' });
  });
});

describe('opening a My Builds record into the planner', () => {
  const draft = (document: BuildDocument) => JSON.stringify(document);
  it('opens directly over an empty draft and links it', () => {
    const store = memory();
    expect(openRecordInPlanner(record(built()), 'CowFan', version, { storage: store, confirm: () => { throw new Error('no prompt expected'); } })).toEqual({ status: 'opened' });
    expect(JSON.parse(store.map.get(DRAFT_STORAGE_KEY)!)).toEqual(built());
    expect(readCloudLink(store)).toMatchObject({ buildId: 'abcdefghijklmnop', revision: 1, ownerUsername: 'CowFan' });
    expect(store.map.has(REPLACED_DRAFT_KEY)).toBe(false);
  });
  it('asks before replacing unsaved local work, keeps a backup, and changes nothing on cancel', () => {
    const local = built('My local experiment');
    const store = memory({ [DRAFT_STORAGE_KEY]: draft(local) });
    const prompts: string[] = [];
    expect(openRecordInPlanner(record(built('Saved')), 'CowFan', version, { storage: store, confirm: m => { prompts.push(m); return false; } })).toEqual({ status: 'cancelled' });
    expect(JSON.parse(store.map.get(DRAFT_STORAGE_KEY)!)).toEqual(local);
    expect(prompts[0]).toMatch(/My local experiment.*Saved.*backup/s);
    expect(openRecordInPlanner(record(built('Saved')), 'CowFan', version, { storage: store, confirm: () => true, now: 9 })).toEqual({ status: 'opened' });
    expect(readReplacedDraft(store)).toEqual({ version: 1, replacedAt: 9, document: local, link: null });
    expect(JSON.parse(store.map.get(DRAFT_STORAGE_KEY)!).title).toBe('Saved');
  });
  it('continues unsaved edits of the same build instead of discarding them', () => {
    const saved = built();
    const edited = { ...saved, title: 'Edited' };
    const store = memory({ [DRAFT_STORAGE_KEY]: draft(edited) });
    writeCloudLink(linkFor(record(saved), 'CowFan', saved), store);
    expect(openRecordInPlanner(record(saved), 'CowFan', version, { storage: store })).toEqual({ status: 'continued' });
    expect(JSON.parse(store.map.get(DRAFT_STORAGE_KEY)!).title).toBe('Edited');
  });
  it('never overwrites a protected draft from a newer schema', () => {
    const future = JSON.stringify({ ...built(), schemaVersion: 99 });
    const store = memory({ [DRAFT_STORAGE_KEY]: future });
    expect(openRecordInPlanner(record(built()), 'CowFan', version, { storage: store, confirm: () => true }).status).toBe('failed');
    expect(store.map.get(DRAFT_STORAGE_KEY)).toBe(future);
  });
});

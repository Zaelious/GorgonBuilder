// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDefaultBuildDocument, type BuildDocument } from '../../core/build/document';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import type { BuildRecord } from '../account/api';
import { openRecordInPlanner } from './open-build';
import {
  CLOUD_LINK_KEY, cloudState, discardReplacedDraft, documentHash, hasUnsavedWork, isEmptyBuild, linkFor, MAX_REPLACED_DRAFTS,
  readCloudLink, readReplacedDrafts, REPLACED_DRAFT_KEY, stableStringify, stashWorkingBuild, syncLinkMetadata, writeCloudLink,
} from './workspace';

const version = 'v490';
const empty = () => createDefaultBuildDocument({ gameDataVersion: version });
const built = (title = 'Cow/Unarmed'): BuildDocument => ({ ...empty(), title, skillSlotA: { skillId: 'Cow', level: 90 }, skillSlotB: { skillId: 'Unarmed', level: 80 } });
/** In-memory StorageLike; `failing` keys throw on write (quota/permission/per-key failure). */
function memory(initial: Record<string, string> = {}, failing: string[] = []) {
  const map = new Map(Object.entries(initial));
  return { map, failing, getItem: (key: string) => map.get(key) ?? null, removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { if (failing.includes(key)) throw new DOMException('Quota exceeded', 'QuotaExceededError'); map.set(key, value); } };
}
const kept = (store: ReturnType<typeof memory>) => { const read = readReplacedDrafts(store); if (!read.ok) throw new Error('unreadable'); return read.entries; };
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
    expect(kept(store)).toEqual([{ replacedAt: 9, document: local, link: null }]);
    expect(JSON.parse(store.map.get(DRAFT_STORAGE_KEY)!).title).toBe('Saved');
  });
  it('fails closed when the required backup cannot be written: draft, link and earlier backups stay intact', () => {
    const local = built('Only copy');
    const linked = built('Linked elsewhere');
    const earlier = { replacedAt: 1, document: built('Earlier'), link: null };
    const store = memory({ [DRAFT_STORAGE_KEY]: draft(local), [REPLACED_DRAFT_KEY]: JSON.stringify({ version: 2, entries: [earlier] }) }, [REPLACED_DRAFT_KEY]);
    writeCloudLink(linkFor(record(linked, { id: 'linkedlinkedlink' }), 'CowFan', linked), store);
    const before = new Map(store.map);
    const result = openRecordInPlanner(record(built('Incoming')), 'CowFan', version, { storage: store, confirm: () => true });
    expect(result).toMatchObject({ status: 'failed', message: expect.stringContaining('could not save a backup') });
    expect(store.map).toEqual(before);
  });
  it('rolls the backup back if the draft itself then cannot be written', () => {
    const local = built('Only copy');
    const store = memory({ [DRAFT_STORAGE_KEY]: draft(local) }, [DRAFT_STORAGE_KEY]);
    expect(openRecordInPlanner(record(built('Incoming')), 'CowFan', version, { storage: store, confirm: () => true }).status).toBe('failed');
    expect(JSON.parse(store.map.get(DRAFT_STORAGE_KEY)!)).toEqual(local);
    expect(store.map.has(REPLACED_DRAFT_KEY)).toBe(false);
    expect(store.map.has(CLOUD_LINK_KEY)).toBe(false);
  });
  it('A → B → C keeps both replaced builds instead of overwriting the first backup', () => {
    const a = built('A unsaved');
    const store = memory({ [DRAFT_STORAGE_KEY]: draft(a) });
    expect(openRecordInPlanner(record(built('B'), { id: 'bbbbbbbbbbbbbbbb' }), 'CowFan', version, { storage: store, confirm: () => true, now: 1 }).status).toBe('opened');
    const bEdited = { ...JSON.parse(store.map.get(DRAFT_STORAGE_KEY)!) as BuildDocument, title: 'B edited' };
    store.map.set(DRAFT_STORAGE_KEY, draft(bEdited));
    expect(openRecordInPlanner(record(built('C'), { id: 'cccccccccccccccc' }), 'CowFan', version, { storage: store, confirm: () => true, now: 2 }).status).toBe('opened');
    expect(kept(store).map(entry => entry.document.title)).toEqual(['A unsaved', 'B edited']);
    expect(kept(store)[1]!.link?.buildId).toBe('bbbbbbbbbbbbbbbb');
  });
  it('asks before replacing a damaged (invalid) draft and leaves its bytes untouched on cancel', () => {
    const damaged = '{"schemaVersion":1,"title":';
    const store = memory({ [DRAFT_STORAGE_KEY]: damaged });
    const prompts: string[] = [];
    expect(openRecordInPlanner(record(built('Incoming')), 'CowFan', version, { storage: store, confirm: m => { prompts.push(m); return false; } }).status).toBe('cancelled');
    expect(prompts[0]).toMatch(/damaged.*permanently replace/s);
    expect(store.map.get(DRAFT_STORAGE_KEY)).toBe(damaged);
    expect(openRecordInPlanner(record(built('Incoming')), 'CowFan', version, { storage: store, confirm: () => true }).status).toBe('opened');
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

describe('kept backups', () => {
  const entry = (title: string, replacedAt: number) => ({ replacedAt, document: built(title), link: null });
  it('appends without overwriting, reads the earlier single-entry form, and restores by consuming one entry', () => {
    const store = memory({ [REPLACED_DRAFT_KEY]: JSON.stringify({ version: 1, ...entry('Legacy', 1) }) });
    expect(stashWorkingBuild(built('Second'), null, { store, now: 2 })).toMatchObject({ ok: true, kept: true });
    expect(kept(store).map(item => item.document.title)).toEqual(['Legacy', 'Second']);
    // Restoring "Legacy" while the working build is clean removes only that entry.
    const saved = built('Clean');
    expect(stashWorkingBuild(saved, linkFor(record(saved), 'CowFan', saved), { store, consume: 0 })).toMatchObject({ ok: true, kept: false });
    expect(kept(store).map(item => item.document.title)).toEqual(['Second']);
    expect(discardReplacedDraft(0, store)).toEqual({ ok: true, entries: [] });
    expect(store.map.has(REPLACED_DRAFT_KEY)).toBe(false);
  });
  it('refuses when the list is full, unreadable or cannot be written, changing nothing', () => {
    const full = JSON.stringify({ version: 2, entries: Array.from({ length: MAX_REPLACED_DRAFTS }, (_, i) => entry(`Old ${i}`, i)) });
    for (const [initial, failing, reason] of [
      [full, [], 'full'], ['{not json', [], 'unreadable'], [JSON.stringify({ version: 2, entries: [{ replacedAt: 1, document: { nope: true } }] }), [], 'unreadable'],
      [null, [REPLACED_DRAFT_KEY], 'write-failed'],
    ] as const) {
      const store = memory(initial === null ? {} : { [REPLACED_DRAFT_KEY]: initial }, [...failing]);
      const before = new Map(store.map);
      expect(stashWorkingBuild(built('Unsaved'), null, { store })).toMatchObject({ ok: false, reason });
      expect(store.map).toEqual(before);
    }
  });
  it('needs no backup (and never writes) for empty or already-saved work', () => {
    const store = memory({}, [REPLACED_DRAFT_KEY]);
    expect(stashWorkingBuild(empty(), null, { store })).toMatchObject({ ok: true, kept: false });
    const saved = built();
    expect(stashWorkingBuild(saved, linkFor(record(saved), 'CowFan', saved), { store })).toMatchObject({ ok: true, kept: false });
  });
});

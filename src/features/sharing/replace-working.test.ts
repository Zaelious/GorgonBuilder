// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDefaultBuildDocument, type BuildDocument } from '../../core/build/document';
import { createLocalPersistence, DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import type { BuildRecord } from '../account/api';
import { openRecordInPlanner } from './open-build';
import { persistCloudLink, replaceWorkingDraft, REPLACE_MESSAGES } from './replace-working';
import { CLOUD_LINK_KEY, linkFor, readCloudLink, readReplacedDrafts, REPLACED_DRAFT_KEY, writeCloudLink, type ReplacedDraft } from './workspace';

const version = 'v490';
const built = (title: string, level = 90): BuildDocument => ({ ...createDefaultBuildDocument({ gameDataVersion: version }), title,
  skillSlotA: { skillId: 'Cow', level }, skillSlotB: { skillId: 'Unarmed', level: 80 } });
const record = (document: BuildDocument, id: string, revision = 1): BuildRecord => ({
  id, visibility: 'private', title: document.title, publicDescription: '', skillAId: 'Cow', skillBId: 'Unarmed', schemaVersion: 1,
  gameDataVersion: version, revision, createdAt: 1, updatedAt: 1, author: { username: 'CowFan' }, document,
});

/** StorageLike whose writes can fail per key/operation/attempt (quota, permission, per-key errors). */
function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  let failSet: (key: string, attempt: number) => boolean = () => false;
  let failRemove: (key: string) => boolean = () => false;
  const attempts = new Map<string, number>();
  return {
    map,
    failSetItem(predicate: (key: string, attempt: number) => boolean) { failSet = predicate; },
    failRemoveItem(predicate: (key: string) => boolean) { failRemove = predicate; },
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const attempt = (attempts.get(key) ?? 0) + 1; attempts.set(key, attempt);
      if (failSet(key, attempt)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key: string) => { if (failRemove(key)) throw new DOMException('Denied', 'SecurityError'); map.delete(key); },
  };
}
type Memory = ReturnType<typeof memory>;
const draftIn = (store: Memory) => JSON.parse(store.map.get(DRAFT_STORAGE_KEY)!) as BuildDocument;
const backupsIn = (store: Memory) => { const read = readReplacedDrafts(store); if (!read.ok) throw new Error('unreadable'); return read.entries; };
function setup(current: BuildDocument, link: ReturnType<typeof linkFor> | null, backups: ReplacedDraft[] = []) {
  const store = memory({ [DRAFT_STORAGE_KEY]: JSON.stringify(current), ...(backups.length ? { [REPLACED_DRAFT_KEY]: JSON.stringify({ version: 2, entries: backups }) } : {}) });
  if (link) writeCloudLink(link, store);
  const local = createLocalPersistence({ gameDataVersion: version, storage: store });
  return { store, saveDraft: (document: BuildDocument) => local.saveDraft(document).ok, snapshot: () => new Map(store.map) };
}

describe('Restore a kept backup', () => {
  const savedB = built('B saved');
  const linkB = linkFor(record(savedB, 'bbbbbbbbbbbbbbbb'), 'CowFan', savedB);
  const backupA: ReplacedDraft = { replacedAt: 1, document: built('A unsaved', 33), link: null };

  it('a failed incoming-draft write keeps backup A, draft B and link B exactly as they were', () => {
    const { store, saveDraft, snapshot } = setup(savedB, linkB, [backupA]);
    store.failSetItem(key => key === DRAFT_STORAGE_KEY);
    const before = snapshot();
    const result = replaceWorkingDraft({ current: savedB, currentLink: linkB, next: backupA.document, nextLink: backupA.link, consume: 0, saveDraft, store });
    expect(result).toEqual({ ok: false, message: REPLACE_MESSAGES.draft, partial: false });
    expect(store.map).toEqual(before);
    expect(backupsIn(store)).toEqual([backupA]);
    expect(draftIn(store)).toEqual(savedB);
    expect(readCloudLink(store)).toEqual(linkB);
  });
  it('a failed link update restores draft B and link B, and backup A stays', () => {
    const { store, saveDraft, snapshot } = setup(savedB, linkB, [backupA]);
    store.failRemoveItem(key => key === CLOUD_LINK_KEY); // A has no link, so B's link must be removed
    const before = snapshot();
    const result = replaceWorkingDraft({ current: savedB, currentLink: linkB, next: backupA.document, nextLink: null, consume: 0, saveDraft, store });
    expect(result).toMatchObject({ ok: false, message: REPLACE_MESSAGES.link });
    expect(store.map).toEqual(before);
  });
  it('success stores A, removes only the restored entry, and keeps unsaved current work as a new backup', () => {
    const editedB = { ...savedB, title: 'B edited' };
    const backupC: ReplacedDraft = { replacedAt: 2, document: built('C', 44), link: null };
    const { store, saveDraft } = setup(editedB, linkB, [backupA, backupC]);
    const result = replaceWorkingDraft({ current: editedB, currentLink: linkB, next: backupA.document, nextLink: null, consume: 0, saveDraft, store, now: 9 });
    expect(result.ok).toBe(true);
    expect(draftIn(store)).toEqual(backupA.document);
    expect(readCloudLink(store)).toBeNull();
    expect(backupsIn(store).map(entry => entry.document.title)).toEqual(['C', 'B edited']);
    expect(backupsIn(store)[1]!.link).toEqual(linkB);
  });
});

describe('Conflict: Load the saved version', () => {
  const saved = built('Cow build');
  const link = linkFor(record(saved, 'xxxxxxxxxxxxxxxx', 1), 'CowFan', saved);
  const edits = { ...saved, title: 'Cow build', skillSlotA: { skillId: 'Cow', level: 77 } };
  const latest = { ...saved, skillSlotA: { skillId: 'Cow', level: 11 } };
  const latestLink = linkFor(record(latest, 'xxxxxxxxxxxxxxxx', 3), 'CowFan', latest);

  it('a failed incoming-draft write keeps the edits, the revision-1 link and creates no backup', () => {
    const { store, saveDraft, snapshot } = setup(edits, link);
    store.failSetItem(key => key === DRAFT_STORAGE_KEY);
    const before = snapshot();
    expect(replaceWorkingDraft({ current: edits, currentLink: link, next: latest, nextLink: latestLink, saveDraft, store }))
      .toMatchObject({ ok: false, message: REPLACE_MESSAGES.draft });
    expect(store.map).toEqual(before);
    expect(readCloudLink(store)?.revision).toBe(1);
  });
  it('a per-key cloud-link write failure reverts the draft: edits and revision-1 link intact, no stray backup', () => {
    const { store, saveDraft, snapshot } = setup(edits, link);
    store.failSetItem(key => key === CLOUD_LINK_KEY);
    const before = snapshot();
    expect(replaceWorkingDraft({ current: edits, currentLink: link, next: latest, nextLink: latestLink, saveDraft, store }))
      .toMatchObject({ ok: false, message: REPLACE_MESSAGES.link, partial: false });
    expect(store.map).toEqual(before);
  });
  it('if even the revert fails, the stale link is removed and the edits stay in the backups', () => {
    const { store, saveDraft } = setup(edits, link);
    store.failSetItem((key, attempt) => key === CLOUD_LINK_KEY || (key === DRAFT_STORAGE_KEY && attempt >= 2));
    const result = replaceWorkingDraft({ current: edits, currentLink: link, next: latest, nextLink: latestLink, saveDraft, store });
    expect(result).toMatchObject({ ok: false, partial: true });
    expect(readCloudLink(store)).toBeNull(); // the incoming draft can never be saved over another record's revision
    expect(backupsIn(store).map(entry => entry.document.skillSlotA.level)).toEqual([77]);
  });
});

describe('openRecordInPlanner cloud-link persistence', () => {
  const current = built('Local only', 55);
  it('a per-key link write failure fails closed: old draft restored, no link, no backup left behind', () => {
    const { store, snapshot } = setup(current, null);
    store.failSetItem(key => key === CLOUD_LINK_KEY);
    const before = snapshot();
    const result = openRecordInPlanner(record(built('Incoming'), 'yyyyyyyyyyyyyyyy'), 'CowFan', version, { storage: store, confirm: () => true });
    expect(result).toEqual({ status: 'failed', message: REPLACE_MESSAGES.link });
    expect(store.map).toEqual(before);
  });
  it('never leaves another record\'s link beside the opened draft', () => {
    const other = built('Other saved');
    const otherLink = linkFor(record(other, 'oooooooooooooooo'), 'CowFan', other);
    const { store, snapshot } = setup(other, otherLink);
    store.failSetItem(key => key === CLOUD_LINK_KEY);
    const before = snapshot();
    expect(openRecordInPlanner(record(built('Incoming'), 'yyyyyyyyyyyyyyyy'), 'CowFan', version, { storage: store, confirm: () => true }).status).toBe('failed');
    expect(store.map).toEqual(before); // draft "Other saved" still paired with its own link
  });
  it('a failed incoming-draft write changes nothing', () => {
    const { store, snapshot } = setup(current, null);
    store.failSetItem(key => key === DRAFT_STORAGE_KEY);
    const before = snapshot();
    expect(openRecordInPlanner(record(built('Incoming'), 'yyyyyyyyyyyyyyyy'), 'CowFan', version, { storage: store, confirm: () => true }))
      .toEqual({ status: 'failed', message: REPLACE_MESSAGES.draft });
    expect(store.map).toEqual(before);
  });
});

describe('persistCloudLink after a server save', () => {
  it('removes a stale link it cannot overwrite, so a reload shows an unlinked build rather than the wrong record', () => {
    const old = built('Old');
    const store = memory();
    writeCloudLink(linkFor(record(old, 'oooooooooooooooo'), 'CowFan', old), store);
    store.failSetItem(key => key === CLOUD_LINK_KEY);
    const fresh = built('Fresh');
    expect(persistCloudLink(linkFor(record(fresh, 'ffffffffffffffff'), 'CowFan', fresh), store)).toBe(false);
    expect(readCloudLink(store)).toBeNull();
    store.failSetItem(() => false);
    expect(persistCloudLink(linkFor(record(fresh, 'ffffffffffffffff'), 'CowFan', fresh), store)).toBe(true);
    expect(readCloudLink(store)?.buildId).toBe('ffffffffffffffff');
  });
});

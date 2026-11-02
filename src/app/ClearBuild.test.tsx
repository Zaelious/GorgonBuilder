import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { createDefaultBuildDocument, type BuildDocument } from '../core/build/document';
import { loadGameDataRepository } from '../data/repository/load';
import { DRAFT_STORAGE_KEY, PREFERENCES_STORAGE_KEY } from '../persistence/local/storage';
import { loadPlannerFixture } from '../test/planner-fixture';

vi.mock('../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
let data: ReturnType<typeof loadPlannerFixture>, build: BuildDocument;
let container: HTMLDivElement, root: Root;
beforeAll(() => {
  data = loadPlannerFixture();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
    close: { configurable: true, value() { this.removeAttribute('open'); } },
  });
});
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  vi.mocked(loadGameDataRepository).mockResolvedValue(data);
  build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion, createdWithAppVersion: 'retained-until-reset' });
  build.title = 'Configured build'; build.notes = 'Keep until confirmed';
  build.skillSlotA = { skillId: 'Druid', level: 125 }; build.skillSlotB = { skillId: 'Archery', level: 100 };
  build.abilityBarA = [{ abilityId: 'ability_1578', rank: null }]; build.abilityBarB = [{ abilityId: 'ability_1201', rank: null }];
  build.equipment = [{ slot: 'Chest', item: { kind: 'imported', instance: { baseItemId: 'item_42705', displayName: 'Owned armor', existingPowers: [{ powerId: 'power_14005', tierId: 'id_25' }], metadata: { source: 'preserved' } } },
    candidateMods: [{ powerId: 'power_14154', tierId: 'id_25' }], sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Druid', count: 10, seed: 'fixture' } } }];
  build.target = { count: 9, damageTypes: { Acid: { resistance: 5 } }, metadata: { fixture: true } };
  build.characterImport = { characterName: 'Fixture' };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, minimumEquipmentLevel: 80 }));
  localStorage.setItem('unrelated.saved-build', 'keep'); localStorage.setItem('unrelated.owner-token', 'keep');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
function control<T extends HTMLElement = HTMLElement>(selector: string): T { const found = container.querySelector<T>(selector); if (!found) throw new Error(`Missing ${selector}`); return found; }
const render = async () => { await act(async () => root.render(<App />)); };
const click = async (selector: string) => { await act(async () => control(selector).click()); };
const tick = async (ms = 500) => { await act(async () => vi.advanceTimersByTime(ms)); };
const saved = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as BuildDocument;
async function remount() { await act(async () => root.unmount()); root = createRoot(container); await render(); }
async function change(selector: string, value: string) {
  const input = control<HTMLInputElement | HTMLSelectElement>(selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

it('cancel preserves exact document bytes and causes no autosave or status change', async () => {
  const bytes = localStorage.getItem(DRAFT_STORAGE_KEY);
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await render(); const status = control('.save-status').textContent;
  await click('.clear-build'); await tick();
  expect(confirm).toHaveBeenCalledOnce();
  for (const scope of ['skills and levels', 'both ability bars', 'imported working powers', 'planned mods', 'Spark configurations', 'title and notes', 'target settings']) expect(confirm.mock.calls[0]![0]).toContain(scope);
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
  expect(writes).not.toHaveBeenCalled();
  expect(control('.save-status').textContent).toBe(status);
  expect(control('#skill-A').getAttribute('disabled')).toBeNull();
  expect(control<HTMLSelectElement>('#skill-A').value).toBe('Druid');
});

it('confirmed reset replaces pending autosave with factory defaults and restores those defaults on refresh', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await render(); await change('#level-A', '110'); // A pending prior edit must never win after reset.
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('.clear-build');
  expect(control<HTMLSelectElement>('#skill-A').value).toBe('');
  expect(control<HTMLSelectElement>('#skill-B').value).toBe('');
  expect(control('.title-button').textContent).toBe('Untitled build');
  expect(container.querySelector('.has-equipment')).toBeNull();
  await tick(499); expect(writes).not.toHaveBeenCalled();
  await tick(1); expect(saved()).toEqual(createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }));
  expect(writes).toHaveBeenCalledTimes(1);
  expect(writes.mock.calls[0]![0]).toBe(DRAFT_STORAGE_KEY);
  await remount();
  expect(control<HTMLSelectElement>('#skill-A').value).toBe('');
  expect(container.textContent).toContain('Local draft restored');
  expect(saved()).toEqual(createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }));
  expect(localStorage.getItem('unrelated.saved-build')).toBe('keep');
  expect(localStorage.getItem('unrelated.owner-token')).toBe('keep');
});

it('retires skill-change Undo after confirm, while cancel leaves Undo functional', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await render(); await change('#skill-A', 'Cow');
  expect(control('.skill-change-notice').textContent).toContain('Removed 1 staged Druid mod');
  await click('.clear-build');
  await click('.skill-change-notice button'); await tick();
  expect(saved()).toEqual(build);
  await change('#skill-A', 'Cow');
  confirm.mockReturnValue(true); await click('.clear-build');
  expect(container.querySelector('.skill-change-notice button')).toBeNull();
  await tick(); await remount();
  expect(container.querySelector('.skill-change-notice button')).toBeNull();
  expect(saved().equipment).toEqual([]);
});

it.each(['unsupported-schema', 'unreadable-storage', 'game-data-mismatch'])('disables reset for %s with no confirmation or write', async mode => {
  if (mode === 'unsupported-schema') localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...build, schemaVersion: 2 }));
  if (mode === 'game-data-mismatch') localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...build, gameDataVersion: 'other' }));
  const bytes = localStorage.getItem(DRAFT_STORAGE_KEY);
  const getItem = Storage.prototype.getItem;
  if (mode === 'unreadable-storage') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (key === DRAFT_STORAGE_KEY) throw new Error('unreadable'); return getItem.call(this, key);
  });
  const writes = vi.spyOn(Storage.prototype, 'setItem'); const confirm = vi.spyOn(window, 'confirm');
  await render(); expect(control<HTMLButtonElement>('.clear-build').disabled).toBe(true);
  await click('.clear-build'); await tick();
  expect(confirm).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  expect(getItem.call(localStorage, DRAFT_STORAGE_KEY)).toBe(bytes);
});

it('retains the imported reports, My Items and minimum preference after reset without auto-equipping', async () => {
  const preferences = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await render(); await click('.planner-heading > button:not(.clear-build)');
  for (const [selector, path] of [['#character-file', 'src/core/import/fixtures/character-sheet.json'], ['#storage-file', 'src/features/import/fixtures/storage.json']]) {
    const file = new File([readFileSync(path!, 'utf8')], 'synthetic.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(readFileSync(path!, 'utf8')) });
    await act(async () => { const input = control<HTMLInputElement>(selector!); Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  const useReports = [...container.querySelectorAll('button')].find(button => button.textContent === 'Use these reports')!;
  await act(async () => useReports.click());
  const myItems = control<HTMLButtonElement>('.equipment-section > .section-heading button');
  const label = myItems.textContent;
  await click('.clear-build'); await tick();
  expect(myItems.textContent).toBe(label); expect(myItems.disabled).toBe(false);
  expect(saved()).toEqual(createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }));
  await click('.equipment-section > .section-heading button');
  expect(container.querySelectorAll('[data-import-path]')).toHaveLength(5);
  expect(control('dialog').textContent).toContain('Twin Fixture Blade');
  expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBe(preferences);
});

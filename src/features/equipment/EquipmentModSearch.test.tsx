import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultBuildDocument, type BuildDocument } from '../../core/build/document';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
vi.mock('../../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement, root: Root;
beforeAll(() => {
  data = loadPlannerFixture();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
    close: { configurable: true, value() { this.removeAttribute('open'); } },
  });
});
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
  vi.mocked(loadGameDataRepository).mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
function el<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector); if (!element) throw new Error(selector); return element;
}
async function click(selector: string) { await act(async () => el(selector).click()); }
async function change(selector: string, value: string) {
  const input = el<HTMLInputElement>(selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const searchInput = '[aria-label="Search treasure powers"]';
const search = (query: string) => change(searchInput, query);
const render = () => act(async () => root.render(<App />));
const settle = () => act(async () => vi.advanceTimersByTime(600));
const row = (slot: string) => `[data-equipment-row="${slot}"]`;
const visible = () => [...container.querySelectorAll<HTMLDetailsElement>('.equipment-row:not([hidden])')];
function seed() {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Druid', level: 90 }; build.skillSlotB = { skillId: 'Archery', level: 90 };
  build.equipment = ['Head', 'Chest', 'Ring', 'MainHand', 'Racial'].map(slot => ({ slot,
    item: { kind: 'database', itemId: slot === 'MainHand' ? 'item_46107' : data.items.find(item => item.slot === slot )!.id },
    candidateMods: [], sparks: { mode: 'none' },
  }));
  build.equipment[2]!.item = { kind: 'imported', instance: { baseItemId: 'item_49070', displayName: 'Working imported ring',
    existingPowers: [{ powerId: 'power_14005', tierId: 'id_9' }], metadata: { original: 'keep' } } };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); return build;
}
async function parity() {
  for (const element of visible()) {
    if (!element.open) await click(`${row(element.dataset.equipmentRow!)} > summary`);
    expect(Number(element.querySelector('.equipment-mod-count')!.textContent!.split(' ')[0]))
      .toBe(element.querySelectorAll('.mod-available-power').length);
  }
}

it('filters core rows with exact expanded counts, Show all, query changes and clearing preserve saved build and expansion', async () => {
  seed(); const bytes = localStorage.getItem(DRAFT_STORAGE_KEY);
  await render(); await click(`${row('Ring')} > summary`);
  const ring = el<HTMLDetailsElement>(row('Ring'));
  await act(async () => el<HTMLInputElement>(searchInput).focus());
  await search('core');
  expect(visible().length).toBeGreaterThan(0);
  expect(visible().length).toBeLessThan(9);
  expect(visible().every(element => Number(element.querySelector('.equipment-mod-count')!.textContent!.split(' ')[0]) > 0)).toBe(true);
  expect(el<HTMLDetailsElement>(row('Feet')).hidden).toBe(true);
  expect(document.activeElement).toBe(el(searchInput));
  await parity();
  await search('no matching power'); expect(visible()).toHaveLength(0);
  expect(el('.equipment-search-status [role="status"]').textContent).toContain('No equipment has matching Available mods');
  expect(ring.open).toBe(true);
  await click('.equipment-search-status input');
  expect(visible()).toHaveLength(18);
  expect(ring.hidden).toBe(false);
  expect(ring.querySelectorAll('.mod-available-power')).toHaveLength(0);
  await search('');
  expect(container.querySelectorAll('.equipment-primary > .equipment-row:not([hidden])')).toHaveLength(9);
  expect(el<HTMLDetailsElement>('.equipment-other').hidden).toBe(false);
  expect(ring.open).toBe(true);
  expect(container.querySelector('.equipment-search-status')).toBeNull();
  await search('no matching power'); expect(visible()).toHaveLength(0); // override resets after clearing
  await settle(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
  await act(async () => root.unmount()); root = createRoot(container); await render();
  expect(el<HTMLInputElement>(searchInput).value).toBe('');
  expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!)).toEqual(JSON.parse(bytes!));
});

it('matches lists across category/all-skills/other-slot settings, duplicate skills and target previews without a new level filter', async () => {
  const build = seed(); build.skillSlotB.skillId = 'Druid'; localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render(); await search('core'); await parity();
  await click('.mod-browser-settings > summary');
  for (const toggle of [1, 2, 3, 4, 5]) {
    await click(`.mod-category-toggles label:nth-child(${toggle}) input`); await parity();
  }
  const ids = visible().map(element => element.dataset.equipmentRow);
  for (const level of ['Max', '90', '100', '125', '0']) {
    await change('[aria-label="Mod target level"]', level); await parity();
    expect(visible().map(element => element.dataset.equipmentRow)).toEqual(ids);
  }
  // At target 0 the same powers remain available with an explicit no-range placeholder.
  expect(container.textContent).toContain('No published tier range at this target');
  await settle(); expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!)).toEqual(build);
});

it('staging the last matching power hides its row, preserves the edit and returns focus to search', async () => {
  seed(); await render(); await search('power_14005');
  await click('.mod-browser-settings > summary'); await click('.mod-category-toggles label:nth-child(5) input');
  await click(`${row('Chest')} > summary`);
  const add = `${row('Chest')} .available-effect`;
  await act(async () => el<HTMLButtonElement>(add).focus()); await click(add);
  expect(el<HTMLDetailsElement>(row('Chest')).hidden).toBe(true);
  expect(document.activeElement).toBe(el(searchInput));
  await click('.equipment-search-status input');
  expect(el<HTMLDetailsElement>(row('Chest')).open).toBe(true);
  expect(el(row('Chest')).querySelectorAll('.mod-selected [data-mod-index]')).toHaveLength(1);
  expect(el(row('Ring')).querySelectorAll('.mod-available-power')).toHaveLength(0); // imported exclusion
  await settle();
  const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as BuildDocument;
  expect(saved.equipment[1]!.candidateMods[0]!.powerId).toBe('power_14005');
  expect(saved.equipment[2]!.item.kind).toBe('imported');
});

it('handles no gear/no active skills and read-only filtering without saved edits', async () => {
  const build = seed(); build.gameDataVersion = 'other';
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); const bytes = localStorage.getItem(DRAFT_STORAGE_KEY);
  await render(); await search('core'); await parity();
  expect([...container.querySelectorAll<HTMLButtonElement>('.available-effect')].every(button => button.disabled)).toBe(true);
  await settle(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
  await act(async () => root.unmount()); root = createRoot(container);
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion })));
  await render(); await search('core'); expect(visible()).toHaveLength(0);
  await click('.equipment-search-status input');
  expect(visible()).toHaveLength(18);
  await search(''); expect(container.querySelectorAll('.equipment-primary > .equipment-row:not([hidden])')).toHaveLength(9);
});

it('returns picker focus to the shared search when a replacement has no matches', async () => {
  const build = seed(); build.equipment[3]!.item = { kind: 'database', itemId: 'item_45511' };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render(); await search('HealthFromCombatRefreshBoost'); await click(`${row('MainHand')} > summary`);
  await act(async () => el<HTMLButtonElement>(`${row('MainHand')} .equipment-actions button`).focus());
  await click(`${row('MainHand')} .equipment-actions button`);
  await change('#minimum-target-level', ''); await change('#equipment-search', 'item_46026');
  await click('.equipment-result-heading button');
  expect(el<HTMLDetailsElement>(row('MainHand')).hidden).toBe(true);
  expect(document.activeElement).toBe(el(searchInput));
  await settle();
  expect((JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as BuildDocument).equipment[3]!.item)
    .toEqual({ kind: 'database', itemId: 'item_46026' });
});

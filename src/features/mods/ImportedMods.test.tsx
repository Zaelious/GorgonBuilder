import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { App } from '../../app/App';
import { createDefaultBuildDocument, type BuildDocument } from '../../core/build/document';
import { parseStorageJson } from '../../core/import';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { selectedImportedInstance } from '../import/inventory';

vi.mock('../../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
let data: ReturnType<typeof loadPlannerFixture>, original: BuildDocument;
let container: HTMLDivElement, root: Root;
beforeAll(() => { data = loadPlannerFixture(); });
beforeEach(async () => {
  vi.useFakeTimers(); localStorage.clear();
  vi.mocked(loadGameDataRepository).mockResolvedValue(data);
  original = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  original.skillSlotA = { skillId: 'Cow', level: 100 }; original.skillSlotB = { skillId: 'Unarmed', level: 100 };
  original.abilityBarA = [{ abilityId: 'ability_1652', rank: null }]; original.notes = 'Keep notes';
  const result = parseStorageJson(readFileSync('src/features/mods/fixtures/imported-cow-unarmed.json', 'utf8'), createImportReferenceResolver(data));
  if (!result.ok) throw new Error('Invalid fixture');
  original.equipment = [{ slot: 'MainHand', item: { kind: 'imported', instance: selectedImportedInstance(result.value.items[0]!) }, candidateMods: [],
    sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Cow', count: 5, seed: 'keep' } } },
  { slot: 'Ring', item: { kind: 'database', itemId: 'item_49070' }, candidateMods: [], sparks: { mode: 'none' } }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(original));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
const scope = '[data-selection-index="0"]';
const editor = `${scope} .mod-planner`;
function control<T extends HTMLElement = HTMLElement>(selector: string): T { const found = container.querySelector<T>(selector); if (!found) throw new Error(`Missing ${selector}`); return found; }
const click = async (selector: string) => { await act(async () => control(selector).click()); };
async function change(selector: string, value: string) {
  const input = control<HTMLInputElement | HTMLSelectElement>(selector);
  await act(async () => { Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}
const render = async () => { await act(async () => root.render(<App />)); await click('[data-equipment-row="MainHand"] > summary'); };
const tick = async () => { await act(async () => vi.advanceTimersByTime(500)); };
const saved = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as BuildDocument;
const selected = () => [...container.querySelectorAll<HTMLElement>(`${editor} [data-selected-power-id]`)];
const stats = () => [...container.querySelectorAll<HTMLElement>(`${scope} [data-stat-kind]:not([data-stat-kind="base"])`)];
const powers = () => selected().map(row => row.dataset.selectedPowerId);
const search = (value: string) => change(`.mod-browser-controls [aria-label="Search treasure powers"]`, value);
async function remount() { await act(async () => root.unmount()); root = createRoot(container); await render(); }

it('shows all six imported pairs in Selected immediately with matching skill grouping in Stats', () => {
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (6)');
  expect(powers()).toEqual(['power_20006', 'power_20014', 'power_20015', 'power_3001', 'power_3006', 'power_3007']);
  expect(stats().map(row => row.dataset.powerId)).toEqual(powers());
  expect(selected().map(row => row.querySelector<HTMLElement>('.stat-chip')!.dataset.tone)).toEqual(['skill-a', 'skill-a', 'skill-a', 'skill-b', 'skill-b', 'skill-b']);
  expect(selected()[0]?.textContent).toContain('CowImported · id_9');
  expect(selected()[3]?.textContent).toContain('UnarmedImported · id_9');
  expect(control('.imported-item-details').textContent).toContain('Original imported item');
  expect(control('.imported-item-details').textContent).toContain('Historical export evidence only');
  expect(control('.imported-item-details').textContent).toContain('FixtureUnknownPower');
  expect(control('.imported-item-details').textContent).toContain('Imbues (1)');
  expect(powers()).not.toContain('power_129');
});

it('adds a new Cow candidate to both views with the same tone and excludes all effective power IDs from Available', async () => {
  await search('power_20006'); expect(container.querySelector(`${editor} .available-effect`)).toBeNull();
  await search('power_20204'); await click(`${editor} [data-power-id="power_20204"] > .available-effect`);
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (7)');
  expect(selected().filter(row => row.querySelector('.stat-chip')?.textContent === 'Cow')).toHaveLength(4);
  expect(selected().filter(row => row.querySelector('.stat-chip')?.textContent === 'Cow').every(row => row.querySelector<HTMLElement>('.stat-chip')!.dataset.tone === 'skill-a')).toBe(true);
  expect(stats().map(row => row.dataset.powerId)).toEqual(powers());
  expect(container.querySelector(`${editor} .available-effect`)).toBeNull();
  await tick(); expect(saved().equipment[0]?.candidateMods).toHaveLength(1);
  expect(saved().equipment[0]?.item).toEqual(original.equipment[0]?.item);
});

it('changes/removes imported working pairs, survives refresh without resurrection, and restores only imported mods', async () => {
  await click(`${editor} [aria-label="Details and tier for imported mod 1"]`);
  await change(`${editor} [aria-label="Tier for imported mod 1"]`, 'id_8');
  expect(control(`${scope} [data-existing-power="0"]`).dataset.tierId).toBe('id_8');
  expect(control(`${editor} [data-existing-mod-index="0"]`).dataset.selectedTierId).toBe('id_8');
  await click(`${editor} [aria-label="Remove imported mod 2"]`);
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (5)');
  expect(powers()).not.toContain('power_3001'); expect(stats().map(row => row.dataset.powerId)).not.toContain('power_3001');
  await search('power_20204'); await click(`${editor} [data-power-id="power_20204"] > .available-effect`); await tick();
  const edited = saved(); await remount();
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (6)');
  expect(powers()).not.toContain('power_3001'); expect(control(`${scope} [data-existing-power="0"]`).dataset.tierId).toBe('id_8');
  expect(control('.imported-item-details').textContent).toContain('Source power: power_3001');
  expect(control('.imported-item-details').textContent).toContain('Exact source tier: 9');
  await click(`${editor} .restore-imported-mods`); await tick();
  const restored = saved();
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (7)');
  expect(restored.equipment[0]?.item).toEqual(original.equipment[0]?.item);
  expect(restored.equipment[0]?.candidateMods).toEqual(edited.equipment[0]?.candidateMods);
  expect(restored.equipment[0]?.sparks).toEqual(original.equipment[0]?.sparks);
  expect(restored.equipment[1]).toEqual(original.equipment[1]); expect(restored.abilityBarA).toEqual(original.abilityBarA);
  await click(`${editor} [aria-label="Remove candidate 1"]`); await tick(); expect(saved().equipment[0]?.item).toEqual(original.equipment[0]?.item);
});

it('makes a removed imported power available again and confirms restore collisions without deleting planned copies', async () => {
  await click(`${editor} [aria-label="Remove imported mod 1"]`); await search('power_20006');
  await click(`${editor} [data-power-id="power_20006"] > .available-effect`); await tick(); const before = saved();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click(`${editor} .restore-imported-mods`); await tick(); expect(saved()).toEqual(before);
  confirm.mockReturnValue(true); await click(`${editor} .restore-imported-mods`); await tick();
  expect(saved().equipment[0]?.candidateMods).toEqual(before.equipment[0]?.candidateMods);
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (7)');
  expect(confirm).toHaveBeenCalledTimes(2);
});

it('recolors and regroups when slot order changes without changing imported pairs or their source evidence', async () => {
  await change('#skill-A', 'Unarmed'); await change('#skill-B', 'Cow');
  expect(powers()).toEqual(['power_3001', 'power_3006', 'power_3007', 'power_20006', 'power_20014', 'power_20015']);
  expect(selected()[0]?.querySelector('.stat-chip')?.textContent).toBe('Unarmed');
  expect(selected()[0]?.querySelector<HTMLElement>('.stat-chip')?.dataset.tone).toBe('skill-a');
  await tick(); expect(saved().equipment[0]?.item).toEqual(original.equipment[0]?.item);
});

it('keeps Skill B gold when Skill A is empty instead of recoloring the unique active skill as A', async () => {
  await change('#skill-A', '');
  const unarmed = selected().filter(row => row.querySelector('.stat-chip')?.textContent === 'Unarmed');
  expect(unarmed).toHaveLength(3);
  expect(unarmed.every(row => row.querySelector<HTMLElement>('.stat-chip')?.dataset.tone === 'skill-b')).toBe(true);
  expect(selected()).toHaveLength(6);
  await tick(); expect(saved().equipment[0]?.item).toEqual(original.equipment[0]?.item);
});

it('disables imported edits/restoration on a protected read-only draft', async () => {
  const protectedDraft = { ...original, gameDataVersion: 'other' }; const bytes = JSON.stringify(protectedDraft);
  localStorage.setItem(DRAFT_STORAGE_KEY, bytes); await remount();
  expect(selected()).toHaveLength(6);
  expect([...container.querySelectorAll<HTMLButtonElement>(`${editor} .candidate-remove`)].every(button => button.disabled)).toBe(true);
  await click(`${editor} [aria-label="Details and tier for imported mod 1"]`);
  expect(control<HTMLSelectElement>(`${editor} [aria-label="Tier for imported mod 1"]`).disabled).toBe(true);
  expect(control<HTMLButtonElement>(`${editor} .restore-imported-mods`).disabled).toBe(true);
  await tick(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
});

it('keeps historical evidence under one default-closed disclosure and source warnings visible above Stats', async () => {
  const details = control<HTMLDetailsElement>(`${scope} > .item-details-source`);
  expect(details.open).toBe(false);
  expect(container.querySelectorAll(`${scope} > details`)).toHaveLength(1);
  expect(control('.imported-item-details').closest('.item-details-source')).toBe(details);
  expect(control(`${scope} .item-stats`).closest('details')).toBe(control('[data-equipment-row="MainHand"]'));
  const visibleWarning = control(`${scope} > .warning`);
  expect(visibleWarning.textContent).toContain('original power/imbue entries are unresolved');
  expect(visibleWarning.closest('.item-details-source')).toBeNull();
  const sourceBefore = control('.imported-item-details').textContent;
  expect(sourceBefore).toContain('Actual level 100');
  expect(sourceBefore).toContain('Original TypeID: 45640');
  expect(sourceBefore).toContain('FixtureUnknownPower');
  expect(sourceBefore).toContain('futureTier');
  expect(sourceBefore).toContain('Imbues (1)');
  expect(sourceBefore).toContain('CraftPoints');
  await click(`${editor} [aria-label="Remove imported mod 1"]`);
  await tick();
  expect(control('.imported-item-details').textContent).toBe(sourceBefore);
  expect(saved().equipment[0]?.item.kind).toBe('imported');
  expect(saved().equipment[0]?.item).not.toEqual(original.equipment[0]?.item);
});

it('shows source/base slot conflicts outside the closed metadata', async () => {
  await act(async () => root.unmount());
  const selection = original.equipment[0]!;
  if (selection.item.kind !== 'imported') throw new Error('fixture');
  const source = selection.item.instance.metadata!.sourceItem as Record<string, unknown>;
  source.Slot = 'Head';
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(original));
  root = createRoot(container); await render();
  const warnings = [...container.querySelectorAll(`${scope} > .warning`)];
  expect(warnings.some(warning => warning.textContent?.includes('Source slot Head differs from official base slot MainHand'))).toBe(true);
  expect(control<HTMLDetailsElement>(`${scope} > .item-details-source`).open).toBe(false);
});

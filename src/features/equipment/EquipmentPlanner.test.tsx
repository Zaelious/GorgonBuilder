import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultBuildDocument } from '../../core/build/document';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY, PREFERENCES_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { EquipmentIcon, equipmentIconUrl } from './EquipmentIcon';

vi.mock('../../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement;
let root: Root;
beforeAll(() => {
  data = loadPlannerFixture();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
    close: { configurable: true, value() { this.removeAttribute('open'); } },
  });
});
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.mocked(loadGameDataRepository).mockReset().mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove(); vi.restoreAllMocks(); vi.useRealTimers();
});
const render = async () => { await act(async () => { root.render(<App />); }); };
function control<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
const click = async (selector: string) => { await act(async () => { control(selector).click(); }); };
async function change(selector: string, value: string) {
  const element = control<HTMLInputElement | HTMLSelectElement>(selector);
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
const tick = async () => { await act(async () => { vi.advanceTimersByTime(500); }); };
async function browse(slot = 'MainHand') {
  if (slot === 'OffHandShield') slot = 'OffHand';
  const row = control<HTMLDetailsElement>(`[data-equipment-row="${slot === 'OffHandShield' ? 'OffHand' : slot}"]`);
  if (!row.open) await click(`[data-equipment-row="${slot === 'OffHandShield' ? 'OffHand' : slot}"] > summary`);
  const selected = row.querySelector(`[data-equipment-slot="${slot}"] .equipment-actions button`);
  if (selected) await click(`[data-equipment-slot="${slot}"] .equipment-actions button`);
  else await click(`[aria-label="Browse ${slot} items"]`);
}
const close = () => click('[aria-label="Close equipment picker"]');
const draft = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as ReturnType<typeof createDefaultBuildDocument>;
async function remount() {
  await act(async () => { root.unmount(); });
  root = createRoot(container); await render();
}

it('shows a compact empty overview, all 19 exact slots and a focused on-demand picker without writing storage', async () => {
  await render();
  expect(container.querySelectorAll('.equipment-primary > .equipment-row')).toHaveLength(9);
  expect([...container.querySelectorAll('.equipment-row-name')].filter(element => element.textContent === 'No gear selected')).toHaveLength(18);
  expect([...container.querySelectorAll<HTMLElement>('[data-equipment-slot]')].map(element => element.dataset.equipmentSlot).sort()).toEqual([...new Set(data.items.map(item => item.slot))].filter(slot => slot !== 'OffHandShield').sort());
  expect(control<HTMLDetailsElement>('.equipment-other').open).toBe(false);
  expect(container.querySelector('dialog')).toBeNull();
  await browse();
  expect(document.activeElement).toBe(control('#equipment-search'));
  expect(control<HTMLInputElement>('#minimum-target-level').value).toBe('90');
  expect(control<HTMLInputElement>('.equipment-checkbox input').checked).toBe(true);
  expect(container.querySelectorAll('.equipment-result').length).toBeLessThanOrEqual(25);
  await change('#equipment-search', 'no such equipment');
  expect(container.textContent).toContain('No official equipment matches');
  await close(); await tick();
  expect(document.activeElement).toBe(control('[aria-label="Browse MainHand items"]'));
  expect(localStorage.length).toBe(0);
});

it('closes with one Escape from a nonempty search and restores focus', async () => {
  await render(); await browse(); await change('#equipment-search', 'lightning');
  await act(async () => { control('#equipment-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  expect(container.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(control('[aria-label="Browse MainHand items"]'));
});

it('equips, replaces, clears and reloads while preserving both skill bars and unrelated fields', async () => {
  const original = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  original.skillSlotA = { skillId: 'Psychology', level: 90 }; original.skillSlotB = { skillId: 'Deer', level: 75 };
  original.abilityBarA = [{ abilityId: 'ability_1201', rank: null }]; original.abilityBarB = [{ abilityId: 'ability_1578', rank: null }];
  original.notes = 'Keep this'; original.target.count = 5;
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(original));
  await render();
  await browse('OffHandShield');
  const matches = data.items.filter(item => item.slot === 'OffHandShield' && item.level !== null && item.level >= 90);
  const first = matches[0]!; const second = matches[1]!;
  await change('#equipment-search', first.id); await click('.equipment-result-heading button'); await tick();
  expect(draft()).toEqual({ ...original, equipment: [{ slot: first.slot, item: { kind: 'database', itemId: first.id }, candidateMods: [], sparks: { mode: 'none' } }] });
  await remount(); expect(container.textContent).toContain(first.displayName);
  await click('.has-equipment > summary');
  await click('.equipment-actions button'); await change('#equipment-search', second.id);
  await click('.equipment-result-heading button'); await tick(); await remount();
  expect(draft().equipment[0]!.item).toEqual({ kind: 'database', itemId: second.id });
  await click('.has-equipment > summary'); await click('.equipment-actions button:nth-child(2)'); await tick(); await remount();
  expect(draft()).toEqual(original);
});

it.each([80, 0, null])('persists minimum preference %s via schema v1 and reload without creating a build draft', async minimum => {
  await render(); await browse();
  await change('#minimum-target-level', minimum === null ? '' : String(minimum));
  expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual({ schemaVersion: 1, minimumEquipmentLevel: minimum });
  await close(); await remount(); await browse();
  expect(control<HTMLInputElement>('#minimum-target-level').value).toBe(minimum === null ? '' : String(minimum));
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
});

it('composes slot, text and unknown toggles; disabling minimum includes unknowns even when unchecked', async () => {
  await render(); await browse('Feet');
  await change('#equipment-search', 'item_40002');
  expect(container.textContent).toContain('Unknown target level');
  await click('.equipment-checkbox input');
  expect(container.textContent).toContain('No official equipment matches');
  await change('#minimum-target-level', '');
  expect(container.textContent).toContain('Basic Boots');
  expect(container.textContent).toContain('Published skill requirements: none published');
});

it('displays SkillReqs separately and retains equipped items when filters change', async () => {
  await render(); await browse('MainHand');
  await change('#equipment-search', 'item_45640');
  expect(control('.item-meta').textContent).toBe('Target level 90');
  expect(control('.item-requirements').textContent).toMatch(/Published skill requirements: .+ \d/u);
  await click('.equipment-result-heading button'); await tick();
  const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
  await browse(); await change('#minimum-target-level', '999'); await click('.equipment-checkbox input');
  await change('#equipment-search', 'no results'); await close(); await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(saved);
});

it.each(['future-schema', 'snapshot'])('protects a %s draft while allowing saved item inspection and disabling equip/replace/clear', async mode => {
  const build = createDefaultBuildDocument({ gameDataVersion: mode === 'snapshot' ? 'other' : data.gameDataVersion });
  build.equipment = [{ slot: 'Ring', item: { kind: 'database', itemId: 'item_49070' }, candidateMods: [], sparks: { mode: 'none' } }];
  const bytes = JSON.stringify(mode === 'future-schema' ? { ...build, schemaVersion: 2 } : build);
  localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  await render();
  if (mode === 'snapshot') {
    await click('.has-equipment > summary');
    expect([...container.querySelectorAll<HTMLButtonElement>('.equipment-actions button')].every(button => button.disabled)).toBe(true);
  }
  await browse();
  expect([...container.querySelectorAll<HTMLButtonElement>('.equipment-result-heading button')].every(button => button.disabled)).toBe(true);
  await tick(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
});

it('protects unsupported preferences while ordinary equipment edits still save', async () => {
  const bytes = '{"schemaVersion":2,"minimumEquipmentLevel":12,"future":true}';
  localStorage.setItem(PREFERENCES_STORAGE_KEY, bytes);
  await render(); await browse();
  expect(control<HTMLInputElement>('#minimum-target-level').disabled).toBe(true);
  expect(container.textContent).toContain('preferences use an unsupported version');
  await click('.equipment-result-heading button'); await tick();
  expect(draft().equipment).toHaveLength(1);
  expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBe(bytes);
});

it('reports failed preference writes with a retry that saves the chosen value', async () => {
  await render(); await browse();
  const write = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === PREFERENCES_STORAGE_KEY) throw new Error('quota');
    write.call(this, key, value);
  });
  await change('#minimum-target-level', '80');
  expect(container.textContent).toContain('minimum target level could not be saved');
  expect(control<HTMLInputElement>('#minimum-target-level').value).toBe('80');
  spy.mockRestore();
  await click('dialog [role="alert"] button');
  expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!).minimumEquipmentLevel).toBe(80);
  expect(container.querySelector('dialog [role="alert"]')).toBeNull();
});

it('retains a failed draft save for explicit retry after equipping', async () => {
  await render(); await browse();
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await click('.equipment-result-heading button'); await tick();
  expect(container.textContent).toContain('local draft could not be saved');
  spy.mockRestore();
  await click('.planner-main > .notice button');
  expect(draft().equipment).toHaveLength(1);
});

it('requires deliberate confirmation to discard a manual instance or clear associated data', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.equipment = [{ slot: 'Ring', item: { kind: 'manual', instance: { baseItemId: null, displayName: 'Keep me', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }] } }, candidateMods: [{ powerId: 'power_10001', tierId: null }], sparks: { mode: 'none' } }];
  const bytes = JSON.stringify(build); localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await render(); await click('.has-equipment > summary');
  await click('.equipment-actions button:nth-child(2)'); await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
  await click('.equipment-actions button'); await click('.equipment-result-heading button'); await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
  expect(container.querySelector('dialog')).not.toBeNull();
  confirm.mockReturnValue(true);
  await click('.equipment-result-heading button'); await tick();
  expect(draft().equipment[0]!.candidateMods).toEqual(build.equipment[0]!.candidateMods);
  expect(draft().equipment[0]!.item.kind).toBe('database');
});

it('blocks edits when draft or preferences cannot be read and preserves unread bytes', async () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  await render(); await browse();
  expect(control<HTMLInputElement>('#minimum-target-level').disabled).toBe(true);
  expect(control<HTMLButtonElement>('.equipment-result-heading button').disabled).toBe(true);
  await tick(); spy.mockRestore(); expect(localStorage.length).toBe(0);
});

it('retains and explicitly resolves legacy offhand conflicts without losing the kept instance or unrelated data', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.equipment = [
    { slot: 'OffHand', item: { kind: 'manual', instance: { baseItemId: null, displayName: 'Manual offhand', existingPowers: [] } }, candidateMods: [{ powerId: 'power_10001', tierId: null }], sparks: { mode: 'none' } },
    { slot: 'OffHandShield', item: { kind: 'imported', instance: { baseItemId: 'item_45052', displayName: 'My shield', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }], metadata: { retained: true } } }, candidateMods: [], sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 10, seed: 'keep' } } },
    { slot: 'OffHand', item: { kind: 'imported', instance: { baseItemId: null, displayName: 'Second offhand', existingPowers: [] } }, candidateMods: [], sparks: { mode: 'none' } },
    { slot: 'LegacySlot', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [], sparks: { mode: 'none' } },
  ];
  const bytes = JSON.stringify(build);
  localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  await render(); await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
  expect(control('[data-equipment-row="OffHand"] > summary').textContent).toContain('Conflict · 3 saved');
  await click('[data-equipment-row="OffHand"] > summary');
  expect(container.querySelectorAll('[data-equipment-slot="OffHand"] .equipment-selection')).toHaveLength(3);
  expect(container.textContent).toContain('All entries are retained');
  expect([...container.querySelectorAll<HTMLButtonElement>('[data-equipment-row="OffHand"] .equipment-actions button:first-child')].every(button => button.disabled)).toBe(true);
  await remount();
  expect(draft()).toEqual(build);
  await change('#level-A', '90'); await tick();
  expect(draft().equipment).toEqual(build.equipment);
  await click('[data-equipment-row="OffHand"] > summary');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('[data-selection-index="1"] .equipment-actions button:nth-child(3)'); await tick();
  expect(draft().equipment).toEqual(build.equipment);
  expect(confirm.mock.calls[0]![0]).toContain('staged mods, and Spark settings');
  confirm.mockReturnValue(true);
  await click('[data-selection-index="1"] .equipment-actions button:nth-child(3)'); await tick(); await remount();
  expect(draft().equipment).toEqual([build.equipment[1], build.equipment[3]]);
  expect(container.textContent).not.toContain('Conflict ·');
  expect(control('[data-equipment-row="LegacySlot"]').closest('.equipment-other')).not.toBeNull();
});

it('does not dismiss the picker when its backdrop is clicked', async () => {
  await render(); await browse(); await change('#equipment-search', 'taunt');
  await click('dialog');
  expect(control<HTMLInputElement>('#equipment-search').value).toBe('taunt');
  expect(control<HTMLDialogElement>('dialog').open).toBe(true);
  await close();
  expect(document.activeElement).toBe(control('[aria-label="Browse MainHand items"]'));
});

it('uses exact official icon URLs, falls back on missing/failed artwork and recovers for a new icon', async () => {
  expect(equipmentIconUrl(15208, 'v490')).toBe('https://cdn.projectgorgon.com/v490/icons/icon_15208.png');
  expect(equipmentIconUrl(14009, '490')).toBe('https://cdn.projectgorgon.com/v490/icons/icon_14009.png');
  for (const icon of [null, undefined, -1, 1.5, NaN]) expect(equipmentIconUrl(icon, 'v490')).toBeNull();
  expect(equipmentIconUrl(1, '../bad')).toBeNull();
  await act(async () => { root.render(<EquipmentIcon slot="Head" iconId={null} version="v490" />); });
  expect(control('[role="img"]').getAttribute('aria-label')).toBe('Head equipment icon');
  await act(async () => { root.render(<EquipmentIcon slot="Head" iconId={15208} version="v490" />); });
  expect(control<HTMLImageElement>('img').src).toContain('icon_15208.png');
  await act(async () => { control('img').dispatchEvent(new Event('error')); });
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('svg')).not.toBeNull();
  await act(async () => { root.render(<EquipmentIcon slot="OffHandShield" iconId={14009} version="v490" />); });
  expect(control<HTMLImageElement>('img').src).toContain('icon_14009.png');
});

it.each(['Head', 'MainHand', 'Ring', 'OffHand'])('shows the selected %s name/icon once while retaining all expanded facts and actions', async slot => {
  const item = data.items.find(item => item.slot === slot && item.level === 90)!;
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.equipment = [{ slot, item: { kind: 'database', itemId: item.id }, candidateMods: [], sparks: { mode: 'none' } }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render(); await click(`[data-equipment-row="${slot}"] > summary`);
  const row = control(`[data-equipment-row="${slot}"]`);
  expect(row.querySelector('summary')!.textContent).toContain(item.displayName);
  expect(row.querySelectorAll('.equipment-icon')).toHaveLength(1);
  expect(row.querySelectorAll('.equipment-row-content .equipment-icon, .equipment-selection-heading, h3')).toHaveLength(0);
  expect(row.querySelector('.item-facts')).not.toBeNull();
  expect(row.querySelector('.item-requirements')).not.toBeNull();
  expect(row.querySelector('.item-more')).not.toBeNull();
  expect(row.querySelectorAll('.equipment-actions button')).toHaveLength(2);
});

it('searches both offhand types from one picker and confirms instance replacement before swapping, saving and reloading', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Psychology', level: 90 }; build.skillSlotB = { skillId: 'Deer', level: 80 };
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }]; build.abilityBarB = [{ abilityId: 'ability_1578', rank: null }];
  build.equipment = [{ slot: 'OffHand', item: { kind: 'imported', instance: { baseItemId: 'item_45722', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }] } }, candidateMods: [{ powerId: 'power_10001', tierId: 'id_9' }], sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 12, seed: 'retain' } } }];
  const bytes = JSON.stringify(build);
  localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  await render(); await browse('OffHand');
  await change('#equipment-search', 'item_45052');
  expect(control('dialog').textContent).toContain('Shield · OffHandShield');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('.equipment-result-heading button'); await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
  confirm.mockReturnValue(true);
  await click('.equipment-result-heading button'); await tick(); await remount();
  expect(draft().equipment).toEqual([{ ...build.equipment[0], slot: 'OffHandShield', item: { kind: 'database', itemId: 'item_45052' } }]);
  await browse('OffHand'); await change('#equipment-search', 'item_45722');
  expect(control('dialog').textContent).toContain('Offhand weapon · OffHand');
  await click('.equipment-result-heading button'); await tick(); await remount();
  expect(draft()).toEqual({ ...build, equipment: [{ ...build.equipment[0], item: { kind: 'database', itemId: 'item_45722' } }] });
  expect(confirm).toHaveBeenCalledTimes(2);
});

it('disables legacy conflict resolution in an incompatible read-only build', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: 'other' });
  build.equipment = ['OffHand', 'OffHandShield'].map(slot => ({ slot, item: { kind: 'database', itemId: slot === 'OffHand' ? 'item_45722' : 'item_45052' }, candidateMods: [], sparks: { mode: 'none' } }));
  const bytes = JSON.stringify(build); localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  await render(); await click('[data-equipment-row="OffHand"] > summary');
  expect([...container.querySelectorAll<HTMLButtonElement>('[data-equipment-row="OffHand"] .equipment-actions button')].every(button => button.disabled)).toBe(true);
  await tick(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
});

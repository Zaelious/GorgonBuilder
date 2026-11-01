import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultBuildDocument } from '../../core/build/document';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
vi.mock('../../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement;
let root: Root;
beforeAll(() => {
  data = loadPlannerFixture();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
    close: { configurable: true, value() { this.removeAttribute('open'); } },
  });
});
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  vi.mocked(loadGameDataRepository).mockReset().mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
function control<T extends HTMLElement = HTMLElement>(selector: string): T {
  const value = container.querySelector<T>(selector); if (!value) throw new Error(`Missing ${selector}`); return value;
}
async function click(selector: string) { await act(async () => control(selector).click()); }
async function change(selector: string, value: string) {
  const element = control<HTMLInputElement | HTMLSelectElement>(selector);
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
const render = async () => { await act(async () => root.render(<App />)); };
const tick = async (ms = 500) => { await act(async () => vi.advanceTimersByTime(ms)); };

const BRAMBLE = 'ability_5386';
function seed() {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Druid', level: 125 }; build.skillSlotB = { skillId: 'Archery', level: 90 };
  build.abilityBarA = [{ abilityId: BRAMBLE, rank: data.getAbility(BRAMBLE)!.rank }];
  build.equipment = [
    { slot: 'Head', item: { kind: 'imported', instance: { baseItemId: 'item_44030', existingPowers: [{ powerId: 'power_14159', tierId: 'id_25' }, { powerId: 'power_14001', tierId: 'id_12' }, { powerId: 'missing', tierId: 'x' }] } },
      candidateMods: [], sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Druid', count: 3, seed: 'keep' } } },
    { slot: 'Chest', item: { kind: 'database', itemId: 'item_42705' }, candidateMods: [{ powerId: 'power_14005', tierId: 'id_25' }, { powerId: 'power_14159', tierId: 'id_25' }, { powerId: 'power_14154', tierId: 'id_25' }], sparks: { mode: 'none' } },
  ];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); return build;
}
const inspect = () => click('.skill-panel:nth-child(1) .combat-slot:nth-child(1) .slot-button');
const rows = () => [...container.querySelectorAll<HTMLElement>('.relevant-mods [data-relevant-mod]')];

it('shows Brambleskin 13 facts, effects and an always-visible Relevant Mods section with only source-matched equipped mods', async () => {
  const build = seed(); await render(); await inspect();
  const popover = control('.ability-popover');
  expect(popover.querySelector('h3')!.textContent).toBe('Brambleskin 13');
  expect(control('.ability-effects').textContent).toContain('Melee Damagers Suffer 310 Nature damage');
  expect(control('.ability-effects').textContent).not.toMatch(/DelayedDamage|BuffActivated|per tick/u);
  expect(control('.technical-records').textContent).toContain('SpecialRules DelayedDamage');
  // Relevant Mods sits directly after the primary stats.
  expect(control('.ability-stats').nextElementSibling!.classList.contains('relevant-mods')).toBe(true);
  const section = control('.relevant-mods');
  expect(section.closest('details')).toBeNull();
  expect(section.querySelector('h4')!.textContent).toBe('Relevant Mods');
  // Head imported BrambleSkinMod, then Chest planned BrambleSkinMod and BrambleSkinMaxArmorBoostB. Identical effects stay separate.
  expect(rows().map(row => row.dataset.relevantMod)).toEqual(['0:imported:0', '1:planned:1', '1:planned:2']);
  expect(rows().map(row => row.querySelector('.relevant-effect')!.textContent)).toEqual([
    'Brambleskin deals +44% damage to melee attackers', 'Brambleskin deals +44% damage to melee attackers',
    'Brambleskin increases your Max Armor by +153 for 30 seconds and restores 153 Armor']);
  expect(rows().every(row => row.querySelector('img.effect-icon')!.getAttribute('src') === 'https://cdn.projectgorgon.com/v490/icons/icon_3483.png')).toBe(true);
  expect(rows()[0]!.querySelector('.relevant-source')!.textContent).toBe('Head · ◇ imported');
  expect(rows()[1]!.querySelector('.relevant-source')!.textContent).toBe('Chest');
  // Excluded: unrelated Druid indirect poison, skill-wide Druid base damage, unresolved saved IDs (retained).
  expect(section.textContent).not.toMatch(/Indirect Poison|Druid Skill Base Damage/u);
  await tick(); expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? JSON.stringify(build))).toEqual(build);
});

it('updates Relevant Mods immediately when planned mods, tiers or equipment change, and shows an empty state', async () => {
  seed(); await render();
  await click('[data-equipment-row="Chest"] > summary');
  await inspect();
  expect(rows()).toHaveLength(3);
  await click('[data-selection-index="1"] .mod-planner [aria-label="Remove candidate 3"]');
  await inspect();
  expect(rows().map(row => row.dataset.relevantMod)).toEqual(['0:imported:0', '1:planned:1']);
  await change('[data-selection-index="1"] .mod-planner [aria-label="Tier for candidate 2"]', 'id_1');
  await inspect();
  expect(rows()[1]!.querySelector('.relevant-effect')!.textContent).not.toBe(rows()[0]!.querySelector('.relevant-effect')!.textContent);
  await click('[data-selection-index="1"] .mod-planner [aria-label="Remove candidate 2"]');
  await inspect();
  expect(rows().map(row => row.dataset.relevantMod)).toEqual(['0:imported:0']);
  await tick();
  expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).equipment[1].candidateMods).toEqual([{ powerId: 'power_14005', tierId: 'id_25' }]);
});

it('says no ability-specific mods are identified when equipped gear has none for the ability', async () => {
  const build = seed(); build.equipment = [build.equipment[1]!]; build.equipment[0]!.candidateMods = [{ powerId: 'power_14005', tierId: 'id_25' }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await inspect();
  expect(rows()).toHaveLength(0);
  expect(control('.relevant-mods').textContent).toContain('No ability-specific equipped mods identified.');
});

it('shows Acid Arrow Damage +110% from MainHand under Acid Arrow 13 immediately, with compact stats and no zero-value DoTs', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Druid', level: 125 }; build.skillSlotB = { skillId: 'Archery', level: 125 };
  build.abilityBarB = [{ abilityId: 'ability_2627', rank: data.getAbility('ability_2627')!.rank }];
  build.equipment = [{ slot: 'MainHand', item: { kind: 'database', itemId: 'item_46107' }, candidateMods: [], sparks: { mode: 'none' } }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render();
  await click('[data-equipment-row="MainHand"] > summary');
  const main = '[data-selection-index="0"] .mod-planner';
  expect(control(`${main} [data-power-id="power_10302"]`).dataset.previewTier).toBe('id_25');
  await click(`${main} [data-power-id="power_10302"] > .available-effect`);
  const open = () => click('.skill-panel:nth-child(2) .combat-slot:nth-child(1) .slot-button');
  await open();
  expect(control('.ability-popover h3').textContent).toBe('Acid Arrow 13');
  const stats = Object.fromEntries([...container.querySelectorAll('.ability-stats > div')].map(row => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]));
  expect(stats).toMatchObject({ 'Min level': '125', 'Power cost': '70', Reuse: '10s', Range: '30', Damage: '529 Acid', 'Armor damage': '529 Acid' });
  expect(rows().map(row => [row.querySelector('.relevant-effect')!.textContent, row.querySelector('.relevant-source')!.textContent, row.dataset.powerId, row.dataset.tierId]))
    .toEqual([['Acid Arrow Damage +110%', 'MainHand', 'power_10302', 'id_25']]);
  expect(control('.ability-stats').nextElementSibling!.classList.contains('relevant-mods')).toBe(true);
  // Zero-value conditional DoTs are not shown as damage; exact values remain in Technical details.
  expect(container.querySelector('.ability-popover .ability-effects')).toBeNull();
  const visible = [...control('.ability-popover').children].filter(child => !child.matches('.technical-details')).map(child => {
    const clone = child.cloneNode(true) as HTMLElement; clone.querySelector('.technical-details')?.remove(); return clone.textContent; }).join(' ');
  expect(visible).not.toMatch(/0 Poison|per tick|BuffActivated|DelayedDamage/u);
  const technical = control('.ability-popover .technical-records').textContent!;
  expect(technical).toContain('DamagePerTick 0 · Poison · NumTicks 1 · Duration 6 s · SpecialRules BuffActivated, DelayedDamage');
  expect(technical).toContain('On Critical Hit: DamagePerTick 0 · Poison · NumTicks 6 · Duration 12 s · SpecialRules BuffActivated');
  expect(control<HTMLDetailsElement>('.ability-popover .technical-details').open).toBe(false);
  // Removing the staged mod updates the popover immediately.
  await click(`${main} [aria-label="Remove candidate 1"]`);
  await open();
  expect(rows()).toHaveLength(0);
  expect(control('.relevant-mods').textContent).toContain('No ability-specific equipped mods identified.');
  await tick(); expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).equipment[0].candidateMods).toEqual([]);
});

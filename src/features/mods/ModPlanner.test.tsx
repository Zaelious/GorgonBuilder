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
const saved = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as BuildDocument;
function seed() {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Archery', level: 90 }; build.skillSlotB = { skillId: 'Deer', level: 70 };
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }]; build.abilityBarB = [{ abilityId: 'ability_1578', rank: null }];
  build.notes = 'Keep'; build.target.count = 4;
  build.equipment = [{ slot: 'OffHandShield', item: { kind: 'imported', instance: { baseItemId: 'item_45052', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }], metadata: { keep: true } } }, candidateMods: [],
    sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 11, seed: 'keep' } } },
  { slot: 'Ring', item: { kind: 'database', itemId: 'item_49070' }, candidateMods: [], sparks: { mode: 'none' } }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); return build;
}
const scope = '[data-selection-index="0"]';
const editor = `${scope} .mod-planner`;
const search = (text: string) => change(`${editor} [aria-label="Search treasure powers"]`, text);
const target = (text: string) => change(`${editor} [aria-label="Mod target level"]`, text);
const open = () => click('[data-equipment-row="OffHand"] > summary');
const add = (id = 'power_10001') => click(`${editor} [data-power-id="${id}"] > .available-effect`);
async function remount() { await act(async () => root.unmount()); root = createRoot(container); await render(); await open(); }
/** The seeded Shield (profile Shield) does not list ArcheryBoost etc.; exploring shows other slots/profiles. */
const explore = () => click(`${editor} [title^="Explore powers"] input`);
const availableIds = (selector = editor) => [...container.querySelectorAll<HTMLElement>(`${selector} [data-power-id]`)].map(row => row.dataset.powerId!);
const DRUID_CHEST = ['power_14005', 'power_14012', 'power_14051', 'power_14052', 'power_14101', 'power_14154', 'power_14159', 'power_14201', 'power_14351', 'power_14501', 'power_14602'];
function seedChest(skillA: string | null, skillB: string | null = null) {
  const build = seed(); build.skillSlotA = { skillId: skillA, level: 100 }; build.skillSlotB = { skillId: skillB, level: 100 };
  build.abilityBarA = []; build.abilityBarB = [];
  build.equipment.push({ slot: 'Chest', item: { kind: 'database', itemId: 'item_42705' }, candidateMods: [], sparks: { mode: 'none' } });
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); return build;
}
const chest = '[data-selection-index="2"]';
const chestEditor = `${chest} .mod-planner`;

it('moves mods between Available and Selected with immediate STATS rows, >6 different exact candidates and non-destructive previews through autosave/reload', async () => {
  const original = seed(); await render(); await open();
  expect(container.querySelector('dialog')).toBeNull();
  expect(control<HTMLInputElement>(`${editor} [aria-label="Mod target level"]`).value).toBe('Max');
  await explore(); await search('power_10001');
  const preview = () => control(`${editor} [data-power-id="power_10001"]`);
  expect(preview().dataset.previewTier).toBe('id_12');
  expect(preview().querySelector('.available-effect')!.textContent).toContain('Archery Base Damage +60%');
  await add();
  // Mutually exclusive: the staged power leaves Available immediately and appears in Selected and STATS.
  expect(container.querySelector(`${editor} [data-power-id="power_10001"]`)).toBeNull();
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (1)');
  const row = control(`${scope} .item-stats [data-candidate-effect="0"]`);
  expect(row.querySelector('.stat-chip')!.textContent).toBe('Archery');
  expect(row.textContent).toBe('ArcheryArchery Base Damage +60%, Anatomy-Based Critical Hit Chance +4%');
  expect(control(scope).textContent).not.toContain('CANDIDATE');
  // Target changes never duplicate a staged power; its exact tier is retained and flagged.
  await target('90');
  expect(container.querySelector(`${editor} [data-power-id="power_10001"]`)).toBeNull();
  expect(control(`${editor} .mod-mismatch`).getAttribute('aria-label')).toBe('Differs from target preview');
  expect(control<HTMLSelectElement>(`${editor} [aria-label="Tier for candidate 1"]`).value).toBe('id_12');
  // Removing restores it to Available at the current target preview.
  await click(`${editor} [aria-label="Remove candidate 1"]`);
  expect(preview().dataset.previewTier).toBe('id_9');
  expect(container.querySelector(`${scope} .item-stats [data-candidate-effect]`)).toBeNull();
  await add();
  await search('');
  const expected = [{ powerId: 'power_10001', tierId: 'id_9' }];
  for (let n = 0; n < 7; n++) {
    const next = control(`${editor} [data-mod-group="Archery"] [data-power-id]`);
    expected.push({ powerId: next.dataset.powerId!, tierId: next.dataset.previewTier! });
    await click(`${editor} [data-mod-group="Archery"] [data-power-id] > .available-effect`);
  }
  expect(new Set(expected.map(mod => mod.powerId)).size).toBe(8);
  for (const mod of expected) expect(container.querySelector(`${editor} [data-power-id="${mod.powerId}"]`)).toBeNull();
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (8)');
  await change(`${editor} [aria-label="Tier for candidate 1"]`, 'id_11');
  expect(control(`${scope} [data-candidate-effect="0"]`).textContent).toContain('Archery Base Damage +55%');
  await click(`${editor} [aria-label="Move candidate 1 down"]`);
  await click(`${editor} [aria-label="Remove candidate 3"]`);
  await change(`${editor} [aria-label="Tier for candidate 2"]`, '');
  expect(control(`${scope} [data-candidate-effect="1"]`).textContent).toContain('No tier chosen');
  await tick(499); expect(saved()).toEqual(original);
  await tick(1);
  const next = saved();
  const final = [expected[1]!, { powerId: 'power_10001', tierId: null }, ...expected.slice(3)];
  expect(next.equipment[0]!.candidateMods).toEqual(final);
  expect({ ...next, equipment: [] }).toEqual({ ...original, equipment: [] });
  expect({ ...next.equipment[0], candidateMods: [] }).toEqual(original.equipment[0]);
  expect(next.equipment[1]).toEqual(original.equipment[1]);
  await remount();
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (7)');
  expect(control<HTMLInputElement>(`${editor} [aria-label="Mod target level"]`).value).toBe('Max');
  expect(control(`${scope} .item-stats [data-existing-power="0"]`).dataset.powerId).toBe('power_129');
  expect(control(`${scope} .item-stats [data-existing-power="0"]`).dataset.tierId).toBe('id_120');
  expect(saved()).toEqual(next);
});

it('shows one Available entry per official Druid power for a Chest, with Max/100 changing only previews', async () => {
  seedChest('Druid'); await render(); await click('[data-equipment-row="Chest"] > summary');
  const druid = () => availableIds(`${chestEditor} [data-mod-group="Druid"]`);
  expect(druid().sort()).toEqual(DRUID_CHEST);
  expect(new Set(druid()).size).toBe(11);
  const previews = () => Object.fromEntries([...container.querySelectorAll<HTMLElement>(`${chestEditor} [data-mod-group="Druid"] [data-power-id]`)].map(row => [row.dataset.powerId, row.dataset.previewTier]));
  const max = previews();
  expect(max.power_14005).toBe('id_25');
  expect(control(`${chestEditor} [data-power-id="power_14005"] .available-effect-text`).textContent).toBe('Indirect Poison Damage +58%');
  await change(`${chestEditor} [aria-label="Mod target level"]`, '100');
  expect(druid().sort()).toEqual(DRUID_CHEST);
  const hundred = previews();
  expect(hundred.power_14005).not.toBe(max.power_14005);
  const tier = data.getTreasureTier('power_14005', hundred.power_14005!)!;
  expect(tier.minLevel <= 100 && 100 <= tier.maxLevel).toBe(true);
  // Same-effect variants for other slots (e.g. BrambleSkinMaxArmorBoost on OffHand) are not repeated here.
  expect(druid()).not.toContain('power_14153');
  await click(`${chestEditor} [title^="Explore powers"] input`);
  expect(druid().length).toBe(65);
});

it('shows every fixed effect with readable official labels in one STATS panel, without an extra dropdown', async () => {
  seedChest('Druid'); await render(); await click('[data-equipment-row="Chest"] > summary');
  const rows = [...container.querySelectorAll<HTMLElement>(`${chest} .item-stats [data-stat-kind="base"]`)];
  expect(rows).toHaveLength(8);
  expect(rows.map(row => row.querySelector('.stat-text')!.textContent)).toEqual([
    'When wearing 3+ pieces of Fae Military armor, you gain +100% death avoidance (per 15 minutes)',
    'Max Armor +216', 'Vulnerability to Electricity -20%', 'Vulnerability to Darkness -20%', 'Vulnerability to Demonic -20%',
    'Health from Combat Refresh Abilities +45', 'Armor from Combat Refresh Abilities +45', 'Power from Combat Refresh Abilities +45']);
  expect(rows.every(row => row.querySelector('.stat-chip')!.textContent === 'Base')).toBe(true);
  expect(control(chest).textContent).not.toMatch(/more fixed effects|Vuln electricity|CANDIDATE/u);
  const details = control<HTMLDetailsElement>(`${chest} .item-facts > details.item-more`);
  expect(details.open).toBe(false);
  expect(details.textContent).toContain('{VULN_ELECTRICITY}{-0.2}');
  await click(`${chestEditor} [data-power-id="power_14005"] > .available-effect`);
  const planned = control(`${chest} .item-stats [data-candidate-effect="0"]`);
  expect(planned.querySelector('.stat-chip')!.textContent).toBe('Druid');
  expect(planned.querySelector('.stat-chip')!.classList.contains('stat-chip-planned')).toBe(true);
  expect(planned.textContent).toBe('DruidIndirect Poison Damage +58%');
  await click(`${chestEditor} [aria-label="Remove candidate 1"]`);
  expect(container.querySelector(`${chest} .item-stats [data-candidate-effect]`)).toBeNull();
});

it('clears only staged mods resolved to a departed skill, atomically, with undo and A=B protection', async () => {
  const build = seedChest('Druid', 'Druid');
  build.equipment[2]!.candidateMods = [{ powerId: 'power_14005', tierId: 'id_25' }, { powerId: 'power_101', tierId: 'id_1' },
    { powerId: 'power_30101', tierId: 'id_1' }, { powerId: 'missing-power', tierId: 'keep' }, { powerId: 'power_14154', tierId: null }];
  build.equipment[0]!.candidateMods = [{ powerId: 'power_14005', tierId: 'id_1' }, { powerId: 'power_129', tierId: 'id_120' }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render();
  // A=B=Druid: clearing one slot keeps Druid mods because the other slot still uses Druid.
  await change('#skill-A', ''); await tick();
  expect(saved().equipment).toEqual(build.equipment);
  expect(container.querySelector('.skill-change-notice p')).toBeNull();
  // Replacing the last Druid slot removes Druid mods everywhere, including collapsed items, in one edit.
  await change('#skill-B', 'Psychology');
  expect(control('.skill-change-notice').textContent).toContain('Removed 3 staged Druid mods from 2 items.');
  await tick(499); expect(saved().skillSlotB.skillId).toBe('Druid');
  await tick(1);
  const after = saved();
  expect(after.skillSlotB.skillId).toBe('Psychology');
  expect(after.equipment[2]!.candidateMods).toEqual([{ powerId: 'power_101', tierId: 'id_1' }, { powerId: 'power_30101', tierId: 'id_1' }, { powerId: 'missing-power', tierId: 'keep' }]);
  expect(after.equipment[0]!.candidateMods).toEqual([{ powerId: 'power_129', tierId: 'id_120' }]);
  expect(after.equipment[0]!.item).toEqual(build.equipment[0]!.item);
  expect(after.equipment[0]!.sparks).toEqual(build.equipment[0]!.sparks);
  expect(after.equipment[1]).toEqual(build.equipment[1]);
  expect({ ...after, skillSlotA: build.skillSlotA, skillSlotB: build.skillSlotB, equipment: build.equipment }).toEqual(build);
  // Undo restores the exact previous document, including the departed skill and every candidate.
  await click('.skill-change-notice button');
  await tick();
  expect(saved()).toEqual({ ...build, skillSlotA: { ...build.skillSlotA, skillId: null } });
  expect(container.querySelector('.skill-change-notice p')).toBeNull();
  // Removing the skill entirely also clears; any later edit retires the undo.
  await change('#skill-B', '');
  expect(control('.skill-change-notice').textContent).toContain('Removed 3 staged Druid mods');
  await change('#level-A', '90');
  expect(container.querySelector('.skill-change-notice p')).toBeNull();
  await tick(); await remount();
  expect(saved().equipment[2]!.candidateMods).toHaveLength(3);
});

it('leaves Available empty without combat skills and preserves saved candidates with no automatic write', async () => {
  const build = seed(); build.skillSlotA.skillId = null; build.skillSlotB.skillId = null;
  build.equipment[0]!.candidateMods = [{ powerId: 'power_10001', tierId: 'id_9' }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open();
  expect(control(`${editor} .mod-available`).textContent).toContain('Select a combat skill to view mods.');
  expect(container.querySelectorAll(`${editor} [data-power-id]`)).toHaveLength(0);
  expect(control(`${editor} .mod-selected`).textContent).toContain('Archery Base Damage +45%');
  await tick(); expect(saved()).toEqual(build);
});

it('updates unique skill groups for A+B/A+A', async () => {
  seed(); await render(); await open();
  // Official v490: no Archery power is in the Shield profile; 10 Deer OffHand powers are.
  expect(container.querySelectorAll(`${editor} [data-mod-group="Archery"]`)).toHaveLength(0);
  expect(container.querySelectorAll(`${editor} [data-mod-group="Deer"]`)).toHaveLength(1);
  await explore();
  expect(container.querySelectorAll(`${editor} [data-mod-group="Archery"]`)).toHaveLength(1);
  await change('#skill-B', 'Archery');
  expect(container.querySelectorAll(`${editor} [data-mod-group="Archery"]`)).toHaveLength(1);
  expect(container.querySelector(`${editor} [data-mod-group="Deer"]`)).toBeNull();
  await change('#skill-A', 'Cow');
  expect(container.querySelector(`${editor} [data-mod-group="Cow"]`)).not.toBeNull();
});

it('uses independent default-checked source-category toggles, supports broad search and does not save transient controls', async () => {
  const build = seedChest('Archery'); await render(); await click('[data-equipment-row="Chest"] > summary');
  const toggle = (n: number) => `${chestEditor} .mod-category-toggles label:nth-child(${n}) input`;
  for (const [n, id] of [[1, 'AnySkill'], [2, 'Endurance'], [3, 'ShamanicInfusion']] as const) {
    expect(control<HTMLInputElement>(toggle(n)).checked).toBe(true);
    expect(container.querySelector(`${chestEditor} [data-mod-group="${id}"]`)).not.toBeNull();
    await click(toggle(n)); expect(container.querySelector(`${chestEditor} [data-mod-group="${id}"]`)).toBeNull();
    expect(container.querySelector(`${chestEditor} [data-mod-group="Archery"]`)).not.toBeNull();
    await click(toggle(n));
  }
  expect(control(`${chestEditor} [data-mod-group="AnySkill"] h4`).textContent).toContain('association unknown');
  await click(toggle(4));
  for (const skill of ['Psychology', 'Cow', 'Unarmed']) { await change(`${chestEditor} [aria-label="Search treasure powers"]`, skill); expect(container.querySelectorAll(`${chestEditor} [data-power-id]`).length).toBeGreaterThan(0); }
  await change(`${chestEditor} [aria-label="Search treasure powers"]`, 'no-such-power'); expect(control(`${chestEditor} .mod-available`).textContent).toContain('No matching powers');
  await change(`${chestEditor} [aria-label="Mod target level"]`, '90'); await tick(); expect(saved()).toEqual(build);
});

it('makes overlapping tier options explicit and stages the exact alternative or null on request', async () => {
  seed(); await render(); await open(); await explore(); await target('90'); await search('power_10001');
  await click(`${editor} [data-power-id="power_10001"] > details > summary`); await tick(0);
  expect(control(`${editor} [data-power-id="power_10001"] > details > summary`).getAttribute('title')).toContain('3 preview tier options');
  expect(control(`${editor} .mod-association`).textContent).toBe('Skill: Archery');
  await click(`${editor} [data-tier-id="id_8"]`); await tick();
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'power_10001', tierId: 'id_8' }]);
  expect(container.querySelector(`${editor} [data-power-id="power_10001"]`)).toBeNull();
  await click(`${editor} [aria-label="Remove candidate 1"]`);
  await click(`${editor} [data-power-id="power_10001"] > details > summary`); await tick(0);
  await click(`${editor} [data-power-id="power_10001"] > details > button`); await tick();
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'power_10001', tierId: null }]);
});

it('retains unknown saved IDs and absent base/profile data until explicit candidate edits', async () => {
  const build = seed(); build.equipment[0]!.item = { kind: 'manual', instance: { baseItemId: null, existingPowers: [{ powerId: 'missing-existing', tierId: 'keep' }] } };
  build.equipment[0]!.candidateMods = [{ powerId: 'missing', tierId: 'keep' }, { powerId: 'power_10001', tierId: 'missing-tier' }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open();
  expect(control(`${editor} .mod-guidance`).textContent).toContain('publishes no treasure profile');
  expect(control(`${editor} .mod-available`).textContent).toContain('slot/profile filtering is off');
  expect(control(`${scope} .item-stats [data-existing-power="0"]`).textContent).toContain('missing-existing · Official power unavailable (retained)');
  expect(control<HTMLSelectElement>(`${editor} [aria-label="Tier for candidate 1"]`).value).toBe('keep');
  expect(control(`${editor} .mod-selected`).textContent).toContain('Official power unavailable');
  expect(control(`${editor} .mod-selected`).textContent).toContain('Official tier missing-tier unavailable for power_10001');
  await tick(); expect(saved()).toEqual(build);
  await change(`${editor} [aria-label="Tier for candidate 2"]`, 'id_1');
  await change(`${editor} [aria-label="Tier for candidate 1"]`, ''); await tick();
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'missing', tierId: null }, { powerId: 'power_10001', tierId: 'id_1' }]);
  expect(saved().equipment[0]!.item).toEqual(build.equipment[0]!.item);
});

it('renders legacy duplicate candidates faithfully and never adds another copy of a staged power', async () => {
  const build = seed(); build.equipment[0]!.candidateMods = [{ powerId: 'power_10001', tierId: 'id_9' }, { powerId: 'power_10001', tierId: 'id_12' }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open(); await explore(); await search('power_10001');
  expect(container.querySelector(`${editor} [data-power-id="power_10001"]`)).toBeNull();
  expect(container.querySelectorAll(`${scope} .item-stats [data-candidate-effect]`)).toHaveLength(2);
  await click(`${editor} [aria-label="Remove candidate 1"]`);
  expect(container.querySelector(`${editor} [data-power-id="power_10001"]`)).toBeNull();
  await click(`${editor} [aria-label="Remove candidate 1"]`);
  expect(container.querySelector(`${editor} [data-power-id="power_10001"]`)).not.toBeNull();
  await tick(); expect(saved().equipment[0]!.candidateMods).toEqual([]);
});

it.each(['AnySkill', 'Unknown'])('shows %s as unknown in expandable metadata and preserves exact source effects', async sourceId => {
  seed(); await render(); await open(); await explore();
  const power = data.treasurePowers.find(power => power.skill.sourceId === sourceId)!;
  await search(power.id);
  await click(`${editor} [data-power-id="${power.id}"] > details > summary`); await tick(0);
  expect(control(`${editor} .mod-association`).textContent).toContain(`${sourceId} — association unknown`);
  expect(control(`${editor} .mod-signals`).textContent).toContain('Selected skill: unknown');
  if (sourceId === 'Unknown') expect(control(`${editor} [data-power-id="${power.id}"]`).textContent).toContain('Published as unavailable');
});

it('allows target/metadata inspection but disables candidate edits for mismatched snapshots', async () => {
  const build = seed(); build.gameDataVersion = 'other'; build.equipment[0]!.candidateMods = [{ powerId: 'power_10001', tierId: 'id_1' }, { powerId: 'power_3001', tierId: null }];
  const bytes = JSON.stringify(build); localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  await render(); await open(); await explore(); await search('Archery'); await target('90');
  expect(container.querySelector(`${editor} [data-power-id="power_10001"]`)).toBeNull();
  expect(control<HTMLButtonElement>(`${editor} .available-effect`).disabled).toBe(true);
  expect([...container.querySelectorAll<HTMLButtonElement>(`${editor} .candidate-list button`)].every(button => button.disabled)).toBe(true);
  expect([...container.querySelectorAll<HTMLSelectElement>(`${editor} .candidate-list select`)].every(select => select.disabled)).toBe(true);
  await change('#skill-A', ''); await tick(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
});

it('retains legacy dual offhand entries and associated data while editing candidates inline', async () => {
  const build = seed(); build.equipment.push({ ...build.equipment[0]!, slot: 'OffHand', item: { kind: 'database', itemId: 'item_45722' } });
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open();
  await explore(); await search('power_10001'); await add(); await tick();
  expect(saved().equipment).toHaveLength(3); expect(saved().equipment[2]).toEqual(build.equipment[2]);
  expect(saved().equipment[0]!.item).toEqual(build.equipment[0]!.item);
  expect(control('[data-equipment-row="OffHand"]').textContent).toContain('Conflict');
});

it.each(['future-schema', 'read-failed'])('protects a %s draft from candidate writes', async mode => {
  seed(); const bytes = mode === 'future-schema' ? '{"schemaVersion":2,"future":true}' : localStorage.getItem(DRAFT_STORAGE_KEY)!;
  localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  const getItem = Storage.prototype.getItem;
  if (mode === 'read-failed') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) { if (key === DRAFT_STORAGE_KEY) throw new Error('blocked'); return getItem.call(this, key); });
  await render(); await click('[data-equipment-row="Ring"] > summary'); await click('[aria-label="Browse Ring items"]');
  expect(control<HTMLButtonElement>('.equipment-result-heading button').disabled).toBe(true);
  expect(container.querySelector('.mod-planner')).toBeNull();
  await tick(); expect(getItem.call(localStorage, DRAFT_STORAGE_KEY)).toBe(bytes);
});

it('keeps the last preview on invalid transient target input and does not edit the draft', async () => {
  const build = seed(); await render(); await open(); await explore(); await target('90'); await search('power_10001');
  for (const text of ['-1', '1.5', 'bad']) {
    await target(text); expect(control<HTMLInputElement>(`${editor} [aria-label="Mod target level"]`).getAttribute('aria-invalid')).toBe('true');
    expect(control(`${editor} [data-power-id="power_10001"]`).dataset.previewTier).toBe('id_9');
  }
  await tick(); expect(saved()).toEqual(build);
});

it('renders actual inline icon images in Available, Selected, STATS rows (planned and imported) and tier facts without raw markup in normal effects', async () => {
  const build = seed(); build.skillSlotA.skillId = 'AnimalHandling';
  build.equipment[0]!.item = { kind: 'imported', instance: { baseItemId: 'item_45052', existingPowers: [{ powerId: 'power_12301', tierId: 'id_12' }] } };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open(); await search('power_12301');
  const img = control<HTMLImageElement>(`${editor} .available-effect img`);
  expect(img.src).toBe('https://cdn.projectgorgon.com/v490/icons/icon_2160.png');
  expect(img.alt).toBe('Official effect icon 2160');
  expect(control(`${editor} .available-effect`).textContent).not.toContain('<icon=');
  await add('power_12301');
  for (const selector of [`${editor} .candidate-effect`, `${scope} .item-stats [data-candidate-effect]`, `${scope} .item-stats [data-existing-power]`]) {
    expect(control(selector).querySelector('img.effect-icon')).not.toBeNull();
  }
  await click(`${editor} [aria-label="Details and tier for candidate 1"]`);
  expect(control(`${editor} .mod-tier-facts`).querySelector('img.effect-icon')).not.toBeNull();
  await tick();
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'power_12301', tierId: 'id_25' }]);
});

it('renders paired Animal Handling attributes as one readable +25%/+25% effect in Available, Selected and STATS rows, saving exact IDs', async () => {
  const original = seed();
  original.skillSlotB = { skillId: 'AnimalHandling', level: 125 };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(original));
  await render(); await open(); await explore();
  await search('power_12192');
  const row = control(`${editor} [data-power-id="power_12192"]`);
  expect(row.dataset.previewTier).toBe('id_25');
  const expected = 'Direct Electricity Damage +25%, Fire Damage (Direct & Per-Tick) +25%';
  expect(row.querySelector('.available-effect-text')!.textContent).toBe(expected);
  expect(row.textContent).not.toMatch(/modifier|source value|context:|\{MOD_/u);
  await add('power_12192');
  expect(control(`${editor} .candidate-effect`).textContent).toBe(expected);
  expect(control(`${scope} [data-candidate-effect="0"]`).textContent).toBe(`Animal Handling${expected}`);
  expect(control(`${editor} .candidate-effect .effect-description`).getAttribute('title')).toContain('Requires Animal Handling active');
  await tick(500);
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'power_12192', tierId: 'id_25' }]);
  expect(saved().skillSlotB).toEqual({ skillId: 'AnimalHandling', level: 125 });
});

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

it('shows inline Available/Selected, immediate item effects, >6 exact candidates and non-destructive Max/90/100 previews through autosave/reload', async () => {
  const original = seed(); await render(); await open();
  expect(container.querySelector('dialog')).toBeNull();
  expect(control<HTMLInputElement>(`${editor} [aria-label="Mod target level"]`).value).toBe('Max');
  await search('power_10001');
  const preview = () => control(`${editor} [data-power-id="power_10001"]`);
  expect(preview().dataset.previewTier).toBe('id_12');
  expect(preview().querySelector('.available-effect')!.textContent).toContain('Archery Base Damage +60%');
  expect(preview().querySelector('.available-effect')!.textContent).not.toContain('{MOD_');
  await add();
  expect(control(`${scope} .equipment-candidate-effects`).textContent).toContain('CANDIDATE · Archery');
  expect(control(`${scope} [data-candidate-effect="0"]`).textContent).toContain('Archery Base Damage +60%');
  await target('90');
  expect(preview().dataset.previewTier).toBe('id_9');
  expect(control(`${editor} .mod-mismatch`).getAttribute('aria-label')).toBe('Differs from target preview');
  expect(control<HTMLSelectElement>(`${editor} [aria-label="Tier for candidate 1"]`).value).toBe('id_12');
  for (let n = 0; n < 7; n++) await add();
  await target('100'); expect(preview().dataset.previewTier).toBe('id_10');
  await add();
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (9)');
  await change(`${editor} [aria-label="Tier for candidate 1"]`, 'id_11');
  expect(control(`${scope} [data-candidate-effect="0"]`).textContent).toContain('Archery Base Damage +55%');
  await click(`${editor} [aria-label="Move candidate 1 down"]`);
  await click(`${editor} [aria-label="Remove candidate 3"]`);
  await change(`${editor} [aria-label="Tier for candidate 2"]`, '');
  expect(control(`${scope} [data-candidate-effect="1"]`).textContent).toContain('No tier chosen');
  await tick(499); expect(saved()).toEqual(original);
  await tick(1);
  const next = saved();
  expect(next.equipment[0]!.candidateMods).toEqual([{ powerId: 'power_10001', tierId: 'id_9' }, { powerId: 'power_10001', tierId: null },
    ...Array.from({ length: 5 }, () => ({ powerId: 'power_10001', tierId: 'id_9' })), { powerId: 'power_10001', tierId: 'id_10' }]);
  expect({ ...next, equipment: [] }).toEqual({ ...original, equipment: [] });
  expect({ ...next.equipment[0], candidateMods: [] }).toEqual(original.equipment[0]);
  expect(next.equipment[1]).toEqual(original.equipment[1]);
  await remount();
  expect(control(`${editor} .mod-selected h3`).textContent).toBe('Selected (8)');
  expect(control<HTMLInputElement>(`${editor} [aria-label="Mod target level"]`).value).toBe('Max');
  expect(control(`${scope} .existing-powers`).textContent).toContain('power_129 / id_120');
  expect(saved()).toEqual(next);
  await click(`${editor} [aria-label="Remove candidate 1"]`);
  expect(container.querySelectorAll(`${scope} [data-candidate-effect]`)).toHaveLength(7);
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

it('updates unique skill groups for A+B/A+A and skill changes without clearing candidates', async () => {
  const build = seed(); build.equipment[0]!.candidateMods = [{ powerId: 'power_10001', tierId: 'id_9' }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open();
  expect(container.querySelectorAll(`${editor} [data-mod-group="Archery"]`)).toHaveLength(1);
  expect(container.querySelectorAll(`${editor} [data-mod-group="Deer"]`)).toHaveLength(1);
  await change('#skill-B', 'Archery');
  expect(container.querySelectorAll(`${editor} [data-mod-group="Archery"]`)).toHaveLength(1);
  expect(container.querySelector(`${editor} [data-mod-group="Deer"]`)).toBeNull();
  await change('#skill-A', 'Cow');
  expect(container.querySelector(`${editor} [data-mod-group="Cow"]`)).not.toBeNull();
  await tick(); expect(saved().equipment).toEqual(build.equipment);
});

it('uses independent default-checked source-category toggles, supports broad search and does not save transient controls', async () => {
  const build = seed(); await render(); await open();
  const toggle = (n: number) => `${editor} .mod-category-toggles label:nth-child(${n}) input`;
  for (const [n, id] of [[1, 'AnySkill'], [2, 'Endurance'], [3, 'ShamanicInfusion']] as const) {
    expect(control<HTMLInputElement>(toggle(n)).checked).toBe(true);
    expect(container.querySelector(`${editor} [data-mod-group="${id}"]`)).not.toBeNull();
    await click(toggle(n)); expect(container.querySelector(`${editor} [data-mod-group="${id}"]`)).toBeNull();
    expect(container.querySelector(`${editor} [data-mod-group="Archery"]`)).not.toBeNull();
    await click(toggle(n));
  }
  expect(control(`${editor} [data-mod-group="AnySkill"] h4`).textContent).toContain('association unknown');
  await click(toggle(4));
  for (const skill of ['Psychology', 'Cow', 'Unarmed']) { await search(skill); expect(container.querySelectorAll(`${editor} [data-power-id]`).length).toBeGreaterThan(0); }
  await search('no-such-power'); expect(control(`${editor} .mod-available`).textContent).toContain('No matching powers');
  await target('90'); await tick(); expect(saved()).toEqual(build);
});

it('makes overlapping tier options explicit and stages the exact alternative or null on request', async () => {
  seed(); await render(); await open(); await target('90'); await search('power_10001');
  await click(`${editor} [data-power-id="power_10001"] > details > summary`); await tick(0);
  expect(control(`${editor} [data-power-id="power_10001"] > details > summary`).getAttribute('title')).toContain('3 preview tier options');
  expect(control(`${editor} .mod-association`).textContent).toBe('Skill: Archery');
  await click(`${editor} [data-tier-id="id_8"]`); await tick();
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'power_10001', tierId: 'id_8' }]);
  await click(`${editor} [data-power-id="power_10001"] > details > button`); await tick();
  expect(saved().equipment[0]!.candidateMods[1]).toEqual({ powerId: 'power_10001', tierId: null });
});

it('retains unknown saved IDs and absent base/profile data until explicit candidate edits', async () => {
  const build = seed(); build.equipment[0]!.item = { kind: 'manual', instance: { baseItemId: null, existingPowers: [{ powerId: 'missing-existing', tierId: 'keep' }] } };
  build.equipment[0]!.candidateMods = [{ powerId: 'missing', tierId: 'keep' }, { powerId: 'power_10001', tierId: 'missing-tier' }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open();
  expect(control(`${editor} .mod-guidance`).textContent).toContain('Item profile unknown');
  expect(control<HTMLSelectElement>(`${editor} [aria-label="Tier for candidate 1"]`).value).toBe('keep');
  expect(control(`${editor} .mod-selected`).textContent).toContain('Official power unavailable');
  expect(control(`${editor} .mod-selected`).textContent).toContain('Official tier missing-tier unavailable for power_10001');
  await tick(); expect(saved()).toEqual(build);
  await change(`${editor} [aria-label="Tier for candidate 2"]`, 'id_1');
  await change(`${editor} [aria-label="Tier for candidate 1"]`, ''); await tick();
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'missing', tierId: null }, { powerId: 'power_10001', tierId: 'id_1' }]);
  expect(saved().equipment[0]!.item).toEqual(build.equipment[0]!.item);
});

it.each(['AnySkill', 'Unknown'])('shows %s as unknown in expandable metadata and preserves exact source effects', async sourceId => {
  seed(); await render(); await open();
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
  await render(); await open(); await search('power_10001'); await target('90');
  expect(control<HTMLButtonElement>(`${editor} .available-effect`).disabled).toBe(true);
  expect([...container.querySelectorAll<HTMLButtonElement>(`${editor} .candidate-list button`)].every(button => button.disabled)).toBe(true);
  expect([...container.querySelectorAll<HTMLSelectElement>(`${editor} .candidate-list select`)].every(select => select.disabled)).toBe(true);
  await tick(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
});

it('retains legacy dual offhand entries and associated data while editing candidates inline', async () => {
  const build = seed(); build.equipment.push({ ...build.equipment[0]!, slot: 'OffHand', item: { kind: 'database', itemId: 'item_45722' } });
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open();
  await search('power_10001'); await add(); await tick();
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
  const build = seed(); await render(); await open(); await target('90'); await search('power_10001');
  for (const text of ['-1', '1.5', 'bad']) {
    await target(text); expect(control<HTMLInputElement>(`${editor} [aria-label="Mod target level"]`).getAttribute('aria-invalid')).toBe('true');
    expect(control(`${editor} [data-power-id="power_10001"]`).dataset.previewTier).toBe('id_9');
  }
  await tick(); expect(saved()).toEqual(build);
});

it('renders actual inline icon images in Available, Selected, CANDIDATE lines, saved powers and tier facts without raw markup in normal effects', async () => {
  const build = seed(); build.skillSlotA.skillId = 'AnimalHandling';
  build.equipment[0]!.item = { kind: 'imported', instance: { baseItemId: 'item_45052', existingPowers: [{ powerId: 'power_12301', tierId: 'id_12' }] } };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open(); await search('power_12301');
  const img = control<HTMLImageElement>(`${editor} .available-effect img`);
  expect(img.src).toBe('https://cdn.projectgorgon.com/v490/icons/icon_2160.png');
  expect(img.alt).toBe('Official effect icon 2160');
  expect(control(`${editor} .available-effect`).textContent).not.toContain('<icon=');
  await add('power_12301');
  for (const selector of [`${editor} .candidate-effect`, `${scope} .equipment-candidate-effects`, `${scope} .existing-powers`]) {
    expect(control(selector).querySelector('img.effect-icon')).not.toBeNull();
  }
  await click(`${editor} [aria-label="Details and tier for candidate 1"]`);
  expect(control(`${editor} .mod-tier-facts`).querySelector('img.effect-icon')).not.toBeNull();
  await tick();
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'power_12301', tierId: 'id_25' }]);
});

it('renders paired Animal Handling attributes as one readable +25%/+25% effect in Available, Selected and item CANDIDATE lines, saving exact IDs', async () => {
  const original = seed();
  original.skillSlotB = { skillId: 'AnimalHandling', level: 125 };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(original));
  await render(); await open();
  await search('power_12192');
  const row = control(`${editor} [data-power-id="power_12192"]`);
  expect(row.dataset.previewTier).toBe('id_25');
  const expected = 'Direct Electricity Damage +25%, Fire Damage (Direct & Per-Tick) +25%';
  expect(row.querySelector('.available-effect-text')!.textContent).toBe(expected);
  expect(row.textContent).not.toMatch(/modifier|source value|context:|\{MOD_/u);
  await add('power_12192');
  expect(control(`${editor} .candidate-effect`).textContent).toBe(expected);
  expect(control(`${scope} [data-candidate-effect="0"]`).textContent).toBe(`CANDIDATE · Animal Handling${expected}`);
  expect(control(`${editor} .candidate-effect .effect-description`).getAttribute('title')).toContain('Requires Animal Handling active');
  await tick(500);
  expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'power_12192', tierId: 'id_25' }]);
  expect(saved().skillSlotB).toEqual({ skillId: 'AnimalHandling', level: 125 });
});

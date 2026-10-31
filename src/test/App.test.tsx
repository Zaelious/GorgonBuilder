import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { createDefaultBuildDocument } from '../core/build/document';
import { loadGameDataRepository } from '../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../persistence/local/storage';
import { loadPlannerFixture } from './planner-fixture';
import { groupAbilities, highestTier } from '../features/abilities/groups';
import { abilityIconUrl } from '../features/abilities/AbilityIcon';

vi.mock('../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
const loader = vi.mocked(loadGameDataRepository);
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
  loader.mockReset().mockResolvedValue(data);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function render() { await act(async () => { root.render(<App />); }); }
function control<T extends HTMLElement>(selector: string) {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`Missing control: ${selector}`);
  return found;
}
async function change(selector: string, value: string) {
  const element = control<HTMLInputElement | HTMLSelectElement>(selector);
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function click(selector: string) { await act(async () => { control<HTMLButtonElement>(selector).click(); }); }
async function tick(ms = 500) { await act(async () => { vi.advanceTimersByTime(ms); }); }
const openPicker = (slot: 'A' | 'B') => click(`[aria-label="Open ability picker for bar ${slot}"]`);
const inspect = (slot: 'A' | 'B', index: number) => click(`.skill-panel:nth-child(${slot === 'A' ? 1 : 2}) .combat-slot:nth-child(${index}) .slot-button`);
const draft = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as ReturnType<typeof createDefaultBuildDocument>;

it('shows loading, then renders both empty slots without writing a draft', async () => {
  let resolve!: (value: typeof data) => void;
  loader.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  await render();
  expect(container.textContent).toContain('Loading official game data');
  await act(async () => { resolve(data); });
  expect(control<HTMLSelectElement>('#skill-A').value).toBe('');
  expect(control<HTMLSelectElement>('#skill-B').value).toBe('');
  expect(control('#bar-A').textContent).toContain('Combat bar A');
  expect(control('#bar-B').textContent).toContain('Combat bar B');
  await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
});

it.each([['Psychology', ''], ['Psychology', 'Deer'], ['Cow', 'Unarmed'], ['Psychology', 'Psychology']])('selects %s / %s and saves independent levels after 500 ms', async (a, b) => {
  await render();
  await change('#skill-A', a);
  await change('#skill-B', b);
  await change('#level-A', '90');
  await change('#level-B', '70');
  await tick(499);
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  await tick(1);
  expect(draft().skillSlotA).toEqual({ skillId: a, level: 90 });
  expect(draft().skillSlotB).toEqual({ skillId: b || null, level: 70 });
  expect(container.textContent).toContain('Saved in this browser');
});

it('adds chosen official ranks to separate bars, reorders, removes and restores on remount', async () => {
  await render();
  await change('#skill-A', 'Psychology');
  await change('#skill-B', 'Psychology');
  const groups = groupAbilities(data.getAbilitiesForSkill('Psychology'));
  const chosenA = highestTier(groups[0]!).id;
  const chosenB = groups[0]!.abilities[0]!.id;
  await openPicker('A');
  await click('.quick-add');
  await openPicker('A');
  await click('.quick-add');
  await openPicker('B');
  await click('.family summary');
  await click('.tier button');
  await openPicker('A');
  await click('.family:nth-child(2) .quick-add');
  const secondId = highestTier(groups[1]!).id;
  await inspect('A', 3);
  await click('[aria-label="Move entry 3 up in bar A"]');
  await inspect('A', 2);
  await click('[aria-label="Move entry 2 up in bar A"]');
  await inspect('A', 3);
  await click('[aria-label="Remove entry 3 from bar A"]');
  await tick();
  const saved = draft();
  expect(saved.abilityBarA).toEqual([secondId, chosenA].map(id => ({ abilityId: id, rank: data.getAbility(id)!.rank })));
  expect(saved.abilityBarB).toEqual([{ abilityId: chosenB, rank: data.getAbility(chosenB)!.rank }]);
  await act(async () => { root.unmount(); });
  root = createRoot(container);
  await render();
  expect(container.querySelectorAll('.skill-panel:first-child [aria-haspopup="dialog"]')).toHaveLength(2);
  expect(container.querySelectorAll('.skill-panel:nth-child(2) [aria-haspopup="dialog"]')).toHaveLength(1);
  expect(container.textContent).toContain('Local draft restored');
  expect(draft()).toEqual(saved);
});

it('searches names and descriptions without autosaving transient controls', async () => {
  await render();
  await change('#skill-search-A', 'psych');
  expect(control<HTMLSelectElement>('#skill-A').options).toHaveLength(2);
  await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  await change('#skill-A', 'Psychology');
  await tick();
  const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
  await openPicker('A');
  await change('#ability-search-A', 'no-such-ability');
  expect(container.textContent).toContain('No official abilities match');
  await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(saved);
});

it('retains incompatible selections visibly when A changes or clears, leaving B intact', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Psychology', level: 0 };
  build.skillSlotB = { skillId: 'Deer', level: 60 };
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }];
  build.abilityBarB = [{ abilityId: 'ability_1578', rank: null }];
  build.equipment = [{ slot: 'MainHand', item: { kind: 'database', itemId: 'item_45640' }, candidateMods: [], sparks: { mode: 'none' } }];
  build.target = { count: 5, damageTypes: {}, metadata: { retained: true } };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render();
  await change('#skill-A', 'Cow');
  await inspect('A', 1);
  expect(container.textContent).toContain('does not belong to the selected skill');
  await change('#skill-A', '');
  await tick();
  expect(draft().abilityBarA).toEqual(build.abilityBarA);
  expect(draft().abilityBarB).toEqual(build.abilityBarB);
  expect(draft().skillSlotB).toEqual(build.skillSlotB);
  expect(draft().equipment).toEqual(build.equipment);
  expect(draft().target).toEqual(build.target);
});

it('shows missing skill/ability IDs, rank and level mismatches without discarding saved data', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'missing-skill', level: 0 };
  const high = data.getAbilitiesForSkill('Psychology').find(a => a.level > 0)!;
  build.abilityBarA = [{ abilityId: 'missing-ability', rank: 3 }, { abilityId: high.id, rank: 'wrong-rank' }];
  const original = JSON.stringify(build);
  localStorage.setItem(DRAFT_STORAGE_KEY, original);
  await render();
  expect(container.textContent).toContain('Official skill missing-skill is unavailable');
  await inspect('A', 1);
  expect(container.textContent).toContain('Official ability missing-ability is unavailable');
  await inspect('A', 2);
  expect(container.textContent).toContain('Saved rank differs');
  expect(container.textContent).toContain('exceeds configured skill level 0');
  await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(original);
});

it.each(['{broken', JSON.stringify({ schemaVersion: 1, invalid: true })])('recovers malformed data safely and only overwrites after a build edit', async original => {
  localStorage.setItem(DRAFT_STORAGE_KEY, original);
  await render();
  expect(container.textContent).toContain('contains invalid data');
  await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(original);
  await change('#skill-A', 'Cow');
  await tick();
  expect(draft().skillSlotA.skillId).toBe('Cow');
});

it('protects future-schema drafts and makes fallback editing unavailable', async () => {
  const original = JSON.stringify({ schemaVersion: 999, title: 'Future work' });
  localStorage.setItem(DRAFT_STORAGE_KEY, original);
  await render();
  expect(container.textContent).toContain('protected from overwrite');
  expect(control('#skill-A').matches(':disabled')).toBe(true);
  await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(original);
});

it('retains the saved game-data version and disables edits for an unavailable snapshot', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: 'old-snapshot' });
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render();
  expect(container.textContent).toContain('original snapshot is unavailable');
  expect(control('#skill-A').matches(':disabled')).toBe(true);
  await tick();
  expect(draft().gameDataVersion).toBe('old-snapshot');
});

it('shows storage write failure and retries the retained pending save', async () => {
  await render();
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await change('#skill-A', 'Cow');
  await tick();
  expect(container.textContent).toContain('could not be saved');
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  setItem.mockRestore();
  const retry = [...container.querySelectorAll('button')].find(b => b.textContent === 'Retry saving')!;
  await act(async () => { retry.click(); });
  expect(draft().skillSlotA.skillId).toBe('Cow');
  expect(container.textContent).toContain('Saved in this browser');
});

it('reports blocked storage reads without blindly overwriting the unreadable draft', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  await render();
  expect(container.textContent).toContain('could not be read');
  expect(control('#skill-A').matches(':disabled')).toBe(true);
  await change('#skill-A', 'Cow');
  await tick();
  expect(writes).not.toHaveBeenCalled();
});

it('flushes pending edits on pagehide', async () => {
  await render();
  await change('#skill-A', 'Cow');
  await act(async () => { window.dispatchEvent(new Event('pagehide')); });
  expect(draft().skillSlotA.skillId).toBe('Cow');
});

it('shows load failure and retries successfully without modifying the draft', async () => {
  const original = '{preserve until editor change';
  localStorage.setItem(DRAFT_STORAGE_KEY, original);
  loader.mockRejectedValueOnce(new Error('network'));
  await render();
  expect(container.textContent).toContain('Game data could not be loaded');
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(original);
  await click('main button');
  expect(loader).toHaveBeenCalledTimes(2);
  expect(control('#skill-A')).toBeDefined();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(original);
});

it('keeps empty or invalid level text transient and restores the saved level on blur', async () => {
  await render();
  await change('#level-A', '85');
  await tick();
  const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
  for (const text of ['', '-1', '1.5']) {
    await change('#level-A', text);
    expect(control('#level-A').getAttribute('aria-invalid')).toBe('true');
    await tick();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(saved);
  }
  await act(async () => { control('#level-A').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(control<HTMLInputElement>('#level-A').value).toBe('85');
});

it('keeps the picker closed by default, shows six slots per bar and restores focus after cancel', async () => {
  await render();
  expect(container.querySelector('dialog')).toBeNull();
  expect(container.querySelectorAll('.combat-slot')).toHaveLength(12);
  await change('#skill-A', 'Psychology');
  const opener = control<HTMLButtonElement>('[aria-label="Open ability picker for bar A"]');
  opener.focus();
  await openPicker('A');
  expect(control<HTMLDialogElement>('dialog').open).toBe(true);
  expect(document.activeElement?.id).toBe('ability-search-A');
  await act(async () => { control('dialog').dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })); });
  expect(container.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it('searches official upgrade families, expands exact tiers and quick-adds the highest published level', async () => {
  await render();
  await change('#skill-A', 'Psychology');
  await openPicker('A');
  await change('#ability-search-A', 'ability_1201');
  expect(container.querySelectorAll('.family')).toHaveLength(1);
  const group = groupAbilities(data.getAbilitiesForSkill('Psychology')).find(g => g.abilities.some(a => a.id === 'ability_1201'))!;
  expect(control('.family summary').textContent).toContain(`${group.abilities.length} published tiers`);
  expect(control<HTMLDetailsElement>('.family details').open).toBe(false);
  await click('.family summary');
  expect(control<HTMLDetailsElement>('.family details').open).toBe(true);
  expect(container.querySelectorAll('.tier')).toHaveLength(group.abilities.length);
  expect(container.textContent).toContain('Target needs 50% more Rage');
  expect(container.textContent).toContain('Published base values');
  await click('.quick-add');
  await tick();
  const highest = highestTier(group);
  expect(draft().abilityBarA).toEqual([{ abilityId: highest.id, rank: highest.rank }]);
  expect(control('.slot-warning')).toBeDefined();
  await inspect('A', 1);
  expect(container.textContent).toContain(`Published level ${highest.level} exceeds configured skill level 0`);
});

it('selects an explicit lower tier with the original published string rank', async () => {
  await render();
  await change('#skill-A', 'BattleChemistry');
  await openPicker('A');
  await change('#ability-search-A', 'ability_1707');
  await click('.family summary');
  await click('[aria-label$="ability_1708"]');
  await tick();
  expect(draft().abilityBarA).toEqual([{ abilityId: 'ability_1708', rank: '2' }]);
});

it('enforces six additions, shows a full message and replaces an occupied slot without growing the bar', async () => {
  await render();
  await change('#skill-A', 'Psychology');
  for (let i = 0; i < 6; i++) { await openPicker('A'); await click('.quick-add'); }
  expect(container.textContent).toContain('Bar A is full');
  await openPicker('A');
  expect(control<HTMLButtonElement>('.quick-add').disabled).toBe(true);
  await click('[aria-label="Close ability picker"]');
  await inspect('A', 3);
  await click('.detail-actions button');
  const groups = groupAbilities(data.getAbilitiesForSkill('Psychology'));
  await click('.family:nth-child(2) .quick-add');
  await tick();
  expect(draft().abilityBarA).toHaveLength(6);
  expect(draft().abilityBarA[2]?.abilityId).toBe(highestTier(groups[1]!).id);
  expect(draft().abilityBarB).toEqual([]);
});

it('retains all overfull legacy entries and lets users remove excess entries explicitly', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Psychology', level: 90 };
  build.abilityBarA = Array.from({ length: 8 }, () => ({ abilityId: 'ability_1201', rank: null }));
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render();
  expect(container.textContent).toContain('Legacy draft has 8 abilities');
  expect(container.querySelectorAll('.skill-panel:first-child .combat-slot')).toHaveLength(8);
  await tick();
  expect(draft()).toEqual(build);
  await inspect('A', 8);
  await click('[aria-label="Remove entry 8 from bar A"]');
  await tick();
  expect(draft().abilityBarA).toHaveLength(7);
});

it('uses official versioned icons and falls back visibly for missing or broken images', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA.skillId = 'Psychology';
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }, { abilityId: 'missing', rank: null }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render();
  const image = control<HTMLImageElement>('.combat-slot img');
  expect(image.getAttribute('src')).toBe('https://cdn.projectgorgon.com/v490/icons/icon_2118.png');
  expect(container.querySelectorAll('[aria-label="Ability icon unavailable"]')).toHaveLength(1);
  await act(async () => { image.dispatchEvent(new Event('error')); });
  expect(container.querySelectorAll('[aria-label="Ability icon unavailable"]')).toHaveLength(2);
  expect(abilityIconUrl(null, 'v490')).toBeNull();
  expect(abilityIconUrl(-1, 'v490')).toBeNull();
  expect(abilityIconUrl(2118, '../bad')).toBeNull();
  expect(container.textContent).toContain('Elder Game, LLC');
});

it('opens equipped details on hover, focus and click, supports Escape and exposes published base facts', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA.skillId = 'Psychology';
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render();
  const trigger = control<HTMLButtonElement>('.slot-button');
  await act(async () => { trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
  expect(control('[role="dialog"]').textContent).toContain('Psychoanalyze');
  await act(async () => { trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); vi.advanceTimersByTime(150); });
  expect(container.querySelector('.ability-popover')).toBeNull();
  await act(async () => { trigger.focus(); });
  expect(control('[role="dialog"]').textContent).toContain('Base damage');
  expect(container.textContent).toContain('Power cost');
  expect(container.textContent).toContain('Reuse time');
  expect(container.textContent).toContain('Range');
  expect(container.textContent).toContain('Target needs 50% more Rage');
  await act(async () => { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(container.querySelector('.ability-popover')).toBeNull();
  await inspect('A', 1);
  await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
  expect(container.querySelector('.ability-popover')).toBeNull();
  await inspect('A', 1);
  await click('[aria-label="Close ability details"]');
  expect(container.querySelector('.ability-popover')).toBeNull();
});

it('keeps Tab and Shift+Tab inside the picker at the focus boundaries', async () => {
  await render();
  await change('#skill-A', 'Psychology');
  await openPicker('A');
  // jsdom has no layout; expose rendered rectangles for the focus-boundary check.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
  const first = control<HTMLButtonElement>('[aria-label="Close ability picker"]');
  const last = [...container.querySelectorAll<HTMLButtonElement>('.quick-add')].at(-1)!;
  await act(async () => { last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(first);
  await act(async () => { first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(last);
});


it('shows one equipped detail panel when switching between the independent bars', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA.skillId = 'Psychology';
  build.skillSlotB.skillId = 'Deer';
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }];
  build.abilityBarB = [{ abilityId: 'ability_1578', rank: null }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render();
  await inspect('A', 1);
  await inspect('B', 1);
  expect(container.querySelectorAll('.ability-popover')).toHaveLength(1);
  expect(control('.ability-popover').id).toBe('equipped-ability-detail-B');
  expect(draft()).toEqual(build);
});

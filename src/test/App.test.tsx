import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { createDefaultBuildDocument } from '../core/build/document';
import { loadGameDataRepository } from '../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../persistence/local/storage';
import { loadPlannerFixture } from './planner-fixture';

vi.mock('../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
const loader = vi.mocked(loadGameDataRepository);
let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement;
let root: Root;
beforeAll(() => { data = loadPlannerFixture(); });
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
const draft = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as ReturnType<typeof createDefaultBuildDocument>;

it('shows loading, then renders both empty slots without writing a draft', async () => {
  let resolve!: (value: typeof data) => void;
  loader.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  await render();
  expect(container.textContent).toContain('Loading official game data');
  await act(async () => { resolve(data); });
  expect(control<HTMLSelectElement>('#skill-A').value).toBe('');
  expect(control<HTMLSelectElement>('#skill-B').value).toBe('');
  expect(control('#bar-A').textContent).toContain('Ability bar A');
  expect(control('#bar-B').textContent).toContain('Ability bar B');
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
  const rankA = control<HTMLSelectElement>('select[id^="rank-A-"]');
  const rankB = control<HTMLSelectElement>('select[id^="rank-B-"]');
  const chosenA = rankA.options[rankA.options.length - 1]!.value;
  const chosenB = rankB.options[0]!.value;
  await change(`#${rankA.id}`, chosenA);
  await click('.ability-results button');
  await click('.ability-results button');
  const browserB = control('#browser-B').parentElement!;
  await act(async () => { browserB.querySelector<HTMLButtonElement>('.ability-results button')!.click(); });
  // Add a distinct second ability, then move it to the start of A.
  const cards = container.querySelectorAll<HTMLElement>('.skill-panel:first-child .ability-card');
  const secondId = cards[1]!.querySelector<HTMLSelectElement>('select')!.value;
  await act(async () => { cards[1]!.querySelector('button')!.click(); });
  await click('[aria-label="Move entry 3 up in bar A"]');
  await click('[aria-label="Move entry 2 up in bar A"]');
  await click('[aria-label="Remove entry 3 from bar A"]');
  await tick();
  const saved = draft();
  expect(saved.abilityBarA).toEqual([secondId, chosenA].map(id => ({ abilityId: id, rank: data.getAbility(id)!.rank })));
  expect(saved.abilityBarB).toEqual([{ abilityId: chosenB, rank: data.getAbility(chosenB)!.rank }]);
  await act(async () => { root.unmount(); });
  root = createRoot(container);
  await render();
  expect(container.querySelectorAll('.skill-panel:first-child .bar-entry')).toHaveLength(2);
  expect(container.querySelectorAll('.skill-panel:nth-child(2) .bar-entry')).toHaveLength(1);
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
  expect(container.textContent).toContain('Official ability missing-ability is unavailable');
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

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
  build.skillSlotA = { skillId: 'Psychology', level: 90 }; build.skillSlotB = { skillId: 'Deer', level: 70 };
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }]; build.abilityBarB = [{ abilityId: 'ability_1578', rank: null }];
  build.notes = 'Keep'; build.target.count = 4;
  build.equipment = [{ slot: 'OffHandShield', item: { kind: 'imported', instance: { baseItemId: 'item_45052', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }], metadata: { keep: true } } }, candidateMods: [],
    sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 11, seed: 'keep' } } },
  { slot: 'Ring', item: { kind: 'database', itemId: 'item_49070' }, candidateMods: [], sparks: { mode: 'none' } }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); return build;
}
async function open() {
  await click('[data-equipment-row="OffHand"] > summary');
  await click('[aria-label="Plan candidate mods for equipment 1"]');
}
const staged = () => click('dialog [aria-label="Mod planner views"] button:nth-child(2)');
it('stages many candidates, edits exact tiers, reorders/removes and restores through actual App autosave', async () => {
  const original = seed(); await render(); await open();
  expect(document.activeElement).toBe(control('#mod-search'));
  for (const powerId of ['power_4001', 'power_20001', 'power_3001']) {
    await change('#mod-search', powerId);
    expect(control('.mod-association').textContent).toBe(`Skill: ${data.getTreasurePower(powerId)!.skill.sourceId}`);
    await change(`[aria-label="Published tier for ${powerId}"]`, 'id_10');
    expect(control('dialog .mod-tier-facts').textContent).toContain(`${powerId} / id_10`);
    expect(control('dialog .mod-tier-facts').textContent).toContain(data.getTreasureTier(powerId, 'id_10')!.effectDescriptions[0]);
    await click(`[aria-label="Stage ${powerId}"]`);
  }
  await change('[aria-label="Published tier for power_3001"]', '');
  for (let n = 0; n < 9; n++) await click('[aria-label="Stage power_3001"]');
  expect(control('dialog [aria-label="Mod planner views"] button:nth-child(2)').textContent).toBe('Staged (12)');
  await staged();
  await change('dialog [aria-label="Tier for candidate 1"]', 'id_12');
  await click('dialog [aria-label="Move candidate 1 down"]');
  await click('dialog [aria-label="Remove candidate 3"]');
  await change('dialog [aria-label="Tier for candidate 2"]', '');
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(JSON.stringify(original));
  await tick(499); expect(saved()).toEqual(original);
  await tick(1);
  const next = saved();
  expect(next.equipment[0]!.candidateMods).toEqual([{ powerId: 'power_20001', tierId: 'id_10' }, { powerId: 'power_4001', tierId: null }, ...Array.from({ length: 9 }, () => ({ powerId: 'power_3001', tierId: null }))]);
  expect(next.equipment[0]!.item).toEqual(original.equipment[0]!.item);
  expect(next.equipment[0]!.sparks).toEqual(original.equipment[0]!.sparks);
  expect(next.equipment[0]!.slot).toBe('OffHandShield');
  expect(next.equipment[1]).toEqual(original.equipment[1]);
  expect({ ...next, equipment: [] }).toEqual({ ...original, equipment: [] });
  await click('[aria-label="Close mod planner"]');
  expect(document.activeElement).toBe(control('[aria-label="Plan candidate mods for equipment 1"]'));
  await act(async () => root.unmount()); root = createRoot(container); await render();
  await click('[data-equipment-row="OffHand"] > summary');
  expect(control('.equipment-candidates > summary').textContent).toBe('Staged candidates (11)');
  await click('.equipment-candidates > summary');
  expect(container.querySelectorAll('.equipment-candidates [data-mod-index]')).toHaveLength(11);
  expect(control('.existing-powers').textContent).toContain('power_129 / id_120');
  expect(saved()).toEqual(next);
});
it('supports broad browsing, pagination, no-match search and one-Escape focus return without saving', async () => {
  const build = seed(); await render(); await open();
  expect(control<HTMLSelectElement>('[aria-label="Power browsing"]').value).toBe('relevant');
  expect(container.querySelectorAll('.mod-power')).toHaveLength(10);
  await click('[aria-label="Power results pages"] button:last-child');
  expect(control('.mod-results-title').textContent).toContain('Page 2');
  await change('[aria-label="Power browsing"]', 'all');
  expect(control('.mod-results-title').textContent).toContain('Page 1');
  for (const skill of ['Psychology', 'Cow', 'Unarmed']) { await change('#mod-search', skill); expect(container.querySelectorAll('.mod-power').length).toBeGreaterThan(0); }
  await change('#mod-search', 'no such published power'); expect(container.textContent).toContain('No official powers match');
  await act(async () => control('#mod-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(container.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(control('[aria-label="Plan candidate mods for equipment 1"]'));
  await tick(); expect(saved()).toEqual(build);
});
it('retains unknown saved IDs and absent base/profile data until explicit candidate edits', async () => {
  const build = seed(); build.equipment[0]!.item = { kind: 'manual', instance: { baseItemId: null, existingPowers: [{ powerId: 'missing-existing', tierId: 'keep' }] } };
  build.equipment[0]!.candidateMods = [{ powerId: 'missing', tierId: 'keep' }, { powerId: 'power_4001', tierId: 'missing-tier' }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render(); await open();
  expect(container.textContent).toContain('Item profile relevance is unknown');
  await staged();
  expect(control<HTMLSelectElement>('dialog [aria-label="Tier for candidate 1"]').value).toBe('keep');
  expect(control<HTMLSelectElement>('dialog [aria-label="Tier for candidate 2"]').value).toBe('missing-tier');
  expect(control('dialog').textContent).toContain('Official power unavailable');
  expect(control('dialog').textContent).toContain('Official tier missing-tier unavailable for power_4001');
  await tick(); expect(saved()).toEqual(build);
  await change('dialog [aria-label="Tier for candidate 2"]', 'id_1');
  await change('dialog [aria-label="Tier for candidate 1"]', '');
  await tick(); expect(saved().equipment[0]!.candidateMods).toEqual([{ powerId: 'missing', tierId: null }, { powerId: 'power_4001', tierId: 'id_1' }]);
  expect(saved().equipment[0]!.item).toEqual(build.equipment[0]!.item);
});
it.each(['AnySkill', 'Unknown'])('shows %s as unknown, displays flags and preserves published effect text', async sourceId => {
  seed(); await render(); await open();
  const power = data.treasurePowers.find(power => power.skill.sourceId === sourceId)!;
  await change('#mod-search', power.id);
  expect(control('.mod-association').textContent).toContain(`${sourceId} — association unknown`);
  expect(control('.mod-signals').textContent).toContain('Selected skill: unknown');
  await change(`[aria-label="Published tier for ${power.id}"]`, power.tiers[0]!.id);
  expect(control('dialog .mod-tier-facts li').textContent).toBe(power.tiers[0]!.effectDescriptions[0]);
  if (sourceId === 'Unknown') expect(control('.mod-power').textContent).toContain('Published as unavailable');
});
it('allows inspection but blocks all candidate edits for version-mismatched drafts', async () => {
  const build = seed(); build.gameDataVersion = 'other'; build.equipment[0]!.candidateMods = [{ powerId: 'power_4001', tierId: 'id_1' }, { powerId: 'power_3001', tierId: null }];
  const bytes = JSON.stringify(build); localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  await render(); await open(); await change('#mod-search', 'power_4001');
  expect(control<HTMLButtonElement>('[aria-label="Stage power_4001"]').disabled).toBe(true);
  await change('[aria-label="Published tier for power_4001"]', 'id_12');
  expect(control('dialog .mod-tier-facts').textContent).toContain('id_12');
  await staged();
  expect([...container.querySelectorAll<HTMLButtonElement>('dialog .candidate-list button')].every(button => button.disabled)).toBe(true);
  expect([...container.querySelectorAll<HTMLSelectElement>('dialog .candidate-list select')].every(select => select.disabled)).toBe(true);
  await tick(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
});
it('keeps legacy dual offhand entries and associated powers unchanged during mod editing', async () => {
  const build = seed(); build.equipment.push({ ...build.equipment[0]!, slot: 'OffHand', item: { kind: 'database', itemId: 'item_45722' } });
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build)); await render(); await open();
  await change('#mod-search', 'power_4001'); await click('[aria-label="Stage power_4001"]'); await tick();
  expect(saved().equipment).toHaveLength(3);
  expect(saved().equipment[2]).toEqual(build.equipment[2]);
  expect(saved().equipment[0]!.item).toEqual(build.equipment[0]!.item);
  expect(control('[data-equipment-row="OffHand"]').textContent).toContain('Conflict');
});
it.each(['future-schema', 'read-failed'])('protects a %s draft from candidate writes', async mode => {
  seed(); const bytes = mode === 'future-schema' ? '{"schemaVersion":2,"future":true}' : localStorage.getItem(DRAFT_STORAGE_KEY)!;
  localStorage.setItem(DRAFT_STORAGE_KEY, bytes);
  const getItem = Storage.prototype.getItem;
  if (mode === 'read-failed') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) { if (key === DRAFT_STORAGE_KEY) throw new Error('blocked'); return getItem.call(this, key); });
  await render();
  expect(container.querySelector('[aria-label="Plan candidate mods for equipment 1"]')).toBeNull();
  await click('[data-equipment-row="Ring"] > summary'); await click('[aria-label="Browse Ring items"]');
  expect(control<HTMLButtonElement>('.equipment-result-heading button').disabled).toBe(true);
  await tick(); expect(getItem.call(localStorage, DRAFT_STORAGE_KEY)).toBe(bytes);
});

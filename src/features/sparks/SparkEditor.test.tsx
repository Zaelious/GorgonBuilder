import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultBuildDocument, type BuildDocument, type EquipmentSelection, type SparkConfiguration } from '../../core/build/document';
import { simulateSkillDamageSparks } from '../../core/sparks';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createSparkSeed } from './seed';

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
  localStorage.clear(); sessionStorage.clear();
  vi.mocked(loadGameDataRepository).mockReset().mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove(); vi.restoreAllMocks(); vi.useRealTimers();
});

const render = async () => { await act(async () => { root.render(<App />); }); };
async function remount() { await act(async () => { root.unmount(); }); root = createRoot(container); await render(); }
function control<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
const all = (selector: string) => [...container.querySelectorAll<HTMLElement>(selector)];
const click = async (selector: string) => { await act(async () => { control(selector).click(); }); };
async function change(selector: string, value: string) {
  const element = control<HTMLInputElement | HTMLSelectElement>(selector);
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
const tick = async () => { await act(async () => { vi.advanceTimersByTime(600); }); };
const draft = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as BuildDocument;
const db = (slot: string, itemId: string, sparks: SparkConfiguration = { mode: 'none' }): EquipmentSelection =>
  ({ slot, item: { kind: 'database', itemId }, candidateMods: [], sparks });
function simulated(count: number, seed: string) {
  const result = simulateSkillDamageSparks({ skill: 'Psychology', count, seed });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}
const MANUAL = { allDirectDamagePercent: 11, skillDamageFlat: 44, allDirectDamageFlat: 11, skillDamagePercent: 26, skillBaseDamagePercent: 18 };

function seedBuild(equipment: EquipmentSelection[], patch: Partial<BuildDocument> = {}) {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Psychology', level: 100 };
  build.skillSlotB = { skillId: 'Archery', level: 100 };
  build.abilityBarA = [{ abilityId: 'ability_6553', rank: null }];
  build.equipment = equipment;
  Object.assign(build, patch);
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  return build;
}
const standard = () => [db('MainHand', 'item_47068'), db('OffHand', 'item_52601'), db('Ring', 'item_49083'), db('Necklace', 'item_48150'), db('Head', 'item_44346')];
const row = (slot: string) => `[data-equipment-row="${slot}"]`;
async function openSparks(slot: string) {
  if (!control<HTMLDetailsElement>(row(slot)).open) await click(`${row(slot)} > summary`);
  const editor = control<HTMLDetailsElement>(`${row(slot)} .spark-editor`);
  if (!editor.open) await click(`${row(slot)} .spark-editor > summary`);
}
const mode = (slot: string, value: 'none' | 'simulated' | 'actual') => click(`${row(slot)} .spark-mode input[value="${value}"]`);
const outcomeCount = (slot: string, key: string) => control(`${row(slot)} tr[data-outcome="${key}"] td`).textContent;

describe('T0015 Mastery Spark editor', () => {
  it('appears collapsed only for the four offensive positions and summarizes an empty configuration', async () => {
    seedBuild(standard());
    await render();
    for (const slot of ['MainHand', 'OffHand', 'Ring', 'Necklace']) {
      await click(`${row(slot)} > summary`);
      const editor = control<HTMLDetailsElement>(`${row(slot)} .spark-editor`);
      expect(editor.open).toBe(false);
      expect(control(`${row(slot)} [data-spark-summary]`).textContent).toBe('None');
    }
    await click(`${row('Head')} > summary`);
    expect(container.querySelector(`${row('Head')} .spark-editor`)).toBeNull();
  });

  it('simulates 110 Sparks by default, reproduces them from the saved seed, rerolls without touching other gear and survives refresh', async () => {
    seedBuild(standard());
    await render();
    await openSparks('Ring');
    await mode('Ring', 'simulated'); await tick();
    const saved = draft().equipment[2]!.sparks;
    if (saved.mode !== 'simulated') throw new Error('Expected simulated Sparks');
    expect(saved.input).toMatchObject({ category: 'skill-damage', skillId: 'Psychology', count: 110 });
    expect(saved.input.seed).toMatch(/^[0-9a-f]{16}$/u);
    const expected = simulateSkillDamageSparks({ skill: 'Psychology', count: 110, seed: saved.input.seed });
    expect(expected.ok && saved.result).toEqual(expected.ok && expected.value);
    expect(control(`${row('Ring')} [data-spark-total]`).textContent).toBe('110 / 110');
    expect(outcomeCount('Ring', 'skillBaseDamagePercent')).toBe(String(saved.result!.outcomeCounts.skillBaseDamagePercent));
    expect(control(`${row('Ring')} tr[data-outcome="skillBaseDamagePercent"] td:last-child`).textContent).toBe(`+${saved.result!.outcomeCounts.skillBaseDamagePercent * 3}%`);
    expect(control(`${row('Ring')} [data-spark-summary]`).textContent).toBe('Psychology · 110 simulated');
    expect(control(`${row('Ring')} > summary small`).textContent).toContain('110 Sparks');
    expect(control(`${row('Ring')} .spark-seed`).textContent).toBe(`Seed ${saved.input.seed}`);
    // Expected averages are separate and analytical.
    expect(control(`${row('Ring')} [data-expected-outcome="skillBaseDamagePercent"]`).textContent).toContain('+52.8%');
    expect(control(`${row('Ring')} .spark-expected`).textContent).toContain('not a guaranteed result');

    const others = JSON.stringify(draft().equipment.filter((_, index) => index !== 2));
    await click(`${row('Ring')} .spark-reroll`); await tick();
    const rerolled = draft().equipment[2]!.sparks;
    if (rerolled.mode !== 'simulated') throw new Error('Expected simulated Sparks');
    expect(rerolled.input.seed).not.toBe(saved.input.seed);
    const reproduced = simulateSkillDamageSparks({ skill: 'Psychology', count: 110, seed: rerolled.input.seed });
    expect(reproduced.ok && rerolled.result).toEqual(reproduced.ok && reproduced.value);
    expect(JSON.stringify(draft().equipment.filter((_, index) => index !== 2))).toBe(others);

    const before = localStorage.getItem(DRAFT_STORAGE_KEY);
    await remount(); await openSparks('Ring');
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(before);
    expect(control(`${row('Ring')} .spark-seed`).textContent).toBe(`Seed ${rerolled.input.seed}`);
    expect(outcomeCount('Ring', 'skillDamageFlat')).toBe(String(rerolled.result!.outcomeCounts.skillDamageFlat));
  });

  it('changes the count with the same seed and refuses invalid counts', async () => {
    seedBuild([db('Ring', 'item_49083', { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 110, seed: 'fixed' },
      result: simulated(110, 'fixed') })]);
    await render(); await openSparks('Ring');
    const countInput = `${row('Ring')} .spark-field input`;
    await change(countInput, '25'); await tick();
    const next = draft().equipment[0]!.sparks;
    expect(next.mode === 'simulated' && next.input).toEqual({ category: 'skill-damage', skillId: 'Psychology', count: 25, seed: 'fixed' });
    expect(control(`${row('Ring')} [data-spark-total]`).textContent).toBe('25 / 25');
    const bytes = localStorage.getItem(DRAFT_STORAGE_KEY);
    for (const invalid of ['111', '-1', '2.5', '']) {
      await change(countInput, invalid); await tick();
      expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
      expect(control(countInput).getAttribute('aria-invalid')).toBe('true');
    }
    await act(async () => { control(countInput).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(control<HTMLInputElement>(countInput).value).toBe('25');
  });

  it('enters actual results without RNG, rejects totals above 110 and immediately updates Mock damage', async () => {
    sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1');
    seedBuild(standard().filter(selection => selection.slot !== 'Head')); // no other Psychology damage gear
    await render();
    const mockHit = async () => {
      await click('.skill-panel:nth-child(1) .combat-slot:nth-child(1) .slot-button');
      const text = control('.ability-popover .result-row[data-component="health-specific"] dd').textContent;
      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      return text;
    };
    expect(await mockHit()).toContain('178 Psychic');
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues');
    await openSparks('Ring');
    await mode('Ring', 'actual'); await tick();
    expect(draft().equipment[2]!.sparks).toEqual({ mode: 'actual', category: 'skill-damage', skillId: 'Psychology',
      outcomeCounts: { allDirectDamagePercent: 0, skillDamageFlat: 0, allDirectDamageFlat: 0, skillDamagePercent: 0, skillBaseDamagePercent: 0 } });
    for (const [key, value] of Object.entries(MANUAL)) await change(`${row('Ring')} tr[data-outcome="${key}"] input`, String(value));
    await tick();
    expect(random).not.toHaveBeenCalled();
    expect(draft().equipment[2]!.sparks).toEqual({ mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: MANUAL });
    expect(control(`${row('Ring')} [data-spark-total]`).textContent).toBe('110 / 110');
    expect(control(`${row('Ring')} tr[data-outcome="allDirectDamagePercent"] td:last-child`).textContent).toBe('+5.5%');
    expect(control(`${row('Ring')} tr[data-outcome="skillBaseDamagePercent"] td:last-child`).textContent).toBe('+54%');
    // 178 + 44 + 11 = 233; + 233 × 0.315 = 73.395; + 178 × 0.54 = 96.12 → 402.515
    expect(await mockHit()).toContain('402.52 Psychic');

    const bytes = localStorage.getItem(DRAFT_STORAGE_KEY);
    await change(`${row('Ring')} tr[data-outcome="skillDamageFlat"] input`, '45'); await tick();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
    expect(control(`${row('Ring')} .spark-error`).textContent).toBe('Total 111 is over 110. Not saved.');
    await change(`${row('Ring')} tr[data-outcome="skillDamageFlat"] input`, '1.5'); await tick();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
    // Leaving the group restores the saved values.
    await act(async () => { control(`${row('Ring')} tr[data-outcome="skillDamageFlat"] input`).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(control<HTMLInputElement>(`${row('Ring')} tr[data-outcome="skillDamageFlat"] input`).value).toBe('44');

    // Switching modes is explicit; returning to Actual restores the manual entries for this item.
    await mode('Ring', 'simulated'); await tick();
    expect(draft().equipment[2]!.sparks.mode).toBe('simulated');
    await mode('Ring', 'actual'); await tick();
    expect(draft().equipment[2]!.sparks).toEqual({ mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: MANUAL });
    await remount();
    expect(draft().equipment[2]!.sparks).toEqual({ mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: MANUAL });
    await openSparks('Ring'); await mode('Ring', 'none'); await tick();
    expect(draft().equipment[2]!.sparks).toEqual({ mode: 'none' });
    expect(await mockHit()).toContain('178 Psychic');
  });

  it('keeps an inactive skill\'s Sparks visible and unapplied, and offers only active combat skills', async () => {
    seedBuild([db('Ring', 'item_49083', { mode: 'actual', category: 'skill-damage', skillId: 'Cow', outcomeCounts: MANUAL })]);
    await render(); await openSparks('Ring');
    expect(control(`${row('Ring')} [data-spark-summary]`).textContent).toBe('Cow · 110 actual · inactive');
    expect(control(`${row('Ring')} .spark-notice`).textContent).toContain('Cow is not an active skill');
    expect([...control<HTMLSelectElement>(`${row('Ring')} .spark-field select`).options].map(o => o.textContent)).toEqual(['Cow (inactive)', 'Psychology', 'Archery']);
    await change(`${row('Ring')} .spark-field select`, 'Archery'); await tick();
    expect(draft().equipment[0]!.sparks).toEqual({ mode: 'actual', category: 'skill-damage', skillId: 'Archery', outcomeCounts: MANUAL });
    expect(control(`${row('Ring')} tr[data-outcome="skillDamageFlat"] th`).textContent).toContain('+1 Archery Damage');
  });

  it('explains missing active skills and disables Spark modes until one is selected', async () => {
    seedBuild([db('Ring', 'item_49083')], { skillSlotA: { skillId: null, level: 0 }, skillSlotB: { skillId: null, level: 0 }, abilityBarA: [] });
    await render(); await openSparks('Ring');
    expect(control(`${row('Ring')} .spark-note`).textContent).toBe('Select a combat skill to configure Skill Damage Sparks.');
    expect(control<HTMLInputElement>(`${row('Ring')} .spark-mode input[value="simulated"]`).disabled).toBe(true);
    expect(control<HTMLInputElement>(`${row('Ring')} .spark-mode input[value="actual"]`).disabled).toBe(true);
  });

  it('disables every control in a read-only draft and writes nothing', async () => {
    const build = seedBuild([db('Ring', 'item_49083', { mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: MANUAL })]);
    build.gameDataVersion = 'other'; localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
    const bytes = localStorage.getItem(DRAFT_STORAGE_KEY);
    await render(); await openSparks('Ring');
    expect(all(`${row('Ring')} .spark-editor input, ${row('Ring')} .spark-editor select, ${row('Ring')} .spark-editor button`).every(e => e.matches(':disabled'))).toBe(true);
    await act(async () => { control<HTMLInputElement>(`${row('Ring')} .spark-mode input[value="none"]`).click(); }); await tick();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
  });

  it('confirms before replacing an item with Sparks and clears them, never transferring them to the new item', async () => {
    seedBuild([db('Ring', 'item_49083', { mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: MANUAL })]);
    await render();
    await click(`${row('Ring')} > summary`);
    const bytes = localStorage.getItem(DRAFT_STORAGE_KEY);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click(`[data-equipment-slot="Ring"] .equipment-actions button`);
    await change('#equipment-search', 'item_49120');
    await click('.equipment-result-heading button'); await tick();
    expect(confirm.mock.calls[0]![0]).toContain('Mastery Spark settings belong to the replaced item and will be cleared');
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
    confirm.mockReturnValue(true);
    await click('.equipment-result-heading button'); await tick();
    expect(draft().equipment).toEqual([db('Ring', 'item_49120')]);
  });

  it('does not offer Spark editing on conflicting legacy offhand entries and keeps their saved settings', async () => {
    const sparks: SparkConfiguration = { mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: MANUAL };
    seedBuild([db('OffHand', 'item_52601', sparks), db('OffHandShield', 'item_45052', sparks)]);
    await render(); await click(`${row('OffHand')} > summary`);
    const editors = all(`${row('OffHand')} .spark-editor`);
    expect(editors).toHaveLength(2);
    for (const editor of editors) {
      expect(editor.querySelector('[data-spark-summary]')!.textContent).toBe('Not applied');
      expect(editor.querySelector<HTMLInputElement>('.spark-mode input[value="actual"]')!.disabled).toBe(false); // current mode stays shown
      expect(editor.querySelector<HTMLInputElement>('.spark-mode input[value="simulated"]')!.disabled).toBe(true);
      expect([...editor.querySelectorAll<HTMLInputElement>('tbody input')].every(input => input.disabled)).toBe(true);
    }
    expect(editors[1]!.querySelector('.spark-note')!.textContent).toContain('shield eligibility is unconfirmed');
  });

  it('treasure-mod edits leave Spark settings untouched', async () => {
    const sparks: SparkConfiguration = { mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: MANUAL };
    seedBuild([db('Ring', 'item_49083', sparks)]);
    await render(); await click(`${row('Ring')} > summary`);
    await click(`${row('Ring')} .mod-available-power .available-effect`); await tick();
    expect(draft().equipment[0]!.candidateMods).toHaveLength(1);
    expect(draft().equipment[0]!.sparks).toEqual(sparks);
  });

  it('createSparkSeed always changes the seed on reroll', () => {
    const constant = { getRandomValues: <T extends ArrayBufferView | null>(array: T) => { (array as unknown as Uint32Array).fill(7); return array; } };
    const first = createSparkSeed(undefined, constant);
    expect(first).toBe('0000000700000007');
    expect(createSparkSeed(first, constant)).not.toBe(first);
  });
});

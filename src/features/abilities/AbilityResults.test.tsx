import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { BuildDocument } from '../../core/build/document';
import { psychologyFixture } from '../../core/calculation/fixtures';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { groupAbilities, highestTier, quickAddTier, type Ability, type AbilityGroup } from './groups';
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
  vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
  vi.mocked(loadGameDataRepository).mockReset().mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });

function control<T extends HTMLElement = HTMLElement>(selector: string): T {
  const value = container.querySelector<T>(selector); if (!value) throw new Error(`Missing ${selector}`); return value;
}
async function click(selector: string | HTMLElement) { await act(async () => (typeof selector === 'string' ? control(selector) : selector).click()); }
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
const draft = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as BuildDocument;
const inspect = (bar: 1 | 2, slot = 1) => click(`.skill-panel:nth-child(${bar}) .combat-slot:nth-child(${slot}) .slot-button`);
const results = () => control('.ability-popover .ability-results');
/** `dt: dd` text; the visual colon is CSS-generated. */
const rowText = (component: string) => [...results().querySelectorAll<HTMLElement>(`.result-row[data-component="${component}"]`)]
  .map(r => `${r.querySelector('dt')!.textContent}:${r.querySelector('dd')!.textContent}`);

const MOCK = 'ability_6553'; // Mock 11, Psychic HealthSpecificDamage 178
const MULTISHOT = 'ability_2328'; // Multishot 8, Piercing, published AoE

function seed(mutate: (build: BuildDocument) => void = () => {}) {
  const build = psychologyFixture(data.gameDataVersion);
  build.skillSlotB = { skillId: 'Archery', level: 90 };
  build.abilityBarA = [{ abilityId: MOCK, rank: data.getAbility(MOCK)!.rank }];
  build.abilityBarB = [{ abilityId: MULTISHOT, rank: data.getAbility(MULTISHOT)!.rank }];
  mutate(build);
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  return build;
}

describe('T0014 Damage analysis toggle', () => {
  it('is off by default: facts, Relevant Mods and bar controls remain; no damage UI or target dummy', async () => {
    seed(); await render();
    const toggle = control<HTMLInputElement>('.damage-analysis-toggle input');
    expect(toggle.checked).toBe(false);
    expect(container.querySelector('.target-dummy')).toBeNull();
    await inspect(1);
    expect(container.querySelector('.ability-popover .ability-results')).toBeNull();
    expect(control('.ability-popover .ability-stats').textContent).toContain('178 Psychic');
    expect(container.querySelector('.ability-popover .relevant-mods')).not.toBeNull();
    expect(container.querySelector('.ability-popover .bar-edit-actions')).not.toBeNull();
    expect(container.querySelector('.ability-popover .remove-ability')).not.toBeNull();
  });

  it('turns on calculation UI, survives popover reopening and remount in the session, and never touches the build', async () => {
    const saved = seed(); await render();
    await click('.damage-analysis-toggle input');
    expect(sessionStorage.getItem('gorgonbuilder.session.damage-analysis')).toBe('1');
    expect(container.querySelector('.target-dummy')).not.toBeNull();
    await inspect(1);
    expect(container.querySelector('.ability-popover .ability-results')).not.toBeNull();
    await inspect(2); await inspect(1);
    expect(container.querySelector('.ability-popover .ability-results')).not.toBeNull();
    await act(async () => root.unmount()); root = createRoot(container); await render();
    expect(control<HTMLInputElement>('.damage-analysis-toggle input').checked).toBe(true);
    await tick();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(JSON.stringify(saved));
    await click('.damage-analysis-toggle input');
    expect(sessionStorage.getItem('gorgonbuilder.session.damage-analysis')).toBeNull();
    expect(container.querySelector('.target-dummy')).toBeNull();
  });
});

describe('T0014 ability results in the popover', () => {
  beforeEach(() => { sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1'); });
  it('shows the provisional normal hit, critical limitation and a collapsed ordered breakdown without a confidence badge', async () => {
    seed(); await render(); await inspect(1);
    const section = results();
    expect(section.querySelector('h4')!.textContent).toBe('Damage');
    expect(section.querySelector('.confidence-badge')).toBeNull();
    expect(section.dataset.confidence).toBe('unknown');
    expect(rowText('health-specific')).toEqual(['Health hit:526.7 Psychic']);
    expect(section.textContent).toContain('Critical hitNot modeled');
    expect(control('.result-limits').textContent).toBe('Not included: special ability rules');
    expect(control('.result-build-limits').textContent).toBe('Across build: 11 unmodeled effects; relevance to this ability is unknown.');
    // Simple by default: math is on demand, after the visible values and before Relevant Mods.
    const breakdown = control<HTMLDetailsElement>('.calc-breakdown');
    expect(breakdown.open).toBe(false);
    expect(section.compareDocumentPosition(control('.ability-popover .relevant-mods')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click('.calc-breakdown summary');
    const steps = [...breakdown.querySelectorAll<HTMLElement>('.calc-step')];
    expect(steps.map(s => s.dataset.category)).toEqual(['original-base', 'all-direct-damage-flat', 'all-direct-damage-flat',
      'skill-base-damage-percent', 'skill-base-damage-percent']);
    expect(steps.map(s => s.querySelector('.calc-step-total')!.textContent)).toEqual(['178', '353', '411', '446.6', '526.7']);
    expect(steps[1]!.textContent).toContain('Ring item effect · +175');
    expect(steps[4]!.textContent).toContain('Head planned mod · +45% of base 178');
    expect(steps[4]!.getAttribute('title')).toContain('basis is the original published base only');
    expect(breakdown.textContent).toContain('Assumptions');
    expect(breakdown.textContent).toContain('Unmodeled build effects (11)');
    expect(breakdown.querySelectorAll('[data-warning="critical-unavailable"]')).toHaveLength(1);
  });

  it('recalculates the card and explains the delta when one item is removed', async () => {
    seed(); await render(); await inspect(1);
    expect(rowText('health-specific')).toEqual(['Health hit:526.7 Psychic']);
    const ring = [...container.querySelectorAll<HTMLDetailsElement>('.has-equipment')].find(row => row.querySelector('summary')!.textContent!.startsWith('Ring'))!;
    await click(ring.querySelector('summary')!);
    await click(ring.querySelector<HTMLElement>('.equipment-actions button:nth-child(2)')!);
    await tick();
    expect(draft().equipment.some(e => e.slot === 'Ring')).toBe(false);
    await inspect(1);
    expect(rowText('health-specific')).toEqual(['Health hit:351.7 Psychic']);
    await click('.calc-breakdown summary');
    expect([...container.querySelectorAll('.calc-step-total')].map(s => s.textContent)).toEqual(['178', '236', '271.6', '351.7']);
  });

  it('applies target count and damage-type modifiers only to relevant stages and saves them in BuildDocument v1', async () => {
    seed(); await render();
    expect(control<HTMLInputElement>('#target-count').value).toBe('1');
    await change('#target-count', '3');
    await tick();
    expect(draft().target).toEqual({ count: 3, damageTypes: {} });

    // Published Burst (AoE 30): all 3 scenario enemies within the 6 full-damage targets.
    await inspect(2);
    expect(control('.ability-popover .result-scope').textContent).toBe(' · Burst 30 m');
    expect(rowText('damage')[0]).toBe('Normal hit · per target:645 Piercing'); // 412 + Ring 175 + Necklace 58
    expect(rowText('damage')[1]).toBe('Total · 3 enemies:1,935');

    // Single target: only one of the configured enemies is counted.
    await inspect(1);
    expect(rowText('health-specific')).toEqual(['Health hit · per target:526.7 Psychic', 'Total · 1 enemy:526.7']);
    expect(results().textContent).toContain('Single-target ability: only 1 of 3 configured enemies is hit.');

    await click('.target-damage-types summary');
    const types = [...container.querySelectorAll('.target-damage-types tbody th')].map(th => th.textContent);
    expect(types).toEqual(['Piercing', 'Poison', 'Psychic']);
    await change('#target-vulnerability-Psychic', '25');
    await change('#target-resistance-Psychic', '5');
    await tick();
    expect(draft().target).toEqual({ count: 3, damageTypes: { Psychic: { vulnerability: 25, resistance: 5 } } });
    expect(control('.target-set-count').textContent).toBe(' · 1 set');
    await inspect(1);
    expect(rowText('health-specific')).toEqual(['Health hit · per target:632.04 Psychic', 'Total · 1 enemy:632.04']);
    await click('.calc-breakdown summary');
    const targetStep = control('.calc-step[data-category="target-damage-type"]');
    expect(targetStep.textContent).toContain('vulnerability 25% · resistance 5%');
    expect(targetStep.querySelector('.calc-step-value')!.textContent).toBe('× 1.2');
    // Piercing hits are untouched by Psychic settings.
    await inspect(2);
    expect(rowText('damage')[0]).toBe('Normal hit · per target:645 Piercing');
    expect(container.querySelector('.ability-popover .calc-step[data-category="target-damage-type"]')).toBeNull();
  });

  it('rejects out-of-range enemy counts without changing the saved target', async () => {
    seed(b => { b.target.count = 2; }); await render();
    await change('#target-count', '21');
    await change('#target-count', '0');
    await change('#target-count', '2.5');
    expect(control('#target-count-error').textContent).toBe('Use a whole number 1–20.');
    await tick();
    expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).target.count).toBe(2);
    await change('#target-count', '20');
    await tick();
    expect(draft().target.count).toBe(20);
  });
});

/** Synthetic family; IDs/levels chosen to exercise the documented rule, not game data. */
function family(levels: readonly [string, number][]): AbilityGroup {
  const template = data.getAbility(MOCK)!;
  return { id: levels[0]![0], name: 'Synthetic', abilities: levels.map(([id, level]) => ({ ...template, id, level }) as Ability) };
}

describe('T0014 Respect Skill Level quick-add rule', () => {
  it('keeps the existing highest-published-tier default when off', () => {
    const group = family([['ability_b', 10], ['ability_a', 50], ['ability_c', 90]]);
    expect(quickAddTier(group, false, 1)).toEqual({ kind: 'tier', ability: highestTier(group) });
    expect(quickAddTier(group, false, 1)).toMatchObject({ ability: { id: 'ability_c' } });
  });

  it('selects the highest Level at or below the skill level, breaking ties by canonical ID ascending', () => {
    const group = family([['ability_9', 10], ['ability_20', 50], ['ability_10', 50], ['ability_3', 90]]);
    expect(quickAddTier(group, true, 50)).toMatchObject({ kind: 'tier', ability: { id: 'ability_10' } });
    expect(quickAddTier(group, true, 89)).toMatchObject({ kind: 'tier', ability: { id: 'ability_10' } });
    expect(quickAddTier(group, true, 90)).toMatchObject({ kind: 'tier', ability: { id: 'ability_3' } });
    expect(quickAddTier(group, true, 10)).toMatchObject({ kind: 'tier', ability: { id: 'ability_9' } });
    expect(quickAddTier(group, true, 9)).toEqual({ kind: 'none', lowestLevel: 10 });
  });
});

describe('T0014 Respect Skill Level picker toggle', () => {
  const mockGroup = () => groupAbilities(data.getAbilitiesForSkill('Psychology')).find(g => g.abilities.some(a => a.id === MOCK))!;
  async function openMock() {
    await click('.skill-panel:nth-child(1) .open-picker');
    await change('#ability-search-A', 'ability_6553');
    expect(container.querySelectorAll('.family')).toHaveLength(1);
  }

  it('is off by default; enabled it quick-adds the highest eligible tier without changing equipped abilities', async () => {
    seed(b => { b.skillSlotA.level = 55; b.abilityBarA = [{ abilityId: 'ability_6555', rank: null }]; }); await render();
    await openMock();
    const toggle = control<HTMLInputElement>('.respect-skill-level input');
    expect(toggle.checked).toBe(false);
    expect(control('.quick-add').getAttribute('aria-label')).toBe(`Quick-add Mock, highest published level ${highestTier(mockGroup()).level}`);
    await click('.quick-add'); await tick();
    expect(draft().abilityBarA.map(a => a.abilityId)).toEqual(['ability_6555', highestTier(mockGroup()).id]);

    await click('.respect-skill-level input');
    expect(control('.picker-help').textContent).toContain('at or below Lv 55');
    expect(control('.quick-add').getAttribute('aria-label')).toBe('Quick-add Mock, highest published level at or below 55: level 50');
    await click('.quick-add'); await tick();
    expect(draft().abilityBarA.map(a => a.abilityId)).toEqual(['ability_6555', 'ability_6555', 'ability_1248']);
    expect(draft().abilityBarA[2]).toEqual({ abilityId: 'ability_1248', rank: data.getAbility('ability_1248')!.rank });
    // Toggle state is session UI only: never saved in the build.
    expect(JSON.stringify(draft())).not.toContain('respect');
  });

  it('explains a no-match family but keeps unrestricted manual tier selection; level changes never replace bars', async () => {
    seed(b => { b.skillSlotA.level = 0; b.abilityBarA = [{ abilityId: 'ability_6555', rank: null }]; }); await render();
    await openMock();
    await click('.respect-skill-level input');
    const quick = control<HTMLButtonElement>('.quick-add');
    expect(quick.disabled).toBe(true);
    expect(quick.getAttribute('aria-label')).toBe('Quick-add Mock unavailable: no published level at or below skill level 0');
    expect(control('.quick-add-none').textContent).toBe('No tier at or below Lv 0 (lowest is Lv 1). Expand to choose any tier.');
    await click('.family summary');
    await click('[aria-label$="ability_6554"]'); await tick();
    expect(draft().abilityBarA.map(a => a.abilityId)).toEqual(['ability_6555', 'ability_6554']);
    await click('.picker-content .dialog-heading button');
    await change('#level-A', '30'); await tick();
    expect(draft().skillSlotA.level).toBe(30);
    expect(draft().abilityBarA.map(a => a.abilityId)).toEqual(['ability_6555', 'ability_6554']);
    // Session-remembered (not saved in the build): reopening keeps it on and uses the new level.
    await openMock();
    expect(control<HTMLInputElement>('.respect-skill-level input').checked).toBe(true);
    expect(sessionStorage.getItem('gorgonbuilder.session.respect-skill-level')).toBe('1');
    expect(control('.quick-add').getAttribute('aria-label')).toBe('Quick-add Mock, highest published level at or below 30: level 30');
    expect(JSON.stringify(draft())).not.toContain('respect');
    // The other bar's picker shares the session option.
    await click('.picker-content .dialog-heading button');
    await click('.skill-panel:nth-child(2) .open-picker');
    expect(control<HTMLInputElement>('.respect-skill-level input').checked).toBe(true);
    await click('.respect-skill-level input');
    expect(sessionStorage.getItem('gorgonbuilder.session.respect-skill-level')).toBeNull();
  });
});

describe('T0014 Mock modifiers in the popover (Psychology + Deer)', () => {
  beforeEach(() => { sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1'); });
  function item(slot: string) { return data.items.find(entry => entry.slot === slot && (entry.level ?? 0) >= 100)!.id; }
  function mockBuild() {
    return seed(b => {
      b.skillSlotB = { skillId: 'Deer', level: 100 };
      b.abilityBarB = [];
      b.equipment = [
        { slot: 'OffHand', item: { kind: 'database', itemId: item('OffHand') }, candidateMods: [{ powerId: 'power_4066', tierId: 'id_20' }], sparks: { mode: 'none' } },
        { slot: 'Hands', item: { kind: 'database', itemId: item('Hands') }, candidateMods: [{ powerId: 'power_4032', tierId: 'id_18' }], sparks: { mode: 'none' } },
      ];
    });
  }

  it.each([[1, '127.27', '127.27'], [3, '127.27', '381.81'], [5, '127.27', '636.35'], [9, '31.82', '286.36']])(
    'shows +43%%, the Burst conversion and the 50%% penalty at %i enemies', async (count, perTarget, total) => {
      mockBuild(); await render();
      await change('#target-count', String(count)); await tick();
      await inspect(1);
      expect(control('.ability-popover .result-scope').textContent).toBe(' · Burst 20 m (mod)');
      const rows = rowText('health-specific');
      expect(rows[0]).toBe(`Health hit${count > 1 ? ' · per target' : ''}:${perTarget} Psychic`);
      if (count > 1) expect(rows[1]).toBe(`Total · ${count} enemies:${total}`);
      expect(control('.result-side-effects').textContent).toBe('Not damage: taunt +200 · taunt +1,080 · reuse timer +1.5 s');
      await click('.calc-breakdown summary');
      const categories = [...container.querySelectorAll<HTMLElement>('.ability-popover .calc-step')].map(s => s.dataset.category);
      expect(categories).toEqual(['original-base', 'ability-damage-percent', 'ability-multiplier', ...(count > 1 ? ['burst-falloff', 'affected-targets'] : [])]);
      expect(control('.calc-step[data-category="ability-damage-percent"]').textContent).toContain('Mock Damage %OffHand planned mod · +43% of 178');
    });

  it('labels 6 enemies as Estimated and explains interpolation', async () => {
    mockBuild(); await render();
    await change('#target-count', '6'); await tick();
    await inspect(1);
    expect(rowText('health-specific')).toEqual(['Health hit · per target:103.41 PsychicEstimated', 'Total · 6 enemies:620.44Estimated']);
    expect(results().querySelectorAll('.result-estimate')).toHaveLength(2);
    await click('.calc-breakdown summary');
    expect(control('[data-falloff="direct"]').textContent).toContain('100% − (6 − 5) × (75% / (9 − 5)) = 81.25%');
  });
});

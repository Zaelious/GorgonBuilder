import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import type { BuildDocument } from '../../core/build/document';
import { psychologyFixture } from '../../core/calculation/fixtures';
import type { ImportedCharacterSnapshot } from '../../core/import';
import { loadGameDataRepository } from '../../data/repository/load';
import { CRITICAL_SCENARIO_KEY, DEFAULT_CRITICAL_SCENARIO, parseCriticalScenario, type CriticalScenario } from '../../persistence/local/critical-scenario';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { TargetDummy } from './TargetDummy';
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
  history.replaceState(null, '', '/');
  vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1');
  vi.mocked(loadGameDataRepository).mockReset().mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); history.replaceState(null, '', '/'); vi.restoreAllMocks(); vi.useRealTimers(); });

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
const inspect = (bar: 1 | 2, slot = 1) => click(`.skill-panel:nth-child(${bar}) .combat-slot:nth-child(${slot}) .slot-button`);
const results = () => control('.ability-popover .ability-results');
const critical = (kind: string) => [...results().querySelectorAll<HTMLElement>(`[data-critical="${kind}"]`)].map(r => r.querySelector('dd')!.textContent);

const MOCK = 'ability_6553';
const FLASHING_STRIKE = 'ability_1187';
function seed(mutate: (build: BuildDocument) => void = () => {}) {
  const build = psychologyFixture(data.gameDataVersion);
  build.skillSlotB = { skillId: 'Sword', level: 50 };
  build.abilityBarA = [{ abilityId: MOCK, rank: data.getAbility(MOCK)!.rank }];
  build.abilityBarB = [{ abilityId: FLASHING_STRIKE, rank: data.getAbility(FLASHING_STRIKE)!.rank }];
  mutate(build);
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  return build;
}

describe('T0013-F2 critical target controls and results', () => {
  it('selects a creature type, uses a manual Phrenology level and recalculates only critical values', async () => {
    const saved = JSON.stringify(seed()); await render();
    const options = [...control<HTMLSelectElement>('#target-creature').options].map(o => o.textContent);
    expect(options[0]).toBe('Unknown');
    expect(options).toHaveLength(28); // Unknown + 27 official Anatomy categories
    expect(options).toContain('Human');
    await change('#target-creature', 'Anatomy_Humans');
    expect(control('.target-critical summary').textContent).toBe('Critical skills · 0 of 2 set');
    await click('.target-critical summary');
    await change('#critical-level-Phrenology_Humans', '30');
    expect(control('[data-critical-skill="Phrenology_Humans"]').dataset.origin).toBe('manual');
    await inspect(1);
    expect(results().querySelector('.result-row[data-component="health-specific"] dd')!.textContent).toBe('526.7 Psychic');
    expect(critical('chance')).toEqual(['5% · Human · Human Phrenology 30 (manual)']);
    expect(critical('hit')).toEqual(['1,132.41 Psychic']); // 526.7 × (1.25 + 0.9)
    expect(critical('expected')).toEqual(['556.99']); // 526.7 × 0.95 + 1132.405 × 0.05
    // Target type changes recalculate immediately; categories without Phrenology give 0%.
    await change('#target-creature', 'Anatomy_Canines');
    expect(critical('chance')[0]).toMatch(/^0% · Canine/u);
    expect(critical('expected')).toEqual(['526.7']);
    await change('#target-creature', 'Anatomy_Orcs');
    expect(critical('chance')).toEqual(['Unavailable · enter Orc Phrenology level']);
    expect(critical('expected')).toEqual(['Unavailable']);
    // Normal hit, build and abilities are unchanged; the scenario is session state only.
    expect(results().querySelector('.result-row[data-component="health-specific"] dd')!.textContent).toBe('526.7 Psychic');
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(saved);
    expect(parseCriticalScenario(JSON.parse(sessionStorage.getItem(CRITICAL_SCENARIO_KEY)!))).toEqual({
      creatureType: 'Anatomy_Orcs', elite: 'unknown', manualLevels: { Phrenology_Humans: 30 } });
  });

  it('shows numerical public critical contributions without diagnostics, and diagnostics only in debug', async () => {
    seed();
    sessionStorage.setItem(CRITICAL_SCENARIO_KEY, JSON.stringify({ version: 1, creatureType: 'Anatomy_Humans', elite: 'unknown', manualLevels: { Phrenology_Humans: 48 } }));
    await render(); await inspect(1);
    const breakdown = control<HTMLDetailsElement>('.damage-breakdown');
    expect(breakdown.open).toBe(false);
    const section = control('.calc-critical');
    expect([...section.querySelectorAll('.calc-step')].map(s => s.textContent)).toEqual([
      'Human Phrenology Lv 48 — manual+8%', 'Critical chance8%',
      'Published critical multiplier× 1.25', 'Psychology/Mentalism Critical Hit Damage % — Chest+90%', 'Critical multiplier× 2.15',
      'Health hit critical526.7 × 2.151,132.41', 'Expected per hit526.7 × 92% + 1,132.41 × 8%575.16',
    ]);
    expect(results().textContent).not.toMatch(/PhrenologyCriticals|MOD_CRITICAL|power_|Assumed|CritDamageMod/u);
    expect(container.querySelector('[data-critical-debug]')).toBeNull();
  });

  it('labels abilities without a critical system and exposes critical diagnostics only with the dev flag', async () => {
    history.replaceState(null, '', '/?debugDamage=1');
    seed();
    sessionStorage.setItem(CRITICAL_SCENARIO_KEY, JSON.stringify({ version: 1, creatureType: 'Anatomy_Undead', elite: 'non-elite', manualLevels: {} }));
    await render(); await inspect(2);
    expect(critical('none')).toEqual(['No critical-hit system']);
    await inspect(1);
    expect(control('[data-critical-debug]').textContent).toContain('PhrenologyCriticals');
  });

  it('applies the curated Undead bonus only when Undead is selected', async () => {
    seed(build => {
      build.equipment = [...build.equipment, { slot: 'Feet', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } },
        candidateMods: [{ powerId: 'power_1253', tierId: 'id_1' }], sparks: { mode: 'none' } }];
    });
    await render(); await inspect(2);
    const value = () => results().querySelector('.result-row[data-component="damage"] dd')!.textContent;
    const unknown = value();
    await change('#target-creature', 'Anatomy_Undead');
    await inspect(2);
    expect(value()).not.toBe(unknown);
    await change('#target-creature', 'Anatomy_Humans');
    await inspect(2);
    expect(value()).toBe(unknown);
  });
});

function snapshot(level: number, bonusLevels = 5): ImportedCharacterSnapshot {
  return {
    source: { report: 'CharacterSheet', exportedAt: '2026-11-01T12:00:00Z', sourceReportVersion: 1, characterName: 'Fixture', server: null,
      resolvedWithGameDataVersion: data.gameDataVersion, metadata: {} },
    skills: [{ reference: { sourceId: 'Phrenology_Humans', id: 'Phrenology_Humans', status: 'resolved' }, level, bonusLevels,
      xpTowardNextLevel: null, xpNeededForNextLevel: null, abilities: [], metadata: {} }],
    knownAbilities: [], currentStats: {},
  };
}

describe('imported/manual critical skill precedence in the target dummy', () => {
  it('shows imported levels, lets a manual value override them and returns to imported deliberately; reimport keeps manual', async () => {
    const build = psychologyFixture(data.gameDataVersion);
    let latest: CriticalScenario = DEFAULT_CRITICAL_SCENARIO;
    function Harness({ imported }: { imported: ImportedCharacterSnapshot }) {
      const [scenario, setScenario] = useState<CriticalScenario>({ ...DEFAULT_CRITICAL_SCENARIO, creatureType: 'Anatomy_Humans' });
      latest = scenario;
      return <TargetDummy build={build} data={data} onEdit={() => {}} readOnly critical={{ scenario, onChange: setScenario, imported }} />;
    }
    await act(async () => root.render(<Harness imported={snapshot(30)} />));
    await click('.target-critical summary');
    const row = () => control('[data-critical-skill="Phrenology_Humans"]');
    expect(control<HTMLInputElement>('#critical-level-Phrenology_Humans').value).toBe('30'); // exported Level, bonus not re-added
    expect(row().dataset.origin).toBe('imported');
    expect(control('#critical-level-Anatomy_Humans').closest('tr')!.querySelector('.critical-source')!.textContent).toBe('Not in import');
    // Read-only builds still allow scenario choices.
    expect(control<HTMLSelectElement>('#target-creature').disabled).toBe(false);
    await change('#critical-level-Phrenology_Humans', '42');
    expect(row().dataset.origin).toBe('manual');
    expect(control('.critical-use-imported').textContent).toBe('Use imported (30)');
    await act(async () => root.render(<Harness imported={snapshot(36)} />)); // reimport
    expect(row().dataset.origin).toBe('manual');
    expect(control<HTMLInputElement>('#critical-level-Phrenology_Humans').value).toBe('42');
    await click('.critical-use-imported');
    expect(row().dataset.origin).toBe('imported');
    expect(control<HTMLInputElement>('#critical-level-Phrenology_Humans').value).toBe('36');
    expect(latest.manualLevels).toEqual({});
    await change('#critical-level-Phrenology_Humans', '7.5');
    expect(control('#critical-level-Phrenology_Humans-error').textContent).toMatch(/whole number/u);
    expect(latest.manualLevels).toEqual({});
  });

  it('parses stored scenarios defensively', () => {
    expect(parseCriticalScenario(null)).toBe(DEFAULT_CRITICAL_SCENARIO);
    expect(parseCriticalScenario({ version: 2 })).toBe(DEFAULT_CRITICAL_SCENARIO);
    expect(parseCriticalScenario({ version: 1, creatureType: 5, elite: 'boss', manualLevels: { Phrenology_Humans: 12, Anatomy_Undead: -1, x: 'a' } }))
      .toEqual({ creatureType: null, elite: 'unknown', manualLevels: { Phrenology_Humans: 12 } });
  });
});

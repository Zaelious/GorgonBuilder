import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultBuildDocument, type BuildDocument, type EquipmentSelection } from '../../core/build/document';
import { aggregateBuildModifiers } from '../../core/calculation';
import { readStampedeStacks, STAMPEDE_STACKS_KEY, writeStampedeStacks, readWhileStunned, STAMPEDE_STUNNED_KEY } from '../../persistence/local/stampede-scenario';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { AbilityResults } from './AbilityResults';

let data: ReturnType<typeof loadPlannerFixture>;
let root: Root, container: HTMLDivElement;
beforeAll(() => { data = loadPlannerFixture(); });
beforeEach(() => {
  sessionStorage.clear(); history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); history.replaceState(null, '', '/'); });

const mod = (powerId: string, tierId: string, slot = 'Chest'): EquipmentSelection => ({ slot,
  item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [{ powerId, tierId }], sparks: { mode: 'none' } });
function build(skillId: string, ...equipment: EquipmentSelection[]): BuildDocument {
  const b = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }); b.skillSlotA = { skillId, level: 0 }; b.equipment = equipment; return b;
}
async function render(b: BuildDocument, id: string) {
  await act(async () => root.render(<AbilityResults ability={data.getAbility(id)!} data={data} idPrefix="scenario-test"
    inputs={{ aggregation: aggregateBuildModifiers(b, data), target: b.target }} />));
}
const text = (selector: string) => container.querySelector(selector)?.textContent;
async function stacks(value: string) {
  const select = container.querySelector<HTMLSelectElement>('.stampede-control select')!;
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
}

describe('compact manual damage scenarios', () => {
  it('defaults to 0 stacks, recalculates live, remembers session state and preserves BuildDocument v1', async () => {
    const b = build('Cow', mod('power_20004', 'id_20')); const saved = JSON.stringify(b);
    await render(b, 'ability_6138');
    expect(text('[data-stampede="projected"] dd')).toBe('208 Estimated');
    expect(container.querySelector<HTMLSelectElement>('.stampede-control select')!.options).toHaveLength(31); // 0–30 (T0015-R1)
    expect(container.querySelector<HTMLSelectElement>('.stampede-control select')!.title).toContain('2-second reuse');
    await stacks('1'); expect(text('[data-stampede="projected"] dd')).toBe('258 Estimated');
    await stacks('15'); expect(text('[data-stampede="projected"] dd')).toBe('958 Estimated');
    expect(text('[data-component="damage"] dt')).toBe('Ordinary hit · 0 stacks');
    expect(text('[data-component="damage"] dd')).toBe('208 Crushing');
    expect(readStampedeStacks()).toBe(15); expect(JSON.stringify(b)).toBe(saved);
    expect(JSON.parse(sessionStorage.getItem(STAMPEDE_STACKS_KEY)!)).toBe(15);
    expect(container.querySelector<HTMLDetailsElement>('.damage-breakdown')!.open).toBe(false);
    expect(text('.damage-breakdown')).toContain('+50 per stack × 15');
    expect(text('.damage-breakdown')).toContain('Continuous Trampling stack damage');
    expect(text('.ability-results')).not.toMatch(/power_|BOOST_|id_20|Assumed:|unmodeled|sourcePath/u);
    await render(b, 'ability_6124'); expect(container.querySelector('.stampede-control')).toBeNull();
    await render(b, 'ability_6138'); expect(text('[data-stampede="projected"] dd')).toBe('958 Estimated');
    await stacks('30'); expect(text('[data-stampede="projected"] dd')).toBe('1,708 Estimated');
    expect(readStampedeStacks()).toBe(30); expect(text('.damage-breakdown')).toContain('+50 per stack × 30');
    expect(JSON.stringify(b)).toBe(saved);
  });

  it('recalculates after tier replacement, second equipment source and mod removal', async () => {
    writeStampedeStacks(15);
    const b = build('Cow', mod('power_20004', 'id_20'), mod('power_20004', 'id_25', 'Hands'));
    await render(b, 'ability_6138'); expect(text('[data-stampede="projected"] dd')).toBe('1,933 Estimated');
    expect(text('.damage-breakdown')).toContain('+65 per stack × 15');
    b.equipment[0]!.candidateMods[0]!.tierId = 'id_1';
    await render(b, 'ability_6138'); expect(text('[data-stampede="projected"] dd')).toBe('1,243 Estimated');
    b.equipment.pop(); await render(b, 'ability_6138'); expect(text('[data-stampede="projected"] dd')).toBe('268 Estimated');
    b.equipment = []; await render(b, 'ability_6138'); expect(container.querySelector('.stampede-control')).toBeNull();
    expect(text('[data-component="damage"] dd')).toBe('208 Crushing');
  });

  it('shows ordinary, proc and expected hits separately, and restores normal results on removal', async () => {
    const b = build('Psychology', mod('power_4062', 'id_25'));
    await render(b, 'ability_1298');
    expect(text('[data-component="damage"] dd')).toBe('530 Psychic');
    expect(text('[data-proc="chance"] dd')).toBe('33% Estimated');
    expect(text('[data-proc="hit"] dd')).toBe('1,060');
    expect(text('[data-proc="expected"] dd')).toBe('704.9');
    expect(text('[data-proc="expected"] dt')).toContain('per successful hit (proc only)');
    expect(text('.ability-results')).not.toMatch(/power_|Assumed:|independent rolls/u);
    b.equipment = []; await render(b, 'ability_1298');
    expect(container.querySelector('[data-proc]')).toBeNull(); expect(text('[data-component="damage"] dd')).toBe('430 Psychic');
  });

  it('shows a second audited proc with tier-dependent probability and damage', async () => {
    const b = build('Deer', mod('power_21023', 'id_12'));
    await render(b, 'ability_1557'); expect(text('[data-proc="chance"] dd')).toBe('20% Estimated');
    expect(text('[data-proc="hit"] dd')).toBe('152.52');
    b.equipment[0]!.candidateMods[0]!.tierId = 'id_13';
    await render(b, 'ability_1557'); expect(text('[data-proc="chance"] dd')).toBe('24% Estimated');
    expect(text('[data-proc="hit"] dd')).toBe('167.04');
  });

  it('exposes duplicate and unsupported outcomes as Unavailable; detailed reasons remain development-only', async () => {
    const b = build('Psychology', mod('power_4062', 'id_20'), mod('power_4062', 'id_25', 'Hands'));
    await render(b, 'ability_1298');
    expect(text('[data-proc="hit"] dd')).toBe('Unavailable'); expect(text('[data-proc="expected"] dd')).toBe('Unavailable');
    expect(container.querySelectorAll('.proc-source')).toHaveLength(2);
    expect(container.querySelector('[data-scenario-debug]')).toBeNull();
    history.replaceState(null, '', '/?debugDamage=1'); await render(b, 'ability_1298');
    expect(text('[data-scenario-debug]')).toContain('shared versus independent rolls');
    expect(text('[data-scenario-debug]')).toContain('power_4062/id_25');
    history.replaceState(null, '', '/'); await render(build('Cow', mod('power_20011', 'id_1')), 'ability_6124');
    expect(text('[data-proc="expected"] dd')).toBe('Unavailable');
    expect(text('.ability-results')).not.toContain('Random AoE conversion');
  });

  it.each(['-1', '31', '1.5', '"15"', 'null', '{}', 'invalid'])('falls back safely for invalid stored stacks %s', stored => {
    sessionStorage.setItem(STAMPEDE_STACKS_KEY, stored); expect(readStampedeStacks()).toBe(0);
  });

  it.each([0, 1, 15, 16, 29, 30])('restores stored stacks %i, including saved 0–15 values from T0014-F1', stored => {
    sessionStorage.setItem(STAMPEDE_STACKS_KEY, JSON.stringify(stored)); expect(readStampedeStacks()).toBe(stored);
  });
});

describe('While Stunned and unavailable status correction', () => {
  it('shows only the equipped Stampede checkbox, toggles the combined result and restores session state', async () => {
    const b = build('Cow', mod('power_20004', 'id_20'), mod('power_20020', 'id_25', 'Necklace'));
    const saved = JSON.stringify(b); await render(b, 'ability_6138');
    let checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    await stacks('15'); await act(async () => checkbox.click());
    expect(text('[data-stampede="stunned"] dd')).toBe('13,412 Estimated');
    expect(text('[data-stampede="projected"] dd')).toBe('958 Estimated');
    expect(text('.damage-breakdown')).toContain('Necklace'); expect(text('.damage-breakdown')).toContain('+1,300%');
    expect(JSON.stringify(b)).toBe(saved);
    await render(b, 'ability_6124'); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    await render(b, 'ability_6138'); checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!; expect(checkbox.checked).toBe(true);
    await act(async () => checkbox.click()); expect(container.querySelector('[data-stampede="stunned"]')).toBeNull();
    b.equipment.pop(); await render(b, 'ability_6138'); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
  it('uses Unavailable in both public breakdown headings when the target is invalid', async () => {
    const b = build('Cow', mod('power_20004','id_20')); b.target.damageTypes.Crushing = { vulnerability: 0, resistance: 150 };
    await render(b, 'ability_6138');
    expect(text('.damage-breakdown')).toContain('Current stacks · 0 Unavailable');
    expect(text('.damage-breakdown')).toContain('Stampede at 0 stacks · Unavailable');
    expect(text('.damage-breakdown')).not.toContain('Estimated');
  });
});

it.each(['false', '0', '1', '"true"', '{}', 'null', 'invalid'])('rejects invalid/nontrue stunned session input %s', stored => {
  sessionStorage.setItem(STAMPEDE_STUNNED_KEY, stored); expect(readWhileStunned()).toBe(false);
});
it('restores an explicitly true stunned session', () => {
  sessionStorage.setItem(STAMPEDE_STUNNED_KEY, 'true'); expect(readWhileStunned()).toBe(true);
});

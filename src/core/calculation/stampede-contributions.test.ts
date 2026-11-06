// @vitest-environment node
// T0015-R1: Continuous Trampling regression against the customer's in-game measurements (Stampede 12, 2 s reuse,
// 60 s buff). Damage *increases* are compared, not absolute totals, because the customer's character had an unrelated
// buff that changes the baseline. The formula is the unchanged T0014-F1/T0013 one.
import { describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type BuildDocument, type EquipmentSelection } from '../build/document';
import { simulateSkillDamageSparks } from '../sparks/simulate';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { calculateStampedeScenario } from './damage-scenarios';

const data = loadPlannerFixture();
const STAMPEDE = 'ability_6138'; // published base 208 Crushing
const BASE = 208;
const MULTIPLIER = 1.955;
const target = { count: 1, damageTypes: {} };
const trampling = (tierId: string, slot: string): EquipmentSelection => ({ slot, item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } },
  candidateMods: [{ powerId: 'power_20004', tierId }], sparks: { mode: 'none' } });
// The customer's applicable non-base percentage was ≈ +95.5%. Reproduce it exactly with ordinary Cow modifiers:
// 95 × "+1% Cow Damage" (MOD_SKILL_ALL_COW) + 1 × "+0.5% All Direct Damage" = 0.955.
const percentRing: EquipmentSelection = { slot: 'Ring', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [],
  sparks: { mode: 'actual', category: 'skill-damage', skillId: 'Cow',
    outcomeCounts: { allDirectDamagePercent: 1, skillDamageFlat: 0, allDirectDamageFlat: 0, skillDamagePercent: 95, skillBaseDamagePercent: 0 } } };
const plus50 = () => trampling('id_20', 'Chest');
const plus56 = () => trampling('id_22', 'Hands');

function build(...equipment: EquipmentSelection[]): BuildDocument {
  const b = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  b.skillSlotA = { skillId: 'Cow', level: 0 }; b.equipment = equipment; return b;
}
function scenario(b: BuildDocument, contributions: number, whileStunned = false) {
  const result = calculateAbilityDamage(STAMPEDE, aggregateBuildModifiers(b, data), data);
  return calculateStampedeScenario(result, target, contributions, data, whileStunned)!;
}
const hit = (s: ReturnType<typeof scenario>, which: 'baseline' | 'stacked' | 'projected') => s[which]!.hits[0]!.perTarget!;
const increase = (s: ReturnType<typeof scenario>) => hit(s, 'stacked') - hit(s, 'baseline');

describe('T0015-R1 Continuous Trampling contributions at the customer multiplier (1.955×)', () => {
  it('reproduces the 1.955× multiplier through the ordinary engine', () => {
    expect(hit(scenario(build(percentRing, plus56()), 0), 'baseline')).toBeCloseTo(BASE * MULTIPLIER, 9);
  });

  it.each([
    ['+56 only', [56], 0, 0],
    ['+56 only', [56], 15, 1642.2],
    ['+56 only', [56], 30, 3284.4],
    ['+50 and +56', [50, 56], 0, 0],
    ['+50 and +56', [50, 56], 15, 3108.45],
    ['+50 and +56', [50, 56], 30, 6216.9],
  ] as const)('%s at %i contributions: increase matches the table', (_, values, contributions, expected) => {
    const b = values.length === 1 ? build(percentRing, plus56()) : build(percentRing, plus50(), plus56());
    const s = scenario(b, contributions);
    expect(s.status).toBe('estimated');
    expect(s.flatBonus).toBe(values.reduce((a, v) => a + v, 0) * contributions);
    expect(s.contributions.map(c => [c.perStack, c.flatBonus])).toEqual(values.map(v => [v, v * contributions]));
    expect(increase(s)).toBeCloseTo(expected, 6);
  });

  it('matches the customer measurements within rounding (Test A 3,285; Test B 6,217)', () => {
    expect(Math.abs(increase(scenario(build(percentRing, plus56()), 30)) - 3285)).toBeLessThan(1);
    expect(Math.abs(increase(scenario(build(percentRing, plus50(), plus56()), 30)) - 6217)).toBeLessThan(1);
    // With the planner's example baseline of 1,335.67, the modeled totals are baseline + increase.
    expect(1335.67 + 3284.4).toBeCloseTo(4620.07, 9);
    expect(1335.67 + 6216.9).toBeCloseTo(7552.57, 9);
  });

  it('is one flat before ordinary percentages: no extra multiplier and no duplicated contributions', () => {
    const s = scenario(build(percentRing, plus50(), plus56()), 30);
    const steps = s.projectedDamage!.components.find(c => c.id === 'damage')!.steps;
    const stackSteps = steps.filter(step => step.operation === 'add-flat' && step.modifierKey?.includes('power_20004'));
    expect(stackSteps.map(step => step.contribution)).toEqual([1500, 1680]);
    const percentBasis = steps.find(step => step.operation === 'add-percent-contribution')!.basis;
    expect(percentBasis).toBe(BASE + 1500 + 1680);
    expect(hit(s, 'stacked')).toBeCloseTo((BASE + 3180) * MULTIPLIER, 9);
  });

  it('removal, tier change and restoration reverse exactly', () => {
    const both = build(percentRing, plus50(), plus56());
    const combined = increase(scenario(both, 30));
    const removed = build(percentRing, plus56());
    expect(increase(scenario(removed, 30))).toBeCloseTo(3284.4, 6);
    const changed = build(percentRing, trampling('id_1', 'Chest'), plus56()); // +4 tier
    expect(increase(scenario(changed, 30))).toBeCloseTo((4 + 56) * 30 * MULTIPLIER, 6);
    expect(increase(scenario(build(percentRing, plus50(), plus56()), 30))).toBe(combined);
  });

  it('While Stunned keeps its separate provisional formula at 30 contributions, enabled and disabled', () => {
    const necklace: EquipmentSelection = { slot: 'Necklace', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } },
      candidateMods: [{ powerId: 'power_20020', tierId: 'id_25' }], sparks: { mode: 'none' } }; // +1,300% while stunned
    const b = build(plus50(), necklace);
    const off = scenario(b, 30, false), on = scenario(b, 30, true);
    expect(hit(off, 'projected')).toBe(BASE + 1500);
    expect(hit(on, 'stacked')).toBe(BASE + 1500);
    expect(hit(on, 'projected')).toBe((BASE + 1500) * 14);
  });

  it('changing contributions never alters the ordinary hit, unrelated abilities or Spark simulation', () => {
    const b = build(percentRing, plus50(), plus56());
    const ordinary = JSON.stringify(calculateAbilityDamage(STAMPEDE, aggregateBuildModifiers(b, data), data));
    const other = JSON.stringify(calculateAbilityDamage('ability_6124', aggregateBuildModifiers(b, data), data));
    const spark = JSON.stringify(simulateSkillDamageSparks({ skill: 'Cow', count: 110, seed: 'r1' }));
    for (const n of [0, 15, 30]) {
      const s = scenario(b, n);
      expect(JSON.stringify(calculateAbilityDamage(STAMPEDE, aggregateBuildModifiers(b, data), data))).toBe(ordinary);
      expect(hit(s, 'baseline')).toBeCloseTo(BASE * MULTIPLIER, 9);
    }
    expect(JSON.stringify(calculateAbilityDamage('ability_6124', aggregateBuildModifiers(b, data), data))).toBe(other);
    expect(JSON.stringify(simulateSkillDamageSparks({ skill: 'Cow', count: 110, seed: 'r1' }))).toBe(spark);
  });
});

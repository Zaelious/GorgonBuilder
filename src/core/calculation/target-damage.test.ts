import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import type { BuildDocument, TargetConfiguration } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { psychologyFixture } from './fixtures';
import { applyTargetDummy, TARGET_DAMAGE_ASSUMPTIONS } from './target-damage';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

const MOCK = 'ability_6553'; // Mock 11: single published HealthSpecificDamage 178 Psychic, no AoE
const MULTISHOT = 'ability_2328'; // Multishot 8: Damage 412 Piercing, published AoE 30, no target cap field
const target = (count = 1, damageTypes: TargetConfiguration['damageTypes'] = {}): TargetConfiguration => ({ count, damageTypes });

function calculate(abilityId: string, build: BuildDocument = psychologyFixture(data.gameDataVersion)) {
  return calculateAbilityDamage(abilityId, aggregateBuildModifiers(build, data), data);
}

describe('T0014 target dummy stage', () => {
  it('is an identity stage with a neutral dummy and never mutates the T0013 result', () => {
    const result = calculate(MOCK);
    const snapshot = structuredClone(result);
    const out = applyTargetDummy(result, target());
    expect(result).toEqual(snapshot);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0]).toMatchObject({ componentId: 'health-specific', damageType: 'Psychic', beforeTarget: 526.7,
      perTarget: 526.7, total: 526.7, targetStep: null, validated: false });
    expect(out.affectedTargets).toBe(1);
    expect(out.assumptions).toEqual([]);
    expect(out.confidence).toBe(result.confidence);
  });

  it('applies only the matching damage type as one assumed final multiplier', () => {
    const result = calculate(MOCK);
    // A Piercing setting is irrelevant to a Psychic hit and changes nothing.
    const unrelated = applyTargetDummy(result, target(1, { Piercing: { vulnerability: 50 } }));
    expect(unrelated.hits[0]!.perTarget).toBe(526.7);
    expect(unrelated.hits[0]!.targetStep).toBeNull();
    expect(unrelated.assumptions).toEqual([]);

    const out = applyTargetDummy(result, target(1, { Psychic: { vulnerability: 25, resistance: 5 } }));
    const hit = out.hits[0]!;
    expect(hit.targetStep).toMatchObject({ damageType: 'Psychic', vulnerability: 25, resistance: 5, multiplier: 1.2, before: 526.7, confidence: 'assumed' });
    expect(hit.perTarget).toBeCloseTo(632.04, 10);
    expect(hit.confidence).toBe('unknown'); // inherits the incomplete T0013 component confidence
    expect(out.assumptions).toEqual([TARGET_DAMAGE_ASSUMPTIONS.damageType]);
    // Only the target stage changed: every T0013 step is untouched.
    expect(result.components.find(c => c.id === 'health-specific')!.provisionalDamage).toBe(526.7);
  });

  it('refuses to invent a clamp or healing rule when net resistance exceeds 100%', () => {
    const out = applyTargetDummy(calculate(MOCK), target(1, { Psychic: { resistance: 150 } }));
    expect(out.hits[0]!.perTarget).toBeNull();
    expect(out.hits[0]!.total).toBeNull();
    expect(out.warnings.map(w => w.code)).toContain('invalid-target-modifier');
    expect(applyTargetDummy(calculate(MOCK), target(1, { Psychic: { resistance: 100 } })).hits[0]!.perTarget).toBe(0);
  });

  it('counts one affected enemy for an ability without a published AoE value', () => {
    const out = applyTargetDummy(calculate(MOCK), target(5));
    expect(out.areaOfEffect).toBe(false);
    expect(out.affectedTargets).toBe(1);
    expect(out.hits[0]!.total).toBe(526.7);
    expect(out.warnings.map(w => w.code)).toEqual(['single-target-ability']);
    expect(out.assumptions).toEqual([TARGET_DAMAGE_ASSUMPTIONS.singleTarget]);
  });

  it('shows AoE per-target damage but never assumes an unlimited target cap', () => {
    const result = calculate(MULTISHOT);
    expect(result.ability!.targeting.aoe).toBe(30);
    const perTarget = result.components.find(c => c.id === 'damage')!.provisionalDamage!;

    const one = applyTargetDummy(result, target(1));
    expect(one.areaOfEffect).toBe(true);
    expect(one.affectedTargets).toBe(1);
    expect(one.hits[0]!.total).toBe(perTarget);

    const three = applyTargetDummy(result, target(3));
    expect(three.targetCap).toBeNull();
    expect(three.affectedTargets).toBeNull();
    expect(three.hits[0]!.perTarget).toBe(perTarget);
    expect(three.hits[0]!.total).toBeNull();
    expect(three.warnings.map(w => w.code)).toEqual(['target-cap-unknown']);
  });

  it('multiplies per-target damage by min(enemies, cap) when a source-backed cap is supplied', () => {
    const result = calculate(MULTISHOT);
    const perTarget = result.components.find(c => c.id === 'damage')!.provisionalDamage!;
    const capped = applyTargetDummy(result, target(20, { Piercing: { vulnerability: 10 } }), { targetCap: 5 });
    expect(capped.affectedTargets).toBe(5);
    expect(capped.hits[0]!.perTarget).toBeCloseTo(perTarget * 1.1, 10);
    expect(capped.hits[0]!.total).toBeCloseTo(perTarget * 1.1 * 5, 10);
    expect(capped.assumptions).toEqual(expect.arrayContaining([TARGET_DAMAGE_ASSUMPTIONS.aoeInRange, TARGET_DAMAGE_ASSUMPTIONS.damageType]));
    expect(applyTargetDummy(result, target(3), { targetCap: 10 }).affectedTargets).toBe(3);
    const invalid = applyTargetDummy(result, target(3), { targetCap: 0 });
    expect(invalid.targetCap).toBeNull();
    expect(invalid.affectedTargets).toBeNull();
    expect(invalid.warnings.map(w => w.code)).toEqual(['invalid-target-cap', 'target-cap-unknown']);
  });

  it('recalculates the explained delta when one build item changes', () => {
    const build = psychologyFixture(data.gameDataVersion);
    const before = applyTargetDummy(calculate(MOCK, build), target());
    const ring = build.equipment.findIndex(e => e.slot === 'Ring');
    const without: BuildDocument = { ...build, equipment: build.equipment.filter((_, index) => index !== ring) };
    const after = applyTargetDummy(calculate(MOCK, without), target());
    // The Ring's fixed All Direct +175 flat is the only removed contribution to this hit.
    expect(before.hits[0]!.perTarget! - after.hits[0]!.perTarget!).toBeCloseTo(175, 10);
  });

  it('returns no hits or affected count for a missing ability ID', () => {
    const out = applyTargetDummy(calculate('ability_missing'), target(3));
    expect(out.hits).toEqual([]);
    expect(out.affectedTargets).toBeNull();
    expect(out.confidence).toBe('unknown');
  });
});

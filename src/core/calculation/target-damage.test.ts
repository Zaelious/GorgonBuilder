import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import type { BuildDocument, TargetConfiguration } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { psychologyFixture } from './fixtures';
import { applyTargetDummy, burstTargetFalloff, TARGET_DAMAGE_ASSUMPTIONS } from './target-damage';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

const MOCK = 'ability_6553'; // Mock 11: single published HealthSpecificDamage 178 Psychic, no AoE
const MULTISHOT = 'ability_2328'; // Multishot 8: Damage 412 Piercing, published AoE 30 and Burst keyword, no target cap field
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

  it('treats a published Burst ability as hitting every configured enemy and applies documented endpoints and labeled estimates', () => {
    const result = calculate(MULTISHOT);
    expect(result.ability!.targeting.aoe).toBe(30);
    expect(result.ability!.keywords).toContain('Burst');
    const perTarget = result.components.find(c => c.id === 'damage')!.provisionalDamage!;

    const one = applyTargetDummy(result, target(1));
    expect(one.burst).toEqual({ source: 'published-aoe', radius: 30 });
    expect(one.affectedTargets).toBe(1);
    expect(one.falloff).toBeNull();
    expect(one.hits[0]!.total).toBe(perTarget);

    // 30 m: 3 + 3 = 6 full-damage targets.
    const six = applyTargetDummy(result, target(6));
    expect(six.affectedTargets).toBe(6);
    expect(six.falloff!.direct).toMatchObject({ status: 'full', multiplier: 1, fullDamageTargets: 6 });
    expect(six.hits[0]!.total).toBe(perTarget * 6);
    expect(six.assumptions).toEqual(expect.arrayContaining([TARGET_DAMAGE_ASSUMPTIONS.burstInRange, TARGET_DAMAGE_ASSUMPTIONS.publishedAoeRadius]));

    const seven = applyTargetDummy(result, target(7));
    expect(seven.hits[0]!.perTarget).toBeCloseTo(perTarget * 0.75, 10);
    expect(seven.hits[0]!.total).toBeCloseTo(perTarget * 0.75 * 7, 10);
    expect(seven.hits[0]!.estimated).toBe(true);
    expect(seven.warnings).toEqual([]);

    const nine = applyTargetDummy(result, target(9));
    expect(nine.hits[0]!.perTarget).toBeCloseTo(perTarget * 0.25, 10);
    expect(nine.hits[0]!.total).toBeCloseTo(perTarget * 0.25 * 9, 10);
    expect(nine.falloff!.indirect).toMatchObject({ status: 'floor', multiplier: 0.5 });
  });

  it('never assumes an unlimited cap for a non-Burst AoE record; a supplied cap gives min(enemies, cap)', () => {
    const GAS_BREATH = 'ability_14011'; // published AoE 8, no Burst keyword
    const result = calculate(GAS_BREATH);
    expect(result.ability!.keywords).not.toContain('Burst');
    const perTarget = result.components.find(c => c.id === 'damage')!.provisionalDamage!;
    const three = applyTargetDummy(result, target(3));
    expect(three.burst).toBeNull();
    expect(three.affectedTargets).toBeNull();
    expect(three.hits[0]!.perTarget).toBe(perTarget);
    expect(three.hits[0]!.total).toBeNull();
    expect(three.warnings.map(w => w.code)).toEqual(['target-cap-unknown']);
    expect(applyTargetDummy(result, target(1)).hits[0]!.total).toBe(perTarget);
    const capped = applyTargetDummy(result, target(20, { Nature: { vulnerability: 10 } }), { targetCap: 5 });
    expect(capped.affectedTargets).toBe(5);
    expect(capped.hits[0]!.total).toBeCloseTo(perTarget * 1.1 * 5, 10);
    const invalid = applyTargetDummy(result, target(3), { targetCap: 0 });
    expect(invalid.targetCap).toBeNull();
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

describe('documented Burst target-count falloff (2024-07-30)', () => {
  it('gives full damage up to 3 + 1 per 10 m, the 9+ floors, and labeled linear direct estimates', () => {
    const at = (n: number, radius: number | null, delivery: 'direct' | 'indirect' = 'direct') => burstTargetFalloff(n, radius, delivery);
    expect([1, 3, 5].map(n => at(n, 20).multiplier)).toEqual([1, 1, 1]);
    expect(at(5, 20)).toMatchObject({ status: 'full', fullDamageTargets: 5, extraTargetChance: 0 });
    expect([6, 7, 8].map(n => at(n, 20).status)).toEqual(['estimated', 'estimated', 'estimated']);
    expect([6, 7, 8].map(n => at(n, 20).multiplier)).toEqual([0.8125, 0.625, 0.4375]);
    expect(at(9, 20)).toMatchObject({ status: 'floor', multiplier: 0.25 });
    expect(at(20, 20, 'indirect')).toMatchObject({ status: 'floor', multiplier: 0.5 });
    expect(at(4, 0)).toMatchObject({ status: 'estimated', fullDamageTargets: 3, multiplier: 0.875 });
    expect(at(3, null)).toMatchObject({ status: 'full', fullDamageTargets: null });
    expect(at(4, null).status).toBe('undocumented');
    // 7 m: 3 full targets plus a 70% chance of a 4th; no expected value is invented.
    expect(at(4, 7)).toMatchObject({ status: 'probabilistic', multiplier: null, extraTargetChance: 0.7 });
    expect(at(3, 7).status).toBe('full');
    // A radius that already covers 9 targets leaves larger counts undocumented rather than jumping to the floor.
    expect(at(10, 60)).toMatchObject({ status: 'undocumented', fullDamageTargets: 9 });
  });
});

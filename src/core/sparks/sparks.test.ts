// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SparkConfiguration, SparkOutcomeCounts } from '../build/document';
import {
  MAX_SPARKS_PER_ITEM, SKILL_DAMAGE_SPARK_MODEL_VERSION, SKILL_DAMAGE_SPARK_OUTCOMES, SPARK_OUTCOME_KEYS, SPARK_WEIGHT_TOTAL,
  createSeededUint32, evaluateSparkConfiguration, expectedSkillDamageSparks, hashSeed, isOffensiveSparkSlot,
  rollSkillDamageSparks, simulateSkillDamageSparks, sparkBonusTotals, sparkModifierValue, sparkOutcomeProbability,
  sparkOutcomeText, totalSparkOutcomes, uniformInt, zeroSparkOutcomeCounts,
} from './index';

const simulate = (count: number, seed = 'fixed-seed', skill = 'Psychology') => {
  const result = simulateSkillDamageSparks({ skill, count, seed });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
};

describe('T0015 Skill Damage Spark model', () => {
  it('has exactly the five documented outcomes with probabilities that total exactly 100%', () => {
    expect(SKILL_DAMAGE_SPARK_OUTCOMES.map(o => [o.key, o.weight, o.category, o.unit, o.amount])).toEqual([
      ['allDirectDamagePercent', 10, 'all-direct-damage-percent', 'percent', 0.5],
      ['skillDamageFlat', 40, 'skill-damage-flat', 'points', 1],
      ['allDirectDamageFlat', 10, 'all-direct-damage-flat', 'points', 1],
      ['skillDamagePercent', 24, 'skill-damage-percent', 'percent', 1],
      ['skillBaseDamagePercent', 16, 'skill-base-damage-percent', 'percent', 3],
    ]);
    expect(SKILL_DAMAGE_SPARK_OUTCOMES.reduce((sum, o) => sum + o.weight, 0)).toBe(SPARK_WEIGHT_TOTAL);
    expect(SPARK_OUTCOME_KEYS.map(sparkOutcomeProbability)).toEqual([0.1, 0.4, 0.1, 0.24, 0.16]);
    // Integer weights make the probability sum exactly 1 (not merely close).
    expect(SKILL_DAMAGE_SPARK_OUTCOMES.reduce((sum, o) => sum + o.weight, 0) / SPARK_WEIGHT_TOTAL).toBe(1);
    expect(SKILL_DAMAGE_SPARK_MODEL_VERSION).toBe('skill-damage-sparks-v1');
    expect(MAX_SPARKS_PER_ITEM).toBe(110);
  });

  it('names outcomes with the selected skill and keeps All Direct outcomes generic', () => {
    expect(SKILL_DAMAGE_SPARK_OUTCOMES.map(o => sparkOutcomeText(o, 'Psychology'))).toEqual([
      '+0.5% All Direct Damage', '+1 Psychology Damage', '+1 All Direct Damage', '+1% Psychology Damage', '+3% Psychology Base Damage',
    ]);
  });

  it('supports exactly the four offensive loadout positions (OffHand and OffHandShield share one)', () => {
    expect(['MainHand', 'OffHand', 'OffHandShield', 'Ring', 'Necklace'].every(isOffensiveSparkSlot)).toBe(true);
    expect(['Head', 'Chest', 'Legs', 'Hands', 'Feet', 'Waist', 'Racial', ''].some(isOffensiveSparkSlot)).toBe(false);
  });
});

describe('T0015 seeded RNG', () => {
  it('hashes and generates deterministic unsigned 32-bit values without Math.random', () => {
    const original = Math.random;
    Math.random = () => { throw new Error('Math.random must not be used'); };
    try {
      expect(hashSeed('abc')).toEqual(hashSeed('abc'));
      expect(hashSeed('abc')).not.toEqual(hashSeed('abd'));
      const a = createSeededUint32('seed'), b = createSeededUint32('seed');
      const values = Array.from({ length: 50 }, () => a());
      expect(values).toEqual(Array.from({ length: 50 }, () => b()));
      expect(values.every(v => Number.isInteger(v) && v >= 0 && v < 2 ** 32)).toBe(true);
      expect(simulate(110).outcomeCounts).toEqual(simulate(110).outcomeCounts);
    } finally { Math.random = original; }
  });

  it('rejection sampling returns exact uniform integers and rejects the biased tail', () => {
    const values = [2 ** 32 - 1, 2 ** 32 - 96, 2 ** 32 - 97, 205];
    const next = () => values.shift()!;
    // 2^32 mod 100 = 96: the top 96 values are rejected.
    expect(uniformInt(next, 100)).toBe((2 ** 32 - 97) % 100);
    expect(uniformInt(next, 100)).toBe(5);
    expect(() => uniformInt(next, 0)).toThrow(RangeError);
  });
});

describe('T0015 simulateSkillDamageSparks', () => {
  it.each([0, 1, 37, 110])('records exactly %i outcomes', count => {
    const result = simulate(count);
    expect(result.modelVersion).toBe(SKILL_DAMAGE_SPARK_MODEL_VERSION);
    expect(Object.keys(result.outcomeCounts)).toEqual(SPARK_OUTCOME_KEYS);
    expect(totalSparkOutcomes(result.outcomeCounts)).toBe(count);
    expect(SPARK_OUTCOME_KEYS.every(key => Number.isSafeInteger(result.outcomeCounts[key]) && result.outcomeCounts[key] >= 0)).toBe(true);
  });

  it('zero Sparks produce zero outcomes and zero bonuses', () => {
    expect(simulate(0).outcomeCounts).toEqual(zeroSparkOutcomeCounts());
    expect(Object.values(sparkBonusTotals(simulate(0).outcomeCounts))).toEqual([0, 0, 0, 0, 0]);
  });

  it('reproduces fixed-seed results exactly (regression snapshot of model v1)', () => {
    expect(simulate(110, 'gorgon-t0015').outcomeCounts).toEqual(simulate(110, 'gorgon-t0015').outcomeCounts);
    const rolls = rollSkillDamageSparks('gorgon-t0015', 110);
    if (!rolls.ok) throw new Error('rolls');
    // Pinned so any change to the RNG, thresholds or ordering requires a new model version.
    expect(rolls.value.slice(0, 6)).toEqual(['skillDamagePercent', 'allDirectDamageFlat', 'skillDamagePercent', 'skillDamageFlat',
      'allDirectDamageFlat', 'allDirectDamagePercent']);
    expect(simulate(110, 'gorgon-t0015').outcomeCounts).toEqual({
      allDirectDamagePercent: 10, skillDamageFlat: 40, allDirectDamageFlat: 12, skillDamagePercent: 33, skillBaseDamagePercent: 15,
    });
  });

  it('a larger count extends the same seed stream (count n = first n rolls)', () => {
    const long = rollSkillDamageSparks('prefix', 110), short = rollSkillDamageSparks('prefix', 20);
    if (!long.ok || !short.ok) throw new Error('rolls');
    expect(long.value.slice(0, 20)).toEqual(short.value);
  });

  it('different seeds produce independently simulated rolls', () => {
    const sequences = ['a', 'b', 'c', 'seed-1', 'seed-2'].map(seed => {
      const rolls = rollSkillDamageSparks(seed, 110);
      if (!rolls.ok) throw new Error('rolls');
      return rolls.value.join(',');
    });
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it('the skill names the recipient but does not change the rolled outcomes', () => {
    expect(simulate(110, 'same', 'Psychology').outcomeCounts).toEqual(simulate(110, 'same', 'Cow').outcomeCounts);
  });

  it('every outcome occurs across a deterministic multi-seed sample in roughly its documented share', () => {
    // Deterministic (fixed seeds), so this can never fail randomly; bounds are generous sanity checks only.
    const totals = zeroSparkOutcomeCounts();
    for (let i = 0; i < 200; i++) {
      const counts = simulate(110, `sample-${i}`).outcomeCounts;
      for (const key of SPARK_OUTCOME_KEYS) totals[key] += counts[key];
    }
    const n = 200 * 110;
    for (const outcome of SKILL_DAMAGE_SPARK_OUTCOMES) {
      expect(Math.abs(totals[outcome.key] / n - outcome.weight / 100)).toBeLessThan(0.02);
    }
  });

  it.each([
    [{ skill: 'Psychology', count: -1, seed: 's' }, 'invalid-count'],
    [{ skill: 'Psychology', count: 111, seed: 's' }, 'invalid-count'],
    [{ skill: 'Psychology', count: 1.5, seed: 's' }, 'invalid-count'],
    [{ skill: 'Psychology', count: Number.NaN, seed: 's' }, 'invalid-count'],
    [{ skill: 'Psychology', count: '5' as unknown as number, seed: 's' }, 'invalid-count'],
    [{ skill: 'Psychology', count: 5, seed: '' }, 'invalid-seed'],
    [{ skill: 'Psychology', count: 5, seed: 'x'.repeat(129) }, 'invalid-seed'],
    [{ skill: '', count: 5, seed: 's' }, 'invalid-skill'],
    [{ skill: ' ', count: 5, seed: 's' }, 'invalid-skill'],
  ])('reports malformed input %j safely as %s', (input, code) => {
    const result = simulateSkillDamageSparks(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe(code);
  });
});

describe('T0015 analytical expected values', () => {
  it('matches the exact documented expectations for 110 Sparks', () => {
    const expected = expectedSkillDamageSparks(110);
    if (!expected.ok) throw new Error('expected');
    expect(expected.value.bonuses).toEqual({
      allDirectDamagePercent: 5.5, skillDamageFlat: 44, allDirectDamageFlat: 11, skillDamagePercent: 26.4, skillBaseDamagePercent: 52.8,
    });
    expect(expected.value.outcomeCounts).toEqual({
      allDirectDamagePercent: 11, skillDamageFlat: 44, allDirectDamageFlat: 11, skillDamagePercent: 26.4, skillBaseDamagePercent: 17.6,
    });
  });

  it.each([0, 1, 10, 25, 55, 109])('scales linearly with the count (%i Sparks)', count => {
    const expected = expectedSkillDamageSparks(count);
    if (!expected.ok) throw new Error('expected');
    const { bonuses } = expected.value;
    expect(bonuses.allDirectDamagePercent).toBeCloseTo(count * 0.1 * 0.5, 12);
    expect(bonuses.skillDamageFlat).toBeCloseTo(count * 0.4, 12);
    expect(bonuses.allDirectDamageFlat).toBeCloseTo(count * 0.1, 12);
    expect(bonuses.skillDamagePercent).toBeCloseTo(count * 0.24, 12);
    expect(bonuses.skillBaseDamagePercent).toBeCloseTo(count * 0.16 * 3, 12);
  });

  it('is independent of simulation: no seed input and simulated totals are not the expectation', () => {
    const expected = expectedSkillDamageSparks(110);
    if (!expected.ok) throw new Error('expected');
    const simulatedOutcomes = [0, 1, 2, 3].map(i => simulate(110, `independent-${i}`).outcomeCounts);
    // Simulated counts are whole numbers; the expected Skill % count (26.4) and Skill Base count (17.6) never are.
    for (const counts of simulatedOutcomes) expect(counts).not.toEqual(expected.value.outcomeCounts);
    expect(expectedSkillDamageSparks(110)).toEqual(expected);
  });

  it.each([-1, 111, 2.5])('rejects invalid count %s', count => {
    expect(expectedSkillDamageSparks(count).ok).toBe(false);
  });
});

describe('T0015 bonus totals and modifier values', () => {
  const counts: SparkOutcomeCounts = { allDirectDamagePercent: 11, skillDamageFlat: 44, allDirectDamageFlat: 11, skillDamagePercent: 26, skillBaseDamagePercent: 18 };

  it('computes exact display totals and normalized fraction/point values from counts', () => {
    expect(sparkBonusTotals(counts)).toEqual({ allDirectDamagePercent: 5.5, skillDamageFlat: 44, allDirectDamageFlat: 11, skillDamagePercent: 26, skillBaseDamagePercent: 54 });
    expect(SPARK_OUTCOME_KEYS.map(key => sparkModifierValue(key, counts[key]))).toEqual([0.055, 44, 11, 0.26, 0.54]);
    expect(sparkModifierValue('skillBaseDamagePercent', 1)).toBe(0.03);
    expect(sparkModifierValue('allDirectDamagePercent', 1)).toBe(0.005);
  });
});

describe('T0015 configuration evaluation', () => {
  const simulated = (count: number, seed: string, result = simulate(count, seed)): SparkConfiguration =>
    ({ mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count, seed }, result });

  it('accepts reproducible simulated results and manual results without RNG', () => {
    expect(evaluateSparkConfiguration({ mode: 'none' })).toEqual({ status: 'none' });
    const sim = evaluateSparkConfiguration(simulated(110, 'ok'));
    expect(sim).toMatchObject({ status: 'valid', mode: 'simulated', skillId: 'Psychology', total: 110, seed: 'ok', modelVersion: SKILL_DAMAGE_SPARK_MODEL_VERSION });
    const original = Math.random;
    Math.random = () => { throw new Error('RNG must not run'); };
    try {
      const counts = { allDirectDamagePercent: 1, skillDamageFlat: 2, allDirectDamageFlat: 3, skillDamagePercent: 4, skillBaseDamagePercent: 5 };
      expect(evaluateSparkConfiguration({ mode: 'actual', category: 'skill-damage', skillId: 'Cow', outcomeCounts: counts }))
        .toEqual({ status: 'valid', mode: 'actual', skillId: 'Cow', outcomeCounts: counts, total: 15, modelVersion: SKILL_DAMAGE_SPARK_MODEL_VERSION });
    } finally { Math.random = original; }
  });

  it('reports a simulation without a result as pending (no bonuses fabricated)', () => {
    expect(evaluateSparkConfiguration({ mode: 'simulated', input: { category: 'skill-damage', skillId: 'Cow', count: 5, seed: 'fixture' } }))
      .toMatchObject({ status: 'pending', issue: { code: 'result-missing' } });
  });

  it.each<[string, SparkConfiguration, string]>([
    ['unsupported model version', { ...simulated(10, 'v'), result: { modelVersion: 'fixture-only', outcomeCounts: simulate(10, 'v').outcomeCounts } } as SparkConfiguration, 'unsupported-model-version'],
    ['tampered counts', simulated(10, 'v', { modelVersion: SKILL_DAMAGE_SPARK_MODEL_VERSION, outcomeCounts: { ...zeroSparkOutcomeCounts(), skillBaseDamagePercent: 10 } }), 'result-mismatch'],
    ['count over 110', { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Cow', count: 111, seed: 'x' } }, 'invalid-count'],
    ['empty seed with result', { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Cow', count: 0, seed: '' },
      result: { modelVersion: SKILL_DAMAGE_SPARK_MODEL_VERSION, outcomeCounts: zeroSparkOutcomeCounts() } }, 'invalid-seed'],
    ['manual total over 110', { mode: 'actual', category: 'skill-damage', skillId: 'Cow', outcomeCounts: { ...zeroSparkOutcomeCounts(), skillDamageFlat: 111 } }, 'total-exceeds-maximum'],
    ['manual non-integer', { mode: 'actual', category: 'skill-damage', skillId: 'Cow', outcomeCounts: { ...zeroSparkOutcomeCounts(), skillDamageFlat: 0.5 } }, 'invalid-outcome-counts'],
    ['manual empty skill', { mode: 'actual', category: 'skill-damage', skillId: '', outcomeCounts: zeroSparkOutcomeCounts() }, 'invalid-skill'],
  ])('preserves but never applies %s', (_, sparks, code) => {
    expect(evaluateSparkConfiguration(sparks)).toMatchObject({ status: 'invalid', issue: { code } });
  });
});

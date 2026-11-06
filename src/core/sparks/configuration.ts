import type { SparkConfiguration, SparkOutcomeCounts } from '../build/document';
import { SKILL_DAMAGE_SPARK_MODEL_VERSION, SPARK_OUTCOME_KEYS, totalSparkOutcomes } from './model';
import {
  simulateSkillDamageSparks, sparkCountIssue, sparkOutcomeCountsIssue, sparkSeedIssue, sparkSkillIssue, type SparkIssue,
} from './simulate';

/**
 * Official Mastery Spark scrolls name Main-Hand Weapons, Off-Hand Weapons, Ring-slot and Necklace-slot equipment
 * (v490 items SparkMainHand/SparkOffHand/SparkRing/SparkNecklace). OffHand and OffHandShield share one exclusive loadout
 * position (T0009-F1), so a shield in that position is planned like an offhand; shield eligibility is unconfirmed.
 */
export const OFFENSIVE_SPARK_SLOTS: readonly string[] = Object.freeze(['MainHand', 'OffHand', 'OffHandShield', 'Ring', 'Necklace']);

export function isOffensiveSparkSlot(slot: string): boolean {
  return OFFENSIVE_SPARK_SLOTS.includes(slot);
}

export type SparkEvaluation =
  | { readonly status: 'none' }
  /** Valid saved outcomes whose bonuses may be applied (still subject to active-skill and slot rules). */
  | {
    readonly status: 'valid';
    readonly mode: 'simulated' | 'actual';
    readonly skillId: string;
    readonly outcomeCounts: SparkOutcomeCounts;
    readonly total: number;
    readonly modelVersion: typeof SKILL_DAMAGE_SPARK_MODEL_VERSION;
    /** Simulated only. */
    readonly seed?: string;
  }
  /** Simulated input without a saved result: no bonuses until the user simulates. */
  | { readonly status: 'pending'; readonly mode: 'simulated'; readonly skillId: string | null; readonly issue: SparkIssue }
  /** Preserved but never applied: malformed input/counts, unknown model version or a non-reproducible result. */
  | { readonly status: 'invalid'; readonly mode: 'simulated' | 'actual'; readonly skillId: string | null; readonly issue: SparkIssue };

const skillOf = (skillId: unknown) => typeof skillId === 'string' && skillId.trim() ? skillId : null;

/**
 * Pure semantic check of a schema-valid Spark configuration. Saved simulated results are re-simulated from their saved
 * skill/count/seed and only accepted when the model version and every outcome count match. Never invokes RNG for
 * actual results and never substitutes expected values.
 */
export function evaluateSparkConfiguration(sparks: SparkConfiguration): SparkEvaluation {
  if (sparks.mode === 'none') return { status: 'none' };
  if (sparks.mode === 'actual') {
    const skillId = skillOf(sparks.skillId);
    const issue = (sparks.category === 'skill-damage' ? null : { code: 'invalid-outcome-counts' as const, message: 'Only Skill Damage Sparks are supported.' })
      ?? sparkSkillIssue(sparks.skillId) ?? sparkOutcomeCountsIssue(sparks.outcomeCounts);
    if (issue) return { status: 'invalid', mode: 'actual', skillId, issue };
    const outcomeCounts = pickCounts(sparks.outcomeCounts);
    return { status: 'valid', mode: 'actual', skillId: sparks.skillId, outcomeCounts, total: totalSparkOutcomes(outcomeCounts), modelVersion: SKILL_DAMAGE_SPARK_MODEL_VERSION };
  }
  const { input, result } = sparks;
  const skillId = skillOf(input.skillId);
  const inputIssue = (input.category === 'skill-damage' ? null : { code: 'invalid-skill' as const, message: 'Only Skill Damage Sparks are supported.' })
    ?? sparkSkillIssue(input.skillId) ?? sparkCountIssue(input.count) ?? sparkSeedIssue(input.seed);
  if (!result) {
    return inputIssue ? { status: 'invalid', mode: 'simulated', skillId, issue: inputIssue }
      : { status: 'pending', mode: 'simulated', skillId, issue: { code: 'result-missing', message: 'Spark simulation has not been run yet.' } };
  }
  if (inputIssue) return { status: 'invalid', mode: 'simulated', skillId, issue: inputIssue };
  if (result.modelVersion !== SKILL_DAMAGE_SPARK_MODEL_VERSION) {
    return { status: 'invalid', mode: 'simulated', skillId, issue: { code: 'unsupported-model-version',
      message: `Saved with Spark model ${result.modelVersion}; this planner reproduces ${SKILL_DAMAGE_SPARK_MODEL_VERSION} only. Simulate again to apply.` } };
  }
  const countsIssue = sparkOutcomeCountsIssue(result.outcomeCounts);
  const expected = simulateSkillDamageSparks({ skill: input.skillId, count: input.count, seed: input.seed });
  if (countsIssue || !expected.ok || !SPARK_OUTCOME_KEYS.every(key => expected.value.outcomeCounts[key] === result.outcomeCounts[key])) {
    return { status: 'invalid', mode: 'simulated', skillId, issue: countsIssue ?? { code: 'result-mismatch',
      message: 'Saved simulated outcomes are not reproduced by the saved seed and count. Simulate again to apply.' } };
  }
  const outcomeCounts = pickCounts(result.outcomeCounts);
  return { status: 'valid', mode: 'simulated', skillId: input.skillId, outcomeCounts, total: input.count, modelVersion: SKILL_DAMAGE_SPARK_MODEL_VERSION, seed: input.seed };
}

function pickCounts(counts: SparkOutcomeCounts): SparkOutcomeCounts {
  return Object.fromEntries(SPARK_OUTCOME_KEYS.map(key => [key, counts[key]])) as unknown as SparkOutcomeCounts;
}

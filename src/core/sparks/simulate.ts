import type { SparkOutcomeCounts, SparkSimulationResult } from '../build/document';
import {
  MAX_SPARKS_PER_ITEM, SKILL_DAMAGE_SPARK_MODEL_VERSION, SKILL_DAMAGE_SPARK_OUTCOMES, SPARK_OUTCOME_KEYS, SPARK_WEIGHT_TOTAL,
  zeroSparkOutcomeCounts, type SparkOutcomeKey,
} from './model';
import { createSeededUint32, uniformInt } from './rng';

export type SparkIssueCode =
  | 'invalid-count'            // not an integer 0..MAX_SPARKS_PER_ITEM
  | 'invalid-seed'             // empty, too long or not a string
  | 'invalid-skill'            // missing/empty skill ID
  | 'invalid-outcome-counts'   // malformed counts (non-integer, negative, unknown/missing keys)
  | 'total-exceeds-maximum'    // outcome counts total more than MAX_SPARKS_PER_ITEM
  | 'result-missing'           // simulated input without a saved result
  | 'unsupported-model-version'
  | 'result-mismatch';         // saved counts are not reproduced by the saved input under this model

export interface SparkIssue {
  readonly code: SparkIssueCode;
  readonly message: string;
}

export type SparkResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: SparkIssue };

/** Longest accepted seed. The UI generates short hexadecimal seeds; any non-empty string is reproducible. */
export const MAX_SPARK_SEED_LENGTH = 128;

export interface SimulateSkillDamageSparksInput {
  /** Official skill ID receiving the skill-scoped outcomes. It does not change the random stream. */
  readonly skill: string;
  readonly count: number;
  readonly seed: string;
}

export function sparkCountIssue(count: unknown): SparkIssue | null {
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= MAX_SPARKS_PER_ITEM ? null
    : { code: 'invalid-count', message: `Spark count must be a whole number from 0 to ${MAX_SPARKS_PER_ITEM}.` };
}

export function sparkSeedIssue(seed: unknown): SparkIssue | null {
  return typeof seed === 'string' && seed.length > 0 && seed.length <= MAX_SPARK_SEED_LENGTH ? null
    : { code: 'invalid-seed', message: `Seed must be a non-empty string of at most ${MAX_SPARK_SEED_LENGTH} characters.` };
}

export function sparkSkillIssue(skill: unknown): SparkIssue | null {
  return typeof skill === 'string' && skill.trim().length > 0 ? null : { code: 'invalid-skill', message: 'Choose a combat skill for Skill Damage Sparks.' };
}

/** Nonnegative integer counts for exactly the five outcome keys, totalling at most MAX_SPARKS_PER_ITEM. */
export function sparkOutcomeCountsIssue(counts: unknown): SparkIssue | null {
  if (counts === null || typeof counts !== 'object' || Array.isArray(counts)) {
    return { code: 'invalid-outcome-counts', message: 'Outcome counts are missing.' };
  }
  const record = counts as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== SPARK_OUTCOME_KEYS.length || !SPARK_OUTCOME_KEYS.every(key => Object.hasOwn(record, key))) {
    return { code: 'invalid-outcome-counts', message: 'Outcome counts must list exactly the five Skill Damage Spark outcomes.' };
  }
  if (!SPARK_OUTCOME_KEYS.every(key => { const n = record[key]; return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0; })) {
    return { code: 'invalid-outcome-counts', message: 'Each outcome count must be a whole number of 0 or more.' };
  }
  const total = SPARK_OUTCOME_KEYS.reduce((sum, key) => sum + (record[key] as number), 0);
  return total <= MAX_SPARKS_PER_ITEM ? null
    : { code: 'total-exceeds-maximum', message: `Outcome counts total ${total}; one item supports at most ${MAX_SPARKS_PER_ITEM} Sparks.` };
}

/** Cumulative whole-percent thresholds in outcome-table order (10, 50, 60, 84, 100). */
const THRESHOLDS = SKILL_DAMAGE_SPARK_OUTCOMES.reduce<{ key: SparkOutcomeKey; upper: number }[]>((list, outcome) =>
  [...list, { key: outcome.key, upper: (list.at(-1)?.upper ?? 0) + outcome.weight }], []);

/**
 * The ordered roll sequence for a seed. Roll i draws an exactly uniform integer r in [0, 100) and selects the first
 * outcome whose cumulative weight exceeds r. A count of n yields the first n rolls of the seed's stream.
 */
export function rollSkillDamageSparks(seed: string, count: number): SparkResult<SparkOutcomeKey[]> {
  const issue = sparkSeedIssue(seed) ?? sparkCountIssue(count);
  if (issue) return { ok: false, issue };
  const next = createSeededUint32(seed);
  const rolls: SparkOutcomeKey[] = [];
  for (let i = 0; i < count; i++) {
    const r = uniformInt(next, SPARK_WEIGHT_TOTAL);
    rolls.push(THRESHOLDS.find(threshold => r < threshold.upper)!.key);
  }
  return { ok: true, value: rolls };
}

/**
 * Pure, deterministic Skill Damage Spark simulation. Identical inputs always produce identical outcome counts, which
 * sum to `count`. Invalid inputs are reported, never thrown or clamped.
 */
export function simulateSkillDamageSparks({ skill, count, seed }: SimulateSkillDamageSparksInput): SparkResult<SparkSimulationResult> {
  const issue = sparkSkillIssue(skill);
  if (issue) return { ok: false, issue };
  const rolls = rollSkillDamageSparks(seed, count);
  if (!rolls.ok) return rolls;
  const outcomeCounts: SparkOutcomeCounts = zeroSparkOutcomeCounts();
  for (const key of rolls.value) outcomeCounts[key] += 1;
  return { ok: true, value: { modelVersion: SKILL_DAMAGE_SPARK_MODEL_VERSION, outcomeCounts } };
}

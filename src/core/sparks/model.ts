import type { SparkOutcomeCounts } from '../build/document';

/**
 * T0015 Skill Damage Mastery Spark model. Every simulated Spark produces exactly one of five outcomes.
 *
 * Probabilities are whole-percent integer weights (product decision, docs/Product_Decisions.md) so that sampling,
 * totals and expected values are exact. Change the version whenever weights, values, ordering or the RNG change:
 * saved simulated results record it and are only reproduced (and applied) under the same version.
 */
export const SKILL_DAMAGE_SPARK_MODEL_VERSION = 'skill-damage-sparks-v1' as const;

/** Modeled planning limit for one Mastercrafted/Prophecied item (MainHand, OffHand, Ring, Necklace). */
export const MAX_SPARKS_PER_ITEM = 110;

/** Integer weights total exactly this value (whole percent). */
export const SPARK_WEIGHT_TOTAL = 100;

export type SparkOutcomeKey = keyof SparkOutcomeCounts;

/** Normalized modifier category of each outcome (core/calculation ModifierCategory spelling). */
export type SparkOutcomeCategory =
  | 'all-direct-damage-percent' | 'skill-damage-flat' | 'all-direct-damage-flat' | 'skill-damage-percent' | 'skill-base-damage-percent';

export interface SkillDamageSparkOutcome {
  readonly key: SparkOutcomeKey;
  /** Whole-percent probability weight. */
  readonly weight: number;
  readonly category: SparkOutcomeCategory;
  /** `percent`: amount is percentage points (0.5 = +0.50%); `points`: flat damage points. */
  readonly unit: 'percent' | 'points';
  /** Bonus granted by one outcome, in `unit`. */
  readonly amount: number;
  /** Skill-scoped outcomes name the configured skill; All Direct outcomes follow direct-damage applicability. */
  readonly scope: 'skill' | 'all-direct';
  /** Short label without the skill name, e.g. "Skill Base Damage". */
  readonly label: string;
}

/** Fixed order: sampling thresholds, display and saved outcome keys all follow this table. */
export const SKILL_DAMAGE_SPARK_OUTCOMES: readonly SkillDamageSparkOutcome[] = Object.freeze([
  { key: 'allDirectDamagePercent', weight: 10, category: 'all-direct-damage-percent', unit: 'percent', amount: 0.5, scope: 'all-direct', label: 'All Direct Damage' },
  { key: 'skillDamageFlat', weight: 40, category: 'skill-damage-flat', unit: 'points', amount: 1, scope: 'skill', label: 'Skill Damage' },
  { key: 'allDirectDamageFlat', weight: 10, category: 'all-direct-damage-flat', unit: 'points', amount: 1, scope: 'all-direct', label: 'All Direct Damage' },
  { key: 'skillDamagePercent', weight: 24, category: 'skill-damage-percent', unit: 'percent', amount: 1, scope: 'skill', label: 'Skill Damage' },
  { key: 'skillBaseDamagePercent', weight: 16, category: 'skill-base-damage-percent', unit: 'percent', amount: 3, scope: 'skill', label: 'Skill Base Damage' },
].map(outcome => Object.freeze(outcome)) as SkillDamageSparkOutcome[]);

export const SPARK_OUTCOME_KEYS: readonly SparkOutcomeKey[] = Object.freeze(SKILL_DAMAGE_SPARK_OUTCOMES.map(outcome => outcome.key));

export function sparkOutcome(key: SparkOutcomeKey): SkillDamageSparkOutcome {
  return SKILL_DAMAGE_SPARK_OUTCOMES.find(outcome => outcome.key === key)!;
}

/** Probability as a fraction (0.1 for 10%). */
export function sparkOutcomeProbability(key: SparkOutcomeKey): number {
  return sparkOutcome(key).weight / SPARK_WEIGHT_TOTAL;
}

export function zeroSparkOutcomeCounts(): SparkOutcomeCounts {
  return { allDirectDamagePercent: 0, skillDamageFlat: 0, allDirectDamageFlat: 0, skillDamagePercent: 0, skillBaseDamagePercent: 0 };
}

export function totalSparkOutcomes(counts: SparkOutcomeCounts): number {
  return SPARK_OUTCOME_KEYS.reduce((total, key) => total + counts[key], 0);
}

/** Display text for one outcome, e.g. "+0.5% All Direct Damage" or "+1 Psychology Damage". */
export function sparkOutcomeText(outcome: SkillDamageSparkOutcome, skillName: string | null): string {
  const amount = outcome.unit === 'percent' ? `+${outcome.amount}%` : `+${outcome.amount}`;
  const name = outcome.scope === 'skill' && skillName ? outcome.label.replace('Skill', skillName) : outcome.label;
  return `${amount} ${name}`;
}

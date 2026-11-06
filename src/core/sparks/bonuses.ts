import type { SparkOutcomeCounts } from '../build/document';
import { SKILL_DAMAGE_SPARK_OUTCOMES, SPARK_WEIGHT_TOTAL, sparkOutcome, type SparkOutcomeKey } from './model';
import { sparkCountIssue, type SparkResult } from './simulate';

/**
 * Bonus totals per outcome in display units: percentage points for percent outcomes (5.5 = +5.5%), points for flat
 * outcomes. Same keys as the outcome counts.
 */
export type SparkBonusTotals = Readonly<Record<SparkOutcomeKey, number>>;

/** Exact bonus totals of actual or simulated outcome counts (count × per-outcome amount). */
export function sparkBonusTotals(counts: SparkOutcomeCounts): SparkBonusTotals {
  return Object.fromEntries(SKILL_DAMAGE_SPARK_OUTCOMES.map(outcome => [outcome.key, counts[outcome.key] * outcome.amount])) as SparkBonusTotals;
}

/**
 * Normalized modifier value for `count` outcomes of one kind: a fraction for percent outcomes (11 × 0.5% = 0.055),
 * points for flats. Computed as one integer-numerator division so values are correctly rounded doubles.
 */
export function sparkModifierValue(key: SparkOutcomeKey, count: number): number {
  const outcome = sparkOutcome(key);
  return outcome.unit === 'percent' ? (count * outcome.amount * 10) / 1000 : count * outcome.amount;
}

export interface ExpectedSparkValues {
  readonly count: number;
  /** Mean number of each outcome (count × probability); fractional. */
  readonly outcomeCounts: SparkBonusTotals;
  /** Mean bonus totals in display units (percentage points / points). */
  readonly bonuses: SparkBonusTotals;
}

/**
 * Analytical expectation for `count` Sparks, independent of any seed or simulation. Linear in count; for 110 Sparks:
 * +5.5% All Direct, +44 Skill flat, +11 All Direct flat, +26.4% Skill, +52.8% Skill Base.
 * Each value is one exact integer numerator divided once, e.g. 110 × 16 × 3 / 100 = 52.8.
 */
export function expectedSkillDamageSparks(count: number): SparkResult<ExpectedSparkValues> {
  const issue = sparkCountIssue(count);
  if (issue) return { ok: false, issue };
  const entries = SKILL_DAMAGE_SPARK_OUTCOMES.map(outcome => ({
    key: outcome.key,
    count: (count * outcome.weight) / SPARK_WEIGHT_TOTAL,
    // amount × 10 keeps 0.5-point amounts integral before the single division.
    bonus: (count * outcome.weight * outcome.amount * 10) / (SPARK_WEIGHT_TOTAL * 10),
  }));
  return {
    ok: true,
    value: {
      count,
      outcomeCounts: Object.fromEntries(entries.map(entry => [entry.key, entry.count])) as SparkBonusTotals,
      bonuses: Object.fromEntries(entries.map(entry => [entry.key, entry.bonus])) as SparkBonusTotals,
    },
  };
}

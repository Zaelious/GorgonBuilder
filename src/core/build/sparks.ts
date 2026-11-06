import type { EquipmentSelection, SparkConfiguration, SparkOutcomeCounts } from './document';
import type { GameDataRepository } from '../../data/repository/repository';
import { isOffhandSlot } from './slots';
import { SPARK_OUTCOME_KEYS } from '../sparks/model';
import { simulateSkillDamageSparks, sparkOutcomeCountsIssue } from '../sparks/simulate';
import { isOffensiveSparkSlot } from '../sparks/configuration';

/** What the user asked for; simulated results are always computed here, never supplied by the caller. */
export type SparkRequest =
  | { readonly mode: 'none' }
  | { readonly mode: 'simulated'; readonly skillId: string; readonly count: number; readonly seed: string }
  | { readonly mode: 'actual'; readonly skillId: string; readonly outcomeCounts: SparkOutcomeCounts };

export type SparkEdit = { type: 'sparks-set'; equipmentIndex: number; sparks: SparkRequest };

/**
 * Immutable Spark update for one equipment selection. Returns the same selection for invalid/no-op requests:
 * unsupported slots, non-combat or unknown skills, invalid counts/seeds/manual totals, or an offhand position that
 * holds a legacy conflict (one exclusive position must not create two Spark sources). Clearing is always allowed.
 * Instance data, candidate mods and the canonical slot are never touched.
 */
export function editSparks(selection: EquipmentSelection, request: SparkRequest, data: Pick<GameDataRepository, 'getSkill'>,
  options: { offhandConflict?: boolean } = {}): EquipmentSelection {
  let sparks: SparkConfiguration;
  if (request.mode === 'none') {
    if (selection.sparks.mode === 'none') return selection;
    sparks = { mode: 'none' };
  } else {
    if (!isOffensiveSparkSlot(selection.slot) || (options.offhandConflict && isOffhandSlot(selection.slot))) return selection;
    if (!data.getSkill(request.skillId)?.combat) return selection;
    if (request.mode === 'simulated') {
      const result = simulateSkillDamageSparks({ skill: request.skillId, count: request.count, seed: request.seed });
      if (!result.ok) return selection;
      sparks = { mode: 'simulated', input: { category: 'skill-damage', skillId: request.skillId, count: request.count, seed: request.seed }, result: result.value };
    } else {
      if (sparkOutcomeCountsIssue(request.outcomeCounts)) return selection;
      const outcomeCounts = Object.fromEntries(SPARK_OUTCOME_KEYS.map(key => [key, request.outcomeCounts[key]])) as unknown as SparkOutcomeCounts;
      sparks = { mode: 'actual', category: 'skill-damage', skillId: request.skillId, outcomeCounts };
    }
  }
  return JSON.stringify(sparks) === JSON.stringify(selection.sparks) ? selection : { ...selection, sparks };
}

/** Sparks belong to the physical item: replacing it with a different item clears them (T0015). */
export function sparksAfterReplacement(previous: EquipmentSelection): SparkConfiguration {
  return previous.sparks.mode === 'none' ? previous.sparks : { mode: 'none' };
}

import type { EquipmentSelection } from '../../core/build/document';
import type { GameDataRepository } from '../repository/repository';
import { browseTreasurePowers, indexTreasurePowers, treasureRelevance, type TreasureContext } from './treasure';
import { availableTreasurePowers, groupEffectiveMods, groupTreasurePowers, type ModCategories } from './treasure-planning';

export interface AvailableModFilters {
  query: string;
  categories: ModCategories;
  allSkills: boolean;
  allSlots: boolean;
}

/** One Available entry per power, including powers without a tier at the preview target.
 * Preview levels choose displayed tiers; they have never filtered powers or established legality.
 * Historical imported metadata is not an effective selection or an exclusion.
 */
export function selectAvailableMods(selection: EquipmentSelection, context: TreasureContext,
  skillA: string | null, skillB: string | null, filters: AvailableModFilters, data: GameDataRepository,
  index = indexTreasurePowers(data.treasurePowers)) {
  const relevance = new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)]));
  const effective = groupEffectiveMods(selection, skillA, skillB, data);
  const staged = new Set(effective.map(row => row.mod.powerId));
  const matches = availableTreasurePowers(browseTreasurePowers(index, filters.query, relevance, 'relevant'),
    relevance, staged, filters.allSlots, data, context.skillIds);
  const groups = groupTreasurePowers(matches, context.skillIds, filters.categories, filters.allSkills, data);
  return { relevance, effective, groups, count: groups.reduce((count, group) => count + group.powers.length, 0) };
}

export type AvailableMods = ReturnType<typeof selectAvailableMods>;

/** Empty display rows have no expanded Available list. Legacy multi-entry rows count each displayed list. */
export function equipmentRowMatches(count: number, searching: boolean, showAll: boolean): boolean {
  return !searching || showAll || count > 0;
}

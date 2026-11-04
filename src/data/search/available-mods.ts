import type { EquipmentSelection } from '../../core/build/document';
import type { GameDataRepository } from '../repository/repository';
import { browseTreasurePowers, indexTreasurePowers, normalizeTreasureSearch, treasureRelevance, type TreasureContext } from './treasure';
import { availableTreasurePowers, groupEffectiveMods, groupTreasurePowers, type ModCategories } from './treasure-planning';

export interface AvailableModFilters {
  query: string;
  categories: ModCategories;
  allSkills: boolean;
  allSlots: boolean;
}

/** Prepared once per equipment definition/active-skill set, independently of query and working edits. */
export function prepareModSearch(context: TreasureContext, data: GameDataRepository,
  index = indexTreasurePowers(data.treasurePowers)) {
  return { relevance: new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)])),
    textByPowerId: new Map(index.map(entry => [entry.power.id, entry.text])) };
}

export type PreparedModSearch = ReturnType<typeof prepareModSearch>;

export const effectiveModKey = (row: { origin: string; index: number }) => `${row.origin}:${row.index}`;

/** One Available entry per power, including powers without a tier at the preview target.
 * Preview levels choose displayed tiers; they have never filtered powers or established legality.
 * Historical imported metadata is not an effective selection or an exclusion.
 */
export function selectAvailableMods(selection: EquipmentSelection, context: TreasureContext,
  skillA: string | null, skillB: string | null, filters: AvailableModFilters, data: GameDataRepository,
  index = indexTreasurePowers(data.treasurePowers), prepared = prepareModSearch(context, data, index)) {
  const { relevance, textByPowerId } = prepared;
  const effective = groupEffectiveMods(selection, skillA, skillB, data);
  const staged = new Set(effective.map(row => row.mod.powerId));
  const matches = availableTreasurePowers(browseTreasurePowers(index, filters.query, relevance, 'relevant'),
    relevance, staged, filters.allSlots, data, context.skillIds);
  const groups = groupTreasurePowers(matches, context.skillIds, filters.categories, filters.allSkills, data);
  const query = normalizeTreasureSearch(filters.query);
  // Working selections remain discoverable regardless of Available skill/category/profile filters.
  // Unknown IDs and exact saved tiers are searchable; original metadata never contributes.
  const selected = effective.filter(row => [textByPowerId.get(row.mod.powerId) ?? '',
    normalizeTreasureSearch(`${row.mod.powerId} ${row.mod.tierId ?? ''}`)].some(text => text.includes(query)));
  const selectedKeys = new Set(selected.map(effectiveModKey));
  return { relevance, effective, groups, selected, selectedKeys, selectedCount: selected.length, count: groups.reduce((count, group) => count + group.powers.length, 0) };
}

export type AvailableMods = ReturnType<typeof selectAvailableMods>;

/** Empty display rows have no expanded Available list. Legacy multi-entry rows count each displayed list. */
export function equipmentRowMatches(count: number, searching: boolean, showAll: boolean): boolean {
  return !searching || showAll || count > 0;
}

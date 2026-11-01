import type { NormalizedItem } from '../normalized/items-treasure';
import type { Runtime } from '../repository/contracts';

export type EquipmentDefinition = Runtime<NormalizedItem>;

/** Literal substring search with one explicit, symmetric synonym group.
 * Underscores become spaces so published effect tokens are searchable too.
 */
export function normalizeEquipmentSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[_\s]+/gu, ' ').trim()
    .replace(/\b(?:lightning|electricity)\b/gu, 'electricity');
}

export function equipmentSearchText(item: EquipmentDefinition): string {
  return normalizeEquipmentSearch([
    item.id, item.internalName, item.displayName, item.description,
    ...(item.keywords ?? []), ...(item.fixedEffects ?? []).map(effect => effect.description),
  ].join(' '));
}

export function matchesEquipmentText(text: string, query: string): boolean {
  return normalizeEquipmentSearch(text).includes(normalizeEquipmentSearch(query));
}

export interface EquipmentFilters {
  query?: string;
  /** Exact official slot, without aliases or inferred mappings. */
  slot?: string;
  minimumTargetLevel: number | null;
  includeUnknownTargetLevel: boolean;
}

export function matchesTargetLevel(level: number | null, minimum: number | null, includeUnknown: boolean): boolean {
  if (minimum === null || minimum <= 0) return true;
  return level === null ? includeUnknown : level >= minimum;
}

/** Definitions only. Filters never modify a build or imported item instance. */
export function filterEquipment<T extends EquipmentDefinition>(items: readonly T[], filters: EquipmentFilters): T[] {
  const query = normalizeEquipmentSearch(filters.query ?? '');
  return items.filter(item =>
    (filters.slot === undefined || item.slot === filters.slot) &&
    matchesTargetLevel(item.level, filters.minimumTargetLevel, filters.includeUnknownTargetLevel) &&
    (query === '' || equipmentSearchText(item).includes(query)));
}

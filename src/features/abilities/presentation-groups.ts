import { groupAbilities, type Ability, type AbilityGroup } from './groups';

/**
 * Exact canonical v490 IDs from the seven customer-reported lists.
 * This is presentation only. Every original UpgradeOf family remains intact inside `variants`.
 * Internal/proc abilities without UpgradeOf are individual choices, NOT invented upgrade tiers.
 */
const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, offset) => `ability_${start + offset}`);

export const SPECIFIED_VARIANT_FAMILIES = [
  { skillId: 'Vampirism', name: 'Blood Mist', ids: [...range(4866, 4874), ...range(4971, 4995)] },
  { skillId: 'AnimalHandling', name: 'Call Stabled Pet', ids: range(2010, 2016) },
  { skillId: 'Bard', name: 'Song of Discord (internal SoD)', ids: range(8621, 8633) },
  { skillId: 'Mentalism', name: 'Mindworm', ids: [...range(8027, 8037), ...range(8041, 8052)] },
  { skillId: 'Necromancy', name: 'Super Zombie (internal SZ)', ids: [
    'ability_3273', 'ability_3274', 'ability_3275', 'ability_3276', 'ability_3277', 'ability_3278',
    'ability_3279', 'ability_3292', 'ability_2234', 'ability_2278', 'ability_2279',
  ] },
  { skillId: 'Priest', name: 'Triage', ids: [...range(9081, 9091), ...range(9101, 9111)] },
  { skillId: 'Priest', name: 'Flamestrike', ids: [...range(9061, 9071), ...range(9211, 9234)] },
] as const;

export interface PickerAbilityGroup extends AbilityGroup {
  /** One or more original, canonical UpgradeOf connected components. */
  variants: AbilityGroup[];
  /** Distinct ability identity must be chosen before a tier; no quick-add for this group. */
  isVariantFamily: boolean;
}

export function groupPickerAbilities(abilities: readonly Ability[]): PickerAbilityGroup[] {
  const ordinaryGroups = groupAbilities(abilities);
  const byId = new Map(ordinaryGroups.flatMap(group => group.abilities.map(ability => [ability.id, group] as const)));
  const claimed = new Set<string>();
  const grouped: PickerAbilityGroup[] = [];
  for (const spec of SPECIFIED_VARIANT_FAMILIES) {
    const present = spec.ids.map(id => abilities.find(ability => ability.id === id && ability.skill.skillId === spec.skillId));
    // Do not group partial or changed source families as if they were verified. Ordinary groups remain accessible.
    if (present.some(ability => !ability)) continue;
    const memberIds = new Set(spec.ids);
    const originals = [...new Set(spec.ids.map(id => byId.get(id)))].filter((g): g is AbilityGroup => !!g);
    if (originals.length < 2 || originals.some(group => group.abilities.some(a => !memberIds.has(a.id)))) continue;
    originals.sort((a, b) => a.abilities[0]!.level - b.abilities[0]!.level || a.id.localeCompare(b.id));
    grouped.push({
      id: `variant:${spec.skillId}:${spec.name}`, name: spec.name,
      abilities: originals.flatMap(group => group.abilities), variants: originals, isVariantFamily: true,
    });
    originals.forEach(group => claimed.add(group.id));
  }
  for (const group of ordinaryGroups) if (!claimed.has(group.id)) grouped.push({
    ...group, variants: [group], isVariantFamily: false,
  });
  return grouped.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

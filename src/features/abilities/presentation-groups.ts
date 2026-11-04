import { groupAbilities, type Ability, type AbilityGroup } from './groups';

const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, offset) => `ability_${start + offset}`);

/**
 * Exact verified v490 IDs and InternalName sub-series. These are visual sections, not new
 * UpgradeOf edges or invented Rank fields. In particular, numbered StabledPet, SoD and SZ
 * internals remain separate official abilities, even when listed together in a compact section.
 */
const VERIFIED_VARIANTS = [
  { skillId: 'Vampirism', name: 'Blood Mist', variants: [
    { key: 'standard', name: 'Blood Mist', ids: range(4866, 4874) },
    { key: 'burst-a', name: 'Blood Mist — TSys Burst', ids: [...range(4971, 4977), 'ability_4994', 'ability_4995'] },
    { key: 'burst-b', name: 'Blood Mist — TSys Burst B', ids: range(4978, 4985) },
    { key: 'burst-c', name: 'Blood Mist — TSys Burst C', ids: range(4986, 4993) },
  ] },
  { skillId: 'AnimalHandling', name: 'Call Stabled Pet', variants: [
    { key: 'numbered', name: 'Choose stabled pet #1–#7', ids: range(2010, 2016) },
  ] },
  { skillId: 'Bard', name: 'Song of Discord (internal SoD)', variants: [
    { key: 'sod', name: 'SoD1–SoD13 (internal)', ids: range(8621, 8633) },
  ] },
  { skillId: 'Mentalism', name: 'Mindworm', variants: [
    { key: 'standard', name: 'Mindworm', ids: range(8027, 8037) },
    { key: 'bonus', name: 'TSysBonusMindworm0–11 (internal)', ids: range(8041, 8052) },
  ] },
  { skillId: 'Necromancy', name: 'Super Zombie (internal SZ)', variants: [
    { key: 'sz', name: 'SZ1–SZ11 (internal)', ids: [
      ...range(3273, 3279), 'ability_3292', 'ability_2234', 'ability_2278', 'ability_2279',
    ] },
  ] },
  { skillId: 'Priest', name: 'Triage', variants: [
    { key: 'standard', name: 'Triage', ids: range(9081, 9091) },
    { key: 'internal', name: 'TriageInternal1–11', ids: range(9101, 9111) },
  ] },
  { skillId: 'Priest', name: 'Flamestrike', variants: [
    { key: 'standard', name: 'Flamestrike', ids: range(9061, 9071) },
    { key: 'auto-a', name: 'FlamestrikeAutoA1–12', ids: range(9211, 9222) },
    { key: 'auto-b', name: 'FlamestrikeAutoB1–12', ids: range(9223, 9234) },
  ] },
] as const;

export const SPECIFIED_VARIANT_FAMILIES = VERIFIED_VARIANTS.map(spec => ({
  ...spec, ids: spec.variants.flatMap(variant => [...variant.ids]),
}));

/** Preserved canonical UpgradeOf components underneath one compact, source-verified display variant. */
export interface PickerVariant extends AbilityGroup {
  canonicalGroups: AbilityGroup[];
}

export interface PickerAbilityGroup extends AbilityGroup {
  variants: PickerVariant[];
  isVariantFamily: boolean;
}

/** Group exactly the approved source records; ordinary skills keep their original UpgradeOf grouping. */
export function groupPickerAbilities(abilities: readonly Ability[]): PickerAbilityGroup[] {
  const originals = groupAbilities(abilities);
  const byAbilityId = new Map(originals.flatMap(group => group.abilities.map(ability => [ability.id, group] as const)));
  const byId = new Map(abilities.map(ability => [ability.id, ability] as const));
  const claimed = new Set<string>();
  const grouped: PickerAbilityGroup[] = [];
  for (const spec of SPECIFIED_VARIANT_FAMILIES) {
    const distinct = new Set(spec.ids);
    if (distinct.size !== spec.ids.length ||
      !spec.ids.every(id => byId.get(id)?.skill.skillId === spec.skillId)) continue;

    let valid = true;
    const variants: PickerVariant[] = spec.variants.map(variant => {
      const members = new Set<string>(variant.ids);
      const canonicalGroups = [...new Set(variant.ids.map(id => byAbilityId.get(id)))].filter((group): group is AbilityGroup => !!group);
      if (canonicalGroups.some(group => group.abilities.some(ability => !members.has(ability.id)))) valid = false;
      const entries = canonicalGroups.flatMap(group => group.abilities);
      entries.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
      return { id: `variant:${spec.skillId}:${spec.name}:${variant.key}`, name: variant.name, abilities: entries, canonicalGroups };
    });
    const sourceGroups = [...new Set(variants.flatMap(variant => variant.canonicalGroups))];
    if (!valid || sourceGroups.length < 2 ||
      sourceGroups.some(group => group.abilities.some(ability => !distinct.has(ability.id)))) continue;
    const entries = variants.flatMap(variant => variant.abilities);
    if (entries.length !== distinct.size) continue;
    grouped.push({
      id: `variants:${spec.skillId}:${spec.name}`, name: spec.name,
      abilities: entries, variants, isVariantFamily: true,
    });
    sourceGroups.forEach(group => claimed.add(group.id));
  }
  for (const group of originals) if (!claimed.has(group.id)) grouped.push({
    ...group, variants: [{ ...group, canonicalGroups: [group] }], isVariantFamily: false,
  });
  return grouped.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

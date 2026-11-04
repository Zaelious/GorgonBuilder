import { groupAbilities, type Ability, type AbilityGroup } from './groups';

const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, offset) => `ability_${start + offset}`);

/**
 * Exact verified v490 IDs and InternalName sub-series. These are visual sections, not new
 * UpgradeOf edges or invented Rank fields. In particular, numbered StabledPet, SoD and SZ
 * internals remain separate official abilities, even when listed together in a compact section.
 *
 * `name` is the public, player-readable series label. The official data does not say which treasure power (if any)
 * grants a TSys/Auto series, so labels stay neutral ("Bonus version", "Alternate version A") rather than asserting a
 * source. `internal` names the official InternalName range and is shown only in development debug mode.
 */
const VERIFIED_VARIANTS = [
  { skillId: 'Vampirism', name: 'Blood Mist', variants: [
    { key: 'standard', name: 'Blood Mist', internal: 'BloodMist1–9', ids: range(4866, 4874) },
    { key: 'burst-a', name: 'Burst version A', internal: 'BloodMistTSysBurst1–9', ids: [...range(4971, 4977), 'ability_4994', 'ability_4995'] },
    { key: 'burst-b', name: 'Burst version B', internal: 'BloodMistTSysBurstB1–8', ids: range(4978, 4985) },
    { key: 'burst-c', name: 'Burst version C', internal: 'BloodMistTSysBurstC1–8', ids: range(4986, 4993) },
  ] },
  { skillId: 'AnimalHandling', name: 'Call Stabled Pet', variants: [
    { key: 'numbered', name: 'Pets #1–#7', internal: 'StabledPet1–7', ids: range(2010, 2016) },
  ] },
  // Customer-approved eighth family (T0008-F2-R1).
  { skillId: 'AnimalHandling', name: 'Mark Weakness', variants: [
    { key: 'standard', name: 'Mark Weakness', internal: 'MarkWeakness1–10', ids: range(4231, 4240) },
    { key: 'bonus', name: 'Bonus version', internal: 'TSysBonusMarkWeakness1–10', ids: range(4241, 4250) },
  ] },
  { skillId: 'Bard', name: 'Song of Discord (internal SoD)', variants: [
    { key: 'sod', name: 'Ranks 1–13', internal: 'SongOfDiscordInternal1–13', ids: range(8621, 8633) },
  ] },
  { skillId: 'Mentalism', name: 'Mindworm', variants: [
    { key: 'standard', name: 'Mindworm', internal: 'Mindworm1–11', ids: range(8027, 8037) },
    { key: 'bonus', name: 'Bonus version', internal: 'TSysBonusMindworm0–11', ids: range(8041, 8052) },
  ] },
  { skillId: 'Necromancy', name: 'Super Zombie (internal SZ)', variants: [
    { key: 'sz', name: 'Ranks 1–11', internal: 'SuperZombie1–11', ids: [
      ...range(3273, 3279), 'ability_3292', 'ability_2234', 'ability_2278', 'ability_2279',
    ] },
  ] },
  { skillId: 'Priest', name: 'Triage', variants: [
    { key: 'standard', name: 'Triage', internal: 'Triage1–11', ids: range(9081, 9091) },
    // Official description: "Internal ability that triggers when Triage is used."
    { key: 'internal', name: 'Triggered version', internal: 'TriageInternal1–11', ids: range(9101, 9111) },
  ] },
  { skillId: 'Priest', name: 'Flamestrike', variants: [
    { key: 'standard', name: 'Flamestrike', internal: 'Flamestrike1–11', ids: range(9061, 9071) },
    { key: 'auto-a', name: 'Alternate version A', internal: 'FlamestrikeAutoA1–12', ids: range(9211, 9222) },
    { key: 'auto-b', name: 'Alternate version B', internal: 'FlamestrikeAutoB1–12', ids: range(9223, 9234) },
  ] },
] as const;

export const SPECIFIED_VARIANT_FAMILIES = VERIFIED_VARIANTS.map(spec => ({
  ...spec, ids: spec.variants.flatMap(variant => [...variant.ids]),
}));

/** Preserved canonical UpgradeOf components underneath one compact, source-verified display variant. */
export interface PickerVariant extends AbilityGroup {
  canonicalGroups: AbilityGroup[];
  /** Official InternalName range, for development debug mode only. Empty for ordinary families. */
  internal: string;
}

/**
 * Non-standard series label for an ability inside a multi-series family (e.g. "Bonus version"), so an equipped
 * ability can be told apart from a standard one with the same display name. Presentation only; null otherwise.
 */
const SERIES_TAGS = new Map<string, string>(VERIFIED_VARIANTS.flatMap(spec => spec.variants.length < 2 ? []
  : spec.variants.filter(variant => variant.key !== 'standard').flatMap(variant => variant.ids.map(id => [id, variant.name] as const))));
export function variantSeriesTag(abilityId: string): string | null {
  return SERIES_TAGS.get(abilityId) ?? null;
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
      return { id: `variant:${spec.skillId}:${spec.name}:${variant.key}`, name: variant.name, internal: variant.internal, abilities: entries, canonicalGroups };
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
    ...group, variants: [{ ...group, canonicalGroups: [group], internal: '' }], isVariantFamily: false,
  });
  return grouped.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

import type { NormalizedAbility } from '../normalized/abilities';
import type { NormalizedTreasurePower, NormalizedTreasureProfile } from '../normalized/items-treasure';
import type { Runtime, RuntimeGameData, GameDataManifest } from './contracts';
import { uniqueIndex, validateManifestCounts } from './integrity';

/** Definitions are shared read-only values. A missing official ID returns undefined. */
export function createGameDataRepository(data: RuntimeGameData, manifest: GameDataManifest) {
  validateManifestCounts(data, manifest);
  const { progression: p, abilities: a, itemsTreasure: t } = data;
  const skills = uniqueIndex(p.skills, r => r.id, 'skills');
  const tables = uniqueIndex(p.advancementTables, r => r.id, 'advancementtables');
  const attributes = uniqueIndex(p.attributes, r => r.id, 'attributes');
  const effects = uniqueIndex(p.effects, r => r.id, 'effects');
  const abilities = uniqueIndex(a.abilities, r => r.id, 'abilities');
  const items = uniqueIndex(t.items, r => r.id, 'items');
  const otherItems = new Set(t.nonEquipmentItemIds);
  const powers = uniqueIndex(t.treasurePowers, r => r.id, 'tsysclientinfo');
  const profiles = uniqueIndex(t.treasureProfiles, r => r.id, 'tsysprofiles');
  const tiers = new Map(t.treasurePowers.map(r => [r.id, uniqueIndex(r.tiers, tier => tier.id, `${r.id}.tiers`)]));
  const rules = uniqueIndex(a.keywordRules, r => r.source.recordId, 'abilitykeywords');
  const abilitySources = uniqueIndex(a.acquisitionSources, r => r.abilityId, 'sources_abilities');
  const itemSources = uniqueIndex(t.acquisitionSources, r => r.itemId, 'sources_items');
  const abilitiesBySkill = new Map<string, Runtime<NormalizedAbility>[]>();
  const powersBySkill = new Map<string, Runtime<NormalizedTreasurePower>[]>();
  const profilesByPower = new Map<string, Runtime<NormalizedTreasureProfile>[]>();
  function associate<T>(index: Map<string, T[]>, id: string, value: T): void {
    const records = index.get(id) ?? [];
    records.push(value); index.set(id, records);
  }
  for (const r of a.abilities) if (r.skill.skillId !== null) associate(abilitiesBySkill, r.skill.skillId, r);
  for (const r of t.treasurePowers) if (r.skill.skillId !== null) associate(powersBySkill, r.skill.skillId, r);
  for (const r of t.treasureProfiles) {
    // Reverse associations deduplicate profiles; the original membership array
    // remains intact, including duplicate entries and its published order.
    for (const id of new Set(r.powers.map(ref => ref.powerId))) if (id !== null) associate(profilesByPower, id, r);
  }
  const empty = Object.freeze([]);
  return {
    manifest,
    skills: p.skills, advancementTables: p.advancementTables, attributes: p.attributes, effects: p.effects,
    abilities: a.abilities, items: t.items, treasurePowers: t.treasurePowers, treasureProfiles: t.treasureProfiles,
    nonEquipmentItemIds: t.nonEquipmentItemIds,
    gameDataVersion: manifest.gameDataVersion,
    sources: manifest.sources,
    getSourceMetadata: (locator: { readonly dataset: keyof GameDataManifest['sources']; readonly recordId: string }) => ({
      ...manifest.sources[locator.dataset], recordId: locator.recordId,
    }),
    getSkill: (id: string) => skills.get(id),
    getAdvancementTable: (id: string) => tables.get(id),
    getAbility: (id: string) => abilities.get(id),
    /** T0005 normalizes equipment only; use getItemCoverage for other official items. */
    getItem: (id: string) => items.get(id),
    getItemCoverage: (id: string): 'equipment' | 'non-equipment' | undefined => items.has(id) ? 'equipment' : otherItems.has(id) ? 'non-equipment' : undefined,
    getTreasurePower: (id: string) => powers.get(id),
    getTreasureTier: (powerId: string, tierId: string) => tiers.get(powerId)?.get(tierId),
    getTreasureProfile: (id: string) => profiles.get(id),
    getAttribute: (id: string) => attributes.get(id),
    getEffect: (id: string) => effects.get(id),
    /** Anonymous records use snapshot locators, never fabricated official IDs. */
    getKeywordRule: (sourceRecordId: string) => rules.get(sourceRecordId),
    getAbilityAcquisition: (id: string) => abilitySources.get(id),
    getItemAcquisition: (id: string) => itemSources.get(id),
    getAbilitiesForSkill: (id: string): readonly Runtime<NormalizedAbility>[] => abilitiesBySkill.get(id) ?? empty,
    getTreasurePowersForSkill: (id: string): readonly Runtime<NormalizedTreasurePower>[] => powersBySkill.get(id) ?? empty,
    getProfilesForPower: (id: string): readonly Runtime<NormalizedTreasureProfile>[] => profilesByPower.get(id) ?? empty,
    /** Conditional global rules remain unassociated and uninterpreted. */
    keywordRules: a.keywordRules,
    dynamicDots: a.dynamicDots,
    dynamicSpecialValues: a.dynamicSpecialValues,
  };
}
export type GameDataRepository = ReturnType<typeof createGameDataRepository>;

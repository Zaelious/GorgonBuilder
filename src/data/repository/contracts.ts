import type { JsonValue, NormalizedProgressionData } from '../normalized/progression';
import type { NormalizedAbilityData } from '../normalized/abilities';
import type { NormalizedItemTreasureData } from '../normalized/items-treasure';

/** Reuse the normalizers' lossless contracts; no runtime gameplay projection. */
export interface GameData {
  readonly progression: NormalizedProgressionData;
  readonly abilities: NormalizedAbilityData;
  readonly itemsTreasure: NormalizedItemTreasureData;
}
/** Compact runtime view derived from the existing contracts, without raw copies.
 * Arbitrary published JSON values (rewards, acquisition entries, behaviors) survive.
 * Source metadata is stored once per dataset; record locators keep its namespace.
 */
export type Runtime<T> = T extends JsonValue ? T
  : T extends { readonly dataset: infer D; readonly recordId: string }
    ? { readonly dataset: D; readonly recordId: string }
    : T extends readonly (infer U)[] ? readonly Runtime<U>[]
      : T extends object ? { readonly [K in keyof T as K extends 'raw' ? never : K]: Runtime<T[K]> } : T;
export type RuntimeGameData = Runtime<GameData>;
export type ArtifactName = keyof GameData;
export interface ArtifactIntegrity {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly jsonBytes: number;
}
export interface GameDataDiagnostic {
  readonly group: ArtifactName;
  readonly category: 'unresolved-reference' | 'unsupported-semantics';
  readonly code: string;
  readonly path: string;
  readonly reference: string;
  readonly message: string;
}
export interface GameDataManifest {
  readonly schemaVersion: 1;
  readonly generatorVersion: 1;
  readonly normalizationSchemaVersion: 1;
  readonly gameDataVersion: string;
  /** Hash of the exact pinned snapshot.json bytes, not a generation timestamp. */
  readonly snapshotSha256: string;
  readonly sources: NormalizedProgressionData['sources'] & NormalizedAbilityData['sources'] & NormalizedItemTreasureData['sources'];
  readonly counts: ReturnType<typeof countGameData>;
  readonly artifacts: Readonly<Record<ArtifactName, ArtifactIntegrity>>;
  readonly diagnostics: {
    readonly total: number;
    readonly byGroup: Readonly<Record<ArtifactName, number>>;
    readonly byCategory: Readonly<Record<GameDataDiagnostic['category'], number>>;
    readonly records: readonly GameDataDiagnostic[];
  };
}
export function countGameData(data: GameData | RuntimeGameData) {
  const { progression: p, abilities: a, itemsTreasure: t } = data;
  return {
    skills: p.skills.length, advancementTables: p.advancementTables.length,
    attributes: p.attributes.length, effects: p.effects.length,
    abilities: a.abilities.length, keywordRules: a.keywordRules.length,
    dynamicDots: a.dynamicDots.length, dynamicSpecialValues: a.dynamicSpecialValues.length,
    embeddedDots: a.abilities.reduce((n, r) => n + (r.pve.dots?.length ?? 0), 0),
    embeddedSpecialValues: a.abilities.reduce((n, r) => n + (r.pve.specialValues?.length ?? 0), 0),
    abilityAcquisitionSources: a.acquisitionSources.length,
    equipmentItems: t.items.length, nonEquipmentItems: t.nonEquipmentItemIds.length,
    treasurePowers: t.treasurePowers.length,
    treasureTiers: t.treasurePowers.reduce((n, r) => n + r.tiers.length, 0),
    treasureProfiles: t.treasureProfiles.length,
    profileMemberships: t.treasureProfiles.reduce((n, r) => n + r.powers.length, 0),
    itemAcquisitionSources: t.acquisitionSources.length,
    fixedEffects: t.items.reduce((n, r) => n + (r.fixedEffects?.length ?? 0), 0),
  };
}

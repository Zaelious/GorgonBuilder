import type { DatasetSource, JsonObject } from './progression';
import type { SkillReference } from './abilities';

export type ItemTreasureDatasetName = 'items' | 'tsysclientinfo' | 'tsysprofiles' | 'sources_items';
export interface ItemTreasureDatasetSource extends Omit<DatasetSource, 'dataset'> {
  readonly dataset: ItemTreasureDatasetName;
}
export interface ItemTreasureRecordSource extends ItemTreasureDatasetSource {
  readonly recordId: string;
}
export interface ItemTreasureSourceRecord {
  readonly source: ItemTreasureRecordSource;
  readonly raw: JsonObject;
}
export interface TreasureProfileReference {
  readonly profileId: string;
  readonly status: 'resolved' | 'missing';
}
export interface TreasurePowerReference {
  readonly internalName: string;
  readonly powerId: string | null;
  readonly status: 'resolved' | 'missing';
}
export interface ItemEffectDescription {
  readonly description: string;
  readonly source: ItemTreasureRecordSource;
  readonly interpretation: 'uninterpreted';
}
export interface ItemSkillRequirement {
  readonly skill: SkillReference;
  readonly level: number;
}
export interface NormalizedItem extends ItemTreasureSourceRecord {
  readonly id: string;
  readonly internalName: string;
  readonly displayName: string;
  /** Published IconId for display only; absent remains null. */
  readonly iconId: number | null;
  readonly description: string;
  /** Published CraftingTargetLevel, never inferred from SkillReqs or a name. */
  readonly level: number | null;
  readonly levelSource: 'CraftingTargetLevel' | null;
  /** Exact EquipSlot, including shield, racial, mount and cosmetic slots. */
  readonly slot: string;
  readonly keywords: readonly string[] | null;
  readonly fixedEffects: readonly ItemEffectDescription[] | null;
  readonly behaviors: readonly JsonObject[] | null;
  readonly skillRequirements: readonly ItemSkillRequirement[] | null;
  readonly treasureProfile: TreasureProfileReference | null;
  readonly acquisitionSourceRecordId: string | null;
  readonly searchText: string;
  readonly interpretation: 'uninterpreted';
}
export interface NormalizedTreasureTier extends ItemTreasureSourceRecord {
  /** A tier is identified by (powerId, id); id alone is not globally unique. */
  readonly powerId: string;
  readonly id: string;
  readonly effectDescriptions: readonly string[];
  readonly minLevel: number;
  readonly maxLevel: number;
  readonly minRarity: string;
  readonly skillLevelPrerequisite: number;
  readonly searchText: string;
  readonly interpretation: 'uninterpreted';
}
export type TreasureSkillAssociation = SkillReference | {
  /** Published selector, retained without treating it as an ordinary skill ID. */
  readonly sourceId: 'AnySkill';
  readonly skillId: null;
  readonly status: 'uninterpreted';
};
export interface NormalizedTreasurePower extends ItemTreasureSourceRecord {
  readonly id: string;
  readonly internalName: string;
  readonly skill: TreasureSkillAssociation;
  /** Published Slots only; no slot inferred from profiles or descriptions. */
  readonly slots: readonly string[];
  readonly prefix: string | null;
  readonly suffix: string | null;
  readonly isUnavailable: boolean | null;
  readonly isHiddenFromTransmutation: boolean | null;
  readonly tiers: readonly NormalizedTreasureTier[];
  readonly searchText: string;
  readonly interpretation: 'uninterpreted';
}
export interface NormalizedTreasureProfile {
  readonly id: string;
  readonly source: ItemTreasureRecordSource;
  /** The entire published profile is an array, not a constraints object. */
  readonly raw: readonly string[];
  readonly powers: readonly TreasurePowerReference[];
  /** Membership alone does not evaluate slots, levels, rarity or other rules. */
  readonly interpretation: 'membership-only';
}
export interface ItemAcquisitionSource extends ItemTreasureSourceRecord {
  readonly itemId: string;
  readonly itemReference: {
    readonly status: 'resolved' | 'missing';
    /** Null also covers valid source items outside the equipment subset. */
    readonly equipmentItemId: string | null;
  };
  readonly entries: readonly JsonObject[];
  readonly interpretation: 'uninterpreted';
}
export interface ItemTreasureIntegrityIssue {
  readonly code: 'missing-profile' | 'missing-power' | 'missing-item' | 'missing-skill' | 'unsupported-skill-selector';
  readonly category: 'unresolved-reference' | 'unsupported-semantics';
  readonly path: string;
  readonly reference: string;
  readonly message: string;
}
export interface NormalizedItemTreasureData {
  readonly schemaVersion: 1;
  readonly gameDataVersion: string;
  readonly sources: Readonly<Record<ItemTreasureDatasetName, ItemTreasureDatasetSource>>;
  readonly items: readonly NormalizedItem[];
  /** Explicit accounting for items without EquipSlot, outside this ticket's subset. */
  readonly nonEquipmentItemIds: readonly string[];
  readonly treasurePowers: readonly NormalizedTreasurePower[];
  readonly treasureProfiles: readonly NormalizedTreasureProfile[];
  readonly acquisitionSources: readonly ItemAcquisitionSource[];
  readonly integrityIssues: readonly ItemTreasureIntegrityIssue[];
}

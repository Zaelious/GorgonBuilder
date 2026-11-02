import type { ItemInstance, SourceMetadata } from '../build/document';
import type { JsonObject, JsonValue } from '../../data/normalized/progression';

export type SourceIdentifier = string | number;
export type ReportType = 'CharacterSheet' | 'Storage';

export interface ImportIssue {
  severity: 'error' | 'warning';
  code: 'invalid-json' | 'invalid-json-value' | 'wrong-report-type' | 'missing-field'
    | 'invalid-field-type' | 'unsupported-structure' | 'malformed-entry'
    | 'unresolved-reference' | 'unverified-timestamp' | 'uninterpreted-stat'
    | 'uninterpreted-power' | 'equipped-state-unavailable';
  /** JSON pointer into the source; messages never interpolate source values. */
  path: string;
  message: string;
}

export type ImportResult<T> =
  | { ok: true; value: T; warnings: ImportIssue[] }
  | { ok: false; errors: ImportIssue[]; warnings: ImportIssue[] };

/** Optional, injected official-data lookup. Parsing itself needs no dataset. */
export interface ImportReferenceResolver {
  gameDataVersion: string;
  skill(sourceId: SourceIdentifier): string | null;
  ability(sourceId: SourceIdentifier): string | null;
  item(sourceId: SourceIdentifier): string | null;
  power(sourceId: SourceIdentifier): string | null;
  tier(powerId: string, sourceTier: SourceIdentifier): string | null;
}

export interface ImportedReference {
  sourceId: SourceIdentifier;
  id: string | null;
  status: 'resolved' | 'unresolved' | 'not-checked';
}

export interface ImportedReportMetadata extends SourceMetadata {
  report: ReportType;
  exportedAt: string;
  /** Exact JSON version, distinct from SourceMetadata's string projection. */
  sourceReportVersion: SourceIdentifier;
  characterName: string;
  server: string | null;
  resolvedWithGameDataVersion: string | null;
  metadata: JsonObject;
}

export interface ImportedSkill {
  reference: ImportedReference;
  level: number;
  bonusLevels: number | null;
  xpTowardNextLevel: number | null;
  /** Source -1 sentinel means no next XP threshold; preserved verbatim. */
  xpNeededForNextLevel: number | null;
  /** Original known abilities, including order and duplicates. */
  abilities: ImportedReference[];
  metadata: JsonObject;
}

export interface ImportedCharacterSnapshot {
  source: ImportedReportMetadata;
  skills: ImportedSkill[];
  knownAbilities: ImportedReference[];
  /** Unvalidated source values, never damage modifiers. */
  currentStats: JsonObject;
}

export interface EquippedStateCapability {
  status: 'unavailable';
  reason: 'no-verified-authoritative-field';
}

export interface ImportedTreasurePower {
  kind: 'treasure' | 'imbue';
  power: ImportedReference | null;
  /** null means omitted. Unknown JSON shapes remain here and in metadata. */
  sourceTier: JsonValue;
  /** Exact composite identity only after both lookups succeed. */
  selection: ItemInstance['existingPowers'][number] | null;
  metadata: JsonValue;
}

/** Extends existing build hooks without modifying the saved schema or draft. */
export interface ImportedItemInstance extends ItemInstance {
  originalTypeId: SourceIdentifier;
  baseItemReference: ImportedReference;
  /** Source locator, explicitly not a game instance ID. */
  sourcePath: string;
  slot: string | null;
  treasurePowers: ImportedTreasurePower[];
  location: { isInInventory: boolean | null; storageVault: string | null };
  equippedState: { status: 'unknown' };
  sparkHistory: { status: 'unavailable' };
  provenance: ImportedReportMetadata;
  /** Full original item, including crafting/augmentation/attunement fields. */
  metadata: JsonObject;
}

export interface ImportedStorageSnapshot {
  source: ImportedReportMetadata;
  items: ImportedItemInstance[];
  equippedStateCapability: EquippedStateCapability;
}

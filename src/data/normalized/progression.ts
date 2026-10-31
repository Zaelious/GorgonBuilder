/** Source facts only: these contracts assign no calculation or stacking semantics. */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export type ProgressionDatasetName = 'skills' | 'advancementtables' | 'attributes' | 'effects';
export interface DatasetSource {
  readonly gameDataVersion: string;
  readonly dataset: ProgressionDatasetName;
  readonly sourceUrl: string;
  readonly sha256: string;
}
export interface RecordSource extends DatasetSource { readonly recordId: string }
export interface SourceRecord {
  readonly source: RecordSource;
  /** Separate canonical copy, including unknown fields; never a calculated modifier. */
  readonly raw: JsonObject;
}
export interface AdvancementReference {
  readonly sourceName: string;
  readonly tableId: string;
}
export interface AttributeReference { readonly id: string; readonly status: 'resolved' | 'missing' }
export interface ProgressionReward {
  /** Original property key, scoped to its owner and level; not a new global ID. */
  readonly id: string;
  readonly value: JsonValue;
  readonly interpretation: 'uninterpreted';
  /** Only advancement-table reward keys establish the attribute namespace. */
  readonly attributeReference: AttributeReference | null;
}
export interface LevelProgression {
  readonly level: number;
  /** Official suffix (e.g. Fae), retained without evaluating applicability. */
  readonly sourceQualifier: string | null;
  readonly sourceLevelKey: string;
  readonly rewards: readonly ProgressionReward[];
  readonly raw: JsonObject;
}
export interface NormalizedSkill extends SourceRecord {
  readonly id: string;
  readonly officialNumericId: number;
  /** Null means the publisher omitted Name; id remains usable as a label. */
  readonly name: string | null;
  readonly description: string;
  readonly combat: boolean;
  readonly guestLevelCap: number;
  readonly maxBonusLevels: number;
  readonly xpTable: string;
  readonly xpEarnedAttributes: readonly AttributeReference[] | null;
  readonly advancementHints: Readonly<Record<string, string>> | null;
  readonly interactionFlagLevelCaps: Readonly<Record<string, number>> | null;
  readonly activeAdvancement: AdvancementReference | null;
  readonly passiveAdvancement: AdvancementReference | null;
  readonly progression: readonly LevelProgression[];
}
export interface NormalizedAdvancementTable extends SourceRecord {
  readonly id: string;
  readonly sourceName: string;
  readonly officialNumericId: string;
  readonly keywords: readonly string[] | null;
  readonly progression: readonly LevelProgression[];
  readonly interpretation: 'uninterpreted';
}
export interface NormalizedAttribute extends SourceRecord {
  readonly id: string;
  readonly label: string | null;
  readonly tooltip: string | null;
  readonly displayRule: string;
  readonly displayType: string;
  readonly defaultValue: JsonValue | undefined;
}
export interface NormalizedEffect extends SourceRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly abilityKeywords: readonly string[] | null;
  /** Publisher value, including string-valued durations and numeric sentinels. */
  readonly duration: number | string | null;
  readonly displayMode: string;
  readonly iconId: number;
}
export type IntegrityIssue = AdvancementAttributeIssue | SkillXpAttributeIssue;
export interface SkillXpAttributeIssue {
  readonly code: 'missing-xp-attribute';
  readonly skillId: string;
  readonly attributeId: string;
  readonly message: string;
}
export interface AdvancementAttributeIssue {
  readonly code: 'missing-attribute';
  readonly tableId: string;
  readonly sourceLevelKey: string;
  readonly rewardId: string;
  readonly message: string;
}
export interface NormalizedProgressionData {
  readonly schemaVersion: 1;
  readonly gameDataVersion: string;
  readonly sources: Readonly<Record<ProgressionDatasetName, DatasetSource>>;
  readonly skills: readonly NormalizedSkill[];
  readonly advancementTables: readonly NormalizedAdvancementTable[];
  readonly attributes: readonly NormalizedAttribute[];
  readonly effects: readonly NormalizedEffect[];
  readonly integrityIssues: readonly IntegrityIssue[];
}

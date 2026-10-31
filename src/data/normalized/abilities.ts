import type { DatasetSource, JsonObject } from './progression';

export type AbilityDatasetName = 'abilities' | 'abilitykeywords' | 'abilitydynamicdots'
  | 'abilitydynamicspecialvalues' | 'sources_abilities';
export interface AbilityDatasetSource extends Omit<DatasetSource, 'dataset'> {
  readonly dataset: AbilityDatasetName;
}
export interface AbilityRecordSource extends AbilityDatasetSource {
  /** Official object key, or zero-based array index for anonymous rule records. */
  readonly recordId: string;
}
export interface AbilitySourceRecord {
  readonly source: AbilityRecordSource;
  readonly raw: JsonObject;
}
export interface SkillReference {
  readonly sourceId: string;
  readonly skillId: string | null;
  readonly status: 'resolved' | 'missing';
}
export interface AbilityReference {
  readonly internalName: string;
  readonly abilityId: string | null;
  readonly status: 'resolved' | 'missing';
}
export interface EffectKeywordReference {
  readonly keyword: string;
  /** Exact membership in T0003 effect Keywords, never an inferred applied effect. */
  readonly effectIds: readonly string[];
  readonly status: 'resolved' | 'missing';
  readonly interpretation: 'keyword-membership-only';
}
export interface EffectKeywordConstraint extends EffectKeywordReference {
  readonly sourcePath: string;
}
export interface AbilityConditions {
  readonly requiredAbilityKeywords: readonly string[] | null;
  readonly excludedAbilityKeywords: readonly string[] | null;
  readonly requiredActiveSkill: SkillReference | null;
  readonly requiredEffectKeywords: readonly EffectKeywordReference[] | null;
}
export interface ConditionalAbilityKeyword {
  readonly keyword: string;
  readonly default: boolean | null;
  readonly effectKeywordMustExist: EffectKeywordReference | null;
  readonly effectKeywordMustNotExist: EffectKeywordReference | null;
  readonly interpretation: 'uninterpreted';
  readonly raw: JsonObject;
}
export interface AbilityKeywordRule extends AbilitySourceRecord {
  /** Locator only: the official array publishes no stable rule ID. */
  readonly sourceIndex: number;
  readonly conditions: AbilityConditions;
  readonly attributeHooks: Readonly<Record<string, readonly string[]>>;
  readonly interpretation: 'uninterpreted';
}
export interface AbilityKeywordRuleCandidate {
  readonly sourceRecordId: string;
  readonly keywordMatch: 'static' | 'conditional';
  /** Includes active-skill/effect/unknown constraints; never a combat modifier. */
  readonly applicability: 'unevaluated';
}
export interface AbilityDot extends AbilitySourceRecord {
  readonly sourceIndex: number;
  /** Only embedded PvE records have an explicit owning ability. */
  readonly ownerAbilityId: string | null;
  readonly damagePerTick: number;
  readonly damageType: string;
  readonly duration: number;
  readonly numTicks: number;
  readonly preface: string | null;
  readonly specialRules: readonly string[] | null;
  readonly conditions: AbilityConditions;
  readonly attributeHooks: Readonly<Record<string, readonly string[]>>;
  readonly interpretation: 'uninterpreted';
}
export interface AbilitySpecialValue extends AbilitySourceRecord {
  readonly sourceIndex: number;
  readonly ownerAbilityId: string | null;
  readonly label: string;
  readonly value: number;
  readonly suffix: string | null;
  readonly displayType: string | null;
  readonly skipIfZero: boolean | null;
  readonly skipIfThisAttributeIsZero: string | null;
  readonly conditions: AbilityConditions;
  readonly attributeHooks: Readonly<Record<string, readonly string[]>>;
  readonly interpretation: 'uninterpreted';
}
export interface AbilityDamage {
  readonly damageType: string;
  /** Original PvE fields kept distinct; no direct/indirect classification guessed. */
  readonly damage: number | null;
  readonly healthSpecificDamage: number | null;
  readonly armorSpecificDamage: number | null;
  readonly extraDamageIfTargetVulnerable: number | null;
  readonly critDamageMod: number | null;
  readonly armorMitigationRatio: number | null;
}
export interface AbilityTiming {
  /** Published ResetTime, without deciding cooldown start or reset behavior. */
  readonly resetTime: number;
  readonly sharesResetTimerWith: AbilityReference | null;
  readonly resetTimeIsOnlineOnly: boolean | null;
  readonly isTimerResetWhenDisabling: boolean | null;
  readonly delayLoopTime: number | null;
  readonly delayLoopMessage: string | null;
  readonly delayLoopIsAbortedIfAttacked: boolean | null;
  readonly delayLoopIsOnlyUsedInCombat: boolean | null;
}
export interface AbilityTargeting {
  readonly target: string;
  readonly range: number;
  /** Published AoE value; no radius/diameter/target cap semantics assigned. */
  readonly aoe: number | null;
  readonly aoeIsCenteredOnCaster: boolean | null;
  readonly specialTargetingTypeReq: number | null;
  readonly targetTypeTagReq: string | null;
}
export interface AbilityAcquisitionSource extends AbilitySourceRecord {
  readonly abilityId: string;
  readonly abilityReference: { readonly abilityId: string; readonly status: 'resolved' | 'missing' };
  readonly entries: readonly JsonObject[];
  readonly interpretation: 'uninterpreted';
}
export interface NormalizedAbility extends AbilitySourceRecord {
  readonly id: string;
  readonly internalName: string;
  readonly displayName: string;
  readonly description: string;
  readonly skill: SkillReference;
  readonly level: number;
  /** Only the explicit Rank field. Never parsed from names, Level or UpgradeOf. */
  readonly rank: string | number | null;
  readonly upgradeOf: AbilityReference | null;
  readonly prerequisite: AbilityReference | null;
  readonly damage: AbilityDamage;
  readonly timing: AbilityTiming;
  readonly targeting: AbilityTargeting;
  readonly keywords: readonly string[] | null;
  readonly conditionalKeywords: readonly ConditionalAbilityKeyword[] | null;
  readonly extraKeywordsForTooltips: readonly string[] | null;
  readonly keywordRuleCandidates: readonly AbilityKeywordRuleCandidate[];
  readonly effectKeywordConstraints: readonly EffectKeywordConstraint[];
  readonly attributeHooks: Readonly<Record<string, readonly string[]>>;
  readonly pve: {
    readonly powerCost: number;
    readonly dots: readonly AbilityDot[] | null;
    readonly specialValues: readonly AbilitySpecialValue[] | null;
    readonly attributeHooks: Readonly<Record<string, readonly string[]>>;
    readonly raw: JsonObject;
  };
  readonly acquisitionSourceRecordId: string | null;
  readonly interpretation: 'uninterpreted';
}
export interface AbilityIntegrityIssue {
  readonly code: 'missing-skill' | 'missing-ability' | 'missing-effect-keyword';
  readonly path: string;
  readonly reference: string;
  readonly message: string;
}
export interface NormalizedAbilityData {
  readonly schemaVersion: 1;
  readonly gameDataVersion: string;
  readonly sources: Readonly<Record<AbilityDatasetName, AbilityDatasetSource>>;
  readonly abilities: readonly NormalizedAbility[];
  readonly keywordRules: readonly AbilityKeywordRule[];
  readonly dynamicDots: readonly AbilityDot[];
  readonly dynamicSpecialValues: readonly AbilitySpecialValue[];
  readonly acquisitionSources: readonly AbilityAcquisitionSource[];
  readonly integrityIssues: readonly AbilityIntegrityIssue[];
}

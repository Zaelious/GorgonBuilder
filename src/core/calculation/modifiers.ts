/**
 * T0012 normalized modifier contracts.
 *
 * A modifier is a calculation-ready *input*, never a computed damage result. Categories stay
 * distinct (see docs/Damage_And_DPS_Model.md); T0013 decides ordering and application.
 */

import type { SparkOutcomeKey } from '../sparks/model';

export const MODIFIER_AGGREGATION_SCHEMA_VERSION = 1 as const;

/** Confidence in the interpretation (category, unit, value) of one source record. */
export type ModifierConfidence = 'validated' | 'partially_validated' | 'assumed' | 'unknown';

export const CONFIDENCE_ORDER: readonly ModifierConfidence[] = ['validated', 'partially_validated', 'assumed', 'unknown'];

/** Distinct buckets. Never collapse two categories because tooltips both say "damage". */
export type ModifierCategory =
  // Skill-wide damage
  | 'skill-base-damage-percent'      // MOD_SKILL_<SKILL>: "<Skill> Base Damage %" (original-base only rule lives in T0013)
  | 'skill-damage-flat'              // BOOST_SKILL_<SKILL>
  | 'skill-damage-percent'           // MOD_SKILL_ALL_<SKILL>
  // Ability-specific damage (scope = official ability attribute hook)
  | 'ability-damage-flat'            // BOOST_ABILITY_<X>
  | 'ability-damage-percent'         // MOD_ABILITY_<X>
  // Universal damage
  | 'all-direct-damage-flat'         // BOOST_UNIVERSAL_DIRECT
  | 'all-direct-damage-percent'      // MOD_UNIVERSAL_DIRECT
  | 'all-indirect-damage-flat'       // BOOST_UNIVERSAL_INDIRECT
  | 'all-indirect-damage-percent'    // MOD_UNIVERSAL_INDIRECT
  | 'all-damage-flat'                // BOOST_UNIVERSAL (direct & per-tick)
  | 'all-damage-percent'             // MOD_UNIVERSAL (direct & per-tick)
  // Damage-type damage
  | 'damage-type-direct-flat'        // BOOST_<TYPE>_DIRECT
  | 'damage-type-direct-percent'     // MOD_<TYPE>_DIRECT
  | 'damage-type-indirect-flat'      // BOOST_<TYPE>_INDIRECT
  | 'damage-type-indirect-percent'   // MOD_<TYPE>_INDIRECT
  | 'damage-type-flat'               // BOOST_<TYPE> (no DIRECT/INDIRECT suffix; delivery only from the label)
  | 'damage-type-percent'            // MOD_<TYPE>
  // Reserved for future validated rules; the default registry maps nothing here yet.
  | 'critical-damage-percent'
  | 'critical-chance-percent'
  // T0014-F1 scenario inputs; excluded from ordinary damage until explicitly evaluated.
  | 'stampede-damage-per-stack'
  | 'stampede-stunned-percent'
  | 'chance-damage-proc'
  // Non-damage character stats
  | 'max-resource-flat'              // MAX_HEALTH, MAX_POWER, MAX_ARMOR
  | 'damage-type-mitigation-flat'    // MITIGATION_<TYPE>
  // Curated exact treasure-power rules (treasure-effect-rules.ts); never contribute to T0013 normal damage.
  | 'ability-taunt-flat'             // e.g. ABILITY_TAUNT_DELTA_MOCK; taunt, not damage
  | 'ability-reset-time-flat'        // e.g. ABILITY_RESETTIME_DELTA_MOCK; seconds added to the reuse timer
  | 'ability-burst-conversion'       // "<Ability> hits all enemies within N meters": Burst AoE radius (meters)
  | 'ability-damage-multiplier';     // "damage is halved": multiplier applied after build contributions (T0014 stage)

/**
 * flat: additive points; percent: published fractional delta (0.45 = +45%); set: replaces an ability property (e.g. a
 * Burst radius); multiply: scales a value (0.5 = halved).
 */
export type ModifierOperation = 'flat' | 'percent' | 'set' | 'multiply';
export type ModifierUnit = 'points' | 'fraction' | 'meters' | 'seconds' | 'multiplier';

export type DamageDelivery = 'direct' | 'indirect' | 'direct-and-indirect';

export type ModifierScope =
  | { readonly kind: 'general'; readonly delivery: DamageDelivery | null }
  | { readonly kind: 'skill'; readonly skillId: string }
  /** Applies where an official ability lists this attribute in the named PvE hook. */
  | { readonly kind: 'ability-attribute-hook'; readonly attributeId: string; readonly hook: string; readonly skillId?: string }
  /** delivery null: the official label does not say whether direct and/or per-tick damage is covered. */
  | { readonly kind: 'damage-type'; readonly damageType: string; readonly delivery: DamageDelivery | null }
  /** Applies to official abilities of this skill whose published Keywords include `keyword` (e.g. every Mock tier). */
  | { readonly kind: 'ability-keyword'; readonly skillId: string; readonly keyword: string };

export type ModifierCondition =
  /** Official third token argument: the player must have this skill active. */
  | { readonly kind: 'requires-active-skill'; readonly skillId: string; readonly status: 'met' | 'not-met' }
  /** Official race/realm-style qualifier on a progression level key; never evaluated here. */
  | { readonly kind: 'source-qualifier'; readonly qualifier: string; readonly status: 'unevaluated' }
  /**
   * T0013-F2 target dummy creature category (official Anatomy sub-skill IDs). Unknown target → unevaluated. A category
   * in `ambiguousCreatureTypeIds` is neither met nor excluded because the published wording does not settle it.
   */
  | { readonly kind: 'target-creature-type'; readonly creatureTypeIds: readonly string[]; readonly ambiguousCreatureTypeIds: readonly string[];
    readonly status: 'met' | 'not-met' | 'unevaluated' }
  /** T0013-F2 target dummy Elite flag: `elite` true requires an Elite target, false a non-Elite target. */
  | { readonly kind: 'target-elite'; readonly elite: boolean; readonly status: 'met' | 'not-met' | 'unevaluated' };

/** T0013-F2 scenario inputs for target conditions. Null means unknown; nothing is assumed. */
export interface TargetConditionContext {
  /** Official Anatomy sub-skill ID of the selected creature type. */
  readonly creatureType: string | null;
  readonly elite: boolean | null;
}

export type ModifierApplicability = 'unconditional' | 'conditions-met' | 'conditions-not-met' | 'conditions-unevaluated';

export type SkillSlotName = 'A' | 'B';
export type EquipmentItemKind = 'database' | 'manual' | 'imported';

/** Stable within one build: equipment slot plus occurrence among selections of that slot. */
export interface EquipmentSourceRef {
  readonly equipmentIndex: number;
  /** `${slot}#${occurrence}`; unaffected by removing selections of other slots. */
  readonly equipmentKey: string;
  readonly slot: string;
  readonly itemKind: EquipmentItemKind;
  /** Exact official ID (database itemId or instance baseItemId); null when unknown/absent. */
  readonly itemId: string | null;
  readonly itemResolved: boolean;
  readonly instanceId?: string;
  readonly displayName?: string;
}

export type ModifierSource =
  | {
    readonly kind: 'skill-advancement';
    readonly skillId: string;
    /** All slots selecting this skill; a duplicated skill contributes once. */
    readonly slots: readonly SkillSlotName[];
    readonly level: number;
    readonly advancement: 'active' | 'passive';
    readonly tableId: string;
    readonly attributeId: string;
    /** Every contributing official level entry (summed into value; see assumptions). */
    readonly levels: readonly { readonly sourceLevelKey: string; readonly level: number; readonly value: number }[];
  }
  | ({ readonly kind: 'item-fixed-effect'; readonly effectIndex: number; readonly effectRecordId: string; readonly description: string } & EquipmentSourceRef)
  | ({
    readonly kind: 'existing-power' | 'candidate-mod';
    /** existing-power: index in effective instance.existingPowers; candidate-mod: index in candidateMods. */
    readonly modIndex: number;
    readonly origin: 'existing' | 'planned';
    readonly powerId: string;
    readonly tierId: string;
    readonly effectIndex: number;
    readonly tierRecordId: string;
    readonly description: string;
  } & EquipmentSourceRef)
  /** T0015: the total of one Skill Damage Spark outcome on one equipped item (one record per outcome kind). */
  | ({
    readonly kind: 'spark';
    readonly mode: 'simulated' | 'actual';
    readonly sparkCategory: 'skill-damage';
    /** Configured skill; skill-scoped outcomes name it and every outcome requires it to be active. */
    readonly skillId: string;
    readonly outcome: SparkOutcomeKey;
    /** Number of Sparks with this outcome. */
    readonly outcomeCount: number;
    /** All Sparks configured on the item. */
    readonly totalSparks: number;
    readonly modelVersion: string;
    /** Simulated configurations only. */
    readonly seed?: string;
  } & EquipmentSourceRef);

export interface NormalizedModifier {
  /** Deterministic within one aggregation; derived only from source identity. */
  readonly key: string;
  readonly category: ModifierCategory;
  readonly operation: ModifierOperation;
  /**
   * Official attribute ID (stat key). Curated treasure rules use an official attribute when one exists (MOD_ABILITY_MOCK,
   * ABILITY_TAUNT_DELTA_MOCK, ABILITY_RESETTIME_DELTA_MOCK); otherwise a `TREASURE:<InternalName>/<part>` identifier.
   */
  readonly attributeId: string;
  readonly attributeLabel: string | null;
  readonly scope: ModifierScope;
  readonly value: number;
  /** Chance-based direct damage, independent of Anatomy/Phrenology criticals. */
  readonly proc?: { readonly probability: number; readonly effect: 'multiply-hit' | 'add-flat' };
  /** Exact published numeric text (or the summed decimal for advancement totals). */
  readonly sourceValue: string;
  readonly unit: ModifierUnit;
  readonly conditions: readonly ModifierCondition[];
  readonly applicability: ModifierApplicability;
  readonly mappingRuleId: string;
  readonly confidence: ModifierConfidence;
  readonly assumptions: readonly string[];
  readonly source: ModifierSource;
}

export type UnsupportedReason =
  | 'prose-effect'                  // Published text with no attribute token
  | 'malformed-effect'              // Brace syntax that does not match the token grammar
  | 'unknown-attribute'             // Token attribute missing from official attributes
  | 'unknown-required-skill'        // Third token argument is not an official skill
  | 'unmapped-attribute'            // Official attribute without a validated registry mapping
  | 'unexpected-display-type'       // Mapping matched by name but official DisplayType disagrees
  | 'non-numeric-advancement-reward'
  | 'progression-rewards-not-modifiers' // Ability/Recipe/Notes/BonusToSkill etc. summary
  | 'skill-level-conflict';         // Same skill in A and B with different levels

/** A source record that survives without a fabricated numeric interpretation. */
export interface UnsupportedEffect {
  readonly key: string;
  readonly reason: UnsupportedReason;
  readonly message: string;
  readonly attributeId?: string;
  readonly source: ModifierSource | UnsupportedSkillSource | UnsupportedEquipmentSource;
}

export interface UnsupportedSkillSource {
  readonly kind: 'skill';
  readonly skillId: string;
  readonly slots: readonly SkillSlotName[];
  readonly levels: readonly number[];
  readonly rewardCounts?: Readonly<Record<string, number>>;
  readonly sourceLevelKeys?: readonly string[];
}

export type UnsupportedEquipmentSource = EquipmentSourceRef & { readonly kind: 'equipment' };

export type AggregationWarningCode =
  | 'game-data-version-mismatch'
  | 'unknown-skill'
  | 'non-combat-skill'
  | 'skill-level-conflict'
  | 'missing-advancement-table'
  | 'level-exceeds-advancement-table'
  | 'invalid-skill-level'
  | 'unknown-item'
  | 'instance-without-base-item'
  | 'unknown-power'
  | 'unknown-tier'
  | 'candidate-tier-unselected'
  // T0015 Spark configurations that are preserved but contribute nothing:
  | 'spark-result-missing'          // simulated input saved without a result
  | 'spark-configuration-invalid'   // malformed, unknown model version, non-reproducible result or unknown skill
  | 'spark-slot-unsupported'        // saved on a slot outside MainHand/OffHand/Ring/Necklace
  | 'spark-offhand-conflict';       // legacy multiple offhand entries: no offhand Spark source until resolved

export interface AggregationWarning {
  readonly code: AggregationWarningCode;
  readonly message: string;
  readonly skillId?: string;
  readonly equipment?: EquipmentSourceRef;
  readonly powerId?: string;
  readonly tierId?: string | null;
  readonly modIndex?: number;
  readonly origin?: 'existing' | 'planned';
}

export interface ModifierAggregationResult {
  readonly schemaVersion: typeof MODIFIER_AGGREGATION_SCHEMA_VERSION;
  /** Game data used for lookups and the build's saved snapshot, kept separately. */
  readonly gameDataVersion: string;
  readonly buildGameDataVersion: string;
  /** Unique active skills in A-then-B order (from getUniqueActiveSkillIds). */
  readonly activeSkillIds: readonly string[];
  readonly modifiers: readonly NormalizedModifier[];
  readonly unsupported: readonly UnsupportedEffect[];
  readonly warnings: readonly AggregationWarning[];
  readonly summary: {
    readonly modifierCount: number;
    readonly unsupportedCount: number;
    readonly warningCount: number;
    readonly byCategory: Readonly<Partial<Record<ModifierCategory, number>>>;
    readonly byConfidence: Readonly<Record<ModifierConfidence, number>>;
    readonly bySourceKind: Readonly<Record<ModifierSource['kind'], number>>;
  };
}

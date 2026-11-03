import type { GameDataRepository } from '../../data/repository/repository';
import type { ModifierAggregationResult, ModifierCategory, ModifierConfidence, NormalizedModifier } from './modifiers';
import type { KeywordDamageData } from './keyword-damage';

export type AbilityDamageData = Pick<GameDataRepository, 'gameDataVersion' | 'getAbility' | 'getSourceMetadata'> & KeywordDamageData;
export type DamageAbility = NonNullable<ReturnType<AbilityDamageData['getAbility']>>;
export type DamageComponentId = 'damage' | 'health-specific' | 'armor-specific' | `dot:${number}`;

export interface DamageComponent {
  readonly id: DamageComponentId;
  readonly sourcePath: string;
  readonly originalBase: number | null;
  readonly baseStatus: 'absent' | 'zero' | 'present' | 'unresolved';
  readonly damageType: string;
  /** PvE hit fields are provisionally direct; embedded DoTs are indirect diagnostics only. */
  readonly delivery: 'direct' | 'indirect';
  readonly attributeHooks: Readonly<Record<string, readonly string[]>>;
}

export type DamageDecisionReason =
  | 'supported' | 'not-normal-damage' | 'absent-component' | 'unresolved-base'
  | 'skill-mismatch' | 'unresolved-skill' | 'hook-mismatch' | 'damage-type-mismatch'
  | 'delivery-mismatch' | 'delivery-unspecified' | 'required-skill-inactive'
  | 'condition-not-met' | 'condition-unevaluated' | 'invalid-modifier'
  | 'unknown-modifier' | 'multiple-component-allocation' | 'indirect-not-calculated';

export interface DamageModifierDecision {
  /** Original T0012 record, including exact source key, power/tier, conditions and assumptions. */
  readonly modifier: NormalizedModifier;
  readonly status: 'applied' | 'excluded' | 'uncertain';
  readonly reason: DamageDecisionReason;
  readonly explanation: string;
}

export interface AbilityDamageStep {
  readonly category: 'original-base' | ModifierCategory;
  readonly modifierKey: string | null;
  readonly operation: 'base' | 'add-flat' | 'add-percent-contribution' | 'add-skill-base-contribution';
  readonly before: number;
  readonly basis: number;
  readonly operand: number;
  readonly contribution: number;
  readonly after: number;
  readonly explanation: string;
  /** Confidence in this arithmetic rule, separately from its mapped input. */
  readonly ruleConfidence: ModifierConfidence;
  readonly confidence: ModifierConfidence;
}

export interface AbilityDamageWarning {
  readonly code: string;
  readonly message: string;
  readonly componentId?: DamageComponentId;
  readonly modifierKey?: string;
}

export interface ComponentDamageResult extends DamageComponent {
  readonly decisions: readonly DamageModifierDecision[];
  readonly steps: readonly AbilityDamageStep[];
  /** Supported-subset preview only. Excludes uncertain inputs; never a full hit prediction. */
  readonly provisionalDamage: number | null;
  /** Available only when all dependencies and rules are validated, before target effects. */
  readonly normalDamage: number | null;
  readonly confidence: ModifierConfidence;
  readonly assumptions: readonly string[];
  readonly warnings: readonly AbilityDamageWarning[];
}

export interface AbilityDamageResult {
  readonly requestedAbilityId: string;
  /** Exact normalized official record; null for missing IDs. No rank/name fallback. */
  readonly ability: DamageAbility | null;
  readonly provenance: ReturnType<AbilityDamageData['getSourceMetadata']> | null;
  readonly gameDataVersion: string;
  readonly aggregation: ModifierAggregationResult;
  readonly formula: 'supported-components-v1';
  readonly context: 'pve-normal-before-target-effects';
  readonly components: readonly ComponentDamageResult[];
  /** Only a single published hit component can populate these; components are never summed. */
  readonly normalDamage: number | null;
  readonly provisionalDamage: number | null;
  readonly criticalDamage: null;
  readonly confidence: ModifierConfidence;
  readonly assumptions: readonly string[];
  readonly warnings: readonly AbilityDamageWarning[];
}

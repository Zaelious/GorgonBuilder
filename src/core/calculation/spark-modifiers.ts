import type { EquipmentSelection } from '../build/document';
import { isOffhandSlot } from '../build/slots';
import { SKILL_DAMAGE_SPARK_OUTCOMES, sparkOutcomeText, type SkillDamageSparkOutcome, type SparkOutcomeKey } from '../sparks/model';
import { sparkModifierValue } from '../sparks/bonuses';
import { evaluateSparkConfiguration, isOffensiveSparkSlot } from '../sparks/configuration';
import type {
  AggregationWarning, EquipmentSourceRef, ModifierCondition, ModifierScope, ModifierSource, NormalizedModifier, UnsupportedEffect,
} from './modifiers';
import { defaultModifierRegistry, type AttributeInterpretation, type ModifierDataContext, type ModifierRegistry } from './registry';

export const SPARK_ASSUMPTIONS = {
  values: 'Spark outcome probabilities and per-outcome values come from the product-owner Skill Damage Spark model (skill-damage-sparks-v1), not official data; unvalidated in game.',
  activeSkill: 'Assumed: every Skill Damage Spark outcome on an item, including its All Direct Damage outcomes, applies only while the configured skill is active.',
  mapping: 'Each outcome total uses the official attribute of the same category (MOD_UNIVERSAL_DIRECT, BOOST_SKILL_<SKILL>, BOOST_UNIVERSAL_DIRECT, MOD_SKILL_ALL_<SKILL>, MOD_SKILL_<SKILL>), so official ability hooks decide skill applicability exactly as for gear.',
} as const;

/** Official attribute carrying an outcome's category for a skill (validated against the registry before use). */
export function sparkAttributeId(outcome: SparkOutcomeKey, skillId: string): string {
  const skill = skillId.toUpperCase();
  switch (outcome) {
    case 'allDirectDamagePercent': return 'MOD_UNIVERSAL_DIRECT';
    case 'skillDamageFlat': return `BOOST_SKILL_${skill}`;
    case 'allDirectDamageFlat': return 'BOOST_UNIVERSAL_DIRECT';
    case 'skillDamagePercent': return `MOD_SKILL_ALL_${skill}`;
    case 'skillBaseDamagePercent': return `MOD_SKILL_${skill}`;
  }
}

function scopeMatches(scope: ModifierScope, outcome: SkillDamageSparkOutcome, skillId: string): boolean {
  return outcome.scope === 'skill' ? scope.kind === 'skill' && scope.skillId === skillId
    : scope.kind === 'general' && scope.delivery === 'direct';
}

export interface SparkOutcomeSupport {
  readonly outcome: SkillDamageSparkOutcome;
  readonly attributeId: string;
  /** The official attribute exists and maps to the outcome's category and scope (this skill, or general direct). */
  readonly supported: boolean;
  readonly interpretation: AttributeInterpretation;
}

/** Which outcomes of a skill's Sparks can be modeled; no attribute is invented for a skill that lacks one. */
export function sparkOutcomeSupport(skillId: string, data: ModifierDataContext, registry: ModifierRegistry = defaultModifierRegistry): readonly SparkOutcomeSupport[] {
  return SKILL_DAMAGE_SPARK_OUTCOMES.map(outcome => {
    const attributeId = sparkAttributeId(outcome.key, skillId);
    const interpretation = registry.interpretAttribute(attributeId, data);
    const supported = interpretation.kind === 'modifier' && interpretation.rule.category === outcome.category && scopeMatches(interpretation.scope, outcome, skillId);
    return { outcome, attributeId, supported, interpretation };
  });
}

export interface SparkAggregation {
  readonly modifiers: readonly NormalizedModifier[];
  readonly unsupported: readonly UnsupportedEffect[];
  readonly warnings: readonly AggregationWarning[];
}

export interface SparkAggregationContext {
  readonly activeSkillIds: readonly string[];
  readonly data: ModifierDataContext;
  readonly registry: ModifierRegistry;
  /** Several saved entries share the exclusive offhand position (legacy conflict). */
  readonly offhandConflict: boolean;
}

const EMPTY: SparkAggregation = { modifiers: [], unsupported: [], warnings: [] };

/**
 * Pure: converts one equipment selection's valid Spark outcome counts into normalized modifier inputs, one record per
 * non-zero outcome kind, keyed `equipment:<slot>#<n>/sparks:<outcome>`. Invalid, pending, unsupported-slot and
 * conflicting-offhand configurations are preserved by the caller's build and reported here without contributions.
 */
export function sparkModifiersForSelection(selection: EquipmentSelection, ref: EquipmentSourceRef, context: SparkAggregationContext): SparkAggregation {
  const { sparks } = selection;
  if (sparks.mode === 'none') return EMPTY;
  const warn = (code: AggregationWarning['code'], message: string, skillId?: string | null): SparkAggregation =>
    ({ modifiers: [], unsupported: [], warnings: [{ code, equipment: ref, message, ...(skillId ? { skillId } : {}) }] });
  if (!isOffensiveSparkSlot(selection.slot)) {
    return warn('spark-slot-unsupported', `Mastery Sparks saved on ${selection.slot} are retained but not modeled; only MainHand, OffHand, Ring and Necklace are supported.`);
  }
  if (context.offhandConflict && isOffhandSlot(selection.slot)) {
    return warn('spark-offhand-conflict', `Offhand Mastery Sparks are not applied while several saved items share the offhand position. Keep one item to apply its Sparks.`);
  }
  const evaluation = evaluateSparkConfiguration(sparks);
  if (evaluation.status === 'pending') return warn('spark-result-missing', `Mastery Spark simulation on ${selection.slot} has no result yet; no bonuses are applied.`, evaluation.skillId);
  if (evaluation.status === 'invalid') return warn('spark-configuration-invalid', `Mastery Sparks on ${selection.slot} are not applied: ${evaluation.issue.message}`, evaluation.skillId);
  if (evaluation.status === 'none') return EMPTY;
  const { skillId } = evaluation;
  const skill = context.data.getSkill(skillId);
  if (!skill?.combat) {
    return warn('spark-configuration-invalid', `Mastery Sparks on ${selection.slot} name ${skillId}, which is not an official combat skill; not applied.`, skillId);
  }
  const conditions: ModifierCondition[] = [{ kind: 'requires-active-skill', skillId,
    status: context.activeSkillIds.includes(skillId) ? 'met' : 'not-met' }];
  const modifiers: NormalizedModifier[] = [];
  const unsupported: UnsupportedEffect[] = [];
  for (const { outcome, attributeId, supported, interpretation } of sparkOutcomeSupport(skillId, context.data, context.registry)) {
    const count = evaluation.outcomeCounts[outcome.key];
    if (count === 0) continue;
    const key = `equipment:${ref.equipmentKey}/sparks:${outcome.key}`;
    const source: ModifierSource = {
      kind: 'spark', ...ref, mode: evaluation.mode, sparkCategory: 'skill-damage', skillId, outcome: outcome.key,
      outcomeCount: count, totalSparks: evaluation.total, modelVersion: evaluation.modelVersion,
      ...(evaluation.seed === undefined ? {} : { seed: evaluation.seed }),
    };
    if (!supported || interpretation.kind !== 'modifier') {
      unsupported.push({
        key, source, attributeId, reason: interpretation.kind === 'unsupported' ? interpretation.reason : 'unmapped-attribute',
        message: `${count} × "${sparkOutcomeText(outcome, skill.name ?? skillId)}" Spark outcome${count === 1 ? '' : 's'}: `
          + `${skill.name ?? skillId} has no official ${outcome.category} attribute (${attributeId}); not applied.`,
      });
      continue;
    }
    const { rule, scope, attribute } = interpretation;
    const value = sparkModifierValue(outcome.key, count);
    modifiers.push({
      key, category: rule.category, operation: rule.operation, attributeId: attribute.id, attributeLabel: attribute.label, scope,
      value, sourceValue: String(value), unit: rule.unit, conditions, applicability: conditions[0]!.status === 'met' ? 'conditions-met' : 'conditions-not-met',
      mappingRuleId: `${evaluation.modelVersion}:${outcome.key}`, confidence: 'assumed',
      assumptions: [...rule.assumptions, SPARK_ASSUMPTIONS.values, SPARK_ASSUMPTIONS.activeSkill, SPARK_ASSUMPTIONS.mapping], source,
    });
  }
  return { modifiers, unsupported, warnings: [] };
}

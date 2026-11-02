import { CONFIDENCE_ORDER, type ModifierAggregationResult, type ModifierCategory, type ModifierConfidence, type NormalizedModifier } from './modifiers';
import type {
  AbilityDamageData, AbilityDamageResult, AbilityDamageStep, AbilityDamageWarning, ComponentDamageResult,
  DamageAbility, DamageComponent, DamageComponentId, DamageDecisionReason, DamageModifierDecision,
} from './ability-damage-types';

const FLATS: readonly ModifierCategory[] = [
  'skill-damage-flat', 'ability-damage-flat', 'all-direct-damage-flat', 'all-damage-flat',
  'damage-type-direct-flat', 'damage-type-flat', 'all-indirect-damage-flat', 'damage-type-indirect-flat',
];
const PERCENTS: readonly ModifierCategory[] = [
  'skill-damage-percent', 'ability-damage-percent', 'all-direct-damage-percent', 'all-damage-percent',
  'damage-type-direct-percent', 'damage-type-percent', 'all-indirect-damage-percent', 'damage-type-indirect-percent',
];
const SKILL_BASE = 'skill-base-damage-percent';

export const ABILITY_DAMAGE_ASSUMPTIONS = {
  flats: 'Assumed: applicable flat categories add to the published base before percentage contributions; no caps or rounding are modeled.',
  percents: 'Assumed: each non-Skill-Base percentage contributes (original base + all applicable flats) × its fraction. Contributions add; categories do not compound.',
  skillBasePlacement: 'Assumed: Skill Base contributions are added after other percentage contributions, without subsequent scaling. Only original base × Skill Base fraction is confirmed.',
  delivery: 'Assumed: published PvE Damage, HealthSpecificDamage and ArmorSpecificDamage fields are direct hit components; embedded DoTs remain separate.',
  specializedBase: 'Assumed: the original-base Skill Base rule extends to a health-specific or armor-specific published component independently.',
} as const;

function weakest(...values: readonly ModifierConfidence[]): ModifierConfidence {
  return values.reduce((a, b) => CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b, 'validated');
}

function extractComponents(ability: DamageAbility): DamageComponent[] {
  const fields = [
    ['damage', 'Damage', ability.damage.damage],
    ['health-specific', 'HealthSpecificDamage', ability.damage.healthSpecificDamage],
    ['armor-specific', 'ArmorSpecificDamage', ability.damage.armorSpecificDamage],
  ] as const;
  function component(id: DamageComponentId, sourcePath: string, value: number | null, damageType: string,
    delivery: DamageComponent['delivery'], attributeHooks: DamageComponent['attributeHooks']): DamageComponent {
    return { id, sourcePath, originalBase: value, damageType, delivery, attributeHooks,
      baseStatus: value === null ? 'absent' : !Number.isFinite(value) || value < 0 ? 'unresolved' : value === 0 ? 'zero' : 'present' };
  }
  return [
    ...fields.map(([id, field, value]) => component(id, `PvE.${field}`, value, ability.damage.damageType, 'direct', ability.pve.attributeHooks)),
    ...(ability.pve.dots ?? []).map(dot => component(`dot:${dot.sourceIndex}`, `PvE.DoTs[${dot.sourceIndex}].DamagePerTick`,
      dot.damagePerTick, dot.damageType, 'indirect', dot.attributeHooks)),
  ];
}

function decide(modifier: NormalizedModifier, component: DamageComponent, ability: DamageAbility,
  aggregation: ModifierAggregationResult, hitCount: number): DamageModifierDecision {
  const result = (status: DamageModifierDecision['status'], reason: DamageDecisionReason, explanation: string): DamageModifierDecision =>
    ({ modifier, status, reason, explanation });
  const exclude = (reason: DamageDecisionReason, explanation: string) => result('excluded', reason, explanation);
  const uncertain = (reason: DamageDecisionReason, explanation: string) => result('uncertain', reason, explanation);
  const { scope, category } = modifier;
  const flat = FLATS.includes(category);
  if (!flat && !PERCENTS.includes(category) && category !== SKILL_BASE) {
    return exclude('not-normal-damage', 'Resource, mitigation and critical modifiers do not contribute to outgoing normal damage.');
  }
  if (component.baseStatus === 'absent') return exclude('absent-component', 'This damage field is absent; modifiers cannot create it.');
  if (scope.kind === 'skill' && ability.skill.status === 'resolved' && scope.skillId !== ability.skill.skillId) {
    return exclude('skill-mismatch', `Requires exact skill ${scope.skillId}; ability belongs to ${ability.skill.skillId}.`);
  }
  if (scope.kind === 'damage-type' && scope.damageType !== component.damageType) {
    return exclude('damage-type-mismatch', `Requires ${scope.damageType}; this component is ${component.damageType}.`);
  }
  if ((scope.kind === 'general' || scope.kind === 'damage-type') && scope.delivery !== null
    && scope.delivery !== 'direct-and-indirect' && scope.delivery !== component.delivery) {
    return exclude('delivery-mismatch', `Requires ${scope.delivery}; this component is ${component.delivery}.`);
  }
  if (scope.kind === 'skill' || scope.kind === 'ability-attribute-hook') {
    const hook = scope.kind === 'ability-attribute-hook' ? scope.hook : category === SKILL_BASE
      ? 'AttributesThatModBaseDamage' : flat ? 'AttributesThatDeltaDamage' : 'AttributesThatModDamage';
    const attribute = scope.kind === 'ability-attribute-hook' ? scope.attributeId : modifier.attributeId;
    if (!component.attributeHooks[hook]?.includes(attribute)) {
      return exclude('hook-mismatch', `${component.sourcePath} does not reference ${attribute} via ${hook}; hit hooks are not inherited by DoTs.`);
    }
  }
  if (modifier.conditions.some(c => c.kind === 'requires-active-skill' && !aggregation.activeSkillIds.includes(c.skillId))) {
    return exclude('required-skill-inactive', 'A required exact active-skill ID is absent from the aggregation.');
  }
  if (modifier.applicability === 'conditions-not-met' || modifier.conditions.some(c => c.status === 'not-met')) {
    return exclude('condition-not-met', 'T0012 evaluated a required condition as not met.');
  }
  if (modifier.applicability === 'conditions-unevaluated' || modifier.conditions.some(c => c.status === 'unevaluated')) {
    return uncertain('condition-unevaluated', 'A source condition has not been evaluated; its value is not added.');
  }
  if (scope.kind === 'skill' && (ability.skill.status !== 'resolved' || ability.skill.skillId === null)) {
    return uncertain('unresolved-skill', `Official ability skill ${ability.skill.sourceId} is unresolved.`);
  }
  if (component.baseStatus === 'unresolved') return uncertain('unresolved-base', 'The published base is invalid or unresolved.');
  if (!Number.isFinite(modifier.value) || modifier.operation !== (flat ? 'flat' : 'percent')
    || modifier.unit !== (flat ? 'points' : 'fraction')
    || (category.startsWith('skill-') && scope.kind !== 'skill')
    || (category.startsWith('ability-') && (scope.kind !== 'ability-attribute-hook' || scope.attributeId !== modifier.attributeId))) {
    return uncertain('invalid-modifier', 'Value, operation, unit or identity scope disagrees with the category contract.');
  }
  if (modifier.confidence === 'unknown') return uncertain('unknown-modifier', 'The modifier interpretation is unknown.');
  if ((scope.kind === 'general' || scope.kind === 'damage-type') && scope.delivery === null) {
    return uncertain('delivery-unspecified', 'The official mapping does not establish direct versus indirect applicability.');
  }
  if (component.delivery === 'indirect') return uncertain('indirect-not-calculated',
    'Scope matches an embedded DoT, but activation, per-tick modification and stacking rules are not implemented.');
  if (hitCount > 1 && flat && modifier.value !== 0) return uncertain('multiple-component-allocation',
    'Several hit components are published; allocating or duplicating this flat across them is unvalidated.');
  return result('applied', 'supported', 'Exact scope and evaluated conditions match; included in the supported-subset calculation.');
}

function calculateComponent(component: DamageComponent, ability: DamageAbility, aggregation: ModifierAggregationResult,
  hitCount: number, incomplete: boolean): ComponentDamageResult {
  const decisions = aggregation.modifiers.map(m => decide(m, component, ability, aggregation, hitCount));
  const applied = decisions.filter(d => d.status === 'applied').map(d => d.modifier);
  const assumptions = new Set(applied.flatMap(m => m.assumptions));
  const warnings: AbilityDamageWarning[] = decisions.filter(d => d.status === 'uncertain').map(d => ({
    code: d.reason, message: d.explanation, componentId: component.id, modifierKey: d.modifier.key,
  }));
  const steps: AbilityDamageStep[] = [];
  const available = component.baseStatus === 'present' || component.baseStatus === 'zero';
  if (component.baseStatus === 'unresolved') warnings.push({ code: 'unresolved-base', componentId: component.id, message: 'Published base is not a finite non-negative number.' });
  if (component.delivery === 'indirect') warnings.push({ code: 'indirect-not-calculated', componentId: component.id,
    message: 'Published DoT base, conditions and timing remain in the official record; no per-tick result or total is calculated.' });
  if (!available || component.delivery === 'indirect') return { ...component, decisions, steps,
    normalDamage: null, provisionalDamage: null, confidence: 'unknown', assumptions: [], warnings };

  const base = component.originalBase!;
  let current = base;
  steps.push({ category: 'original-base', modifierKey: null, operation: 'base', before: 0, basis: base, operand: 1,
    contribution: base, after: base, ruleConfidence: 'validated', confidence: 'validated',
    explanation: `Read ${component.sourcePath} unchanged. Source reproduction, not an observed in-game hit.` });
  const hasFlats = applied.some(m => FLATS.includes(m.category) && m.value !== 0);
  const hasPercents = applied.some(m => PERCENTS.includes(m.category) && m.value !== 0);
  const hasSkillBase = applied.some(m => m.category === SKILL_BASE && m.value !== 0);
  if (hasFlats) assumptions.add(ABILITY_DAMAGE_ASSUMPTIONS.flats);
  if (hasPercents) assumptions.add(ABILITY_DAMAGE_ASSUMPTIONS.percents);
  if (hasSkillBase && hasPercents) assumptions.add(ABILITY_DAMAGE_ASSUMPTIONS.skillBasePlacement);
  if (hasSkillBase && component.id !== 'damage') assumptions.add(ABILITY_DAMAGE_ASSUMPTIONS.specializedBase);
  const assumesDelivery = decisions.some(d => d.modifier.value !== 0 && (d.reason === 'delivery-mismatch'
    || (d.status === 'applied' && (d.modifier.scope.kind === 'general' || d.modifier.scope.kind === 'damage-type'))));
  if (assumesDelivery) {
    assumptions.add(ABILITY_DAMAGE_ASSUMPTIONS.delivery);
  }
  function add(modifier: NormalizedModifier, basis: number, operation: AbilityDamageStep['operation'], ruleConfidence: ModifierConfidence) {
    const contribution = basis * modifier.value;
    const after = current + contribution;
    steps.push({ category: modifier.category, modifierKey: modifier.key, operation, before: current, basis, operand: modifier.value,
      contribution, after, ruleConfidence, confidence: weakest(ruleConfidence, modifier.confidence),
      explanation: `${current} + (${basis} × ${modifier.value}) = ${after}${modifier.category === SKILL_BASE ? '; basis is the original published base only' : ''}.` });
    current = after;
  }
  for (const category of FLATS) for (const m of applied.filter(m => m.category === category)) add(m, 1, 'add-flat', 'assumed');
  const percentBasis = current;
  for (const category of PERCENTS) for (const m of applied.filter(m => m.category === category)) {
    add(m, percentBasis, 'add-percent-contribution', 'assumed');
  }
  for (const m of applied.filter(m => m.category === SKILL_BASE)) add(m, base, 'add-skill-base-contribution', 'validated');
  const invalidArithmetic = steps.some(s => ![s.before, s.basis, s.operand, s.contribution, s.after].every(Number.isFinite)) || current < 0;
  if (invalidArithmetic) warnings.push({ code: 'unresolved-arithmetic', componentId: component.id,
    message: 'Arithmetic overflowed or produced negative damage; no clamp or rounding rule is invented.' });
  let confidence = weakest(...steps.map(s => s.confidence));
  if (hasFlats || hasPercents || assumesDelivery || (hasSkillBase && component.id !== 'damage')) {
    confidence = weakest(confidence, 'assumed');
  }
  if (incomplete || warnings.length > 0) confidence = 'unknown';
  const provisionalDamage = invalidArithmetic ? null : current;
  return { ...component, decisions, steps, provisionalDamage,
    normalDamage: confidence === 'validated' ? provisionalDamage : null, confidence, assumptions: [...assumptions], warnings };
}

/**
 * Pure T0013 API. No aggregation, target simulation, rank substitution, component summation,
 * crit or DoT calculation occurs here. See README for the explicit provisional formula.
 */
export function calculateAbilityDamage(abilityId: string, aggregation: ModifierAggregationResult, data: AbilityDamageData): AbilityDamageResult {
  const ability = data.getAbility(abilityId) ?? null;
  const warnings: AbilityDamageWarning[] = [];
  let incomplete = false;
  function unresolved(code: string, message: string) { warnings.push({ code, message }); incomplete = true; }
  if (aggregation.gameDataVersion !== data.gameDataVersion || aggregation.buildGameDataVersion !== data.gameDataVersion) {
    unresolved('game-data-version-mismatch', `Ability data ${data.gameDataVersion}, aggregated data ${aggregation.gameDataVersion}, saved build ${aggregation.buildGameDataVersion}; versions differ.`);
  }
  // Unknown effects have no trustworthy applicability information; never infer it from prose.
  const unsupported = aggregation.unsupported.filter(u => u.reason !== 'progression-rewards-not-modifiers');
  if (unsupported.length > 0) unresolved('unsupported-build-effects', `${unsupported.length} unsupported build effects may change damage; preserved in aggregation.unsupported.`);
  if (aggregation.warnings.length > 0) unresolved('aggregation-incomplete', 'T0012 warnings are preserved in aggregation.warnings; omitted sources prevent a complete result.');
  if (!ability) unresolved('missing-ability', `No exact official ability ID ${abilityId}; no fallback was selected.`);
  if (ability && (ability.skill.status !== 'resolved' || !ability.skill.skillId)) unresolved('unresolved-skill', 'The ability has an unresolved official skill reference.');
  if (ability && (!ability.damage.damageType || ability.damage.damageType === 'Unknown')) unresolved('unresolved-damage-type', 'The ability has no resolved published damage type.');
  if (ability && (ability.keywordRuleCandidates.length > 0 || (ability.conditionalKeywords?.length ?? 0) > 0
    || ability.effectKeywordConstraints.length > 0 || (ability.pve.specialValues?.length ?? 0) > 0 || ability.specialInfo)) {
    unresolved('ability-mechanics-unresolved', 'Keyword rules, conditional keywords, effect constraints, special values or special-info prose remain uninterpreted in the official ability record.');
  }
  if (ability?.pve.dots?.length) unresolved('indirect-not-calculated', 'Embedded DoTs remain separate uncomputed records, including zero-valued or conditionally activated records.');
  if (ability && ability.damage.extraDamageIfTargetVulnerable !== null) warnings.push({ code: 'target-bonus-not-applied',
    message: `Published vulnerable-target extra damage ${ability.damage.extraDamageIfTargetVulnerable} is retained but not added to the normal baseline.` });
  warnings.push({ code: 'critical-unavailable', message: 'Critical chance, multipliers and target-dependent Phrenology rules are unsupported; criticalDamage is null.' });

  const extracted = ability ? extractComponents(ability) : [];
  const hitCount = extracted.filter(c => c.delivery === 'direct' && c.baseStatus !== 'absent').length;
  if (ability && hitCount === 0) unresolved('no-hit-components', 'No ordinary, health-specific or armor-specific hit base is published; absence is not zero.');
  if (hitCount > 1) warnings.push({ code: 'components-not-combined', message: 'Published hit components are kept separate; no total or flat allocation is inferred.' });
  const components = ability ? extracted.map(c => calculateComponent(c, ability, aggregation, hitCount, incomplete)) : [];
  const hits = components.filter(c => c.delivery === 'direct' && c.baseStatus !== 'absent');
  const confidence = incomplete || hits.length === 0 ? 'unknown' : weakest(...hits.map(c => c.confidence));
  const assumptions = [...new Set(components.flatMap(c => c.assumptions))];
  if (assumptions.length) warnings.push({ code: 'provisional-formula', message: 'Provisional values cover supported contributions only. Review assumptions and exclusions before comparing with game measurements.' });
  return {
    requestedAbilityId: abilityId, ability, provenance: ability ? data.getSourceMetadata(ability.source) : null,
    gameDataVersion: data.gameDataVersion, aggregation, formula: 'supported-components-v1', context: 'pve-normal-before-target-effects',
    components, normalDamage: hits.length === 1 ? hits[0]!.normalDamage : null,
    provisionalDamage: hits.length === 1 ? hits[0]!.provisionalDamage : null,
    criticalDamage: null, confidence, assumptions, warnings: [...warnings, ...components.flatMap(c => c.warnings)],
  };
}

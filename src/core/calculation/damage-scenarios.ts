import type { TargetConfiguration } from '../build/document';
import type { AbilityDamageData, AbilityDamageResult, DamageModifierDecision } from './ability-damage-types';
import { calculateAbilityDamage } from './ability-damage';
import type { ModifierAggregationResult, NormalizedModifier, UnsupportedEffect } from './modifiers';
import { applyTargetDummy, type TargetDamageResult, type TargetHitResult } from './target-damage';
import { DAMAGE_SCENARIO_ASSUMPTIONS, UNMODELED_DAMAGE_PROCS } from './scenario-treasure-rules';

export const isValidStampedeStacks = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0 && value <= 15;

const matchingVersions = (result: AbilityDamageResult, data: AbilityDamageData) => result.gameDataVersion === data.gameDataVersion
  && result.aggregation.gameDataVersion === data.gameDataVersion && result.aggregation.buildGameDataVersion === data.gameDataVersion;

/** Recalculate derived summary counts, retaining the original source records and provenance. */
function withModifiers(aggregation: ModifierAggregationResult, modifiers: readonly NormalizedModifier[]): ModifierAggregationResult {
  const byCategory: ModifierAggregationResult['summary']['byCategory'] = {};
  const counts = { ...byCategory };
  for (const modifier of modifiers) counts[modifier.category] = (counts[modifier.category] ?? 0) + 1;
  return { ...aggregation, modifiers, summary: { ...aggregation.summary, byCategory: counts, modifierCount: modifiers.length } };
}

/** Use the ordinary engine's exact hook, skill, condition and component applicability rules for scenario sources. */
function scenarioDecisions(result: AbilityDamageResult, category: NormalizedModifier['category'], data: AbilityDamageData): DamageModifierDecision[] {
  const sources = result.aggregation.modifiers.filter(modifier => modifier.category === category);
  if (!sources.length) return [];
  const probe = sources.map((modifier): NormalizedModifier => {
    const flat = modifier.scope.kind !== 'ability-attribute-hook' || modifier.scope.hook === 'AttributesThatDeltaDamage';
    return { ...modifier, category: flat ? 'ability-damage-flat' : 'ability-damage-percent',
      value: 0, operation: flat ? 'flat' : 'percent', unit: flat ? 'points' : 'fraction' };
  });
  const checked = calculateAbilityDamage(result.requestedAbilityId, withModifiers(result.aggregation, probe), data);
  const components = checked.components.filter(c => c.delivery === 'direct' && c.baseStatus !== 'absent');
  return sources.map(modifier => {
    const decisions = components.flatMap(c => c.decisions.filter(d => d.modifier.key === modifier.key));
    const decision = decisions.find(d => d.status === 'applied') ?? decisions.find(d => d.status === 'uncertain') ?? decisions[0];
    return decision ? { ...decision, modifier } : { modifier, status: 'excluded', reason: 'absent-component', explanation: 'No direct-hit component.' };
  });
}

export interface StackContribution {
  readonly modifier: NormalizedModifier;
  readonly perStack: number;
  readonly stacks: number;
  readonly flatBonus: number;
}

export interface StampedeScenarioResult {
  readonly status: 'estimated' | 'unavailable';
  readonly stacks: number;
  readonly contributions: readonly StackContribution[];
  readonly flatBonus: number | null;
  readonly baseline: TargetDamageResult;
  readonly projected: TargetDamageResult | null;
  /** The ordinary engine result with scenario flats, for the existing numerical breakdown. */
  readonly projectedDamage: AbilityDamageResult | null;
  readonly decisions: readonly DamageModifierDecision[];
  readonly assumptions: readonly string[];
  readonly warnings: readonly string[];
}

/** A current-state scenario, never stack generation, time tracking or a new damage formula. */
export function calculateStampedeScenario(result: AbilityDamageResult, target: TargetConfiguration, stacks: number,
  data: AbilityDamageData): StampedeScenarioResult | null {
  const decisions = scenarioDecisions(result, 'stampede-damage-per-stack', data);
  const relevant = decisions.filter(d => d.status !== 'excluded');
  if (!relevant.length) return null;
  const valid = isValidStampedeStacks(stacks) && relevant.every(d => d.status === 'applied'
    && Number.isFinite(d.modifier.value) && d.modifier.value >= 0)
    && matchingVersions(result, data);
  const contributions = valid ? relevant.map(({ modifier }) => ({ modifier, perStack: modifier.value, stacks, flatBonus: modifier.value * stacks })) : [];
  const flatBonus = valid ? contributions.reduce((sum, c) => sum + c.flatBonus, 0) : null;
  const replacements = new Map(contributions.map(c => [c.modifier.key, c]));
  const projectedDamage = !valid ? null : stacks === 0 ? result : calculateAbilityDamage(result.requestedAbilityId,
    withModifiers(result.aggregation, result.aggregation.modifiers.map(modifier => {
      const contribution = replacements.get(modifier.key);
      return contribution ? { ...modifier, category: 'ability-damage-flat', value: contribution.flatBonus,
        sourceValue: `${modifier.sourceValue} × ${stacks}`, attributeLabel: 'Continuous Trampling stack damage' } : modifier;
    })), data);
  const baseline = applyTargetDummy(result, target);
  const projected = projectedDamage ? stacks === 0 ? baseline : applyTargetDummy(projectedDamage, target) : null;
  const available = projected !== null && projected.hits.some(h => h.perTarget !== null);
  return { status: valid && available ? 'estimated' : 'unavailable', stacks, contributions, flatBonus, baseline, projected, projectedDamage,
    decisions, assumptions: [DAMAGE_SCENARIO_ASSUMPTIONS.stacks],
    warnings: valid ? available ? [] : ['A required direct-hit or target value is unavailable.'] : ['Stacks must be whole numbers from 0 to 15 and all contributing sources must have resolved applicability and matching data versions.'] };
}

export interface ProcHit {
  readonly componentId: TargetHitResult['componentId'];
  readonly damageType: string;
  readonly normal: number | null;
  readonly triggered: number | null;
  readonly expected: number | null;
  readonly normalTotal: number | null;
  readonly triggeredTotal: number | null;
  readonly expectedTotal: number | null;
}

export interface ProcSourceResult {
  readonly modifier: NormalizedModifier;
  readonly probability: number | null;
  /** Each source in isolation; never a claim about simultaneous rolls. */
  readonly hits: readonly ProcHit[];
}

export interface DamageProcResult {
  readonly status: 'estimated' | 'unavailable';
  readonly probability: number | null;
  readonly sources: readonly ProcSourceResult[];
  readonly hits: readonly ProcHit[];
  readonly decisions: readonly DamageModifierDecision[];
  readonly unresolved: readonly { readonly effect: UnsupportedEffect; readonly reason: string }[];
  readonly assumptions: readonly string[];
  readonly warnings: readonly string[];
}

/** Expected damage per successful noncritical hit. Invalid probabilities/arithmetic never clamp to plausible numbers. */
export function expectedProcHit(normal: number | null, triggered: number | null, probability: number): number | null {
  if (normal === null || !Number.isFinite(normal) || normal < 0 || !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
  if (probability === 0) return normal;
  if (triggered === null || !Number.isFinite(triggered) || triggered < 0) return null;
  const expected = normal * (1 - probability) + triggered * probability;
  return Number.isFinite(expected) ? expected : null;
}

const numeric = (value: number | null): number | null => value !== null && Number.isFinite(value) && value >= 0 ? value : null;

/** A separate stage from criticals; callers supply the ordinary noncritical target result. */
export function calculateDamageProcs(result: AbilityDamageResult, target: TargetDamageResult, targetConfig: TargetConfiguration,
  data: AbilityDamageData): DamageProcResult | null {
  const decisions = scenarioDecisions(result, 'chance-damage-proc', data);
  const relevant = decisions.filter(d => d.status !== 'excluded');
  const unresolved = result.aggregation.unsupported.flatMap(effect => {
    if (effect.source.kind !== 'existing-power' && effect.source.kind !== 'candidate-mod') return [];
    const powerId = effect.source.powerId;
    const rule = UNMODELED_DAMAGE_PROCS.find(r => r.powerId === powerId
      && (r.skillId === '*' || r.skillId === result.ability?.skill.skillId)
      && (!r.keywords.length || r.keywords.some(keyword => result.ability?.keywords?.includes(keyword))));
    // A supported identity with changed/unrecognized tier text must also remain visibly unavailable.
    const supportedScopes: Record<string, readonly [string, string]> = {
      power_4062: ['Psychology', 'StrikeANerve'], power_21023: ['Deer', 'DeerBash'], power_22085: ['Pig', 'PigRend'],
      power_28124: ['SpiritFox', 'SpiritBolt'], power_20003: ['Cow', 'CowFrontKick'],
    };
    const scope = supportedScopes[powerId];
    const reason = rule?.reason ?? (scope && scope[0] === result.ability?.skill.skillId && result.ability.keywords?.includes(scope[1])
      ? 'The selected source does not match its supported exact tier template.' : null);
    return reason ? [{ effect, reason }] : [];
  });
  if (!relevant.length && !unresolved.length) return null;
  const warnings: string[] = unresolved.map(row => `${row.effect.key}: ${row.reason}`);
  const sources = relevant.map(({ modifier, status }): ProcSourceResult => {
    const proc = modifier.proc;
    const valid = status === 'applied' && proc !== undefined && Number.isFinite(proc.probability) && proc.probability >= 0 && proc.probability <= 1
      && Number.isFinite(modifier.value) && modifier.value >= 0 && matchingVersions(result, data)
      && (proc.effect === 'multiply-hit' ? modifier.operation === 'multiply' && modifier.unit === 'multiplier'
        : proc.effect === 'add-flat' && modifier.operation === 'flat' && modifier.unit === 'points');
    const probability = valid ? proc.probability : null;
    // Flat procs must pass through the existing formula (and its allocation safeguards), then the existing target stage.
    const triggeredDamage = valid && proc.effect === 'add-flat' ? calculateAbilityDamage(result.requestedAbilityId,
      withModifiers(result.aggregation, result.aggregation.modifiers.map(m => m.key === modifier.key
        ? { ...m, category: 'ability-damage-flat', operation: 'flat', unit: 'points' } : m)), data) : null;
    const triggeredTarget = triggeredDamage ? applyTargetDummy(triggeredDamage, targetConfig) : null;
    const ambiguousAllocation = triggeredDamage?.components.some(c => c.decisions.some(d => d.modifier.key === modifier.key && d.status === 'uncertain')) ?? false;
    if (!valid) warnings.push(`Source ${modifier.key}: invalid proc contract, applicability or data version.`);
    if (ambiguousAllocation) warnings.push(`Source ${modifier.key}: flat allocation among multiple damage components is unavailable.`);
    return { modifier, probability, hits: target.hits.map(hit => {
      const normal = numeric(hit.perTarget);
      const triggered = !valid || ambiguousAllocation ? null : proc.effect === 'multiply-hit'
        ? numeric(normal === null ? null : normal * modifier.value)
        : numeric(triggeredTarget?.hits.find(h => h.componentId === hit.componentId)?.perTarget ?? null);
      const expected = probability === null ? null : expectedProcHit(normal, triggered, probability);
      const total = (value: number | null) => numeric(value === null || target.affectedTargets === null ? null : value * target.affectedTargets);
      return { componentId: hit.componentId, damageType: hit.damageType, normal, triggered, expected,
        normalTotal: numeric(hit.total), triggeredTotal: total(triggered), expectedTotal: total(expected) };
    }) };
  });
  if (sources.length > 1) warnings.push(DAMAGE_SCENARIO_ASSUMPTIONS.duplicates);
  const single = sources.length === 1 && !unresolved.length ? sources[0]! : null;
  const hits = single?.hits ?? target.hits.map(hit => ({ componentId: hit.componentId, damageType: hit.damageType, normal: hit.perTarget,
    normalTotal: hit.total, triggered: null, expected: null, triggeredTotal: null, expectedTotal: null }));
  return { status: single && hits.some(hit => hit.expected !== null) && warnings.length === 0 ? 'estimated' : 'unavailable',
    probability: single?.probability ?? null, sources, hits, decisions, unresolved,
    assumptions: [...new Set(relevant.flatMap(d => d.modifier.assumptions))], warnings };
}

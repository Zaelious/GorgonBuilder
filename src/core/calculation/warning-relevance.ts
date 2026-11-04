import type { ModifierAggregationResult, UnsupportedEffect } from './modifiers';
import { getMappingIndex, parseEffectDescription, type ModifierDataContext } from './registry';
import { classifyRemainder, parseProseDamageClause, type OtherMechanic } from './prose-damage-grammar';
import { DIRECT_TREASURE_RULES } from './direct-treasure-rules';
import { interpretTreasureEffect } from './treasure-effect-rules';

export type WarningRelevance = 'non-damage' | 'damage-affecting' | 'unknown';
export interface ClassifiedUnsupportedEffect {
  readonly effect: UnsupportedEffect;
  readonly kind: WarningRelevance;
  readonly evidence: string;
}

// These complete clause meanings cannot change the displayed successful direct hit.
// Deliberately exclude criticals, pets, DoTs, reflection, self buffs and defensive damage clauses.
const NON_DAMAGE: ReadonlySet<OtherMechanic> = new Set([
  'taunt', 'reuse-time', 'power-cost', 'rage', 'control', 'range-accuracy', 'call-for-help', 'restore-resource',
]);
const DAMAGE_OTHER: ReadonlySet<OtherMechanic> = new Set(['critical', 'reactive', 'pet', 'self-damage', 'dot']);
const DAMAGE_HOOKS = new Set(['AttributesThatDeltaDamage', 'AttributesThatDeltaDamageIfTargetIsVulnerable',
  'AttributesThatModBaseDamage', 'AttributesThatModDamage', 'AttributesThatModCritDamage']);
const NON_DAMAGE_HOOKS = new Set(['AttributesThatDeltaTaunt', 'AttributesThatDeltaTempTaunt', 'AttributesThatModTaunt',
  'AttributesThatDeltaRage', 'AttributesThatModRage', 'AttributesThatDeltaAccuracy', 'AttributesThatDeltaRange']);
// Official v490 identities + display meanings, not a prefix or text search.
const NON_DAMAGE_ATTRIBUTES: Readonly<Record<string, readonly [string, string]>> = {
  ABILITY_RESETTIME_DELTA_MOCK: ['Mock Reuse Timer', 'AsDebuffDelta'],
  CUR_RAGE: ['Current Rage', 'AsInt'],
  MAX_RAGE: ['Max Rage', 'AsInt'],
};

/** Presentation only: neither edits aggregation nor changes formula confidence or arithmetic.
 * A modeled remainder must have the exact sibling damage drafts that the current interpreter produces.
 * Classification never treats an unknown ability association as evidence of irrelevance.
 */
export function classifyUnsupportedEffect(effect: UnsupportedEffect, aggregation: ModifierAggregationResult,
  data: ModifierDataContext): ClassifiedUnsupportedEffect {
  const classified = (kind: WarningRelevance, evidence: string): ClassifiedUnsupportedEffect => ({ effect, kind, evidence });
  const source = effect.source;
  const description = 'description' in source ? source.description : null;
  if (effect.attributeId) {
    const attribute = data.getAttribute(effect.attributeId);
    if (!attribute || effect.reason !== 'unmapped-attribute') {
      return classified('unknown', 'The attribute or its source interpretation is unresolved.');
    }
    const hooks = [...(getMappingIndex(data).hooksByAttribute.get(effect.attributeId) ?? [])];
    if (hooks.some(hook => DAMAGE_HOOKS.has(hook))) return classified('damage-affecting', 'Official damage/critical attribute hook; contribution unresolved.');
    const exact = NON_DAMAGE_ATTRIBUTES[attribute.id];
    if ((hooks.length > 0 && hooks.every(hook => NON_DAMAGE_HOOKS.has(hook))) ||
      (exact && attribute.label === exact[0] && attribute.displayType === exact[1])) {
      // Unknown required-skill and malformed/non-numeric source records are never dismissed.
      if (description && parseEffectDescription(description).kind !== 'attribute') return classified('unknown', 'The published token could not be resolved.');
      return classified('non-damage', `Official ${attribute.label ?? attribute.id} attribute: ${hooks.join(', ') || 'explicit resource/reuse identity'}.`);
    }
    return classified('unknown', 'No reviewed non-damage-only meaning for this attribute.');
  }
  if (effect.reason !== 'prose-effect' || description === null) return classified('unknown', 'Source semantics remain unresolved.');

  if (effect.key.endsWith('/remainder') && (source.kind === 'existing-power' || source.kind === 'candidate-mod')) {
    const interpreted = interpretTreasureEffect(source.powerId, description, data);
    const baseKey = effect.key.slice(0, -'/remainder'.length);
    if (interpreted?.kind !== 'drafts' || !interpreted.rule.unmodeled || !interpreted.drafts.length ||
      !interpreted.drafts.every(draft => aggregation.modifiers.some(modifier =>
        modifier.key === `${baseKey}/rule:${draft.part}` && modifier.source === source &&
        modifier.mappingRuleId === interpreted.rule.id && modifier.category === draft.category && modifier.value === draft.value))) {
      return classified('unknown', 'The accompanying modeled contribution could not be verified.');
    }
    // Every remainder in this existing exact ID/InternalName/full-sentence allow-list is explicitly secondary.
    if (DIRECT_TREASURE_RULES.some(rule => rule.id === interpreted.rule.id && rule.unmodeled)) {
      return classified('non-damage', 'Audited exact power and full sentence: damage is calculated; only taunt/reuse/Rage/resource/accuracy/control remains.');
    }
    const remainder = interpreted.grammar?.remainder;
    if (remainder?.recognized && remainder.direct.length === 0 && remainder.other.length > 0 && remainder.other.every(kind => NON_DAMAGE.has(kind))) {
      return classified('non-damage', `Fully recognized secondary clauses: ${remainder.other.join(', ')}. Damage is calculated separately.`);
    }
    if (remainder && (remainder.direct.length > 0 || remainder.other.some(kind => DAMAGE_OTHER.has(kind)))) {
      return classified('damage-affecting', 'Recognized damage-affecting remainder is not calculated.');
    }
    return classified('unknown', 'The remainder is not confirmed to be non-damage-only.');
  }

  // Entire unsupported sentence must consist solely of reviewed clauses. A damage clause, condition or unknown suffix
  // fails this check; merely mentioning Rage, taunt, healing or reuse anywhere is never sufficient.
  const text = description.replace(/^(?:<icon=\d+>)*/u, '');
  const whole = classifyRemainder(` and ${text}`);
  if (whole.recognized && whole.direct.length === 0 && whole.other.length > 0 && whole.other.every(kind => NON_DAMAGE.has(kind))) {
    return classified('non-damage', `Complete non-damage-only sentence: ${whole.other.join(', ')}.`);
  }
  if (parseProseDamageClause(description) || (whole.recognized && (whole.direct.length || whole.other.some(kind => DAMAGE_OTHER.has(kind))))) {
    return classified('damage-affecting', 'Explicit damage-affecting source meaning remains unmodeled.');
  }
  return classified('unknown', 'Effect meaning or damage relevance is unknown; it may affect this ability.');
}

export function classifyBuildWarnings(aggregation: ModifierAggregationResult, data: ModifierDataContext) {
  const records = aggregation.unsupported.filter(effect => effect.reason !== 'progression-rewards-not-modifiers')
    .map(effect => classifyUnsupportedEffect(effect, aggregation, data));
  return {
    nonDamage: records.filter(record => record.kind === 'non-damage'),
    damage: records.filter(record => record.kind === 'damage-affecting'),
    unknown: records.filter(record => record.kind === 'unknown'),
  };
}

import type { GameDataRepository } from '../../data/repository/repository';
import { createDefaultBuildDocument } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { damageHooksForAbility } from './keyword-damage';
import type { ModifierAggregationResult, NormalizedModifier } from './modifiers';
import { parseEffectDescription } from './registry';
import { TREASURE_EFFECT_RULES, interpretTreasureEffect } from './treasure-effect-rules';

export type CoverageStatus = 'fully-modeled' | 'partially-modeled' | 'unmodeled' | 'non-damage' | 'unresolved';
export interface CoverageEvidence {
  status: CoverageStatus;
  reason: string;
  rules: string[];
  mappings: Pick<NormalizedModifier, 'attributeId' | 'category' | 'scope' | 'operation' | 'value' | 'sourceValue' | 'confidence' | 'conditions'>[];
  appliedAbilityIds: string[];
  uncertainAbilityIds: string[];
}
export interface TreasureCoverageRow {
  powerId: string; internalName: string; skill: string; combat: boolean;
  tierId: string; effectIndex: number; description: string; sourcePath: string;
  attributeId: string | null; attributeLabel: string | null; displayType: string | null;
  requiredSkillId: string | null; family: string; damageRelevant: boolean | null;
  before: CoverageEvidence; after: CoverageEvidence;
}

/** Inventory classification only, NEVER a formula parser. Every source sentence is retained for review.
 * Ambiguous incoming/outgoing prose remains damage-relevant, conservatively reducing coverage.
 */
export function classifyTreasureEffect(text: string, attributeId: string | null, label: string | null) {
  const s = (label ?? text).replace(/<icon=\d+>/gu, '');
  if (attributeId && /^(?:MITIGATION_|VULN_|MAX_|ABILITY_COST_|ABILITY_RESETTIME_|ACCURACY_|EVASION_|RESIST_|TAUNT_|ABILITY_TAUNT_)/u.test(attributeId)) {
    return { family: 'non-damage-stat', relevant: false };
  }
  const relevant = /damage|critical|\bcrit\b|hits? (?:all|additional|multiple)|extra (?:attacks?|hits?)|additional targets?|damage type/iu.test(s);
  if (!relevant) return { family: attributeId && label === null ? 'unresolved-attribute' : 'non-damage', relevant: attributeId && label === null ? null : false };
  if (!attributeId && /(?:take|suffer|receive) [+-]?\d+%? (?:less |more )?damage|damage (?:reduction|resistance)|mitigat/iu.test(s)
    && !/deal|inflict|reflect|retaliat|damage shield|attack.*damage|hits? all/iu.test(s)) return { family: 'incoming-defense', relevant: false };
  if (/pet|skeleton|zombie|golem|minion|cold sphere/iu.test(s)) return { family: 'pet-damage', relevant: true };
  if (/damage shield|reflect|retaliat/iu.test(s)) return { family: 'reactive-damage', relevant: true };
  if (/over \d|per tick|every \d|DoT|over.time|indirect/iu.test(s)) return { family: 'indirect-dot', relevant: true };
  if (/critical|\bcrit\b|chance.*damage/iu.test(s)) return { family: 'critical-or-random', relevant: true };
  if (/after|next |while|when |\bif\b|against|to (?:stunned|non-elite|elite|undead)|for \d+ seconds|targets (?:with|whose|that)/iu.test(s)) return { family: 'conditional-stateful', relevant: true };
  if (/extra (?:attack|hit)|additional (?:attack|strike)/iu.test(s)) return { family: 'extra-attacks', relevant: true };
  if (/damage type|damage becomes/iu.test(s)) return { family: 'damage-type-conversion', relevant: true };
  if (/damage is halved|double damage|total damage/iu.test(s)) return { family: 'final-multiplier', relevant: true };
  if (/becomes|hits? (?:all|additional)|additional target/iu.test(s)) return { family: 'targeting-conversion', relevant: true };
  if (attributeId?.startsWith('MOD_SKILL_') && !attributeId.startsWith('MOD_SKILL_ALL_')) return { family: 'skill-base', relevant: true };
  return { family: /%|^MOD_/u.test(s) || attributeId?.startsWith('MOD_') ? 'direct-percent' : 'direct-flat-or-special', relevant: true };
}

export function inventoryTreasureEffects(data: GameDataRepository): TreasureCoverageRow[] {
  // T0014 baseline: original registry with direct PvE hooks only and the two original Mock rules.
  const baseline = { ...data, keywordRules: [] };
  const baselineRules = TREASURE_EFFECT_RULES.filter(r => ['power_4032', 'power_4066'].includes(r.powerId));
  const combat = new Set(data.skills.filter(s => s.combat).map(s => s.id));
  const abilities = data.abilities.filter(a => combat.has(a.skill.skillId ?? ''));
  const supportCache = new Map<string, { applied: string[]; uncertain: string[] }>();
  function support(m: NormalizedModifier, aggregation: ModifierAggregationResult, original: boolean) {
    const context = original ? baseline : data;
    const key = JSON.stringify([original, m.attributeId, m.category, m.scope, m.value === 0, m.conditions]);
    const cached = supportCache.get(key);
    if (cached) return cached;
    const applied: string[] = [], uncertain: string[] = [];
    for (const ability of abilities) {
      const scope = m.scope;
      const hooks = damageHooksForAbility(ability, context);
      if (scope.kind === 'skill' && scope.skillId !== ability.skill.skillId) continue;
      if (scope.kind === 'damage-type' && scope.damageType !== ability.damage.damageType && !ability.pve.dots?.some(d => d.damageType === scope.damageType)) continue;
      if (scope.kind === 'ability-attribute-hook' && !hooks[scope.hook]?.includes(scope.attributeId)
        && !ability.pve.dots?.some(d => d.attributeHooks[scope.hook]?.includes(scope.attributeId))) continue;
      const input = { ...aggregation, modifiers: [m], unsupported: [], warnings: [],
        activeSkillIds: [ability.skill.skillId!, ...m.conditions.flatMap(c => c.kind === 'requires-active-skill' ? [c.skillId] : [])] };
      const result = calculateAbilityDamage(ability.id, input, context);
      const decisions = result.components.flatMap(c => c.decisions);
      if (decisions.some(d => d.status === 'applied')) applied.push(ability.id);
      if (decisions.some(d => d.status === 'uncertain')) uncertain.push(ability.id);
    }
    const value = { applied, uncertain };
    supportCache.set(key, value);
    return value;
  }
  function evidence(row: Omit<TreasureCoverageRow, 'before' | 'after'>, agg: ModifierAggregationResult, original: boolean): CoverageEvidence {
    const empty = (status: CoverageStatus, reason: string): CoverageEvidence => ({ status, reason, rules: [], mappings: [], appliedAbilityIds: [], uncertainAbilityIds: [] });
    if (row.damageRelevant === false) return empty('non-damage', 'Excluded from outgoing per-use damage denominator; preserved in complete inventory.');
    if (row.damageRelevant === null) return empty('unresolved', 'Attribute identity/meaning unresolved; listed separately, not claimed non-damage.');
    const modifiers = agg.modifiers.filter(m => (m.source.kind === 'candidate-mod') && m.source.effectIndex === row.effectIndex);
    const curated = interpretTreasureEffect(row.powerId, row.description, original ? baseline : data, original ? baselineRules : TREASURE_EFFECT_RULES);
    const rules = [...new Set(modifiers.map(m => m.mappingRuleId))];
    const mappings = modifiers.map(({ attributeId, category, scope, operation, value, sourceValue, confidence, conditions }) =>
      ({ attributeId, category, scope, operation, value, sourceValue, confidence, conditions }));
    // Existing exact Mock conversion is implemented by the target stage, with duplicate conflicts retained there.
    if (row.powerId === 'power_4032' && curated?.kind === 'drafts') return { ...empty('fully-modeled', 'Exact Mock Burst conversion and independent 0.5 multiplier; target-count assumptions remain separate.'), rules, mappings, appliedAbilityIds: abilities.filter(a => a.skill.skillId === 'Psychology' && a.keywords?.includes('Mock')).map(a => a.id) };
    const damage = modifiers.filter(m => /damage/u.test(m.category) && !/mitigation|critical/u.test(m.category));
    const probes = damage.map(m => support(m, agg, original));
    const appliedAbilityIds = [...new Set(probes.flatMap(p => p.applied))];
    const uncertainAbilityIds = [...new Set(probes.flatMap(p => p.uncertain))];
    if (!appliedAbilityIds.length) return { ...empty('unmodeled', damage.length
      ? 'Mapping exists but no applicable computable combat hit: missing hooks/base, unspecified delivery, split flat allocation or indirect-only dependency.'
      : `No safe numeric rule for ${row.family}; requires an audited mapping or separate mechanics research.`), rules, mappings, uncertainAbilityIds };
    const partial = uncertainAbilityIds.length > 0 || probes.some(p => !p.applied.length) || (curated?.kind === 'drafts' && !!curated.rule.unmodeled)
      || damage.some(m => 'delivery' in m.scope && m.scope.delivery === 'direct-and-indirect');
    return { status: partial ? 'partially-modeled' : 'fully-modeled', rules, mappings, appliedAbilityIds, uncertainAbilityIds,
      reason: partial ? 'Direct contribution computed, but side effects, indirect delivery or some applicable hit allocations remain unmodeled.'
        : 'Outgoing damage contribution reaches applicable published hits; formula stacking/order remains assumed, not game-validated.' };
  }
  const rows: TreasureCoverageRow[] = [];
  for (const power of data.treasurePowers) {
    for (const tier of power.tiers) {
      const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
      build.equipment = [{ slot: power.slots[0] ?? 'Head', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [{ powerId: power.id, tierId: tier.id }], sparks: { mode: 'none' } }];
      const requirements = tier.effectDescriptions.map(parseEffectDescription).flatMap(p => p.kind === 'attribute' && p.requiredSkillId ? [p.requiredSkillId] : []);
      if (requirements[0]) build.skillSlotA = { skillId: requirements[0], level: 0 };
      const before = aggregateBuildModifiers(build, baseline, { treasureRules: baselineRules });
      const after = aggregateBuildModifiers(build, data);
      tier.effectDescriptions.forEach((description, effectIndex) => {
        const parsed = parseEffectDescription(description);
        const attributeId = parsed.kind === 'attribute' ? parsed.attributeId : null;
        const attr = attributeId ? data.getAttribute(attributeId) : null;
        const classified = parsed.kind === 'malformed' ? { family: 'malformed-structured', relevant: null }
          : classifyTreasureEffect(description, attributeId, attr?.label ?? null);
        const row = { powerId: power.id, internalName: power.internalName, skill: power.skill.sourceId, combat: combat.has(power.skill.skillId ?? ''), tierId: tier.id,
          effectIndex, description, sourcePath: `tsysclientinfo/${power.id}/Tiers/${tier.id}/Effects[${effectIndex}]`, attributeId,
          attributeLabel: attr?.label ?? null, displayType: attr?.displayType ?? null,
          requiredSkillId: parsed.kind === 'attribute' ? parsed.requiredSkillId : null, family: classified.family, damageRelevant: classified.relevant };
        rows.push({ ...row, before: evidence(row, before, true), after: evidence(row, after, false) });
      });
    }
  }
  return rows;
}

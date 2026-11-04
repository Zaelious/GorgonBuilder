// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { damageHooksForAbility } from './keyword-damage';
import { DIRECT_TREASURE_DEFINITIONS } from './direct-treasure-rules';
import { interpretTreasureEffect } from './treasure-effect-rules';
import { parseEffectDescription } from './registry';
import { burstTargetFalloff, linearDirectBurstEstimate } from './target-damage';

const data = loadPlannerFixture();
const combat = data.skills.filter(s => s.combat);
function build(powerId: string, tierId: string, skillId: string | null = null) {
  const b = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  b.skillSlotA = { skillId, level: 0 };
  b.equipment = [{ slot: 'Head', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [{ powerId, tierId }], sparks: { mode: 'none' } }];
  return b;
}

it('accounts for every officially flagged combat skill including skills without published direct hits', () => {
  expect(combat).toHaveLength(35);
  expect(combat.filter(s => !data.getAbilitiesForSkill(s.id).some(a => Object.values({ d: a.damage.damage, h: a.damage.healthSpecificDamage, a: a.damage.armorSpecificDamage }).some(v => v !== null && v > 0))).map(s => s.id).sort())
    .toEqual(['Angling', 'Axe', 'Performance_Dance', 'Performance_Percussion', 'Performance_Strings', 'Performance_Wind', 'Riding']);
});

describe.each(combat)('official $id fixture', skill => {
  it('preserves published bases and reverses one real structured treasure contribution when available', () => {
    const abilities = data.getAbilitiesForSkill(skill.id).filter(a => [a.damage.damage, a.damage.healthSpecificDamage, a.damage.armorSpecificDamage].filter(v => v !== null).length === 1
      && [a.damage.damage, a.damage.healthSpecificDamage, a.damage.armorSpecificDamage].some(v => v !== null && v > 0));
    if (!abilities.length) {
      expect(['Angling', 'Axe', 'Performance_Dance', 'Performance_Percussion', 'Performance_Strings', 'Performance_Wind', 'Riding']).toContain(skill.id);
      return;
    }
    const empty = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
    const bare = aggregateBuildModifiers(empty, data);
    const ability = abilities[0]!;
    const base = [ability.damage.damage, ability.damage.healthSpecificDamage, ability.damage.armorSpecificDamage].find(v => v !== null)!;
    expect(calculateAbilityDamage(ability.id, bare, data).provisionalDamage).toBe(base);
    let checked = false;
    for (const power of data.treasurePowers.filter(p => p.skill.skillId === skill.id)) {
      const tier = power.tiers.find(t => t.effectDescriptions.length === 1 && parseEffectDescription(t.effectDescriptions[0]!).kind === 'attribute');
      if (!tier) continue;
      const b = build(power.id, tier.id, skill.id), agg = aggregateBuildModifiers(b, data);
      if (agg.modifiers.length !== 1) continue;
      const m = agg.modifiers[0]!;
      for (const a of abilities) {
        const result = calculateAbilityDamage(a.id, agg, data);
        const hit = result.components.find(c => c.decisions.some(d => d.status === 'applied'));
        if (!hit || m.value === 0) continue;
        const expected = hit.originalBase! + (m.operation === 'flat' ? m.value : hit.originalBase! * m.value);
        expect(hit.provisionalDamage, `${power.id}/${tier.id}/${a.id}`).toBeCloseTo(expected, 8);
        expect(hit.steps.filter(s => s.modifierKey)).toHaveLength(1);
        b.equipment = [];
        expect(calculateAbilityDamage(a.id, aggregateBuildModifiers(b, data), data).provisionalDamage).toBe(hit.originalBase);
        if (m.scope.kind === 'skill' || m.scope.kind === 'ability-attribute-hook') {
          const other = data.abilities.find(other => other.skill.skillId !== skill.id && other.damage.damage !== null)!;
          expect(calculateAbilityDamage(other.id, agg, data).components.flatMap(c => c.decisions).some(d => d.status === 'applied')).toBe(false);
        }
        checked = true; break;
      }
      if (checked) break;
    }
    // Animal Handling's player hits have no eligible single-line structured treasure bonus; pets are not substituted.
    if (!checked) expect(skill.id).toBe('AnimalHandling');
  });
});

describe.each(DIRECT_TREASURE_DEFINITIONS)('$powerId / $internalName exact prose', def => {
  it('computes the direct clause once for working imported and planned sources and reverses removal', () => {
    const tier = data.getTreasurePower(def.powerId)!.tiers[0]!;
    const hooked = data.getAbilitiesForSkill(def.skillId).find(a =>
      [a.damage.damage, a.damage.healthSpecificDamage, a.damage.armorSpecificDamage].filter(v => v !== null).length === 1
      && def.attributes.some(id => a.pve.attributeHooks[def.percent ? 'AttributesThatModDamage' : 'AttributesThatDeltaDamage']?.includes(id)));
    expect(hooked, def.powerId).toBeDefined();
    const planned = build(def.powerId, tier.id, def.skillId);
    const imported = structuredClone(planned);
    imported.equipment[0]!.candidateMods = [];
    imported.equipment[0]!.item = { kind: 'imported', instance: { baseItemId: null,
      existingPowers: [{ powerId: def.powerId, tierId: tier.id }],
      metadata: { originalWorkingPowers: [{ powerId: def.powerId, tierId: tier.id }] } } };
    const a = calculateAbilityDamage(hooked!.id, aggregateBuildModifiers(planned, data), data);
    const b = calculateAbilityDamage(hooked!.id, aggregateBuildModifiers(imported, data), data);
    expect(a.provisionalDamage).not.toBeNull();
    expect(b.provisionalDamage).toBe(a.provisionalDamage);
    const hit = a.components.find(c => c.baseStatus !== 'absent' && c.delivery === 'direct')!;
    const numeric = Number(tier.effectDescriptions[0]!.replace(/<icon=\d+>/gu, '').match(/\+([\d.]+)/u)![1]);
    expect(a.provisionalDamage).toBeCloseTo(hit.originalBase! + (def.percent ? hit.originalBase! * numeric / 100 : numeric), 8);
    expect(hit.steps.filter(s => s.modifierKey)).toHaveLength(1);
    if (def.remainder) expect(a.aggregation.unsupported.some(u => u.key.endsWith('/remainder'))).toBe(true);
    imported.equipment[0]!.item = { kind: 'imported', instance: { baseItemId: null, existingPowers: [] } };
    expect(calculateAbilityDamage(hooked!.id, aggregateBuildModifiers(imported, data), data).provisionalDamage).toBe(hit.originalBase);
  });
  it('maps every published tier, guards identity/wording, and never applies two hooks to the same ability', () => {
    const p = data.getTreasurePower(def.powerId)!;
    expect(p.internalName).toBe(def.internalName);
    for (const tier of p.tiers) for (const text of tier.effectDescriptions) {
      expect(interpretTreasureEffect(p.id, text, data)?.kind, `${p.id}/${tier.id}: ${text}`).toBe('drafts');
      expect(interpretTreasureEffect(p.id, `${text} if target is stunned`, data)?.kind).toBe('template-mismatch');
      expect(interpretTreasureEffect('power_4002', text, data)).toBeNull();
    }
    const hook = def.percent ? 'AttributesThatModDamage' : 'AttributesThatDeltaDamage';
    for (const a of data.abilities) {
      const matching = def.attributes.filter(id => a.pve.attributeHooks[hook]?.includes(id));
      expect(matching.length).toBeLessThanOrEqual(1);
      if (matching.length && a.skill.skillId !== null) expect(a.skill.skillId).toBe(def.skillId);
    }
  });
});

it('uses official keyword hooks once and rejects conditional, excluded, and missing keywords', () => {
  const rule = data.keywordRules.find(r => r.conditions.requiredAbilityKeywords?.includes('CoreAttack'))!;
  const ability = data.abilities.find(a => a.keywords?.includes('CoreAttack') && a.damage.damage !== null)!;
  const attribute = 'BOOST_ABILITY_COREATTACK';
  const dataOnly = { keywordRules: [rule] };
  expect(damageHooksForAbility(ability, dataOnly).AttributesThatDeltaDamage).toContain(attribute);
  expect(damageHooksForAbility({ ...ability, keywords: [] }, dataOnly).AttributesThatDeltaDamage ?? []).not.toContain(attribute);
  const duplicate = { ...ability, pve: { ...ability.pve, attributeHooks: { ...ability.pve.attributeHooks, AttributesThatDeltaDamage: [attribute] } } };
  expect(damageHooksForAbility(duplicate, dataOnly).AttributesThatDeltaDamage!.filter(v => v === attribute)).toHaveLength(1);
  const gated = { ...rule, conditions: { ...rule.conditions, excludedAbilityKeywords: [ability.keywords![0]!] } };
  expect(damageHooksForAbility(ability, { keywordRules: [gated] }).AttributesThatDeltaDamage ?? []).not.toContain(attribute);
  const conditional = { ...ability, conditionalKeywords: [{ keyword: 'CoreAttack', default: true, effectKeywordMustExist: null, effectKeywordMustNotExist: null, interpretation: 'uninterpreted' as const }] };
  expect(damageHooksForAbility(conditional, dataOnly).AttributesThatDeltaDamage ?? []).not.toContain(attribute);
});

it('keeps required-skill keyword rules and effect-gated rules unsupported', () => {
  const ability = data.abilities.find(a => a.keywords?.includes('CoreAttack'))!;
  const rule = data.keywordRules.find(r => r.conditions.requiredAbilityKeywords?.includes('CoreAttack'))!;
  const gated = { ...rule, conditions: { ...rule.conditions, requiredActiveSkill: { sourceId: 'Druid', skillId: 'Druid', status: 'resolved' as const } } };
  expect(damageHooksForAbility(ability, { keywordRules: [gated] }).AttributesThatDeltaDamage ?? []).not.toContain('BOOST_ABILITY_COREATTACK');
});

it('handles invalid, unknown, probabilistic and >=nine Burst thresholds without contradictory values', () => {
  for (const n of [0, -1, 1.5, NaN, Infinity]) expect(burstTargetFalloff(n, 20, 'direct').multiplier).toBeNull();
  for (const r of [null, -1, NaN, Infinity]) expect(burstTargetFalloff(9, r, 'direct').multiplier).toBeNull();
  expect(burstTargetFalloff(3, 20, 'unknown').multiplier).toBeNull();
  for (const n of [6, 7, 8]) {
    expect(burstTargetFalloff(n, 25, 'direct').status).toBe('probabilistic');
    expect(burstTargetFalloff(n, 20, 'indirect').multiplier).toBeNull();
  }
  expect(burstTargetFalloff(9, 25, 'direct').multiplier).toBe(0.25);
  expect(burstTargetFalloff(9, 60, 'direct').multiplier).toBe(1);
  expect(burstTargetFalloff(10, 60, 'direct').multiplier).toBeNull();
  expect(burstTargetFalloff(9, 55, 'direct').status).toBe('probabilistic');
  expect(linearDirectBurstEstimate(10, 9)).toBeNull();
});

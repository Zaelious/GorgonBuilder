// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { DEFAULT_MODIFIER_RULES, createModifierRegistry, defaultModifierRegistry, parseEffectDescription } from './registry';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

it('parses only the official {ATTRIBUTE}{value}[{Skill}] effect grammar', () => {
  expect(parseEffectDescription('{MOD_SKILL_PSYCHOLOGY}{0.45}')).toEqual({ kind: 'attribute', attributeId: 'MOD_SKILL_PSYCHOLOGY', sourceValue: '0.45', value: 0.45, requiredSkillId: null });
  expect(parseEffectDescription('{MAX_ARMOR}{-45}{Cow}')).toMatchObject({ value: -45, requiredSkillId: 'Cow' });
  expect(parseEffectDescription('<icon=2118>Psychoanalyze deals between 90 and 220 extra damage')).toEqual({ kind: 'prose' });
  for (const text of ['{MAX_ARMOR}{abc}', '{MAX_ARMOR}{1}{Two Words}', 'Deals {MAX_ARMOR}{1}', '{max_armor}{1}', '{MAX_ARMOR}']) {
    expect(parseEffectDescription(text)).toEqual({ kind: 'malformed' });
  }
});

it.each([
  ['BOOST_SKILL_PSYCHOLOGY', 'skill-damage-flat', { kind: 'skill', skillId: 'Psychology' }],
  ['MOD_SKILL_PSYCHOLOGY', 'skill-base-damage-percent', { kind: 'skill', skillId: 'Psychology' }],
  ['MOD_SKILL_ALL_PSYCHOLOGY', 'skill-damage-percent', { kind: 'skill', skillId: 'Psychology' }],
  ['BOOST_SKILL_COW', 'skill-damage-flat', { kind: 'skill', skillId: 'Cow' }],
  ['MOD_SKILL_ALL_KNIFE', 'skill-damage-percent', { kind: 'skill', skillId: 'Knife' }],
  ['BOOST_ABILITY_PSYCHOANALYZE', 'ability-damage-flat', { kind: 'ability-attribute-hook', attributeId: 'BOOST_ABILITY_PSYCHOANALYZE', hook: 'AttributesThatDeltaDamage' }],
  ['MOD_ABILITY_PSYCHOANALYZE', 'ability-damage-percent', { kind: 'ability-attribute-hook', attributeId: 'MOD_ABILITY_PSYCHOANALYZE', hook: 'AttributesThatModDamage' }],
  ['BOOST_UNIVERSAL_DIRECT', 'all-direct-damage-flat', { kind: 'general', delivery: 'direct' }],
  ['MOD_UNIVERSAL_DIRECT', 'all-direct-damage-percent', { kind: 'general', delivery: 'direct' }],
  ['BOOST_UNIVERSAL_INDIRECT', 'all-indirect-damage-flat', { kind: 'general', delivery: 'indirect' }],
  ['MOD_UNIVERSAL', 'all-damage-percent', { kind: 'general', delivery: 'direct-and-indirect' }],
  ['BOOST_PSYCHIC_DIRECT', 'damage-type-direct-flat', { kind: 'damage-type', damageType: 'Psychic', delivery: 'direct' }],
  ['MOD_FIRE_INDIRECT', 'damage-type-indirect-percent', { kind: 'damage-type', damageType: 'Fire', delivery: 'indirect' }],
  ['BOOST_PSYCHIC', 'damage-type-flat', { kind: 'damage-type', damageType: 'Psychic', delivery: 'direct-and-indirect' }],
  ['BOOST_CRUSHING', 'damage-type-flat', { kind: 'damage-type', damageType: 'Crushing', delivery: null }],
  ['MITIGATION_CRUSHING', 'damage-type-mitigation-flat', { kind: 'damage-type', damageType: 'Crushing', delivery: null }],
  ['MAX_HEALTH', 'max-resource-flat', { kind: 'general', delivery: null }],
])('maps %s to %s using official identities', (attributeId, category, scope) => {
  const result = defaultModifierRegistry.interpretAttribute(attributeId, data);
  expect(result).toMatchObject({ kind: 'modifier', rule: { category }, scope });
});

it.each([
  ['BOOST_SKILL_ANIMALHANDLING', 'unmapped-attribute'],   // label names specific abilities, not the skill
  ['BOOST_ABILITY_COREATTACK', 'unmapped-attribute'],     // no official ability hook references it
  ['MOD_CRITICAL_HIT_DAMAGE', 'unmapped-attribute'],      // crit is outside the initial subset
  ['VULN_PSYCHIC', 'unmapped-attribute'],                 // target debuff semantics belong to T0014
  ['MITIGATION_CRUSHING_DIRECT', 'unmapped-attribute'],
  ['MOD_ABILITY_KEYWORD_SELFDESTRUCT', 'unexpected-display-type'],
  ['NOT_AN_ATTRIBUTE', 'unknown-attribute'],
])('keeps %s unsupported (%s) instead of guessing', (attributeId, reason) => {
  expect(defaultModifierRegistry.interpretAttribute(attributeId, data)).toMatchObject({ kind: 'unsupported', reason });
});

it('never matches an official attribute with more than one rule, and every rule maps official data', () => {
  const used = new Set<string>();
  for (const attribute of data.attributes) {
    const result = defaultModifierRegistry.interpretAttribute(attribute.id, data);
    if (result.kind === 'modifier') used.add(result.rule.id);
    else expect(result.message).not.toMatch(/several mapping rules/u);
  }
  expect([...used].sort()).toEqual(DEFAULT_MODIFIER_RULES.map(rule => rule.id).sort());
});

it('rejects duplicate rule IDs and documents confidence/assumptions on every rule', () => {
  expect(() => createModifierRegistry([DEFAULT_MODIFIER_RULES[0]!, DEFAULT_MODIFIER_RULES[0]!])).toThrow(/Duplicate/u);
  for (const rule of DEFAULT_MODIFIER_RULES) {
    expect(rule.confidence).toBe('partially_validated');
    expect(rule.assumptions.length).toBeGreaterThan(0);
    expect(rule.unit).toBe(rule.operation === 'flat' ? 'points' : 'fraction');
  }
});

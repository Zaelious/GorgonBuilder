import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument } from '../build/document';
import { editExistingMods } from '../build/existing-mods';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage, ABILITY_DAMAGE_ASSUMPTIONS } from './ability-damage';
import { abilityDamageFixtures } from './ability-damage-fixtures';
import { formatAbilityDamageReport } from './ability-damage-report';
import type { AbilityDamageData, AbilityDamageResult, DamageAbility, DamageComponentId } from './ability-damage-types';
import { cowUnarmedFixture, psychologyFixture } from './fixtures';
import type { ModifierAggregationResult, NormalizedModifier } from './modifiers';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

function empty(): ModifierAggregationResult {
  return aggregateBuildModifiers(createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }), data);
}

/** Synthetic arithmetic case based on an exact real ID; changed values are NOT game observations. */
function arithmeticAbility(): DamageAbility {
  const original = data.getAbility('ability_1298')!;
  return { ...original, damage: { ...original.damage, damage: 500, extraDamageIfTargetVulnerable: null },
    keywordRuleCandidates: [], conditionalKeywords: null, effectKeywordConstraints: [], specialInfo: null };
}

function modifier(overrides: Partial<NormalizedModifier> = {}): NormalizedModifier {
  return {
    key: 'synthetic:skill-base', category: 'skill-base-damage-percent', operation: 'percent',
    attributeId: 'MOD_SKILL_PSYCHOLOGY', attributeLabel: 'Psychology Base Damage %',
    scope: { kind: 'skill', skillId: 'Psychology' }, value: 0.5, sourceValue: '0.5', unit: 'fraction',
    conditions: [], applicability: 'unconditional', mappingRuleId: 'synthetic', confidence: 'validated', assumptions: [],
    source: { kind: 'item-fixed-effect', equipmentIndex: 0, equipmentKey: 'Head#0', slot: 'Head', itemKind: 'manual',
      itemId: null, itemResolved: false, effectIndex: 0, effectRecordId: 'synthetic', description: 'Synthetic arithmetic input' },
    ...overrides,
  };
}

function flat(value = 100, overrides: Partial<NormalizedModifier> = {}) {
  return modifier({ key: 'synthetic:skill-flat', category: 'skill-damage-flat', operation: 'flat', unit: 'points',
    attributeId: 'BOOST_SKILL_PSYCHOLOGY', value, sourceValue: String(value), ...overrides });
}

function calculate(modifiers: readonly NormalizedModifier[] = [], ability = arithmeticAbility(), extra: Partial<ModifierAggregationResult> = {}) {
  const context: AbilityDamageData = { ...data, getAbility: id => id === ability.id ? ability : undefined };
  return calculateAbilityDamage(ability.id, { ...empty(), activeSkillIds: ['Psychology'], modifiers, ...extra }, context);
}
const component = (result: AbilityDamageResult, id: DamageComponentId = 'damage') => result.components.find(c => c.id === id)!;
const decision = (result: AbilityDamageResult, key: string, id: DamageComponentId = 'damage') => component(result, id).decisions.find(d => d.modifier.key === key)!;
const contributions = (result: AbilityDamageResult) => Object.fromEntries(component(result).steps.filter(s => s.modifierKey).map(s => [s.modifierKey, s.contribution]));

describe('T0013 published bases and confirmed Skill Base rule', () => {
  it('1. reproduces an exact published base with no modifiers and never fabricates crits', () => {
    const ability = data.getAbility('ability_1298')!;
    const result = calculateAbilityDamage(ability.id, empty(), data);
    expect(result.ability).toBe(ability);
    expect(result.provisionalDamage).toBe(430);
    expect(component(result).originalBase).toBe(430);
    expect(result.provenance).toMatchObject({ recordId: ability.id, gameDataVersion: 'v490' });
    expect(result.criticalDamage).toBeNull();
    // Keyword mechanics are not proven by reading a base field.
    expect(result.normalDamage).toBeNull();
  });

  it('2. confirms 500 × 50% = +250, independent of flat damage', () => {
    const result = calculate([modifier(), flat(600)]);
    expect(contributions(result)['synthetic:skill-base']).toBe(250);
    expect(result.provisionalDamage).toBe(1350);
    expect(component(result).steps.at(-1)).toMatchObject({ basis: 500, before: 1100, after: 1350, ruleConfidence: 'validated' });
    expect(calculate([modifier()])).toMatchObject({ normalDamage: 750, confidence: 'validated' });
  });

  it('3. multiple Skill Base sources each use the original base', () => {
    const result = calculate([modifier(), modifier({ key: 'second', value: 0.2, sourceValue: '0.2' })]);
    expect(contributions(result)).toEqual({ 'synthetic:skill-base': 250, second: 100 });
    expect(result.provisionalDamage).toBe(850);
    expect(component(result).steps.slice(1).map(s => s.basis)).toEqual([500, 500]);
  });

  it('4. preserves flat Skill Damage as a separate category', () => {
    const result = calculate([modifier(), flat()]);
    expect(component(result).steps.map(s => s.category)).toEqual(['original-base', 'skill-damage-flat', 'skill-base-damage-percent']);
    expect(contributions(result)).toEqual({ 'synthetic:skill-flat': 100, 'synthetic:skill-base': 250 });
  });

  it('preserves health and armor fields and refuses mixed-component totals and flat allocation', () => {
    const original = arithmeticAbility();
    const ability = { ...original, damage: { ...original.damage, healthSpecificDamage: 30, armorSpecificDamage: 70 } };
    const result = calculate([flat()], ability);
    expect(result.normalDamage).toBeNull();
    expect(result.provisionalDamage).toBeNull();
    expect(result.components.map(c => c.originalBase)).toEqual([500, 30, 70]);
    expect(result.components.every(c => c.decisions[0]?.reason === 'multiple-component-allocation')).toBe(true);
    const acid = calculateAbilityDamage('ability_2627', empty(), data);
    expect(acid.components.slice(0, 3).map(c => c.originalBase)).toEqual([529, null, 529]);
    expect(acid.provisionalDamage).toBeNull();
  });

  it('11. missing exact ID, absent fields and published zero are distinct', () => {
    const absent = calculateAbilityDamage('not-an-official-id', empty(), data);
    expect(absent).toMatchObject({ ability: null, components: [], normalDamage: null, confidence: 'unknown' });
    expect(absent.warnings.some(w => w.code === 'missing-ability')).toBe(true);
    const original = arithmeticAbility();
    const noDamage = calculate([flat()], { ...original, damage: { ...original.damage, damage: null } });
    expect(noDamage.normalDamage).toBeNull();
    expect(component(noDamage)).toMatchObject({ originalBase: null, baseStatus: 'absent', provisionalDamage: null });
    const zero = calculate([modifier()], { ...original, damage: { ...original.damage, damage: 0 } });
    expect(component(zero)).toMatchObject({ originalBase: 0, baseStatus: 'zero', provisionalDamage: 0 });
    expect(contributions(zero)['synthetic:skill-base']).toBe(0);
    expect(calculateAbilityDamage('ability_1284', empty(), data).warnings.some(w => w.code === 'no-hit-components')).toBe(true);
  });

  it.each([NaN, Infinity, -1])('reports unresolved base %s without a final number', value => {
    const original = arithmeticAbility();
    const result = calculate([modifier()], { ...original, damage: { ...original.damage, damage: value } });
    expect(component(result)).toMatchObject({ baseStatus: 'unresolved', provisionalDamage: null, normalDamage: null });
  });
});

describe('T0013 exact applicability and conservative exclusions', () => {
  it('5. excludes Necromancy equipment from Psychology even when both skills are active', () => {
    const build = psychologyFixture(data.gameDataVersion);
    build.skillSlotB = { skillId: 'Necromancy', level: 100 };
    const result = calculateAbilityDamage('ability_1298', aggregateBuildModifiers(build, data), data);
    const offSkill = component(result).decisions.filter(d => d.modifier.scope.kind === 'skill' && d.modifier.scope.skillId === 'Necromancy');
    expect(offSkill).toHaveLength(2);
    expect(offSkill.every(d => d.status === 'excluded' && d.reason === 'skill-mismatch')).toBe(true);
    expect(result.provisionalDamage).toBeCloseTo(1088.36);
  });

  it('6. requires exact hook and attribute membership on this ability', () => {
    const aggregation = aggregateBuildModifiers(psychologyFixture(data.gameDataVersion), data);
    const hit = calculateAbilityDamage('ability_1298', aggregation, data);
    const mock = calculateAbilityDamage('ability_6553', aggregation, data);
    const key = aggregation.modifiers.find(m => m.attributeId === 'MOD_ABILITY_STRIKEANERVE')!.key;
    expect(decision(hit, key).status).toBe('applied');
    expect(decision(mock, key, 'health-specific').reason).toBe('hook-mismatch');
    const original = arithmeticAbility();
    expect(decision(calculate([modifier()], { ...original, pve: { ...original.pve, attributeHooks: {} } }), 'synthetic:skill-base').reason).toBe('hook-mismatch');
  });

  it('7. checks direct versus indirect without inheriting hit hooks or simulating DoTs', () => {
    const direct = flat(10, { key: 'direct', category: 'all-direct-damage-flat', scope: { kind: 'general', delivery: 'direct' } });
    const indirect = flat(20, { key: 'indirect', category: 'all-indirect-damage-flat', scope: { kind: 'general', delivery: 'indirect' } });
    const all = flat(30, { key: 'all', category: 'all-damage-flat', scope: { kind: 'general', delivery: 'direct-and-indirect' } });
    const result = calculate([direct, indirect, all], data.getAbility('ability_8199')!);
    expect(decision(result, 'direct').status).toBe('applied');
    expect(decision(result, 'indirect').reason).toBe('delivery-mismatch');
    expect(decision(result, 'direct', 'dot:0').reason).toBe('delivery-mismatch');
    expect(decision(result, 'indirect', 'dot:0').reason).toBe('indirect-not-calculated');
    expect(decision(result, 'all', 'dot:0').status).toBe('uncertain');
    expect(component(result, 'dot:0')).toMatchObject({ originalBase: 60, provisionalDamage: null, steps: [] });
    expect(result.provisionalDamage).toBe(417); // 377 direct +10 +30, never 6 × 60
  });

  it('8. checks exact damage types and leaves unspecified delivery uncertain', () => {
    const typed = flat(10, { key: 'typed', category: 'damage-type-direct-flat', scope: { kind: 'damage-type', damageType: 'Psychic', delivery: 'direct' } });
    const wrong = { ...typed, key: 'wrong', scope: { kind: 'damage-type', damageType: 'Darkness', delivery: 'direct' } } as const;
    const unknown = { ...typed, key: 'unknown', category: 'damage-type-flat', scope: { ...typed.scope, kind: 'damage-type', damageType: 'Psychic', delivery: null } } as const;
    const result = calculate([typed, wrong, unknown]);
    expect(decision(result, 'typed').status).toBe('applied');
    expect(decision(result, 'wrong').reason).toBe('damage-type-mismatch');
    expect(decision(result, 'unknown').reason).toBe('delivery-unspecified');
    expect(result.provisionalDamage).toBe(510);
    expect(result.normalDamage).toBeNull();
  });

  it('keeps delivery-based exclusions assumed and flags unresolved damage types', () => {
    const indirect = flat(20, { category: 'all-indirect-damage-flat', scope: { kind: 'general', delivery: 'indirect' } });
    const result = calculate([indirect]);
    expect(result).toMatchObject({ provisionalDamage: 500, normalDamage: null, confidence: 'assumed' });
    expect(result.assumptions).toContain(ABILITY_DAMAGE_ASSUMPTIONS.delivery);
    const original = arithmeticAbility();
    expect(calculate([], { ...original, damage: { ...original.damage, damageType: 'Unknown' } }).confidence).toBe('unknown');
  });

  it('9. requires active skills and respects evaluated not-met conditions', () => {
    const required = modifier({ applicability: 'conditions-met', conditions: [{ kind: 'requires-active-skill', skillId: 'Cow', status: 'met' }] });
    expect(decision(calculate([required]), required.key).reason).toBe('required-skill-inactive');
    expect(calculate([required], arithmeticAbility(), { activeSkillIds: ['Psychology', 'Cow'] }).provisionalDamage).toBe(750);
    const notMet = { ...required, applicability: 'conditions-not-met' } as const;
    expect(decision(calculate([notMet], arithmeticAbility(), { activeSkillIds: ['Psychology', 'Cow'] }), required.key).reason).toBe('condition-not-met');
  });

  it('10. retains unevaluated and unsupported effects without silently adding them', () => {
    const qualified = modifier({ applicability: 'conditions-unevaluated', conditions: [{ kind: 'source-qualifier', qualifier: 'Fae', status: 'unevaluated' }] });
    const result = calculate([qualified]);
    expect(result).toMatchObject({ provisionalDamage: 500, normalDamage: null, confidence: 'unknown' });
    expect(decision(result, qualified.key).reason).toBe('condition-unevaluated');
    const unsupported = { key: 'prose', reason: 'prose-effect', message: 'Uninterpreted damage', source: qualified.source } as const;
    const withUnknown = calculate([], arithmeticAbility(), { unsupported: [unsupported] });
    expect(withUnknown.aggregation.unsupported).toEqual([unsupported]);
    expect(withUnknown).toMatchObject({ provisionalDamage: 500, normalDamage: null, confidence: 'unknown' });
  });

  it('rejects unknown mapping confidence, invalid units and unresolved skill identity', () => {
    expect(decision(calculate([modifier({ confidence: 'unknown' })]), 'synthetic:skill-base').reason).toBe('unknown-modifier');
    expect(decision(calculate([modifier({ unit: 'points' })]), 'synthetic:skill-base').reason).toBe('invalid-modifier');
    const original = arithmeticAbility();
    const unresolved = calculate([modifier()], { ...original, skill: { sourceId: 'Unknown', skillId: null, status: 'missing' } });
    expect(decision(unresolved, 'synthetic:skill-base').reason).toBe('unresolved-skill');
    expect(unresolved.normalDamage).toBeNull();
  });
});

describe('T0013 formula traceability and T0012 compatibility', () => {
  it('12. removing one Skill Base reverses only its own contribution', () => {
    const modifiers = [modifier(), modifier({ key: 'second', value: 0.2 }), flat()];
    const before = calculate(modifiers);
    const after = calculate(modifiers.slice(1));
    expect(before.provisionalDamage! - after.provisionalDamage!).toBe(250);
    const remaining = contributions(before); delete remaining['synthetic:skill-base'];
    expect(contributions(after)).toEqual(remaining);
  });

  it('13. imported tier id_9 → id_8 changes Cow Front Kick by 101 − 89 = 12', () => {
    const build = cowUnarmedFixture(data.gameDataVersion);
    const edited = structuredClone(build);
    edited.equipment[0] = editExistingMods(build.equipment[0]!, { type: 'existing-mod-tier', equipmentIndex: 0, index: 0, tierId: 'id_8' }, data);
    const before = calculateAbilityDamage('ability_6124', aggregateBuildModifiers(build, data), data);
    const after = calculateAbilityDamage('ability_6124', aggregateBuildModifiers(edited, data), data);
    // Official CoreAttack keyword adds the item’s previously omitted +244 flat.
    expect(before.provisionalDamage).toBeCloseTo(1526.4);
    expect(component(before).decisions.find(d => d.modifier.attributeId === 'BOOST_ABILITY_COREATTACK')).toMatchObject({ status: 'applied', modifier: { value: 244 } });
    expect(after.provisionalDamage).toBeCloseTo(1514.4);
    const expected = contributions(before);
    delete expected['equipment:MainHand#0/existing:power_20006:id_9#0/effect:0'];
    const actual = contributions(after);
    expect(actual['equipment:MainHand#0/existing:power_20006:id_8#0/effect:0']).toBe(89);
    delete actual['equipment:MainHand#0/existing:power_20006:id_8#0/effect:0'];
    expect(actual).toEqual(expected);
    expect(JSON.stringify(before)).not.toContain('FixtureUnknownPower');
    expect(before.aggregation.warnings).toContainEqual(expect.objectContaining({ code: 'sparks-not-aggregated' }));
  });

  it('keeps separately planned and working imported Unarmed powers and their removal deltas', () => {
    const build = cowUnarmedFixture(data.gameDataVersion);
    const aggregation = aggregateBuildModifiers(build, data);
    const before = calculateAbilityDamage('ability_8169', aggregation, data);
    const base = before.ability!.damage.damage!;
    const sources = component(before).decisions.filter(d => d.status === 'applied' && d.modifier.attributeId === 'MOD_SKILL_UNARMED');
    expect(sources.map(d => d.modifier.source.kind)).toEqual(['existing-power', 'candidate-mod']);
    build.equipment[0] = editExistingMods(build.equipment[0]!, { type: 'existing-mod-remove', equipmentIndex: 0, index: 1 }, data);
    const after = calculateAbilityDamage('ability_8169', aggregateBuildModifiers(build, data), data);
    expect(before.provisionalDamage! - after.provisionalDamage!).toBeCloseTo(base * 0.45);
  });

  it('14. is deterministic with frozen inputs, preserves the official data and formats repeatable reports', () => {
    function freeze<T>(value: T): T {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
      return value;
    }
    for (const fixture of abilityDamageFixtures(data.gameDataVersion)) {
      const aggregation = freeze(aggregateBuildModifiers(freeze(fixture.build), data));
      freeze(data.getAbility(fixture.abilityId)!);
      const snapshot = JSON.stringify([fixture.build, aggregation, data.getAbility(fixture.abilityId)]);
      const first = calculateAbilityDamage(fixture.abilityId, aggregation, data);
      const second = calculateAbilityDamage(fixture.abilityId, aggregation, data);
      expect(second).toEqual(first);
      expect(JSON.stringify([fixture.build, aggregation, data.getAbility(fixture.abilityId)])).toBe(snapshot);
      expect(formatAbilityDamageReport(second)).toBe(formatAbilityDamageReport(first));
    }
  });

  it('15. propagates all confidence states and marks ordering separately from the confirmed contribution', () => {
    expect(calculate()).toMatchObject({ normalDamage: 500, confidence: 'validated' });
    expect(calculate([modifier({ confidence: 'partially_validated' })])).toMatchObject({ normalDamage: null, confidence: 'partially_validated' });
    expect(calculate([modifier({ confidence: 'assumed', assumptions: ['Synthetic advancement summation assumption'] })])).toMatchObject({ normalDamage: null, confidence: 'assumed' });
    const percent = modifier({ key: 'percent', category: 'skill-damage-percent', attributeId: 'MOD_SKILL_ALL_PSYCHOLOGY', value: 2 });
    const result = calculate([flat(600), percent, modifier()]);
    expect(result).toMatchObject({ provisionalDamage: 3550, normalDamage: null, confidence: 'assumed' });
    expect(result.assumptions).toContain(ABILITY_DAMAGE_ASSUMPTIONS.percents);
    expect(result.assumptions).toContain(ABILITY_DAMAGE_ASSUMPTIONS.skillBasePlacement);
    expect(component(result).steps.at(-1)).toMatchObject({ contribution: 250, ruleConfidence: 'validated' });
    expect(component(result).steps.find(s => s.modifierKey === 'percent')).toMatchObject({ basis: 1100, contribution: 2200, ruleConfidence: 'assumed' });
  });

  it('retains every flat and percent category and uses one explicit percentage basis', () => {
    const flats = [flat(10), flat(20, { key: 'ability-flat', category: 'ability-damage-flat', attributeId: 'BOOST_ABILITY_STRIKEANERVE', scope: { kind: 'ability-attribute-hook', attributeId: 'BOOST_ABILITY_STRIKEANERVE', hook: 'AttributesThatDeltaDamage' } }),
      flat(30, { key: 'direct-flat', category: 'all-direct-damage-flat', scope: { kind: 'general', delivery: 'direct' } }),
      flat(40, { key: 'all-flat', category: 'all-damage-flat', scope: { kind: 'general', delivery: 'direct-and-indirect' } }),
      flat(50, { key: 'type-flat', category: 'damage-type-direct-flat', scope: { kind: 'damage-type', damageType: 'Psychic', delivery: 'direct' } })];
    const percents = flats.map((m, i): NormalizedModifier => ({ ...m, key: `${m.key}-percent`, value: 0.1, operation: 'percent', unit: 'fraction',
      category: ['skill-damage-percent', 'ability-damage-percent', 'all-direct-damage-percent', 'all-damage-percent', 'damage-type-direct-percent'][i] as NormalizedModifier['category'],
      attributeId: i === 0 ? 'MOD_SKILL_ALL_PSYCHOLOGY' : i === 1 ? 'MOD_ABILITY_STRIKEANERVE' : m.attributeId,
      scope: i === 1 ? { kind: 'ability-attribute-hook', attributeId: 'MOD_ABILITY_STRIKEANERVE', hook: 'AttributesThatModDamage' } : m.scope }));
    const result = calculate([...flats, ...percents, modifier()]);
    expect(new Set(component(result).steps.map(s => s.category)).size).toBe(12);
    expect(component(result).steps.filter(s => s.operation === 'add-percent-contribution').map(s => [s.basis, s.contribution])).toEqual(Array.from({ length: 5 }, () => [650, 65]));
    expect(result.provisionalDamage).toBe(1225); // 650 + 325 + 250
  });

  it('preserves duplicate-skill conflict handling, unique advancement and version warnings', () => {
    const build = psychologyFixture(data.gameDataVersion);
    build.skillSlotB = { skillId: 'Psychology', level: 100 };
    const same = calculateAbilityDamage('ability_1298', aggregateBuildModifiers(build, data), data);
    expect(same.aggregation.activeSkillIds).toEqual(['Psychology']);
    expect(same.aggregation.modifiers.filter(m => m.source.kind === 'skill-advancement')).toHaveLength(2);
    build.skillSlotB.level = 70;
    build.gameDataVersion = 'v1';
    const conflict = calculateAbilityDamage('ability_1298', aggregateBuildModifiers(build, data), data);
    expect(conflict.aggregation.modifiers.filter(m => m.source.kind === 'skill-advancement')).toHaveLength(0);
    expect(conflict.aggregation.warnings).toContainEqual(expect.objectContaining({ code: 'skill-level-conflict' }));
    expect(conflict.warnings).toContainEqual(expect.objectContaining({ code: 'game-data-version-mismatch' }));
    expect(conflict.normalDamage).toBeNull();
    const differentData = calculate([], arithmeticAbility(), { gameDataVersion: 'v999' });
    expect(differentData.normalDamage).toBeNull();
  });
});

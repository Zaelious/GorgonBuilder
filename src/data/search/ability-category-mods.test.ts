// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { buildAbilityModIndex, matchAbilityEffect } from './ability-mods';
import { applicableStaticKeywordRules, damageHooksForAbility } from '../../core/calculation/keyword-damage';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

it('Core, Nice, Epic and Basic Attack damage attributes match only their published keywords', () => {
  const index = buildAbilityModIndex(data);
  for (const [keyword, attribute] of [
    ['CoreAttack', 'BOOST_ABILITY_COREATTACK'],
    ['NiceAttack', 'MOD_ABILITY_NICEATTACK'],
    ['EpicAttack', 'BOOST_ABILITY_EPICATTACK'],
    ['BasicAttack', 'MOD_ABILITY_BASICATTACK'],
    ['SignatureDebuff', 'BOOST_ABILITY_SIGNATUREDEBUFF'],
  ] as const) {
    const ability = data.abilities.find(ab => ab.keywords?.includes(keyword) && !ab.conditionalKeywords?.some(entry => entry.keyword === keyword));
    const other = data.abilities.find(ab => !ab.keywords?.includes(keyword) && !ab.conditionalKeywords?.some(entry => entry.keyword === keyword));
    expect(ability, keyword).toBeDefined();
    expect(other, keyword).toBeDefined();
    expect(index.keywordHooks(ability!).has(attribute)).toBe(true);
    expect(matchAbilityEffect(ability!, `{${attribute}}{0.25}`, index)).toBe('keyword');
    expect(index.keywordHooks(other!).has(attribute)).toBe(false);
    expect(matchAbilityEffect(other!, `{${attribute}}{0.25}`, index)).toBeNull();
    const hooks = damageHooksForAbility(ability!, data);
    const kind = attribute.startsWith('BOOST_') ? 'AttributesThatDeltaDamage' : 'AttributesThatModDamage';
    expect(hooks[kind].filter(id => id === attribute)).toHaveLength(1); // no double contribution when direct and category hooks coincide
  }
});

it('non-damage role-specific source attributes are relevant, not fabricated outgoing damage', () => {
  const index = buildAbilityModIndex(data);
  const ability = data.abilities.find(ab => ab.keywords?.includes('SignatureSupport'));
  expect(ability).toBeDefined();
  expect(matchAbilityEffect(ability!, '{ABILITY_COST_DELTA_SIGNATURESUPPORT}{-5}', index)).toBe('keyword');
  const unrelated = data.abilities.find(ab => !ab.keywords?.includes('SignatureSupport'))!;
  expect(matchAbilityEffect(unrelated, '{ABILITY_COST_DELTA_SIGNATURESUPPORT}{-5}', index)).toBeNull();
});

it('required-active-skill and effect-gated rules do not grant unconditional keyword hooks', () => {
  const index = buildAbilityModIndex(data);
  for (const ability of data.abilities.filter(ab => ab.keywords?.includes('Burst')).slice(0, 15)) {
    const rules = applicableStaticKeywordRules(ability, data);
    expect(rules.every(rule => rule.conditions.requiredActiveSkill === null && !rule.conditions.requiredEffectKeywords?.length)).toBe(true);
    expect(index.keywordHooks(ability).has('TSysBurstsDealNatureDoT')).toBe(false);
  }
  const conditional = data.abilities.find(ability => ability.keywords?.includes('NiceAttack'))!;
  const simulated = { ...conditional, conditionalKeywords: [
    ...(conditional.conditionalKeywords ?? []), { keyword: 'NiceAttack' },
  ] as typeof conditional.conditionalKeywords };
  expect(applicableStaticKeywordRules(simulated, data).some(rule =>
    rule.conditions.requiredAbilityKeywords?.includes('NiceAttack'))).toBe(false);
  expect(matchAbilityEffect(simulated, '{MOD_ABILITY_NICEATTACK}{0.25}', index)).toBeNull();
});

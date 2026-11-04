import type { GameDataRepository } from '../../data/repository/repository';
import type { DamageAbility } from './ability-damage-types';

export type KeywordDamageData = Partial<Pick<GameDataRepository, 'keywordRules'>>;

/** Only unconditional, statically published keyword membership is interpreted here.
 * Conditional keywords, effect requirements and active-skill rules stay unmodeled.
 * The normalized records and their provenance remain unchanged.
 */
export function staticDamageKeywordRules(data: KeywordDamageData) {
  return (data.keywordRules ?? []).filter(rule =>
    rule.conditions.requiredActiveSkill === null
    && !(rule.conditions.requiredEffectKeywords?.length)
    && (rule.conditions.requiredAbilityKeywords?.length ?? 0) > 0);
}

/** One shared source-backed predicate for the picker and the direct-hit engine. */
export function applicableStaticKeywordRules(ability: Pick<DamageAbility, 'keywords' | 'conditionalKeywords'>,
  data: KeywordDamageData) {
  const conditional = new Set((ability.conditionalKeywords ?? []).map(entry => entry.keyword));
  const keywords = new Set(ability.keywords ?? []);
  return staticDamageKeywordRules(data).filter(rule => {
    const required = rule.conditions.requiredAbilityKeywords ?? [];
    const excluded = rule.conditions.excludedAbilityKeywords ?? [];
    return ![...required, ...excluded].some(keyword => conditional.has(keyword))
      && required.every(keyword => keywords.has(keyword))
      && !excluded.some(keyword => keywords.has(keyword));
  });
}

export function damageHooksForAbility(ability: DamageAbility, data: KeywordDamageData) {
  const hooks: Record<string, readonly string[]> = { ...ability.pve.attributeHooks };
  for (const rule of applicableStaticKeywordRules(ability, data)) {
    for (const hook of ['AttributesThatDeltaDamage', 'AttributesThatModDamage']) {
      // A direct hook and a keyword rule may name the same attribute. It still contributes once.
      hooks[hook] = [...new Set([...(hooks[hook] ?? []), ...(rule.attributeHooks[hook] ?? [])])];
    }
  }
  return hooks;
}

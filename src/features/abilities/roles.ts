import type { Ability } from './groups';

/** Exact official v490 ability keyword tokens, not name-derived or effect-granted guesses. */
export const ABILITY_ROLE_LABELS = [
  ['BasicAttack', 'Basic Attack'],
  ['CoreAttack', 'Core Attack'],
  ['NiceAttack', 'Nice Attack'],
  ['EpicAttack', 'Epic Attack'],
  ['MinorHeal', 'Minor Healing Ability'],
  ['MajorHeal', 'Major Healing Ability'],
  ['SignatureSupport', 'Signature Support Ability'],
  ['SignatureDebuff', 'Signature Debuff Ability'],
  ['SurvivalUtility', 'Survival Utility Ability'],
] as const;

export interface AbilityRole {
  keyword: typeof ABILITY_ROLE_LABELS[number][0];
  label: typeof ABILITY_ROLE_LABELS[number][1];
  /** Conditional grants are not asserted as permanently active. */
  conditional: boolean;
}

export function abilityRoles(ability: Pick<Ability, 'keywords' | 'conditionalKeywords'>): AbilityRole[] {
  const staticKeywords = new Set(ability.keywords ?? []);
  const conditionalKeywords = new Set((ability.conditionalKeywords ?? []).map(entry => entry.keyword));
  return ABILITY_ROLE_LABELS.flatMap(([keyword, label]) =>
    staticKeywords.has(keyword) ? [{ keyword, label, conditional: false }] :
      conditionalKeywords.has(keyword) ? [{ keyword, label, conditional: true }] : []);
}

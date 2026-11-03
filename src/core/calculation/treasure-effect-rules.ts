import type {
  ModifierCategory, ModifierConfidence, ModifierOperation, ModifierScope, ModifierUnit,
} from './modifiers';
import type { ModifierDataContext } from './registry';
import { DIRECT_TREASURE_RULES } from './direct-treasure-rules';
import { resolveProseDamage, type ProseDamageResolution } from './prose-damage-grammar';

/**
 * Curated, exact treasure-power rules for published *prose* effects (T0014 acceptance correction).
 *
 * This is not a prose parser. Each rule names one official power ID **and** InternalName and one fixed sentence
 * template. A tier is interpreted only when its full effect text matches that template; anything else stays an
 * unsupported `prose-effect`. Results reuse official attributes and ability hooks where they exist.
 */
export interface TreasureEffectDraft {
  /** Stable part name, appended to the source key (`…/rule:<part>`). */
  readonly part: string;
  readonly category: ModifierCategory;
  readonly operation: ModifierOperation;
  readonly unit: ModifierUnit;
  readonly attributeId: string;
  readonly attributeLabel: string;
  readonly scope: ModifierScope;
  readonly value: number;
  readonly sourceValue: string;
  readonly assumptions: readonly string[];
}

export interface TreasureEffectRule {
  readonly id: string;
  readonly powerId: string;
  readonly internalName: string;
  readonly description: string;
  /** Full-string template; the optional leading `<icon=N>` tags are display-only. */
  readonly pattern: RegExp;
  readonly confidence: ModifierConfidence;
  readonly unmodeled?: string | undefined;
  readonly interpret: (match: RegExpExecArray, data: ModifierDataContext) => readonly TreasureEffectDraft[] | null;
}

export const TREASURE_RULE_ASSUMPTIONS = {
  curated: 'Curated exact-power rule: this published sentence is read with a fixed template tied to its official power ID and InternalName; other wording stays uninterpreted.',
  abilityPercent: 'Assumed: "<Ability> deal(s) +X% damage" behaves like the official <Ability> Damage % attribute (MOD_ABILITY_<X>), i.e. an ability-specific percentage contribution.',
  taunt: 'Taunt is preserved as its official taunt attribute; it never contributes damage.',
  reuse: 'Reuse-time change is preserved as the official reuse-timer attribute; no damage, cooldown or DPS effect is calculated.',
  burst: 'The effect explicitly makes the ability hit all enemies within the stated radius (Burst AoE). Selected enemies are assumed to be inside that radius; no hidden target cap is inferred.',
  halved: 'Assumed: "damage is halved" multiplies each final per-target hit by 0.5 after all build contributions (flat, percentage and Skill Base), independently of enemy count.',
} as const;

const ICONS = '(?:<icon=\\d+>)*';
const NUMBER = '(\\d+(?:\\.\\d+)?)';

function attributeLabel(data: ModifierDataContext, id: string): string | null {
  return data.getAttribute(id)?.label ?? null;
}

/** Official attribute used through an official ability hook; null if the attribute is not published. */
function hooked(data: ModifierDataContext, part: string, attributeId: string, hook: string, category: ModifierCategory,
  operation: ModifierOperation, unit: ModifierUnit, value: number, sourceValue: string, assumptions: readonly string[]): TreasureEffectDraft | null {
  const label = attributeLabel(data, attributeId);
  if (label === null) return null;
  return { part, category, operation, unit, attributeId, attributeLabel: label, value, sourceValue,
    scope: { kind: 'ability-attribute-hook', attributeId, hook }, assumptions: [TREASURE_RULE_ASSUMPTIONS.curated, ...assumptions] };
}

function all<T>(values: readonly (T | null)[]): T[] | null {
  return values.every(value => value !== null) ? values as T[] : null;
}

export const TREASURE_EFFECT_RULES: readonly TreasureEffectRule[] = Object.freeze([
  ...DIRECT_TREASURE_RULES,
  {
    id: 'treasure:MockAndRidiculeBoost', powerId: 'power_4066', internalName: 'MockAndRidiculeBoost',
    description: '"Mock and Ridicule deal +X% damage and taunt +Y" → MOD_ABILITY_MOCK/MOD_ABILITY_RIDICULE % and taunt',
    pattern: new RegExp(`^${ICONS}Mock and Ridicule deal \\+${NUMBER}% damage and taunt \\+${NUMBER}$`, 'u'),
    confidence: 'assumed',
    interpret(match, data) {
      const percent = match[1]!, taunt = match[2]!;
      const fraction = Number(percent) / 100;
      return all([
        hooked(data, 'damage:Mock', 'MOD_ABILITY_MOCK', 'AttributesThatModDamage', 'ability-damage-percent', 'percent', 'fraction', fraction, `${percent}%`, [TREASURE_RULE_ASSUMPTIONS.abilityPercent]),
        hooked(data, 'damage:Ridicule', 'MOD_ABILITY_RIDICULE', 'AttributesThatModDamage', 'ability-damage-percent', 'percent', 'fraction', fraction, `${percent}%`, [TREASURE_RULE_ASSUMPTIONS.abilityPercent]),
        hooked(data, 'taunt:Mock', 'ABILITY_TAUNT_DELTA_MOCK', 'AttributesThatDeltaTaunt', 'ability-taunt-flat', 'flat', 'points', Number(taunt), taunt, [TREASURE_RULE_ASSUMPTIONS.taunt]),
        hooked(data, 'taunt:Ridicule', 'ABILITY_TAUNT_DELTA_RIDICULE', 'AttributesThatDeltaTaunt', 'ability-taunt-flat', 'flat', 'points', Number(taunt), taunt, [TREASURE_RULE_ASSUMPTIONS.taunt]),
      ]);
    },
  },
  {
    id: 'treasure:MockBoost', powerId: 'power_4032', internalName: 'MockBoost',
    description: '"Mock hits all enemies within R meters and taunts +Y, but damage is halved and reuse timer is +S seconds"',
    pattern: new RegExp(`^${ICONS}Mock hits all enemies within ${NUMBER} meters and taunts \\+${NUMBER}, but damage is halved and reuse timer is \\+${NUMBER} seconds$`, 'u'),
    confidence: 'assumed',
    interpret(match, data) {
      const radius = match[1]!, taunt = match[2]!, reuse = match[3]!;
      const keyword: ModifierScope = { kind: 'ability-keyword', skillId: 'Psychology', keyword: 'Mock' };
      const resetLabel = attributeLabel(data, 'ABILITY_RESETTIME_DELTA_MOCK');
      const taunted = hooked(data, 'taunt:Mock', 'ABILITY_TAUNT_DELTA_MOCK', 'AttributesThatDeltaTaunt', 'ability-taunt-flat', 'flat', 'points', Number(taunt), taunt, [TREASURE_RULE_ASSUMPTIONS.taunt]);
      if (resetLabel === null || taunted === null) return null;
      const curated = (...assumptions: string[]) => [TREASURE_RULE_ASSUMPTIONS.curated, ...assumptions];
      return [
        { part: 'burst', category: 'ability-burst-conversion', operation: 'set', unit: 'meters', value: Number(radius), sourceValue: radius,
          attributeId: 'TREASURE:MockBoost/burst-radius', attributeLabel: `Mock hits all enemies within ${radius} m (Burst)`, scope: keyword,
          assumptions: curated(TREASURE_RULE_ASSUMPTIONS.burst) },
        { part: 'damage-multiplier', category: 'ability-damage-multiplier', operation: 'multiply', unit: 'multiplier', value: 0.5, sourceValue: 'halved',
          attributeId: 'TREASURE:MockBoost/damage-multiplier', attributeLabel: 'Mock damage halved', scope: keyword,
          assumptions: curated(TREASURE_RULE_ASSUMPTIONS.halved) },
        taunted,
        { part: 'reuse:Mock', category: 'ability-reset-time-flat', operation: 'flat', unit: 'seconds', value: Number(reuse), sourceValue: reuse,
          attributeId: 'ABILITY_RESETTIME_DELTA_MOCK', attributeLabel: resetLabel, scope: keyword,
          assumptions: curated(TREASURE_RULE_ASSUMPTIONS.reuse) },
      ];
    },
  },
]);

export type TreasureEffectInterpretation =
  | { readonly kind: 'drafts'; readonly rule: TreasureEffectRule; readonly drafts: readonly TreasureEffectDraft[]; readonly grammar?: ProseDamageResolution }
  | { readonly kind: 'template-mismatch'; readonly rule: TreasureEffectRule };

export interface TreasureInterpretationOptions {
  /** Reusable unconditional named-damage grammar (prose-damage-grammar.ts); disabled only for preserved coverage baselines. */
  readonly proseGrammar?: boolean;
}

const OTHER_LABELS: Record<string, string> = {
  taunt: 'taunt', 'reuse-time': 'reuse/reset timer', 'power-cost': 'Power cost', rage: 'Rage', control: 'stun/knockback/slow',
  'range-accuracy': 'range/accuracy', 'call-for-help': 'call-for-help', 'restore-resource': 'healing/resource restoration',
  defense: 'defensive effect', 'self-buff': 'non-damage self buff', critical: 'critical-hit rule', reactive: 'damage reflection',
  pet: 'summoned ally', 'self-damage': 'damage to yourself', dot: 'damage over time', 'keyword-grant': 'keyword change', 'target-debuff': 'target debuff',
  'timed-damage-buff': 'timed or next-attack damage buff', 'damage-type-conversion': 'damage-type conversion',
  'aoe-conversion': 'area-of-effect change', 'random-bonus': 'chance-based extra damage',
};

/** Synthetic rule record for one grammar resolution; it carries the same provenance fields as a curated rule. */
function grammarRule(powerId: string, internalName: string, resolution: ProseDamageResolution): TreasureEffectRule {
  const { other, direct } = resolution.remainder;
  const clauses = [...direct, ...other].map(kind => OTHER_LABELS[kind] ?? kind);
  return {
    id: `prose-grammar:${resolution.clause.form}`, powerId, internalName,
    description: 'Reusable unconditional named-damage grammar (official names, hooks and attributes).',
    pattern: /^$/u, confidence: 'assumed',
    unmodeled: clauses.length ? `Only the unconditional damage clause is modeled; accompanying ${clauses.join(', ')} clauses are preserved in the source sentence and are not simulated.` : undefined,
    interpret: () => resolution.drafts,
  };
}

/**
 * Exact power ID + InternalName curated rules take precedence. Otherwise the reusable grammar may interpret a fully
 * recognized unconditional damage sentence for the power's own official skill. Null when nothing covers the sentence.
 */
export function interpretTreasureEffect(powerId: string, description: string, data: ModifierDataContext,
  rules: readonly TreasureEffectRule[] = TREASURE_EFFECT_RULES, options: TreasureInterpretationOptions = {}): TreasureEffectInterpretation | null {
  const power = data.getTreasurePower(powerId);
  const rule = rules.find(entry => entry.powerId === powerId && entry.internalName === power?.internalName);
  if (!rule) {
    // Only a sentence this exact power publishes; text from elsewhere is never interpreted for it.
    if (!power || options.proseGrammar === false || !power.tiers.some(tier => tier.effectDescriptions.includes(description))) return null;
    const resolution = resolveProseDamage(description, power.skill.status === 'resolved' ? power.skill.skillId : null, data);
    if (!resolution.ok || !resolution.drafts.every(draft => Number.isFinite(draft.value))) return null;
    return { kind: 'drafts', rule: grammarRule(power.id, power.internalName, resolution), drafts: resolution.drafts, grammar: resolution };
  }
  const match = rule.pattern.exec(description);
  const drafts = match ? rule.interpret(match, data) : null;
  return drafts && drafts.every(draft => Number.isFinite(draft.value)) ? { kind: 'drafts', rule, drafts } : { kind: 'template-mismatch', rule };
}

/** True when an official ability is covered by a curated keyword scope. */
export function abilityHasKeyword(ability: { readonly skill: { readonly skillId: string | null }; readonly keywords: readonly string[] | null },
  scope: Extract<ModifierScope, { kind: 'ability-keyword' }>): boolean {
  return ability.skill.skillId === scope.skillId && (ability.keywords ?? []).includes(scope.keyword);
}

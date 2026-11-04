import type { GameDataRepository } from '../../data/repository/repository';
import { createDefaultBuildDocument } from '../build/document';
import { aggregateBuildModifiers, type AggregateOptions } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { damageHooksForAbility } from './keyword-damage';
import type { ModifierAggregationResult, ModifierCategory, NormalizedModifier } from './modifiers';
import { parseProseDamageClause, resolveProseDamage, type ProseDamageFailure, type ProseDamageResolution } from './prose-damage-grammar';
import { DEFAULT_MODIFIER_RULES, createModifierRegistry, parseEffectDescription } from './registry';
import { TREASURE_EFFECT_RULES, interpretTreasureEffect } from './treasure-effect-rules';
import { CRITICAL_TREASURE_RULES } from './critical-treasure-rules';

/**
 * The three snapshots reproduce the accepted T0013-F1 report exactly. T0013-F2 critical and target-conditional curated
 * rules depend on scenario inputs (creature type, Elite) and a separate critical stage, so they are excluded here and
 * documented in docs/T0013_F2_Verification.md.
 */
const T0013_F1_RULES = TREASURE_EFFECT_RULES.filter(rule => !CRITICAL_TREASURE_RULES.includes(rule));
const T0013_F1_REGISTRY = createModifierRegistry(DEFAULT_MODIFIER_RULES.filter(rule => rule.category !== 'critical-chance-percent' && rule.category !== 'critical-damage-percent'));

/**
 * T0013-F1 direct-damage coverage audit. Four questions stay separate:
 * 1. Inventory completeness: every published power / tier / effect entry is listed once.
 * 2. Direct-damage coverage: is the entry's contribution to the player's own direct hits calculated?
 * 3. Other mechanics: taunt, reuse, DoT, crit, pets, defense... recorded per entry, never lowering direct coverage.
 * 4. Validation confidence: official attribute mapping versus source-backed prose assumption.
 *
 * Mechanic classification is an auditable screening of official IDs, labels, the reusable grammar and fixed wording
 * families. It is NOT a formula parser; no runtime calculation reads it.
 */

/** Direct-hit mechanic families (the direct-damage denominator). */
export const DIRECT_MECHANICS = [
  'unconditional-flat-percent', 'skill-base', 'conditional-direct', 'damage-type-conversion', 'aoe-targeting',
  'multi-hit-or-split', 'stateful-combat',
] as const;
/** Mechanics outside the current direct-hit calculator; inventoried, excluded from the direct denominator. */
export const OUTSIDE_MECHANICS = [
  'critical', 'dot-indirect', 'pet-summon', 'reactive', 'defense-incoming', 'ally-support', 'non-damage', 'non-damage-stat',
  'unresolved-attribute',
] as const;
export type DirectMechanic = typeof DIRECT_MECHANICS[number];
export type CoverageMechanic = DirectMechanic | typeof OUTSIDE_MECHANICS[number];

export type DirectStatus = 'fully-calculated' | 'partially-calculated' | 'unmodeled' | 'outside-direct';
export type ValidationConfidence = 'official-attribute' | 'source-backed-assumption';

export interface CoverageEvidence {
  status: DirectStatus;
  /** Stable reason code; see COVERAGE_REASONS. */
  reason: string;
  rules: string[];
  mappings: Pick<NormalizedModifier, 'attributeId' | 'category' | 'scope' | 'operation' | 'value' | 'sourceValue' | 'confidence' | 'conditions'>[];
  appliedAbilityIds: string[];
  uncertainAbilityIds: string[];
  confidence: ValidationConfidence | null;
  /**
   * Official third-token required skills activated, alongside the tested ability's own skill, by the explicit
   * required-skill probe (a two-skill build that satisfies the condition). Absent for unconditional entries.
   */
  requiredSkillsActivated?: string[];
}

export interface TreasureCoverageRow {
  powerId: string; internalName: string;
  /** Official association: a skill ID, AnySkill or Unknown. */
  skill: string;
  /** combat-skill: one of the official Combat=true skills; generic: AnySkill, Unknown or a non-combat association. */
  association: 'combat-skill' | 'generic';
  tierId: string; effectIndex: number; description: string; sourcePath: string;
  attributeId: string | null; attributeLabel: string | null; displayType: string | null; requiredSkillId: string | null;
  mechanic: CoverageMechanic;
  direct: boolean;
  /** Recognized non-direct clauses (taunt, reuse-time, dot, critical...) recorded without lowering direct coverage. */
  otherMechanics: string[];
  /** Direct-damage clauses recognized but not simulated (partial support). */
  directSideMechanics: string[];
  /** Planning sub-family for conditional/stateful entries (e.g. creature-type, elite, next-attack); null otherwise. */
  gapFamily: string | null;
  /** Earlier T0013-F1 screening, kept only to reproduce the reclassification of its unmodeled entries. */
  legacy: { family: string; relevant: boolean | null };
  t0014: CoverageEvidence; initial: CoverageEvidence; final: CoverageEvidence;
}

/** Distinguish a conditional third-token required skill from a truly unconditional bonus. */
export function requiresActiveSkillForCoverage(row: Pick<TreasureCoverageRow, 'requiredSkillId' | 'final'>): boolean {
  return row.requiredSkillId !== null || row.final.mappings.some(mapping =>
    mapping.conditions.some(condition => condition.kind === 'requires-active-skill'));
}

export const COVERAGE_REASONS: Record<string, string> = {
  calculated: 'Direct contribution reaches every applicable published combat hit through the existing additive stages.',
  'calculated-when-required-skill-active': 'Conditional: the effect requires an official active skill. Calculated for every applicable published combat hit when that skill is also one of the build\'s two active skills; never assumed active otherwise.',
  'burst-conversion': 'Exact Mock Burst conversion and independent ×0.5 multiplier; Burst falloff intermediate counts are estimated.',
  'split-component-allocation': 'Applied to single-component hits; abilities with several published hit components keep the flat uncertain (allocation unvalidated).',
  'some-targets-without-hits': 'At least one named target ability/attribute has no computable combat hit; the others are calculated.',
  'side-clause:keyword-grant': 'Damage clause calculated; the granted keyword (which would admit other keyword bonuses) is not applied.',
  'side-clause:target-debuff': 'Damage clause calculated; the target debuff that boosts later damage is not simulated.',
  'side-clause:timed-damage-buff': 'Damage clause calculated; the timed / next-attack damage buff is not simulated.',
  'side-clause:damage-type-conversion': 'Damage clause calculated; the damage-type conversion (affecting type bonuses and vulnerability) is not applied.',
  'side-clause:aoe-conversion': 'Damage clause calculated per target; the area-of-effect change is not applied to target counts.',
  'side-clause:random-bonus': 'Damage clause calculated; the chance-based extra damage has no expected-value rule.',
  'side-clause:triggered-damage': 'Damage clause calculated; the separately triggered damage instance (e.g. a Blood Mist eruption) is not simulated.',
  'no-applicable-published-hit': 'An official mapping exists, but no published combat-skill hit uses it (e.g. no ability of that damage type, non-combat skill abilities, or a hook only on DoTs/pets).',
  'unmapped-attribute': 'Official attribute without a validated registry mapping.',
  'unresolved-ability-name': 'Unconditional damage clause, but a named ability/group does not match official display names of the power\'s skill (typo, renamed or group without an official attribute).',
  'no-official-damage-attribute': 'Unconditional damage clause, but the named ability publishes no matching ability-specific damage attribute.',
  'ambiguous-damage-attribute': 'Unconditional damage clause, but several official attributes could represent it.',
  'conditional-target-or-state': 'Requires a target/creature/state condition (Elite, creature type, Vulnerable, Rage, armor %, active skill...). Needs explicit target-condition inputs.',
  'damage-type-conversion': 'Changes the ability\'s damage type; requires a conversion stage before type bonuses and vulnerability.',
  'aoe-targeting-change': 'Changes targeting or area of effect; requires per-ability targeting conversion rules.',
  'multi-hit-split-or-variable': 'Armor/health-specific components, random ranges, extra hits or chance-based damage; requires component allocation or expected-value rules.',
  'stateful-combat-context': 'Timed buffs, next-attack effects, combos, stacking, delayed or kill-triggered effects; requires combat-state simulation.',
  'unclassified-prose': 'Direct-damage wording not matched by any reviewed family; requires manual review.',
  'outside-direct': 'Outside the direct-hit calculator; preserved with its source text and other-mechanic labels.',
};

const NON_DAMAGE_STAT = /^(?:MITIGATION_|VULN_|MAX_|ABILITY_COST_|ABILITY_RESETTIME_|ACCURACY_|EVASION_|RESIST_|TAUNT_|ABILITY_TAUNT_)/u;
const DAMAGE_CATEGORIES: ReadonlySet<ModifierCategory> = new Set([
  'skill-damage-flat', 'skill-damage-percent', 'skill-base-damage-percent', 'ability-damage-flat', 'ability-damage-percent',
  'all-direct-damage-flat', 'all-direct-damage-percent', 'all-damage-flat', 'all-damage-percent',
  'damage-type-direct-flat', 'damage-type-direct-percent', 'damage-type-flat', 'damage-type-percent',
]);
const INDIRECT_CATEGORIES: ReadonlySet<ModifierCategory> = new Set([
  'all-indirect-damage-flat', 'all-indirect-damage-percent', 'damage-type-indirect-flat', 'damage-type-indirect-percent',
]);

/** Ordered wording families for sentences/labels the grammar did not interpret. First match wins. */
const TEXT_FAMILIES: readonly (readonly [CoverageMechanic, RegExp])[] = [
  ['pet-summon', /\b(?:summon(?:ed|s)?|skeletons?|skeletal|zombies?|golem|minion|cold sphere|figments?|confusing double|tornado(?:es)?|fire walls?'?|trick fox(?:es)?|deer ally|pets?'?|incubated spiders|call for backup|deer deal)\b/iu],
  ['reactive', /melee attackers|\battackers\b|damage shield|reflect|retaliat|response damage|injured by an enemy|whenever you take damage|each time they attack and damage you|when you are hit by/iu],
  ['ally-support', /allies'?|all targets' |buffs targets'|grants all targets|boosts the target's/iu],
  ['dot-indirect', /over \d+(?:\.\d+)? seconds|per tick|every \d+ seconds|\bdots?\b|indirect|damage-over-time|over time/iu],
  ['critical', /critical|\bcrits?\b|anatomy|phrenology/iu],
  ['defense-incoming', /you take|damage you take|you suffer|you receive|damage (?:reduction|resistance|mitigation)|mitigat|absorbs?|resilience to damage|falling damage|deal -\d|damage to you\b|attack damage -?\d|less damage|no longer dispels|reduce the damage of/iu],
  ['damage-type-conversion', /damage type|damage becomes|becomes (?:fire|cold|electricity|psychic|darkness|nature|trauma|acid|poison|slashing|crushing|piercing)|instead of (?:slashing|crushing|piercing|fire|cold|electricity|psychic|darkness|nature|trauma|acid|poison)|deals? (?:fire|cold|electricity|psychic|darkness|nature|trauma|acid|poison) damage(?:,| \(| instead)/iu],
  ['aoe-targeting', /hits? all|targets all|all enemies within|additional targets?|all nearby|splits to hit|to all targets|each target/iu],
  ['multi-hit-or-split', /armor damage|damage to armor|health damage|armor-specific|health and armor|between \+?\d+ and|randomly determined|up to \+?\d+(?:\.\d+)? damage|extra (?:attack|hit|trap|damage)|per hit|second full blast|additional figment|double damage|chance (?:to deal|it deals)|\d+% more damage|ignores mitigation|place an extra/iu],
  ['conditional-direct', /[Dd]amage (?:to|against|vs\.?) (?!all targets)(?:the )?(?:[A-Z(]|non-|stunned|elite|undead|sentient|targets|enemies|vulnerable|off-guard)|\bvs\b|[Dd]ominated [Vv]ictim/u],
  ['conditional-direct', /\bif (?:the )?(?:target|it|cast|used)|targets? (?:with|whose|that)|less than|at least \d+%|when you have|while (?:you|\w+ skill)|skill active|knocked down|focused on you|rage, turning|off-guard target/iu],
  ['stateful-combat', /for \d+ (?:seconds?|minutes?)|\bnext\b|\bafter\b|\bwhen\b|whenever|\bwhile\b|until|each time|combo|stack|future|delayed|\bkills?\b|trigger|activates|on contact|every other|existing|raises your|mutation|causes? (?:the )?targets? to (?:take|suffer|be)|\b(?:boosts|increases)\b[^.]*damage/iu],
];
const DAMAGE_WORDING = /damage|critical|\bcrit|hits? all|all enemies within|extra (?:attack|hit|trap)|additional (?:target|figment|trap)/iu;

/** Wording family of a sentence or attribute label; unmatched damage wording defaults to the unconditional family. */
export function classifyMechanicText(text: string): CoverageMechanic {
  const s = text.replace(/<icon=\d+>/gu, '');
  if (!DAMAGE_WORDING.test(s)) return 'non-damage';
  for (const [family, pattern] of TEXT_FAMILIES) if (pattern.test(s)) return family;
  return 'unconditional-flat-percent';
}

const UNMODELED_REASON: Partial<Record<CoverageMechanic, string>> = {
  'conditional-direct': 'conditional-target-or-state', 'damage-type-conversion': 'damage-type-conversion',
  'aoe-targeting': 'aoe-targeting-change', 'multi-hit-or-split': 'multi-hit-split-or-variable', 'stateful-combat': 'stateful-combat-context',
};

/** Legacy T0013-F1 screening (superseded). Kept verbatim only to reproduce the earlier report's reclassification. */
export function classifyTreasureEffect(text: string, attributeId: string | null, label: string | null) {
  const s = (label ?? text).replace(/<icon=\d+>/gu, '');
  if (attributeId && NON_DAMAGE_STAT.test(attributeId)) return { family: 'non-damage-stat', relevant: false };
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

const GAP_FAMILIES: Partial<Record<CoverageMechanic, readonly (readonly [string, RegExp])[]>> = {
  'conditional-direct': [
    ['elite-or-non-elite', /elite/iu],
    ['target-state', /stunned|off-guard|vulnerable|knocked down|focused on you|covered in|deluged|dominated victim/iu],
    ['rage-or-armor-threshold', /rage|armor left|max rage|less than/iu],
    ['active-skill-or-equipment', /skill (?:is )?active|channeling|wielding/iu],
    ['next-attack-damage-type', /next attack|if it(?:'s| is| deals)/iu],
    ['creature-type', /(?:to|against|vs\.?) (?:\((?:corporeal|non-ruminant)\) )?(?:[A-Z][\w-]+|undead|sentient)/u],
  ],
  'stateful-combat': [
    ['combo', /combo/iu],
    ['next-attack', /next (?:attack|[A-Z]?\w+ (?:ability|attack))|your next/iu],
    ['when-hit-or-stacking', /when you are hit|whenever|when hit|stacks?/iu],
    ['kill-triggered', /\bkills?\b/iu],
    ['delayed-damage', /delay|delayed/iu],
    ['target-debuff', /take \+?\d+(?:\.\d+)?%? damage|more vulnerable|vulnerability|suffer/iu],
    ['timed-self-buff', /boosts?|raises|increases|for \d+ (?:seconds?|minutes?)/iu],
  ],
};

/** Planning sub-family of a conditional or stateful entry; deterministic wording screen only. */
export function gapFamily(mechanic: CoverageMechanic, text: string): string | null {
  const families = GAP_FAMILIES[mechanic];
  if (!families) return null;
  const s = text.replace(/<icon=\d+>/gu, '');
  return families.find(([, pattern]) => pattern.test(s))?.[0] ?? 'other';
}

interface MechanicInput {
  description: string; attributeId: string | null; label: string | null; malformed: boolean;
  categories: readonly ModifierCategory[]; grammar: ProseDamageResolution | ProseDamageFailure | null;
}

/** One mechanic per entry, from official structure first, then the grammar, then reviewed wording families. */
export function classifyMechanic(input: MechanicInput): CoverageMechanic {
  const { attributeId, label, categories, grammar } = input;
  if (input.malformed) return 'unresolved-attribute';
  if (attributeId) {
    if (NON_DAMAGE_STAT.test(attributeId)) return 'non-damage-stat';
    if (label === null) return 'unresolved-attribute';
    if (categories.includes('skill-base-damage-percent')) return 'skill-base';
    if (categories.some(c => DAMAGE_CATEGORIES.has(c))) return 'unconditional-flat-percent';
    if (categories.some(c => INDIRECT_CATEGORIES.has(c)) || /^BOOST_ABILITYDOT_|^MOD_ABILITYDOT_/u.test(attributeId)) return 'dot-indirect';
    if (categories.length) return 'non-damage-stat';
    const family = classifyMechanicText(label);
    // Unmapped official ability/skill damage attributes are unconditional by name; they fail on missing hooks.
    return family === 'unconditional-flat-percent' && !/^(?:BOOST|MOD)_/u.test(attributeId) ? 'non-damage-stat' : family;
  }
  if (grammar?.ok) return 'unconditional-flat-percent';
  if (grammar && !grammar.ok && grammar.clause !== null
    && grammar.reason !== 'unrecognized-remainder' && grammar.reason !== 'damage-type-mismatch') {
    const family = classifyMechanicText(input.description);
    return ['pet-summon', 'reactive', 'ally-support', 'dot-indirect', 'critical'].includes(family) ? family : 'unconditional-flat-percent';
  }
  const family = classifyMechanicText(input.description);
  // Damage wording that fits no reviewed family and has no parsed unconditional clause is flagged for manual review.
  return family;
}

interface Snapshot { readonly name: 't0014' | 'initial' | 'final'; readonly context: GameDataRepository; readonly options: AggregateOptions }

export function inventoryTreasureEffects(data: GameDataRepository): TreasureCoverageRow[] {
  const noKeywords = { ...data, keywordRules: [] };
  const snapshots: readonly Snapshot[] = [
    // T0014: direct PvE hooks only, the two original Mock rules, no grammar.
    { name: 't0014', context: noKeywords, options: { registry: T0013_F1_REGISTRY, treasureRules: TREASURE_EFFECT_RULES.filter(r => ['power_4032', 'power_4066'].includes(r.powerId)), proseGrammar: false } },
    // First T0013-F1 commit: keyword hooks + 38 curated definitions + Mock rules, no grammar.
    { name: 'initial', context: data, options: { registry: T0013_F1_REGISTRY, treasureRules: T0013_F1_RULES, proseGrammar: false } },
    { name: 'final', context: data, options: { registry: T0013_F1_REGISTRY, treasureRules: T0013_F1_RULES } },
  ];
  const combat = new Set(data.skills.filter(s => s.combat).map(s => s.id));
  const abilities = data.abilities.filter(a => combat.has(a.skill.skillId ?? ''));
  const supportCache = new Map<string, { applied: string[]; uncertain: string[]; requiredSkills: string[] }>();
  function support(m: NormalizedModifier, aggregation: ModifierAggregationResult, snapshot: Snapshot) {
    const key = JSON.stringify([snapshot.context === data, m.attributeId, m.category, m.scope, m.value === 0, m.conditions]);
    const cached = supportCache.get(key);
    if (cached) return cached;
    const applied: string[] = [], uncertain: string[] = [];
    // Explicit required-skill probe: an official third-token requirement is satisfied only by a two-skill build that
    // also has that skill active. The evidence records these skills, so the result is reported as conditional.
    const requiredSkills = [...new Set(m.conditions.flatMap(c => c.kind === 'requires-active-skill' ? [c.skillId] : []))].sort();
    for (const ability of abilities) {
      const scope = m.scope;
      const hooks = damageHooksForAbility(ability, snapshot.context);
      if (scope.kind === 'skill' && scope.skillId !== ability.skill.skillId) continue;
      if (scope.kind === 'damage-type' && scope.damageType !== ability.damage.damageType && !ability.pve.dots?.some(d => d.damageType === scope.damageType)) continue;
      if (scope.kind === 'ability-attribute-hook' && !hooks[scope.hook]?.includes(scope.attributeId)
        && !ability.pve.dots?.some(d => d.attributeHooks[scope.hook]?.includes(scope.attributeId))) continue;
      const input = { ...aggregation, modifiers: [m], unsupported: [], warnings: [],
        activeSkillIds: [...new Set([ability.skill.skillId!, ...requiredSkills])] };
      // Direct hit components only: DoT uncertainty is an other-mechanic (DoT stage), not a direct-damage gap.
      const decisions = calculateAbilityDamage(ability.id, input, snapshot.context).components.filter(c => c.delivery === 'direct').flatMap(c => c.decisions);
      if (decisions.some(d => d.status === 'applied')) applied.push(ability.id);
      if (decisions.some(d => d.status === 'uncertain')) uncertain.push(ability.id);
    }
    const value = { applied, uncertain, requiredSkills };
    supportCache.set(key, value);
    return value;
  }

  type Base = Omit<TreasureCoverageRow, 't0014' | 'initial' | 'final'>;
  function evidence(row: Base, grammar: ProseDamageResolution | ProseDamageFailure | null, aggregation: ModifierAggregationResult, snapshot: Snapshot): CoverageEvidence {
    const empty = (status: DirectStatus, reason: string): CoverageEvidence =>
      ({ status, reason, rules: [], mappings: [], appliedAbilityIds: [], uncertainAbilityIds: [], confidence: null });
    const modifiers = aggregation.modifiers.filter(m => m.source.kind === 'candidate-mod' && m.source.effectIndex === row.effectIndex);
    const rules = [...new Set(modifiers.map(m => m.mappingRuleId))];
    const mappings = modifiers.map(({ attributeId, category, scope, operation, value, sourceValue, confidence, conditions }) =>
      ({ attributeId, category, scope, operation, value, sourceValue, confidence, conditions }));
    const prose = rules.some(id => id.startsWith('treasure:') || id.startsWith('prose-grammar:'));
    const confidence: ValidationConfidence = prose ? 'source-backed-assumption' : 'official-attribute';
    const curated = interpretTreasureEffect(row.powerId, row.description, snapshot.context, snapshot.options.treasureRules, { proseGrammar: snapshot.options.proseGrammar !== false });
    // Existing exact Mock conversion is implemented by the target stage, with duplicate conflicts retained there.
    if (row.direct && row.powerId === 'power_4032' && curated?.kind === 'drafts') return { ...empty('fully-calculated', 'burst-conversion'), rules, mappings, confidence,
      appliedAbilityIds: abilities.filter(a => a.skill.skillId === 'Psychology' && a.keywords?.includes('Mock')).map(a => a.id) };
    const damage = modifiers.filter(m => DAMAGE_CATEGORIES.has(m.category));
    const probes = damage.map(m => support(m, aggregation, snapshot));
    const appliedAbilityIds = [...new Set(probes.flatMap(p => p.applied))];
    const uncertainAbilityIds = [...new Set(probes.flatMap(p => p.uncertain))];
    const requiredSkills = [...new Set(probes.flatMap(p => p.requiredSkills))].sort();
    const conditional = requiredSkills.length ? { requiredSkillsActivated: requiredSkills } : {};
    // Outside mechanics keep their probe results for audit but never enter the direct denominator.
    if (!row.direct) return { ...empty('outside-direct', 'outside-direct'), rules, mappings, appliedAbilityIds, uncertainAbilityIds };
    if (!appliedAbilityIds.length) {
      let reason = UNMODELED_REASON[row.mechanic] ?? 'unclassified-prose';
      if (uncertainAbilityIds.length) reason = 'split-component-allocation';
      else if (damage.length || (row.attributeId && /^(?:BOOST|MOD)_(?:[A-Z]+_DIRECT|ABILITY_[A-Z]+)$/u.test(row.attributeId))) reason = 'no-applicable-published-hit';
      else if (row.attributeId && !UNMODELED_REASON[row.mechanic]) reason = 'unmapped-attribute';
      else if (row.mechanic === 'unconditional-flat-percent' && grammar && !grammar.ok) {
        reason = grammar.reason === 'unresolved-name' ? 'unresolved-ability-name' : grammar.reason === 'no-damage-attribute' ? 'no-official-damage-attribute'
          : grammar.reason === 'ambiguous-damage-attribute' ? 'ambiguous-damage-attribute' : 'unclassified-prose';
      }
      return { ...empty('unmodeled', reason), rules, mappings, uncertainAbilityIds, ...conditional };
    }
    // A sentence interpreted by a curated rule or the grammar reports its recognized damage-affecting side clauses.
    const side = curated?.kind === 'drafts' && grammar?.ok ? grammar.remainder.direct : [];
    const reason = uncertainAbilityIds.length ? 'split-component-allocation' : probes.some(p => !p.applied.length) ? 'some-targets-without-hits'
      : side.length ? `side-clause:${side[0]}` : requiredSkills.length ? 'calculated-when-required-skill-active' : 'calculated';
    const full = reason === 'calculated' || reason === 'calculated-when-required-skill-active';
    return { status: full ? 'fully-calculated' : 'partially-calculated', reason, rules, mappings, appliedAbilityIds, uncertainAbilityIds, confidence, ...conditional };
  }

  const rows: TreasureCoverageRow[] = [];
  for (const power of data.treasurePowers) {
    const association = combat.has(power.skill.skillId ?? '') ? 'combat-skill' : 'generic';
    const skillId = power.skill.status === 'resolved' ? power.skill.skillId : null;
    for (const tier of power.tiers) {
      const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
      build.equipment = [{ slot: power.slots[0] ?? 'Head', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [{ powerId: power.id, tierId: tier.id }], sparks: { mode: 'none' } }];
      const requirements = tier.effectDescriptions.map(parseEffectDescription).flatMap(p => p.kind === 'attribute' && p.requiredSkillId ? [p.requiredSkillId] : []);
      if (requirements[0]) build.skillSlotA = { skillId: requirements[0], level: 0 };
      const aggregations = snapshots.map(s => aggregateBuildModifiers(build, s.context, s.options));
      tier.effectDescriptions.forEach((description, effectIndex) => {
        const parsed = parseEffectDescription(description);
        const attributeId = parsed.kind === 'attribute' ? parsed.attributeId : null;
        const attr = attributeId ? data.getAttribute(attributeId) : null;
        const grammar = parsed.kind === 'prose' && parseProseDamageClause(description) ? resolveProseDamage(description, skillId, data) : null;
        const categories = aggregations[2]!.modifiers.filter(m => m.source.kind === 'candidate-mod' && m.source.effectIndex === effectIndex).map(m => m.category);
        const mechanic = classifyMechanic({ description, attributeId, label: attr?.label ?? null, malformed: parsed.kind === 'malformed', categories, grammar });
        const otherMechanics = new Set<string>(grammar?.ok ? grammar.remainder.other : []);
        if (aggregations[2]!.modifiers.some(m => m.source.kind === 'candidate-mod' && m.source.effectIndex === effectIndex
          && 'delivery' in m.scope && m.scope.delivery === 'direct-and-indirect')) otherMechanics.add('dot');
        if (power.id === 'power_4032') ['taunt', 'reuse-time'].forEach(k => otherMechanics.add(k));
        const legacy = parsed.kind === 'malformed' ? { family: 'malformed-structured', relevant: null } : classifyTreasureEffect(description, attributeId, attr?.label ?? null);
        const row: Base = { powerId: power.id, internalName: power.internalName, skill: power.skill.sourceId, association, tierId: tier.id,
          effectIndex, description, sourcePath: `tsysclientinfo/${power.id}/Tiers/${tier.id}/Effects[${effectIndex}]`, attributeId,
          attributeLabel: attr?.label ?? null, displayType: attr?.displayType ?? null,
          requiredSkillId: parsed.kind === 'attribute' ? parsed.requiredSkillId : null,
          mechanic, direct: (DIRECT_MECHANICS as readonly string[]).includes(mechanic),
          otherMechanics: [...otherMechanics].sort(), directSideMechanics: grammar?.ok ? [...grammar.remainder.direct] : [],
          gapFamily: gapFamily(mechanic, attr?.label ?? description), legacy };
        const [t0014, initial, final] = snapshots.map((s, i) => evidence(row, grammar, aggregations[i]!, s)) as [CoverageEvidence, CoverageEvidence, CoverageEvidence];
        rows.push({ ...row, t0014, initial, final });
      });
    }
  }
  return rows;
}

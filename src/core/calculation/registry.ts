import type { GameDataRepository } from '../../data/repository/repository';
import { staticDamageKeywordRules, type KeywordDamageData } from './keyword-damage';
import type {
  DamageDelivery, ModifierCategory, ModifierConfidence, ModifierOperation, ModifierScope, ModifierUnit, UnsupportedReason,
} from './modifiers';

/** The official lookups aggregation needs. Accepts the T0006 runtime repository. */
export type ModifierDataContext = Pick<GameDataRepository,
  'gameDataVersion' | 'skills' | 'abilities' | 'getSkill' | 'getAdvancementTable' | 'getAttribute' |
  'getItem' | 'getTreasurePower' | 'getTreasureTier'> & KeywordDamageData;

type Attribute = NonNullable<ReturnType<ModifierDataContext['getAttribute']>>;

/** Official-data facts used by name-family rules; built once per data context. */
export interface MappingIndex {
  /** UPPERCASE official skill ID → skill ID and published name. */
  readonly skillsBySuffix: ReadonlyMap<string, { readonly id: string; readonly name: string }>;
  /** UPPERCASE published ability/DoT damage type → exact damage type spelling. */
  readonly damageTypesBySuffix: ReadonlyMap<string, string>;
  /** Attribute ID → official ability PvE hook names that reference it (e.g. AttributesThatDeltaDamage). */
  readonly hooksByAttribute: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface ModifierMappingRule {
  /** Stable identifier recorded on every produced modifier. */
  readonly id: string;
  readonly description: string;
  readonly category: ModifierCategory;
  readonly operation: ModifierOperation;
  readonly unit: ModifierUnit;
  /** Official DisplayType values the attribute must publish for this interpretation. */
  readonly displayTypes: readonly string[];
  readonly confidence: ModifierConfidence;
  readonly assumptions: readonly string[];
  /** Name/identity match only; returns null when this rule does not describe the attribute. */
  readonly match: (attribute: Attribute, index: MappingIndex) => ModifierScope | null;
}

const indexes = new WeakMap<object, MappingIndex>();

export function getMappingIndex(data: ModifierDataContext): MappingIndex {
  const cached = indexes.get(data);
  if (cached) return cached;
  const skillsBySuffix = new Map<string, { id: string; name: string }>();
  const ambiguous = new Set<string>();
  for (const skill of data.skills) {
    const suffix = skill.id.toUpperCase();
    if (skillsBySuffix.has(suffix)) ambiguous.add(suffix);
    skillsBySuffix.set(suffix, { id: skill.id, name: skill.name ?? skill.id });
  }
  // Never guess between two official skills that differ only by case.
  for (const suffix of ambiguous) skillsBySuffix.delete(suffix);
  const damageTypesBySuffix = new Map<string, string>();
  const hooksByAttribute = new Map<string, Set<string>>();
  for (const ability of data.abilities) {
    damageTypesBySuffix.set(ability.damage.damageType.toUpperCase(), ability.damage.damageType);
    for (const dot of ability.pve.dots ?? []) damageTypesBySuffix.set(dot.damageType.toUpperCase(), dot.damageType);
    for (const [hook, attributes] of Object.entries(ability.pve.attributeHooks)) {
      for (const attributeId of attributes) {
        const hooks = hooksByAttribute.get(attributeId) ?? new Set<string>();
        hooks.add(hook); hooksByAttribute.set(attributeId, hooks);
      }
    }
  }
  for (const rule of staticDamageKeywordRules(data)) {
    for (const hook of ['AttributesThatDeltaDamage', 'AttributesThatModDamage']) {
      for (const attributeId of rule.attributeHooks[hook] ?? []) {
        const hooks = hooksByAttribute.get(attributeId) ?? new Set<string>();
        hooks.add(hook); hooksByAttribute.set(attributeId, hooks);
      }
    }
  }
  const index: MappingIndex = { skillsBySuffix, damageTypesBySuffix, hooksByAttribute };
  indexes.set(data, index);
  return index;
}

const FAMILY_ASSUMPTION = 'Category comes from the official attribute ID family, label and DisplayType; '
  + 'formula ordering/stacking is decided and validated by the damage engine, not here.';
const PERCENT_ASSUMPTION = 'AsBuffMod deltas are fractions (0.45 = +45%), matching the T0010 confirmed display convention.';

function exact(id: string, scope: ModifierScope) {
  return (attribute: Attribute) => attribute.id === id ? scope : null;
}

/** <PREFIX><SKILL> where the suffix is exactly one official skill ID (case-insensitive) and the label names that skill. */
function skillFamily(prefix: string) {
  return (attribute: Attribute, index: MappingIndex): ModifierScope | null => {
    if (!attribute.id.startsWith(prefix)) return null;
    const skill = index.skillsBySuffix.get(attribute.id.slice(prefix.length));
    // Label must name the skill (published name or ID, e.g. "Knife Damage %" for Knife Fighting).
    // Excludes e.g. BOOST_SKILL_ANIMALHANDLING, whose label names two specific abilities instead.
    const label = attribute.label;
    if (!skill || !label || !(label.startsWith(skill.name) || label.startsWith(skill.id))) return null;
    return { kind: 'skill', skillId: skill.id };
  };
}

/** <PREFIX><X> that official ability data actually lists under the named PvE hook. */
function abilityFamily(prefix: string, hook: string) {
  return (attribute: Attribute, index: MappingIndex): ModifierScope | null => {
    if (!attribute.id.startsWith(prefix) || attribute.id.length === prefix.length) return null;
    return index.hooksByAttribute.get(attribute.id)?.has(hook) ? { kind: 'ability-attribute-hook', attributeId: attribute.id, hook } : null;
  };
}

/** <PREFIX><TYPE><SUFFIX> where TYPE is a published ability damage type named in the label. */
function damageTypeFamily(prefix: string, suffix: string, delivery: DamageDelivery | 'from-label') {
  return (attribute: Attribute, index: MappingIndex): ModifierScope | null => {
    if (!attribute.id.startsWith(prefix) || !attribute.id.endsWith(suffix)) return null;
    const type = attribute.id.slice(prefix.length, attribute.id.length - suffix.length);
    const damageType = index.damageTypesBySuffix.get(type);
    if (!damageType || !attribute.label?.includes(damageType)) return null;
    // Unsuffixed families state "(Direct&Per-Tick)" in some labels only; otherwise delivery stays unspecified.
    const resolved = delivery !== 'from-label' ? delivery : /Direct ?& ?Per-Tick/u.test(attribute.label) ? 'direct-and-indirect' : null;
    return { kind: 'damage-type', damageType, delivery: resolved };
  };
}

function rule(id: string, category: ModifierCategory, operation: ModifierOperation, description: string,
  match: ModifierMappingRule['match'], displayTypes: readonly string[] = operation === 'flat' ? ['AsBuffDelta'] : ['AsBuffMod']): ModifierMappingRule {
  return {
    id, category, operation, description, match, displayTypes,
    unit: operation === 'flat' ? 'points' : 'fraction',
    confidence: 'partially_validated',
    assumptions: operation === 'flat' ? [FAMILY_ASSUMPTION] : [FAMILY_ASSUMPTION, PERCENT_ASSUMPTION],
  };
}

/**
 * Initial documented subset (see src/core/calculation/README.md). Every rule requires an official
 * attribute record, a matching DisplayType and an official skill/damage-type/ability-hook identity.
 * Anything else remains an explicit unsupported record.
 */
export const DEFAULT_MODIFIER_RULES: readonly ModifierMappingRule[] = Object.freeze([
  rule('skill-base-damage-percent', 'skill-base-damage-percent', 'percent', 'MOD_SKILL_<SKILL> — "<Skill> Base Damage %"', skillFamily('MOD_SKILL_')),
  rule('skill-damage-flat', 'skill-damage-flat', 'flat', 'BOOST_SKILL_<SKILL> — "<Skill> Damage"', skillFamily('BOOST_SKILL_')),
  rule('skill-damage-percent', 'skill-damage-percent', 'percent', 'MOD_SKILL_ALL_<SKILL> — "<Skill> Damage %"', skillFamily('MOD_SKILL_ALL_')),
  rule('ability-damage-flat', 'ability-damage-flat', 'flat', 'BOOST_ABILITY_<X> listed in an ability AttributesThatDeltaDamage hook',
    abilityFamily('BOOST_ABILITY_', 'AttributesThatDeltaDamage')),
  rule('ability-damage-percent', 'ability-damage-percent', 'percent', 'MOD_ABILITY_<X> listed in an ability AttributesThatModDamage hook',
    abilityFamily('MOD_ABILITY_', 'AttributesThatModDamage')),
  rule('all-direct-damage-flat', 'all-direct-damage-flat', 'flat', 'BOOST_UNIVERSAL_DIRECT — "All Direct Damage"',
    exact('BOOST_UNIVERSAL_DIRECT', { kind: 'general', delivery: 'direct' })),
  rule('all-direct-damage-percent', 'all-direct-damage-percent', 'percent', 'MOD_UNIVERSAL_DIRECT — "All Direct Damage %"',
    exact('MOD_UNIVERSAL_DIRECT', { kind: 'general', delivery: 'direct' })),
  rule('all-indirect-damage-flat', 'all-indirect-damage-flat', 'flat', 'BOOST_UNIVERSAL_INDIRECT — "All Indirect Damage (Per Tick)"',
    exact('BOOST_UNIVERSAL_INDIRECT', { kind: 'general', delivery: 'indirect' })),
  rule('all-indirect-damage-percent', 'all-indirect-damage-percent', 'percent', 'MOD_UNIVERSAL_INDIRECT — "All Indirect Damage %"',
    exact('MOD_UNIVERSAL_INDIRECT', { kind: 'general', delivery: 'indirect' })),
  rule('all-damage-flat', 'all-damage-flat', 'flat', 'BOOST_UNIVERSAL — "All Damage (Direct&Per-Tick)"',
    exact('BOOST_UNIVERSAL', { kind: 'general', delivery: 'direct-and-indirect' })),
  rule('all-damage-percent', 'all-damage-percent', 'percent', 'MOD_UNIVERSAL — "All Damage %"',
    exact('MOD_UNIVERSAL', { kind: 'general', delivery: 'direct-and-indirect' })),
  rule('damage-type-direct-flat', 'damage-type-direct-flat', 'flat', 'BOOST_<TYPE>_DIRECT', damageTypeFamily('BOOST_', '_DIRECT', 'direct')),
  rule('damage-type-direct-percent', 'damage-type-direct-percent', 'percent', 'MOD_<TYPE>_DIRECT', damageTypeFamily('MOD_', '_DIRECT', 'direct')),
  rule('damage-type-indirect-flat', 'damage-type-indirect-flat', 'flat', 'BOOST_<TYPE>_INDIRECT', damageTypeFamily('BOOST_', '_INDIRECT', 'indirect')),
  rule('damage-type-indirect-percent', 'damage-type-indirect-percent', 'percent', 'MOD_<TYPE>_INDIRECT', damageTypeFamily('MOD_', '_INDIRECT', 'indirect')),
  rule('damage-type-flat', 'damage-type-flat', 'flat', 'BOOST_<TYPE> without DIRECT/INDIRECT suffix', damageTypeFamily('BOOST_', '', 'from-label')),
  rule('damage-type-percent', 'damage-type-percent', 'percent', 'MOD_<TYPE> without DIRECT/INDIRECT suffix', damageTypeFamily('MOD_', '', 'from-label')),
  ...(['MAX_HEALTH', 'MAX_POWER', 'MAX_ARMOR'] as const).map(id =>
    rule(`max-resource-flat:${id}`, 'max-resource-flat', 'flat', `${id} — maximum resource points`, exact(id, { kind: 'general', delivery: null }), ['AsInt'])),
  rule('damage-type-mitigation-flat', 'damage-type-mitigation-flat', 'flat', 'MITIGATION_<TYPE> — "<Type> Damage Reduction"',
    damageTypeFamily('MITIGATION_', '', 'from-label')),
]);

export type AttributeInterpretation =
  | { readonly kind: 'modifier'; readonly rule: ModifierMappingRule; readonly scope: ModifierScope; readonly attribute: Attribute }
  | { readonly kind: 'unsupported'; readonly reason: UnsupportedReason; readonly message: string };

export interface ModifierRegistry {
  readonly rules: readonly ModifierMappingRule[];
  interpretAttribute(attributeId: string, data: ModifierDataContext): AttributeInterpretation;
}

/** Add future validated mappings by passing more rules; aggregation code does not change. */
export function createModifierRegistry(rules: readonly ModifierMappingRule[] = DEFAULT_MODIFIER_RULES): ModifierRegistry {
  const ids = new Set<string>();
  for (const entry of rules) {
    if (ids.has(entry.id)) throw new TypeError(`Duplicate modifier mapping rule ${entry.id}`);
    ids.add(entry.id);
  }
  const frozen = Object.freeze([...rules]);
  return {
    rules: frozen,
    interpretAttribute(attributeId, data) {
      const attribute = data.getAttribute(attributeId);
      if (!attribute) return { kind: 'unsupported', reason: 'unknown-attribute', message: `Attribute ${attributeId} is not in official data.` };
      const index = getMappingIndex(data);
      const matches = frozen.flatMap(entry => {
        const scope = entry.match(attribute, index);
        return scope ? [{ entry, scope }] : [];
      });
      if (matches.length > 1) {
        return { kind: 'unsupported', reason: 'unmapped-attribute',
          message: `Attribute ${attributeId} matches several mapping rules (${matches.map(m => m.entry.id).join(', ')}); not interpreted.` };
      }
      const match = matches[0];
      if (!match) {
        return { kind: 'unsupported', reason: 'unmapped-attribute',
          message: `${attribute.label ?? attributeId} (${attributeId}) has no validated modifier mapping yet.` };
      }
      if (!match.entry.displayTypes.includes(attribute.displayType)) {
        return { kind: 'unsupported', reason: 'unexpected-display-type',
          message: `${attributeId} publishes DisplayType ${attribute.displayType}; rule ${match.entry.id} expects ${match.entry.displayTypes.join('/')}.` };
      }
      return { kind: 'modifier', rule: match.entry, scope: match.scope, attribute };
    },
  };
}

export const defaultModifierRegistry = createModifierRegistry();

/** Official `{ATTRIBUTE}{delta}` or `{ATTRIBUTE}{delta}{RequiredActiveSkill}` effect grammar. */
const TOKEN = /^\{([A-Z_0-9]+)\}\{([+-]?(?:\d+(?:\.\d+)?|\.\d+))\}(?:\{([A-Za-z0-9_]+)\})?$/u;

export type ParsedEffect =
  | { readonly kind: 'attribute'; readonly attributeId: string; readonly sourceValue: string; readonly value: number; readonly requiredSkillId: string | null }
  | { readonly kind: 'prose' }
  | { readonly kind: 'malformed' };

export function parseEffectDescription(description: string): ParsedEffect {
  if (!/[{}]/u.test(description)) return { kind: 'prose' };
  const match = TOKEN.exec(description);
  if (!match) return { kind: 'malformed' };
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return { kind: 'malformed' };
  return { kind: 'attribute', attributeId: match[1]!, sourceValue: match[2]!, value, requiredSkillId: match[3] ?? null };
}

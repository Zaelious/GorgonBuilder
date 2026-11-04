import type { GameDataRepository } from '../../data/repository/repository';
import type { DamageAbility } from './ability-damage-types';
import { applicableStaticKeywordRules, type KeywordDamageData } from './keyword-damage';

/**
 * T0013-F2 source-backed critical-hit rules. Pure, React-free and derived from pinned official data only:
 *
 * - Critical system: the official static ability keywords `AnatomyCriticals` / `PhrenologyCriticals`. The official
 *   `abilitykeywords` rules attach the matching critical chance/damage attribute hooks to those keywords.
 * - Creature types: the official Anatomy sub-skills (one per creature category). Each Phrenology sub-skill is paired
 *   with the Anatomy sub-skill of the same category; no monster records or extra taxonomy are invented.
 * - Critical chance by level: the official sub-skill reward `Notes`, read with one fixed template per system and checked
 *   against their published running totals. Anything else leaves the table unresolved.
 */
export type CriticalSystemId = 'anatomy' | 'phrenology';

export interface CriticalSystemDefinition {
  readonly id: CriticalSystemId;
  readonly label: string;
  /** Official static ability keyword selecting the system. */
  readonly keyword: string;
  /** Official umbrella skill ID; sub-skills use `<umbrella>_<Category>` IDs. */
  readonly umbrellaSkillId: string;
  /** Fixed official reward-note template: `<Skills> … : +N%` with an optional `(total N%)`. */
  readonly notePattern: RegExp;
}

const NOTE_NUMBER = '(\\d+(?:\\.\\d+)?)';
export const CRITICAL_SYSTEMS: Readonly<Record<CriticalSystemId, CriticalSystemDefinition>> = Object.freeze({
  anatomy: {
    id: 'anatomy', label: 'Anatomy', keyword: 'AnatomyCriticals', umbrellaSkillId: 'Anatomy',
    notePattern: new RegExp(`^([A-Za-z/ ]+) chance of critical hit: \\+${NOTE_NUMBER}%(?: \\(total ${NOTE_NUMBER}%\\))?$`, 'u'),
  },
  phrenology: {
    id: 'phrenology', label: 'Phrenology', keyword: 'PhrenologyCriticals', umbrellaSkillId: 'Phrenology',
    notePattern: new RegExp(`^([A-Za-z/ ]+) critical hit chance: \\+${NOTE_NUMBER}%(?: \\(total ${NOTE_NUMBER}%\\))?$`, 'u'),
  },
});

/**
 * Reviewed naming exception: the official Fae category is `Anatomy_Fey` ("Fae Anatomy") but `Phrenology_Fae`
 * ("Fae Phrenology"). Every other pair shares its ID suffix. Tests verify every pair against the pinned data.
 */
export const PHRENOLOGY_CATEGORY_ALIASES: Readonly<Record<string, string>> = Object.freeze({ Fae: 'Fey' });

export type CriticalRulesData = Pick<GameDataRepository, 'gameDataVersion' | 'skills' | 'getSkill'>;
type Skill = CriticalRulesData['skills'][number];

export interface CreatureType {
  /** Stable key: the official Anatomy sub-skill ID (e.g. `Anatomy_Humans`). */
  readonly id: string;
  /** Official Anatomy sub-skill name without the trailing " Anatomy" (e.g. "Human"). */
  readonly label: string;
  readonly anatomySkillId: string;
  /** Null when the category publishes no Phrenology sub-skill (e.g. canines). */
  readonly phrenologySkillId: string | null;
}

export interface CriticalChanceThreshold {
  readonly level: number;
  readonly sourceLevelKey: string;
  /** Fraction (0.01 = +1 percentage point). */
  readonly delta: number;
  /** Published running total as a fraction. */
  readonly total: number;
  readonly note: string;
}

export interface CriticalChanceTable {
  readonly skillId: string;
  readonly skillName: string;
  readonly system: CriticalSystemId;
  readonly status: 'resolved' | 'unresolved';
  /** Official skill IDs named by the notes (e.g. Archery, Crossbow). */
  readonly appliesToSkillIds: readonly string[];
  readonly thresholds: readonly CriticalChanceThreshold[];
  readonly problem: string | null;
}

const tables = new WeakMap<object, Map<string, CriticalChanceTable | null>>();
const creatureCache = new WeakMap<object, readonly CreatureType[]>();

function systemForSkillId(skillId: string): CriticalSystemId | null {
  for (const system of Object.values(CRITICAL_SYSTEMS)) if (skillId.startsWith(`${system.umbrellaSkillId}_`)) return system.id;
  return null;
}

function resolveSkillName(name: string, data: CriticalRulesData): string | null {
  const trimmed = name.trim();
  return data.getSkill(trimmed)?.id ?? data.skills.find(skill => skill.name === trimmed)?.id ?? null;
}

const toFraction = (text: string) => Math.round(Number(text) * 1e6) / 1e8;

/** Parse one sub-skill's published critical-chance notes. Null for skills outside both systems. */
function parseTable(skill: Skill, data: CriticalRulesData): CriticalChanceTable | null {
  const system = systemForSkillId(skill.id);
  if (!system) return null;
  const definition = CRITICAL_SYSTEMS[system];
  const base = { skillId: skill.id, skillName: skill.name ?? skill.id, system };
  const thresholds: CriticalChanceThreshold[] = [];
  let applies: string[] | null = null;
  let running = 0;
  let problem: string | null = null;
  const entries = [...skill.progression].sort((a, b) => a.level - b.level);
  for (const entry of entries) {
    // One Notes value may hold several newline-separated official lines (e.g. a crit line plus a butchering line).
    const lines = entry.rewards.flatMap(reward => reward.id === 'Notes' && typeof reward.value === 'string' ? reward.value.split('\n') : []);
    for (const line of lines.map(text => text.trim())) {
      if (!/critical/iu.test(line)) continue;
      const match = definition.notePattern.exec(line);
      if (!match) { problem ??= `Level ${entry.sourceLevelKey} note does not match the ${definition.label} template.`; continue; }
      const names = match[1]!.split('/').map(name => resolveSkillName(name, data));
      if (names.some(name => name === null)) { problem ??= `Level ${entry.sourceLevelKey} names an unknown skill.`; continue; }
      const ids = names as string[];
      if (applies && applies.join('/') !== ids.join('/')) { problem ??= 'Notes name different skills at different levels.'; continue; }
      applies = ids;
      const delta = toFraction(match[2]!);
      running = Math.round((running + delta) * 1e8) / 1e8;
      const total = match[3] === undefined ? delta : toFraction(match[3]);
      if (Math.abs(total - running) > 1e-9) problem ??= `Level ${entry.sourceLevelKey} published total ${match[3]}% disagrees with the running total.`;
      thresholds.push({ level: entry.level, sourceLevelKey: entry.sourceLevelKey, delta, total: running, note: line });
    }
  }
  if (thresholds.length === 0) return null;
  return { ...base, status: problem ? 'unresolved' : 'resolved', appliesToSkillIds: applies ?? [], thresholds, problem };
}

/** Published critical-chance table for an official Anatomy/Phrenology sub-skill; null when it publishes none. */
export function criticalChanceTable(skillId: string, data: CriticalRulesData): CriticalChanceTable | null {
  let cache = tables.get(data);
  if (!cache) { cache = new Map(); tables.set(data, cache); }
  if (cache.has(skillId)) return cache.get(skillId)!;
  const skill = data.getSkill(skillId);
  const table = skill ? parseTable(skill, data) : null;
  cache.set(skillId, table);
  return table;
}

/**
 * Cumulative published chance at an effective level (exported `Level`, which already includes bonus levels).
 * Null for invalid levels or unresolved tables. Levels above the last published note keep the last total.
 */
export function criticalChanceAtLevel(table: CriticalChanceTable, level: number): { readonly chance: number; readonly applied: readonly CriticalChanceThreshold[] } | null {
  if (table.status !== 'resolved' || !Number.isSafeInteger(level) || level < 0) return null;
  const applied = table.thresholds.filter(t => t.level <= level);
  return { chance: applied.at(-1)?.total ?? 0, applied };
}

/** Official creature categories (Anatomy sub-skills that publish critical-chance notes), sorted by label. */
export function creatureTypes(data: CriticalRulesData): readonly CreatureType[] {
  const cached = creatureCache.get(data);
  if (cached) return cached;
  const phrenology = new Map<string, string>();
  for (const skill of data.skills) {
    const table = criticalChanceTable(skill.id, data);
    if (table?.system !== 'phrenology') continue;
    const category = skill.id.slice('Phrenology_'.length);
    phrenology.set(PHRENOLOGY_CATEGORY_ALIASES[category] ?? category, skill.id);
  }
  const types = data.skills.flatMap((skill): CreatureType[] => {
    const table = criticalChanceTable(skill.id, data);
    if (table?.system !== 'anatomy') return [];
    const category = skill.id.slice('Anatomy_'.length);
    return [{ id: skill.id, label: (skill.name ?? category).replace(/ Anatomy$/u, ''), anatomySkillId: skill.id, phrenologySkillId: phrenology.get(category) ?? null }];
  }).sort((a, b) => a.label.localeCompare(b.label));
  creatureCache.set(data, types);
  return types;
}

export function getCreatureType(id: string | null, data: CriticalRulesData): CreatureType | null {
  return id === null ? null : creatureTypes(data).find(type => type.id === id) ?? null;
}

/** The sub-skill that supplies a system's chance against a creature type; null if the category has none. */
export function criticalSkillFor(system: CriticalSystemId, creature: CreatureType): string | null {
  return system === 'anatomy' ? creature.anatomySkillId : creature.phrenologySkillId;
}

export type AbilityCriticalSystem =
  | {
    readonly status: 'supported';
    readonly system: CriticalSystemId;
    readonly keyword: string;
    /** Published PvE CritDamageMod (base critical multiplier); null when not published. */
    readonly critDamageMod: number | null;
    /** Official attributes that change this ability's critical chance / damage (ability hooks ∪ static keyword rules). */
    readonly chanceHooks: readonly string[];
    readonly damageHooks: readonly string[];
    readonly explanation: string;
  }
  | { readonly status: 'conditional'; readonly system: CriticalSystemId; readonly keyword: string; readonly requiredEffectKeywords: readonly string[]; readonly explanation: string }
  | { readonly status: 'none' | 'unresolved'; readonly explanation: string };

export type CriticalAbility = Pick<DamageAbility, 'keywords' | 'conditionalKeywords' | 'attributeHooks' | 'pve' | 'damage' | 'skill'>;

function hookUnion(hook: string, ability: CriticalAbility, data: KeywordDamageData): string[] {
  const values = [...(ability.attributeHooks[hook] ?? []), ...(ability.pve.attributeHooks[hook] ?? [])];
  for (const rule of applicableStaticKeywordRules(ability, data)) values.push(...(rule.attributeHooks[hook] ?? []));
  return [...new Set(values)];
}

/** Resolve the critical system of one exact official ability from its published keywords and hooks. */
export function resolveAbilityCriticalSystem(ability: CriticalAbility, data: KeywordDamageData): AbilityCriticalSystem {
  const keywords = new Set(ability.keywords ?? []);
  const systems = Object.values(CRITICAL_SYSTEMS);
  const fixed = systems.filter(s => keywords.has(s.keyword));
  const conditional = systems.filter(s => !keywords.has(s.keyword) && (ability.conditionalKeywords ?? []).some(c => c.keyword === s.keyword));
  if (fixed.length > 1) return { status: 'unresolved', explanation: 'The ability publishes both Anatomy and Phrenology critical keywords; no precedence is known.' };
  const system = fixed[0];
  if (system) {
    return {
      status: 'supported', system: system.id, keyword: system.keyword, critDamageMod: ability.damage.critDamageMod,
      chanceHooks: hookUnion('AttributesThatDeltaCritChance', ability, data), damageHooks: hookUnion('AttributesThatModCritDamage', ability, data),
      explanation: `Official static keyword ${system.keyword} selects ${system.label}-based critical hits.`,
    };
  }
  const gated = conditional[0];
  if (gated) {
    const required = (ability.conditionalKeywords ?? []).filter(c => c.keyword === gated.keyword)
      .map(c => c.effectKeywordMustExist?.keyword).filter((k): k is string => typeof k === 'string');
    return { status: 'conditional', system: gated.id, keyword: gated.keyword, requiredEffectKeywords: [...new Set(required)],
      explanation: `${gated.label} critical hits are granted only while an effect keyword is active (${[...new Set(required)].join(', ') || 'unpublished'}); stateful effects are not simulated.` };
  }
  if (ability.damage.critDamageMod !== null) {
    return { status: 'unresolved', explanation: 'The ability publishes a critical multiplier but no Anatomy/Phrenology critical keyword; its critical chance source is unknown.' };
  }
  return { status: 'none', explanation: 'The official record publishes no critical-hit system (no critical keyword or multiplier).' };
}

import type { AbilityDamageResult, AbilityDamageWarning, DamageComponentId } from './ability-damage-types';
import type { KeywordDamageData } from './keyword-damage';
import { CONFIDENCE_ORDER, type ModifierConfidence, type NormalizedModifier } from './modifiers';
import {
  CRITICAL_SYSTEMS, criticalChanceAtLevel, criticalChanceTable, criticalSkillFor, getCreatureType, resolveAbilityCriticalSystem,
  type AbilityCriticalSystem, type CreatureType, type CriticalRulesData, type CriticalSystemId,
} from './critical-rules';
import type { CriticalSkillLevel } from './critical-skills';
import type { TargetDamageResult } from './target-damage';

/**
 * T0013-F2 critical stage. A separate pure stage after `calculateAbilityDamage` (T0013) and `applyTargetDummy` (T0014);
 * it never changes their results or recomputes normal damage. For a supported ability:
 *
 *   p        = sub-skill chance (official notes at the effective level) + Σ applicable critical-chance bonuses
 *   M        = published CritDamageMod + Σ applicable critical-damage bonuses
 *   Critical = Normal × M
 *   Expected = Normal × (1 − p) + Critical × p          (expected damage per successful hit)
 *
 * Only the expected-value identity is mathematical; every game rule above keeps its own confidence. No hit chance,
 * DPS, rotation, DoT or Spark behavior is implied. Unknown inputs produce null values with a specific reason.
 */
export const CRITICAL_ASSUMPTIONS = {
  chanceNotes: 'Partially validated: sub-skill critical chance is the cumulative total of the official v490 reward notes through the effective level (the wiki Combat page agrees: Phrenology 1% at level 6 to 8%; Anatomy 1% at level 8 to 6%).',
  chanceAdditive: 'Assumed: critical-chance bonuses from equipment add percentage points to the sub-skill chance. No cap is published; totals outside 0–100% are not calculated.',
  noPhrenologySubskill: 'Assumed: a creature category without a Phrenology sub-skill gives Phrenology criticals 0% chance (official skill descriptions: Phrenology covers "the corresponding type of creature"; wiki: "only thinking and feeling beings").',
  multiplierBase: 'Partially validated: the published PvE CritDamageMod is the base critical multiplier (wiki: Phrenology-based crits default to ×1.25, matching v490).',
  anatomyConflict: 'Conflict: the wiki Combat page says Anatomy-based crits default to ×1.5, but v490 publishes a different CritDamageMod for this ability. The published value is used; the result is Estimated until measured.',
  multiplierAdditive: 'Assumed: each +X% critical damage bonus adds X/100 to the base multiplier (consistent with the wiki example 1.25 + 2.1 + 1.7 = 5.05 for Psychology + Mentalism gear).',
  afterTarget: 'Assumed: the critical multiplier scales the complete per-target normal hit, after build contributions, ability multipliers, Burst falloff and target damage-type modifiers.',
  components: 'Each published hit component (ordinary, health, armor) receives its own critical value; components are never combined.',
} as const;

export type CriticalData = CriticalRulesData & KeywordDamageData;

export interface CriticalInputs {
  /** Selected target dummy creature type (official Anatomy sub-skill ID); null = Unknown. */
  readonly creatureType: string | null;
  /** Resolved imported/manual level of an official critical sub-skill. */
  readonly skillLevel: (skillId: string) => CriticalSkillLevel;
}

export interface CriticalStep {
  readonly kind: 'skill' | 'base' | 'modifier';
  readonly label: string;
  /** Chance: fraction of percentage points (0.05 = 5%); multiplier: additive amount (1.25 base, 2.4 = +240%). */
  readonly amount: number;
  readonly confidence: ModifierConfidence;
  readonly explanation: string;
  readonly modifierKey?: string;
  readonly skill?: CriticalSkillLevel;
}

export interface CriticalTerm {
  /** Null whenever a required input or rule is missing. */
  readonly value: number | null;
  readonly steps: readonly CriticalStep[];
  readonly confidence: ModifierConfidence;
  readonly reason: string | null;
}

export interface CriticalModifierDecision {
  readonly modifier: NormalizedModifier;
  readonly status: 'applied' | 'excluded' | 'uncertain';
  readonly explanation: string;
}

export interface CriticalHitResult {
  readonly componentId: DamageComponentId;
  readonly damageType: string;
  /** T0014 per-target normal hit (unchanged). */
  readonly normal: number | null;
  readonly critical: number | null;
  readonly expected: number | null;
  readonly normalTotal: number | null;
  readonly criticalTotal: number | null;
  readonly expectedTotal: number | null;
}

export interface CriticalDamageResult {
  readonly context: 'pve-critical-after-target-dummy';
  readonly system: AbilityCriticalSystem;
  /** calculated: a supported system with at least one numeric critical or expected value. */
  readonly status: 'calculated' | 'no-critical-system' | 'unavailable';
  readonly creatureType: CreatureType | null;
  /** Sub-skill that supplies the chance for this system and creature; null when none applies. */
  readonly skillId: string | null;
  readonly skill: CriticalSkillLevel | null;
  readonly chance: CriticalTerm;
  readonly multiplier: CriticalTerm;
  readonly hits: readonly CriticalHitResult[];
  readonly decisions: readonly CriticalModifierDecision[];
  readonly confidence: ModifierConfidence;
  readonly assumptions: readonly string[];
  readonly warnings: readonly AbilityDamageWarning[];
}

function weakest(...values: readonly ModifierConfidence[]): ModifierConfidence {
  return values.reduce((a, b) => CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b, 'validated');
}

/** Stable display arithmetic: removes binary drift from sums of published decimals without rounding results. */
const tidy = (value: number) => Math.round(value * 1e10) / 1e10;

const unavailable = (reason: string, steps: readonly CriticalStep[] = []): CriticalTerm => ({ value: null, steps, confidence: 'unknown', reason });

function decideCritical(modifier: NormalizedModifier, hooks: readonly string[], abilitySkill: string | null): CriticalModifierDecision {
  const decision = (status: CriticalModifierDecision['status'], explanation: string) => ({ modifier, status, explanation });
  const { scope } = modifier;
  if (scope.kind !== 'ability-attribute-hook' || !hooks.includes(scope.attributeId) || scope.attributeId !== modifier.attributeId) {
    return decision('excluded', 'This ability does not list the attribute in its official critical hooks (ability record or static keyword rule).');
  }
  if (scope.skillId && scope.skillId !== abilitySkill) return decision('excluded', `Curated rule is restricted to ${scope.skillId} abilities.`);
  if (modifier.conditions.some(c => c.status === 'not-met') || modifier.applicability === 'conditions-not-met') {
    return decision('excluded', 'A required condition (such as an active skill) is not met.');
  }
  if (modifier.conditions.some(c => c.status === 'unevaluated') || modifier.applicability === 'conditions-unevaluated') {
    return decision('uncertain', 'A source condition is not evaluated; the bonus is not added.');
  }
  if (!Number.isFinite(modifier.value) || modifier.operation !== 'percent' || modifier.unit !== 'fraction' || modifier.confidence === 'unknown') {
    return decision('uncertain', 'Value, unit or interpretation is not usable; the bonus is not added.');
  }
  return decision('applied', 'Exact official critical hook and evaluated conditions match.');
}

function modifierStep(modifier: NormalizedModifier, label: string): CriticalStep {
  return { kind: 'modifier', label, amount: modifier.value, confidence: weakest(modifier.confidence, 'assumed'), modifierKey: modifier.key,
    explanation: `${modifier.attributeLabel ?? modifier.attributeId} ${modifier.sourceValue} (${modifier.mappingRuleId}).` };
}

function chanceTerm(system: CriticalSystemId, abilitySkill: string | null, creature: CreatureType | null, skill: CriticalSkillLevel | null,
  skillId: string | null, modifiers: readonly NormalizedModifier[], data: CriticalData, assumptions: Set<string>): CriticalTerm {
  const definition = CRITICAL_SYSTEMS[system];
  const mods = modifiers.map(m => modifierStep(m, m.attributeLabel ?? m.attributeId));
  if (creature === null) return unavailable(`Select a creature type: ${definition.label} critical chance depends on the target's category.`, mods);
  let skillStep: CriticalStep;
  if (skillId === null) {
    assumptions.add(CRITICAL_ASSUMPTIONS.noPhrenologySubskill);
    skillStep = { kind: 'skill', label: `No ${definition.label} sub-skill for ${creature.label}`, amount: 0, confidence: 'assumed',
      explanation: `${creature.label} has no official ${definition.label} sub-skill, so it supplies 0% critical chance.` };
  } else {
    const table = criticalChanceTable(skillId, data);
    if (!table || table.status !== 'resolved') return unavailable(`The ${skillId} critical-chance notes could not be read: ${table?.problem ?? 'none published'}.`, mods);
    if (abilitySkill === null || !table.appliesToSkillIds.includes(abilitySkill)) {
      return unavailable(`${table.skillName} notes grant critical chance to ${table.appliesToSkillIds.join('/')} only; this ability's skill (${abilitySkill ?? 'unresolved'}) has no published chance.`, mods);
    }
    if (!skill || skill.level === null) return unavailable(`${table.skillName} level is unavailable: ${skill?.explanation ?? 'not provided'}`, mods);
    const atLevel = criticalChanceAtLevel(table, skill.level);
    if (!atLevel) return unavailable(`${table.skillName} level ${skill.level} is not a valid whole number.`, mods);
    assumptions.add(CRITICAL_ASSUMPTIONS.chanceNotes);
    skillStep = { kind: 'skill', label: `${table.skillName} Lv ${skill.level}`, amount: atLevel.chance, confidence: 'partially_validated', skill,
      explanation: atLevel.applied.length ? `Official notes through level ${atLevel.applied.at(-1)!.sourceLevelKey}: ${atLevel.applied.at(-1)!.note}`
        : `No published critical-chance note at or below level ${skill.level} (first at ${table.thresholds[0]?.level ?? '—'}).` };
  }
  if (mods.length) assumptions.add(CRITICAL_ASSUMPTIONS.chanceAdditive);
  const steps = [skillStep, ...mods];
  const value = tidy(steps.reduce((sum, step) => sum + step.amount, 0));
  if (!Number.isFinite(value) || value < 0 || value > 1) return unavailable(`Total critical chance ${Number((value * 100).toFixed(4))}% is outside 0–100%; no cap rule is known.`, steps);
  return { value, steps, confidence: weakest(...steps.map(s => s.confidence)), reason: null };
}

function multiplierTerm(system: Extract<AbilityCriticalSystem, { status: 'supported' }>, modifiers: readonly NormalizedModifier[], assumptions: Set<string>): CriticalTerm {
  const mods = modifiers.map(m => modifierStep(m, m.attributeLabel ?? m.attributeId));
  const base = system.critDamageMod;
  if (base === null || !Number.isFinite(base) || base <= 0) return unavailable('The official record publishes no valid critical multiplier (PvE CritDamageMod).', mods);
  const conflict = system.system === 'anatomy' && base !== 1.5;
  assumptions.add(conflict ? CRITICAL_ASSUMPTIONS.anatomyConflict : CRITICAL_ASSUMPTIONS.multiplierBase);
  const baseStep: CriticalStep = { kind: 'base', label: 'Published critical multiplier', amount: base, confidence: conflict ? 'assumed' : 'partially_validated',
    explanation: `Official PvE CritDamageMod × ${base}.` };
  if (mods.length) assumptions.add(CRITICAL_ASSUMPTIONS.multiplierAdditive);
  const steps = [baseStep, ...mods];
  const value = tidy(steps.reduce((sum, step) => sum + step.amount, 0));
  if (!Number.isFinite(value) || value <= 0) return unavailable('The critical multiplier is not positive; no clamp is invented.', steps);
  return { value, steps, confidence: weakest(...steps.map(s => s.confidence)), reason: null };
}

/** Pure T0013-F2 API: critical chance, critical hit and expected damage per successful hit for one ability. */
export function calculateCriticalHit(result: AbilityDamageResult, target: TargetDamageResult, inputs: CriticalInputs, data: CriticalData): CriticalDamageResult {
  const ability = result.ability;
  const creature = getCreatureType(inputs.creatureType, data);
  const warnings: AbilityDamageWarning[] = [];
  const assumptions = new Set<string>();
  const system: AbilityCriticalSystem = ability ? resolveAbilityCriticalSystem(ability, data)
    : { status: 'unresolved', explanation: 'No exact official ability record.' };
  const base = { context: 'pve-critical-after-target-dummy' as const, system, creatureType: creature };
  if (inputs.creatureType !== null && creature === null) warnings.push({ code: 'unknown-creature-type', message: `Creature type ${inputs.creatureType} is not an official category; treated as Unknown.` });
  if (system.status !== 'supported') {
    const reason = system.explanation;
    if (system.status !== 'none') warnings.push({ code: `critical-system-${system.status}`, message: reason });
    return { ...base, status: system.status === 'none' ? 'no-critical-system' : 'unavailable', skillId: null, skill: null,
      chance: unavailable(reason), multiplier: unavailable(reason), decisions: [],
      hits: target.hits.map(hit => ({ componentId: hit.componentId, damageType: hit.damageType, normal: hit.perTarget, critical: null, expected: null,
        normalTotal: hit.total, criticalTotal: null, expectedTotal: null })),
      confidence: 'unknown', assumptions: [], warnings };
  }
  const abilitySkill = ability?.skill.status === 'resolved' ? ability.skill.skillId : null;
  const critical = result.aggregation.modifiers.filter(m => m.category === 'critical-chance-percent' || m.category === 'critical-damage-percent');
  const decisions = critical.map(m => decideCritical(m, m.category === 'critical-chance-percent' ? system.chanceHooks : system.damageHooks, abilitySkill));
  for (const d of decisions.filter(d => d.status === 'uncertain')) warnings.push({ code: 'critical-modifier-uncertain', modifierKey: d.modifier.key, message: d.explanation });
  const applied = (category: NormalizedModifier['category']) => decisions.filter(d => d.status === 'applied' && d.modifier.category === category).map(d => d.modifier);
  const skillId = creature ? criticalSkillFor(system.system, creature) : null;
  const skill = skillId ? inputs.skillLevel(skillId) : null;
  const chance = chanceTerm(system.system, abilitySkill, creature, skill, skillId, applied('critical-chance-percent'), data, assumptions);
  const multiplier = multiplierTerm(system, applied('critical-damage-percent'), assumptions);
  if (target.hits.length > 1) assumptions.add(CRITICAL_ASSUMPTIONS.components);
  const p = chance.value, m = multiplier.value;
  const hits = target.hits.map((hit): CriticalHitResult => {
    const scale = (value: number | null) => {
      if (value === null) return { critical: null, expected: null };
      const criticalValue = m === null ? null : value * m;
      // With p = 0 the identity reduces to Normal even when the multiplier is unknown.
      const expected = p === null ? null : p === 0 ? value : criticalValue === null ? null : value * (1 - p) + criticalValue * p;
      return { critical: criticalValue, expected };
    };
    const per = scale(hit.perTarget), total = scale(hit.total);
    return { componentId: hit.componentId, damageType: hit.damageType, normal: hit.perTarget, critical: per.critical, expected: per.expected,
      normalTotal: hit.total, criticalTotal: total.critical, expectedTotal: total.expected };
  });
  if (hits.some(h => h.critical !== null || h.expected !== null)) assumptions.add(CRITICAL_ASSUMPTIONS.afterTarget);
  const status = hits.some(h => h.critical !== null || h.expected !== null) ? 'calculated' : 'unavailable';
  const confidence = status === 'calculated' ? weakest(target.confidence, chance.confidence, multiplier.confidence, 'assumed') : 'unknown';
  return { ...base, status, skillId, skill, chance, multiplier, hits, decisions, confidence, assumptions: [...assumptions], warnings };
}

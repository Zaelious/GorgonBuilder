import type { TargetConfiguration } from '../build/document';
import type { AbilityDamageResult, AbilityDamageWarning, DamageAbility, DamageComponentId } from './ability-damage-types';
import { CONFIDENCE_ORDER, type ModifierConfidence, type NormalizedModifier } from './modifiers';
import { abilityHasKeyword } from './treasure-effect-rules';

/**
 * T0014 scenario stage. Runs after T0013's `calculateAbilityDamage` and never changes its result. Three independent
 * concepts stay separate:
 *
 * 1. Ability-specific multipliers from curated mods (e.g. Mock's "damage is halved"), independent of enemy count.
 * 2. Burst target-count falloff (official 2024-07-30 rules; only documented points are calculated).
 * 3. How many configured enemies are affected (single target, Burst "all enemies within radius", or unknown cap).
 *
 * Then the dummy's damage-type vulnerability/resistance multiplier is applied to the matching hit type.
 */
export const TARGET_DAMAGE_ASSUMPTIONS = {
  damageType: 'Assumed: target vulnerability and resistance are percentage points for the hit\'s exact published damage type. They net additively (vulnerability − resistance) into one multiplier applied after all build contributions. Unvalidated.',
  singleTarget: 'Assumed: an ability without a published AoE value or Burst conversion hits only its selected target.',
  aoeInRange: 'Assumed: every configured enemy, up to the known target cap, is inside the AoE area.',
  burstInRange: 'Scenario assumption: every configured enemy is inside the Burst radius. Burst attacks hit all enemies in range; no hidden target cap is inferred from the radius.',
  publishedAoeRadius: 'Assumed: the published AoE value of a Burst-keyword ability is its Burst radius in meters.',
  floorPoint: 'Assumed: the radius bonus extends full-damage targets only; the documented minimum still applies at 9 or more enemies.',
} as const;

/** Official Project Gorgon update notes, 2024-07-30 ("Area-of-Effect and Burst Changes"). */
export const BURST_FALLOFF_RULES = {
  source: 'Project Gorgon game update 2024-07-30',
  fullDamageTargets: 3,
  metersPerExtraFullTarget: 10,
  floorFromTargets: 9,
  floor: { direct: 0.25, indirect: 0.5 },
} as const;

export interface BurstFalloff {
  readonly delivery: 'direct' | 'indirect';
  readonly enemies: number;
  readonly radius: number | null;
  /** 3 + one per full 10 m of radius; null if the radius is unknown. */
  readonly fullDamageTargets: number | null;
  /** Chance of one extra full-damage target from the radius remainder (7 m → 0.7). */
  readonly extraTargetChance: number;
  readonly status: 'full' | 'floor' | 'probabilistic' | 'undocumented';
  /** Per-target multiplier; null where the official rules publish no value. */
  readonly multiplier: number | null;
  readonly explanation: string;
}

/** Documented Burst falloff only. Intermediate percentages are never invented. */
export function burstTargetFalloff(enemies: number, radius: number | null, delivery: 'direct' | 'indirect'): BurstFalloff {
  const r = BURST_FALLOFF_RULES;
  const validRadius = radius !== null && Number.isFinite(radius) && radius >= 0 ? radius : null;
  const full = r.fullDamageTargets + (validRadius === null ? 0 : Math.floor(validRadius / r.metersPerExtraFullTarget));
  const chance = validRadius === null ? 0 : (validRadius % r.metersPerExtraFullTarget) / r.metersPerExtraFullTarget;
  const floor = r.floor[delivery];
  const base = { delivery, enemies, radius: validRadius, fullDamageTargets: validRadius === null ? null : full, extraTargetChance: chance };
  const fullAt = validRadius === null ? r.fullDamageTargets : full;
  if (enemies <= fullAt) {
    return { ...base, status: 'full', multiplier: 1,
      explanation: `${enemies} ${enemies === 1 ? 'enemy is' : 'enemies are'} within the ${fullAt} full-damage targets (3${validRadius ? ` + ${Math.floor(validRadius / 10)} for ${validRadius} m radius` : ''}).` };
  }
  if (enemies === fullAt + 1 && chance > 0) {
    return { ...base, status: 'probabilistic', multiplier: null,
      explanation: `${Math.round(chance * 100)}% chance this enemy is also hit at full damage (radius remainder); otherwise falloff applies. No single value is calculated.` };
  }
  if (enemies >= r.floorFromTargets && fullAt < r.floorFromTargets) {
    return { ...base, status: 'floor', multiplier: floor,
      explanation: `${enemies} enemies reach the documented ${delivery} minimum of ${floor * 100}% (9 or more enemies).` };
  }
  return { ...base, status: 'undocumented', multiplier: null,
    explanation: `${enemies} enemies is between ${fullAt} full-damage targets and the 9-enemy minimum; the official notes publish no intermediate percentage.` };
}

export type TargetStepKind = 'ability-multiplier' | 'burst-falloff' | 'damage-type';

export interface TargetStep {
  readonly kind: TargetStepKind;
  readonly label: string;
  readonly detail: string;
  /** Null when the documented rule publishes no value for this scenario. */
  readonly multiplier: number | null;
  readonly before: number;
  readonly after: number | null;
  readonly confidence: ModifierConfidence;
  readonly explanation: string;
  readonly modifierKey?: string;
}

/** Kept for compatibility with the original T0014 contract: the damage-type step's values. */
export interface TargetDamageTypeStep {
  readonly damageType: string;
  readonly vulnerability: number;
  readonly resistance: number;
  readonly multiplier: number;
  readonly before: number;
  readonly after: number;
  readonly confidence: ModifierConfidence;
  readonly explanation: string;
}

export interface TargetHitResult {
  readonly componentId: DamageComponentId;
  readonly sourcePath: string;
  readonly damageType: string;
  /** T0013 supported-subset value before scenario effects. */
  readonly beforeTarget: number | null;
  /** Ordered: ability multiplier(s), Burst falloff, damage-type modifier. */
  readonly steps: readonly TargetStep[];
  /** Null when no relevant non-zero vulnerability/resistance is configured for this damage type. */
  readonly targetStep: TargetDamageTypeStep | null;
  readonly perTarget: number | null;
  /** perTarget × affected targets; null whenever either is unknown. */
  readonly total: number | null;
  /** True only when T0013 validated the hit and no assumed scenario step applies. */
  readonly validated: boolean;
  readonly confidence: ModifierConfidence;
}

export interface BurstCoverage {
  readonly source: 'treasure-conversion' | 'published-aoe';
  readonly radius: number;
  readonly modifierKey?: string;
}

export interface TargetDamageResult {
  readonly context: 'pve-normal-with-target-dummy';
  readonly configuredTargets: number;
  /** True when the official record publishes an AoE value or a curated mod converts it to Burst. */
  readonly areaOfEffect: boolean;
  /** Burst coverage that hits all enemies within a radius; null otherwise. */
  readonly burst: BurstCoverage | null;
  /** Documented Burst falloff for the configured enemies (direct and indirect kept separate); null if not Burst or 1 enemy. */
  readonly falloff: { readonly direct: BurstFalloff; readonly indirect: BurstFalloff } | null;
  /** Source-backed cap only; v490 abilities publish none. */
  readonly targetCap: number | null;
  readonly affectedTargets: number | null;
  readonly hits: readonly TargetHitResult[];
  /** Applicable curated non-damage effects (taunt, reuse timer) and conversions, for display. */
  readonly abilityEffects: readonly NormalizedModifier[];
  readonly confidence: ModifierConfidence;
  readonly assumptions: readonly string[];
  readonly warnings: readonly AbilityDamageWarning[];
}

export interface TargetDamageOptions {
  /** A known, source-backed maximum number of affected targets. Never defaulted to unlimited. */
  readonly targetCap?: number | null;
}

const ABILITY_EFFECT_CATEGORIES = new Set<NormalizedModifier['category']>([
  'ability-burst-conversion', 'ability-damage-multiplier', 'ability-taunt-flat', 'ability-reset-time-flat',
]);

function weakest(...values: readonly ModifierConfidence[]): ModifierConfidence {
  return values.reduce((a, b) => CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b, 'validated');
}

/** Curated ability-effect modifiers whose exact scope covers this official ability and whose conditions hold. */
function abilityEffectsFor(ability: DamageAbility, modifiers: readonly NormalizedModifier[]): NormalizedModifier[] {
  return modifiers.filter(m => {
    if (!ABILITY_EFFECT_CATEGORIES.has(m.category) || m.applicability === 'conditions-not-met' || m.applicability === 'conditions-unevaluated') return false;
    const { scope } = m;
    if (scope.kind === 'ability-keyword') return abilityHasKeyword(ability, scope);
    if (scope.kind === 'ability-attribute-hook') return ability.pve.attributeHooks[scope.hook]?.includes(scope.attributeId) ?? false;
    return false;
  });
}

const formatMultiplier = (value: number) => `× ${Number(value.toFixed(4))}`;

/** Pure: applies ability conversions, Burst falloff and the configured dummy to a T0013 result. */
export function applyTargetDummy(result: AbilityDamageResult, target: TargetConfiguration, options: TargetDamageOptions = {}): TargetDamageResult {
  const warnings: AbilityDamageWarning[] = [];
  const assumptions = new Set<string>();
  const count = target.count;
  const ability = result.ability;
  const cap = options.targetCap ?? null;
  const targetCap = cap !== null && Number.isSafeInteger(cap) && cap >= 1 ? cap : null;
  if (cap !== null && targetCap === null) warnings.push({ code: 'invalid-target-cap', message: `Target cap ${cap} is not a positive whole number and is ignored.` });

  const abilityEffects = ability ? abilityEffectsFor(ability, result.aggregation.modifiers) : [];
  const conversions = abilityEffects.filter(m => m.category === 'ability-burst-conversion');
  const multipliers = abilityEffects.filter(m => m.category === 'ability-damage-multiplier');
  let conflict = false;
  if (conversions.length > 1 || multipliers.length > 1) {
    conflict = true;
    warnings.push({ code: 'multiple-ability-conversions',
      message: `${conversions.length} Burst conversions and ${multipliers.length} damage multipliers apply; how duplicates stack is unknown, so no value is calculated.` });
  }
  for (const m of abilityEffects) for (const a of m.assumptions) assumptions.add(a);

  let burst: BurstCoverage | null = null;
  if (ability && conversions.length >= 1) {
    burst = { source: 'treasure-conversion', radius: conversions[0]!.value, modifierKey: conversions[0]!.key };
  } else if (ability && ability.targeting.aoe !== null && (ability.keywords ?? []).includes('Burst')) {
    burst = { source: 'published-aoe', radius: ability.targeting.aoe };
  }
  const areaOfEffect = ability !== null && (ability.targeting.aoe !== null || burst !== null);

  let affectedTargets: number | null;
  if (!ability || !Number.isSafeInteger(count) || count < 1) {
    affectedTargets = null;
    if (ability) warnings.push({ code: 'invalid-target-count', message: `Configured enemy count ${count} is not a positive whole number.` });
  } else if (!areaOfEffect) {
    affectedTargets = 1;
    if (count > 1) {
      assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.singleTarget);
      warnings.push({ code: 'single-target-ability', message: `Single-target ability: only 1 of ${count} configured enemies is hit.` });
    }
  } else if (targetCap !== null) {
    affectedTargets = Math.min(count, targetCap);
    if (count > 1) assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.aoeInRange);
  } else if (burst !== null) {
    affectedTargets = count;
    if (count > 1) {
      assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.burstInRange);
      if (burst.source === 'published-aoe') assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.publishedAoeRadius);
    }
  } else if (count === 1) {
    affectedTargets = 1;
  } else {
    affectedTargets = null;
    warnings.push({ code: 'target-cap-unknown',
      message: `This AoE ability is not marked Burst and publishes no target cap, so the total across ${count} enemies is not calculated. An unlimited cap is never assumed.` });
  }

  const falloff = burst && affectedTargets !== null && affectedTargets > 1
    ? { direct: burstTargetFalloff(affectedTargets, burst.radius, 'direct'), indirect: burstTargetFalloff(affectedTargets, burst.radius, 'indirect') }
    : null;
  if (falloff && (falloff.direct.status === 'undocumented' || falloff.direct.status === 'probabilistic')) {
    warnings.push({ code: `burst-falloff-${falloff.direct.status}`, message: `Burst falloff: ${falloff.direct.explanation}` });
  }
  if (falloff?.direct.status === 'floor' && (falloff.direct.fullDamageTargets ?? 3) > BURST_FALLOFF_RULES.fullDamageTargets) {
    assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.floorPoint);
  }

  const hits = result.components.filter(c => c.delivery === 'direct' && c.baseStatus !== 'absent').map((component): TargetHitResult => {
    const beforeTarget = component.provisionalDamage;
    const steps: TargetStep[] = [];
    let value: number | null = conflict ? null : beforeTarget;
    const push = (step: Omit<TargetStep, 'before' | 'after'>) => {
      if (value === null) return;
      const before = value;
      const after = step.multiplier === null ? null : before * step.multiplier;
      steps.push({ ...step, before, after });
      value = after;
    };
    for (const m of multipliers.slice(0, 1)) {
      push({ kind: 'ability-multiplier', label: m.attributeLabel ?? m.attributeId, detail: `${m.sourceValue} · from mod`,
        multiplier: m.value, confidence: 'assumed', modifierKey: m.key,
        explanation: `Ability-specific ${formatMultiplier(m.value)} after all build contributions, for every enemy count.` });
    }
    if (falloff) {
      const f = falloff.direct;
      push({ kind: 'burst-falloff', label: `Burst falloff · ${f.enemies} enemies`,
        detail: f.fullDamageTargets === null ? 'radius unknown' : `${f.fullDamageTargets} full-damage targets (${f.radius} m)`,
        multiplier: f.multiplier, confidence: f.status === 'full' ? 'partially_validated' : 'assumed', explanation: f.explanation });
    }
    const settings = target.damageTypes[component.damageType];
    const vulnerability = settings?.vulnerability ?? 0;
    const resistance = settings?.resistance ?? 0;
    let targetStep: TargetDamageTypeStep | null = null;
    if (value !== null && (vulnerability !== 0 || resistance !== 0)) {
      assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.damageType);
      const multiplier = 1 + (vulnerability - resistance) / 100;
      const before: number = value;
      const explanation = `${before} × (1 + (${vulnerability}% − ${resistance}%)) = ${before * multiplier}`;
      targetStep = { damageType: component.damageType, vulnerability, resistance, multiplier, before, after: before * multiplier, confidence: 'assumed', explanation };
      push({ kind: 'damage-type', label: `Target ${component.damageType} modifier`, detail: `vulnerability ${vulnerability}% · resistance ${resistance}%`,
        multiplier, confidence: 'assumed', explanation });
      if (!Number.isFinite(multiplier) || multiplier < 0) {
        warnings.push({ code: 'invalid-target-modifier', componentId: component.id,
          message: `${component.damageType} resistance above 100% net produces no valid damage; no clamp or healing rule is invented.` });
        value = null;
      }
    }
    const perTarget: number | null = value;
    const total = perTarget !== null && affectedTargets !== null ? perTarget * affectedTargets : null;
    const confidence = weakest(component.confidence, ...steps.map(s => s.confidence));
    return { componentId: component.id, sourcePath: component.sourcePath, damageType: component.damageType, beforeTarget, steps, targetStep,
      perTarget, total, validated: component.normalDamage !== null && steps.length === 0, confidence };
  });
  let confidence = weakest(result.confidence, ...hits.map(h => h.confidence));
  if (assumptions.size > 0) confidence = weakest(confidence, 'assumed');
  return { context: 'pve-normal-with-target-dummy', configuredTargets: count, areaOfEffect, burst, falloff, targetCap, affectedTargets,
    hits, abilityEffects, confidence, assumptions: [...assumptions], warnings };
}

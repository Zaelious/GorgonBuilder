import type { TargetConfiguration } from '../build/document';
import type { AbilityDamageResult, AbilityDamageWarning, DamageComponentId } from './ability-damage-types';
import { CONFIDENCE_ORDER, type ModifierConfidence } from './modifiers';

/**
 * T0014 target-dummy stage. Runs after T0013's `calculateAbilityDamage` and never changes its result: a
 * damage-type vulnerability/resistance multiplier per published hit component, then affected-target count.
 */
export const TARGET_DAMAGE_ASSUMPTIONS = {
  damageType: 'Assumed: target vulnerability and resistance are percentage points for the hit\'s exact published damage type. They net additively (vulnerability − resistance) into one multiplier applied after all build contributions. Unvalidated.',
  singleTarget: 'Assumed: an ability without a published AoE value hits only its selected target.',
  aoeInRange: 'Assumed: every configured enemy, up to the known target cap, is inside the AoE area.',
} as const;

export interface TargetDamageTypeStep {
  readonly damageType: string;
  /** Percentage points, as entered (0 when unset). */
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
  /** T0013 supported-subset value before target effects. */
  readonly beforeTarget: number | null;
  /** Null when no relevant non-zero vulnerability/resistance is configured for this damage type. */
  readonly targetStep: TargetDamageTypeStep | null;
  readonly perTarget: number | null;
  /** perTarget × affected targets; null whenever the affected count is unknown. */
  readonly total: number | null;
  /** True only when T0013 validated the hit and no assumed target stage applies. */
  readonly validated: boolean;
  readonly confidence: ModifierConfidence;
}

export interface TargetDamageResult {
  readonly context: 'pve-normal-with-target-dummy';
  readonly configuredTargets: number;
  /** True when the official record publishes an AoE value. */
  readonly areaOfEffect: boolean;
  /** Source-backed cap only; v490 abilities publish none, so this is null unless supplied. */
  readonly targetCap: number | null;
  readonly affectedTargets: number | null;
  /** Published direct hit components, kept separate (never summed). */
  readonly hits: readonly TargetHitResult[];
  readonly confidence: ModifierConfidence;
  readonly assumptions: readonly string[];
  readonly warnings: readonly AbilityDamageWarning[];
}

export interface TargetDamageOptions {
  /** A known, source-backed maximum number of affected targets. Never defaulted to unlimited. */
  readonly targetCap?: number | null;
}

function weakest(...values: readonly ModifierConfidence[]): ModifierConfidence {
  return values.reduce((a, b) => CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b, 'validated');
}

/** Pure: applies the configured dummy to a T0013 result. Does not recompute build modifiers. */
export function applyTargetDummy(result: AbilityDamageResult, target: TargetConfiguration, options: TargetDamageOptions = {}): TargetDamageResult {
  const warnings: AbilityDamageWarning[] = [];
  const assumptions = new Set<string>();
  const count = target.count;
  const ability = result.ability;
  const areaOfEffect = ability !== null && ability.targeting.aoe !== null;
  const cap = options.targetCap ?? null;
  const targetCap = cap !== null && Number.isSafeInteger(cap) && cap >= 1 ? cap : null;
  if (cap !== null && targetCap === null) warnings.push({ code: 'invalid-target-cap', message: `Target cap ${cap} is not a positive whole number and is ignored.` });

  let affectedTargets: number | null;
  if (!ability || !Number.isSafeInteger(count) || count < 1) {
    affectedTargets = null;
    if (ability) warnings.push({ code: 'invalid-target-count', message: `Configured enemy count ${count} is not a positive whole number.` });
  } else if (!areaOfEffect) {
    affectedTargets = 1;
    if (count > 1) {
      assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.singleTarget);
      warnings.push({ code: 'single-target-ability', message: `No AoE value is published; only 1 of ${count} configured enemies is counted.` });
    }
  } else if (targetCap !== null) {
    affectedTargets = Math.min(count, targetCap);
    if (count > 1) assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.aoeInRange);
  } else if (count === 1) {
    affectedTargets = 1;
  } else {
    affectedTargets = null;
    warnings.push({ code: 'target-cap-unknown',
      message: `No AoE target cap is published for this ability, so the total across ${count} enemies is not calculated. An unlimited cap is never assumed.` });
  }

  const hits = result.components.filter(c => c.delivery === 'direct' && c.baseStatus !== 'absent').map((component): TargetHitResult => {
    const settings = target.damageTypes[component.damageType];
    const vulnerability = settings?.vulnerability ?? 0;
    const resistance = settings?.resistance ?? 0;
    const beforeTarget = component.provisionalDamage;
    let targetStep: TargetDamageTypeStep | null = null;
    let perTarget = beforeTarget;
    if (beforeTarget !== null && (vulnerability !== 0 || resistance !== 0)) {
      assumptions.add(TARGET_DAMAGE_ASSUMPTIONS.damageType);
      const multiplier = 1 + (vulnerability - resistance) / 100;
      const after = beforeTarget * multiplier;
      const valid = Number.isFinite(multiplier) && Number.isFinite(after) && after >= 0;
      targetStep = { damageType: component.damageType, vulnerability, resistance, multiplier, before: beforeTarget, after,
        confidence: 'assumed', explanation: `${beforeTarget} × (1 + (${vulnerability}% − ${resistance}%)) = ${after}` };
      if (!valid) warnings.push({ code: 'invalid-target-modifier', componentId: component.id,
        message: `${component.damageType} resistance above 100% net produces no valid damage; no clamp or healing rule is invented.` });
      perTarget = valid ? after : null;
    }
    const total = perTarget !== null && affectedTargets !== null ? perTarget * affectedTargets : null;
    const confidence = weakest(component.confidence, targetStep ? 'assumed' : 'validated');
    return { componentId: component.id, sourcePath: component.sourcePath, damageType: component.damageType, beforeTarget,
      targetStep, perTarget, total, validated: component.normalDamage !== null && targetStep === null, confidence };
  });
  let confidence = weakest(result.confidence, ...hits.map(h => h.confidence));
  if (assumptions.size > 0) confidence = weakest(confidence, 'assumed');
  return { context: 'pve-normal-with-target-dummy', configuredTargets: count, areaOfEffect, targetCap, affectedTargets,
    hits, confidence, assumptions: [...assumptions], warnings };
}

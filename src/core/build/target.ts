import type { TargetConfiguration, TargetDamageTypeSettings } from './document';

/** T0014 custom target dummy: enemy-count input range. Schema v1 itself only requires a positive integer. */
export const TARGET_COUNT_MIN = 1;
export const TARGET_COUNT_MAX = 20;
/** Percentage-point input bounds for one damage type (see T0014 target-damage assumptions). */
export const TARGET_PERCENT_MIN = 0;
export const TARGET_PERCENT_MAX = 1000;

export type TargetPercentField = 'vulnerability' | 'resistance';

/** Clamp a requested enemy count to whole numbers 1–20; returns the same object when nothing changes. */
export function setTargetCount(target: TargetConfiguration, count: number): TargetConfiguration {
  if (!Number.isFinite(count)) return target;
  const next = Math.min(TARGET_COUNT_MAX, Math.max(TARGET_COUNT_MIN, Math.round(count)));
  return next === target.count ? target : { ...target, count: next };
}

/**
 * Set or clear (null/0) one percentage input for an exact published damage-type name. Empty entries are removed;
 * other damage types, entry metadata and target metadata are preserved. Invalid values leave the target unchanged.
 */
export function setTargetDamageTypePercent(target: TargetConfiguration, damageType: string, field: TargetPercentField,
  value: number | null): TargetConfiguration {
  if (!damageType.trim()) return target;
  if (value !== null && (!Number.isFinite(value) || value < TARGET_PERCENT_MIN || value > TARGET_PERCENT_MAX)) return target;
  const previous: TargetDamageTypeSettings = target.damageTypes[damageType] ?? {};
  if ((previous[field] ?? null) === (value === 0 ? null : value)) return target;
  const entry: TargetDamageTypeSettings = { ...previous };
  if (value === null || value === 0) delete entry[field];
  else entry[field] = value;
  const damageTypes = { ...target.damageTypes };
  if (entry.vulnerability === undefined && entry.resistance === undefined && entry.metadata === undefined) delete damageTypes[damageType];
  else damageTypes[damageType] = entry;
  return { ...target, damageTypes };
}

/** Damage types with a non-zero configured vulnerability or resistance, in saved key order. */
export function configuredTargetDamageTypes(target: TargetConfiguration): string[] {
  return Object.entries(target.damageTypes)
    .filter(([, settings]) => (settings.vulnerability ?? 0) !== 0 || (settings.resistance ?? 0) !== 0)
    .map(([damageType]) => damageType);
}

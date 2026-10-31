import {
  either, isNonnegativeInteger, literal, parseJson, shape, validateVersioned,
} from '../../core/build/validation';
import type { DataResult, Guard } from '../../core/build/validation';

export const PREFERENCES_SCHEMA_VERSION = 1 as const;

export interface Preferences {
  schemaVersion: typeof PREFERENCES_SCHEMA_VERSION;
  /** Planned filter value only; T0009 must resolve KI-0007 before applying it.
   * null disables the filter. This does not assert an equip-level requirement.
   */
  minimumEquipmentLevel: number | null;
}

export function createDefaultPreferences(): Preferences {
  return { schemaVersion: PREFERENCES_SCHEMA_VERSION, minimumEquipmentLevel: 90 };
}

const preferences: Guard<Preferences> = shape({
  schemaVersion: literal(PREFERENCES_SCHEMA_VERSION),
  minimumEquipmentLevel: either(isNonnegativeInteger, literal(null)),
});

export function validatePreferences(value: unknown): DataResult<Preferences> {
  return validateVersioned(value, PREFERENCES_SCHEMA_VERSION, preferences);
}

export function deserializePreferences(json: string): DataResult<Preferences> {
  return parseJson(json, validatePreferences);
}

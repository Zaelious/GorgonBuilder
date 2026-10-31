import type { JsonObject, JsonValue } from '../../data/normalized/progression';
import { BUILD_SCHEMA_VERSION } from './document';
import type { BuildDocument } from './document';

export type Guard<T> = (value: unknown) => value is T;
type Guarded<G> = G extends Guard<infer T> ? T : never;

export const isString: Guard<string> = (v): v is string => typeof v === 'string';
export const isNonemptyString: Guard<string> = (v): v is string => isString(v) && v.trim().length > 0;
export const isFiniteNumber: Guard<number> = (v): v is number => typeof v === 'number' && Number.isFinite(v);
export const isNonnegativeInteger: Guard<number> = (v): v is number => isFiniteNumber(v) && Number.isSafeInteger(v) && v >= 0;
const isPositiveInteger: Guard<number> = (v): v is number => isNonnegativeInteger(v) && v > 0;
export const isRecord: Guard<Record<string, unknown>> = (v): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

export function literal<T extends string | number | null>(expected: T): Guard<T> {
  return (v): v is T => v === expected;
}
export function either<A, B>(a: Guard<A>, b: Guard<B>): Guard<A | B> {
  return (v): v is A | B => a(v) || b(v);
}
export function arrayOf<T>(guard: Guard<T>): Guard<T[]> {
  return (v): v is T[] => Array.isArray(v) && Array.from(v).every(guard);
}
export function recordOf<T>(guard: Guard<T>): Guard<Record<string, T>> {
  return (v): v is Record<string, T> => isRecord(v) && Object.values(v).every(guard);
}

/** Closed schema objects; extension data belongs in explicit metadata fields. */
export function shape<R extends Record<string, Guard<unknown>>, O extends Record<string, Guard<unknown>> = Record<never, never>>(
  required: R, optional?: O,
): Guard<{ [K in keyof R]: Guarded<R[K]> } & { [K in keyof O]?: Guarded<O[K]> }> {
  return (v): v is { [K in keyof R]: Guarded<R[K]> } & { [K in keyof O]?: Guarded<O[K]> } =>
    isRecord(v) && Object.entries(required).every(([key, guard]) => Object.hasOwn(v, key) && guard(v[key])) &&
    Object.keys(v).every(key => Object.hasOwn(required, key) ||
      (optional !== undefined && Object.hasOwn(optional, key) && optional[key]!(v[key])));
}

/** Reject values JSON would silently discard/coerce, and cyclic/non-plain data. */
export function isJsonValue(value: unknown): value is JsonValue {
  const ancestors = new Set<object>();
  function visit(v: unknown): boolean {
    if (v === null || typeof v === 'boolean' || isString(v) || isFiniteNumber(v)) return true;
    if (!(Array.isArray(v) || isRecord(v)) || ancestors.has(v) || Object.getOwnPropertySymbols(v).length) return false;
    ancestors.add(v);
    const valid = Array.isArray(v) ? Array.from(v).every(visit) : Object.values(v).every(visit);
    ancestors.delete(v);
    return valid;
  }
  try { return visit(value); } catch { return false; }
}
const isJsonObject: Guard<JsonObject> = (v): v is JsonObject => isRecord(v) && isJsonValue(v);
const nullableId = either(isNonemptyString, literal(null));
const skillSlot = shape({ skillId: nullableId, level: isNonnegativeInteger });
const ability = shape({ abilityId: isNonemptyString, rank: either(either(isString, isFiniteNumber), literal(null)) });
const tier = shape({ powerId: isNonemptyString, tierId: isNonemptyString });
const candidate = shape({ powerId: isNonemptyString, tierId: nullableId });
const sourceFields = { reference: isString, exportedAt: isString, reportVersion: isString, metadata: isJsonObject };
const source = shape({}, sourceFields);
const instance = shape({ baseItemId: nullableId, existingPowers: arrayOf(tier) }, {
  instanceId: isString, displayName: isString, level: isNonnegativeInteger,
  rarity: isString, provenance: source, metadata: isJsonObject,
});
const item = either(shape({ kind: literal('database'), itemId: isNonemptyString }), either(
  shape({ kind: literal('manual'), instance }), shape({ kind: literal('imported'), instance }),
));
const outcomeCounts = shape({
  allDirectDamagePercent: isNonnegativeInteger, skillDamageFlat: isNonnegativeInteger,
  allDirectDamageFlat: isNonnegativeInteger, skillDamagePercent: isNonnegativeInteger,
  skillBaseDamagePercent: isNonnegativeInteger,
});
const sparks = either(shape({ mode: literal('none') }), either(
  shape({
    mode: literal('simulated'),
    input: shape({ category: literal('skill-damage'), skillId: isNonemptyString, count: isNonnegativeInteger, seed: isString }),
  }, { result: shape({ modelVersion: isNonemptyString, outcomeCounts }) }),
  shape({ mode: literal('actual'), category: literal('skill-damage'), skillId: isNonemptyString, outcomeCounts }),
));
const targetDamageType = shape({}, { resistance: isFiniteNumber, vulnerability: isFiniteNumber, metadata: isJsonObject });
const buildV1: Guard<BuildDocument> = shape({
  schemaVersion: literal(BUILD_SCHEMA_VERSION), gameDataVersion: isNonemptyString,
  title: isString, notes: isString, skillSlotA: skillSlot, skillSlotB: skillSlot,
  abilityBarA: arrayOf(ability), abilityBarB: arrayOf(ability),
  equipment: arrayOf(shape({ slot: isNonemptyString, item, candidateMods: arrayOf(candidate), sparks })),
  target: shape({ count: isPositiveInteger, damageTypes: recordOf(targetDamageType) }, { metadata: isJsonObject }),
}, {
  createdWithAppVersion: isNonemptyString,
  characterImport: shape({}, { ...sourceFields, characterName: isString, server: isString }),
});

export type DataFailure =
  | { ok: false; reason: 'invalid-data' | 'invalid-json' }
  | { ok: false; reason: 'unsupported-version'; schemaVersion: number };
export type DataResult<T> = { ok: true; value: T } | DataFailure;

/** No implicit migrations. Add an explicit version dispatch when one is needed. */
export function validateVersioned<T>(value: unknown, version: number, guard: Guard<T>): DataResult<T> {
  try {
    if (isRecord(value) && isNonnegativeInteger(value.schemaVersion) && value.schemaVersion !== version) {
      return { ok: false, reason: 'unsupported-version', schemaVersion: value.schemaVersion };
    }
    return isJsonValue(value) && guard(value)
      ? { ok: true, value } : { ok: false, reason: 'invalid-data' };
  } catch { return { ok: false, reason: 'invalid-data' }; }
}

export function validateBuildDocument(value: unknown): DataResult<BuildDocument> {
  return validateVersioned(value, BUILD_SCHEMA_VERSION, buildV1);
}

export function parseJson<T>(json: string, validate: (value: unknown) => DataResult<T>): DataResult<T> {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return { ok: false, reason: 'invalid-json' }; }
  return validate(value);
}

export function deserializeBuildDocument(json: string): DataResult<BuildDocument> {
  return parseJson(json, validateBuildDocument);
}

export function serializeBuildDocument(build: BuildDocument): DataResult<string> {
  const result = validateBuildDocument(build);
  if (!result.ok) return result;
  try { return { ok: true, value: JSON.stringify(result.value) }; }
  catch { return { ok: false, reason: 'invalid-data' }; }
}

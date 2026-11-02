import type { JsonObject, JsonValue } from '../../data/normalized/progression';
import type {
  ImportIssue, ImportReferenceResolver, ImportResult, ImportedReference,
  ImportedReportMetadata, ReportType, SourceIdentifier,
} from './contracts';

class InvalidReport extends Error {
  constructor(readonly issue: ImportIssue) { super(issue.message); }
}

export function fail(code: ImportIssue['code'], path: string, message: string): never {
  throw new InvalidReport({ severity: 'error', code, path, message });
}

export function pointer(path: string, key: string | number): string {
  return `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

/** Detached JSON copy; reject cycles, accessors, nonfinite numbers and classes. */
function jsonCopy(value: unknown, path = '', ancestors = new Set<object>(), depth = 0): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || depth > 100 || ancestors.has(value)) {
    return fail('invalid-json-value', path, 'Expected finite, acyclic JSON data (maximum nesting 100).');
  }
  if ((!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) ||
    Object.getOwnPropertySymbols(value).length) {
    return fail('invalid-json-value', path, 'Expected a plain JSON object or array.');
  }
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy = (key: string): JsonValue => {
    const property = descriptors[key];
    if (!property || !('value' in property)) return fail('invalid-json-value', pointer(path, key), 'JSON accessors and sparse arrays are unsupported.');
    return jsonCopy(property.value, pointer(path, key), ancestors, depth + 1);
  };
  const result = Array.isArray(value)
    ? Array.from({ length: value.length }, (_, index) => copy(String(index)))
    : Object.fromEntries(Object.keys(value).map(key => [key, copy(key)]));
  ancestors.delete(value);
  return result;
}

export function object(value: JsonValue | undefined, path: string): JsonObject {
  if (value === undefined) return fail('missing-field', path, 'Required object is missing.');
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('unsupported-structure', path, 'Expected an object.');
  }
  return value;
}

export function array(value: JsonValue | undefined, path: string): JsonValue[] {
  if (value === undefined) return fail('missing-field', path, 'Required array is missing.');
  if (!Array.isArray(value)) return fail('unsupported-structure', path, 'Expected an array.');
  return value;
}

export function textField(row: JsonObject, key: string, path: string, required = false): string | null {
  const value = Object.hasOwn(row, key) ? row[key] : undefined;
  if (value === undefined && !required) return null;
  if (value === undefined) return fail('missing-field', pointer(path, key), 'Required string is missing.');
  if (typeof value !== 'string' || (required && !value.trim())) {
    return fail('invalid-field-type', pointer(path, key), 'Expected a string, nonempty when required.');
  }
  return value;
}

export function numberField(row: JsonObject, key: string, path: string, required = false, integer = false): number | null {
  const value = Object.hasOwn(row, key) ? row[key] : undefined;
  if (value === undefined && !required) return null;
  if (value === undefined) return fail('missing-field', pointer(path, key), 'Required number is missing.');
  if (typeof value !== 'number' || value < 0 || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value))) {
    return fail('invalid-field-type', pointer(path, key), integer ? 'Expected a nonnegative safe integer.' : 'Expected a nonnegative finite number.');
  }
  return value;
}

export function identifier(value: JsonValue | undefined): value is SourceIdentifier {
  return typeof value === 'string' ? value.trim().length > 0
    : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function omit(row: JsonObject, keys: string[]): JsonObject {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
}

export function warning(warnings: ImportIssue[], code: ImportIssue['code'], path: string, message: string): void {
  warnings.push({ severity: 'warning', code, path, message });
}

export function reference(
  sourceId: SourceIdentifier, resolve: ((id: SourceIdentifier) => string | null) | undefined,
  path: string, warnings: ImportIssue[],
): ImportedReference {
  const id = resolve?.(sourceId) ?? null;
  if (resolve && id === null) warning(warnings, 'unresolved-reference', path, 'Source reference was not resolved in the selected official dataset.');
  return { sourceId, id, status: !resolve ? 'not-checked' : id === null ? 'unresolved' : 'resolved' };
}

export function reportMetadata(
  row: JsonObject, report: ReportType, resolver: ImportReferenceResolver | undefined, warnings: ImportIssue[],
): ImportedReportMetadata {
  const actual = textField(row, 'Report', '', true);
  if (actual !== report) fail('wrong-report-type', '/Report', `Expected a ${report} report.`);
  const characterName = textField(row, 'Character', '', true)!;
  const exportedAt = textField(row, 'Timestamp', '', true)!;
  if (!Number.isFinite(Date.parse(exportedAt))) warning(warnings, 'unverified-timestamp', '/Timestamp', 'Timestamp retained verbatim; its date format is unverified.');
  if (!Object.hasOwn(row, 'ReportVersion')) fail('missing-field', '/ReportVersion', 'Report version is missing.');
  const version = row.ReportVersion;
  if (!identifier(version)) fail('invalid-field-type', '/ReportVersion', 'Expected a nonnegative integer or nonempty version string.');
  return {
    report, characterName, server: textField(row, 'ServerName', ''), exportedAt,
    sourceReportVersion: version, reportVersion: String(version),
    resolvedWithGameDataVersion: resolver?.gameDataVersion ?? null,
    metadata: omit(row, report === 'CharacterSheet' ? ['Skills', 'CurrentStats'] : ['Items']),
  };
}

/** Atomic for malformed primary structure; optional opaque data uses warnings. */
export function parseInput<T>(input: unknown, parse: (row: JsonObject, warnings: ImportIssue[]) => T): ImportResult<T> {
  const warnings: ImportIssue[] = [];
  try {
    return { ok: true, value: parse(object(jsonCopy(input), ''), warnings), warnings };
  } catch (error) {
    if (!(error instanceof InvalidReport)) throw error;
    return { ok: false, errors: [error.issue], warnings };
  }
}

export function parseText<T>(text: string, parse: (input: unknown) => ImportResult<T>): ImportResult<T> {
  let input: unknown;
  try { input = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { return { ok: false, errors: [{ severity: 'error', code: 'invalid-json', path: '', message: 'The file is not valid JSON.' }], warnings: [] }; }
  return parse(input);
}

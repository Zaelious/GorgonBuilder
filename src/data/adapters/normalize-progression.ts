import { isObject } from './official-source';
import type {
  DatasetSource, IntegrityIssue, JsonObject, JsonValue, LevelProgression,
  NormalizedProgressionData, ProgressionDatasetName, RecordSource,
} from '../normalized/progression';

export interface ProgressionInput {
  readonly sources: Readonly<Record<ProgressionDatasetName, DatasetSource>>;
  readonly skills: unknown;
  readonly advancementtables: unknown;
  readonly attributes: unknown;
  readonly effects: unknown;
}

export class NormalizationError extends Error {
  constructor(readonly path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = 'NormalizationError';
  }
}
function fail(path: string, detail: string): never { throw new NormalizationError(path, detail); }

// Canonical copies make ordering independent of input insertion order, without
// sharing mutable raw objects with the caller. Reject non-JSON values explicitly.
function json(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((v, i) => json(v, `${path}[${i}]`));
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, json(value[k], `${path}.${k}`)]));
  return fail(path, 'expected a finite JSON value');
}
function object(value: unknown, path: string): JsonObject {
  if (!isObject(value)) return fail(path, 'expected an object');
  return json(value, path) as JsonObject;
}
function text(value: JsonValue | undefined, path: string): string {
  if (typeof value !== 'string' || !value.trim()) return fail(path, 'expected a nonempty string');
  return value;
}
function stringValue(value: JsonValue | undefined, path: string): string {
  if (typeof value !== 'string') return fail(path, 'expected a string');
  return value;
}
function optionalString(row: JsonObject, key: string, path: string): string | null {
  return row[key] === undefined ? null : stringValue(row[key], `${path}.${key}`);
}
function optionalText(row: JsonObject, key: string, path: string): string | null {
  return row[key] === undefined ? null : text(row[key], `${path}.${key}`);
}
function number(value: JsonValue | undefined, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'expected a finite number');
  return value;
}
function strings(value: JsonValue | undefined, path: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return fail(path, 'expected a string array');
  return value as string[];
}
function optionalMap<T>(row: JsonObject, key: string, path: string, parse: (value: JsonValue, path: string) => T): Record<string, T> | null {
  if (row[key] === undefined) return null;
  return Object.fromEntries(Object.entries(object(row[key], `${path}.${key}`))
    .map(([id, value]) => [id, parse(value, `${path}.${key}.${id}`)]));
}
function rows(input: unknown, dataset: string): [string, JsonObject][] {
  const data = object(input, dataset);
  return Object.entries(data).map(([id, value]) => {
    text(id, dataset);
    return [id, object(value, `${dataset}.${id}`)];
  });
}
function unique(seen: Set<string>, id: string, path: string): void {
  if (seen.has(id)) fail(path, `duplicate or conflicting identifier ${id}`);
  seen.add(id);
}

export function normalizeProgression(input: ProgressionInput): NormalizedProgressionData {
  const sources = structuredClone(input.sources);
  const versions = new Set(Object.values(sources).map((s) => s.gameDataVersion));
  if (versions.size !== 1) fail('sources', 'datasets must belong to one game-data version');
  for (const dataset of ['skills', 'advancementtables', 'attributes', 'effects'] as const) {
    const source = sources[dataset];
    if (!source || source.dataset !== dataset) fail(`sources.${dataset}`, 'missing or conflicting dataset provenance');
    text(source.gameDataVersion, `sources.${dataset}.gameDataVersion`);
    text(source.sourceUrl, `sources.${dataset}.sourceUrl`);
    if (!/^[a-f0-9]{64}$/.test(source.sha256)) fail(`sources.${dataset}.sha256`, 'expected SHA-256');
  }
  const source = (dataset: ProgressionDatasetName, recordId: string): RecordSource => ({ ...sources[dataset], recordId });
  const attributes = rows(input.attributes, 'attributes').map(([id, raw]) => ({
    id, source: source('attributes', id), raw,
    label: optionalString(raw, 'Label', `attributes.${id}`),
    tooltip: optionalString(raw, 'Tooltip', `attributes.${id}`),
    displayRule: text(raw.DisplayRule, `attributes.${id}.DisplayRule`),
    displayType: text(raw.DisplayType, `attributes.${id}.DisplayType`),
    defaultValue: raw.DefaultValue,
  }));
  const attributeIds = new Set(attributes.map((a) => a.id));
  const integrityIssues: IntegrityIssue[] = [];
  function progression(raw: JsonObject, owner: string, table: boolean): LevelProgression[] {
    const seen = new Set<string>();
    return Object.entries(raw).filter(([key]) => !table || key !== 'Keywords').map(([key, value]) => {
      const match = (table ? /^Level_([0-9]+)$/ : /^([0-9]+)(?:_(.+))?$/).exec(key);
      const level = match ? Number(match[1]) : NaN;
      if (!Number.isSafeInteger(level) || level < 0) fail(`${owner}.${key}`, 'expected a nonnegative level key');
      const sourceQualifier = table ? null : match?.[2] ?? null;
      unique(seen, `${level}${sourceQualifier === null ? '' : `_${sourceQualifier}`}`, `${owner}.${key}`);
      const record = object(value, `${owner}.${key}`);
      return {
        level, sourceQualifier, sourceLevelKey: key, raw: record,
        rewards: Object.entries(record).map(([id, value]) => {
          const status = attributeIds.has(id) ? 'resolved' : 'missing';
          if (table && status === 'missing') integrityIssues.push({
            code: 'missing-attribute', tableId: owner.slice('advancementtables.'.length),
            sourceLevelKey: key, rewardId: id,
            message: `${owner}.${key}.${id}: unresolved attribute ${id}; reward retained uninterpreted`,
          });
          return { id, value, interpretation: 'uninterpreted' as const,
            attributeReference: table ? { id, status: status as 'resolved' | 'missing' } : null };
        }),
      };
    }).sort((a, b) => a.level - b.level);
  }
  const tableNames = new Map<string, string>();
  const numericTableIds = new Set<string>();
  const advancementTables = rows(input.advancementtables, 'advancementtables').map(([id, raw]) => {
    const match = /^([0-9]+)_(.+)$/.exec(id);
    if (!match) return fail(`advancementtables.${id}`, 'expected official numeric-prefix_name identifier');
    const numericId = match[1]!;
    const name = match[2]!;
    // Names are official skill references; never conflate them with full table IDs.
    if (tableNames.has(name)) fail(`advancementtables.${id}`, `conflicting advancement name ${name}`);
    unique(numericTableIds, numericId, `advancementtables.${id}`);
    tableNames.set(name, id);
    return { id, sourceName: name, officialNumericId: numericId, raw, source: source('advancementtables', id),
      keywords: raw.Keywords === undefined ? null : strings(raw.Keywords, `advancementtables.${id}.Keywords`),
      progression: progression(raw, `advancementtables.${id}`, true), interpretation: 'uninterpreted' as const };
  });
  const skillIds = new Set<string>();
  const skills = rows(input.skills, 'skills').map(([id, raw]) => {
    const path = `skills.${id}`;
    const officialNumericId = number(raw.Id, `${path}.Id`);
    if (!Number.isSafeInteger(officialNumericId) || officialNumericId < 0) fail(`${path}.Id`, 'expected a nonnegative integer');
    unique(skillIds, String(officialNumericId), `${path}.Id`);
    if (typeof raw.Combat !== 'boolean') fail(`${path}.Combat`, 'expected a boolean');
    const reference = (field: string) => {
      const name = optionalText(raw, field, path);
      if (name === null) return null;
      const tableId = tableNames.get(name);
      if (!tableId) return fail(`${path}.${field}`, `unresolved advancement-table reference ${name}`);
      return { sourceName: name, tableId };
    };
    if (typeof raw.Description !== 'string') fail(`${path}.Description`, 'expected a string');
    return { id, officialNumericId, name: optionalString(raw, 'Name', path), description: raw.Description,
      combat: raw.Combat, guestLevelCap: number(raw.GuestLevelCap, `${path}.GuestLevelCap`),
      maxBonusLevels: number(raw.MaxBonusLevels, `${path}.MaxBonusLevels`),
      xpTable: text(raw.XpTable, `${path}.XpTable`),
      advancementHints: optionalMap(raw, 'AdvancementHints', path, stringValue),
      interactionFlagLevelCaps: optionalMap(raw, 'InteractionFlagLevelCaps', path, number),
      xpEarnedAttributes: raw.XpEarnedAttributes === undefined ? null : strings(raw.XpEarnedAttributes, `${path}.XpEarnedAttributes`).map((attributeId) => {
        const status = attributeIds.has(attributeId) ? 'resolved' as const : 'missing' as const;
        if (status === 'missing') integrityIssues.push({ code: 'missing-xp-attribute', skillId: id, attributeId,
          message: `${path}.XpEarnedAttributes: unresolved attribute ${attributeId}` });
        return { id: attributeId, status };
      }),
      activeAdvancement: reference('ActiveAdvancementTable'), passiveAdvancement: reference('PassiveAdvancementTable'),
      progression: progression(object(raw.Rewards, `${path}.Rewards`), `${path}.Rewards`, false),
      raw, source: source('skills', id) };
  });
  const effects = rows(input.effects, 'effects').map(([id, raw]) => {
    const path = `effects.${id}`;
    if (!/^effect_[0-9]+$/.test(id)) fail(path, 'expected official effect identifier');
    if (typeof raw.Desc !== 'string') fail(`${path}.Desc`, 'expected a string');
    return { id, name: stringValue(raw.Name, `${path}.Name`), description: raw.Desc,
      keywords: strings(raw.Keywords, `${path}.Keywords`),
      abilityKeywords: raw.AbilityKeywords === undefined ? null : strings(raw.AbilityKeywords, `${path}.AbilityKeywords`),
      duration: raw.Duration === undefined ? null : typeof raw.Duration === 'string' ? raw.Duration : number(raw.Duration, `${path}.Duration`),
      displayMode: text(raw.DisplayMode, `${path}.DisplayMode`), iconId: number(raw.IconId, `${path}.IconId`),
      raw, source: source('effects', id) };
  });
  return { schemaVersion: 1, gameDataVersion: sources.skills.gameDataVersion, sources,
    skills, advancementTables, attributes, effects, integrityIssues };
}

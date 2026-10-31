import { isObject } from './official-source';
import { NormalizationError } from './normalize-progression';
import type { JsonObject, JsonValue, NormalizedProgressionData } from '../normalized/progression';
import type {
  AbilityConditions, AbilityDatasetName, AbilityDatasetSource, AbilityDot, AbilityIntegrityIssue,
  AbilityRecordSource, AbilityReference, AbilitySpecialValue, EffectKeywordReference,
  NormalizedAbilityData, SkillReference,
} from '../normalized/abilities';

export interface AbilityInput {
  readonly sources: Readonly<Record<AbilityDatasetName, AbilityDatasetSource>>;
  /** Reuse T0003 definitions; do not reinterpret raw skill/effect names here. */
  readonly progression: Pick<NormalizedProgressionData, 'gameDataVersion' | 'skills' | 'effects'>;
  readonly abilities: unknown;
  readonly abilitykeywords: unknown;
  readonly abilitydynamicdots: unknown;
  readonly abilitydynamicspecialvalues: unknown;
  readonly sources_abilities: unknown;
}
const datasets = ['abilities', 'abilitykeywords', 'abilitydynamicdots',
  'abilitydynamicspecialvalues', 'sources_abilities'] as const;
function fail(path: string, detail: string): never { throw new NormalizationError(path, detail); }
function json(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((v, i) => json(v, `${path}[${i}]`));
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, json(value[k], `${path}.${k}`)]));
  return fail(path, 'expected a finite JSON value');
}
function object(value: unknown, path: string): JsonObject {
  if (!isObject(value)) return fail(path, 'expected an object');
  return json(value, path) as JsonObject;
}
function string(value: JsonValue | undefined, path: string): string {
  if (typeof value !== 'string') return fail(path, 'expected a string');
  return value;
}
function text(value: JsonValue | undefined, path: string): string {
  const result = string(value, path);
  if (!result.trim()) fail(path, 'expected a nonempty string');
  return result;
}
function number(value: JsonValue | undefined, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'expected a finite number');
  return value;
}
function boolean(value: JsonValue | undefined, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'expected a boolean');
  return value;
}
function strings(value: JsonValue | undefined, path: string): string[] {
  if (!Array.isArray(value)) return fail(path, 'expected a string array');
  return value.map((v, i) => text(v, `${path}[${i}]`));
}
function optional<T>(row: JsonObject, key: string, path: string,
  parse: (value: JsonValue, path: string) => T): T | null {
  return row[key] === undefined ? null : parse(row[key], `${path}.${key}`);
}
function rows(value: unknown, path: string): [string, JsonObject][] {
  return Object.entries(object(value, path)).map(([id, raw]) => [id, object(raw, `${path}.${id}`)]);
}
function arrayRows(value: unknown, path: string): JsonObject[] {
  if (!Array.isArray(value)) return fail(path, 'expected an object array');
  return value.map((v, i) => object(v, `${path}[${i}]`));
}
function hooks(raw: JsonObject, path: string): Record<string, readonly string[]> {
  // Only the published attribute hook naming families; future fields stay raw.
  return Object.fromEntries(Object.entries(raw).filter(([key]) => /^AttributesThat(?:Delta|Mod)/.test(key))
    .map(([key, value]) => [key, strings(value, `${path}.${key}`)]));
}
function unique(seen: Set<string>, id: string, path: string): void {
  if (seen.has(id)) fail(path, `duplicate or conflicting identifier ${id}`);
  seen.add(id);
}
function abilityId(id: string, path: string): string {
  if (!/^ability_(0|[1-9][0-9]*)$/.test(id)) fail(path, 'expected canonical official ability identifier');
  return id;
}

export function normalizeAbilities(input: AbilityInput): NormalizedAbilityData {
  const sources = {} as Record<AbilityDatasetName, AbilityDatasetSource>;
  for (const dataset of datasets) {
    const s = input.sources[dataset];
    const path = `sources.${dataset}`;
    if (!s || s.dataset !== dataset) fail(path, 'missing or conflicting dataset provenance');
    const gameDataVersion = text(s.gameDataVersion, `${path}.gameDataVersion`);
    if (gameDataVersion !== input.progression.gameDataVersion) fail(path, 'datasets must belong to one game-data version, including T0003 references');
    sources[dataset] = { dataset, gameDataVersion, sourceUrl: text(s.sourceUrl, `${path}.sourceUrl`),
      sha256: text(s.sha256, `${path}.sha256`) };
    if (!/^[a-f0-9]{64}$/.test(s.sha256)) fail(`${path}.sha256`, 'expected SHA-256');
  }
  const source = (dataset: AbilityDatasetName, recordId: string): AbilityRecordSource => ({ ...sources[dataset], recordId });
  const integrityIssues: AbilityIntegrityIssue[] = [];
  function issue(code: AbilityIntegrityIssue['code'], path: string, reference: string): void {
    integrityIssues.push({ code, path, reference,
      message: `${path}: ${code} reference ${reference}; source retained uninterpreted` });
  }
  const skillIds = new Set<string>();
  const effectIds = new Set<string>();
  const effectsByKeyword = new Map<string, string[]>();
  for (const [dataset, records] of [['skills', input.progression.skills], ['effects', input.progression.effects]] as const) {
    for (const record of records) {
      const path = `progression.${dataset}.${record.id}`;
      text(record.id, path);
      if (record.source.dataset !== dataset || record.source.recordId !== record.id ||
        record.source.gameDataVersion !== input.progression.gameDataVersion) {
        fail(path, 'conflicting T0003 record provenance or game-data version');
      }
      unique(dataset === 'skills' ? skillIds : effectIds, record.id, path);
    }
  }
  // A keyword may identify multiple definitions. Retain all exact matches.
  for (const effect of input.progression.effects) {
    for (const keyword of new Set(effect.keywords)) {
      const ids = effectsByKeyword.get(keyword) ?? [];
      ids.push(effect.id);
      effectsByKeyword.set(keyword, ids);
    }
  }
  for (const ids of effectsByKeyword.values()) ids.sort();
  function skillRef(value: JsonValue | undefined, path: string): SkillReference {
    const sourceId = text(value, path);
    const resolved = skillIds.has(sourceId);
    if (!resolved) issue('missing-skill', path, sourceId);
    return { sourceId, skillId: resolved ? sourceId : null, status: resolved ? 'resolved' : 'missing' };
  }
  function effectRef(value: JsonValue, path: string): EffectKeywordReference {
    const keyword = text(value, path);
    const ids = [...(effectsByKeyword.get(keyword) ?? [])];
    if (!ids.length) issue('missing-effect-keyword', path, keyword);
    return { keyword, effectIds: ids, status: ids.length ? 'resolved' : 'missing', interpretation: 'keyword-membership-only' };
  }
  function conditions(raw: JsonObject, path: string, keywordRule = false): AbilityConditions {
    const requiredKey = keywordRule ? 'MustHaveAbilityKeywords' : 'ReqAbilityKeywords';
    const skillKey = keywordRule ? 'MustHaveActiveSkill' : 'ReqActiveSkill';
    const effectsKey = keywordRule ? 'MustHaveEffectKeywords' : 'ReqEffectKeywords';
    return {
      requiredAbilityKeywords: keywordRule ? strings(raw[requiredKey], `${path}.${requiredKey}`) : optional(raw, requiredKey, path, strings),
      excludedAbilityKeywords: keywordRule ? optional(raw, 'MustNotHaveAbilityKeywords', path, strings) : null,
      requiredActiveSkill: optional(raw, skillKey, path, skillRef),
      requiredEffectKeywords: optional(raw, effectsKey, path, (v, p) => strings(v, p).map((k, i) => effectRef(k, `${p}[${i}]`))),
    };
  }
  function dot(raw: JsonObject, path: string, recordSource: AbilityRecordSource, sourceIndex: number,
    ownerAbilityId: string | null): AbilityDot {
    return { source: recordSource, sourceIndex, ownerAbilityId, raw,
      damagePerTick: number(raw.DamagePerTick, `${path}.DamagePerTick`),
      damageType: text(raw.DamageType, `${path}.DamageType`), duration: number(raw.Duration, `${path}.Duration`),
      numTicks: number(raw.NumTicks, `${path}.NumTicks`), preface: optional(raw, 'Preface', path, string),
      specialRules: optional(raw, 'SpecialRules', path, strings), conditions: conditions(raw, path),
      attributeHooks: hooks(raw, path), interpretation: 'uninterpreted' };
  }
  function special(raw: JsonObject, path: string, recordSource: AbilityRecordSource, sourceIndex: number,
    ownerAbilityId: string | null): AbilitySpecialValue {
    return { source: recordSource, sourceIndex, ownerAbilityId, raw,
      label: string(raw.Label, `${path}.Label`), value: number(raw.Value, `${path}.Value`),
      suffix: optional(raw, 'Suffix', path, string), displayType: optional(raw, 'DisplayType', path, string),
      skipIfZero: optional(raw, 'SkipIfZero', path, boolean),
      skipIfThisAttributeIsZero: optional(raw, 'SkipIfThisAttributeIsZero', path, text),
      conditions: conditions(raw, path), attributeHooks: hooks(raw, path), interpretation: 'uninterpreted' };
  }
  const abilityRows = rows(input.abilities, 'abilities');
  const names = new Map<string, string>();
  for (const [id, raw] of abilityRows) {
    abilityId(id, `abilities.${id}`);
    const name = text(raw.InternalName, `abilities.${id}.InternalName`);
    if (names.has(name)) fail(`abilities.${id}.InternalName`, `duplicate or conflicting internal name ${name}`);
    names.set(name, id);
  }
  function abilityRef(value: JsonValue, path: string): AbilityReference {
    const internalName = text(value, path);
    const id = names.get(internalName) ?? null;
    if (id === null) issue('missing-ability', path, internalName);
    return { internalName, abilityId: id, status: id === null ? 'missing' : 'resolved' };
  }
  const keywordRules = arrayRows(input.abilitykeywords, 'abilitykeywords').map((raw, sourceIndex) => {
    const path = `abilitykeywords[${sourceIndex}]`;
    return { source: source('abilitykeywords', String(sourceIndex)), sourceIndex, raw,
      conditions: conditions(raw, path, true), attributeHooks: hooks(raw, path), interpretation: 'uninterpreted' as const };
  });
  const dynamicDots = arrayRows(input.abilitydynamicdots, 'abilitydynamicdots').map((raw, i) =>
    dot(raw, `abilitydynamicdots[${i}]`, source('abilitydynamicdots', String(i)), i, null));
  const dynamicSpecialValues = arrayRows(input.abilitydynamicspecialvalues, 'abilitydynamicspecialvalues').map((raw, i) =>
    special(raw, `abilitydynamicspecialvalues[${i}]`, source('abilitydynamicspecialvalues', String(i)), i, null));
  const ids = new Set(abilityRows.map(([id]) => id));
  const acquisitionSources = rows(input.sources_abilities, 'sources_abilities').map(([id, raw]) => {
    const path = `sources_abilities.${id}`;
    abilityId(id, path);
    const resolved = ids.has(id);
    if (!resolved) issue('missing-ability', path, id);
    return { source: source('sources_abilities', id), raw, abilityId: id,
      abilityReference: { abilityId: id, status: resolved ? 'resolved' as const : 'missing' as const },
      entries: arrayRows(raw.entries, `${path}.entries`), interpretation: 'uninterpreted' as const };
  });
  const acquisitionIds = new Set(acquisitionSources.map((r) => r.abilityId));
  const abilities = abilityRows.map(([id, raw]) => {
    const path = `abilities.${id}`;
    const pve = object(raw.PvE, `${path}.PvE`);
    const keywords = optional(raw, 'Keywords', path, strings);
    const conditionalKeywords = optional(raw, 'ConditionalKeywords', path, (value, p) => arrayRows(value, p).map((r, i) => ({
      keyword: text(r.Keyword, `${p}[${i}].Keyword`), default: optional(r, 'Default', `${p}[${i}]`, boolean),
      effectKeywordMustExist: optional(r, 'EffectKeywordMustExist', `${p}[${i}]`, effectRef),
      effectKeywordMustNotExist: optional(r, 'EffectKeywordMustNotExist', `${p}[${i}]`, effectRef),
      interpretation: 'uninterpreted' as const, raw: r,
    })));
    const staticKeywords = new Set(keywords ?? []);
    const conditional = new Set(conditionalKeywords?.map((k) => k.keyword) ?? []);
    const potentialKeywords = new Set([...staticKeywords, ...conditional]);
    const keywordRuleCandidates = keywordRules.filter((r) =>
      r.conditions.requiredAbilityKeywords?.every((k) => potentialKeywords.has(k)) &&
      !(r.conditions.excludedAbilityKeywords ?? []).some((k) => staticKeywords.has(k) && !conditional.has(k)),
    ).map((r) => ({ sourceRecordId: r.source.recordId,
      keywordMatch: [...(r.conditions.requiredAbilityKeywords ?? []), ...(r.conditions.excludedAbilityKeywords ?? [])]
        .some((k) => conditional.has(k)) ? 'conditional' as const : 'static' as const,
      applicability: 'unevaluated' as const }));
    const effectKeywordConstraints = ['EffectKeywordReqs', 'EffectKeywordsIndicatingEnabled'].flatMap((key) =>
      (optional(raw, key, path, strings) ?? []).map((k, i) => ({ ...effectRef(k, `${path}.${key}[${i}]`), sourcePath: `${key}[${i}]` })),
    );
    if (raw.TargetEffectKeywordReq !== undefined) effectKeywordConstraints.push({
      ...effectRef(raw.TargetEffectKeywordReq, `${path}.TargetEffectKeywordReq`), sourcePath: 'TargetEffectKeywordReq',
    });
    const level = number(raw.Level, `${path}.Level`);
    if (!Number.isSafeInteger(level) || level < 0) fail(`${path}.Level`, 'expected a nonnegative integer');
    const rank = optional(raw, 'Rank', path, (v, p) => typeof v === 'string' ? string(v, p) : number(v, p));
    return { id, internalName: text(raw.InternalName, `${path}.InternalName`),
      displayName: string(raw.Name, `${path}.Name`), description: string(raw.Description, `${path}.Description`),
      skill: skillRef(raw.Skill, `${path}.Skill`), level, rank,
      upgradeOf: optional(raw, 'UpgradeOf', path, abilityRef), prerequisite: optional(raw, 'Prerequisite', path, abilityRef),
      damage: { damageType: text(raw.DamageType, `${path}.DamageType`),
        damage: optional(pve, 'Damage', `${path}.PvE`, number),
        healthSpecificDamage: optional(pve, 'HealthSpecificDamage', `${path}.PvE`, number),
        armorSpecificDamage: optional(pve, 'ArmorSpecificDamage', `${path}.PvE`, number),
        extraDamageIfTargetVulnerable: optional(pve, 'ExtraDamageIfTargetVulnerable', `${path}.PvE`, number),
        critDamageMod: optional(pve, 'CritDamageMod', `${path}.PvE`, number),
        armorMitigationRatio: optional(pve, 'ArmorMitigationRatio', `${path}.PvE`, number) },
      timing: { resetTime: number(raw.ResetTime, `${path}.ResetTime`),
        sharesResetTimerWith: optional(raw, 'SharesResetTimerWith', path, abilityRef),
        resetTimeIsOnlineOnly: optional(raw, 'ResetTimeIsOnlineOnly', path, boolean),
        isTimerResetWhenDisabling: optional(raw, 'IsTimerResetWhenDisabling', path, boolean),
        delayLoopTime: optional(raw, 'DelayLoopTime', path, number), delayLoopMessage: optional(raw, 'DelayLoopMessage', path, string),
        delayLoopIsAbortedIfAttacked: optional(raw, 'DelayLoopIsAbortedIfAttacked', path, boolean),
        delayLoopIsOnlyUsedInCombat: optional(raw, 'DelayLoopIsOnlyUsedInCombat', path, boolean) },
      targeting: { target: text(raw.Target, `${path}.Target`), range: number(pve.Range, `${path}.PvE.Range`),
        aoe: optional(pve, 'AoE', `${path}.PvE`, number), aoeIsCenteredOnCaster: optional(raw, 'AoEIsCenteredOnCaster', path, boolean),
        specialTargetingTypeReq: optional(raw, 'SpecialTargetingTypeReq', path, number),
        targetTypeTagReq: optional(raw, 'TargetTypeTagReq', path, string) },
      keywords, conditionalKeywords, extraKeywordsForTooltips: optional(raw, 'ExtraKeywordsForTooltips', path, strings),
      keywordRuleCandidates, effectKeywordConstraints, attributeHooks: hooks(raw, path),
      pve: { powerCost: number(pve.PowerCost, `${path}.PvE.PowerCost`),
        dots: optional(pve, 'DoTs', `${path}.PvE`, (v, p) => arrayRows(v, p).map((r, i) =>
          dot(r, `${p}[${i}]`, source('abilities', `${id}.PvE.DoTs[${i}]`), i, id))),
        specialValues: optional(pve, 'SpecialValues', `${path}.PvE`, (v, p) => arrayRows(v, p).map((r, i) =>
          special(r, `${p}[${i}]`, source('abilities', `${id}.PvE.SpecialValues[${i}]`), i, id))),
        attributeHooks: hooks(pve, `${path}.PvE`), raw: pve },
      acquisitionSourceRecordId: acquisitionIds.has(id) ? id : null,
      interpretation: 'uninterpreted' as const, source: source('abilities', id), raw };
  });
  return { schemaVersion: 1, gameDataVersion: input.progression.gameDataVersion, sources, abilities,
    keywordRules, dynamicDots, dynamicSpecialValues, acquisitionSources, integrityIssues };
}

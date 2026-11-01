import { isObject } from './official-source';
import { NormalizationError } from './normalize-progression';
import type { JsonObject, JsonValue, NormalizedProgressionData } from '../normalized/progression';
import type { SkillReference } from '../normalized/abilities';
import type {
  ItemTreasureDatasetName, ItemTreasureDatasetSource, ItemTreasureIntegrityIssue,
  ItemTreasureRecordSource, NormalizedItemTreasureData, TreasureSkillAssociation,
} from '../normalized/items-treasure';

export interface ItemTreasureInput {
  readonly sources: Readonly<Record<ItemTreasureDatasetName, ItemTreasureDatasetSource>>;
  readonly progression: Pick<NormalizedProgressionData, 'gameDataVersion' | 'skills'>;
  readonly items: unknown;
  readonly tsysclientinfo: unknown;
  readonly tsysprofiles: unknown;
  readonly sources_items: unknown;
}
const datasets = ['items', 'tsysclientinfo', 'tsysprofiles', 'sources_items'] as const;
function fail(path: string, detail: string): never { throw new NormalizationError(path, detail); }
function json(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((v, i) => json(v, `${path}[${i}]`));
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, json(value[key], `${path}.${key}`)]));
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
function level(value: JsonValue | undefined, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return fail(path, 'expected a nonnegative integer');
  return value;
}
function boolean(value: JsonValue | undefined, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'expected a boolean');
  return value;
}
function strings(value: JsonValue | undefined, path: string): string[] {
  if (!Array.isArray(value)) return fail(path, 'expected a string array');
  return value.map((v, i) => string(v, `${path}[${i}]`));
}
function optional<T>(row: JsonObject, key: string, path: string, parse: (v: JsonValue, p: string) => T): T | null {
  return row[key] === undefined ? null : parse(row[key], `${path}.${key}`);
}
function rows(value: unknown, path: string): [string, JsonObject][] {
  return Object.entries(object(value, path)).map(([id, raw]) => [id, object(raw, `${path}.${id}`)]);
}
function arrayRows(value: JsonValue | undefined, path: string): JsonObject[] {
  if (!Array.isArray(value)) return fail(path, 'expected an object array');
  return value.map((v, i) => object(v, `${path}[${i}]`));
}
function officialId(id: string, prefix: 'item' | 'power' | 'id', path: string): string {
  if (!new RegExp(`^${prefix}_(0|[1-9][0-9]*)$`).test(id)) fail(path, `expected canonical official ${prefix} identifier`);
  return id;
}
function searchText(parts: readonly string[]): string {
  // Retain literal tokens and add their word form (COMBAT_REFRESH -> combat refresh).
  // This is text preparation, not a stat mapping or tooltip interpretation.
  return parts.flatMap((part) => part.includes('_') ? [part, part.replace(/_/g, ' ')] : [part])
    .join(' ').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** Pure source normalization. Callers verify pinned bytes before parsing inputs. */
export function normalizeItemsTreasure(input: ItemTreasureInput): NormalizedItemTreasureData {
  const sources = {} as Record<ItemTreasureDatasetName, ItemTreasureDatasetSource>;
  for (const dataset of datasets) {
    const s = input.sources[dataset];
    const path = `sources.${dataset}`;
    if (!s || s.dataset !== dataset) fail(path, 'missing or conflicting dataset provenance');
    const gameDataVersion = text(s.gameDataVersion, `${path}.gameDataVersion`);
    if (gameDataVersion !== input.progression.gameDataVersion) fail(path, 'datasets must belong to one game-data version, including T0003 references');
    sources[dataset] = { dataset, gameDataVersion, sourceUrl: text(s.sourceUrl, `${path}.sourceUrl`), sha256: text(s.sha256, `${path}.sha256`) };
    if (!/^[a-f0-9]{64}$/.test(s.sha256)) fail(`${path}.sha256`, 'expected SHA-256');
  }
  const source = (dataset: ItemTreasureDatasetName, recordId: string): ItemTreasureRecordSource => ({ ...sources[dataset], recordId });
  const integrityIssues: ItemTreasureIntegrityIssue[] = [];
  function issue(code: ItemTreasureIntegrityIssue['code'], path: string, reference: string): void {
    integrityIssues.push({ code, category: code === 'unsupported-skill-selector' ? 'unsupported-semantics' : 'unresolved-reference',
      path, reference, message: `${path}: ${code} ${reference}; source retained uninterpreted` });
  }
  const skillIds = new Set<string>();
  for (const skill of input.progression.skills) {
    const path = `progression.skills.${skill.id}`;
    text(skill.id, path);
    if (skill.source.dataset !== 'skills' || skill.source.recordId !== skill.id ||
      skill.source.gameDataVersion !== input.progression.gameDataVersion) fail(path, 'conflicting T0003 record provenance or game-data version');
    if (skillIds.has(skill.id)) fail(path, `duplicate or conflicting identifier ${skill.id}`);
    skillIds.add(skill.id);
  }
  function skillRef(value: JsonValue | undefined, path: string): SkillReference {
    const sourceId = text(value, path);
    const resolved = skillIds.has(sourceId);
    if (!resolved) issue('missing-skill', path, sourceId);
    return { sourceId, skillId: resolved ? sourceId : null, status: resolved ? 'resolved' : 'missing' };
  }
  function powerSkill(value: JsonValue | undefined, path: string): TreasureSkillAssociation {
    if (value === 'AnySkill') {
      issue('unsupported-skill-selector', path, value);
      return { sourceId: value, skillId: null, status: 'uninterpreted' };
    }
    return skillRef(value, path);
  }
  const itemRows = rows(input.items, 'items');
  const allItemIds = new Set<string>();
  const equipmentIds = new Set<string>();
  const nonEquipmentItemIds: string[] = [];
  const itemNames = new Set<string>();
  for (const [id, raw] of itemRows) {
    officialId(id, 'item', `items.${id}`);
    allItemIds.add(id);
    // EquipSlot is the source evidence; Equipment keywords omit mount cosmetics.
    if (raw.EquipSlot === undefined) { nonEquipmentItemIds.push(id); continue; }
    text(raw.EquipSlot, `items.${id}.EquipSlot`);
    const name = text(raw.InternalName, `items.${id}.InternalName`);
    if (itemNames.has(name)) fail(`items.${id}.InternalName`, `duplicate or conflicting internal name ${name}`);
    itemNames.add(name);
    equipmentIds.add(id);
  }
  const powerRows = rows(input.tsysclientinfo, 'tsysclientinfo');
  const powerNames = new Map<string, string>();
  for (const [id, raw] of powerRows) {
    officialId(id, 'power', `tsysclientinfo.${id}`);
    const name = text(raw.InternalName, `tsysclientinfo.${id}.InternalName`);
    if (powerNames.has(name)) fail(`tsysclientinfo.${id}.InternalName`, `duplicate or conflicting internal name ${name}`);
    powerNames.set(name, id);
  }
  const treasurePowers = powerRows.map(([id, raw]) => {
    const path = `tsysclientinfo.${id}`;
    const tiers = rows(raw.Tiers, `${path}.Tiers`).map(([tierId, tierRaw]) => {
      const tierPath = `${path}.Tiers.${tierId}`;
      officialId(tierId, 'id', tierPath);
      const descriptions = strings(tierRaw.EffectDescs, `${tierPath}.EffectDescs`);
      return { id: tierId, powerId: id, raw: tierRaw, source: source('tsysclientinfo', `${id}.Tiers.${tierId}`),
        effectDescriptions: descriptions, minLevel: level(tierRaw.MinLevel, `${tierPath}.MinLevel`),
        maxLevel: level(tierRaw.MaxLevel, `${tierPath}.MaxLevel`), minRarity: text(tierRaw.MinRarity, `${tierPath}.MinRarity`),
        skillLevelPrerequisite: level(tierRaw.SkillLevelPrereq, `${tierPath}.SkillLevelPrereq`),
        searchText: searchText(descriptions), interpretation: 'uninterpreted' as const };
    });
    // Canonical key ordering preserves tier IDs (including id_120); no tiers filled in.
    const prefix = optional(raw, 'Prefix', path, string);
    const suffix = optional(raw, 'Suffix', path, string);
    const slots = strings(raw.Slots, `${path}.Slots`).map((v, i) => text(v, `${path}.Slots[${i}]`));
    const skill = powerSkill(raw.Skill, `${path}.Skill`);
    return { id, internalName: text(raw.InternalName, `${path}.InternalName`), raw, source: source('tsysclientinfo', id),
      skill, slots, prefix, suffix, isUnavailable: optional(raw, 'IsUnavailable', path, boolean),
      isHiddenFromTransmutation: optional(raw, 'IsHiddenFromTransmutation', path, boolean), tiers,
      searchText: searchText([string(raw.InternalName, path), skill.sourceId, prefix ?? '', suffix ?? '', ...slots,
        ...tiers.flatMap((t) => t.effectDescriptions)]), interpretation: 'uninterpreted' as const };
  });
  const treasureProfiles = Object.entries(object(input.tsysprofiles, 'tsysprofiles')).map(([id, value]) => {
    text(id, 'tsysprofiles');
    const path = `tsysprofiles.${id}`;
    const raw = strings(value, path);
    const powers = raw.map((name, i) => {
      text(name, `${path}[${i}]`);
      const powerId = powerNames.get(name) ?? null;
      if (powerId === null) issue('missing-power', `${path}[${i}]`, name);
      return { internalName: name, powerId, status: powerId === null ? 'missing' as const : 'resolved' as const };
    });
    return { id, raw, source: source('tsysprofiles', id), powers, interpretation: 'membership-only' as const };
  });
  const profileIds = new Set(treasureProfiles.map((p) => p.id));
  const acquisitionSources = rows(input.sources_items, 'sources_items').map(([id, raw]) => {
    const path = `sources_items.${id}`;
    officialId(id, 'item', path);
    const resolved = allItemIds.has(id);
    if (!resolved) issue('missing-item', path, id);
    return { itemId: id, raw, source: source('sources_items', id),
      itemReference: { status: resolved ? 'resolved' as const : 'missing' as const,
        equipmentItemId: equipmentIds.has(id) ? id : null },
      entries: arrayRows(raw.entries, `${path}.entries`), interpretation: 'uninterpreted' as const };
  });
  const acquisitionIds = new Set(acquisitionSources.map((s) => s.itemId));
  const items = itemRows.filter(([id]) => equipmentIds.has(id)).map(([id, raw]) => {
    const path = `items.${id}`;
    const profileId = optional(raw, 'TSysProfile', path, text);
    const profileResolved = profileId !== null && profileIds.has(profileId);
    if (profileId !== null && !profileResolved) issue('missing-profile', `${path}.TSysProfile`, profileId);
    const descriptions = optional(raw, 'EffectDescs', path, strings);
    const fixedEffects = descriptions?.map((description, i) => ({ description,
      source: source('items', `${id}.EffectDescs[${i}]`), interpretation: 'uninterpreted' as const })) ?? null;
    const skillRequirements = optional(raw, 'SkillReqs', path, (v, p) => Object.entries(object(v, p))
      .map(([skill, value]) => ({ skill: skillRef(skill, `${p}.${skill}`), level: level(value, `${p}.${skill}`) })));
    const itemLevel = optional(raw, 'CraftingTargetLevel', path, level);
    const internalName = text(raw.InternalName, `${path}.InternalName`);
    const displayName = string(raw.Name, `${path}.Name`);
    const description = string(raw.Description, `${path}.Description`);
    const keywords = optional(raw, 'Keywords', path, strings);
    return { id, internalName, displayName, iconId: optional(raw, 'IconId', path, level), description, level: itemLevel,
      levelSource: itemLevel === null ? null : 'CraftingTargetLevel' as const,
      slot: text(raw.EquipSlot, `${path}.EquipSlot`), keywords, fixedEffects,
      behaviors: optional(raw, 'Behaviors', path, arrayRows), skillRequirements,
      treasureProfile: profileId === null ? null : { profileId, status: profileResolved ? 'resolved' as const : 'missing' as const },
      acquisitionSourceRecordId: acquisitionIds.has(id) ? id : null,
      searchText: searchText([internalName, displayName, description, ...(keywords ?? []), ...(descriptions ?? [])]),
      interpretation: 'uninterpreted' as const, source: source('items', id), raw };
  });
  return { schemaVersion: 1, gameDataVersion: input.progression.gameDataVersion, sources, items, nonEquipmentItemIds,
    treasurePowers, treasureProfiles, acquisitionSources, integrityIssues };
}

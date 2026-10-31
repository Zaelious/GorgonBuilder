import type { AbilityConditions, AbilityReference, EffectKeywordReference, SkillReference } from '../normalized/abilities';
import type { JsonValue } from '../normalized/progression';
import type { TreasureSkillAssociation } from '../normalized/items-treasure';
import { countGameData } from './contracts';
import type { GameData, GameDataDiagnostic, GameDataManifest, RuntimeGameData } from './contracts';

export function requireIntegrity(ok: unknown, path: string, detail: string): asserts ok {
  if (!ok) throw new Error(`${path}: ${detail}`);
}
export function uniqueIndex<T>(records: readonly T[], id: (r: T) => string, namespace: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const record of records) {
    const key = id(record);
    requireIntegrity(!result.has(key), namespace, `duplicate ID ${key}`);
    result.set(key, record);
  }
  return result;
}
/** Independent validation of normalized references; missing references must have a diagnostic. */
export function validateGameData(data: GameData): GameDataDiagnostic[] {
  const { progression: p, abilities: a, itemsTreasure: t } = data;
  const sources = { ...p.sources, ...a.sources, ...t.sources };
  for (const [group, value] of Object.entries(data)) {
    requireIntegrity(value.schemaVersion === 1 && value.gameDataVersion === p.gameDataVersion, group, 'incompatible schema/gameDataVersion');
    for (const [dataset, source] of Object.entries(value.sources) as [string, { dataset: string; gameDataVersion: string }][]) requireIntegrity(source.dataset === dataset && source.gameDataVersion === p.gameDataVersion,
      `${group}.sources.${dataset}`, 'conflicting dataset provenance/version');
  }
  const skills = uniqueIndex(p.skills, r => r.id, 'skills');
  uniqueIndex(p.skills, r => String(r.officialNumericId), 'skills.numericId');
  const tables = uniqueIndex(p.advancementTables, r => r.id, 'advancementtables');
  uniqueIndex(p.advancementTables, r => r.officialNumericId, 'advancementtables.numericId');
  uniqueIndex(p.advancementTables, r => r.sourceName, 'advancementtables.sourceName');
  const attributes = uniqueIndex(p.attributes, r => r.id, 'attributes');
  const effects = uniqueIndex(p.effects, r => r.id, 'effects');
  const abilities = uniqueIndex(a.abilities, r => r.id, 'abilities');
  uniqueIndex(a.abilities, r => r.internalName, 'abilities.internalName');
  const items = uniqueIndex(t.items, r => r.id, 'items');
  uniqueIndex(t.items, r => r.internalName, 'items.internalName');
  const otherItems = uniqueIndex(t.nonEquipmentItemIds, r => r, 'nonEquipmentItems');
  for (const id of otherItems.keys()) requireIntegrity(!items.has(id), id, 'equipment/non-equipment overlap');
  const powers = uniqueIndex(t.treasurePowers, r => r.id, 'tsysclientinfo');
  uniqueIndex(t.treasurePowers, r => r.internalName, 'tsysclientinfo.internalName');
  const profiles = uniqueIndex(t.treasureProfiles, r => r.id, 'tsysprofiles');
  const rules = uniqueIndex(a.keywordRules, r => r.source.recordId, 'abilitykeywords');
  const abilitySources = uniqueIndex(a.acquisitionSources, r => r.abilityId, 'sources_abilities');
  const itemSources = uniqueIndex(t.acquisitionSources, r => r.itemId, 'sources_items');
  const diagnostics: GameDataDiagnostic[] = [
    ...p.integrityIssues.map(issue => ({ group: 'progression' as const, category: 'unresolved-reference' as const,
      code: issue.code, path: issue.code === 'missing-attribute'
        ? `advancementtables.${issue.tableId}.${issue.sourceLevelKey}.${issue.rewardId}`
        : `skills.${issue.skillId}.XpEarnedAttributes`,
      reference: issue.code === 'missing-attribute' ? issue.rewardId : issue.attributeId, message: issue.message })),
    ...a.integrityIssues.map(issue => ({ ...issue, group: 'abilities' as const, category: 'unresolved-reference' as const })),
    ...t.integrityIssues.map(issue => ({ ...issue, group: 'itemsTreasure' as const })),
  ];
  const key = (d: Pick<GameDataDiagnostic, 'group' | 'code' | 'path' | 'reference'>) => JSON.stringify([d.group, d.code, d.path, d.reference]);
  const reported = uniqueIndex(diagnostics, key, 'diagnostics');
  const observed = new Set<string>();
  function missing(group: GameDataDiagnostic['group'], code: string, path: string, reference: string) {
    const id = key({ group, code, path, reference });
    requireIntegrity(reported.has(id), path, `unreported ${code}: ${reference}`);
    observed.add(id);
  }
  function skill(ref: SkillReference | TreasureSkillAssociation, path: string, group: 'abilities' | 'itemsTreasure') {
    if (ref.status === 'uninterpreted') {
      requireIntegrity(ref.sourceId === 'AnySkill' && ref.skillId === null, path, 'invalid uninterpreted selector');
      missing(group, 'unsupported-skill-selector', path, ref.sourceId);
    } else if (skills.has(ref.sourceId)) {
      requireIntegrity(ref.status === 'resolved' && ref.skillId === ref.sourceId, path, 'incorrect resolved skill ID/status');
    } else {
      requireIntegrity(ref.status === 'missing' && ref.skillId === null, path, 'broken skill reference');
      missing(group, 'missing-skill', path, ref.sourceId);
    }
  }
  const effectsByKeyword = new Map<string, string[]>();
  for (const effect of p.effects) for (const keyword of new Set(effect.keywords)) {
    const ids = effectsByKeyword.get(keyword) ?? [];
    ids.push(effect.id); effectsByKeyword.set(keyword, ids);
  }
  for (const ids of effectsByKeyword.values()) ids.sort();
  function effect(ref: EffectKeywordReference, path: string) {
    const ids = effectsByKeyword.get(ref.keyword) ?? [];
    requireIntegrity(JSON.stringify(ref.effectIds) === JSON.stringify(ids) &&
      ref.status === (ids.length ? 'resolved' : 'missing'), path, 'broken effect-keyword membership');
    if (!ids.length) missing('abilities', 'missing-effect-keyword', path, ref.keyword);
  }
  function conditions(c: AbilityConditions, path: string, rule = false) {
    if (c.requiredActiveSkill) skill(c.requiredActiveSkill, `${path}.${rule ? 'MustHaveActiveSkill' : 'ReqActiveSkill'}`, 'abilities');
    c.requiredEffectKeywords?.forEach((r, i) => effect(r, `${path}.${rule ? 'MustHaveEffectKeywords' : 'ReqEffectKeywords'}[${i}]`));
  }
  const abilitiesByName = new Map(a.abilities.map(r => [r.internalName, r.id]));
  function ability(ref: AbilityReference | null, path: string) {
    if (!ref) return;
    const id = abilitiesByName.get(ref.internalName) ?? null;
    requireIntegrity(ref.abilityId === id && ref.status === (id ? 'resolved' : 'missing'), path, 'broken ability reference');
    if (!id) missing('abilities', 'missing-ability', path, ref.internalName);
  }
  function attribute(id: string, status: string, path: string, code: string) {
    const exists = attributes.has(id);
    requireIntegrity(status === (exists ? 'resolved' : 'missing'), path, 'broken attribute reference');
    if (!exists) missing('progression', code, path, id);
  }
  for (const r of p.skills) {
    for (const ref of [r.activeAdvancement, r.passiveAdvancement]) if (ref) {
      requireIntegrity(tables.get(ref.tableId)?.sourceName === ref.sourceName, `skills.${r.id}`, 'broken advancement-table reference');
    }
    for (const ref of r.xpEarnedAttributes ?? []) attribute(ref.id, ref.status, `skills.${r.id}.XpEarnedAttributes`, 'missing-xp-attribute');
  }
  for (const table of p.advancementTables) for (const level of table.progression) for (const reward of level.rewards) {
    requireIntegrity(reward.attributeReference?.id === reward.id, table.id, 'incorrect reward attribute ID');
    attribute(reward.id, reward.attributeReference.status, `advancementtables.${table.id}.${level.sourceLevelKey}.${reward.id}`, 'missing-attribute');
  }
  for (const r of a.abilities) {
    const path = `abilities.${r.id}`;
    skill(r.skill, `${path}.Skill`, 'abilities');
    ability(r.upgradeOf, `${path}.UpgradeOf`); ability(r.prerequisite, `${path}.Prerequisite`);
    ability(r.timing.sharesResetTimerWith, `${path}.SharesResetTimerWith`);
    for (const ref of r.effectKeywordConstraints) effect(ref, `${path}.${ref.sourcePath}`);
    r.conditionalKeywords?.forEach((ref, i) => {
      if (ref.effectKeywordMustExist) effect(ref.effectKeywordMustExist, `${path}.ConditionalKeywords[${i}].EffectKeywordMustExist`);
      if (ref.effectKeywordMustNotExist) effect(ref.effectKeywordMustNotExist, `${path}.ConditionalKeywords[${i}].EffectKeywordMustNotExist`);
    });
    for (const ref of r.keywordRuleCandidates) requireIntegrity(rules.has(ref.sourceRecordId), path, 'broken keyword-rule locator');
    requireIntegrity(r.acquisitionSourceRecordId === (abilitySources.has(r.id) ? r.id : null), path, 'broken ability acquisition link');
    for (const [field, records] of [['DoTs', r.pve.dots], ['SpecialValues', r.pve.specialValues]] as const) {
      records?.forEach((record, i) => {
        requireIntegrity(record.ownerAbilityId === r.id && record.sourceIndex === i && record.source.recordId === `${r.id}.PvE.${field}[${i}]`, path, 'incorrect embedded owner/locator');
        conditions(record.conditions, `${path}.PvE.${field}[${i}]`);
      });
    }
  }
  for (const [dataset, records] of [['abilitykeywords', a.keywordRules], ['abilitydynamicdots', a.dynamicDots], ['abilitydynamicspecialvalues', a.dynamicSpecialValues]] as const) {
    records.forEach((r, i) => {
      requireIntegrity(r.sourceIndex === i && r.source.recordId === String(i) && !('id' in r) &&
        (!('ownerAbilityId' in r) || r.ownerAbilityId === null), `${dataset}[${i}]`, 'invalid anonymous record identity');
      conditions(r.conditions, `${dataset}[${i}]`, dataset === 'abilitykeywords');
    });
  }
  for (const r of a.acquisitionSources) {
    const exists = abilities.has(r.abilityId);
    requireIntegrity(r.abilityReference.abilityId === r.abilityId && r.abilityReference.status === (exists ? 'resolved' : 'missing'), r.abilityId, 'broken acquisition reference');
    if (!exists) missing('abilities', 'missing-ability', `sources_abilities.${r.abilityId}`, r.abilityId);
  }
  for (const r of t.items) {
    const path = `items.${r.id}`;
    if (r.treasureProfile) {
      const exists = profiles.has(r.treasureProfile.profileId);
      requireIntegrity(r.treasureProfile.status === (exists ? 'resolved' : 'missing'), path, 'broken profile reference');
      if (!exists) missing('itemsTreasure', 'missing-profile', `${path}.TSysProfile`, r.treasureProfile.profileId);
    }
    for (const ref of r.skillRequirements ?? []) skill(ref.skill, `${path}.SkillReqs.${ref.skill.sourceId}`, 'itemsTreasure');
    requireIntegrity(r.acquisitionSourceRecordId === (itemSources.has(r.id) ? r.id : null), path, 'broken item acquisition link');
    requireIntegrity(r.level === (r.raw.CraftingTargetLevel ?? null) && r.levelSource === (r.level === null ? null : 'CraftingTargetLevel'), path, 'crafting target level semantics changed');
  }
  for (const r of t.treasurePowers) {
    skill(r.skill, `tsysclientinfo.${r.id}.Skill`, 'itemsTreasure');
    uniqueIndex(r.tiers, tier => tier.id, `${r.id}.tiers`);
    for (const tier of r.tiers) requireIntegrity(tier.powerId === r.id && tier.source.recordId === `${r.id}.Tiers.${tier.id}`,
      `${r.id}/${tier.id}`, 'incorrect tier owner/composite identity');
  }
  const powersByName = new Map(t.treasurePowers.map(r => [r.internalName, r.id]));
  for (const r of t.treasureProfiles) {
    requireIntegrity(r.powers.length === r.raw.length, `tsysprofiles.${r.id}`, 'profile membership coverage mismatch');
    r.powers.forEach((ref, i) => {
    const id = powersByName.get(ref.internalName) ?? null;
    requireIntegrity(ref.powerId === id && ref.status === (id ? 'resolved' : 'missing') && r.raw[i] === ref.internalName,
      `tsysprofiles.${r.id}[${i}]`, 'broken profile membership');
    if (!id) missing('itemsTreasure', 'missing-power', `tsysprofiles.${r.id}[${i}]`, ref.internalName);
    });
  }
  for (const r of t.acquisitionSources) {
    const exists = items.has(r.itemId) || otherItems.has(r.itemId);
    requireIntegrity(r.itemReference.status === (exists ? 'resolved' : 'missing') &&
      r.itemReference.equipmentItemId === (items.has(r.itemId) ? r.itemId : null), r.itemId, 'broken item acquisition reference');
    if (!exists) missing('itemsTreasure', 'missing-item', `sources_items.${r.itemId}`, r.itemId);
  }
  // Inspect only normalized structures; unknown raw fields never become foreign keys.
  function provenance(value: unknown, path: string): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((v, i) => provenance(v, `${path}[${i}]`)); return; }
    const row = value as Record<string, unknown>;
    if (row.source) {
      const source = row.source as GameDataManifest['sources'][keyof GameDataManifest['sources']] & { recordId: string };
      const expected = sources[source.dataset];
      requireIntegrity(expected && source.gameDataVersion === p.gameDataVersion && source.sourceUrl === expected.sourceUrl && source.sha256 === expected.sha256,
        path, 'conflicting record provenance');
      if (typeof row.id === 'string' && !('powerId' in row)) requireIntegrity(source.recordId === row.id, path, 'official ID differs from source locator');
    }
    for (const [k, v] of Object.entries(row)) if (k !== 'raw' && k !== 'source' && k !== 'sources') provenance(v, `${path}.${k}`);
  }
  for (const source of Object.values(sources)) requireIntegrity(source.gameDataVersion === p.gameDataVersion, source.dataset, 'mixed source versions');
  provenance(data, 'data');
  requireIntegrity(observed.size === reported.size, 'diagnostics', 'stale or incorrect diagnostic records');
  // Keep namespaces separate; identical tier keys across different powers are valid.
  requireIntegrity(effects.size === p.effects.length && powers.size === t.treasurePowers.length, 'data', 'invalid namespace');
  return diagnostics.sort((x, y) => key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0);
}

export function validateManifestCounts(data: GameData | RuntimeGameData, manifest: GameDataManifest): void {
  requireIntegrity(manifest.schemaVersion === 1 && manifest.generatorVersion === 1 && manifest.normalizationSchemaVersion === 1,
    'manifest', 'unsupported generated schema');
  for (const value of Object.values(data)) {
    requireIntegrity(value.schemaVersion === manifest.normalizationSchemaVersion && value.gameDataVersion === manifest.gameDataVersion, 'manifest.gameDataVersion', 'schema/version mismatch');
    for (const [dataset, source] of Object.entries(value.sources)) requireIntegrity(canonicalJson(source) === canonicalJson(manifest.sources[dataset as keyof typeof manifest.sources]),
      `manifest.sources.${dataset}`, 'source metadata mismatch');
  }
  const groups = { progression: data.progression.integrityIssues.length, abilities: data.abilities.integrityIssues.length, itemsTreasure: data.itemsTreasure.integrityIssues.length };
  const records = manifest.diagnostics.records;
  requireIntegrity(canonicalJson(groups) === canonicalJson(manifest.diagnostics.byGroup) &&
    Object.values(groups).reduce((n, v) => n + v, 0) === manifest.diagnostics.total && records.length === manifest.diagnostics.total,
    'manifest.diagnostics', 'diagnostic counts differ');
  for (const [group, count] of Object.entries(groups)) requireIntegrity(records.filter(r => r.group === group).length === count, 'manifest.diagnostics', 'diagnostic group counts differ');
  for (const [category, count] of Object.entries(manifest.diagnostics.byCategory)) requireIntegrity(records.filter(r => r.category === category).length === count,
    'manifest.diagnostics', 'diagnostic category counts differ');
  const actual = countGameData(data);
  requireIntegrity(canonicalJson(actual) === canonicalJson(manifest.counts), 'manifest.counts', 'generated artifact counts differ');
}

/** Canonical JSON for comparisons and deterministic output, preserving array order. */
export function canonicalJson(value: unknown): string {
  function ordered(v: unknown): JsonValue | undefined {
    if (v === undefined) return undefined;
    if (Array.isArray(v)) return v.map(x => ordered(x) ?? null);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([x], [y]) => x < y ? -1 : x > y ? 1 : 0).map(([k, x]) => [k, ordered(x)])) as JsonValue;
    return v as JsonValue;
  }
  return JSON.stringify(ordered(value));
}

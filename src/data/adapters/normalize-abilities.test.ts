// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { AbilityDatasetName, AbilityDatasetSource } from '../normalized/abilities';
import type { DatasetSource, JsonObject, ProgressionDatasetName } from '../normalized/progression';
import { normalizeAbilities } from './normalize-abilities';
import type { AbilityInput } from './normalize-abilities';
import { normalizeProgression, NormalizationError } from './normalize-progression';

const abilityDatasets = ['abilities', 'abilitykeywords', 'abilitydynamicdots', 'abilitydynamicspecialvalues', 'sources_abilities'] as const;
const progressionDatasets = ['skills', 'advancementtables', 'attributes', 'effects'] as const;
function provenance<T extends string>(names: readonly T[]) {
  return Object.fromEntries(names.map((dataset) => [dataset, { dataset, gameDataVersion: 'vFixture',
    sourceUrl: `https://cdn.projectgorgon.com/vFixture/data/${dataset}.json`, sha256: 'a'.repeat(64) }]));
}
function fixture() {
  const progression = normalizeProgression({ sources: provenance(progressionDatasets) as Record<ProgressionDatasetName, DatasetSource>,
    skills: { Example: { Id: 1, Description: '', Combat: true, GuestLevelCap: 15,
      MaxBonusLevels: 25, XpTable: 'Xp', Rewards: {} } }, advancementtables: {}, attributes: {},
    effects: { effect_1: { Name: 'Example', Desc: '', Keywords: ['Active', 'Conditional'], DisplayMode: 'Effect', IconId: 1 },
      effect_2: { Name: 'Other', Desc: '', Keywords: ['Active'], DisplayMode: 'Effect', IconId: 2 } },
  });
  const abilities: Record<string, JsonObject> = {
    ability_1: { InternalName: 'First99', Name: 'Example 99', Description: 'Mentions Other effect_999; not a reference.',
      Skill: 'Example', Level: 0, DamageType: 'Psychic', ResetTime: 0, Target: 'Enemy', Keywords: ['Attack'],
      ExtraKeywordsForTooltips: ['TooltipOnly'],
      ConditionalKeywords: [{ Keyword: 'Burst', Default: true, EffectKeywordMustExist: 'Conditional', Future: [null, false] }],
      TargetEffectKeywordReq: 'Active', EffectKeywordReqs: ['Active'], EffectKeywordsIndicatingEnabled: ['Active'],
      PvE: { Damage: 0, HealthSpecificDamage: 1, ArmorSpecificDamage: 2, ExtraDamageIfTargetVulnerable: 3,
        CritDamageMod: 1.25, ArmorMitigationRatio: -1, PowerCost: 0, Range: 10, AoE: 4,
        DoTs: [{ DamagePerTick: 0, DamageType: 'Poison', Duration: 8, NumTicks: 4, SpecialRules: ['BuffActivated'], Extra: 42 }],
        SpecialValues: [{ Label: '', Value: 0, Suffix: 'Not parsed into timing', SkipIfZero: false }],
        AttributesThatModDamage: ['UNKNOWN_HOOK'], FutureDamage: { value: 27 } }, Future: { z: [true], a: null } },
    ability_2: { InternalName: 'Next', Name: 'Same display name is allowed', Description: '', Skill: 'Example', Level: 15,
      Rank: 'II', UpgradeOf: 'First99', Prerequisite: 'First99', SharesResetTimerWith: 'First99',
      DamageType: 'Nothingness', ResetTime: -1, Target: 'Self', PvE: { PowerCost: 1, Range: 0 } },
  };
  const abilitykeywords: JsonObject[] = [
    { MustHaveAbilityKeywords: ['Attack'], MustNotHaveAbilityKeywords: ['PsychicAttack'],
      MustHaveActiveSkill: 'Example', MustHaveEffectKeywords: ['Active'], AttributesThatDeltaDamage: ['UNKNOWN'], FutureConstraint: true },
    { MustHaveAbilityKeywords: ['Burst', 'Attack'] },
    { MustHaveAbilityKeywords: ['Attack'], MustNotHaveAbilityKeywords: ['Burst'] },
    { MustHaveAbilityKeywords: ['TooltipOnly'] },
  ];
  const abilitydynamicdots: JsonObject[] = [{ DamagePerTick: 0, DamageType: 'Poison', Duration: 8, NumTicks: 4,
    ReqAbilityKeywords: ['Attack'], ReqActiveSkill: 'Example', ReqEffectKeywords: ['Active'],
    AttributesThatDelta: ['DOT_HOOK'], SpecialRules: ['BuffActivated'], Future: 5 }];
  const abilitydynamicspecialvalues: JsonObject[] = [{ Label: 'Restore', Value: 0, Suffix: 'Health every 3 seconds',
    ReqAbilityKeywords: ['Attack'], ReqEffectKeywords: ['Active'], SkipIfZero: true, Future: 5 }];
  const sources_abilities: Record<string, JsonObject> = { ability_1: { entries: [{ skill: 'Example', type: 'Skill', future: 1 }] } };
  return { progression, sources: provenance(abilityDatasets) as Record<AbilityDatasetName, AbilityDatasetSource>,
    abilities, abilitykeywords, abilitydynamicdots, abilitydynamicspecialvalues, sources_abilities };
}
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).reverse()
    .map(([key, entry]) => [key, reverseKeys(entry)]));
  return value;
}

describe('ability normalization fixtures', () => {
  it('keeps identity, level, explicit Rank, reference namespaces and all original values distinct', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const output = normalizeAbilities(input);
    expect(output.integrityIssues).toEqual([]);
    expect(output.abilities[0]).toMatchObject({ id: 'ability_1', internalName: 'First99', displayName: 'Example 99',
      rank: null, level: 0, skill: { sourceId: 'Example', skillId: 'Example', status: 'resolved' },
      damage: { damage: 0, healthSpecificDamage: 1, armorSpecificDamage: 2, extraDamageIfTargetVulnerable: 3,
        damageType: 'Psychic', critDamageMod: 1.25, armorMitigationRatio: -1 },
      timing: { resetTime: 0 }, targeting: { target: 'Enemy', range: 10, aoe: 4 },
      pve: { powerCost: 0, attributeHooks: { AttributesThatModDamage: ['UNKNOWN_HOOK'] } },
      source: { dataset: 'abilities', recordId: 'ability_1', gameDataVersion: 'vFixture', sha256: 'a'.repeat(64) } });
    expect(output.abilities[1]).toMatchObject({ rank: 'II', level: 15,
      upgradeOf: { internalName: 'First99', abilityId: 'ability_1', status: 'resolved' },
      prerequisite: { internalName: 'First99', abilityId: 'ability_1', status: 'resolved' },
      timing: { resetTime: -1, sharesResetTimerWith: { abilityId: 'ability_1', status: 'resolved' } } });
    expect(output.abilities[0]?.raw).toEqual(input.abilities.ability_1);
    expect(JSON.stringify(input)).toBe(before);
    expect(output.abilities[0]?.raw).not.toBe(input.abilities.ability_1);
    expect(output.abilities[0]?.pve.dots?.[0]?.raw).not.toBe(((input.abilities.ability_1!.PvE as JsonObject).DoTs as JsonObject[])[0]);
  });

  it('retains keyword rules, exclusions and conditional candidates without applying constraints/modifiers', () => {
    const input = fixture();
    const result = normalizeAbilities(input);
    expect(result.keywordRules[0]).toMatchObject({ sourceIndex: 0, raw: input.abilitykeywords[0],
      source: { dataset: 'abilitykeywords', recordId: '0' }, interpretation: 'uninterpreted',
      conditions: { requiredAbilityKeywords: ['Attack'], excludedAbilityKeywords: ['PsychicAttack'],
        requiredActiveSkill: { skillId: 'Example', status: 'resolved' },
        requiredEffectKeywords: [{ keyword: 'Active', effectIds: ['effect_1', 'effect_2'] }] } });
    expect(result.abilities[0]?.keywordRuleCandidates).toEqual([
      { sourceRecordId: '0', keywordMatch: 'static', applicability: 'unevaluated' },
      { sourceRecordId: '1', keywordMatch: 'conditional', applicability: 'unevaluated' },
      { sourceRecordId: '2', keywordMatch: 'conditional', applicability: 'unevaluated' },
    ]);
    expect(result.abilities[0]?.conditionalKeywords?.[0]).toMatchObject({ keyword: 'Burst', default: true,
      effectKeywordMustExist: { effectIds: ['effect_1'], interpretation: 'keyword-membership-only' },
      raw: { Future: [null, false] } });
    (input.abilities.ability_1!.Keywords as string[]).push('PsychicAttack');
    expect(normalizeAbilities(input).abilities[0]?.keywordRuleCandidates.map((r) => r.sourceRecordId)).not.toContain('0');
  });

  it('preserves anonymous duplicate rules independently and all dynamic/embedded metadata and ownership', () => {
    const input = fixture();
    input.abilitykeywords.push(structuredClone(input.abilitykeywords[0]!));
    const result = normalizeAbilities(input);
    expect(result.keywordRules.at(-1)?.source.recordId).toBe('4');
    expect(result.keywordRules.at(-1)?.raw).toEqual(result.keywordRules[0]?.raw);
    expect(result.dynamicDots[0]).toMatchObject({ damagePerTick: 0, duration: 8, numTicks: 4, damageType: 'Poison',
      source: { dataset: 'abilitydynamicdots', recordId: '0' }, ownerAbilityId: null,
      conditions: { requiredActiveSkill: { skillId: 'Example' }, requiredEffectKeywords: [{ effectIds: ['effect_1', 'effect_2'] }] },
      raw: input.abilitydynamicdots[0] });
    expect(result.dynamicSpecialValues[0]).toMatchObject({ label: 'Restore', value: 0,
      suffix: 'Health every 3 seconds', ownerAbilityId: null, raw: input.abilitydynamicspecialvalues[0] });
    expect(result.abilities[0]?.pve.dots?.[0]).toMatchObject({ ownerAbilityId: 'ability_1',
      source: { dataset: 'abilities', recordId: 'ability_1.PvE.DoTs[0]' }, raw: { Extra: 42 } });
    expect(result.abilities[0]?.pve.specialValues?.[0]).toMatchObject({ ownerAbilityId: 'ability_1', label: '', value: 0, skipIfZero: false });
  });

  it('resolves explicit effect keyword constraints using T0003 definitions, never descriptions or names', () => {
    const result = normalizeAbilities(fixture());
    expect(result.abilities[0]?.effectKeywordConstraints).toEqual([
      ...['EffectKeywordReqs[0]', 'EffectKeywordsIndicatingEnabled[0]', 'TargetEffectKeywordReq'].map((sourcePath) => ({
        sourcePath, keyword: 'Active', effectIds: ['effect_1', 'effect_2'], status: 'resolved', interpretation: 'keyword-membership-only',
      })),
    ]);
    expect(JSON.stringify(result.abilities[0]?.effectKeywordConstraints)).not.toContain('effect_999');
  });

  it('preserves unresolved references with actionable diagnostics, including official Unknown skill values', () => {
    const input = fixture();
    input.abilities.ability_1!.Skill = 'Unknown';
    input.abilities.ability_2!.UpgradeOf = 'MissingInternalName';
    input.abilities.ability_1!.TargetEffectKeywordReq = 'UnknownEffectKeyword';
    input.abilitydynamicdots[0]!.ReqActiveSkill = 'MissingSkill';
    input.abilitydynamicspecialvalues[0]!.ReqEffectKeywords = ['Unpublished'];
    input.sources_abilities.ability_999 = { entries: [] };
    const result = normalizeAbilities(input);
    expect(result.integrityIssues.map((i) => [i.code, i.reference]).sort()).toEqual([
      ['missing-skill', 'Unknown'], ['missing-skill', 'MissingSkill'], ['missing-ability', 'MissingInternalName'],
      ['missing-effect-keyword', 'UnknownEffectKeyword'], ['missing-effect-keyword', 'Unpublished'], ['missing-ability', 'ability_999'],
    ].sort());
    for (const issue of result.integrityIssues) expect(issue.message).toContain(issue.path);
    expect(result.abilities[0]?.skill).toEqual({ sourceId: 'Unknown', skillId: null, status: 'missing' });
    expect(result.abilities[1]?.upgradeOf).toEqual({ internalName: 'MissingInternalName', abilityId: null, status: 'missing' });
    expect(result.dynamicSpecialValues[0]?.conditions.requiredEffectKeywords?.[0]).toMatchObject({ keyword: 'Unpublished', effectIds: [], status: 'missing' });
    expect(result.acquisitionSources.at(-1)?.abilityReference.status).toBe('missing');
  });

  it('supports omitted optional fields and published blank names without inventing ranks, damage, targets or dynamic links', () => {
    const input = fixture();
    input.abilities.ability_2!.Name = '';
    const result = normalizeAbilities(input).abilities[1]!;
    expect(result.displayName).toBe('');
    expect(result.keywords).toBeNull();
    expect(result.conditionalKeywords).toBeNull();
    expect(result.damage.damage).toBeNull();
    expect(result.targeting.aoe).toBeNull();
    expect(result.pve.dots).toBeNull();
    expect(result.pve.specialValues).toBeNull();
    expect(result.timing.delayLoopTime).toBeNull();
    expect(result.acquisitionSourceRecordId).toBeNull();
  });

  it('preserves future fields and explicit-looking unknown values without inventing a reference contract', () => {
    const input = fixture();
    input.abilities.ability_1!.FutureEffectId = 'effect_1';
    input.abilitydynamicdots[0]!.FutureAbilityId = 'ability_1';
    input.abilities.ability_1!.Rank = 7;
    input.abilities.ability_1!.SpecialTargetingTypeReq = 1;
    const result = normalizeAbilities(input);
    expect(result.abilities[0]).toMatchObject({ rank: 7, raw: { FutureEffectId: 'effect_1' },
      targeting: { specialTargetingTypeReq: 1 } });
    expect(result.dynamicDots[0]).toMatchObject({ ownerAbilityId: null, raw: { FutureAbilityId: 'ability_1' } });
    expect(result.abilities[0]?.effectKeywordConstraints).toHaveLength(3);
  });

  it('accepts empty supporting datasets and preserves an absent explicit Rank', () => {
    const input = fixture();
    const result = normalizeAbilities({ ...input, abilitykeywords: [], abilitydynamicdots: [],
      abilitydynamicspecialvalues: [], sources_abilities: {} });
    expect(result.keywordRules).toEqual([]);
    expect(result.dynamicDots).toEqual([]);
    expect(result.dynamicSpecialValues).toEqual([]);
    expect(result.acquisitionSources).toEqual([]);
    expect(result.abilities[0]?.rank).toBeNull();
  });

  it('retains exact acquisition entries and provenance, without treating them as modifiers', () => {
    const input = fixture();
    const result = normalizeAbilities(input);
    expect(result.abilities[0]?.acquisitionSourceRecordId).toBe('ability_1');
    expect(result.acquisitionSources[0]).toMatchObject({ abilityId: 'ability_1',
      source: { dataset: 'sources_abilities', recordId: 'ability_1' }, raw: input.sources_abilities.ability_1,
      entries: [{ skill: 'Example', type: 'Skill', future: 1 }], interpretation: 'uninterpreted' });
  });

  it.each([
    ['abilities.ability_1.InternalName', (i: ReturnType<typeof fixture>) => { Reflect.deleteProperty(i.abilities.ability_1!, 'InternalName'); }],
    ['abilities.ability_1.Name', (i: ReturnType<typeof fixture>) => { i.abilities.ability_1!.Name = null; }],
    ['abilities.ability_1.Skill', (i: ReturnType<typeof fixture>) => { i.abilities.ability_1!.Skill = ''; }],
    ['abilities.ability_1.Level', (i: ReturnType<typeof fixture>) => { i.abilities.ability_1!.Level = -1; }],
    ['abilities.ability_1.ResetTime', (i: ReturnType<typeof fixture>) => { i.abilities.ability_1!.ResetTime = Infinity; }],
    ['abilities.ability_1.PvE', (i: ReturnType<typeof fixture>) => { i.abilities.ability_1!.PvE = []; }],
    ['abilities.ability_1.PvE.Damage', (i: ReturnType<typeof fixture>) => { (i.abilities.ability_1!.PvE as JsonObject).Damage = '99'; }],
    ['abilities.ability_1.PvE.Range', (i: ReturnType<typeof fixture>) => { Reflect.deleteProperty(i.abilities.ability_1!.PvE as JsonObject, 'Range'); }],
    ['abilities.ability_1.Keywords', (i: ReturnType<typeof fixture>) => { i.abilities.ability_1!.Keywords = [1]; }],
    ['abilities.ability_2.UpgradeOf', (i: ReturnType<typeof fixture>) => { i.abilities.ability_2!.UpgradeOf = null; }],
    ['abilitykeywords[0].MustHaveAbilityKeywords', (i: ReturnType<typeof fixture>) => { i.abilitykeywords[0]!.MustHaveAbilityKeywords = null; }],
    ['abilitydynamicdots[0].NumTicks', (i: ReturnType<typeof fixture>) => { Reflect.deleteProperty(i.abilitydynamicdots[0]!, 'NumTicks'); }],
    ['abilitydynamicspecialvalues[0].Value', (i: ReturnType<typeof fixture>) => { i.abilitydynamicspecialvalues[0]!.Value = false; }],
    ['sources_abilities.ability_1.entries', (i: ReturnType<typeof fixture>) => { i.sources_abilities.ability_1!.entries = [null]; }],
  ])('rejects malformed data with its source path: %s', (path, mutate) => {
    const input = fixture(); mutate(input);
    expect(() => normalizeAbilities(input)).toThrow(path);
    expect(() => normalizeAbilities(input)).toThrow(NormalizationError);
  });

  it('detects duplicate internal names, noncanonical ID aliases and conflicting T0003 identities', () => {
    const input = fixture();
    input.abilities.ability_2!.InternalName = 'First99';
    expect(() => normalizeAbilities(input)).toThrow('duplicate or conflicting internal name First99');
    input.abilities.ability_2!.InternalName = 'Next';
    input.abilities.ability_01 = input.abilities.ability_1!;
    expect(() => normalizeAbilities(input)).toThrow('expected canonical official ability identifier');
    Reflect.deleteProperty(input.abilities, 'ability_01');
    input.progression = { ...input.progression, skills: [...input.progression.skills, input.progression.skills[0]!] };
    expect(() => normalizeAbilities(input)).toThrow('duplicate or conflicting identifier Example');
  });

  it('rejects mixed versions and invalid provenance, including each reused T0003 record', () => {
    const input = fixture();
    input.sources.abilitydynamicdots = { ...input.sources.abilitydynamicdots, gameDataVersion: 'vOther' };
    expect(() => normalizeAbilities(input)).toThrow('one game-data version');
    input.sources.abilitydynamicdots = { ...input.sources.abilitydynamicdots, gameDataVersion: 'vFixture', sha256: 'bad' };
    expect(() => normalizeAbilities(input)).toThrow('expected SHA-256');
    input.sources.abilitydynamicdots = { ...input.sources.abilitydynamicdots, sha256: 'a'.repeat(64), dataset: 'abilities' };
    expect(() => normalizeAbilities(input)).toThrow('conflicting dataset provenance');
    input.sources.abilitydynamicdots = { ...input.sources.abilitydynamicdots, dataset: 'abilitydynamicdots' };
    input.progression = { ...input.progression, effects: input.progression.effects.map((effect) => ({
      ...effect, source: { ...effect.source, gameDataVersion: 'vOther' },
    })) };
    expect(() => normalizeAbilities(input)).toThrow('conflicting T0003 record provenance');
  });

  it('is deterministic with fresh copies, reordered keys, and reordered T0003 reference arrays', () => {
    const input = fixture();
    const result = JSON.stringify(normalizeAbilities(input));
    const reordered = { ...input, sources: reverseKeys(input.sources), abilities: reverseKeys(input.abilities),
      abilitykeywords: reverseKeys(input.abilitykeywords), abilitydynamicdots: reverseKeys(input.abilitydynamicdots),
      abilitydynamicspecialvalues: reverseKeys(input.abilitydynamicspecialvalues), sources_abilities: reverseKeys(input.sources_abilities),
      progression: { ...input.progression, effects: [...input.progression.effects].reverse() } } as AbilityInput;
    expect(JSON.stringify(normalizeAbilities(structuredClone(input)))).toBe(result);
    expect(JSON.stringify(normalizeAbilities(reordered))).toBe(result);
  });
});

const root = new URL('../raw/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('snapshot.json', root), 'utf8')) as {
  upstreamVersion: string; datasets: { name: string; sourceUrl: string; integrity: { sha256: string }; records: number }[];
};
const parsed: Record<string, unknown> = {};
const sources: Record<string, unknown> = {};
for (const dataset of [...progressionDatasets, ...abilityDatasets]) {
  const entry = manifest.datasets.find((d) => d.name === dataset)!;
  const bytes = await readFile(new URL(`cache/${manifest.upstreamVersion}/${dataset}.json`, root));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.integrity.sha256) throw new Error(`Pinned hash mismatch: ${dataset}`);
  parsed[dataset] = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  sources[dataset] = { dataset, gameDataVersion: manifest.upstreamVersion, sourceUrl: entry.sourceUrl, sha256: entry.integrity.sha256 };
}
const progression = normalizeProgression({ sources, ...parsed } as unknown as Parameters<typeof normalizeProgression>[0]);
const official = { sources, ...parsed, progression } as unknown as AbilityInput;
const normalized = normalizeAbilities(official);

describe('pinned official ability integration', () => {
  it('preserves all five dataset counts and every source record', () => {
    expect([normalized.abilities.length, normalized.keywordRules.length, normalized.dynamicDots.length,
      normalized.dynamicSpecialValues.length, normalized.acquisitionSources.length]).toEqual([5972, 26, 2, 4, 4063]);
    // Batch comparisons avoid tens of thousands of matcher invocations while
    // still checking every field of every source record in the actual pin.
    expect(Object.fromEntries(normalized.abilities.map((a) => [a.id, a.raw]))).toEqual(official.abilities);
    expect(normalized.abilities.map((a) => [a.pve.raw, a.pve.dots?.map((r) => r.raw) ?? null,
      a.pve.specialValues?.map((r) => r.raw) ?? null])).toEqual(normalized.abilities.map((a) => {
      const pve = a.raw.PvE as JsonObject;
      return [pve, pve.DoTs ?? null, pve.SpecialValues ?? null];
    }));
    expect(normalized.keywordRules.map((r) => r.raw)).toEqual(official.abilitykeywords);
    expect(normalized.dynamicDots.map((r) => r.raw)).toEqual(official.abilitydynamicdots);
    expect(normalized.dynamicSpecialValues.map((r) => r.raw)).toEqual(official.abilitydynamicspecialvalues);
    expect(Object.fromEntries(normalized.acquisitionSources.map((r) => [r.abilityId, r.raw]))).toEqual(official.sources_abilities);
    expect(normalized.abilities.flatMap((a) => a.pve.dots ?? [])).toHaveLength(1757);
    expect(normalized.abilities.flatMap((a) => a.pve.specialValues ?? [])).toHaveLength(1823);
  }, 15000);

  it('maps every published damage, timing, rank and targeting value exactly', () => {
    expect(normalized.abilities.map((a) => [a.rank, a.damage.damageType, a.timing.resetTime,
      a.targeting.target, a.targeting.range, a.targeting.aoe, a.damage.damage, a.damage.healthSpecificDamage,
      a.damage.armorSpecificDamage, a.damage.extraDamageIfTargetVulnerable, a.damage.critDamageMod,
      a.damage.armorMitigationRatio])).toEqual(normalized.abilities.map((a) => {
      const raw = a.raw;
      const pve = raw.PvE as JsonObject;
      return [raw.Rank ?? null, raw.DamageType, raw.ResetTime, raw.Target, pve.Range, pve.AoE ?? null,
        ...['Damage', 'HealthSpecificDamage', 'ArmorSpecificDamage', 'ExtraDamageIfTargetVulnerable',
          'CritDamageMod', 'ArmorMitigationRatio'].map((key) => pve[key] ?? null)];
    }));
  });

  it('validates skill/upgrade/prerequisite/timer and acquisition links while exposing source gaps', () => {
    const skillIds = new Set(progression.skills.map((s) => s.id));
    const abilityIds = new Set(normalized.abilities.map((a) => a.id));
    for (const a of normalized.abilities) {
      if (a.skill.status === 'resolved') expect(skillIds.has(a.skill.skillId!)).toBe(true);
      else expect(a.skill.sourceId).toBe('Unknown');
      for (const ref of [a.upgradeOf, a.prerequisite, a.timing.sharesResetTimerWith]) {
        if (ref) { expect(ref.status).toBe('resolved'); expect(abilityIds.has(ref.abilityId!)).toBe(true); }
      }
    }
    expect(normalized.abilities.filter((a) => a.skill.status === 'resolved')).toHaveLength(4440);
    expect(normalized.integrityIssues.filter((i) => i.code === 'missing-skill')).toHaveLength(1532);
    expect(normalized.integrityIssues.filter((i) => i.code === 'missing-ability')).toEqual([]);
    expect(normalized.integrityIssues.filter((i) => i.code === 'missing-effect-keyword')).toHaveLength(14);
    expect(normalized.integrityIssues).toHaveLength(1546);
    expect(Object.fromEntries(['MindRevealed', 'HasRecentlyHeardBardSong', 'TestEffect'].map((keyword) =>
      [keyword, normalized.integrityIssues.filter((i) => i.reference === keyword).length])))
      .toEqual({ MindRevealed: 9, HasRecentlyHeardBardSong: 4, TestEffect: 1 });
    expect(normalized.acquisitionSources.every((s) => s.abilityReference.status === 'resolved')).toBe(true);
  });

  it('preserves actual string ranks and anonymous duplicate rules without invented identities', () => {
    expect(normalized.abilities.filter((a) => a.rank !== null)).toHaveLength(129);
    expect(normalized.abilities.find((a) => a.id === 'ability_1312')).toMatchObject({ internalName: 'GoFish2', rank: '2' });
    expect(normalized.keywordRules[24]?.raw).toEqual(normalized.keywordRules[25]?.raw);
    expect(normalized.keywordRules[24]?.source.recordId).not.toBe(normalized.keywordRules[25]?.source.recordId);
  });

  it.each([
    ['Psychology', 114, 'ability_1201', 'Psychoanalyze1', 1, 16, 30, 'Enemy'],
    ['Cow', 103, 'ability_1652', 'CowKick2', 14, 34, 8, 'Enemy'],
    ['Unarmed', 142, 'ability_1001', 'Punch', 0, 6, 2, 'Enemy'],
    ['Deer', 104, 'ability_1578', 'KingOfTheForest1', 13, 36, 12, 'EnemiesAroundSelf'],
  ] as const)('inspects %s families with exact source identities, levels, damage and timing', (skill, count, id, internalName, level, damage, resetTime, target) => {
    expect(normalized.abilities.filter((a) => a.skill.sourceId === skill)).toHaveLength(count);
    expect(normalized.abilities.find((a) => a.id === id)).toMatchObject({ internalName, level, rank: null,
      skill: { skillId: skill, status: 'resolved' }, damage: { damage }, timing: { resetTime }, targeting: { target } });
  });

  it('inspects upgrades, AoE and embedded dynamic examples across representative families', () => {
    const byId = new Map(normalized.abilities.map((a) => [a.id, a]));
    for (const [id, name, previous, level] of [
      ['ability_1206', 'Psychoanalyze1', 'ability_1201', 16], ['ability_1652', 'CowKick1', 'ability_1651', 14],
      ['ability_1006', 'Punch', 'ability_1001', 9], ['ability_1579', 'KingOfTheForest1', 'ability_1578', 32],
    ] as const) {
      expect(byId.get(id)).toMatchObject({ rank: null, level,
        upgradeOf: { internalName: name, abilityId: previous, status: 'resolved' },
        prerequisite: { internalName: name, abilityId: previous, status: 'resolved' },
        timing: { sharesResetTimerWith: { internalName: name, abilityId: previous, status: 'resolved' } } });
    }
    expect(byId.get('ability_1226')?.targeting.aoe).toBe(20);
    expect(byId.get('ability_6109')?.targeting.aoe).toBe(8);
    expect(byId.get('ability_1578')?.targeting.aoe).toBe(7);
    for (const id of ['ability_1661', 'ability_1003', 'ability_1565']) {
      expect(byId.get(id)?.pve.dots?.[0]).toMatchObject({ damagePerTick: 0, ownerAbilityId: id, interpretation: 'uninterpreted' });
    }
    expect(byId.get('ability_1205')?.pve.specialValues?.[0]).toMatchObject({ value: 70, suffix: 'Health' });
    expect(byId.get('ability_1560')?.pve.specialValues?.[0]).toMatchObject({ value: 6, suffix: 'Physical Damage' });
    expect(byId.get('ability_1229')?.effectKeywordConstraints).toContainEqual(expect.objectContaining({ keyword: 'MindRevealed', status: 'missing' }));
  });

  it('keeps global dynamic rules independent and resolves exact effect keyword membership only', () => {
    expect(normalized.dynamicDots.every((d) => d.ownerAbilityId === null)).toBe(true);
    expect(normalized.dynamicSpecialValues.every((d) => d.ownerAbilityId === null)).toBe(true);
    expect(normalized.dynamicDots[0]).toMatchObject({ damagePerTick: 0, duration: 8, numTicks: 4,
      conditions: { requiredActiveSkill: { skillId: 'Druid', status: 'resolved' },
        requiredEffectKeywords: [{ keyword: 'TSysProjectilesDealPoisonDoT', status: 'resolved' }] } });
    expect(normalized.dynamicSpecialValues[0]?.conditions.requiredEffectKeywords).toEqual([
      { keyword: 'TestEffect', effectIds: [], status: 'missing', interpretation: 'keyword-membership-only' },
    ]);
    const effects = new Map(progression.effects.map((e) => [e.id, e]));
    const refs = [
      ...normalized.dynamicDots.flatMap((d) => d.conditions.requiredEffectKeywords ?? []),
      ...normalized.dynamicSpecialValues.flatMap((d) => d.conditions.requiredEffectKeywords ?? []),
      ...normalized.keywordRules.flatMap((r) => r.conditions.requiredEffectKeywords ?? []),
      ...normalized.abilities.flatMap((a) => [...a.effectKeywordConstraints, ...(a.conditionalKeywords ?? [])
        .flatMap((k) => [k.effectKeywordMustExist, k.effectKeywordMustNotExist].filter((r) => r !== null))]),
    ];
    for (const ref of refs) for (const id of ref.effectIds) expect(effects.get(id)?.keywords).toContain(ref.keyword);
  });

  it('produces byte-identical output twice from the verified pin', () => {
    expect(JSON.stringify(normalizeAbilities(official))).toBe(JSON.stringify(normalized));
  });
});

it('adds only published IconID and SpecialInfo facts, with explicit missing and malformed cases', () => {
  const input = fixture();
  input.abilities.ability_1!.IconID = 2118;
  input.abilities.ability_1!.SpecialInfo = 'Exact <uninterpreted> special text.';
  const abilities = normalizeAbilities(input).abilities;
  expect(abilities[0]).toMatchObject({ iconId: 2118, specialInfo: 'Exact <uninterpreted> special text.' });
  expect(abilities[1]).toMatchObject({ iconId: null, specialInfo: null });
  for (const value of [-1, 0.5, '2118']) {
    input.abilities.ability_1!.IconID = value;
    expect(() => normalizeAbilities(input)).toThrow(/IconID/);
  }
});

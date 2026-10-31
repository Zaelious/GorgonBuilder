// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { DatasetSource, ProgressionDatasetName } from '../normalized/progression';
import { normalizeProgression, NormalizationError } from './normalize-progression';
import type { ProgressionInput } from './normalize-progression';

const names = ['skills', 'advancementtables', 'attributes', 'effects'] as const;
function fixture() {
  const sources = Object.fromEntries(names.map((dataset) => [dataset, {
    dataset, gameDataVersion: 'vFixture', sourceUrl: `https://cdn.projectgorgon.com/vFixture/data/${dataset}.json`,
    sha256: 'a'.repeat(64),
  }])) as Record<ProgressionDatasetName, DatasetSource>;
  return {
    sources,
    skills: { Example: { Id: 1, Name: 'Example Skill', Description: '', Combat: true,
      GuestLevelCap: 15, MaxBonusLevels: 25, XpTable: 'ExampleXp',
      ActiveAdvancementTable: 'Example', PassiveAdvancementTable: 'Passive',
      Rewards: { '2': { Ability: 'UntouchedAbility', Notes: 'Official note' } },
      FutureMetadata: { flag: true } } },
    advancementtables: {
      '1_Example': { Keywords: ['OfficialKeyword'], Level_10: { HEALTH: 3 },
        Level_01: { HEALTH: 2, MYSTERY: { Value: 0, Description: 'Unknown reward', extra: [null, false] } } },
      '2_Passive': { Level_01: { HEALTH: 0.5 } },
    },
    attributes: { HEALTH: { DisplayRule: 'IfNotDefault', DisplayType: 'AsInteger', Label: 'Health', DefaultValue: 0 } },
    effects: { effect_1: { Name: 'Example', Desc: '', DisplayMode: 'Effect', IconId: 1,
      Keywords: ['Buff'], Duration: -2, FutureMetadata: { amount: 3 } } },
  };
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value === 'object' && value !== null) return Object.fromEntries(
    Object.entries(value).reverse().map(([key, v]) => [key, reverseKeys(v)]),
  );
  return value;
}

describe('progression normalization fixtures', () => {
  it('preserves identity, references, numeric level order, Keywords and raw unknown rewards', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const result = normalizeProgression(input);
    expect(result.skills[0]).toMatchObject({ id: 'Example', officialNumericId: 1,
      activeAdvancement: { sourceName: 'Example', tableId: '1_Example' },
      passiveAdvancement: { sourceName: 'Passive', tableId: '2_Passive' },
      raw: { FutureMetadata: { flag: true } },
      progression: [{ level: 2, sourceLevelKey: '2', raw: { Ability: 'UntouchedAbility', Notes: 'Official note' } }],
    });
    expect(result.advancementTables[0]?.keywords).toEqual(['OfficialKeyword']);
    expect(result.advancementTables[0]?.progression.map((p) => p.level)).toEqual([1, 10]);
    expect(result.advancementTables[0]?.progression[0]?.rewards).toEqual([
      { id: 'HEALTH', value: 2, interpretation: 'uninterpreted', attributeReference: { id: 'HEALTH', status: 'resolved' } },
      { id: 'MYSTERY', value: { Value: 0, Description: 'Unknown reward', extra: [null, false] },
        interpretation: 'uninterpreted', attributeReference: { id: 'MYSTERY', status: 'missing' } },
    ]);
    expect(result.integrityIssues).toEqual([{ code: 'missing-attribute', tableId: '1_Example',
      sourceLevelKey: 'Level_01', rewardId: 'MYSTERY',
      message: expect.stringContaining('unresolved attribute MYSTERY') }]);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.skills[0]?.raw).not.toBe(input.skills.Example);
    expect(result.effects[0]?.raw).toEqual(input.effects.effect_1);
  });

  it('distinguishes absent optional references/fields from invalid references', () => {
    const input = fixture();
    Reflect.deleteProperty(input.skills.Example, 'ActiveAdvancementTable');
    Reflect.deleteProperty(input.skills.Example, 'PassiveAdvancementTable');
    Reflect.deleteProperty(input.skills.Example, 'Name');
    Reflect.deleteProperty(input.effects.effect_1, 'Duration');
    const result = normalizeProgression(input);
    expect(result.skills[0]).toMatchObject({ name: null, activeAdvancement: null, passiveAdvancement: null });
    expect(result.effects[0]).toMatchObject({ duration: null, abilityKeywords: null });
    input.skills.Example.ActiveAdvancementTable = '';
    expect(() => normalizeProgression(input)).toThrow('skills.Example.ActiveAdvancementTable: expected a nonempty string');
  });

  it.each(['ActiveAdvancementTable', 'PassiveAdvancementTable'] as const)('fails explicitly on missing %s', (field) => {
    const input = fixture();
    input.skills.Example[field] = 'Missing';
    expect(() => normalizeProgression(input)).toThrow(`skills.Example.${field}: unresolved advancement-table reference Missing`);
    expect(() => normalizeProgression(input)).toThrow(NormalizationError);
  });

  it('detects conflicting skill IDs, table names, table numeric IDs, and level aliases', () => {
    const input = fixture();
    expect(() => normalizeProgression({ ...input, skills: { ...input.skills, Other: { ...input.skills.Example } } })).toThrow('duplicate or conflicting identifier 1');
    expect(() => normalizeProgression({ ...input, advancementtables: { ...input.advancementtables, '3_Example': {} } })).toThrow('conflicting advancement name Example');
    expect(() => normalizeProgression({ ...input, advancementtables: { ...input.advancementtables, '1_Other': {} } })).toThrow('duplicate or conflicting identifier 1');
    expect(() => normalizeProgression({ ...input, advancementtables: { ...input.advancementtables,
      '3_Other': { Level_01: {}, Level_1: {} } } })).toThrow('duplicate or conflicting identifier 1');
  });

  it.each([
    ['skills.Example.Id', (i: ReturnType<typeof fixture>) => { Reflect.deleteProperty(i.skills.Example, 'Id'); }],
    ['skills.Example.Combat', (i: ReturnType<typeof fixture>) => { Object.assign(i.skills.Example, { Combat: 'yes' }); }],
    ['skills.Example.Rewards', (i: ReturnType<typeof fixture>) => { Object.assign(i.skills.Example, { Rewards: null }); }],
    ['advancementtables.1_Example.Keywords', (i: ReturnType<typeof fixture>) => { Object.assign(i.advancementtables['1_Example'], { Keywords: [1] }); }],
    ['advancementtables.1_Example.Level_01', (i: ReturnType<typeof fixture>) => { Object.assign(i.advancementtables['1_Example'], { Level_01: [] }); }],
    ['advancementtables.1_Example.Unknown', (i: ReturnType<typeof fixture>) => { Object.assign(i.advancementtables['1_Example'], { Unknown: {} }); }],
    ['attributes.HEALTH.DisplayRule', (i: ReturnType<typeof fixture>) => { Reflect.deleteProperty(i.attributes.HEALTH, 'DisplayRule'); }],
    ['effects.effect_1.Name', (i: ReturnType<typeof fixture>) => { Reflect.deleteProperty(i.effects.effect_1, 'Name'); }],
    ['effects.effect_1.Duration', (i: ReturnType<typeof fixture>) => { i.effects.effect_1.Duration = Infinity; }],
  ])('reports a useful malformed record path: %s', (path, mutate) => {
    const input = fixture();
    mutate(input);
    expect(() => normalizeProgression(input)).toThrow(path);
  });

  it('is deterministic with fresh copies and reordered input keys', () => {
    const input = fixture();
    const result = normalizeProgression(input);
    expect(normalizeProgression(structuredClone(input))).toEqual(result);
    // Provenance has a typed fixed contract; source field insertion order is irrelevant to record order.
    expect(JSON.stringify(normalizeProgression({ ...input,
      skills: reverseKeys(input.skills), advancementtables: reverseKeys(input.advancementtables),
      effects: reverseKeys(input.effects), attributes: reverseKeys(input.attributes),
    }))).toBe(JSON.stringify(result));
    expect(result.skills[0]?.source).toMatchObject({ gameDataVersion: 'vFixture', dataset: 'skills', recordId: 'Example' });
  });

  it('reports missing skill XP attributes and preserves published effect duration types', () => {
    const input = fixture();
    Object.assign(input.skills.Example, { XpEarnedAttributes: ['HEALTH', 'UNKNOWN_XP'] });
    Object.assign(input.effects.effect_1, { Name: '', Duration: '7200' });
    const output = normalizeProgression(input);
    expect(output.skills[0]?.xpEarnedAttributes).toEqual([{ id: 'HEALTH', status: 'resolved' }, { id: 'UNKNOWN_XP', status: 'missing' }]);
    expect(output.integrityIssues).toContainEqual({ code: 'missing-xp-attribute', skillId: 'Example', attributeId: 'UNKNOWN_XP', message: expect.stringContaining('unresolved attribute UNKNOWN_XP') });
    expect(output.effects[0]).toMatchObject({ name: '', duration: '7200' });
  });

  it('retains qualified levels separately without claiming unconditional applicability', () => {
    const input = fixture();
    Object.assign(input.skills.Example.Rewards, { '2_Fae': { Ability: ['A', 'B'] }, '2_Orc': { Notes: 'Other' } });
    const levels = normalizeProgression(input).skills[0]!.progression;
    expect(levels.map((p) => [p.level, p.sourceQualifier])).toEqual([[2, null], [2, 'Fae'], [2, 'Orc']]);
    expect(levels[1]?.rewards[0]?.value).toEqual(['A', 'B']);
  });

  it('rejects mixed-version or incorrect provenance', () => {
    const input = fixture();
    input.sources.skills = { ...input.sources.skills, gameDataVersion: 'vOther' };
    expect(() => normalizeProgression(input)).toThrow('datasets must belong to one game-data version');
    input.sources.skills = { ...input.sources.skills, gameDataVersion: 'vFixture', dataset: 'effects' };
    expect(() => normalizeProgression(input)).toThrow('conflicting dataset provenance');
  });
});

const rawRoot = new URL('../raw/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('snapshot.json', rawRoot), 'utf8')) as {
  upstreamVersion: string;
  datasets: { name: string; sourceUrl: string; integrity: { sha256: string } }[];
};
const official = { sources: {} } as ProgressionInput;
for (const dataset of names) {
  const entry = manifest.datasets.find((d) => d.name === dataset)!;
  Object.assign(official.sources, { [dataset]: { dataset, gameDataVersion: manifest.upstreamVersion,
    sourceUrl: entry.sourceUrl, sha256: entry.integrity.sha256 } });
  Object.assign(official, { [dataset]: JSON.parse(await readFile(new URL(`cache/${manifest.upstreamVersion}/${dataset}.json`, rawRoot), 'utf8')) as unknown });
}
const normalized = normalizeProgression(official);

describe('pinned official snapshot integration', () => {
  it('preserves all four dataset counts and validates the implemented reference namespaces', () => {
    expect([normalized.skills.length, normalized.advancementTables.length, normalized.attributes.length, normalized.effects.length])
      .toEqual([188, 588, 2189, 23282]);
    expect(normalized.integrityIssues).toEqual([]);
    for (const skill of normalized.skills) {
      expect(Object.fromEntries(skill.progression.map((p) => [p.sourceLevelKey, p.raw])))
        .toEqual((official.skills as Record<string, { Rewards: unknown }>)[skill.id]!.Rewards);
    }
    expect(normalized.advancementTables.filter((t) => t.keywords !== null)).toHaveLength(148);
    const tables = new Set(normalized.advancementTables.map((t) => t.id));
    for (const skill of normalized.skills) {
      for (const ref of [skill.activeAdvancement, skill.passiveAdvancement]) if (ref) expect(tables.has(ref.tableId)).toBe(true);
    }
  });

  it.each([
    ['Psychology', 27, 'Balanced', '3_Balanced', 2], ['Cow', 32, 'PlayerCow', '11_PlayerCow', 28],
    ['Unarmed', 1, 'Balanced', '3_Balanced', 2], ['Deer', 31, 'PlayerDeer', '15_PlayerDeer', 28],
  ] as const)('inspects %s identity, level progression and exact advancement values', (id, numericId, name, tableId, health) => {
    const skill = normalized.skills.find((s) => s.id === id)!;
    expect(skill.officialNumericId).toBe(numericId);
    expect(skill.activeAdvancement).toEqual({ sourceName: name, tableId });
    expect(skill.guestLevelCap).toBe(15);
    expect(skill.maxBonusLevels).toBe(25);
    const table = normalized.advancementTables.find((t) => t.id === tableId)!;
    expect(table.progression[0]).toMatchObject({ level: 1, sourceLevelKey: 'Level_01',
      rewards: expect.arrayContaining([{ id: 'MAX_HEALTH', value: health, interpretation: 'uninterpreted',
        attributeReference: { id: 'MAX_HEALTH', status: 'resolved' } }]) });
    expect(table.progression.find((p) => p.level === 90)).toBeDefined();
    const sourceSkill = (official.skills as Record<string, unknown>)[id];
    expect(skill.raw).toEqual(sourceSkill);
    // Every field/value survives, including Notes, ability IDs, hints and caps.
    expect(Object.fromEntries(skill.progression.map((p) => [p.sourceLevelKey, p.raw])))
      .toEqual((sourceSkill as { Rewards: unknown }).Rewards);
  });

  it('preserves all advancement levels/rewards and attribute/effect definitions', () => {
    const tables = official.advancementtables as Record<string, Record<string, unknown>>;
    for (const table of normalized.advancementTables) {
      expect(table.raw).toEqual(tables[table.id]);
      const levels = Object.fromEntries(Object.entries(tables[table.id]!).filter(([key]) => key !== 'Keywords'));
      expect(Object.fromEntries(table.progression.map((p) => [p.sourceLevelKey,
        Object.fromEntries(p.rewards.map((r) => [r.id, r.value]))]))).toEqual(levels);
    }
    for (const attr of normalized.attributes) expect(attr.raw).toEqual((official.attributes as Record<string, unknown>)[attr.id]);
    for (const effect of normalized.effects) expect(effect.raw).toEqual((official.effects as Record<string, unknown>)[effect.id]);
  });

  it('produces byte-identical serialized output twice from the pinned input', () => {
    expect(JSON.stringify(normalizeProgression(official))).toBe(JSON.stringify(normalized));
  });
});

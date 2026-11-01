// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { DatasetSource, JsonObject, ProgressionDatasetName } from '../normalized/progression';
import type { ItemTreasureDatasetName, ItemTreasureDatasetSource } from '../normalized/items-treasure';
import { normalizeProgression, NormalizationError } from './normalize-progression';
import { normalizeItemsTreasure } from './normalize-items-treasure';
import type { ItemTreasureInput } from './normalize-items-treasure';

const itemDatasets = ['items', 'tsysclientinfo', 'tsysprofiles', 'sources_items'] as const;
const progressionDatasets = ['skills', 'advancementtables', 'attributes', 'effects'] as const;
function provenance<T extends string>(names: readonly T[]) {
  return Object.fromEntries(names.map((dataset) => [dataset, { dataset, gameDataVersion: 'vFixture',
    sourceUrl: `https://cdn.projectgorgon.com/vFixture/data/${dataset}.json`, sha256: 'a'.repeat(64) }]));
}
function fixture() {
  const progression = normalizeProgression({ sources: provenance(progressionDatasets) as Record<ProgressionDatasetName, DatasetSource>,
    skills: { Example: { Id: 1, Description: '', Combat: true, GuestLevelCap: 15,
      MaxBonusLevels: 25, XpTable: 'Xp', Rewards: {} } }, advancementtables: {}, attributes: {}, effects: {} });
  const items: Record<string, JsonObject> = {
    item_1: { InternalName: 'Example90', Name: ' Ｒｉｎｇ\n of  Psychic Light ', Description: 'Combat refresh; power_999 is prose.',
      EquipSlot: 'Ring', CraftingTargetLevel: 90, Keywords: ['Jewelry', 'Psychic'], SkillReqs: { Example: 40 },
      EffectDescs: ['{UNKNOWN_STAT}{0.12}', 'When you kick: something uncertain'], Behaviors: [{ UseVerb: 'Equip', Future: false }],
      TSysProfile: 'All', Future: { z: [null, true, 0], a: 'keep' } },
    item_2: { InternalName: 'Saddle', Name: '', Description: '', EquipSlot: 'Saddle', SkillReqs: { Example: 0 } },
    item_3: { InternalName: 'Ingredient', Name: 'Not equipment', Description: 'Do not infer a slot', Keywords: ['Equipment'] },
  };
  const tier = { EffectDescs: ['{BOOST_UNKNOWN}{0}'], MinLevel: 0, MaxLevel: 100, MinRarity: 'Uncommon', SkillLevelPrereq: 0 };
  const tsysclientinfo: Record<string, JsonObject> = {
    power_1: { InternalName: 'Boost', Skill: 'Example', Slots: ['Ring'], Prefix: '', IsUnavailable: false,
      Tiers: { id_1: { ...tier, Future: { unknown: [false, null] } },
        id_10: { ...tier, EffectDescs: ['A completely different value: 123'], MinLevel: 90 } }, FutureConstraint: 'preserve' },
    power_2: { InternalName: 'OtherBoost', Skill: 'Example', Slots: ['Saddle'], Suffix: 'of Other',
      Tiers: { id_1: { ...tier, EffectDescs: ['Not power_1 tier 1'], MaxLevel: 500 } } },
  };
  const tsysprofiles: Record<string, string[]> = { All: ['Boost', 'OtherBoost'], None: [] };
  const sources_items: Record<string, JsonObject> = {
    item_1: { entries: [{ type: 'Vendor', npc: 'UnknownNpc', Future: 0 }], Future: true },
    item_3: { entries: [{ type: 'UnrecognizedSource', value: 9 }] },
  };
  return { progression, sources: provenance(itemDatasets) as Record<ItemTreasureDatasetName, ItemTreasureDatasetSource>,
    items, tsysclientinfo, tsysprofiles, sources_items };
}
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse()
    .map(([key, entry]) => [key, reverseKeys(entry)]));
  return value;
}

describe('item and treasure normalization fixtures', () => {
  it('preserves the exact published IconId for display, with null for missing icons', () => {
    const input = fixture();
    input.items.item_1!.IconId = 15208;
    const output = normalizeItemsTreasure(input);
    expect(output.items[0]!.iconId).toBe(15208);
    expect(output.items[0]!.raw.IconId).toBe(15208);
    expect(output.items[1]!.iconId).toBeNull();
  });

  it.each([-1, 1.5, '15208', null])('rejects malformed published IconId %s', iconId => {
    const input = fixture();
    input.items.item_1!.IconId = iconId;
    expect(() => normalizeItemsTreasure(input)).toThrow('items.item_1.IconId');
  });
  it('keeps item identity, published target level, equip requirements, slot and fixed descriptions distinct', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const output = normalizeItemsTreasure(input);
    expect(output.schemaVersion).toBe(1);
    expect(output.integrityIssues).toEqual([]);
    expect(output.items[0]).toMatchObject({ id: 'item_1', internalName: 'Example90', displayName: input.items.item_1!.Name,
      level: 90, levelSource: 'CraftingTargetLevel', slot: 'Ring', keywords: ['Jewelry', 'Psychic'],
      skillRequirements: [{ skill: { sourceId: 'Example', skillId: 'Example', status: 'resolved' }, level: 40 }],
      treasureProfile: { profileId: 'All', status: 'resolved' }, acquisitionSourceRecordId: 'item_1',
      fixedEffects: [{ description: '{UNKNOWN_STAT}{0.12}', interpretation: 'uninterpreted',
        source: { dataset: 'items', recordId: 'item_1.EffectDescs[0]' } }, { description: 'When you kick: something uncertain' }],
      behaviors: input.items.item_1!.Behaviors, raw: input.items.item_1 });
    expect(output.items[0]?.raw).not.toBe(input.items.item_1);
    expect(output.items[0]?.raw.Future).not.toBe(input.items.item_1!.Future);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('selects equipment by explicit EquipSlot, accounts for exclusions and invents no missing gameplay values', () => {
    const output = normalizeItemsTreasure(fixture());
    expect(output.items.map((r) => r.id)).toEqual(['item_1', 'item_2']);
    expect(output.nonEquipmentItemIds).toEqual(['item_3']);
    expect(output.items[1]).toMatchObject({ slot: 'Saddle', displayName: '', level: null, levelSource: null,
      treasureProfile: null, keywords: null, fixedEffects: null, behaviors: null, acquisitionSourceRecordId: null });
  });

  it('uses power-scoped tier identities and only published tiers and values, without interpreting descriptions', () => {
    const output = normalizeItemsTreasure(fixture());
    const power = output.treasurePowers[0]!;
    expect(power).toMatchObject({ id: 'power_1', internalName: 'Boost', prefix: '', suffix: null, slots: ['Ring'],
      isUnavailable: false, isHiddenFromTransmutation: null, interpretation: 'uninterpreted' });
    expect(power.tiers.map((t) => t.id)).toEqual(['id_1', 'id_10']);
    expect(power.tiers[0]).toMatchObject({ powerId: 'power_1', id: 'id_1', effectDescriptions: ['{BOOST_UNKNOWN}{0}'],
      minLevel: 0, maxLevel: 100, minRarity: 'Uncommon', skillLevelPrerequisite: 0,
      source: { dataset: 'tsysclientinfo', recordId: 'power_1.Tiers.id_1' }, raw: { Future: { unknown: [false, null] } } });
    expect(power.tiers[1]).toMatchObject({ powerId: 'power_1', id: 'id_10', minLevel: 90,
      effectDescriptions: ['A completely different value: 123'] });
    expect(output.treasurePowers[1]?.tiers[0]).toMatchObject({ powerId: 'power_2', id: 'id_1', maxLevel: 500,
      effectDescriptions: ['Not power_1 tier 1'], source: { recordId: 'power_2.Tiers.id_1' } });
  });

  it('resolves profile members by InternalName without inventing profile inheritance, slots or tier rules', () => {
    const input = fixture();
    input.tsysprofiles.All!.push('Boost');
    const output = normalizeItemsTreasure(input);
    expect(output.treasureProfiles[0]).toMatchObject({ id: 'All', raw: ['Boost', 'OtherBoost', 'Boost'],
      source: { dataset: 'tsysprofiles', recordId: 'All' }, interpretation: 'membership-only',
      powers: [{ internalName: 'Boost', powerId: 'power_1', status: 'resolved' },
        { internalName: 'OtherBoost', powerId: 'power_2', status: 'resolved' },
        { internalName: 'Boost', powerId: 'power_1', status: 'resolved' }] });
    expect(output.treasureProfiles[1]?.powers).toEqual([]);
    expect(output.treasurePowers[1]?.slots).toEqual(['Saddle']);
  });

  it('preserves all acquisition metadata and distinguishes valid non-equipment sources from missing items', () => {
    const input = fixture();
    input.sources_items.item_999 = { entries: [] };
    const output = normalizeItemsTreasure(input);
    expect(output.acquisitionSources[0]).toMatchObject({ itemId: 'item_1', entries: input.sources_items.item_1!.entries,
      raw: input.sources_items.item_1, source: { dataset: 'sources_items', recordId: 'item_1' },
      itemReference: { status: 'resolved', equipmentItemId: 'item_1' } });
    expect(output.acquisitionSources[1]?.itemReference).toEqual({ status: 'resolved', equipmentItemId: null });
    expect(output.acquisitionSources[2]?.itemReference).toEqual({ status: 'missing', equipmentItemId: null });
    expect(output.integrityIssues.map((i) => i.code)).toEqual(['missing-item']);
  });

  it('retains missing profile, power and skill references and separates unsupported selectors from broken links', () => {
    const input = fixture();
    input.items.item_1!.TSysProfile = 'Absent';
    input.items.item_1!.SkillReqs = { MissingSkill: 90 };
    input.tsysprofiles.All!.push('AbsentPower');
    input.tsysclientinfo.power_1!.Skill = 'AnySkill';
    input.tsysclientinfo.power_2!.Skill = 'Unknown';
    const output = normalizeItemsTreasure(input);
    expect(output.items[0]?.treasureProfile).toEqual({ profileId: 'Absent', status: 'missing' });
    expect(output.items[0]?.skillRequirements?.[0]?.skill).toEqual({ sourceId: 'MissingSkill', skillId: null, status: 'missing' });
    expect(output.treasureProfiles[0]?.powers.at(-1)).toEqual({ internalName: 'AbsentPower', powerId: null, status: 'missing' });
    expect(output.treasurePowers[0]?.skill).toEqual({ sourceId: 'AnySkill', skillId: null, status: 'uninterpreted' });
    expect(output.treasurePowers[1]?.skill).toEqual({ sourceId: 'Unknown', skillId: null, status: 'missing' });
    expect(output.integrityIssues.map((i) => [i.code, i.reference]).sort()).toEqual([
      ['missing-profile', 'Absent'], ['missing-power', 'AbsentPower'], ['missing-skill', 'Unknown'],
      ['missing-skill', 'MissingSkill'], ['unsupported-skill-selector', 'AnySkill'],
    ].sort());
    for (const issue of output.integrityIssues) {
      expect(issue.message).toContain(issue.path);
      expect(issue.category).toBe(issue.code === 'unsupported-skill-selector' ? 'unsupported-semantics' : 'unresolved-reference');
    }
  });

  it('retains unknown fields without guessing IDs, effects or eligibility from names and descriptions', () => {
    const input = fixture();
    input.items.item_2!.FuturePowerId = 'power_999';
    input.tsysclientinfo.power_1!.FutureTierReference = 'power_999.id_999';
    const output = normalizeItemsTreasure(input);
    expect(output.items[1]?.raw.FuturePowerId).toBe('power_999');
    expect(output.treasurePowers[0]?.raw.FutureTierReference).toBe('power_999.id_999');
    expect(output.integrityIssues).toEqual([]);
    expect(output.treasurePowers[0]?.raw.FutureConstraint).toBe('preserve');
  });

  it('prepares Unicode, case and whitespace normalized search text from official names and descriptions', () => {
    const output = normalizeItemsTreasure(fixture());
    expect(output.items[0]?.searchText).toContain('ring of psychic light');
    expect(output.items[0]?.searchText).toContain('combat refresh');
    expect(output.items[0]?.searchText).toContain('when you kick: something uncertain');
    expect(output.treasurePowers[0]?.searchText).toContain('a completely different value: 123');
    expect(output.treasurePowers[0]?.tiers[0]?.searchText).toBe('{boost_unknown}{0} {boost unknown}{0}');
    expect(output.items[0]?.searchText).not.toContain('lightning');
  });

  it.each([
    ['items.item_01', (i: ReturnType<typeof fixture>) => { i.items.item_01 = i.items.item_1!; }],
    ['items.item_1.InternalName', (i: ReturnType<typeof fixture>) => { Reflect.deleteProperty(i.items.item_1!, 'InternalName'); }],
    ['items.item_1.Name', (i: ReturnType<typeof fixture>) => { i.items.item_1!.Name = null; }],
    ['items.item_1.Description', (i: ReturnType<typeof fixture>) => { i.items.item_1!.Description = 1; }],
    ['items.item_1.EquipSlot', (i: ReturnType<typeof fixture>) => { i.items.item_1!.EquipSlot = ''; }],
    ['items.item_1.CraftingTargetLevel', (i: ReturnType<typeof fixture>) => { i.items.item_1!.CraftingTargetLevel = -1; }],
    ['items.item_1.EffectDescs[0]', (i: ReturnType<typeof fixture>) => { i.items.item_1!.EffectDescs = [3]; }],
    ['items.item_1.TSysProfile', (i: ReturnType<typeof fixture>) => { i.items.item_1!.TSysProfile = null; }],
    ['items.item_1.SkillReqs.Example', (i: ReturnType<typeof fixture>) => { i.items.item_1!.SkillReqs = { Example: 1.5 }; }],
    ['items.item_1.Behaviors[0]', (i: ReturnType<typeof fixture>) => { i.items.item_1!.Behaviors = [null]; }],
    ['tsysclientinfo.power_1.Slots', (i: ReturnType<typeof fixture>) => { i.tsysclientinfo.power_1!.Slots = 'Ring'; }],
    ['tsysclientinfo.power_1.Tiers', (i: ReturnType<typeof fixture>) => { i.tsysclientinfo.power_1!.Tiers = []; }],
    ['tsysclientinfo.power_1.Tiers.id_01', (i: ReturnType<typeof fixture>) => {
      (i.tsysclientinfo.power_1!.Tiers as JsonObject).id_01 = (i.tsysclientinfo.power_1!.Tiers as JsonObject).id_1!;
    }],
    ['tsysclientinfo.power_1.Tiers.id_1.MinLevel', (i: ReturnType<typeof fixture>) => {
      ((i.tsysclientinfo.power_1!.Tiers as JsonObject).id_1 as JsonObject).MinLevel = Infinity;
    }],
    ['tsysclientinfo.power_1.Tiers.id_1.EffectDescs', (i: ReturnType<typeof fixture>) => {
      Reflect.deleteProperty((i.tsysclientinfo.power_1!.Tiers as JsonObject).id_1 as JsonObject, 'EffectDescs');
    }],
    ['sources_items.item_1.entries[0]', (i: ReturnType<typeof fixture>) => { i.sources_items.item_1!.entries = [false]; }],
  ])('rejects malformed source values with paths: %s', (path, mutate) => {
    const input = fixture(); mutate(input);
    expect(() => normalizeItemsTreasure(input)).toThrow(path);
    expect(() => normalizeItemsTreasure(input)).toThrow(NormalizationError);
  });

  it('rejects an incompatible profile shape rather than assuming unpublished constraints', () => {
    const input = fixture();
    expect(() => normalizeItemsTreasure({ ...input, tsysprofiles: { All: { Powers: ['Boost'] } } })).toThrow('tsysprofiles.All');
  });

  it('rejects conflicting internal names and reused progression identities', () => {
    const input = fixture();
    input.items.item_2!.InternalName = 'Example90';
    expect(() => normalizeItemsTreasure(input)).toThrow('duplicate or conflicting internal name Example90');
    input.items.item_2!.InternalName = 'Saddle';
    input.tsysclientinfo.power_2!.InternalName = 'Boost';
    expect(() => normalizeItemsTreasure(input)).toThrow('duplicate or conflicting internal name Boost');
    input.tsysclientinfo.power_2!.InternalName = 'OtherBoost';
    input.progression = { ...input.progression, skills: [...input.progression.skills, input.progression.skills[0]!] };
    expect(() => normalizeItemsTreasure(input)).toThrow('duplicate or conflicting identifier Example');
  });

  it('rejects mixed versions, malformed provenance and conflicting progression provenance', () => {
    const input = fixture();
    input.sources.items = { ...input.sources.items, gameDataVersion: 'vOther' };
    expect(() => normalizeItemsTreasure(input)).toThrow('one game-data version');
    input.sources.items = { ...input.sources.items, gameDataVersion: 'vFixture', sha256: 'bad' };
    expect(() => normalizeItemsTreasure(input)).toThrow('expected SHA-256');
    input.sources.items = { ...input.sources.items, sha256: 'a'.repeat(64), dataset: 'sources_items' };
    expect(() => normalizeItemsTreasure(input)).toThrow('conflicting dataset provenance');
    input.sources.items = { ...input.sources.items, dataset: 'items', sourceUrl: '' };
    expect(() => normalizeItemsTreasure(input)).toThrow('sources.items.sourceUrl');
    input.sources.items = { ...input.sources.items, sourceUrl: 'https://example.test/items' };
    input.progression = { ...input.progression, skills: input.progression.skills.map((s) => ({
      ...s, source: { ...s.source, gameDataVersion: 'vOther' },
    })) };
    expect(() => normalizeItemsTreasure(input)).toThrow('conflicting T0003 record provenance');
  });

  it('accepts empty supporting datasets while retaining unresolved equipment', () => {
    const input = fixture();
    const output = normalizeItemsTreasure({ ...input, tsysprofiles: {}, tsysclientinfo: {}, sources_items: {} });
    expect(output.items).toHaveLength(2);
    expect(output.treasurePowers).toEqual([]);
    expect(output.treasureProfiles).toEqual([]);
    expect(output.acquisitionSources).toEqual([]);
    expect(output.integrityIssues.map((i) => i.code)).toEqual(['missing-profile']);
  });

  it('is deterministic across copies and input object ordering, preserving array ordering', () => {
    const input = fixture();
    const output = JSON.stringify(normalizeItemsTreasure(input));
    expect(JSON.stringify(normalizeItemsTreasure(structuredClone(input)))).toBe(output);
    expect(JSON.stringify(normalizeItemsTreasure(reverseKeys(input) as ItemTreasureInput))).toBe(output);
  });
});

const root = new URL('../raw/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('snapshot.json', root), 'utf8')) as {
  upstreamVersion: string; datasets: { name: string; sourceUrl: string; integrity: { sha256: string }; records: number }[];
};
const parsed: Record<string, unknown> = {};
const sources: Record<string, unknown> = {};
for (const dataset of [...progressionDatasets, ...itemDatasets]) {
  const entry = manifest.datasets.find((d) => d.name === dataset)!;
  const bytes = await readFile(new URL(`cache/${manifest.upstreamVersion}/${dataset}.json`, root));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.integrity.sha256) throw new Error(`Pinned hash mismatch: ${dataset}`);
  parsed[dataset] = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  sources[dataset] = { dataset, gameDataVersion: manifest.upstreamVersion, sourceUrl: entry.sourceUrl, sha256: entry.integrity.sha256 };
}
const progression = normalizeProgression({ ...parsed, sources } as Parameters<typeof normalizeProgression>[0]);
const official: ItemTreasureInput = { items: parsed.items, tsysclientinfo: parsed.tsysclientinfo,
  tsysprofiles: parsed.tsysprofiles, sources_items: parsed.sources_items, progression,
  sources: sources as Record<ItemTreasureDatasetName, ItemTreasureDatasetSource> };
const normalized = normalizeItemsTreasure(official);
const rawItems = parsed.items as Record<string, JsonObject>;
const rawPowers = parsed.tsysclientinfo as Record<string, JsonObject>;
const rawProfiles = parsed.tsysprofiles as Record<string, string[]>;
const rawSources = parsed.sources_items as Record<string, JsonObject>;

describe(`verified official ${manifest.upstreamVersion} item and treasure snapshot`, () => {
  it('accounts for every input item, power, tier, profile and acquisition record', () => {
    expect(normalized.items).toHaveLength(3078);
    expect(normalized.nonEquipmentItemIds).toHaveLength(8131);
    expect([...normalized.items.map((i) => i.id), ...normalized.nonEquipmentItemIds].sort()).toEqual(Object.keys(rawItems).sort());
    expect(normalized.treasurePowers).toHaveLength(1947);
    expect(normalized.treasurePowers.reduce((n, p) => n + p.tiers.length, 0)).toBe(45634);
    expect(normalized.treasureProfiles).toHaveLength(40);
    expect(normalized.treasureProfiles.reduce((n, p) => n + p.powers.length, 0)).toBe(8649);
    expect(normalized.acquisitionSources).toHaveLength(10068);
    expect(normalized.items.filter((i) => i.level !== null && i.level >= 90)).toHaveLength(518);
    expect(normalized.items.filter((i) => i.level === null)).toHaveLength(500);
    expect(new Set(normalized.items.map((i) => i.slot)).size).toBe(19);
  });

  it('preserves every in-scope raw record, description, tier identity and source hash/URL/version', () => {
    for (const [records, dataset, raw] of [
      [normalized.items, 'items', rawItems], [normalized.treasurePowers, 'tsysclientinfo', rawPowers],
      [normalized.treasureProfiles, 'tsysprofiles', rawProfiles],
    ] as const) {
      const expectedSource = sources[dataset];
      for (const record of records) {
        expect(record.raw).toEqual(raw[record.id]);
        expect(record.source).toEqual({ ...(expectedSource as object), recordId: record.id });
      }
    }
    for (const power of normalized.treasurePowers) {
      const rawTiers = rawPowers[power.id]!.Tiers as JsonObject;
      expect(power.tiers.map((t) => t.id)).toEqual(Object.keys(rawTiers).sort());
      for (const tier of power.tiers) {
        expect(tier.powerId).toBe(power.id);
        expect(tier.raw).toEqual(rawTiers[tier.id]);
        expect(tier.effectDescriptions).toEqual((rawTiers[tier.id] as JsonObject).EffectDescs);
        expect(tier.source).toEqual({ ...(sources.tsysclientinfo as object), recordId: `${power.id}.Tiers.${tier.id}` });
      }
    }
    for (const acquisition of normalized.acquisitionSources) {
      expect(acquisition.raw).toEqual(rawSources[acquisition.itemId]);
      expect(acquisition.source).toEqual({ ...(sources.sources_items as object), recordId: acquisition.itemId });
    }
  });

  it('resolves all explicit item/profile, profile/power, acquisition and item skill references', () => {
    const profiles = new Map(normalized.treasureProfiles.map((p) => [p.id, p]));
    const powers = new Map(normalized.treasurePowers.map((p) => [p.id, p]));
    const itemProfileRefs = normalized.items.flatMap((i) => i.treasureProfile ? [i.treasureProfile] : []);
    expect(itemProfileRefs).toHaveLength(2578);
    for (const ref of itemProfileRefs) { expect(ref.status).toBe('resolved'); expect(profiles.has(ref.profileId)).toBe(true); }
    for (const profile of normalized.treasureProfiles) for (const ref of profile.powers) {
      expect(ref.status).toBe('resolved');
      expect(powers.get(ref.powerId!)?.internalName).toBe(ref.internalName);
    }
    expect(normalized.acquisitionSources.every((s) => s.itemReference.status === 'resolved')).toBe(true);
    expect(normalized.acquisitionSources.filter((s) => s.itemReference.equipmentItemId !== null)).toHaveLength(2607);
    expect(normalized.items.flatMap((i) => i.skillRequirements ?? []).every((r) => r.skill.status === 'resolved')).toBe(true);
  });

  it.each([
    ['item_45640', "Nopec's Dreaded Dagger of Endless Nights", 'MainHand', 'Dagger', 'Knife', 60],
    ['item_45722', "Ruxandra's Bite", 'OffHand', 'Dirk', 'Knife', 60],
    ['item_45052', 'Umrad Shield', 'OffHandShield', 'Shield', 'Endurance', 80],
    ['item_42093', 'Umrad Coat', 'Chest', 'All', 'Endurance', 80],
    ['item_49070', 'Astounding Ilth Hale Ring', 'Ring', 'All', 'Endurance', 40],
    ['item_48081', 'Astounding Harukita Talisman', 'Necklace', 'All', 'Necromancy', 80],
  ] as const)('inspects real target-level-90 equipment %s with independent skill requirements', (id, displayName, slot, profileId, skill, skillLevel) => {
    const item = normalized.items.find((i) => i.id === id)!;
    expect(item).toMatchObject({ displayName, slot, level: 90, levelSource: 'CraftingTargetLevel',
      treasureProfile: { profileId, status: 'resolved' }, skillRequirements: [{ skill: { skillId: skill }, level: skillLevel }] });
    expect(item.fixedEffects?.map((e) => e.description)).toEqual(rawItems[id]!.EffectDescs);
    expect(item.fixedEffects?.every((e) => e.interpretation === 'uninterpreted')).toBe(true);
  });

  it('retains innate prose, missing levels, mount slots, racial slots and actual acquisition entries', () => {
    const byId = new Map(normalized.items.map((i) => [i.id, i]));
    expect(byId.get('item_49070')?.fixedEffects?.[0]?.description).toBe("Equipping this allows you to use the ability Ilth Hale's Kiss 9");
    expect(byId.get('item_42093')?.searchText).toContain('combat_refresh');
    expect(byId.get('item_42093')?.searchText).toContain('combat refresh');
    expect(byId.get('item_40002')).toMatchObject({ level: null, levelSource: null, treasureProfile: null, slot: 'Feet', acquisitionSourceRecordId: 'item_40002' });
    expect(normalized.acquisitionSources.find((s) => s.itemId === 'item_40002')?.entries).toEqual([
      { npc: 'NPC_Richter', type: 'Vendor' }, { npc: 'NPC_Harry', type: 'Vendor' }, { npc: 'NPC_Joe', type: 'Vendor' },
    ]);
    expect(byId.get('item_56001')).toMatchObject({ slot: 'Saddle', treasureProfile: { profileId: 'Riding' } });
    expect(byId.get('item_50001')).toMatchObject({ slot: 'Racial', treasureProfile: { profileId: 'All' } });
    expect(byId.get('item_56405')?.keywords).not.toContain('Equipment');
    expect(byId.get('item_56405')?.slot).toBe('MountGlamour');
  });

  it('inspects separate real power tiers, including the unusual id_120, without substituting values', () => {
    const archery = normalized.treasurePowers.find((p) => p.id === 'power_10001')!;
    expect(archery).toMatchObject({ internalName: 'ArcheryBoost', skill: { skillId: 'Archery', status: 'resolved' }, slots: ['Head', 'OffHand'] });
    expect(archery.tiers.find((t) => t.id === 'id_1')).toMatchObject({ minLevel: 10, maxLevel: 30, skillLevelPrerequisite: 10,
      effectDescriptions: ['{BOOST_SKILL_ARCHERY}{5}'] });
    expect(archery.tiers.find((t) => t.id === 'id_9')).toMatchObject({ minLevel: 90, maxLevel: 110, skillLevelPrerequisite: 90,
      effectDescriptions: ['{MOD_SKILL_ARCHERY}{0.45}', '{DELTA_ANATOMY_CRITICAL_CHANCE}{0.025}'] });
    expect(normalized.treasurePowers.find((p) => p.id === 'power_129')?.tiers.find((t) => t.id === 'id_120'))
      .toMatchObject({ powerId: 'power_129', id: 'id_120', minLevel: 120, maxLevel: 135,
        effectDescriptions: ['{MITIGATION_SLASHING}{13}', '{MITIGATION_CRUSHING}{13}', '{MITIGATION_PIERCING}{13}'] });
    expect(normalized.treasureProfiles.find((p) => p.id === 'All')?.powers.some((p) => p.powerId === archery.id)).toBe(true);
    expect(normalized.treasureProfiles.find((p) => p.id === 'Dagger')?.powers.some((p) => p.powerId === archery.id)).toBe(false);
  });

  it('reports six unresolved Unknown skills separately from 90 unevaluated AnySkill selectors', () => {
    expect(normalized.integrityIssues).toHaveLength(96);
    expect(normalized.integrityIssues.filter((i) => i.category === 'unresolved-reference')).toHaveLength(6);
    expect(normalized.integrityIssues.filter((i) => i.category === 'unsupported-semantics')).toHaveLength(90);
    expect(normalized.integrityIssues.filter((i) => i.code === 'missing-skill').every((i) => i.reference === 'Unknown')).toBe(true);
    expect(normalized.treasurePowers.find((p) => p.id === 'power_13501')?.skill).toEqual({ sourceId: 'Unknown', skillId: null, status: 'missing' });
    expect(normalized.treasurePowers.filter((p) => p.skill.status === 'resolved')).toHaveLength(1851);
  });

  it('serializes identical output twice from the verified official pin', () => {
    expect(JSON.stringify(normalizeItemsTreasure(official))).toBe(JSON.stringify(normalized));
  });
});

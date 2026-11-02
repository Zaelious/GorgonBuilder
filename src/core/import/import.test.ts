// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { JsonObject, JsonValue } from '../../data/normalized/progression';
import type { GameDataManifest, RuntimeGameData } from '../../data/repository/contracts';
import { createGameDataRepository } from '../../data/repository/repository';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import type { ImportReferenceResolver, ImportResult } from './contracts';
import { parseCharacterSheet, parseCharacterSheetJson, parseStorage, parseStorageJson } from './index';

type CharacterFixture = JsonObject & { Skills: Record<string, JsonObject>; CurrentStats: JsonObject };
type StorageFixture = JsonObject & { Items: JsonObject[] };
const characterText = readFileSync(new URL('./fixtures/character-sheet.json', import.meta.url), 'utf8');
const storageText = readFileSync(new URL('./fixtures/storage.json', import.meta.url), 'utf8');
const character = () => JSON.parse(characterText) as CharacterFixture;
const storage = () => JSON.parse(storageText) as StorageFixture;
function success<T>(result: ImportResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected fixture to parse.');
  return result.value;
}
function error<T>(result: ImportResult<T>, code: string, path: string) {
  expect(result).toMatchObject({ ok: false, errors: [{ code, path, severity: 'error' }] });
}
let resolver: ImportReferenceResolver;
beforeAll(() => {
  const directory = new URL('../../generated/game-data/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as GameDataManifest;
  const data = Object.fromEntries(Object.entries(manifest.artifacts).map(([name, artifact]) => [
    name, JSON.parse(gunzipSync(readFileSync(new URL(artifact.file, directory))).toString('utf8')) as unknown,
  ])) as RuntimeGameData;
  resolver = createImportReferenceResolver(createGameDataRepository(data, manifest));
});

describe('CharacterSheet', () => {
  it('preserves identity, exact source time/version, skills, progression, abilities and original stats', () => {
    const value = success(parseCharacterSheetJson(characterText, resolver));
    expect(value.source).toMatchObject({ characterName: 'Fixture Adventurer', server: 'Fixture Server',
      exportedAt: '2026-11-01T12:00:00Z', sourceReportVersion: 1, reportVersion: '1', resolvedWithGameDataVersion: 'v490', metadata: { Race: 'Human' } });
    expect(value.skills[0]).toMatchObject({ reference: { sourceId: 'Psychology', id: 'Psychology', status: 'resolved' },
      level: 90, bonusLevels: 5, xpTowardNextLevel: 123, xpNeededForNextLevel: 456 });
    expect(value.knownAbilities).toEqual([
      { sourceId: 'Psychoanalyze1', id: 'ability_1201', status: 'resolved' },
      { sourceId: 'ability_1205', id: 'ability_1205', status: 'resolved' },
      { sourceId: 'FixtureUnknownAbility', id: null, status: 'unresolved' },
    ]);
    expect(value.currentStats).toEqual(character().CurrentStats);
    expect(value.skills[1]?.reference).toMatchObject({ sourceId: 'FixtureUnknownSkill', id: null, status: 'unresolved' });
  });
  it('works without official data and never invents normalized IDs', () => {
    const value = success(parseCharacterSheet(character()));
    expect(value.skills[0]?.reference).toMatchObject({ id: null, status: 'not-checked' });
    expect(value.knownAbilities.every(ref => ref.status === 'not-checked')).toBe(true);
    expect(value.source.resolvedWithGameDataVersion).toBeNull();
  });
  it('retains unknown report, skill and stat fields without interpreting them', () => {
    const input = character();
    input.FutureMetadata = { nested: [true, null, 'preserve'] };
    input.Items = { unknownOptionalFieldOnCharacter: true };
    input.Skills.Psychology!.FutureProgression = { unknown: 1 };
    input.CurrentStats.FutureStat = { units: 'unverified', value: 7 };
    const result = parseCharacterSheet(input);
    const value = success(result);
    expect(value.source.metadata.FutureMetadata).toEqual(input.FutureMetadata);
    expect(value.source.metadata.Items).toEqual(input.Items);
    expect(value.skills[0]?.metadata.FutureProgression).toEqual({ unknown: 1 });
    expect(value.currentStats.FutureStat).toEqual(input.CurrentStats.FutureStat);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'uninterpreted-stat', path: '/CurrentStats/FutureStat' }));
  });
  it('allows absent optional progression/abilities and an absent server', () => {
    const input = character();
    delete input.ServerName;
    input.Skills = { Psychology: { Level: 0 } };
    const value = success(parseCharacterSheet(input));
    expect(value.source.server).toBeNull();
    expect(value.skills[0]).toMatchObject({ level: 0, bonusLevels: null, xpTowardNextLevel: null, abilities: [] });
  });
  it('preserves the -1 next-XP sentinel from the sanitized review reproduction', () => {
    const text = readFileSync(new URL('./fixtures/character-sheet-no-next-xp.json', import.meta.url), 'utf8');
    const input = JSON.parse(text) as CharacterFixture;
    for (const lookup of [undefined, resolver]) {
      const result = parseCharacterSheetJson(text, lookup);
      const value = success(result);
      expect(value.skills[0]).toMatchObject({
        xpNeededForNextLevel: -1, xpTowardNextLevel: 0,
        metadata: { XpNeededForNextLevel: -1 },
      });
      expect(parseCharacterSheet(input, lookup)).toEqual(result);
      expect(success(JSON.parse(JSON.stringify(result)) as ImportResult<typeof value>).skills[0]?.xpNeededForNextLevel).toBe(-1);
    }
    expect(input.Skills.FixtureCappedSkill?.XpNeededForNextLevel).toBe(-1);
  });
  it('preserves known-ability ordering and repeated source references', () => {
    const input = character();
    input.Skills.Psychology!.Abilities = ['Psychoanalyze1', 'Psychoanalyze1'];
    expect(success(parseCharacterSheet(input)).knownAbilities.map(ref => ref.sourceId)).toEqual(['Psychoanalyze1', 'Psychoanalyze1']);
  });
  it.each(['Skills', 'CurrentStats', 'Timestamp', 'ReportVersion', 'Character', 'Report'])('rejects missing required %s', key => {
    const input = character(); delete input[key];
    error(parseCharacterSheet(input), 'missing-field', `/${key}`);
  });
  it.each([
    ['Skills', []], ['CurrentStats', []], ['Skills', null], ['Skills', 'not-an-object'],
  ] as const)('rejects incompatible %s structure', (key, value) => {
    const input = character(); (input as JsonObject)[key] = value as JsonValue;
    error(parseCharacterSheet(input), 'unsupported-structure', `/${key}`);
  });
  it.each([
    ['Level', '90'], ['Level', -1], ['Level', 1.5], ['BonusLevels', false], ['BonusLevels', -1],
    ['XpTowardNextLevel', '123'], ['XpNeededForNextLevel', null], ['Abilities', {}],
    ['XpTowardNextLevel', -1], ['XpNeededForNextLevel', -2], ['XpNeededForNextLevel', -1.5],
    ['XpNeededForNextLevel', -0.5], ['XpNeededForNextLevel', '-1'],
  ] as const)('rejects malformed skill %s', (key, value) => {
    const input = character(); input.Skills.Psychology![key] = value as JsonValue;
    error(parseCharacterSheet(input), key === 'Abilities' ? 'unsupported-structure' : 'invalid-field-type', `/Skills/Psychology/${key}`);
  });
  it('rejects malformed skill entries and ability elements', () => {
    const input = character();
    input.Skills.Psychology!.Abilities = [false];
    error(parseCharacterSheet(input), 'invalid-field-type', '/Skills/Psychology/Abilities/0');
    input.Skills = { Psychology: null } as unknown as CharacterFixture['Skills'];
    error(parseCharacterSheet(input), 'unsupported-structure', '/Skills/Psychology');
  });
});

describe('Storage', () => {
  it('retains instance level separately from the official base crafting target', () => {
    const value = success(parseStorageJson(storageText, resolver));
    expect(value.items[0]).toMatchObject({ originalTypeId: 45640, baseItemId: 'item_45640', level: 93,
      displayName: 'Fixture Crafted Weapon', slot: 'MainHand', rarity: 'Legendary', sourcePath: '/Items/0' });
    expect(value.items[0]?.metadata).toEqual(storage().Items[0]);
    expect(value.items[1]).toMatchObject({ originalTypeId: 999999999, baseItemId: null,
      baseItemReference: { status: 'unresolved' }, location: { isInInventory: null, storageVault: 'Fixture Vault' } });
    expect(value.items[1]).not.toHaveProperty('level');
    expect(value.items[0]?.provenance.exportedAt).toBe('2026-11-01T12:01:00Z');
  });
  it('preserves composite power/tier identities and distinguishes imbues', () => {
    const item = success(parseStorage(storage(), resolver)).items[0]!;
    expect(item.existingPowers).toEqual([{ powerId: 'power_10001', tierId: 'id_9' }, { powerId: 'power_129', tierId: 'id_120' }]);
    expect(item.treasurePowers[0]).toMatchObject({ power: { sourceId: 'ArcheryBoost', id: 'power_10001' }, sourceTier: 9 });
    expect(item.treasurePowers[2]).toMatchObject({ power: { sourceId: 'FixtureUnknownPower', id: null }, sourceTier: 777, selection: null });
    expect(item.treasurePowers[3]).toMatchObject({ kind: 'imbue', selection: { powerId: 'power_10001', tierId: 'id_1' } });
  });
  it('does not substitute a tier from another power or approximate by level', () => {
    const input = storage(); input.Items[0]!.TSysPowers = [{ Power: 'ArcheryBoost', Tier: 120 }];
    const result = parseStorage(input, resolver);
    const item = success(result).items[0]!;
    expect(item.existingPowers).toEqual([]);
    expect(item.treasurePowers[0]).toMatchObject({ power: { id: 'power_10001' }, sourceTier: 120, selection: null });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'unresolved-reference', path: '/Items/0/TSysPowers/0/Tier' }));
  });
  it.each([
    { Power: 'ArcheryBoost' }, { Tier: 9 }, { Power: 'ArcheryBoost', Tier: { futureExactTier: 'variant' } },
    { Power: 'ArcheryBoost', Tier: 'id_future' }, null, 'opaque-future-entry', 7,
  ])('retains unknown or incomplete power details: %j', entry => {
    const input = storage(); input.Items[0]!.TSysPowers = [entry as JsonValue];
    const item = success(parseStorage(input, resolver)).items[0]!;
    expect(item.treasurePowers[0]?.metadata).toEqual(entry);
    expect(item.treasurePowers[0]?.selection).toBeNull();
    expect(item.existingPowers).toEqual([]);
  });
  it('retains unverified power container shapes with a compatibility warning', () => {
    const input = storage(); input.Items[0]!.TSysPowers = { futurePowers: [{ id: 'keep' }] };
    const result = parseStorage(input, resolver);
    expect(success(result).items[0]?.metadata.TSysPowers).toEqual(input.Items[0]!.TSysPowers);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'uninterpreted-power' }));
  });
  it('never interprets IsInInventory, a slot or an unverified field name as equipped', () => {
    const input = storage();
    // Deliberately synthetic adversarial fields; these are NOT confirmed report fields.
    input.Items[0]!.IsEquipped = true;
    input.Items[0]!.EquippedSlot = 'MainHand';
    input.Items.push({ TypeID: 45640, Name: 'Second carried weapon', Slot: 'MainHand', IsInInventory: true });
    const value = success(parseStorage(input, resolver));
    expect(value.equippedStateCapability).toEqual({ status: 'unavailable', reason: 'no-verified-authoritative-field' });
    expect(value.items.every(item => item.equippedState.status === 'unknown')).toBe(true);
    expect(value.items[0]?.metadata.IsEquipped).toBe(true);
  });
  it('retains crafting and other opaque metadata without fabricating Spark history', () => {
    const input = storage();
    input.Items[0]!.FixtureAugmentationMetadata = { opaque: [1, 2] };
    const item = success(parseStorage(input)).items[0]!;
    expect(item.metadata).toMatchObject({ IsCrafted: true, Crafter: 'Fixture Crafter', CraftPoints: 110,
      AttunedTo: 'Fixture Adventurer', TransmuteCount: 2, FixtureAugmentationMetadata: { opaque: [1, 2] } });
    expect(item.sparkHistory).toEqual({ status: 'unavailable' });
    expect(item).not.toHaveProperty('sparks');
    expect(item).not.toHaveProperty('instanceId');
    delete input.Items[0]!.CraftPoints;
    expect(success(parseStorage(input)).items[0]?.sparkHistory.status).toBe('unavailable');
  });
  it('retains fields normally belonging to another report when they are unknown optional metadata', () => {
    const input = storage(); input.CurrentStats = { unverified: 1 }; input.Skills = { unknown: 2 };
    expect(success(parseStorage(input)).source.metadata).toMatchObject({ CurrentStats: input.CurrentStats, Skills: input.Skills });
  });
  it.each([null, [], false, 1, 'item'])('rejects malformed primary item: %j', entry => {
    const input = storage(); input.Items = [entry] as unknown as JsonObject[];
    error(parseStorage(input), 'malformed-entry', '/Items/0');
  });
  it.each([
    ['TypeID', true], ['TypeID', Number.MAX_SAFE_INTEGER + 1], ['Name', null], ['Level', '90'],
    ['Level', -1], ['Level', 1.1], ['Slot', 1], ['Rarity', false], ['IsInInventory', 'true'], ['StorageVault', []],
  ] as const)('rejects incorrect item %s types', (key, value) => {
    const input = storage(); input.Items[0]![key] = value as JsonValue;
    error(parseStorage(input), 'invalid-field-type', `/Items/0/${key}`);
  });
  it.each(['TypeID', 'Name'])('rejects missing item %s', key => {
    const input = storage(); delete input.Items[0]![key];
    error(parseStorage(input), 'missing-field', `/Items/0/${key}`);
  });
  it('distinguishes missing from incompatible Items and permits an empty report', () => {
    const input = storage(); delete (input as JsonObject).Items;
    error(parseStorage(input), 'missing-field', '/Items');
    input.Items = {} as JsonObject[];
    error(parseStorage(input), 'unsupported-structure', '/Items');
    input.Items = [];
    expect(success(parseStorage(input)).items).toEqual([]);
  });
});

describe('report validation and source safety', () => {
  it.each([parseCharacterSheetJson, parseStorageJson])('rejects invalid JSON without echoing input or engine errors', parse => {
    const result = parse('{ PRIVATE_SENTINEL:');
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'invalid-json', path: '' }] });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
  });
  it('accepts UTF-8 BOM text exports', () => { expect(parseCharacterSheetJson(`\uFEFF${characterText}`).ok).toBe(true); });
  it('rejects swapped and unrecognized reports explicitly', () => {
    error(parseCharacterSheet(storage()), 'wrong-report-type', '/Report');
    error(parseStorage(character()), 'wrong-report-type', '/Report');
    const input = character(); input.Report = 'Other';
    error(parseCharacterSheet(input), 'wrong-report-type', '/Report');
  });
  it.each([null, [], 'text', 3])('rejects nonobject roots: %j', input => { error(parseStorage(input), 'unsupported-structure', ''); });
  it.each([0, 2, 999, 'future-compatible-version'])('accepts structurally compatible version %j without an age cutoff', version => {
    const input = character(); input.ReportVersion = version; input.Timestamp = '2021-03-25T10:00:00Z';
    const result = parseCharacterSheet(input);
    expect(success(result).source).toMatchObject({ sourceReportVersion: version, reportVersion: String(version), exportedAt: input.Timestamp });
    expect(result.warnings).toEqual([]);
  });
  it.each([null, false, {}, -1, 1.1, ''])('rejects invalid version %j', version => {
    const input = character(); input.ReportVersion = version;
    error(parseCharacterSheet(input), 'invalid-field-type', '/ReportVersion');
  });
  it('retains an unverified timestamp with a warning instead of inventing a date', () => {
    const input = storage(); input.Timestamp = 'unverified-clock-format';
    const result = parseStorage(input);
    expect(success(result).source.exportedAt).toBe(input.Timestamp);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'unverified-timestamp' }));
  });
  it('returns detached deterministic JSON without mutating the input', () => {
    const input = storage(); const original = JSON.stringify(input);
    const first = parseStorage(input, resolver);
    expect(parseStorage(input, resolver)).toEqual(first);
    expect(JSON.stringify(input)).toBe(original);
    input.Items[0]!.Name = 'mutated';
    expect(success(first).items[0]?.displayName).toBe('Fixture Crafted Weapon');
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
  it('preserves JSON keys such as __proto__ without polluting object prototypes', () => {
    const input = JSON.parse(characterText) as CharacterFixture;
    input.Future = JSON.parse('{"__proto__":{"polluted":true},"constructor":"original"}') as JsonValue;
    const output = success(parseCharacterSheet(input));
    expect(Object.hasOwn(output.source.metadata.Future as JsonObject, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(output.source.metadata)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });
  it.each([NaN, Infinity, undefined, 1n, () => 1, new Date(), new Map()])('rejects non-JSON unknown input values: %s', bad => {
    error(parseCharacterSheet({ ...character(), Future: bad }), 'invalid-json-value', '/Future');
  });
  it('rejects cycles, accessors and excessively nested metadata without invoking code', () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    error(parseCharacterSheet({ ...character(), Future: cyclic }), 'invalid-json-value', '/Future/self');
    let invoked = false;
    const input = Object.defineProperty(character(), 'Future', { enumerable: true, get() { invoked = true; return 1; } });
    expect(parseCharacterSheet(input).ok).toBe(false); expect(invoked).toBe(false);
    let deep: JsonValue = null;
    for (let i = 0; i < 102; i++) deep = { nested: deep };
    expect(parseCharacterSheet({ ...character(), Future: deep })).toMatchObject({ ok: false, errors: [{ code: 'invalid-json-value' }] });
  });
});

describe('official import reference adapter', () => {
  it('uses existing ownership/lookups, accounts for non-equipment and avoids name guessing', () => {
    expect(resolver.item(45640)).toBe('item_45640');
    expect(resolver.item('item_45640')).toBe('item_45640');
    expect(resolver.item('999999999')).toBeNull();
    expect(resolver.item(1114)).toBe('item_1114');
    expect(resolver.skill('Psychology')).toBe('Psychology');
    expect(resolver.skill('psychology')).toBeNull();
    expect(resolver.ability('Psychoanalyze1')).toBe('ability_1201');
    expect(resolver.ability('Psychoanalyze')).toBeNull();
    expect(resolver.power('ArcheryBoost')).toBe('power_10001');
    expect(resolver.tier('power_129', 120)).toBe('id_120');
    expect(resolver.tier('power_10001', 'id_120')).toBeNull();
  });
});

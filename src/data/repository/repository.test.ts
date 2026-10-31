// @vitest-environment node
import { beforeAll, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { basename } from 'node:path';
import { createGameDataRepository } from './repository';
import type { GameDataRepository } from './repository';
import type { GameDataManifest, RuntimeGameData } from './contracts';
import { decodeArtifact } from './load';

const directory = new URL('../../generated/game-data/', import.meta.url);
let manifest: GameDataManifest;
let data: RuntimeGameData;
let repository: GameDataRepository;
beforeAll(async () => {
  manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8')) as GameDataManifest;
  const entries = await Promise.all(Object.entries(manifest.artifacts).map(async ([name, artifact]) => [
    name, JSON.parse(gunzipSync(await readFile(new URL(artifact.file, directory))).toString('utf8')) as unknown,
  ]));
  data = Object.fromEntries(entries) as RuntimeGameData;
  repository = createGameDataRepository(data, manifest);
});

it.each([
  ['Psychology', '3_Balanced', 114, 'ability_1201', 'Psychoanalyze1'],
  ['Cow', '11_PlayerCow', 103, 'ability_1652', 'CowKick2'],
  ['Unarmed', '3_Balanced', 142, 'ability_1001', 'Punch'],
  ['Deer', '15_PlayerDeer', 104, 'ability_1578', 'KingOfTheForest1'],
] as const)('resolves %s, its advancement and exact official ability IDs', (skillId, tableId, count, abilityId, internalName) => {
  const skill = repository.getSkill(skillId)!;
  expect(skill.id).toBe(skillId);
  expect(skill.activeAdvancement?.tableId).toBe(tableId);
  expect(repository.getAdvancementTable(tableId)?.progression[0]?.rewards).toContainEqual(expect.objectContaining({ id: 'MAX_HEALTH' }));
  expect(repository.getAttribute('MAX_HEALTH')?.id).toBe('MAX_HEALTH');
  expect(repository.getAbilitiesForSkill(skillId)).toHaveLength(count);
  expect(repository.getAbility(abilityId)).toMatchObject({ internalName, skill: { skillId }, rank: null });
  expect(repository.getTreasurePowersForSkill(skillId).length).toBeGreaterThan(0);
  expect(repository.getSourceMetadata(skill.source)).toEqual({ ...manifest.sources.skills, recordId: skillId });
});

it.each([
  ['item_45640', "Nopec's Dreaded Dagger of Endless Nights", 'MainHand', 'Dagger', 'Knife', 60],
  ['item_45722', "Ruxandra's Bite", 'OffHand', 'Dirk', 'Knife', 60],
  ['item_45052', 'Umrad Shield', 'OffHandShield', 'Shield', 'Endurance', 80],
  ['item_42093', 'Umrad Coat', 'Chest', 'All', 'Endurance', 80],
  ['item_49070', 'Astounding Ilth Hale Ring', 'Ring', 'All', 'Endurance', 40],
  ['item_48081', 'Astounding Harukita Talisman', 'Necklace', 'All', 'Necromancy', 80],
] as const)('resolves %s and preserves crafting level separately from equipping requirements', (id, displayName, slot, profileId, skillId, level) => {
  expect(repository.getItem(id)).toMatchObject({ id, displayName, slot, level: 90, levelSource: 'CraftingTargetLevel',
    treasureProfile: { profileId, status: 'resolved' }, skillRequirements: [{ skill: { skillId }, level }] });
  expect(repository.getTreasureProfile(profileId)?.interpretation).toBe('membership-only');
  expect(repository.getItemCoverage(id)).toBe('equipment');
});

it('resolves powers and composite tiers without renumbering or crossing power ownership', () => {
  expect(repository.getTreasurePower('power_10001')).toMatchObject({ internalName: 'ArcheryBoost', slots: ['Head', 'OffHand'] });
  expect(repository.getTreasureTier('power_10001', 'id_1')).toMatchObject({ powerId: 'power_10001', minLevel: 10, maxLevel: 30, effectDescriptions: ['{BOOST_SKILL_ARCHERY}{5}'] });
  expect(repository.getTreasureTier('power_10001', 'id_9')?.minLevel).toBe(90);
  expect(repository.getProfilesForPower('power_10001').map(r => r.id)).toContain('All');
  expect(repository.getProfilesForPower('power_10001').map(r => r.id)).not.toContain('Dagger');
  const tier = repository.getTreasureTier('power_129', 'id_120')!;
  expect(tier).toMatchObject({ id: 'id_120', powerId: 'power_129', minLevel: 120, maxLevel: 135 });
  expect(repository.getSourceMetadata(tier.source).recordId).toBe('power_129.Tiers.id_120');
  expect(repository.getTreasureTier('power_129', 'id_12')).toBeUndefined();
  expect(repository.getTreasureTier('power_10001', 'id_120')).toBeUndefined();
});

it('preserves non-equipment coverage, acquisitions, anonymous rules and uninterpreted mechanics', () => {
  const other = data.itemsTreasure.nonEquipmentItemIds[0]!;
  expect(repository.getItemCoverage(other)).toBe('non-equipment');
  expect(repository.getItem(other)).toBeUndefined();
  expect(repository.getItemAcquisition('item_40002')?.entries).toContainEqual(expect.objectContaining({ npc: 'NPC_Richter' }));
  expect(repository.getAbilityAcquisition('ability_1201')?.abilityReference.status).toBe('resolved');
  expect(repository.getItem('item_40002')).toMatchObject({ level: null, levelSource: null, treasureProfile: null });
  expect(repository.getItem('item_42093')?.fixedEffects).toContainEqual(expect.objectContaining({ description: '{MAX_ARMOR}{243}', interpretation: 'uninterpreted' }));
  expect(repository.getKeywordRule('24')).toMatchObject({ sourceIndex: 24, interpretation: 'uninterpreted' });
  expect(repository.getKeywordRule('24')).not.toBe(repository.getKeywordRule('25'));
  expect(repository.dynamicDots[0]?.ownerAbilityId).toBeNull();
  expect(repository.getAbility('ability_1205')?.pve.specialValues?.[0]).toMatchObject({ value: 70, suffix: 'Health', ownerAbilityId: 'ability_1205' });
  expect(repository.getAbility('ability_1229')?.effectKeywordConstraints).toContainEqual(expect.objectContaining({ keyword: 'MindRevealed', status: 'missing' }));
  const anySkill = data.itemsTreasure.treasurePowers.find(r => r.skill.status === 'uninterpreted')!;
  expect(repository.getTreasurePower(anySkill.id)?.skill).toMatchObject({ sourceId: 'AnySkill', skillId: null, status: 'uninterpreted' });
  expect(repository.getTreasurePowersForSkill('AnySkill')).toEqual([]);
  expect(repository.getEffect(data.progression.effects[0]!.id)).toBe(data.progression.effects[0]);
});

it('all missing lookups return explicit absence and associations return empty arrays', () => {
  for (const lookup of [repository.getSkill, repository.getAdvancementTable, repository.getAbility, repository.getItem,
    repository.getTreasurePower, repository.getTreasureProfile, repository.getAttribute, repository.getEffect,
    repository.getKeywordRule, repository.getAbilityAcquisition, repository.getItemAcquisition, repository.getItemCoverage]) {
    expect(lookup('nonexistent')).toBeUndefined();
    expect(lookup('__proto__')).toBeUndefined();
  }
  expect(repository.getTreasureTier('nonexistent', 'id_1')).toBeUndefined();
  expect(repository.getTreasureTier('power_129', 'nonexistent')).toBeUndefined();
  expect(repository.getAbilitiesForSkill('nonexistent')).toEqual([]);
  expect(repository.getTreasurePowersForSkill('nonexistent')).toEqual([]);
  expect(repository.getProfilesForPower('nonexistent')).toEqual([]);
});

it('verifies compressed bytes before decoding and catches truncation, corruption and incompatible JSON lengths', async () => {
  const expected = manifest.artifacts.abilities;
  const bytes = new Uint8Array(await readFile(new URL(expected.file, directory)));
  await expect(decodeArtifact(bytes.subarray(1), expected)).rejects.toThrow('byte length mismatch');
  const corrupt = bytes.slice(); corrupt[20] = corrupt[20]! ^ 1;
  await expect(decodeArtifact(corrupt, expected)).rejects.toThrow('SHA-256 mismatch');
  await expect(decodeArtifact(bytes, { ...expected, jsonBytes: 1 })).rejects.toThrow('JSON length mismatch');
});

it('loads once on demand, shares concurrent requests, uses only compressed generated URLs and retries failures', async () => {
  vi.resetModules();
  const { loadGameDataRepository } = await import('./load');
  const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('missing', { status: 404 }));
  vi.stubGlobal('fetch', mock);
  try {
    await expect(loadGameDataRepository()).rejects.toThrow('HTTP 404');
    mock.mockImplementation(async url => new Response(await readFile(new URL(basename(String(url).split('?')[0]!), directory))));
    const before = mock.mock.calls.length;
    const one = loadGameDataRepository();
    expect(loadGameDataRepository()).toBe(one);
    expect((await one).getSkill('Psychology')?.id).toBe('Psychology');
    expect(await loadGameDataRepository()).toBe(await one);
    expect(mock.mock.calls.length - before).toBe(3);
    for (const [url] of mock.mock.calls) expect(String(url)).toMatch(/\.json\.gz(?:\?|$)/);
  } finally { vi.unstubAllGlobals(); }
}, 30_000);

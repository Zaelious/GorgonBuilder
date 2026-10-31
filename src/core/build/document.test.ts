import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BUILD_SCHEMA_VERSION, createDefaultBuildDocument, getUniqueActiveSkillIds } from './document';
import type { BuildDocument, SparkOutcomeCounts } from './document';
import { deserializeBuildDocument, serializeBuildDocument, validateBuildDocument } from './validation';
import type { RuntimeGameData } from '../../data/repository/contracts';

const defaults = { gameDataVersion: '490', createdWithAppVersion: '0.1.0' };
const outcomes: SparkOutcomeCounts = {
  allDirectDamagePercent: 1, skillDamageFlat: 2, allDirectDamageFlat: 3,
  skillDamagePercent: 4, skillBaseDamagePercent: 5,
};

function populatedBuild(): BuildDocument {
  const build = createDefaultBuildDocument(defaults);
  build.title = 'Psychology / Psychology';
  build.notes = 'Unicode 🐄 and <untrusted display text> stay plain text.';
  build.skillSlotA = { skillId: 'Psychology', level: 90 };
  build.skillSlotB = { skillId: 'Psychology', level: 70 };
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }, { abilityId: 'ability_1652', rank: 'II' }];
  build.abilityBarB = [{ abilityId: 'ability_1652', rank: 2 }, { abilityId: 'ability_1201', rank: null }];
  build.equipment = [
    { slot: 'MainHand', item: { kind: 'database', itemId: 'item_45640' }, candidateMods: [], sparks: { mode: 'none' } },
    {
      slot: 'OffHand',
      item: { kind: 'manual', instance: { baseItemId: null, displayName: 'Manual dirk', existingPowers: [] } },
      candidateMods: Array.from({ length: 20 }, (_, i) => ({ powerId: 'power_10001', tierId: i ? 'id_9' : null })),
      sparks: {
        mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 15, seed: 'fixed' },
        result: { modelVersion: 'fixture-only', outcomeCounts: outcomes },
      },
    },
    {
      slot: 'Ring',
      item: {
        kind: 'imported', instance: {
          baseItemId: 'item_49070', instanceId: 'local-instance-1', level: 90, rarity: 'Rare',
          existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }, { powerId: 'power_10001', tierId: 'id_9' }],
          provenance: { reference: 'local-storage-report', exportedAt: '2026-10-31T12:00:00Z', reportVersion: 'example' },
          metadata: { IsInInventory: true, future: { raw: [null, 42, 'unchanged'], CraftPoints: 3 } },
        },
      },
      candidateMods: [{ powerId: 'power_10001', tierId: 'id_1' }],
      sparks: { mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: outcomes },
    },
  ];
  build.target = {
    count: 5, damageTypes: { Psychic: { resistance: 0, vulnerability: 12.5, metadata: { units: 'uninterpreted fixture' } } },
    metadata: { futureArmorSetting: null },
  };
  build.characterImport = {
    reference: 'local-character-report', characterName: 'Fixture', server: 'Example',
    reportVersion: 'fixture', exportedAt: '2026-10-31T12:00:00Z', metadata: { futureFlag: true },
  };
  return build;
}

function roundTrip(build: BuildDocument): BuildDocument {
  const serialized = serializeBuildDocument(build);
  expect(serialized.ok).toBe(true);
  if (!serialized.ok) throw new Error(serialized.reason);
  const decoded = deserializeBuildDocument(serialized.value);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.reason);
  return decoded.value;
}

describe('BuildDocument v1', () => {
  it('creates a versioned JSON-only default with safe empty selections', () => {
    const build = createDefaultBuildDocument(defaults);
    expect(build).toEqual({
      schemaVersion: BUILD_SCHEMA_VERSION, ...defaults, title: 'Untitled build', notes: '',
      skillSlotA: { skillId: null, level: 0 }, skillSlotB: { skillId: null, level: 0 },
      abilityBarA: [], abilityBarB: [], equipment: [], target: { count: 1, damageTypes: {} },
    });
    expect(roundTrip(build)).toEqual(build);
    expect(createDefaultBuildDocument({ gameDataVersion: 'future-snapshot' })).not.toHaveProperty('createdWithAppVersion');
  });

  it('creates independent objects on every factory call and for each bar/slot', () => {
    const a = createDefaultBuildDocument(defaults);
    const b = createDefaultBuildDocument(defaults);
    a.skillSlotA.skillId = 'Cow';
    a.abilityBarA.push({ abilityId: 'ability_1001', rank: null });
    a.target.damageTypes.Fire = { resistance: 1 };
    expect(a.skillSlotB.skillId).toBeNull();
    expect(a.abilityBarB).toEqual([]);
    expect(b).toEqual(createDefaultBuildDocument(defaults));
  });

  it.each(['', '   '])('requires an explicit usable game-data version (%j)', gameDataVersion => {
    expect(() => createDefaultBuildDocument({ gameDataVersion })).toThrow(TypeError);
  });

  it.each([
    [null, null, []], ['Cow', null, ['Cow']], [null, 'Deer', ['Deer']],
    ['Cow', 'Unarmed', ['Cow', 'Unarmed']], ['Psychology', 'Psychology', ['Psychology']],
  ] as const)('preserves %s / %s and derives unique skills', (a, b, expected) => {
    const build = createDefaultBuildDocument(defaults);
    build.skillSlotA = { skillId: a, level: 90 };
    build.skillSlotB = { skillId: b, level: 70 };
    const before = JSON.stringify(build);
    expect(getUniqueActiveSkillIds(build)).toEqual(expected);
    expect(JSON.stringify(build)).toBe(before);
    expect(roundTrip(build)).toEqual(build);
  });

  it('preserves duplicate skill levels and independent ordered ability/rank selections', () => {
    const build = populatedBuild();
    const restored = roundTrip(build);
    expect(restored.skillSlotA.level).toBe(90);
    expect(restored.skillSlotB.level).toBe(70);
    expect(restored.abilityBarA).toEqual(build.abilityBarA);
    expect(restored.abilityBarB).toEqual(build.abilityBarB);
    restored.abilityBarA.reverse();
    expect(restored.abilityBarB).toEqual(build.abilityBarB);
  });

  it('round-trips instances, composite TSys tiers, many candidates, all Spark modes and unknown metadata', () => {
    const build = populatedBuild();
    expect(roundTrip(build)).toEqual(build);
    expect(build.equipment[1]?.candidateMods).toHaveLength(20);
  });

  it('supports a pending Spark simulation without fabricating output', () => {
    const build = populatedBuild();
    build.equipment[0]!.sparks = {
      mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 0, seed: '' },
    };
    expect(roundTrip(build)).toEqual(build);
  });

  it('uses identifiers and exact rank values from the committed runtime artifacts', () => {
    function artifact<K extends keyof RuntimeGameData>(name: K): RuntimeGameData[K] {
      return JSON.parse(gunzipSync(readFileSync(`src/generated/game-data/${name}.json.gz`)).toString());
    }
    const progression = artifact('progression');
    const abilities = artifact('abilities');
    const items = artifact('itemsTreasure');
    const skill = progression.skills.find(r => r.id === 'Psychology')!;
    const ability = abilities.abilities.find(r => r.id === 'ability_1201')!;
    const item = items.items.find(r => r.id === 'item_45640')!;
    const tier = items.treasurePowers.find(r => r.id === 'power_129')!.tiers.find(r => r.id === 'id_120')!;
    expect([skill.id, ability.id, item.id, tier.id]).toEqual(['Psychology', 'ability_1201', 'item_45640', 'id_120']);
    const build = createDefaultBuildDocument({ gameDataVersion: progression.gameDataVersion });
    build.skillSlotA = { skillId: skill.id, level: 90 };
    build.abilityBarA = [{ abilityId: ability.id, rank: ability.rank }];
    build.equipment = [{
      slot: item.slot, item: { kind: 'database', itemId: item.id },
      candidateMods: [{ powerId: tier.powerId, tierId: tier.id }], sparks: { mode: 'none' },
    }];
    expect(roundTrip(build)).toEqual(build);
  });
});

describe('persisted data validation', () => {
  it.each([null, [], {}, 'build', 42, { schemaVersion: '1' }])('rejects invalid root data %j', value => {
    expect(validateBuildDocument(value)).toEqual({ ok: false, reason: 'invalid-data' });
  });

  it.each([
    { gameDataVersion: '' }, { createdWithAppVersion: '' }, { notes: null },
    { skillSlotA: { skillId: 'Cow', level: -1 } }, { skillSlotB: { skillId: '', level: 1 } },
    { skillSlotA: { skillId: null, level: 1.5 } },
    { abilityBarA: [{ abilityId: 'ability_1201' }] }, { abilityBarB: [{ abilityId: 1201, rank: null }] },
    { equipment: [{ slot: 'Ring', item: { kind: 'database', itemId: 'item_49070' } }] },
    { target: { count: 0, damageTypes: {} } }, { target: { count: 1.5, damageTypes: {} } },
    { target: { count: 1, damageTypes: { Psychic: { resistance: 'lots' } } } },
    { ownerToken: 'must-not-be-part-of-build' }, { searchQuery: 'transient UI' },
    { characterImport: { metadata: { nonJson: undefined } } },
  ])('rejects malformed fields instead of partially restoring %j', patch => {
    expect(validateBuildDocument({ ...createDefaultBuildDocument(defaults), ...patch })).toEqual({ ok: false, reason: 'invalid-data' });
  });

  it.each([
    { kind: 'imported', instance: { baseItemId: 'item_49070', existingPowers: [{ powerId: 'power_129', tierId: 120 }] } },
    { kind: 'manual', instance: { baseItemId: null, existingPowers: [], level: '90' } },
    { kind: 'unknown', itemId: 'item_49070' },
  ])('validates nested instance shape and exact tier type %j', item => {
    const build = populatedBuild();
    expect(validateBuildDocument({ ...build, equipment: [{ ...build.equipment[0], item }] }).ok).toBe(false);
  });

  it.each([
    { mode: 'none', result: {} },
    { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Cow', count: -1, seed: 'x' } },
    { mode: 'actual', category: 'skill-damage', skillId: 'Cow', outcomeCounts: { ...outcomes, skillDamageFlat: 0.5 } },
    { mode: 'actual', category: 'skill-damage', skillId: 'Cow', outcomeCounts: outcomes, input: {} },
  ])('rejects mixed or invalid Spark modes %j', sparks => {
    const build = populatedBuild();
    expect(validateBuildDocument({ ...build, equipment: [{ ...build.equipment[0], sparks }] }).ok).toBe(false);
  });

  it.each([0, 2, 999])('explicitly rejects unsupported schema %s without migration', schemaVersion => {
    expect(deserializeBuildDocument(JSON.stringify({ schemaVersion }))).toEqual({ ok: false, reason: 'unsupported-version', schemaVersion });
  });

  it('distinguishes syntax errors from structurally invalid JSON', () => {
    expect(deserializeBuildDocument('{')).toEqual({ ok: false, reason: 'invalid-json' });
    expect(deserializeBuildDocument('null')).toEqual({ ok: false, reason: 'invalid-data' });
  });

  it.each([NaN, Infinity, undefined, BigInt(1), new Date(), () => 1])('rejects non-JSON metadata (%s) before serialization', value => {
    const build = createDefaultBuildDocument(defaults);
    expect(validateBuildDocument({ ...build, characterImport: { metadata: { value } } }).ok).toBe(false);
  });

  it('rejects cyclic objects, sparse bars, and invalid typed values at serialization boundaries', () => {
    const build = createDefaultBuildDocument(defaults);
    const metadata: Record<string, unknown> = {};
    metadata.self = metadata;
    expect(validateBuildDocument({ ...build, characterImport: { metadata } }).ok).toBe(false);
    expect(validateBuildDocument({ ...build, abilityBarA: new Array(1) }).ok).toBe(false);
    build.target.count = NaN;
    expect(serializeBuildDocument(build)).toEqual({ ok: false, reason: 'invalid-data' });
  });
});

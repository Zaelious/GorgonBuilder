import { createDefaultBuildDocument, type BuildDocument, type ItemInstance } from '../build/document';

/**
 * Controlled, synthetic T0012 builds that reference committed official v490 IDs only.
 * They contain no customer CharacterSheet/Storage export data.
 */

/** Psychology only: fixed effects on two items, planned candidates (mapped, prose and crit). */
export function psychologyFixture(gameDataVersion: string): BuildDocument {
  const build = createDefaultBuildDocument({ gameDataVersion });
  build.title = 'T0012 Psychology fixture';
  build.skillSlotA = { skillId: 'Psychology', level: 100 };
  build.equipment = [
    // Empusa's Mask: MAX_ARMOR, MOD_SKILL_PSYCHOLOGY 0.2, VULN_*, COMBAT_REFRESH_*
    { slot: 'Head', item: { kind: 'database', itemId: 'item_44346' }, sparks: { mode: 'none' },
      candidateMods: [{ powerId: 'power_4001', tierId: 'id_9' }] }, // MOD_SKILL_PSYCHOLOGY 0.45
    // Incredible Magic Ring: BOOST_UNIVERSAL_DIRECT 175
    { slot: 'Ring', item: { kind: 'database', itemId: 'item_49120' }, sparks: { mode: 'none' }, candidateMods: [] },
    // Awesome Harukita Talisman: BOOST_UNIVERSAL_DIRECT 58, MOD_SKILL_NECROMANCY 0.07 (inactive skill scope)
    { slot: 'Necklace', item: { kind: 'database', itemId: 'item_48082' }, sparks: { mode: 'none' },
      candidateMods: [
        { powerId: 'power_4061', tierId: 'id_9' }, // MOD_ABILITY_STRIKEANERVE
        { powerId: 'power_4002', tierId: 'id_9' }, // prose: Psychoanalyze extra damage
      ] },
    // Darksome Robe; Psychology crit candidate uses an attribute outside the initial subset.
    { slot: 'Chest', item: { kind: 'database', itemId: 'item_42702' }, sparks: { mode: 'none' },
      candidateMods: [{ powerId: 'power_4009', tierId: 'id_9' }] }, // {MOD_CRITICAL_HIT_DAMAGE}{..}{Psychology}
  ];
  return build;
}

/** Working imported Cow/Unarmed weapon. Historical source evidence intentionally differs. */
export function importedCowUnarmedWeapon(): ItemInstance {
  return {
    baseItemId: 'item_45640', displayName: 'Fixture Cow and Unarmed Blade', level: 100, rarity: 'Legendary',
    existingPowers: [
      { powerId: 'power_20006', tierId: 'id_9' }, // BOOST_ABILITY_COWFRONTKICK 101
      { powerId: 'power_3001', tierId: 'id_9' },  // MOD_SKILL_UNARMED 0.45
      { powerId: 'power_20014', tierId: 'id_9' }, // prose Cow Bash Nature DoT
      { powerId: 'power_3006', tierId: 'id_9' },  // prose Unarmed armor damage
      { powerId: 'power_20015', tierId: 'id_9' }, // prose conditional indirect damage
      { powerId: 'power_3007', tierId: 'id_9' },  // prose damage + accuracy
    ],
    provenance: {
      reference: 'project-gorgon-storage', exportedAt: '2026-11-02T12:00:00Z', reportVersion: '1',
      metadata: { characterName: 'Fixture Adventurer', server: 'Fixture Server', sourcePath: '/Items/0' },
    },
    metadata: {
      // Historical evidence only; includes a Psychology power and a tier that are NOT in the working copy.
      sourceItem: {
        TypeID: 45640, Name: 'Fixture Cow and Unarmed Blade', Slot: 'MainHand', Level: 100, Rarity: 'Legendary',
        TSysPowers: [
          { Power: 'power_20006', Tier: 5 }, { Power: 'power_3001', Tier: 9 }, { Power: 'power_4001', Tier: 9 },
          { Power: 'FixtureUnknownPower', Tier: 777 },
        ],
        TSysImbuePower: 'power_129', TSysImbuePowerTier: 120,
      },
      originalWorkingPowers: [{ powerId: 'power_4001', tierId: 'id_9' }],
    },
  };
}

/** Cow (A) + Unarmed (B): database, manual and imported items plus unresolved references. */
export function cowUnarmedFixture(gameDataVersion: string): BuildDocument {
  const build = createDefaultBuildDocument({ gameDataVersion });
  build.title = 'T0012 Cow/Unarmed fixture';
  build.skillSlotA = { skillId: 'Cow', level: 100 };
  build.skillSlotB = { skillId: 'Unarmed', level: 100 };
  build.equipment = [
    { slot: 'MainHand', item: { kind: 'imported', instance: importedCowUnarmedWeapon() },
      sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Cow', count: 5, seed: 'fixture' } },
      candidateMods: [{ powerId: 'power_3001', tierId: 'id_9' }] }, // same power as an existing one: kept separate
    // Incredible Cow Porkpie Hat: MAX_ARMOR, BOOST_SKILL_COW 293, COMBAT_REFRESH_*
    { slot: 'Head', item: { kind: 'database', itemId: 'item_44411' }, sparks: { mode: 'none' },
      candidateMods: [
        { powerId: 'power_20001', tierId: 'id_9' }, // MOD_SKILL_COW 0.45
        { powerId: 'power_20002', tierId: 'id_9' }, // {MAX_ARMOR}{45}{Cow}: requires Cow active
      ] },
    // Manual instance of Justice Trekkers (BOOST_SKILL_COW, BOOST_SKILL_DRUID, ...) with a typed existing power.
    { slot: 'Feet', item: { kind: 'manual', instance: { baseItemId: 'item_40358', displayName: 'Manual trekkers',
      existingPowers: [{ powerId: 'power_3024', tierId: 'id_9' }] } }, // MOD_ABILITY_FRONTKICK
    sparks: { mode: 'none' }, candidateMods: [] },
    { slot: 'Ring', item: { kind: 'database', itemId: 'item_49120' }, sparks: { mode: 'none' },
      candidateMods: [
        { powerId: 'power_20007', tierId: 'id_9' },    // MOD_ABILITY_COWBASH
        { powerId: 'power_20203', tierId: null },      // staged without a tier
        { powerId: 'power_99999999', tierId: 'id_1' }, // unknown power
      ] },
    // Manual instance without a known base item and an unresolved tier.
    { slot: 'Legs', item: { kind: 'manual', instance: { baseItemId: null, displayName: 'Unknown leggings',
      existingPowers: [{ powerId: 'power_20203', tierId: 'id_999' }] } },
    sparks: { mode: 'none' }, candidateMods: [] },
  ];
  return build;
}

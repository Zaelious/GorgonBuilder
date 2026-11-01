// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { abilityModIndexFor, MAX_FAMILIES_PER_ATTRIBUTE, matchAbilityEffect, relevantEquippedMods } from './ability-mods';
let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
const matching = (abilityId: string) => {
  const ability = data.getAbility(abilityId)!; const index = abilityModIndexFor(data);
  return data.treasurePowers.filter(power => power.tiers.some(tier => tier.effectDescriptions.some(d => matchAbilityEffect(ability, d, index)))).map(p => p.id);
};
it('matches exactly the 8 official Brambleskin powers for every Brambleskin rank, and no general Druid mods', () => {
  const expected = ['power_14151', 'power_14152', 'power_14153', 'power_14154', 'power_14155', 'power_14156', 'power_14157', 'power_14159'];
  expect(matching('ability_5386')).toEqual(expected); // Brambleskin 13
  expect(matching('ability_5241')).toEqual(expected); // Brambleskin (rank 1), same UpgradeOf family
}, 30000);
it('matches ability-scoped attribute templates but not skill-wide or global attributes', () => {
  const index = abilityModIndexFor(data);
  const rotskin = data.abilities.find(a => a.internalName.startsWith('Rotskin') && a.upgradeOf !== null)!;
  expect(matchAbilityEffect(rotskin, '{MOD_ABILITY_ROTSKIN}{0.71}', index)).toBe('attribute');
  expect(index.attributeFamilies('MOD_ABILITY_ROTSKIN')).toBeLessThanOrEqual(MAX_FAMILIES_PER_ATTRIBUTE);
  const bramble = data.getAbility('ability_5386')!;
  expect(matchAbilityEffect(bramble, '{MOD_SKILL_DRUID}{0.6}{Druid}', index)).toBeNull(); // in Brambleskin's hooks, but 22 families
  expect(index.attributeFamilies('MOD_SKILL_DRUID')).toBeGreaterThan(MAX_FAMILIES_PER_ATTRIBUTE);
  expect(matchAbilityEffect(bramble, '{MOD_ABILITY_ROTSKIN}{0.71}', index)).toBeNull();
  expect(matchAbilityEffect(bramble, '{BOOST_ABILITY_REFLECT_BRAMBLESKIN}{10}', index)).toBe('attribute');
});
it('requires both an official family icon and the family name for prose effects', () => {
  const index = abilityModIndexFor(data); const bramble = data.getAbility('ability_5386')!;
  expect(matchAbilityEffect(bramble, '<icon=3483>Brambleskin deals +44% damage to melee attackers', index)).toBe('prose');
  expect(matchAbilityEffect(bramble, 'Brambleskin deals +44% damage to melee attackers', index)).toBeNull();
  expect(matchAbilityEffect(bramble, '<icon=3481>Brambleskin deals +44% damage', index)).toBeNull();
  expect(matchAbilityEffect(bramble, '<icon=3483>Bramblesking deals damage', index)).toBeNull();
  expect(matchAbilityEffect(bramble, '<icon=3483>All Druid abilities deal more damage', index)).toBeNull();
});
it('lists equipped matches in equipment order, keeps identical effects from different items, and skips unresolved IDs', () => {
  const equipment = [
    { slot: 'Head', item: { kind: 'imported' as const, instance: { baseItemId: 'item_44030', existingPowers: [{ powerId: 'power_14159', tierId: 'id_25' }, { powerId: 'missing', tierId: 'x' }] } }, candidateMods: [{ powerId: 'power_14159', tierId: null }], sparks: { mode: 'none' as const } },
    { slot: 'Chest', item: { kind: 'database' as const, itemId: 'item_42705' }, candidateMods: [{ powerId: 'power_14005', tierId: 'id_25' }, { powerId: 'power_14159', tierId: 'id_25' }], sparks: { mode: 'none' as const } },
  ];
  const rows = relevantEquippedMods(data.getAbility('ability_5386')!, equipment, data, abilityModIndexFor(data));
  expect(rows.map(row => [row.equipmentIndex, row.source, row.index, row.mod.powerId])).toEqual([[0, 'imported', 0, 'power_14159'], [1, 'planned', 1, 'power_14159']]);
  expect(rows[0]!.tier.effectDescriptions).toEqual(rows[1]!.tier.effectDescriptions);
});

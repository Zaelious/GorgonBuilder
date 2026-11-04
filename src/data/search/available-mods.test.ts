import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import type { EquipmentSelection } from '../../core/build/document';
import { selectAvailableMods, equipmentRowMatches, type AvailableModFilters } from './available-mods';
import { indexTreasurePowers, treasureRelevance, browseTreasurePowers } from './treasure';
import { availableTreasurePowers, groupEffectiveMods, groupTreasurePowers } from './treasure-planning';

let data: ReturnType<typeof loadPlannerFixture>;
let index: ReturnType<typeof indexTreasurePowers>;
beforeAll(() => { data = loadPlannerFixture(); index = indexTreasurePowers(data.treasurePowers); });
const filters: AvailableModFilters = { query: 'core', categories: { generic: true, endurance: true, shamanic: true }, allSkills: false, allSlots: false };
const selection = (slot = 'MainHand', itemId = 'item_46107'): EquipmentSelection => ({
  slot, item: { kind: 'database', itemId }, candidateMods: [], sparks: { mode: 'none' },
});

it.each([['Druid', 'Archery'], ['Druid', 'Druid'], ['Archery', 'Druid'], [null, 'Archery'], [null, null]])(
  'preserves the original expanded Available pipeline for %s/%s and every category/exploration combination', (a, b) => {
    const entry = selection();
    const context = { item: data.getItem('item_46107'), skillIds: [a, b].filter((id): id is string => id !== null) };
    for (let flags = 0; flags < 32; flags++) {
      const settings = { ...filters, allSkills: !!(flags & 1), allSlots: !!(flags & 2),
        categories: { generic: !!(flags & 4), endurance: !!(flags & 8), shamanic: !!(flags & 16) } };
      const relevance = new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)]));
      const staged = new Set(groupEffectiveMods(entry, a, b, data).map(row => row.mod.powerId));
      const legacy = groupTreasurePowers(availableTreasurePowers(browseTreasurePowers(index, settings.query, relevance, 'relevant'),
        relevance, staged, settings.allSlots, data, context.skillIds), context.skillIds, settings.categories, settings.allSkills, data);
      const result = selectAvailableMods(entry, context, a, b, settings, data, index);
      expect(result.groups).toEqual(legacy);
      expect(result.count).toBe(legacy.flatMap(group => group.powers).length);
      expect(new Set(result.groups.map(group => group.id)).size).toBe(result.groups.length);
    }
  });

it('retains outside-profile powers, and excludes working imported and staged pairs without reading historical metadata', () => {
  const entry = selection();
  const context = { item: data.getItem('item_46107'), skillIds: ['Druid', 'Archery'] };
  const settings = { ...filters, query: '' };
  const before = selectAvailableMods(entry, context, 'Druid', 'Archery', settings, data, index);
  const druid = before.groups.find(group => group.id === 'Druid')!.powers[0]!;
  expect(before.relevance.get(druid.id)?.profile).toBe('different');
  expect(before.relevance.get(druid.id)?.slot).toBe('match');
  const archery = before.groups.find(group => group.id === 'Archery')!.powers[0]!;
  const imported: EquipmentSelection = { ...entry, item: { kind: 'imported', instance: {
    baseItemId: 'item_46107', existingPowers: [{ powerId: druid.id, tierId: druid.tiers[0]!.id }],
    metadata: { sourceItem: { TSysPowers: [{ Power: archery.id, Tier: 9 }] } },
  } } };
  expect(selectAvailableMods(imported, context, 'Druid', 'Archery', settings, data, index).count).toBe(before.count - 1);
  imported.candidateMods = [{ powerId: archery.id, tierId: null }];
  const bytes = JSON.stringify(imported);
  const after = selectAvailableMods(imported, context, 'Druid', 'Archery', settings, data, index);
  expect(after.count).toBe(before.count - 2);
  expect(after.groups.flatMap(group => group.powers).some(power => [druid.id, archery.id].includes(power.id))).toBe(false);
  expect(JSON.stringify(imported)).toBe(bytes);
});

it('keeps missing base definitions permissive, unknown associations discoverable, and no-match counts zero', () => {
  const entry = selection();
  const context = { item: undefined, skillIds: ['Druid'] };
  const settings = { ...filters, query: '', allSlots: true, allSkills: true };
  const result = selectAvailableMods(entry, context, 'Druid', null, settings, data, index);
  expect(result.groups.find(group => group.id === 'unknown')!.powers.length).toBeGreaterThan(0);
  expect(selectAvailableMods(entry, context, 'Druid', null, { ...settings, query: 'no such official power' }, data, index).count).toBe(0);
  expect(selectAvailableMods(entry, { ...context, skillIds: [] }, null, null, settings, data, index).count).toBe(0);
});

it('limits only presentation, including zero-match and empty equipment rows', () => {
  expect(equipmentRowMatches(0, false, false)).toBe(true);
  expect(equipmentRowMatches(0, true, false)).toBe(false);
  expect(equipmentRowMatches(0, true, true)).toBe(true);
  expect(equipmentRowMatches(1, true, false)).toBe(true);
});

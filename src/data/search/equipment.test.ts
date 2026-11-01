// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { equipmentSearchText, filterEquipment, matchesEquipmentText, matchesTargetLevel, normalizeEquipmentSearch } from './equipment';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
const filters = { minimumTargetLevel: null, includeUnknownTargetLevel: true };

it('normalizes Unicode, case, whitespace and underscore effect tokens consistently', () => {
  expect(normalizeEquipmentSearch('  ＣＯＭＢＡＴ_Refresh\n HEALTH ')).toBe('combat refresh health');
  expect(matchesEquipmentText('{COMBAT_REFRESH_HEALTH_DELTA}{3}', 'combat refresh')).toBe(true);
});

it.each([
  ['Orcish Rugged Boots', 'item_40103'], ['Smelly old shoes', 'item_40001'],
  ['LeatherBoots', 'item_40001'], ['psychic', 'item_41008'],
  ['taunt', 'item_40241'], ['kick', 'item_40301'], ['combat refresh', 'item_40001'],
  ['electricity', 'item_40102'], ['lightning', 'item_40102'],
])('finds official names, descriptions, tags, effects and synonyms: %s', (query, id) => {
  expect(filterEquipment(data.items, { ...filters, query }).map(item => item.id)).toContain(id);
});

it('supports only explicit lightning/electricity synonyms in both directions', () => {
  expect(matchesEquipmentText('Lightning damage', 'electricity')).toBe(true);
  expect(matchesEquipmentText('Electricity damage', 'LIGHTNING')).toBe(true);
  expect(matchesEquipmentText('Psychology', 'psychic')).toBe(false);
  expect(filterEquipment(data.items, { ...filters, query: 'lightning' })).toEqual(filterEquipment(data.items, { ...filters, query: 'electricity' }));
});

it.each(['OffHand', 'OffHandShield', 'Racial', 'MountCosmetic', 'MountGlamour', 'Horseshoes', 'Saddlebag'])('matches the exact official slot %s', slot => {
  const matches = filterEquipment(data.items, { ...filters, slot });
  expect(matches.length).toBeGreaterThan(0);
  expect(matches.every(item => item.slot === slot)).toBe(true);
  expect(filterEquipment(data.items, { ...filters, slot: slot.toLowerCase() })).toEqual([]);
});

it.each([
  [89, 90, true, false], [90, 90, true, true], [91, 90, true, true],
  [null, 90, true, true], [null, 90, false, false],
  [89, null, false, true], [null, null, false, true], [null, 0, false, true],
] as const)('filters level %s at minimum %s, unknowns %s => %s', (level, minimum, unknowns, eligible) => {
  expect(matchesTargetLevel(level, minimum, unknowns)).toBe(eligible);
});

it('composes text, slot, level and include-unknown filters without mutating input', () => {
  const template = data.items[0]!;
  const items = [89, 90, 91, null].flatMap(level => ['Feet', 'OffHandShield'].map(slot => ({
    ...template, id: `${slot}-${level}`, slot, level,
  })));
  const before = structuredClone(items);
  expect(filterEquipment(items, { query: 'smelly', slot: 'Feet', minimumTargetLevel: 90, includeUnknownTargetLevel: false }).map(item => item.id)).toEqual(['Feet-90', 'Feet-91']);
  expect(filterEquipment(items, { query: 'smelly', slot: 'Feet', minimumTargetLevel: 90, includeUnknownTargetLevel: true })).toHaveLength(3);
  expect(filterEquipment(items, { query: 'smelly', slot: 'Feet', minimumTargetLevel: null, includeUnknownTargetLevel: false })).toHaveLength(4);
  expect(filterEquipment(items, { query: 'no such item', ...filters })).toEqual([]);
  expect(items).toEqual(before);
});

it('pins v490 regression counts without treating missing target levels as zero', () => {
  expect(data.gameDataVersion).toBe('v490');
  expect(data.items).toHaveLength(3078);
  expect(data.items.filter(item => item.level === null)).toHaveLength(500);
  expect(filterEquipment(data.items, { minimumTargetLevel: 90, includeUnknownTargetLevel: false })).toHaveLength(518);
  expect(filterEquipment(data.items, { minimumTargetLevel: 90, includeUnknownTargetLevel: true })).toHaveLength(1018);
  expect(filterEquipment(data.items, { ...filters, includeUnknownTargetLevel: false })).toHaveLength(3078);
  expect(equipmentSearchText(data.getItem('item_40001')!)).toContain('combat refresh');
});

// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import { parseStorageJson } from '../../core/import/storage';
import { createDefaultBuildDocument, type EquipmentSelection } from '../../core/build/document';
import { selectedImportedInstance } from '../../features/import/inventory';
import { editBuild } from '../../app/editor/build-editor';
import { createLocalPersistence } from '../../persistence/local/storage';
import { groupEffectiveMods } from '../../data/search/treasure-planning';
import { originalImportedPowers } from '../../core/build/existing-mods';
import type { JsonObject, JsonValue } from '../../data/normalized/progression';

let data: ReturnType<typeof loadPlannerFixture>;
let selection: EquipmentSelection;
beforeAll(() => {
  data = loadPlannerFixture();
  const text = readFileSync('src/features/mods/fixtures/imported-cow-unarmed.json', 'utf8');
  const result = parseStorageJson(text, createImportReferenceResolver(data));
  if (!result.ok) throw new Error('Invalid fixture');
  selection = { slot: 'MainHand', item: { kind: 'imported', instance: selectedImportedInstance(result.value.items[0]!) }, candidateMods: [],
    sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Cow', count: 5, seed: 'keep' } } };
});
function build() {
  const result = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  result.skillSlotA = { skillId: 'Cow', level: 100 }; result.skillSlotB = { skillId: 'Unarmed', level: 100 };
  result.abilityBarA = [{ abilityId: 'ability_1652', rank: null }];
  result.equipment = [structuredClone(selection), { slot: 'Ring', item: { kind: 'database', itemId: 'item_49070' }, candidateMods: [], sparks: { mode: 'none' } }];
  return result;
}
const pairs = (value: ReturnType<typeof build>) => value.equipment[0]!.item.kind === 'imported' ? value.equipment[0]!.item.instance.existingPowers : [];

it('edits exact effective pairs only, preserves raw source/unknowns/imbues, and survives schema-v1 local save/restore', () => {
  const original = build();
  const changed = editBuild(original, { type: 'existing-mod-tier', equipmentIndex: 0, index: 0, tierId: 'id_8' }, data);
  const removed = editBuild(changed, { type: 'existing-mod-remove', equipmentIndex: 0, index: 1 }, data);
  expect(pairs(original)).toHaveLength(6); expect(pairs(removed)).toHaveLength(5);
  expect(pairs(removed)[0]).toEqual({ powerId: 'power_20006', tierId: 'id_8' });
  expect(removed.equipment[1]).toBe(original.equipment[1]); expect(removed.skillSlotA).toBe(original.skillSlotA); expect(removed.abilityBarA).toBe(original.abilityBarA);
  expect(removed.equipment[0]?.sparks).toBe(original.equipment[0]?.sparks);
  const before = original.equipment[0]!.item; const after = removed.equipment[0]!.item;
  if (before.kind !== 'imported' || after.kind !== 'imported') throw new Error('Expected imported instances');
  expect(after.instance.metadata).toBe(before.instance.metadata);
  expect(JSON.stringify(after.instance.metadata)).toContain('FixtureUnknownPower'); expect(JSON.stringify(after.instance.metadata)).toContain('TSysImbuePower');
  expect(originalImportedPowers(after.instance, data)).toEqual(pairs(original));
  const memory = new Map<string, string>();
  const persistence = createLocalPersistence({ gameDataVersion: data.gameDataVersion, storage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } } });
  expect(persistence.saveDraft(removed)).toEqual({ ok: true }); expect(persistence.restoreDraft().value).toEqual(removed);
});

it.each(['id_120', 'missing', ''])('rejects invalid or cross-power tiers %s without approximation', tierId => {
  const original = build(); expect(editBuild(original, { type: 'existing-mod-tier', equipmentIndex: 0, index: 0, tierId }, data)).toBe(original);
});
it.each([-1, 1.5, 6])('rejects invalid existing power index %s', index => {
  const original = build(); expect(editBuild(original, { type: 'existing-mod-remove', equipmentIndex: 0, index }, data)).toBe(original);
});
it('guards new candidate additions against working existing IDs and staged IDs, and makes removed powers available again', () => {
  const original = build();
  const add = { type: 'mod-add' as const, equipmentIndex: 0, powerId: 'power_20006', tierId: 'id_8', unique: true };
  expect(editBuild(original, add, data)).toBe(original);
  const removed = editBuild(original, { type: 'existing-mod-remove', equipmentIndex: 0, index: 0 }, data);
  const planned = editBuild(removed, add, data);
  expect(planned.equipment[0]?.candidateMods).toEqual([{ powerId: 'power_20006', tierId: 'id_8' }]);
  expect(editBuild(planned, add, data)).toBe(planned);
  const restored = editBuild(planned, { type: 'existing-mod-restore', equipmentIndex: 0 }, data);
  expect(pairs(restored)).toEqual(pairs(original)); expect(restored.equipment[0]?.candidateMods).toBe(planned.equipment[0]?.candidateMods);
  expect(restored.equipment[0]?.sparks).toBe(original.equipment[0]?.sparks);
});
it('preserves duplicate imported occurrences and their saved indices rather than deduplicating them', () => {
  const original = build(); const item = original.equipment[0]!.item;
  if (item.kind !== 'imported') throw new Error('Expected fixture');
  item.instance.existingPowers.push({ ...item.instance.existingPowers[0]! });
  const changed = editBuild(original, { type: 'existing-mod-tier', equipmentIndex: 0, index: 6, tierId: 'id_8' }, data);
  expect(pairs(changed)[0]?.tierId).toBe('id_9'); expect(pairs(changed)[6]?.tierId).toBe('id_8');
  const removed = editBuild(changed, { type: 'existing-mod-remove', equipmentIndex: 0, index: 0 }, data);
  expect(pairs(removed).at(-1)).toEqual({ powerId: 'power_20006', tierId: 'id_8' });
});
it('restores genuine duplicate baseline entries in original source order', () => {
  const original = build(); const item = original.equipment[0]!.item;
  if (item.kind !== 'imported') throw new Error('Expected fixture');
  const source = item.instance.metadata!.sourceItem as JsonObject;
  const powers = source.TSysPowers as JsonValue[];
  source.TSysPowers = [...powers, structuredClone(powers[0]!)];
  item.instance.existingPowers.push({ ...item.instance.existingPowers[0]! });
  const removed = editBuild(original, { type: 'existing-mod-remove', equipmentIndex: 0, index: 0 }, data);
  const restored = editBuild(removed, { type: 'existing-mod-restore', equipmentIndex: 0 }, data);
  expect(pairs(restored)).toEqual(pairs(original)); expect(pairs(restored)).toHaveLength(7);
});
it('groups both origins by current skill slots without changing saved order or imported powers on a skill switch', () => {
  const original = build(); original.equipment[0]!.candidateMods = [{ powerId: 'power_20204', tierId: 'id_9' }];
  const rows = groupEffectiveMods(original.equipment[0]!, 'Cow', 'Unarmed', data);
  expect(rows.map(row => [row.origin, row.index])).toEqual([['imported', 0], ['imported', 2], ['imported', 4], ['planned', 0], ['imported', 1], ['imported', 3], ['imported', 5]]);
  expect(groupEffectiveMods(original.equipment[0]!, 'Unarmed', 'Cow', data)[0]?.mod.powerId).toBe('power_3001');
  const changed = editBuild(original, { type: 'skill', slot: 'A', skillId: 'Druid' }, data);
  expect(pairs(changed)).toBe(pairs(original)); expect(changed.equipment[0]?.candidateMods).toEqual([]);
  expect(original.equipment[0]?.candidateMods).toHaveLength(1);
});
it('retains unknown legacy working pairs read-only and protects other item kinds and data versions', () => {
  const original = build(); const item = original.equipment[0]!.item;
  if (item.kind !== 'imported') throw new Error('Expected fixture');
  item.instance.existingPowers.push({ powerId: 'missing', tierId: 'opaque' });
  expect(editBuild(original, { type: 'existing-mod-remove', equipmentIndex: 0, index: 6 }, data)).toBe(original);
  const changed = editBuild(original, { type: 'existing-mod-remove', equipmentIndex: 0, index: 0 }, data);
  expect(pairs(editBuild(changed, { type: 'existing-mod-restore', equipmentIndex: 0 }, data)).at(-1)).toEqual({ powerId: 'missing', tierId: 'opaque' });
  expect(editBuild(original, { type: 'existing-mod-restore', equipmentIndex: 1 }, data)).toBe(original);
  const protectedBuild = { ...original, gameDataVersion: 'other' };
  expect(editBuild(protectedBuild, { type: 'existing-mod-remove', equipmentIndex: 0, index: 0 }, data)).toBe(protectedBuild);
});

it('preserves the initial working baseline for legacy imported instances without fabricating report evidence', () => {
  const original = build(); const item = original.equipment[0]!.item;
  if (item.kind !== 'imported') throw new Error('Expected fixture');
  item.instance.metadata = { legacyNote: 'keep' }; delete item.instance.provenance;
  const removed = editBuild(original, { type: 'existing-mod-remove', equipmentIndex: 0, index: 0 }, data);
  const next = removed.equipment[0]!.item;
  if (next.kind !== 'imported') throw new Error('Expected instance');
  expect(next.instance.metadata).toMatchObject({ legacyNote: 'keep', originalWorkingPowers: pairs(original) });
  expect(next.instance.metadata).not.toHaveProperty('sourceItem');
  expect(pairs(editBuild(removed, { type: 'existing-mod-restore', equipmentIndex: 0 }, data))).toEqual(pairs(original));
});

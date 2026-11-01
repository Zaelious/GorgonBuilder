// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { editBuild, type BuildEdit } from '../../app/editor/build-editor';
import { createDefaultBuildDocument } from '../../core/build/document';
import { createLocalPersistence, type StorageLike } from '../../persistence/local/storage';
import { createDraftAutosave } from '../../persistence/local/autosave';
import { loadPlannerFixture } from '../../test/planner-fixture';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
function populated() {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.title = 'Preserve'; build.notes = 'Keep notes';
  build.skillSlotA = { skillId: 'Psychology', level: 90 };
  build.skillSlotB = { skillId: 'Deer', level: 70 };
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }];
  build.abilityBarB = [{ abilityId: 'ability_1578', rank: null }];
  build.target = { count: 3, damageTypes: { Psychic: { resistance: 5 } }, metadata: { kept: true } };
  build.characterImport = { reference: 'Keep', metadata: { extra: [1, null] } };
  build.equipment = [{ slot: 'Ring', item: { kind: 'imported', instance: {
    baseItemId: 'item_49070', displayName: 'My ring', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }], metadata: { keep: true },
  } }, candidateMods: [{ powerId: 'power_10001', tierId: 'id_9' }], sparks: {
    mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 10, seed: 'keep' },
  } }];
  return build;
}
function memory(): StorageLike {
  const map = new Map<string, string>();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } };
}

it('equips, replaces and clears official IDs through autosave and fresh persistence instances', () => {
  const storage = memory();
  const local = () => createLocalPersistence({ gameDataVersion: data.gameDataVersion, storage });
  const original = populated();
  let build = original;
  const items = data.items.filter(item => item.slot === 'OffHandShield').slice(0, 2);
  const edits: BuildEdit[] = [
    { type: 'equipment-equip', slot: 'OffHandShield', index: null, itemId: items[0]!.id },
    { type: 'equipment-equip', slot: 'OffHandShield', index: 1, itemId: items[1]!.id },
    { type: 'equipment-clear', index: 1 },
  ];
  for (const [index, edit] of edits.entries()) {
    build = editBuild(build, edit, data);
    const autosave = createDraftAutosave(local());
    autosave.schedule(build);
    expect(autosave.flush()).toEqual({ ok: true });
    expect(local().restoreDraft()).toEqual({ status: 'restored', value: build });
    expect(build.equipment[0]).toBe(original.equipment[0]);
    if (index < 2) expect(build.equipment[1]!.item).toEqual({ kind: 'database', itemId: items[index]!.id });
    for (const field of ['title', 'notes', 'target', 'characterImport', 'skillSlotA', 'skillSlotB', 'abilityBarA', 'abilityBarB'] as const) expect(build[field]).toBe(original[field]);
  }
  expect(build.equipment).toEqual(original.equipment);
});

it('explicit replacement preserves associated candidates and Spark settings; unrelated edits retain instance metadata', () => {
  const original = populated();
  const replaced = editBuild(original, { type: 'equipment-equip', slot: 'Ring', index: 0, itemId: 'item_49070' }, data);
  expect(replaced.equipment[0]!.item).toEqual({ kind: 'database', itemId: 'item_49070' });
  expect(replaced.equipment[0]!.candidateMods).toBe(original.equipment[0]!.candidateMods);
  expect(replaced.equipment[0]!.sparks).toBe(original.equipment[0]!.sparks);
  expect(editBuild(original, { type: 'title', title: 'New title' }, data).equipment).toBe(original.equipment);
  expect(original.equipment[0]!.item.kind).toBe('imported');
});

it('rejects wrong-slot, missing-ID, invalid-index, implicit overwrite and incompatible snapshot edits', () => {
  const build = populated();
  const edits: BuildEdit[] = [
    { type: 'equipment-equip', slot: 'OffHand', index: null, itemId: 'item_49070' },
    { type: 'equipment-equip', slot: 'Ring', index: null, itemId: 'missing' },
    { type: 'equipment-equip', slot: 'Ring', index: null, itemId: 'item_49070' },
    { type: 'equipment-equip', slot: 'Ring', index: 1, itemId: 'item_49070' },
    { type: 'equipment-equip', slot: 'Ring', index: -1, itemId: 'item_49070' },
    { type: 'equipment-clear', index: -1 }, { type: 'equipment-clear', index: 1.5 },
  ];
  for (const edit of edits) expect(editBuild(build, edit, data)).toBe(build);
  const mismatch = { ...build, gameDataVersion: 'other' };
  for (const edit of [{ type: 'equipment-clear', index: 0 }, { type: 'equipment-equip', slot: 'Ring', index: 0, itemId: 'item_49070' }] satisfies BuildEdit[]) expect(editBuild(mismatch, edit, data)).toBe(mismatch);
});

it('retains duplicate saved slots and clears only the explicitly selected entry', () => {
  const build = populated();
  build.equipment.push({ ...build.equipment[0]!, item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } } });
  const next = editBuild(build, { type: 'equipment-equip', slot: 'Ring', index: 1, itemId: 'item_49070' }, data);
  expect(next.equipment[0]).toBe(build.equipment[0]);
  expect(next.equipment).toHaveLength(2);
  expect(editBuild(next, { type: 'equipment-clear', index: 1 }, data).equipment).toEqual([build.equipment[0]]);
});

it('swaps weapon/shield types through explicit edits, preserving exact IDs, slot data and unrelated fields across reload', () => {
  const original = populated();
  original.equipment.push({ slot: 'OffHand', item: { kind: 'database', itemId: 'item_45722' },
    candidateMods: [{ powerId: 'power_10001', tierId: 'id_9' }],
    sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 12, seed: 'retain' } } });
  let build = original;
  const storage = memory();
  for (const itemId of ['item_45052', 'item_45722']) {
    const item = data.getItem(itemId)!;
    const next = editBuild(build, { type: 'equipment-equip', itemId, slot: item.slot, index: 1 }, data);
    expect(next.equipment).toHaveLength(2);
    expect(next.equipment[1]).toEqual({ ...original.equipment[1], slot: item.slot, item: { kind: 'database', itemId } });
    expect(next.equipment[1]!.candidateMods).toBe(original.equipment[1]!.candidateMods);
    expect(next.equipment[1]!.sparks).toBe(original.equipment[1]!.sparks);
    expect(next.equipment[0]).toBe(original.equipment[0]);
    for (const field of ['skillSlotA', 'skillSlotB', 'abilityBarA', 'abilityBarB', 'target', 'notes', 'title', 'characterImport'] as const) expect(next[field]).toBe(original[field]);
    const local = createLocalPersistence({ gameDataVersion: data.gameDataVersion, storage });
    const save = createDraftAutosave(local);
    save.schedule(next); expect(save.flush()).toEqual({ ok: true });
    const restored = createLocalPersistence({ gameDataVersion: data.gameDataVersion, storage }).restoreDraft();
    expect(restored.value).toEqual(next);
    expect(restored.value.schemaVersion).toBe(1);
    expect(restored.value.equipment.filter(selection => ['OffHand', 'OffHandShield'].includes(selection.slot))).toHaveLength(1);
    build = next;
  }
});

it.each(['OffHand', 'OffHandShield'])('rejects implicit additions into an occupied %s position and invalid cross-slot replacements', slot => {
  const build = populated();
  const currentId = slot === 'OffHand' ? 'item_45722' : 'item_45052';
  const otherId = slot === 'OffHand' ? 'item_45052' : 'item_45722';
  const other = data.getItem(otherId)!;
  build.equipment.push({ slot, item: { kind: 'database', itemId: currentId }, candidateMods: [], sparks: { mode: 'none' } });
  expect(editBuild(build, { type: 'equipment-equip', slot: other.slot, itemId: otherId, index: null }, data)).toBe(build);
  expect(editBuild(build, { type: 'equipment-equip', slot: other.slot, itemId: otherId, index: 0 }, data)).toBe(build);
  expect(editBuild(build, { type: 'equipment-equip', slot, itemId: otherId, index: 1 }, data)).toBe(build);
  expect(editBuild(build, { type: 'equipment-equip', slot: 'Ring', itemId: 'item_49070', index: 1 }, data)).toBe(build);
});

it('retains legacy dual-offhand payloads and rejects ordinary equip operations until an explicit resolution', () => {
  const original = populated();
  original.equipment.push(
    { ...original.equipment[0]!, slot: 'OffHand', item: { kind: 'manual', instance: { baseItemId: 'item_45722', displayName: 'Manual weapon', existingPowers: [], metadata: { keep: true } } } },
    { ...original.equipment[0]!, slot: 'OffHandShield', item: { kind: 'imported', instance: { baseItemId: 'item_45052', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }], metadata: { untouched: true } } } },
  );
  const storage = memory();
  const local = createLocalPersistence({ gameDataVersion: data.gameDataVersion, storage });
  expect(local.saveDraft(original)).toEqual({ ok: true });
  expect(local.restoreDraft().value).toEqual(original);
  for (const index of [null, 1, 2]) expect(editBuild(original, { type: 'equipment-equip', slot: 'OffHandShield', itemId: 'item_45052', index }, data)).toBe(original);
  expect(editBuild(original, { type: 'title', title: 'Another title' }, data).equipment).toBe(original.equipment);
  const resolved = editBuild(original, { type: 'equipment-resolve-offhand', keepIndex: 2 }, data);
  expect(resolved.equipment).toEqual([original.equipment[0], original.equipment[2]]);
  expect(resolved.equipment[1]).toBe(original.equipment[2]);
  expect(local.saveDraft(resolved)).toEqual({ ok: true });
  expect(local.restoreDraft().value).toEqual(resolved);
  for (const keepIndex of [-1, 0, 1.5, 10]) expect(editBuild(original, { type: 'equipment-resolve-offhand', keepIndex }, data)).toBe(original);
  expect(editBuild({ ...original, gameDataVersion: 'other' }, { type: 'equipment-resolve-offhand', keepIndex: 2 }, data).equipment).toBe(original.equipment);
});

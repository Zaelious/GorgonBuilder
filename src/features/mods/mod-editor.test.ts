// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { editBuild } from '../../app/editor/build-editor';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import { createDefaultBuildDocument } from '../../core/build/document';
import { serializeBuildDocument, deserializeBuildDocument } from '../../core/build/validation';
import { createLocalPersistence } from '../../persistence/local/storage';
import { createDraftAutosave } from '../../persistence/local/autosave';
import { loadPlannerFixture } from '../../test/planner-fixture';
let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
function populated() {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Cow', level: 90 }; build.skillSlotB = { skillId: 'Unarmed', level: 80 };
  build.abilityBarA = [{ abilityId: 'ability_1201', rank: null }]; build.abilityBarB = [{ abilityId: 'ability_1578', rank: null }];
  build.notes = 'Keep'; build.target.count = 5; build.characterImport = { metadata: { keep: true } };
  build.equipment = [{ slot: 'OffHandShield', item: { kind: 'imported', instance: { baseItemId: 'item_45052', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }], metadata: { keep: ['x'] } } },
    candidateMods: [{ powerId: 'unresolved', tierId: 'retained' }], sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Cow', count: 10, seed: 'keep' } } },
  { slot: 'OffHand', item: { kind: 'database', itemId: 'item_45722' }, candidateMods: [], sparks: { mode: 'none' } }];
  return build;
}
it('adds many/null candidates, changes tiers, moves and removes while retaining exact composite identities', () => {
  const original = populated();
  let next = original;
  const apply = (edit: CandidateModEdit) => { next = editBuild(next, edit, data); };
  for (let n = 0; n < 15; n++) apply({ type: 'mod-add', equipmentIndex: 0, powerId: n % 2 ? 'power_3001' : 'power_4001', tierId: n % 3 ? 'id_10' : null });
  expect(next.equipment[0]!.candidateMods).toHaveLength(16);
  apply({ type: 'mod-tier', equipmentIndex: 0, index: 1, tierId: 'id_12' });
  expect(next.equipment[0]!.candidateMods[1]).toEqual({ powerId: 'power_4001', tierId: 'id_12' });
  apply({ type: 'mod-move', equipmentIndex: 0, index: 1, direction: 1 });
  expect(next.equipment[0]!.candidateMods[1]).toEqual({ powerId: 'power_3001', tierId: 'id_10' });
  apply({ type: 'mod-remove', equipmentIndex: 0, index: 1 });
  apply({ type: 'mod-tier', equipmentIndex: 0, index: 1, tierId: null });
  apply({ type: 'mod-move', equipmentIndex: 0, index: 1, direction: -1 });
  expect(next.equipment[0]!.candidateMods.slice(0, 2)).toEqual([{ powerId: 'power_4001', tierId: null }, { powerId: 'unresolved', tierId: 'retained' }]);
  expect(original.equipment[0]!.candidateMods).toEqual([{ powerId: 'unresolved', tierId: 'retained' }]);
  expect(next.equipment[0]!.item).toBe(original.equipment[0]!.item);
  expect(next.equipment[0]!.sparks).toBe(original.equipment[0]!.sparks);
  expect(next.equipment[0]!.slot).toBe('OffHandShield');
  expect(next.equipment[1]).toBe(original.equipment[1]);
  expect({ ...next, equipment: [] }).toEqual({ ...original, equipment: [] });
  const serialized = serializeBuildDocument(next);
  expect(serialized.ok).toBe(true);
  if (serialized.ok) expect(deserializeBuildDocument(serialized.value)).toEqual({ ok: true, value: next });
  const bytes = new Map<string, string>();
  const storage = { getItem: (key: string) => bytes.get(key) ?? null, setItem: (key: string, value: string) => { bytes.set(key, value); } };
  const save = createDraftAutosave(createLocalPersistence({ storage, gameDataVersion: data.gameDataVersion }));
  save.schedule(next); expect(save.flush()).toEqual({ ok: true });
  expect(createLocalPersistence({ storage, gameDataVersion: data.gameDataVersion }).restoreDraft()).toEqual({ status: 'restored', value: next });
});
it('rejects invalid equipment/mod indices and unknown new composite selections without changing saved data', () => {
  const original = populated();
  const edits: CandidateModEdit[] = [
    { type: 'mod-add', equipmentIndex: -1, powerId: 'power_4001', tierId: null },
    { type: 'mod-add', equipmentIndex: 1.5, powerId: 'power_4001', tierId: null },
    { type: 'mod-add', equipmentIndex: 3, powerId: 'power_4001', tierId: null },
    { type: 'mod-add', equipmentIndex: 0, powerId: 'missing', tierId: null },
    { type: 'mod-add', equipmentIndex: 0, powerId: 'power_4001', tierId: 'id_120' },
    { type: 'mod-tier', equipmentIndex: 0, index: 0, tierId: 'id_1' },
    { type: 'mod-remove', equipmentIndex: 0, index: -1 },
    { type: 'mod-remove', equipmentIndex: 0, index: 1.5 },
    { type: 'mod-remove', equipmentIndex: 0, index: 7 },
    { type: 'mod-move', equipmentIndex: 0, index: 0, direction: -1 },
    { type: 'mod-move', equipmentIndex: 0, index: 0, direction: 1 },
  ];
  for (const edit of edits) expect(editBuild(original, edit, data)).toBe(original);
});
it.each(['mod-add', 'mod-tier', 'mod-remove', 'mod-move'] as const)('protects mismatched snapshots from %s', type => {
  const build = { ...populated(), gameDataVersion: 'other' };
  const edit = { type, equipmentIndex: 0, index: 0, powerId: 'power_4001', tierId: null, direction: 1 } as CandidateModEdit;
  expect(editBuild(build, edit, data)).toBe(build);
});
it('allows explicit editing/removing unresolved saved candidates without resolving or deleting neighbors', () => {
  const build = populated();
  const cleared = editBuild(build, { type: 'mod-tier', equipmentIndex: 0, index: 0, tierId: null }, data);
  expect(cleared.equipment[0]!.candidateMods).toEqual([{ powerId: 'unresolved', tierId: null }]);
  const removed = editBuild(build, { type: 'mod-remove', equipmentIndex: 0, index: 0 }, data);
  expect(removed.equipment[0]!.candidateMods).toEqual([]);
  expect(removed.equipment[1]).toBe(build.equipment[1]);
});

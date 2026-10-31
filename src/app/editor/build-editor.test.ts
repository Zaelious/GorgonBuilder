// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { createDefaultBuildDocument } from '../../core/build/document';
import type { BuildDocument } from '../../core/build/document';
import { createLocalPersistence } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { editBuild, selectionWarnings } from './build-editor';
import { groupAbilities } from '../../features/abilities/groups';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
const empty = () => createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
function skill(build: BuildDocument, slot: 'A' | 'B', skillId: string | null) { return editBuild(build, { type: 'skill', slot, skillId }, data); }

it.each([['Psychology', null], ['Psychology', 'Deer'], ['Cow', 'Unarmed'], ['Psychology', 'Psychology']] as const)('supports %s / %s with independent levels', (a, b) => {
  let build = skill(skill(empty(), 'A', a), 'B', b);
  build = editBuild(build, { type: 'level', slot: 'A', level: 95 }, data);
  build = editBuild(build, { type: 'level', slot: 'B', level: 71 }, data);
  expect(build.skillSlotA).toEqual({ skillId: a, level: 95 });
  expect(build.skillSlotB).toEqual({ skillId: b, level: 71 });
});

it('adds exact official IDs and available published ranks without inferring missing ranks', () => {
  const ranked = data.abilities.filter(a => a.rank !== null && data.getSkill(a.skill.skillId ?? '')?.combat);
  const examples = [data.getAbility('ability_1201')!, ...['string', 'number'].map(type => ranked.find(a => typeof a.rank === type)).filter(a => a !== undefined)];
  expect(ranked.length).toBeGreaterThan(0);
  for (const ability of examples) {
    const build = editBuild(skill(empty(), 'A', ability.skill.skillId), { type: 'add', slot: 'A', abilityId: ability.id }, data);
    expect(build.abilityBarA).toEqual([{ abilityId: ability.id, rank: ability.rank }]);
  }
});

it('keeps duplicate-skill bars independent through add, remove, reorder and skill changes', () => {
  let build = skill(skill(empty(), 'A', 'Psychology'), 'B', 'Psychology');
  const abilities = data.getAbilitiesForSkill('Psychology').slice(0, 3);
  for (const slot of ['A', 'B'] as const) for (const a of abilities) build = editBuild(build, { type: 'add', slot, abilityId: a.id }, data);
  const originalB = build.abilityBarB;
  build = editBuild(build, { type: 'move', slot: 'A', index: 2, direction: -1 }, data);
  build = editBuild(build, { type: 'remove', slot: 'A', index: 0 }, data);
  expect(build.abilityBarA.map(a => a.abilityId)).toEqual([abilities[2]!.id, abilities[1]!.id]);
  expect(build.abilityBarB).toBe(originalB);
  build = skill(build, 'A', 'Cow');
  expect(build.abilityBarA).toHaveLength(2);
  expect(selectionWarnings(build.abilityBarA[0]!, 'Cow', 90, data).join(' ')).toContain('does not belong');
  build = skill(build, 'A', null);
  expect(build.abilityBarA).toHaveLength(2);
  expect(build.abilityBarB).toBe(originalB);
  expect(build.skillSlotB.skillId).toBe('Psychology');
  const originalA = build.abilityBarA;
  build = editBuild(build, { type: 'move', slot: 'B', index: 0, direction: 1 }, data);
  build = editBuild(build, { type: 'remove', slot: 'B', index: 0 }, data);
  expect(build.abilityBarA).toBe(originalA);
  expect(build.abilityBarB.map(a => a.abilityId)).toEqual([abilities[0]!.id, abilities[2]!.id]);
});

it('rejects unavailable, noncombat, incompatible and malformed edits without changing the document', () => {
  const build = skill(empty(), 'A', 'Psychology');
  for (const skillId of ['missing', data.skills.find(s => !s.combat)!.id]) expect(skill(build, 'A', skillId)).toBe(build);
  for (const level of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(editBuild(build, { type: 'level', slot: 'A', level }, data)).toBe(build);
  for (const abilityId of ['missing', 'ability_1652']) expect(editBuild(build, { type: 'add', slot: 'A', abilityId }, data)).toBe(build);
  expect(editBuild(build, { type: 'remove', slot: 'A', index: 0 }, data)).toBe(build);
});

it('reports missing IDs, rank differences and above-level abilities without replacing selections', () => {
  expect(selectionWarnings({ abilityId: 'missing', rank: 9 }, 'Psychology', 0, data).join(' ')).toContain('unavailable');
  const ability = data.getAbilitiesForSkill('Psychology').find(a => a.level > 0)!;
  expect(selectionWarnings({ abilityId: ability.id, rank: 'unpublished' }, 'Psychology', 0, data)).toHaveLength(2);
});

it('round-trips the edited draft with unrelated fields and original ordering intact', () => {
  let build = skill(skill(empty(), 'A', 'Psychology'), 'B', 'Deer');
  build.equipment = [{ slot: 'MainHand', item: { kind: 'database', itemId: 'item_45640' }, candidateMods: [{ powerId: 'power_10001', tierId: 'id_9' }], sparks: { mode: 'none' } }];
  build.target = { count: 4, damageTypes: { Psychic: { resistance: 12 } }, metadata: { unchanged: true } };
  build.characterImport = { characterName: 'Retain me', metadata: { future: [1, null] } };
  build.notes = 'Preserve notes';
  build.title = 'Preserve title';
  const before = structuredClone(build);
  build = editBuild(build, { type: 'add', slot: 'A', abilityId: 'ability_1201' }, data);
  build = editBuild(build, { type: 'add', slot: 'B', abilityId: 'ability_1578' }, data);
  build = editBuild(build, { type: 'level', slot: 'A', level: 99 }, data);
  let json: string | null = null;
  const storage = { getItem: () => json, setItem: (_key: string, value: string) => { json = value; } };
  const local = createLocalPersistence({ gameDataVersion: data.gameDataVersion, storage });
  expect(local.saveDraft(build)).toEqual({ ok: true });
  expect(local.restoreDraft()).toEqual({ status: 'restored', value: build });
  for (const field of ['equipment', 'target', 'notes', 'title', 'characterImport'] as const) expect(build[field]).toEqual(before[field]);
});

it('preserves original snapshot metadata and refuses edits against a different snapshot', () => {
  const build = { ...empty(), gameDataVersion: 'older' };
  expect(skill(build, 'A', 'Psychology')).toBe(build);
  expect(build.gameDataVersion).toBe('older');
});

it('groups only UpgradeOf-connected abilities and keeps same-named unrelated records separate', () => {
  const template = data.getAbility('ability_1201')!;
  const abilities = [
    { ...template, id: 'base', displayName: 'Same name', upgradeOf: null },
    { ...template, id: 'upgrade', displayName: 'Different name', upgradeOf: { abilityId: 'base', internalName: 'base', status: 'resolved' as const } },
    { ...template, id: 'unrelated', displayName: 'Same name', upgradeOf: null },
  ];
  expect(groupAbilities(abilities).map(g => g.abilities.map(a => a.id).sort())).toEqual([['base', 'upgrade'], ['unrelated']]);
  const groups = groupAbilities(data.getAbilitiesForSkill('Psychology'));
  expect(groups.flatMap(g => g.abilities)).toHaveLength(data.getAbilitiesForSkill('Psychology').length);
  expect(groups.some(g => g.abilities.length > 1)).toBe(true);
});

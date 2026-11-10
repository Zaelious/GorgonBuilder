// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { createDefaultBuildDocument, type BuildDocument } from '../../core/build/document';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { editBuild } from './build-editor';
import { defaultBuildTitle, isAutomaticTitle, UNTITLED_BUILD } from './default-title';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
const empty = () => createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
const skill = (build: BuildDocument, slot: 'A' | 'B', skillId: string | null) => editBuild(build, { type: 'skill', slot, skillId }, data);
const title = (build: BuildDocument, text: string) => editBuild(build, { type: 'title', title: text }, data);

it('names a new build from official combat-skill names in slot order', () => {
  expect(skill(skill(empty(), 'A', 'Cow'), 'B', 'Unarmed').title).toBe('Cow/Unarmed');
  expect(skill(skill(empty(), 'A', 'Deer'), 'B', 'Psychology').title).toBe('Deer/Psychology');
  expect(skill(skill(empty(), 'B', 'Psychology'), 'A', 'Deer').title).toBe('Deer/Psychology');
  // The official v490 Cow record has no separate display name; the UI and title both show its ID.
  expect(data.getSkill('Cow')?.name ?? 'Cow').toBe('Cow');
});

it('uses one skill, a duplicated skill once, and the factory title when empty', () => {
  expect(skill(empty(), 'A', 'Cow').title).toBe('Cow');
  expect(skill(empty(), 'B', 'Unarmed').title).toBe('Unarmed');
  expect(skill(skill(empty(), 'A', 'Psychology'), 'B', 'Psychology').title).toBe('Psychology');
  expect(skill(skill(skill(empty(), 'A', 'Cow'), 'B', 'Unarmed'), 'A', null).title).toBe('Unarmed');
  expect(skill(skill(empty(), 'A', 'Cow'), 'A', null).title).toBe(UNTITLED_BUILD);
  expect(defaultBuildTitle(empty(), data)).toBe(UNTITLED_BUILD);
});

it('follows skill changes until customized, then never overwrites the custom title', () => {
  let build = skill(skill(empty(), 'A', 'Cow'), 'B', 'Unarmed');
  build = skill(build, 'B', 'Psychology');
  expect(build.title).toBe('Cow/Psychology');
  build = title(build, 'Cow/Psychology Tank');
  expect(isAutomaticTitle(build, data)).toBe(false);
  for (const id of ['Unarmed', 'Deer', null]) build = skill(build, 'B', id);
  build = skill(build, 'A', 'Psychology');
  expect(build.title).toBe('Cow/Psychology Tank');
  // A custom title equal to only one skill name is still custom once the pair changes.
  let tank = title(skill(skill(empty(), 'A', 'Deer'), 'B', 'Psychology'), 'Deer');
  tank = skill(tank, 'B', 'Unarmed');
  expect(tank.title).toBe('Deer');
});

it('keeps saved custom titles (e.g. loaded My Builds records) and leaves non-skill edits alone', () => {
  const loaded = { ...skill(skill(empty(), 'A', 'Cow'), 'B', 'Unarmed'), title: 'Tank Deer' };
  expect(skill(loaded, 'B', 'Psychology').title).toBe('Tank Deer');
  const auto = skill(empty(), 'A', 'Cow');
  expect(editBuild(auto, { type: 'level', slot: 'A', level: 80 }, data).title).toBe('Cow');
  // Legacy drafts still titled "Untitled build" adopt the pair on their next skill change.
  const legacy = { ...skill(skill(empty(), 'A', 'Cow'), 'B', 'Unarmed'), title: UNTITLED_BUILD };
  expect(skill(legacy, 'B', 'Psychology').title).toBe('Cow/Psychology');
});

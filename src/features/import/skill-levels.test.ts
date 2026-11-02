// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { parseCharacterSheet } from '../../core/import';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { importedSkillLevel } from './skill-levels';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
function snapshot(entry: object, resolve = true) {
  const parsed = parseCharacterSheet({ Report: 'CharacterSheet', Character: 'Synthetic', Timestamp: '2026-11-02T12:00:00Z',
    ReportVersion: 1, Skills: { Psychology: entry }, CurrentStats: {} }, resolve ? createImportReferenceResolver(data) : undefined);
  if (!parsed.ok) throw new Error('Invalid synthetic fixture');
  return parsed.value;
}

it.each([[90, 5, 95], [10, 2, 12], [90, 0, 90], [90, undefined, 90]])('interprets base %s and bonus %s once as %s', (level, bonus, expected) => {
  const source = snapshot({ Level: level, ...(bonus === undefined ? {} : { BonusLevels: bonus }) });
  const before = structuredClone(source);
  expect(importedSkillLevel(source, 'Psychology', data)).toBe(expected);
  expect(importedSkillLevel(source, 'Psychology', data)).toBe(expected);
  expect(source).toEqual(before);
  expect(source.skills[0]!.metadata.Level).toBe(level);
  expect(source.skills[0]!.bonusLevels).toBe(bonus ?? null);
});

it('declines absent, unresolved, unchecked, noncombat and version-mismatched mappings', () => {
  const source = snapshot({ Level: 90, BonusLevels: 5 });
  expect(importedSkillLevel(undefined, 'Psychology', data)).toBeNull();
  expect(importedSkillLevel(source, null, data)).toBeNull();
  expect(importedSkillLevel(source, 'Deer', data)).toBeNull();
  expect(importedSkillLevel(source, data.skills.find(skill => !skill.combat)!.id, data)).toBeNull();
  expect(importedSkillLevel(snapshot({ Level: 90 }, false), 'Psychology', data)).toBeNull();
  source.skills[0]!.reference.status = 'unresolved';
  expect(importedSkillLevel(source, 'Psychology', data)).toBeNull();
  source.skills[0]!.reference.status = 'resolved';
  source.source.resolvedWithGameDataVersion = 'other';
  expect(importedSkillLevel(source, 'Psychology', data)).toBeNull();
});

it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('declines invalid level or bonus %s', invalid => {
  const source = snapshot({ Level: 90 });
  source.skills[0]!.level = invalid;
  expect(importedSkillLevel(source, 'Psychology', data)).toBeNull();
  source.skills[0]!.level = 90;
  source.skills[0]!.bonusLevels = invalid;
  expect(importedSkillLevel(source, 'Psychology', data)).toBeNull();
});

it('declines ambiguous matches and unsafe sums', () => {
  const source = snapshot({ Level: 90, BonusLevels: 5 });
  source.skills.push(structuredClone(source.skills[0]!));
  expect(importedSkillLevel(source, 'Psychology', data)).toBeNull();
  source.skills.pop();
  source.skills[0]!.level = Number.MAX_SAFE_INTEGER;
  expect(importedSkillLevel(source, 'Psychology', data)).toBeNull();
});

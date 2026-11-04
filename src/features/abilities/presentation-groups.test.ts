// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { groupAbilities } from './groups';
import { groupPickerAbilities, SPECIFIED_VARIANT_FAMILIES } from './presentation-groups';
import { ABILITY_ROLE_LABELS, abilityRoles } from './roles';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

it('derives all nine displayed roles from the exact pinned official keywords, without name guesses', () => {
  expect(ABILITY_ROLE_LABELS).toHaveLength(9);
  for (const [keyword, label] of ABILITY_ROLE_LABELS) {
    const ability = data.abilities.find(candidate => candidate.keywords?.includes(keyword));
    expect(ability, `Published ${keyword}`).toBeDefined();
    expect(abilityRoles(ability!)).toContainEqual({ keyword, label, conditional: false });
  }
  expect(abilityRoles(data.getAbility('ability_1001')!).some(role => role.label === 'Basic Attack')).toBe(true);
  expect(abilityRoles(data.getAbility('ability_1001')!).some(role => role.label === 'Epic Attack')).toBe(false);
});

it('conditional keyword-only roles are identified as conditional, not unconditionally active', () => {
  const actual = data.getAbility('ability_1001')!;
  const roles = abilityRoles({
    ...actual,
    keywords: ['BasicAttack'],
    conditionalKeywords: [{ keyword: 'MajorHeal' }] as typeof actual.conditionalKeywords,
  });
  expect(roles).toEqual([
    { keyword: 'BasicAttack', label: 'Basic Attack', conditional: false },
    { keyword: 'MajorHeal', label: 'Major Healing Ability', conditional: true },
  ]);
});

it('groups only the seven approved, exact-ID verified variant sets in v490', () => {
  expect(SPECIFIED_VARIANT_FAMILIES).toHaveLength(7);
  let grouped = 0;
  for (const skillId of [...new Set(SPECIFIED_VARIANT_FAMILIES.map(spec => spec.skillId))]) {
    const abilities = data.getAbilitiesForSkill(skillId);
    const sourceGroups = groupAbilities(abilities);
    const pickerGroups = groupPickerAbilities(abilities);
    const sourceIds = sourceGroups.flatMap(group => group.abilities.map(ability => ability.id)).sort();
    const displayedIds = pickerGroups.flatMap(group => group.abilities.map(ability => ability.id)).sort();
    expect(displayedIds, skillId).toEqual(sourceIds); // no disappeared or duplicated canonical ability
    for (const spec of SPECIFIED_VARIANT_FAMILIES.filter(spec => spec.skillId === skillId)) {
      const group = pickerGroups.find(candidate => candidate.isVariantFamily && candidate.name === spec.name);
      expect(group, `${skillId} / ${spec.name}`).toBeDefined();
      expect(group!.abilities.map(ability => ability.id).sort()).toEqual([...spec.ids].sort());
      expect(group!.variants.length).toBeGreaterThan(1);
      expect(group!.variants.flatMap(variant => variant.abilities.map(ability => ability.id)).sort()).toEqual([...spec.ids].sort());
      grouped++;
    }
    for (const group of pickerGroups.filter(candidate => !candidate.isVariantFamily)) {
      expect(group.variants).toHaveLength(1);
      expect(group.variants[0]).toMatchObject({ id: group.id, name: group.name });
    }
  }
  expect(grouped).toBe(7);
});

it('a partially available variant family fails closed to ordinary UpgradeOf families', () => {
  const all = data.getAbilitiesForSkill('AnimalHandling');
  const missing = all.filter(ability => ability.id !== 'ability_2014');
  expect(groupPickerAbilities(missing).some(group => group.isVariantFamily && group.name === 'Call Stabled Pet')).toBe(false);
  expect(groupPickerAbilities(missing).flatMap(group => group.abilities.map(ability => ability.id)).sort())
    .toEqual(missing.map(ability => ability.id).sort());
});

it('ordinary families still use canonical UpgradeOf groups and remain unchanged', () => {
  const abilities = data.getAbilitiesForSkill('Unarmed');
  const originals = groupAbilities(abilities);
  const picker = groupPickerAbilities(abilities);
  expect(picker.every(group => !group.isVariantFamily)).toBe(true);
  expect(picker.map(({ variants: _variants, isVariantFamily: _flag, ...original }) => original)).toEqual(originals);
});

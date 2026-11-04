// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { groupAbilities } from './groups';
import { groupPickerAbilities, SPECIFIED_VARIANT_FAMILIES, variantSeriesTag } from './presentation-groups';
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
    conditionalKeywords: [{ keyword: 'MajorHeal' }] as unknown as typeof actual.conditionalKeywords,
  });
  expect(roles).toEqual([
    { keyword: 'BasicAttack', label: 'Basic Attack', conditional: false },
    { keyword: 'MajorHeal', label: 'Major Healing Ability', conditional: true },
  ]);
});

it('groups only the eight approved, exact-ID verified variant sets in v490', () => {
  expect(SPECIFIED_VARIANT_FAMILIES).toHaveLength(8);
  let grouped = 0;
  let variantSeries = 0;
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
      expect(group!.variants.map(variant => variant.name)).toEqual(spec.variants.map(variant => variant.name));
      variantSeries += group!.variants.length;
      for (const variant of group!.variants) {
        expect(variant.abilities.map(ability => ability.id).sort()).toEqual(variant.canonicalGroups.flatMap(source => source.abilities.map(ability => ability.id)).sort());
      }
      expect(group!.variants.flatMap(variant => variant.abilities.map(ability => ability.id)).sort()).toEqual([...spec.ids].sort());
      grouped++;
    }
    for (const group of pickerGroups.filter(candidate => !candidate.isVariantFamily)) {
      expect(group.variants).toHaveLength(1);
      expect(group.variants[0]).toMatchObject({ id: group.id, name: group.name });
    }
  }
  expect(grouped).toBe(8);
  expect(variantSeries).toBe(16);
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
  expect(picker.map(group => ({ id: group.id, name: group.name, abilities: group.abilities }))).toEqual(originals);
});

it('Animal Handling Mark Weakness shows as one family: the UpgradeOf rank group plus the ten TSysBonus singletons', () => {
  const all = data.getAbilitiesForSkill('AnimalHandling');
  const rows = groupPickerAbilities(all).filter(group => group.abilities.some(ability => ability.internalName.includes('MarkWeakness')));
  expect(rows).toHaveLength(1);
  const [family] = rows;
  expect(family!.isVariantFamily).toBe(true);
  expect(family!.variants.map(variant => [variant.name, variant.abilities.map(ability => ability.internalName)])).toEqual([
    ['Mark Weakness', Array.from({ length: 10 }, (_, i) => `MarkWeakness${i + 1}`)],
    ['Bonus version', Array.from({ length: 10 }, (_, i) => `TSysBonusMarkWeakness${i + 1}`)],
  ]);
  // The standard series is still exactly the canonical UpgradeOf group.
  expect(family!.variants[0]!.canonicalGroups).toHaveLength(1);
  expect(family!.variants[1]!.canonicalGroups).toHaveLength(10);
});

it('a missing Mark Weakness ID fails closed to the ordinary picker rows', () => {
  const all = data.getAbilitiesForSkill('AnimalHandling');
  const missing = all.filter(ability => ability.id !== 'ability_4245');
  const picker = groupPickerAbilities(missing);
  expect(picker.some(group => group.isVariantFamily && group.name === 'Mark Weakness')).toBe(false);
  expect(picker.some(group => group.isVariantFamily && group.name === 'Call Stabled Pet')).toBe(true);
  expect(picker.filter(group => group.abilities.some(ability => ability.internalName.includes('MarkWeakness')))).toHaveLength(10);
});

it('public series labels contain no InternalNames or data-model terms; InternalName ranges stay debug-only data', () => {
  for (const spec of SPECIFIED_VARIANT_FAMILIES) {
    expect(spec.name, spec.name).not.toMatch(/TSys|UpgradeOf|Auto[AB]\d|Internal\d|\bverified\b/u);
    for (const variant of spec.variants) {
      expect(variant.name, variant.name).not.toMatch(/TSys|UpgradeOf|Internal|Auto[AB]|SoD\d|SZ\d|[a-z][A-Z]|\bIDs?\b/u);
      expect(variant.internal.length, variant.name).toBeGreaterThan(0);
    }
  }
});

it('non-standard series in multi-series families carry a display tag; standard and single-series abilities do not', () => {
  expect(variantSeriesTag('ability_4241')).toBe('Bonus version'); // TSysBonusMarkWeakness1
  expect(variantSeriesTag('ability_8043')).toBe('Bonus version'); // TSysBonusMindworm2
  expect(variantSeriesTag('ability_9212')).toBe('Alternate version A'); // FlamestrikeAutoA2
  expect(variantSeriesTag('ability_9224')).toBe('Alternate version B');
  expect(variantSeriesTag('ability_4979')).toBe('Burst version B');
  expect(variantSeriesTag('ability_9101')).toBe('Triggered version');
  for (const id of ['ability_4231', 'ability_8028', 'ability_9062', 'ability_4866', 'ability_2010', 'ability_8621', 'ability_3273', 'ability_1001']) {
    expect(variantSeriesTag(id), id).toBeNull();
  }
  // Same display name across series: the tag is what distinguishes them on the bar.
  expect(data.getAbility('ability_9062')!.displayName).toBe(data.getAbility('ability_9212')!.displayName);
});

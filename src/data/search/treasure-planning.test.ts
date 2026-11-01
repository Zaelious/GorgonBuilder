// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { browseTreasurePowers, indexTreasurePowers, treasureRelevance, treasureSlot } from './treasure';
import { availableTreasurePowers, candidateTargetMismatch, fitsItem, groupTreasurePowers, orderTreasureTiers, previewTreasureTiers, treasureCategoryLabel, type ModCategories } from './treasure-planning';
let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
const enabled: ModCategories = { generic: true, endurance: true, shamanic: true };
const group = (skills: string[], categories = enabled, all = false) => groupTreasurePowers(data.treasurePowers, skills, categories, all, data);
it('verifies exact source selectors/category counts against pinned raw records and distinct profile/slot metadata', () => {
  const raw = JSON.parse(readFileSync('src/data/raw/cache/v490/tsysclientinfo.json', 'utf8')) as Record<string, { Skill: string; InternalName: string; Slots: string[] }>;
  const profiles = JSON.parse(readFileSync('src/data/raw/cache/v490/tsysprofiles.json', 'utf8')) as Record<string, string[]>;
  for (const [id, count] of [['AnySkill', 90], ['Endurance', 22], ['ShamanicInfusion', 28]] as const) {
    const records = Object.entries(raw).filter(([, row]) => row.Skill === id);
    expect(records).toHaveLength(count);
    expect(group(['Archery']).find(group => group.id === id)!.powers.map(p => p.id).sort()).toEqual(records.map(([id]) => id).sort());
  }
  const shamanic = Object.values(raw).filter(row => row.Skill === 'ShamanicInfusion');
  expect(shamanic.every(row => profiles.Shamanic!.includes(row.InternalName))).toBe(true);
  expect(profiles.Shamanic).toHaveLength(28);
  expect(raw.power_111!.Skill).toBe('AnySkill'); expect(profiles.None).toContain(raw.power_111!.InternalName);
  expect(raw.power_31001!.Skill).toBe('Endurance'); expect(raw.power_31001!.Slots).toEqual(['None']);
  expect(profiles.Brewing).toContain(raw.power_31001!.InternalName);
  expect(data.getTreasurePower('power_111')!.skill.status).toBe('uninterpreted');
});
it('shows no Available groups without a resolved combat skill, even in all-skills mode', () => {
  expect(group([])).toEqual([]); expect(group([], enabled, true)).toEqual([]);
  expect(group(['missing'])).toEqual([]);
});
it('groups Archery and unique A+B/A+A selections without duplicating powers', () => {
  expect(group(['Archery']).find(g => g.id === 'Archery')!.powers).toHaveLength(70);
  expect(group(['Archery', 'Cow']).slice(0, 2).map(g => g.id)).toEqual(['Archery', 'Cow']);
  expect(group(['Archery', 'Archery']).filter(g => g.id === 'Archery')).toHaveLength(1);
  const list = group(['Archery', 'Archery']).flatMap(g => g.powers.map(p => p.id));
  expect(new Set(list).size).toBe(list.length);
});
it.each(['generic', 'endurance', 'shamanic'] as const)('independently toggles %s and keeps active skills and unknown fallbacks', key => {
  const id = { generic: 'AnySkill', endurance: 'Endurance', shamanic: 'ShamanicInfusion' }[key];
  const groups = group(['Archery'], { ...enabled, [key]: false });
  expect(groups.find(g => g.id === id)).toBeUndefined();
  expect(groups.find(g => g.id === 'Archery')!.powers).toHaveLength(70);
  expect(groups.find(g => g.id === 'unknown')!.powers).toHaveLength(6);
});
it('keeps AnySkill explicitly unknown and does not classify powers by suggestive internal names', () => {
  expect(treasureCategoryLabel(data.getTreasurePower('power_101')!, data)).toContain('association unknown');
  expect(treasureCategoryLabel(data.getTreasurePower('power_13501')!, data)).toBe('Unknown association');
  const fake = { ...data.getTreasurePower('power_10001')!, internalName: 'ShamanicEnduranceGeneric' };
  expect(groupTreasurePowers([fake], ['Archery'], enabled, false, data).map(g => g.id)).toEqual(['Archery']);
});
it('allows all-skills exploration while keeping special category toggles independent', () => {
  const groups = group(['Archery'], { generic: false, endurance: false, shamanic: false }, true);
  expect(groups.some(g => g.id === 'Psychology')).toBe(true);
  expect(groups.some(g => ['AnySkill', 'Endurance', 'ShamanicInfusion'].includes(g.id))).toBe(false);
});
it('preserves item-profile/slot relevance order within skill groups without excluding exploratory rows', () => {
  const index = indexTreasurePowers(data.treasurePowers);
  const lists = ['item_45722', 'item_49070'].map(id => {
    const context = { item: data.getItem(id), skillIds: ['Archery'] };
    const relevance = new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)]));
    const ordered = browseTreasurePowers(index, '', relevance, 'relevant');
    return groupTreasurePowers(ordered, context.skillIds, enabled, false, data).find(g => g.id === 'Archery')!.powers.map(p => p.id);
  });
  expect(lists[0]).not.toEqual(lists[1]);
  expect([...lists[0]!].sort()).toEqual([...lists[1]!].sort());
});
it.each([['max', 'id_12', '{MOD_SKILL_ARCHERY}{0.6}'], [90, 'id_9', '{MOD_SKILL_ARCHERY}{0.45}'], [100, 'id_10', '{MOD_SKILL_ARCHERY}{0.5}']] as const)('previews exact published effects at %s independently of display tier keys', (level, id, effect) => {
  const tiers = previewTreasureTiers(data.getTreasurePower('power_10001')!, level);
  expect(tiers[0]!.id).toBe(id); expect(tiers[0]!.effectDescriptions).toContain(effect);
});
it('retains overlapping ranges and rarity alternatives with deterministic ordering, without interpreting strength', () => {
  const power = data.getTreasurePower('power_10001')!;
  expect(previewTreasureTiers(power, 90).map(t => t.id)).toEqual(['id_9', 'id_8', 'id_7']);
  const tier = power.tiers[0]!;
  const synthetic = { ...power, tiers: [{ ...tier, id: 'id_777', minLevel: 100, maxLevel: 120, minRarity: 'Rare' }, { ...tier, id: 'id_2', minLevel: 100, maxLevel: 120, minRarity: 'Epic' }] };
  expect(previewTreasureTiers(synthetic, 'max')).toHaveLength(2);
  expect(previewTreasureTiers(synthetic, 'max')).toEqual(orderTreasureTiers([...synthetic.tiers].reverse()));
  expect(previewTreasureTiers(power, 0)).toEqual([]);
  expect(previewTreasureTiers({ ...power, tiers: [] }, 'max')).toEqual([]);
});
it('uses source levels for the nonstandard id_120 key and marks preview differences without mutating selections', () => {
  const power = data.getTreasurePower('power_129')!;
  expect(previewTreasureTiers(power, 'max')[0]!.id).toBe('id_120');
  expect(candidateTargetMismatch(power, 'id_120', 90)).toBe(true);
  expect(candidateTargetMismatch(power, 'id_9', 90)).toBe(false);
  expect(candidateTargetMismatch(power, null, 90)).toBe(false);
  expect(candidateTargetMismatch(power, 'missing', 90)).toBe(false);
  expect(candidateTargetMismatch(undefined, 'id_1', 'max')).toBe(false);
});

it('lists exactly the 11 official Druid Chest powers for an All-profile Chest, one entry each, and excludes staged powers', () => {
  const context = { item: data.getItem('item_42705'), skillIds: ['Druid'] };
  const relevance = new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)]));
  const druid = (staged: Set<string>, explore = false) => groupTreasurePowers(availableTreasurePowers(data.treasurePowers, relevance, staged, explore, data),
    context.skillIds, enabled, false, data).find(g => g.id === 'Druid')?.powers.map(p => p.id) ?? [];
  const ids = druid(new Set());
  expect([...ids].sort()).toEqual(['power_14005', 'power_14012', 'power_14051', 'power_14052', 'power_14101', 'power_14154', 'power_14159', 'power_14201', 'power_14351', 'power_14501', 'power_14602']);
  expect(druid(new Set(['power_14005']))).toEqual(ids.filter(id => id !== 'power_14005'));
  expect(druid(new Set(), true)).toHaveLength(65);
  // Endurance/Shamanic use slot only (their published profiles are not item profiles); AnySkill also needs the item profile.
  const groups = groupTreasurePowers(availableTreasurePowers(data.treasurePowers, relevance, new Set(), false, data), context.skillIds, enabled, false, data);
  expect(groups.find(g => g.id === 'ShamanicInfusion')!.powers.map(p => p.id).sort()).toEqual(['power_30101', 'power_30102', 'power_30103', 'power_30104']);
  expect(groups.find(g => g.id === 'Endurance')!.powers).toHaveLength(6);
  expect(groups.find(g => g.id === 'AnySkill')!.powers.every(p => relevance.get(p.id)!.profile === 'match')).toBe(true);
});
it('maps OffHandShield items to the published OffHand treasure slot and never excludes unknown signals', () => {
  expect(treasureSlot('OffHandShield')).toBe('OffHand');
  expect(treasureSlot('Chest')).toBe('Chest');
  const shield = { item: data.getItem('item_45052'), skillIds: [] };
  expect(treasureRelevance(data.getTreasurePower('power_12301')!, shield, data).slot).toBe('match');
  const power = data.getTreasurePower('power_14005')!;
  expect(fitsItem(power, { profile: 'unknown', slot: 'unknown', skill: 'unknown' }, data)).toBe(true);
  expect(fitsItem(power, { profile: 'different', slot: 'match', skill: 'match' }, data)).toBe(false);
  expect(fitsItem(power, { profile: 'match', slot: 'different', skill: 'match' }, data)).toBe(false);
  expect(fitsItem(data.getTreasurePower('power_30101')!, { profile: 'different', slot: 'match', skill: 'unknown' }, data)).toBe(true);
});

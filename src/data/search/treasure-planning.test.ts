// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { browseTreasurePowers, indexTreasurePowers, treasureRelevance } from './treasure';
import { candidateTargetMismatch, groupTreasurePowers, orderTreasureTiers, previewTreasureTiers, treasureCategoryLabel, type ModCategories } from './treasure-planning';
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
  const lists = ['item_45722', 'item_45052'].map(id => {
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

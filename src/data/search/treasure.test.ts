// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { browseTreasurePowers, indexTreasurePowers, powerName, treasureRelevance, type TreasureContext } from './treasure';

let data: ReturnType<typeof loadPlannerFixture>;
let index: ReturnType<typeof indexTreasurePowers>;
beforeAll(() => { data = loadPlannerFixture(); index = indexTreasurePowers(data.treasurePowers); });
const search = (query: string) => browseTreasurePowers(index, query, new Map(), 'all');
it.each(['Psychology', 'Cow', 'Unarmed'])('finds real %s powers', skill => {
  expect(search(skill).some(power => power.skill.skillId === skill)).toBe(true);
});
it('searches published names, internal names, IDs, tier keys, rarity and exact descriptions', () => {
  const power = data.getTreasurePower('power_4001')!;
  for (const query of [power.prefix!, power.suffix!, power.internalName, power.id, 'ID_12', 'uncommon', '{MOD_SKILL_PSYCHOLOGY}{0.6}']) {
    expect(search(query)).toContain(power);
  }
  const prose = data.getTreasurePower('power_13501')!;
  expect(search('all hammer attacks except for pound')).toContain(prose);
  expect(search('MOD SKILL PSYCHOLOGY')).toContain(power);
  expect(powerName(power)).toBe(power.prefix);
});
it('uses independent profile, exact published slot and resolved selected-skill signals', () => {
  const power = data.getTreasurePower('power_4001')!;
  const item = data.items.find(item => item.slot === 'Head' && item.treasureProfile?.status === 'resolved')!;
  expect(treasureRelevance(power, { item, skillIds: ['Psychology'] }, data)).toEqual({ profile: 'match', slot: 'match', skill: 'match' });
  expect(treasureRelevance(power, { item: data.getItem('item_45052'), skillIds: ['Cow'] }, data)).toEqual({ profile: 'different', slot: 'different', skill: 'different' });
});
it('changes profile relevance and result order for different official items without excluding exploration', () => {
  const contexts = ['item_45722', 'item_45052'].map(id => ({ item: data.getItem(id), skillIds: ['Psychology'] }));
  const maps = contexts.map(context => new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)])));
  expect(data.treasurePowers.some(power => maps[0]!.get(power.id)!.profile !== maps[1]!.get(power.id)!.profile)).toBe(true);
  const ranked = maps.map(map => browseTreasurePowers(index, '', map, 'relevant'));
  expect(ranked[0]).not.toEqual(ranked[1]);
  for (const list of ranked) expect(new Set(list.map(p => p.id))).toEqual(new Set(data.treasurePowers.map(p => p.id)));
  expect(browseTreasurePowers(index, '', maps[0]!, 'all')).toEqual(browseTreasurePowers(index, '', maps[1]!, 'all'));
});
it.each(['AnySkill', 'Unknown'])('keeps %s associations unknown even with selected combat skills', sourceId => {
  const power = data.treasurePowers.find(p => p.skill.sourceId === sourceId)!;
  expect(treasureRelevance(power, { item: undefined, skillIds: ['Psychology', 'Cow'] }, data)).toEqual({ profile: 'unknown', slot: 'unknown', skill: 'unknown' });
  expect(search(power.id)).toContain(power);
});
it('keeps missing, unresolved, absent profile/slot/skill context unknown', () => {
  const power = { ...data.getTreasurePower('power_4001')!, slots: [] };
  const base = data.getItem('item_49070')!;
  for (const treasureProfile of [null, { profileId: 'missing', status: 'missing' as const }, { profileId: 'missing', status: 'resolved' as const }]) {
    const context: TreasureContext = { item: { ...base, treasureProfile }, skillIds: [] };
    expect(treasureRelevance(power, context, data)).toEqual({ profile: 'unknown', slot: 'unknown', skill: 'unknown' });
  }
});
it('ranks profile before slot before skill and leaves unavailable powers discoverable', () => {
  const a = data.getTreasurePower('power_4001')!, b = data.getTreasurePower('power_3001')!;
  const entries = indexTreasurePowers([a, b]);
  const relevance = new Map([[a.id, { profile: 'match', slot: 'different', skill: 'different' }], [b.id, { profile: 'different', slot: 'match', skill: 'match' }]] as const);
  expect(browseTreasurePowers(entries, '', relevance, 'relevant')).toEqual([a, b]);
  expect(search('power_13501')[0]!.isUnavailable).toBe(true);
});

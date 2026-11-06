// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type BuildDocument, type EquipmentSelection } from '../build/document';
import { editExistingMods } from '../build/existing-mods';
import { aggregateBuildModifiers } from './aggregate';
import { cowUnarmedFixture, psychologyFixture } from './fixtures';
import type { ModifierAggregationResult, NormalizedModifier } from './modifiers';
import { DEFAULT_MODIFIER_RULES, createModifierRegistry, parseEffectDescription } from './registry';
import { formatAggregationReport } from './report';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

const psychology = () => psychologyFixture(data.gameDataVersion);
const cowUnarmed = () => cowUnarmedFixture(data.gameDataVersion);
const aggregate = (build: BuildDocument) => aggregateBuildModifiers(build, data);

/** Source identity without array positions, so removing another record does not look like a change. */
function projected(result: ModifierAggregationResult): Map<string, unknown> {
  return new Map(result.modifiers.map(modifier => {
    const source = { ...modifier.source } as Record<string, unknown>;
    delete source.equipmentIndex; delete source.modIndex;
    return [modifier.key, { ...modifier, source }];
  }));
}
const bySource = (result: ModifierAggregationResult, kind: NormalizedModifier['source']['kind']) => result.modifiers.filter(m => m.source.kind === kind);
const tierValue = (powerId: string, tierId: string) => {
  const parsed = parseEffectDescription(data.getTreasureTier(powerId, tierId)!.effectDescriptions[0]!);
  if (parsed.kind !== 'attribute') throw new Error('Expected attribute effect');
  return parsed.value;
};
function tableTotal(tableId: string, attributeId: string, level: number) {
  return data.getAdvancementTable(tableId)!.progression.filter(entry => entry.level <= level)
    .flatMap(entry => entry.rewards.filter(reward => reward.id === attributeId)).reduce((sum, reward) => sum + (reward.value as number), 0);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
function importedSelection(build: BuildDocument): EquipmentSelection {
  return build.equipment[0]!;
}

describe('T0012 skill advancement aggregation', () => {
  it('1. Psychology only: aggregates the official active table and keeps unlock rewards as non-modifier records', () => {
    const result = aggregate(psychology());
    expect(result.activeSkillIds).toEqual(['Psychology']);
    const skill = bySource(result, 'skill-advancement');
    expect(skill.map(m => m.attributeId)).toEqual(['MAX_HEALTH', 'MAX_POWER']);
    for (const modifier of skill) {
      expect(modifier.value).toBe(tableTotal('3_Balanced', modifier.attributeId, 100));
      expect(modifier.confidence).toBe('assumed');
      expect(modifier.assumptions.join(' ')).toMatch(/per-level increments/u);
      expect(modifier.source).toMatchObject({ skillId: 'Psychology', slots: ['A'], level: 100, advancement: 'active', tableId: '3_Balanced' });
    }
    expect(result.unsupported.filter(u => u.reason === 'progression-rewards-not-modifiers')).toHaveLength(1);
    // No direct damage multiplier is inferred from skill level.
    expect(skill.every(m => m.category === 'max-resource-flat')).toBe(true);
    // Equipment-derived Psychology modifiers keep distinct buckets.
    const base = result.modifiers.filter(m => m.category === 'skill-base-damage-percent' && m.attributeId === 'MOD_SKILL_PSYCHOLOGY');
    expect(base.map(m => [m.source.kind, m.value])).toEqual([['item-fixed-effect', 0.2], ['candidate-mod', 0.45]]);
    expect(result.warnings).toEqual([]);
  });

  it('2. Cow/Unarmed aggregate each distinct skill with its own official table and slot', () => {
    const result = aggregate(cowUnarmed());
    expect(result.activeSkillIds).toEqual(['Cow', 'Unarmed']);
    const skill = bySource(result, 'skill-advancement');
    const cow = skill.filter(m => m.source.kind === 'skill-advancement' && m.source.skillId === 'Cow');
    const unarmed = skill.filter(m => m.source.kind === 'skill-advancement' && m.source.skillId === 'Unarmed');
    expect(cow.map(m => m.attributeId)).toEqual(['MAX_HEALTH', 'MAX_POWER', 'MITIGATION_CRUSHING', 'MITIGATION_PIERCING', 'MITIGATION_SLASHING']);
    expect(unarmed.map(m => m.attributeId)).toEqual(['MAX_HEALTH', 'MAX_POWER']);
    expect(cow.every(m => m.source.kind === 'skill-advancement' && m.source.tableId === '11_PlayerCow' && m.source.slots.join() === 'A')).toBe(true);
    expect(unarmed.every(m => m.source.kind === 'skill-advancement' && m.source.tableId === '3_Balanced' && m.source.slots.join() === 'B')).toBe(true);
    expect(cow[2]).toMatchObject({ category: 'damage-type-mitigation-flat', scope: { kind: 'damage-type', damageType: 'Crushing', delivery: null } });
    // Both skills' MAX_HEALTH remain separate records; no combination rule is invented.
    expect(skill.filter(m => m.attributeId === 'MAX_HEALTH')).toHaveLength(2);
  });

  it('3. the same skill in A and B at the same level contributes skill-wide rewards once', () => {
    const single = aggregate(psychology());
    const doubled = psychology(); doubled.skillSlotB = { skillId: 'Psychology', level: 100 };
    const result = aggregate(doubled);
    expect(result.activeSkillIds).toEqual(['Psychology']);
    const a = bySource(single, 'skill-advancement'); const ab = bySource(result, 'skill-advancement');
    expect(ab).toHaveLength(a.length);
    expect(ab.map(m => [m.key, m.value])).toEqual(a.map(m => [m.key, m.value]));
    expect(ab.every(m => m.source.kind === 'skill-advancement' && m.source.slots.join() === 'A,B')).toBe(true);
    expect(result.unsupported.filter(u => u.reason === 'progression-rewards-not-modifiers')).toHaveLength(1);
    expect(new Set(result.modifiers.map(m => m.key)).size).toBe(result.modifiers.length);
  });

  it('4. the same skill at two different levels is reported, not silently reconciled', () => {
    const build = psychology(); build.skillSlotB = { skillId: 'Psychology', level: 70 };
    const result = aggregate(build);
    expect(bySource(result, 'skill-advancement')).toEqual([]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'skill-level-conflict', skillId: 'Psychology' })]);
    expect(result.unsupported.find(u => u.reason === 'skill-level-conflict')?.source).toMatchObject({ kind: 'skill', slots: ['A', 'B'], levels: [100, 70] });
    // Equipment contributions are unaffected by the skill-level conflict.
    const equipmentKeys = (r: ModifierAggregationResult) => r.modifiers.filter(m => m.source.kind !== 'skill-advancement').map(m => m.key);
    expect(equipmentKeys(result)).toEqual(equipmentKeys(aggregate(psychology())));
  });

  it('warns for levels beyond the published table, invalid levels, unknown and non-combat skills', () => {
    const high = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
    high.skillSlotA = { skillId: 'Psychology', level: 125 };
    const highResult = aggregate(high);
    expect(highResult.warnings.map(w => w.code)).toEqual(['level-exceeds-advancement-table']);
    expect(bySource(highResult, 'skill-advancement')[0]?.value).toBe(tableTotal('3_Balanced', 'MAX_HEALTH', 100));
    const odd = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
    odd.skillSlotA = { skillId: 'NotAnOfficialSkill', level: 50 }; odd.skillSlotB = { skillId: 'Psychology', level: -1 };
    expect(aggregate(odd).warnings.map(w => w.code)).toEqual(['unknown-skill', 'invalid-skill-level']);
    const nonCombat = data.skills.find(s => !s.combat && s.activeAdvancement === null)!;
    const crafted = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
    crafted.skillSlotA = { skillId: nonCombat.id, level: 10 };
    expect(aggregate(crafted).warnings.map(w => w.code)).toEqual(['non-combat-skill']);
  });
});

describe('T0012 equipment and treasure aggregation', () => {
  it('5. fixed effects from multiple equipped items stay independent', () => {
    const allDirect = aggregate(psychology()).modifiers.filter(m => m.category === 'all-direct-damage-flat');
    expect(allDirect.map(m => [m.source.kind === 'item-fixed-effect' && m.source.equipmentKey, m.source.kind === 'item-fixed-effect' && m.source.itemId, m.value]))
      .toEqual([['Ring#0', 'item_49120', 175], ['Necklace#0', 'item_48082', 58]]);
  });

  it('6. database, manual and imported items resolve base fixed effects with exact source identity', () => {
    const result = aggregate(cowUnarmed());
    const fixed = bySource(result, 'item-fixed-effect');
    const items = new Set(fixed.map(m => m.source.kind === 'item-fixed-effect' ? `${m.source.itemKind}:${m.source.itemId}` : ''));
    expect([...items]).toEqual(['imported:item_45640', 'database:item_44411', 'manual:item_40358', 'database:item_49120']);
    const imported = fixed.find(m => m.source.kind === 'item-fixed-effect' && m.source.itemKind === 'imported' && m.source.effectIndex === 2)!;
    expect(imported).toMatchObject({ attributeId: 'BOOST_DARKNESS_DIRECT', category: 'damage-type-direct-flat', value: 146,
      source: { slot: 'MainHand', effectIndex: 2, effectRecordId: 'item_45640.EffectDescs[2]', itemResolved: true } });
    expect(result.warnings.find(w => w.code === 'instance-without-base-item')?.equipment).toMatchObject({ slot: 'Legs', itemKind: 'manual', itemId: null });
  });

  it('7. imported existing powers aggregate with their exact original tiers', () => {
    const existing = bySource(aggregate(cowUnarmed()), 'existing-power');
    expect(existing.map(m => m.source.kind === 'existing-power' && [m.source.itemKind, m.source.powerId, m.source.tierId, m.source.origin, m.value]))
      .toEqual([
        ['imported', 'power_20006', 'id_9', 'existing', tierValue('power_20006', 'id_9')],
        ['imported', 'power_3001', 'id_9', 'existing', tierValue('power_3001', 'id_9')],
        // T0013-F1 grammar: "Unarmed attacks deal +5 damage and have +N Accuracy" → BOOST_SKILL_UNARMED; accuracy stays unsupported.
        ['imported', 'power_3007', 'id_9', 'existing', 5],
        ['manual', 'power_3024', 'id_9', 'existing', tierValue('power_3024', 'id_9')],
      ]);
    expect(existing[0]).toMatchObject({ category: 'ability-damage-flat', scope: { kind: 'ability-attribute-hook', attributeId: 'BOOST_ABILITY_COWFRONTKICK' } });
  });

  it('8. editing an imported power tier updates only that contribution', () => {
    const before = cowUnarmed();
    const after = structuredClone(before);
    after.equipment[0] = editExistingMods(importedSelection(before), { type: 'existing-mod-tier', equipmentIndex: 0, index: 0, tierId: 'id_8' }, data);
    const a = projected(aggregate(before)); const b = projected(aggregate(after));
    const oldKey = 'equipment:MainHand#0/existing:power_20006:id_9#0/effect:0';
    const newKey = 'equipment:MainHand#0/existing:power_20006:id_8#0/effect:0';
    expect(b.has(oldKey)).toBe(false);
    expect(b.get(newKey)).toMatchObject({ value: tierValue('power_20006', 'id_8'), source: { tierId: 'id_8' } });
    expect(tierValue('power_20006', 'id_8')).not.toBe(tierValue('power_20006', 'id_9'));
    a.delete(oldKey); b.delete(newKey);
    expect(b).toEqual(a);
  });

  it('9. removing an imported existing power removes only its contribution', () => {
    const before = cowUnarmed();
    const after = structuredClone(before);
    after.equipment[0] = editExistingMods(importedSelection(before), { type: 'existing-mod-remove', equipmentIndex: 0, index: 1 }, data);
    const a = projected(aggregate(before)); const b = projected(aggregate(after));
    const removed = 'equipment:MainHand#0/existing:power_3001:id_9#0/effect:0';
    expect(a.has(removed)).toBe(true); expect(b.has(removed)).toBe(false);
    // The separately planned copy of the same power remains.
    expect(b.has('equipment:MainHand#0/candidate:power_3001:id_9#0/effect:0')).toBe(true);
    a.delete(removed);
    expect(b).toEqual(a);
  });

  it('10. historical source metadata never adds active or duplicate contributions', () => {
    const result = aggregate(cowUnarmed());
    const text = JSON.stringify([result.modifiers, result.unsupported, result.warnings]);
    // power_4001 / tier 5 / FixtureUnknownPower / imbue only exist in metadata.sourceItem or originalWorkingPowers.
    expect(text).not.toContain('power_4001');
    expect(text).not.toContain('FixtureUnknownPower');
    expect(text).not.toContain('power_129');
    const mainHand = (r: ModifierAggregationResult) => [...r.modifiers, ...r.unsupported].filter(x => x.source.kind === 'existing-power' && x.source.equipmentKey === 'MainHand#0');
    // One record per working existing power (2 mapped + 4 prose), plus power_3007's grammar modifier and its accuracy remainder.
    expect(mainHand(result)).toHaveLength(7);
    const cleared = cowUnarmed();
    const item = cleared.equipment[0]!.item;
    if (item.kind !== 'imported') throw new Error('Expected imported fixture');
    item.instance.existingPowers = [];
    expect(mainHand(aggregate(cleared))).toEqual([]);
  });

  it('11. staged candidates remain distinct from effective existing powers with the same identity', () => {
    const unarmed = aggregate(cowUnarmed()).modifiers.filter(m => m.attributeId === 'MOD_SKILL_UNARMED');
    expect(unarmed.map(m => [m.source.kind, m.source.kind !== 'skill-advancement' && 'origin' in m.source ? m.source.origin : null, m.value]))
      .toEqual([['existing-power', 'existing', 0.45], ['candidate-mod', 'planned', 0.45]]);
    expect(new Set(unarmed.map(m => m.key)).size).toBe(2);
  });

  it('12. unresolved powers, tiers, items and unsupported descriptions are preserved as warnings/records', () => {
    const result = aggregate(cowUnarmed());
    expect(result.warnings.map(w => [w.code, w.powerId ?? null, w.tierId ?? null])).toEqual([
      ['spark-result-missing', null, null], // T0015: simulated input saved without a result contributes nothing
      ['candidate-tier-unselected', 'power_20203', null],
      ['unknown-power', 'power_99999999', 'id_1'],
      ['instance-without-base-item', null, null],
      ['unknown-tier', 'power_20203', 'id_999'],
    ]);
    const reasons = new Set(result.unsupported.map(u => u.reason));
    expect(reasons).toEqual(new Set(['progression-rewards-not-modifiers', 'unmapped-attribute', 'prose-effect']));
    expect(result.modifiers.find(u => u.attributeId === 'BOOST_ABILITY_COREATTACK')?.source).toMatchObject({ kind: 'item-fixed-effect', slot: 'MainHand' });
    const unknownItem = createDefaultBuildDocument({ gameDataVersion: 'v1' });
    unknownItem.equipment = [{ slot: 'Ring', item: { kind: 'database', itemId: 'item_0' }, candidateMods: [], sparks: { mode: 'none' } }];
    expect(aggregate(unknownItem).warnings.map(w => w.code)).toEqual(['game-data-version-mismatch', 'unknown-item']);
  });

  it('evaluates published required-active-skill conditions without dropping the modifier', () => {
    const met = aggregate(cowUnarmed()).modifiers.find(m => m.key.includes('power_20002'))!;
    expect(met).toMatchObject({ applicability: 'conditions-met', conditions: [{ kind: 'requires-active-skill', skillId: 'Cow', status: 'met' }] });
    const build = cowUnarmed(); build.skillSlotA = { skillId: 'Psychology', level: 100 };
    const notMet = aggregate(build).modifiers.find(m => m.key.includes('power_20002'))!;
    expect(notMet).toMatchObject({ applicability: 'conditions-not-met', value: met.value, conditions: [{ status: 'not-met' }] });
  });

  it('13. removing one equipped item changes only that item\'s contributions', () => {
    const before = cowUnarmed();
    const after = structuredClone(before); after.equipment.splice(3, 1); // Ring
    const a = projected(aggregate(before)); const b = projected(aggregate(after));
    const ringKeys = [...a.keys()].filter(key => key.startsWith('equipment:Ring#0/'));
    expect(ringKeys.length).toBeGreaterThan(0);
    for (const key of ringKeys) a.delete(key);
    expect(b).toEqual(a);
    expect(aggregate(after).warnings.some(w => w.equipment?.slot === 'Ring')).toBe(false);
  });
});

describe('T0012 aggregation API properties', () => {
  it('14. repeated aggregation is identical and never mutates inputs', () => {
    for (const make of [psychology, cowUnarmed]) {
      const build = make(); const snapshot = structuredClone(build);
      deepFreeze(build);
      const first = aggregate(build); const second = aggregate(build);
      expect(second).toEqual(first);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(build).toEqual(snapshot);
      expect(formatAggregationReport(first, 'x')).toBe(formatAggregationReport(second, 'x'));
    }
  });

  it('15. empty and partial builds behave safely', () => {
    const empty = aggregate(createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }));
    expect(empty).toMatchObject({ activeSkillIds: [], modifiers: [], unsupported: [], warnings: [],
      summary: { modifierCount: 0, unsupportedCount: 0, warningCount: 0, byCategory: {} } });
    const partial = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
    partial.skillSlotB = { skillId: 'Unarmed', level: 0 };
    partial.equipment = [{ slot: 'Ring', item: { kind: 'manual', instance: { baseItemId: 'item_49120', existingPowers: [] } }, candidateMods: [], sparks: { mode: 'none' } }];
    const result = aggregate(partial);
    expect(result.activeSkillIds).toEqual(['Unarmed']);
    expect(result.modifiers.map(m => m.key)).toEqual(['equipment:Ring#0/fixed:0']);
    expect([result.unsupported, result.warnings]).toEqual([[], []]);
  });

  it('summarizes counts consistently and orders records by source traversal', () => {
    const result = aggregate(cowUnarmed());
    expect(result.summary.modifierCount).toBe(result.modifiers.length);
    expect(Object.values(result.summary.byConfidence).reduce((a, b) => a + b, 0)).toBe(result.modifiers.length);
    expect(Object.values(result.summary.byCategory).reduce((a, b) => a + (b ?? 0), 0)).toBe(result.modifiers.length);
    const order = result.modifiers.map(m => m.source.kind === 'skill-advancement' ? -1 : m.source.equipmentIndex);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it('accepts an extended registry without changing aggregation code', () => {
    // T0013-F2 maps this attribute by default; replace that rule with a test-only one.
    const critical = createModifierRegistry([...DEFAULT_MODIFIER_RULES.filter(rule => rule.id !== 'critical-damage-percent'), {
      id: 'test-critical-damage', description: 'test-only', category: 'critical-damage-percent', operation: 'percent', unit: 'fraction',
      displayTypes: ['AsPercent'], confidence: 'unknown', assumptions: ['test fixture only'],
      match: attribute => attribute.id === 'MOD_CRITICAL_HIT_DAMAGE' ? { kind: 'general', delivery: 'direct' } : null,
    }]);
    const result = aggregateBuildModifiers(psychology(), data, { registry: critical });
    expect(result.modifiers.find(m => m.attributeId === 'MOD_CRITICAL_HIT_DAMAGE')).toMatchObject({
      category: 'critical-damage-percent', confidence: 'unknown', mappingRuleId: 'test-critical-damage',
      conditions: [{ kind: 'requires-active-skill', skillId: 'Psychology', status: 'met' }],
    });
    // A narrower registry turns advancement rewards into explicit unsupported totals, never silent drops.
    const narrow = createModifierRegistry(DEFAULT_MODIFIER_RULES.filter(rule => rule.category !== 'max-resource-flat'));
    const narrowed = aggregateBuildModifiers(psychology(), data, { registry: narrow });
    expect(bySource(narrowed, 'skill-advancement')).toEqual([]);
    expect(narrowed.unsupported.filter(u => u.source.kind === 'skill-advancement').map(u => u.attributeId)).toEqual(['MAX_HEALTH', 'MAX_POWER']);
  });
});

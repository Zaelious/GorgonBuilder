import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { classifyBuildWarnings, classifyUnsupportedEffect } from './warning-relevance';
import { DIRECT_TREASURE_DEFINITIONS } from './direct-treasure-rules';
import type { ModifierAggregationResult, UnsupportedEffect } from './modifiers';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
function fixture(powerIds: string[]) {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Archery', level: 0 };
  build.equipment = [{ slot: 'MainHand', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } },
    sparks: { mode: 'none' }, candidateMods: powerIds.map(powerId => ({ powerId, tierId: data.getTreasurePower(powerId)!.tiers[0]!.id })) }];
  return aggregateBuildModifiers(build, data);
}
function synthetic(description: string, attributeId?: string): UnsupportedEffect {
  return { key: 'fixture:effect', reason: attributeId ? 'unmapped-attribute' : 'prose-effect', attributeId, message: description,
    source: { kind: 'item-fixed-effect', equipmentIndex: 0, equipmentKey: 'Ring#0', slot: 'Ring', itemKind: 'database',
      itemId: 'fixture', itemResolved: true, effectIndex: 0, effectRecordId: 'fixture', description } };
}

it.each([
  ['power_10305', 'taunt'], ['power_10202', 'reuse'], ['power_3083', 'Rage'],
  ['power_4431', 'Power cost'], ['power_5154', 'stuns'], ['power_5121', 'Accuracy'], ['power_4471', 'Health'],
])('classifies the unsupported %s %s remainder as informational while its damage still calculates', (powerId) => {
  const aggregation = fixture([powerId]);
  const record = aggregation.unsupported.find(u => u.key.endsWith('/remainder'))!;
  const modeled = aggregation.modifiers.find(m => m.source.kind === 'candidate-mod' && m.source.powerId === powerId)!;
  const ability = data.abilities.find(a => modeled.scope.kind === 'ability-attribute-hook' &&
    a.pve.attributeHooks[modeled.scope.hook]?.includes(modeled.attributeId))!;
  const before = calculateAbilityDamage(ability.id, aggregation, data);
  const bytes = JSON.stringify({ aggregation, result: before });
  expect(classifyUnsupportedEffect(record, aggregation, data).kind).toBe('non-damage');
  const steps = before.components.flatMap(c => c.steps).filter(s => s.modifierKey === modeled.key);
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.some(step => step.contribution > 0)).toBe(true);
  expect(calculateAbilityDamage(ability.id, aggregation, data)).toEqual(before);
  expect(JSON.stringify({ aggregation, result: before })).toBe(bytes);
  // Neither a missing modeled part nor an unrelated sibling modifier proves that only the remainder is unsupported.
  expect(classifyUnsupportedEffect(record, { ...aggregation, modifiers: [] }, data).kind).toBe('unknown');
});

it('verifies every official tier of the audited mixed-power allow-list, including full sentence identity', () => {
  for (const definition of DIRECT_TREASURE_DEFINITIONS.filter(def => def.remainder)) {
    const power = data.getTreasurePower(definition.powerId)!;
    for (const tier of power.tiers) {
      const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
      build.equipment = [{ slot: 'MainHand', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [{ powerId: power.id, tierId: tier.id }] } }, candidateMods: [], sparks: { mode: 'none' } }];
      const aggregation = aggregateBuildModifiers(build, data);
      const records = aggregation.unsupported.filter(u => u.key.endsWith('/remainder'));
      expect(records.length, `${power.id}/${tier.id}`).toBeGreaterThan(0);
      for (const record of records) expect(classifyUnsupportedEffect(record, aggregation, data).kind, record.key).toBe('non-damage');
    }
  }
});

it('classifies reusable grammar remainders only when all clauses are confirmed non-damage', () => {
  // Official grammar-backed damage+stun and damage+Rage powers, outside the curated allow-list.
  for (const id of ['power_4401', 'power_14203']) {
    const aggregation = fixture([id]);
    const record = aggregation.unsupported.find(u => u.key.endsWith('/remainder'))!;
    expect(classifyUnsupportedEffect(record, aggregation, data).kind).toBe('non-damage');
  }
});

it('keeps actual unsupported damage and ambiguous effects warning, regardless of unknown ability association', () => {
  const aggregation = fixture([]);
  const examples = [
    ['Unknown Strike deals +12 damage and taunts +20', 'damage-affecting'],
    ['Generates -10 Rage', 'non-damage'], ['Restores 20 Power to you', 'non-damage'], ['Stuns the target', 'non-damage'],
    ['Stuns the target and causes mysterious damage', 'unknown'], ['Generates -10 Rage and your next attack deals double damage', 'unknown'],
    ['Unknown mechanism of inscrutable origin', 'unknown'], ['Has 5% critical hit chance', 'damage-affecting'],
  ] as const;
  for (const [text, kind] of examples) expect(classifyUnsupportedEffect(synthetic(text), aggregation, data).kind, text).toBe(kind);
  const official = fixture(['power_4002']); // Psychoanalyze's unmodeled conditional armor-damage mechanics
  expect(classifyBuildWarnings(official, data).nonDamage).toHaveLength(0);
  expect(classifyBuildWarnings(official, data).damage.length + classifyBuildWarnings(official, data).unknown.length).toBeGreaterThan(0);
});

it('uses official non-damage hooks and exact identities; unknown attributes, malformed/conditional sources stay visible', () => {
  const aggregation = fixture([]);
  for (const [id, expected] of [['ABILITY_RAGE_DELTA_INFURIATINGFIST', 'non-damage'], ['ABILITY_TAUNT_DELTA_MOCK', 'non-damage'],
    ['ABILITY_RESETTIME_DELTA_MOCK', 'non-damage'], ['MAX_RAGE', 'non-damage'], ['BOOST_ABILITY_MOCK', 'damage-affecting'], ['UNKNOWN_RAGE_DAMAGE', 'unknown']] as const) {
    const effect = synthetic(`{${id}}{10}`, id);
    expect(classifyUnsupportedEffect(effect, aggregation, data).kind, id).toBe(expected);
    expect(classifyUnsupportedEffect({ ...effect, reason: 'unknown-required-skill' }, aggregation, data).kind).toBe('unknown');
    expect(classifyUnsupportedEffect({ ...effect, reason: 'malformed-effect' }, aggregation, data).kind).toBe('unknown');
  }
});

it('keeps accurate per-record counts, provenance, calculation results and confidence for a mixed build', () => {
  const original = fixture(['power_10305', 'power_10202']);
  const ambiguous = synthetic('Unrecognized effect');
  const damage = synthetic('Unresolved Blast deals +40 damage');
  const ignored: UnsupportedEffect = { ...ambiguous, key: 'progression', reason: 'progression-rewards-not-modifiers' };
  const aggregation: ModifierAggregationResult = { ...original, unsupported: [...original.unsupported, ambiguous, damage, ignored] };
  const before = calculateAbilityDamage('ability_6553', aggregation, data);
  const result = classifyBuildWarnings(aggregation, data);
  expect([result.nonDamage.length, result.damage.length, result.unknown.length]).toEqual([2, 1, 1]);
  expect(result.nonDamage[0]!.effect).toBe(original.unsupported[0]);
  expect(result.damage[0]!.effect).toBe(damage);
  expect(result.unknown[0]!.effect).toBe(ambiguous);
  expect(calculateAbilityDamage('ability_6553', aggregation, data)).toEqual(before);
});

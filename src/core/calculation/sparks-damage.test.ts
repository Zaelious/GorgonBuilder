// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type BuildDocument, type EquipmentSelection, type SparkConfiguration, type SparkOutcomeCounts } from '../build/document';
import { editSparks } from '../build/sparks';
import { SKILL_DAMAGE_SPARK_MODEL_VERSION, zeroSparkOutcomeCounts } from '../sparks';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { calculateCriticalHit } from './critical-damage';
import { resolveCriticalSkillLevel } from './critical-skills';
import { psychologyFixture } from './fixtures';
import type { ModifierAggregationResult } from './modifiers';
import { applyTargetDummy } from './target-damage';
import { formatAggregationReport } from './report';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

const MOCK = 'ability_6553';        // Psychology Mock 11: HealthSpecificDamage 178
const AIMED_SHOT = 'ability_2535';  // Archery Aimed Shot 5: Damage 231
const MANUAL: SparkOutcomeCounts = { allDirectDamagePercent: 11, skillDamageFlat: 44, allDirectDamageFlat: 11, skillDamagePercent: 26, skillBaseDamagePercent: 18 };
const actual = (outcomeCounts: SparkOutcomeCounts, skillId = 'Psychology'): SparkConfiguration => ({ mode: 'actual', category: 'skill-damage', skillId, outcomeCounts });
const manualItem = (slot: string, sparks: SparkConfiguration = { mode: 'none' }): EquipmentSelection =>
  ({ slot, item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [], sparks });

function build(equipment: EquipmentSelection[], skillB: string | null = 'Archery'): BuildDocument {
  const doc = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  return { ...doc, skillSlotA: { skillId: 'Psychology', level: 0 }, skillSlotB: { skillId: skillB, level: 0 }, equipment };
}
const sparkModifiers = (result: ModifierAggregationResult) => result.modifiers.filter(m => m.source.kind === 'spark');
const damage = (abilityId: string, doc: BuildDocument) => calculateAbilityDamage(abilityId, aggregateBuildModifiers(doc, data), data);
const hit = (abilityId: string, doc: BuildDocument) => damage(abilityId, doc).components.find(c => c.delivery === 'direct' && c.baseStatus === 'present')!;

describe('T0015 Spark modifier aggregation', () => {
  it('no Sparks (and zero Sparks) produce no modifiers, warnings or unsupported records', () => {
    const none = aggregateBuildModifiers(build([manualItem('Ring')]), data);
    const zero = aggregateBuildModifiers(build([manualItem('Ring', actual(zeroSparkOutcomeCounts()))]), data);
    const zeroSimulated = editSparks(manualItem('Ring'), { mode: 'simulated', skillId: 'Psychology', count: 0, seed: 'zero' }, data);
    const sim = aggregateBuildModifiers(build([zeroSimulated]), data);
    for (const result of [none, zero, sim]) {
      expect(sparkModifiers(result)).toEqual([]);
      expect(result.modifiers).toEqual(none.modifiers);
      expect(result.warnings).toEqual(none.warnings);
      expect(result.unsupported).toEqual(none.unsupported);
      expect(result.summary.bySourceKind.spark).toBe(0);
    }
  });

  it('maps all five outcomes to the established categories, official attributes, units and scopes with Spark provenance', () => {
    const result = aggregateBuildModifiers(build([{ ...manualItem('Ring', actual(MANUAL)), item: { kind: 'database', itemId: 'item_49120' } }]), data);
    const sparks = sparkModifiers(result);
    expect(sparks.map(m => [m.key, m.category, m.attributeId, m.operation, m.unit, m.value, m.sourceValue])).toEqual([
      ['equipment:Ring#0/sparks:allDirectDamagePercent', 'all-direct-damage-percent', 'MOD_UNIVERSAL_DIRECT', 'percent', 'fraction', 0.055, '0.055'],
      ['equipment:Ring#0/sparks:skillDamageFlat', 'skill-damage-flat', 'BOOST_SKILL_PSYCHOLOGY', 'flat', 'points', 44, '44'],
      ['equipment:Ring#0/sparks:allDirectDamageFlat', 'all-direct-damage-flat', 'BOOST_UNIVERSAL_DIRECT', 'flat', 'points', 11, '11'],
      ['equipment:Ring#0/sparks:skillDamagePercent', 'skill-damage-percent', 'MOD_SKILL_ALL_PSYCHOLOGY', 'percent', 'fraction', 0.26, '0.26'],
      ['equipment:Ring#0/sparks:skillBaseDamagePercent', 'skill-base-damage-percent', 'MOD_SKILL_PSYCHOLOGY', 'percent', 'fraction', 0.54, '0.54'],
    ]);
    expect(sparks.map(m => m.scope)).toEqual([
      { kind: 'general', delivery: 'direct' }, { kind: 'skill', skillId: 'Psychology' }, { kind: 'general', delivery: 'direct' },
      { kind: 'skill', skillId: 'Psychology' }, { kind: 'skill', skillId: 'Psychology' },
    ]);
    for (const m of sparks) {
      expect(m.source).toMatchObject({ kind: 'spark', slot: 'Ring', equipmentKey: 'Ring#0', equipmentIndex: 0, itemKind: 'database', itemId: 'item_49120',
        itemResolved: true, mode: 'actual', sparkCategory: 'skill-damage', skillId: 'Psychology', totalSparks: 110, modelVersion: SKILL_DAMAGE_SPARK_MODEL_VERSION });
      expect(m.conditions).toEqual([{ kind: 'requires-active-skill', skillId: 'Psychology', status: 'met' }]);
      expect(m.applicability).toBe('conditions-met');
      expect(m.confidence).toBe('assumed');
      expect(m.mappingRuleId).toMatch(/^skill-damage-sparks-v1:/u);
    }
    expect(sparks.map(m => m.source.kind === 'spark' && m.source.outcomeCount)).toEqual([11, 44, 11, 26, 18]);
    expect(result.summary.bySourceKind.spark).toBe(5);
    // Spark records follow the item's own fixed effect, and the aggregation report names their provenance.
    expect(result.modifiers.findIndex(m => m.source.kind === 'spark')).toBeGreaterThan(result.modifiers.findIndex(m => m.source.kind === 'item-fixed-effect'));
    expect(formatAggregationReport(result, 'Sparks')).toContain('Ring#0 database item_49120 sparks actual Psychology skillBaseDamagePercent ×18/110');
  });

  it('records the simulated seed and omits zero-count outcomes', () => {
    const ring = editSparks(manualItem('Ring'), { mode: 'simulated', skillId: 'Psychology', count: 110, seed: 'seeded' }, data);
    const sparks = sparkModifiers(aggregateBuildModifiers(build([ring]), data));
    expect(sparks.length).toBeGreaterThan(0);
    expect(sparks.every(m => m.source.kind === 'spark' && m.source.mode === 'simulated' && m.source.seed === 'seeded')).toBe(true);
    const one = aggregateBuildModifiers(build([manualItem('Ring', actual({ ...zeroSparkOutcomeCounts(), skillBaseDamagePercent: 1 }))]), data);
    expect(sparkModifiers(one).map(m => [m.category, m.value])).toEqual([['skill-base-damage-percent', 0.03]]);
  });

  it('aggregates the four offensive slots independently without double counting; removal drops only that item\'s records', () => {
    const slots = ['MainHand', 'OffHand', 'Ring', 'Necklace'];
    const doc = build(slots.map((slot, i) => manualItem(slot, actual({ ...zeroSparkOutcomeCounts(), skillDamageFlat: i + 1, allDirectDamageFlat: 1 }))));
    const result = aggregateBuildModifiers(doc, data);
    const sparks = sparkModifiers(result);
    expect(sparks).toHaveLength(8);
    expect(new Set(sparks.map(m => m.key)).size).toBe(8);
    expect(sparks.filter(m => m.category === 'skill-damage-flat').map(m => [m.source.kind === 'spark' && m.source.slot, m.value]))
      .toEqual([['MainHand', 1], ['OffHand', 2], ['Ring', 3], ['Necklace', 4]]);
    const base = hit(AIMED_SHOT, build([]));
    const withSparks = hit(AIMED_SHOT, doc);
    // Each All Direct flat is applied once per item (4 × +1); Psychology flats never reach Archery.
    expect(withSparks.provisionalDamage! - base.provisionalDamage!).toBe(4);
    expect(withSparks.decisions.filter(d => d.status === 'applied' && d.modifier.source.kind === 'spark')).toHaveLength(4);
    const removed = { ...doc, equipment: doc.equipment.filter((_, i) => i !== 2) };
    const keys = sparkModifiers(aggregateBuildModifiers(removed, data)).map(m => m.key);
    expect(keys).toEqual(sparks.map(m => m.key).filter(key => !key.startsWith('equipment:Ring#0/')));
  });

  it('keeps an inactive configured skill\'s Sparks unapplied (never remapped) and reports invalid/pending/unsupported configurations', () => {
    const inactive = aggregateBuildModifiers(build([manualItem('Ring', actual(MANUAL, 'Cow'))]), data);
    const cow = sparkModifiers(inactive);
    expect(cow.every(m => m.applicability === 'conditions-not-met' && m.conditions[0]?.kind === 'requires-active-skill' && m.conditions[0].skillId === 'Cow')).toBe(true);
    expect(cow.filter(m => m.scope.kind === 'skill').every(m => m.scope.kind === 'skill' && m.scope.skillId === 'Cow')).toBe(true);
    expect(hit(MOCK, build([manualItem('Ring', actual(MANUAL, 'Cow'))])).provisionalDamage).toBe(178);
    expect(inactive.warnings).toEqual([expect.objectContaining({ code: 'instance-without-base-item' })]);

    const warnings = (sparks: SparkConfiguration, slot = 'Ring') => aggregateBuildModifiers(build([manualItem(slot, sparks)]), data).warnings
      .filter(w => w.code.startsWith('spark-')).map(w => w.code);
    expect(warnings({ mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 5, seed: 'x' } })).toEqual(['spark-result-missing']);
    expect(warnings({ mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 5, seed: 'x' },
      result: { modelVersion: 'future-v9', outcomeCounts: { ...zeroSparkOutcomeCounts(), skillDamageFlat: 5 } } })).toEqual(['spark-configuration-invalid']);
    expect(warnings(actual({ ...MANUAL, skillDamageFlat: 45 }))).toEqual(['spark-configuration-invalid']);
    expect(warnings(actual(MANUAL, 'Cooking'))).toEqual(['spark-configuration-invalid']);
    expect(warnings(actual(MANUAL), 'Head')).toEqual(['spark-slot-unsupported']);
    const conflict = aggregateBuildModifiers(build([manualItem('OffHand', actual(MANUAL)), manualItem('OffHandShield', actual(MANUAL)), manualItem('Ring', actual(MANUAL))]), data);
    expect(conflict.warnings.filter(w => w.code === 'spark-offhand-conflict').map(w => w.equipment?.slot)).toEqual(['OffHand', 'OffHandShield']);
    expect(sparkModifiers(conflict).every(m => m.source.kind === 'spark' && m.source.slot === 'Ring')).toBe(true);
  });

  it('reports skills without a matching official attribute as unsupported instead of inventing a mapping', () => {
    const doc = build([manualItem('Ring', actual(MANUAL, 'Hammer'))], 'Hammer');
    const result = aggregateBuildModifiers(doc, data);
    expect(sparkModifiers(result).map(m => m.attributeId)).toEqual(['MOD_UNIVERSAL_DIRECT', 'BOOST_SKILL_HAMMER', 'BOOST_UNIVERSAL_DIRECT', 'MOD_SKILL_HAMMER']);
    expect(result.unsupported.filter(u => u.source.kind === 'spark').map(u => [u.attributeId, u.reason]))
      .toEqual([['MOD_SKILL_ALL_HAMMER', 'unknown-attribute']]);
  });
});

describe('T0015 Spark damage integration', () => {
  it('0 vs 110 manual Sparks: exact, explainable Mock delta with Skill Base on the original base only', () => {
    const before = hit(MOCK, build([manualItem('Ring')]));
    const after = hit(MOCK, build([manualItem('Ring', actual(MANUAL))]));
    expect(before.originalBase).toBe(178);
    expect(before.provisionalDamage).toBe(178);
    // flats 178 + 44 + 11 = 233; percents 233 × (0.26 + 0.055) = 73.395; Skill Base 178 × 0.54 = 96.12.
    expect(after.provisionalDamage).toBeCloseTo(402.515, 9);
    const steps = after.steps.map(s => [s.category, s.basis, s.operand, s.contribution]);
    expect(steps).toEqual([
      ['original-base', 178, 1, 178],
      ['skill-damage-flat', 1, 44, 44],
      ['all-direct-damage-flat', 1, 11, 11],
      ['skill-damage-percent', 233, 0.26, 233 * 0.26],
      ['all-direct-damage-percent', 233, 0.055, 233 * 0.055],
      ['skill-base-damage-percent', 178, 0.54, 178 * 0.54],
    ]);
    const skillBase = after.steps.find(s => s.category === 'skill-base-damage-percent')!;
    expect(skillBase.basis).toBe(after.originalBase);
    expect(skillBase.contribution).toBeCloseTo(96.12, 9);
    // Every applied Spark step identifies its equipment source.
    expect(after.decisions.filter(d => d.status === 'applied').map(d => d.modifier.source.kind === 'spark' && d.modifier.source.slot)).toEqual(Array(5).fill('Ring'));
    expect(damage(MOCK, build([manualItem('Ring', actual(MANUAL))])).confidence).not.toBe('validated');
  });

  it('a second combat skill receives All Direct outcomes but never the first skill\'s skill-scoped outcomes', () => {
    const before = hit(AIMED_SHOT, build([manualItem('Ring')]));
    const after = hit(AIMED_SHOT, build([manualItem('Ring', actual(MANUAL))]));
    const applied = after.decisions.filter(d => d.modifier.source.kind === 'spark');
    expect(applied.map(d => [d.modifier.category, d.status, d.reason])).toEqual([
      ['all-direct-damage-percent', 'applied', 'supported'],
      ['skill-damage-flat', 'excluded', 'skill-mismatch'],
      ['all-direct-damage-flat', 'applied', 'supported'],
      ['skill-damage-percent', 'excluded', 'skill-mismatch'],
      ['skill-base-damage-percent', 'excluded', 'skill-mismatch'],
    ]);
    // (231 + 11) × (1 + 0.055)
    expect(before.provisionalDamage).toBe(231);
    expect(after.provisionalDamage).toBeCloseTo(242 * 1.055, 9);
  });

  it('removing or rerolling Sparks reverses or replaces contributions exactly', () => {
    const plain = build([manualItem('Ring')]);
    const configured = { ...plain, equipment: [editSparks(plain.equipment[0]!, { mode: 'simulated', skillId: 'Psychology', count: 110, seed: 'first' }, data)] };
    const rerolled = { ...plain, equipment: [editSparks(configured.equipment[0]!, { mode: 'simulated', skillId: 'Psychology', count: 110, seed: 'second' }, data)] };
    const cleared = { ...plain, equipment: [editSparks(rerolled.equipment[0]!, { mode: 'none' }, data)] };
    const baseline = damage(MOCK, plain);
    expect(damage(MOCK, configured).provisionalDamage).not.toBe(baseline.provisionalDamage);
    expect(damage(MOCK, rerolled).provisionalDamage).not.toBe(damage(MOCK, configured).provisionalDamage);
    const restored = damage(MOCK, cleared);
    expect(restored.provisionalDamage).toBe(baseline.provisionalDamage);
    expect(restored.components).toEqual(baseline.components);
    const removed = damage(MOCK, { ...configured, equipment: [] });
    expect(removed.components.map(c => c.provisionalDamage)).toEqual(damage(MOCK, { ...plain, equipment: [] }).components.map(c => c.provisionalDamage));
  });

  it('target and critical stages change only through the ordinary hit', () => {
    const doc = build([manualItem('Ring', actual(MANUAL))]);
    doc.target = { count: 1, damageTypes: { Psychic: { vulnerability: 10 } } };
    const plain = { ...doc, equipment: [manualItem('Ring')] };
    const stages = (d: BuildDocument) => {
      const result = damage(MOCK, d);
      const target = applyTargetDummy(result, d.target);
      const critical = calculateCriticalHit(result, target, { creatureType: 'Anatomy_Humans',
        skillLevel: skillId => resolveCriticalSkillLevel(skillId, { manualLevels: { Phrenology_Humans: 30 } }, data) }, data);
      return { result, target, critical };
    };
    const a = stages(plain), b = stages(doc);
    expect(a.target.hits[0]!.perTarget! / a.result.provisionalDamage!).toBeCloseTo(1.1, 12);
    expect(b.target.hits[0]!.perTarget! / b.result.provisionalDamage!).toBeCloseTo(1.1, 12);
    expect(b.critical.multiplier.value).toBe(a.critical.multiplier.value);
    expect(b.critical.chance.value).toBe(a.critical.chance.value);
    expect(b.critical.hits[0]!.critical).toBeCloseTo(b.target.hits[0]!.perTarget! * b.critical.multiplier.value!, 9);
  });

  it('existing Psychology gear and Sparks combine in the same categories without changing the established fixture', () => {
    const fixture = psychologyFixture(data.gameDataVersion);
    const withSparks = structuredClone(fixture);
    withSparks.equipment[1] = { ...withSparks.equipment[1]!, sparks: actual(MANUAL) };
    const a = aggregateBuildModifiers(fixture, data), b = aggregateBuildModifiers(withSparks, data);
    expect(b.modifiers.filter(m => m.source.kind !== 'spark')).toEqual(a.modifiers);
    const base = b.modifiers.filter(m => m.category === 'skill-base-damage-percent' && m.attributeId === 'MOD_SKILL_PSYCHOLOGY');
    expect(base.map(m => [m.source.kind, m.value])).toEqual([['item-fixed-effect', 0.2], ['candidate-mod', 0.45], ['spark', 0.54]]);
  });
});

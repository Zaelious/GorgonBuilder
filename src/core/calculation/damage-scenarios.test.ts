// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type BuildDocument, type EquipmentSelection, type TargetConfiguration } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { applyTargetDummy } from './target-damage';
import { calculateCriticalHit } from './critical-damage';
import { resolveCriticalSkillLevel } from './critical-skills';
import { calculateDamageProcs, calculateStampedeScenario, expectedProcHit } from './damage-scenarios';
import { SCENARIO_TREASURE_RULES } from './scenario-treasure-rules';
import { interpretTreasureEffect } from './treasure-effect-rules';
import type { AbilityDamageResult } from './ability-damage-types';
import type { NormalizedModifier } from './modifiers';

const data = loadPlannerFixture();
const STAMPEDE = 'ability_6138'; // 208 Crushing, CowStomp12 (published CowStampede keyword + exact hook)
const STRIKE = 'ability_1298'; // 430 Psychic
const target: TargetConfiguration = { count: 1, damageTypes: {} };
function mod(powerId: string, tierId = 'id_25', slot = 'Chest', existing = false): EquipmentSelection {
  return { slot, item: { kind: 'manual', instance: { baseItemId: null, existingPowers: existing ? [{ powerId, tierId }] : [],
    metadata: { sourceItem: { TSysPowers: [{ Power: powerId, Tier: 1 }] } } } },
  candidateMods: existing ? [] : [{ powerId, tierId }], sparks: { mode: 'none' } };
}
function build(skillId: string, ...equipment: EquipmentSelection[]): BuildDocument {
  const b = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  b.skillSlotA = { skillId, level: 0 }; b.equipment = equipment; return b;
}
function damage(b: BuildDocument, abilityId = STAMPEDE) { return calculateAbilityDamage(abilityId, aggregateBuildModifiers(b, data), data); }
const stack = (b: BuildDocument, stacks: number, abilityId = STAMPEDE, config = target) => calculateStampedeScenario(damage(b, abilityId), config, stacks, data);
function procs(b: BuildDocument, abilityId = STRIKE, config = target) {
  const result = damage(b, abilityId);
  return { result, proc: calculateDamageProcs(result, applyTargetDummy(result, config), config, data) };
}

describe('exact v490 scenario treasure coverage (separate from historical snapshots)', () => {
  it.each(SCENARIO_TREASURE_RULES)('$powerId: matches all 25 exact selected tiers, identity and full wording', rule => {
    const power = data.getTreasurePower(rule.powerId)!;
    expect(power.internalName).toBe(rule.internalName);
    expect(power.tiers).toHaveLength(25);
    for (const tier of power.tiers) {
      const text = tier.effectDescriptions[0]!;
      const interpreted = interpretTreasureEffect(power.id, text, data);
      expect(interpreted?.kind, `${power.id}/${tier.id}`).toBe('drafts');
      expect(interpretTreasureEffect(power.id, `${text} if target is stunned`, data)?.kind).toBe('template-mismatch');
      const wrongIdentity = { ...data, getTreasurePower: (id: string) => id === power.id ? { ...power, internalName: 'WrongIdentity' } : data.getTreasurePower(id) };
      const wrong = interpretTreasureEffect(power.id, text, wrongIdentity);
      expect(wrong?.kind === 'drafts' && wrong.drafts.some(d => d.proc || d.category === 'stampede-damage-per-stack')).toBe(false);
    }
  });
});

describe('Stampede current stacks', () => {
  it.each([0, 1, 15])('uses one selected +50 source at %i stacks, keeping the ordinary attack unchanged', stacks => {
    const b = build('Cow', mod('power_20004', 'id_20'));
    const ordinary = damage(b);
    const before = JSON.stringify(ordinary);
    const result = calculateStampedeScenario(ordinary, target, stacks, data)!;
    expect(result.status).toBe('estimated');
    expect(result.baseline.hits[0]!.perTarget).toBe(208);
    expect(result.flatBonus).toBe(50 * stacks);
    expect(result.projected!.hits[0]!.perTarget).toBe(208 + 50 * stacks);
    expect(result.contributions[0]!.modifier.source).toMatchObject({ powerId: 'power_20004', tierId: 'id_20' });
    expect(JSON.stringify(ordinary)).toBe(before);
    if (stacks === 0) expect(result.projectedDamage).toBe(ordinary);
  });

  it('sums two different working tiers, replaces tiers, removes mods/items and ignores historical metadata', () => {
    const b = build('Cow', mod('power_20004', 'id_20'), mod('power_20004', 'id_25', 'Hands', true));
    let result = stack(b, 15)!;
    expect(result.contributions.map(c => [c.perStack, c.flatBonus])).toEqual([[50, 750], [65, 975]]);
    expect(result.flatBonus).toBe(1725);
    expect(result.projected!.hits[0]!.perTarget).toBe(1933);
    b.equipment[0]!.candidateMods[0]!.tierId = 'id_1';
    result = stack(b, 15)!;
    expect(result.flatBonus).toBe((4 + 65) * 15);
    b.equipment[0]!.candidateMods = [];
    expect(stack(b, 15)!.flatBonus).toBe(975);
    b.equipment = [b.equipment[0]!];
    expect(stack(b, 15)).toBeNull();
    expect(damage(b).provisionalDamage).toBe(208);
  });

  it('never applies to another Cow ability or an unrelated skill', () => {
    const b = build('Cow', mod('power_20004'));
    for (const id of ['ability_6124', STRIKE, 'ability_8169']) {
      expect(stack(b, 15, id)).toBeNull();
      const other = build('Cow');
      expect(damage(b, id).provisionalDamage).toBe(damage(other, id).provisionalDamage);
    }
  });

  it('reuses non-base percentages and targets but keeps Skill Base on the original base', () => {
    const b = build('Cow', mod('power_20004', 'id_20'));
    const original = damage(b);
    const source = original.aggregation.modifiers[0]!;
    const synthetic: NormalizedModifier[] = [
      { ...source, key: 'synthetic-percent', category: 'ability-damage-percent', operation: 'percent', unit: 'fraction',
        attributeId: 'MOD_ABILITY_STAMPEDE', value: 0.5,
        scope: { kind: 'ability-attribute-hook', skillId: 'Cow', attributeId: 'MOD_ABILITY_STAMPEDE', hook: 'AttributesThatModDamage' } },
      { ...source, key: 'synthetic-base', category: 'skill-base-damage-percent', operation: 'percent', unit: 'fraction',
        attributeId: 'MOD_SKILL_COW', value: 0.5, scope: { kind: 'skill', skillId: 'Cow' } },
    ];
    const aggregation = { ...original.aggregation, modifiers: [...original.aggregation.modifiers, ...synthetic] };
    const ordinary = calculateAbilityDamage(STAMPEDE, aggregation, data);
    const config = { count: 5, damageTypes: { Crushing: { vulnerability: 20, resistance: 0 } } };
    const result = calculateStampedeScenario(ordinary, config, 1, data)!;
    expect(result.projected!.hits[0]!.perTarget).toBeCloseTo(((208 + 50) * 1.5 + 208 * 0.5) * 1.2);
    expect(result.projectedDamage!.components[0]!.steps.find(s => s.operation === 'add-skill-base-contribution')!.basis).toBe(208);
    expect(result.projected!.affectedTargets).toBe(1); // no invented Stampede AoE
    expect(result.projected!.hits[0]!.total).toBe(result.projected!.hits[0]!.perTarget);
  });

  it.each([-1, 16, 1.5, NaN, Infinity])('rejects invalid current stacks %s', stacks => {
    const result = stack(build('Cow', mod('power_20004')), stacks)!;
    expect(result.status).toBe('unavailable'); expect(result.projected).toBeNull(); expect(result.flatBonus).toBeNull();
  });
});

describe('chance-based direct damage (not criticals or DPS)', () => {
  it('applies Strike a Nerve +100 exactly once, then exposes 33%, ×2 and expected damage', () => {
    const b = build('Psychology', mod('power_4062'));
    const { result, proc } = procs(b);
    expect(result.provisionalDamage).toBe(530);
    expect(result.components[0]!.steps.filter(s => s.operation === 'add-flat').map(s => s.contribution)).toEqual([100]);
    expect(proc!.probability).toBe(0.33);
    expect(proc!.hits[0]).toMatchObject({ normal: 530, triggered: 1060, expected: 704.9 });
    expect(proc!.status).toBe('estimated');
    b.equipment = [];
    expect(procs(b).result.provisionalDamage).toBe(430); expect(procs(b).proc).toBeNull();
  });

  it.each([[0, 1000], [0.15, 1150], [0.33, 1330], [0.5, 1500], [1, 2000]])('synthetic probability %s yields %s per successful hit', (p, expected) => {
    expect(expectedProcHit(1000, 2000, p)).toBeCloseTo(expected);
  });

  it('preserves zero-probability and unavailable/invalid inputs without clamping', () => {
    expect(expectedProcHit(1000, null, 0)).toBe(1000);
    expect(expectedProcHit(1000, null, 0.33)).toBeNull();
    for (const p of [-0.1, 1.1, NaN, Infinity]) expect(expectedProcHit(1000, 2000, p)).toBeNull();
    expect(expectedProcHit(null, 2000, 1)).toBeNull();
    expect(expectedProcHit(1000, Infinity, 1)).toBeNull();
  });

  it.each([0, 0.33, 1])('evaluates a synthetic 1000 ordinary hit at probability %s through the proc stage', p => {
    const original = damage(build('Psychology', mod('power_4062')), STRIKE);
    const result = { ...original, aggregation: { ...original.aggregation,
      modifiers: original.aggregation.modifiers.map(m => m.proc ? { ...m, proc: { ...m.proc, probability: p } } : m) } };
    const dummy = applyTargetDummy(result, target);
    const synthetic = { ...dummy, hits: dummy.hits.map(hit => ({ ...hit, perTarget: 1000, total: 1000 })) };
    const proc = calculateDamageProcs(result, synthetic, target, data)!;
    expect(proc.hits[0]!.triggered).toBe(2000); expect(proc.hits[0]!.expected).toBeCloseTo(1000 * (1 + p));
  });

  it('preserves true Burst per-target and total-target results without summing components', () => {
    const original = damage(build('Psychology', mod('power_4062')), STRIKE);
    const ability = { ...original.ability!, targeting: { ...original.ability!.targeting, aoe: 20 }, keywords: [...original.ability!.keywords!, 'Burst'] };
    const burstData = { ...data, getAbility: (id: string) => id === ability.id ? ability : data.getAbility(id) };
    const result = calculateAbilityDamage(STRIKE, original.aggregation, burstData);
    const config = { count: 6, damageTypes: { Psychic: { vulnerability: 20, resistance: 0 } } };
    const dummy = applyTargetDummy(result, config);
    const proc = calculateDamageProcs(result, dummy, config, burstData)!;
    const ordinary = 530 * 0.8125 * 1.2;
    expect(proc.hits[0]!.normal).toBeCloseTo(ordinary);
    expect(proc.hits[0]!.triggeredTotal).toBeCloseTo(ordinary * 2 * 6);
    expect(proc.hits[0]!.expectedTotal).toBeCloseTo(ordinary * 1.33 * 6);
  });

  it('withholds scenarios when source conditions or data versions are unresolved', () => {
    const original = damage(build('Psychology', mod('power_4062')), STRIKE);
    const changed = (change: Partial<NormalizedModifier>) => ({ ...original, aggregation: { ...original.aggregation,
      modifiers: original.aggregation.modifiers.map(m => m.proc ? { ...m, ...change } : m) } });
    const uncertain = changed({ applicability: 'conditions-unevaluated', conditions: [{ kind: 'source-qualifier', qualifier: 'synthetic', status: 'unevaluated' }] });
    expect(calculateDamageProcs(uncertain, applyTargetDummy(uncertain, target), target, data)!.probability).toBeNull();
    const inactive = changed({ conditions: [{ kind: 'requires-active-skill', skillId: 'Sword', status: 'not-met' }], applicability: 'conditions-not-met' });
    expect(calculateDamageProcs(inactive, applyTargetDummy(inactive, target), target, data)).toBeNull();
    const mismatch = { ...original, aggregation: { ...original.aggregation, gameDataVersion: 'vOther' } };
    expect(calculateDamageProcs(mismatch, applyTargetDummy(mismatch, target), target, data)!.probability).toBeNull();
    const cow = damage(build('Cow', mod('power_20004')));
    expect(calculateStampedeScenario({ ...cow, aggregation: { ...cow.aggregation, gameDataVersion: 'vOther' } }, target, 1, data)!.projected).toBeNull();
  });

  it.each([
    ['power_21023', 'Deer', 'ability_1557', 'id_12', 82, 0.2, 1.86],
    ['power_21023', 'Deer', 'ability_1557', 'id_13', 87, 0.24, 1.92],
    ['power_22085', 'Pig', 'ability_1521', 'id_25', 19 * 1.5, 0.15, 2],
    ['power_28124', 'SpiritFox', 'ability_7521', 'id_25', 183, 0.5, 1.82],
  ] as const)('%s / %s exact selected tier %s %s', (powerId, skillId, abilityId, tierId, normal, p, multiplier) => {
    const { result, proc } = procs(build(skillId, mod(powerId, tierId)), abilityId);
    expect(result.provisionalDamage).toBeCloseTo(normal);
    expect(proc!.probability).toBe(p);
    expect(proc!.hits[0]!.triggered).toBeCloseTo(normal * multiplier);
    expect(proc!.hits[0]!.expected).toBeCloseTo(normal * (1 - p) + normal * multiplier * p);
    expect(proc!.sources[0]!.modifier.source).toMatchObject({ powerId, tierId });
    expect(result.components.filter(c => c.delivery === 'indirect').every(c => c.provisionalDamage === null)).toBe(true);
  });

  it('models Cow Front Kick flat bonus only when triggered, through percentage and target stages', () => {
    const b = build('Cow', mod('power_20003', 'id_1'));
    const config = { count: 3, damageTypes: { Crushing: { vulnerability: 20, resistance: 0 } } };
    const { result, proc } = procs(b, 'ability_6124', config);
    expect(result.provisionalDamage).toBe(412);
    expect(proc!.probability).toBe(0.66);
    expect(proc!.hits[0]!.normal).toBeCloseTo(412 * 1.2);
    expect(proc!.hits[0]!.triggered).toBeCloseTo((412 + 12) * 1.2);
    expect(proc!.hits[0]!.expected).toBeCloseTo((412 + 12 * 0.66) * 1.2);
    expect(procs(b, 'ability_8169').proc).toBeNull(); // Unarmed Front Kick
    expect(procs(b, STAMPEDE).proc).toBeNull();
  });

  it('keeps multiple sources and probabilities, with combined outputs unavailable', () => {
    const b = build('Psychology', mod('power_4062', 'id_20'), mod('power_4062', 'id_25', 'Hands', true));
    const { result, proc } = procs(b);
    expect(result.provisionalDamage).toBe(610); // +80 and +100, never a random doubling in ordinary damage
    expect(proc!.sources.map(s => [s.probability, s.modifier.value])).toEqual([[0.33, 2], [0.33, 2]]);
    expect(proc!.status).toBe('unavailable'); expect(proc!.probability).toBeNull();
    expect(proc!.hits[0]!.triggered).toBeNull(); expect(proc!.hits[0]!.expected).toBeNull();
    expect(proc!.warnings.join(' ')).toMatch(/shared versus independent/u);
    b.equipment.pop(); expect(procs(b).proc!.status).toBe('estimated');
  });

  it('retains adjacent unsupported/random-target procs as Unavailable, including with a supported flat proc', () => {
    const b = build('Cow', mod('power_20011'));
    expect(procs(b, 'ability_6124').proc).toMatchObject({ status: 'unavailable', probability: null });
    b.equipment.push(mod('power_20003', 'id_1', 'Hands'));
    const result = procs(b, 'ability_6124').proc!;
    expect(result.sources).toHaveLength(1); expect(result.unresolved).toHaveLength(1);
    expect(result.hits[0]!.expected).toBeNull();
    expect(procs(b, STAMPEDE).proc).toBeNull();
  });

  it('does not guess flat allocation, target values or malformed probabilities', () => {
    const b = build('Cow', mod('power_20003', 'id_1'));
    const original = damage(b, 'ability_6124');
    const ability = { ...original.ability!, damage: { ...original.ability!.damage, healthSpecificDamage: 10 } };
    const splitData = { ...data, getAbility: (id: string) => id === ability.id ? ability : data.getAbility(id) };
    const split = calculateAbilityDamage(ability.id, original.aggregation, splitData);
    const config = target;
    const proc = calculateDamageProcs(split, applyTargetDummy(split, config), config, splitData)!;
    expect(proc.hits.every(h => h.triggered === null && h.expected === null)).toBe(true);
    const invalid: AbilityDamageResult = { ...original, aggregation: { ...original.aggregation,
      modifiers: original.aggregation.modifiers.map(m => m.proc ? { ...m, proc: { ...m.proc, probability: 1.5 } } : m) } };
    expect(calculateDamageProcs(invalid, applyTargetDummy(invalid, config), config, data)!.probability).toBeNull();
    const badTarget = { ...applyTargetDummy(original, target), hits: applyTargetDummy(original, target).hits.map(h => ({ ...h, perTarget: null })) };
    expect(calculateDamageProcs(original, badTarget, target, data)!.hits[0]!.expected).toBeNull();
  });

  it('leaves target dummy and critical chance/multiplier unchanged, with no combined expectation', () => {
    const b = build('Psychology');
    const bare = damage(b, STRIKE), config = { count: 4, damageTypes: { Psychic: { vulnerability: 20, resistance: 0 } } };
    const criticalInputs = { creatureType: 'Anatomy_Humans', skillLevel: (id: string) => resolveCriticalSkillLevel(id, { manualLevels: { Phrenology_Humans: 48 } }, data) };
    const bareCritical = calculateCriticalHit(bare, applyTargetDummy(bare, config), criticalInputs, data);
    b.equipment = [mod('power_4062')];
    const ordinary = damage(b, STRIKE), dummy = applyTargetDummy(ordinary, config);
    const critical = calculateCriticalHit(ordinary, dummy, criticalInputs, data);
    const saved = JSON.stringify({ ordinary, dummy, critical });
    const proc = calculateDamageProcs(ordinary, dummy, config, data)!;
    expect(critical.chance).toEqual(bareCritical.chance); expect(critical.multiplier).toEqual(bareCritical.multiplier);
    expect(critical.hits[0]!.critical).toBeCloseTo(530 * 1.2 * 1.25);
    expect(proc.hits[0]!.triggered).toBeCloseTo(530 * 1.2 * 2);
    expect(JSON.stringify({ ordinary, dummy, critical })).toBe(saved);
    expect(damage(b, 'ability_6553').provisionalDamage).toBe(damage(build('Psychology'), 'ability_6553').provisionalDamage);
  });
});

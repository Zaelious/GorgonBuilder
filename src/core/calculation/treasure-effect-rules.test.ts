import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type BuildDocument, type EquipmentSelection } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { psychologyFixture } from './fixtures';
import { applyTargetDummy } from './target-damage';
import { interpretTreasureEffect, TREASURE_EFFECT_RULES } from './treasure-effect-rules';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

const MOCK_11 = 'ability_6553'; // HealthSpecificDamage 178 Psychic
const RIDICULE = 'ability_1217'; // HealthSpecificDamage 18 Psychic
const STRIKE_A_NERVE = 'ability_1298';
const MOCK_AND_RIDICULE = 'power_4066'; // "Mock and Ridicule deal +X% damage and taunt +Y" (Necklace/OffHand)
const MOCK_BOOST = 'power_4032'; // "Mock hits all enemies within 20 meters ... damage is halved ..." (Hands)

function item(slot: string) { return data.items.find(entry => entry.slot === slot && (entry.level ?? 0) >= 100)!.id; }
function planned(slot: string, powerId: string, tierId: string): EquipmentSelection {
  return { slot, item: { kind: 'database', itemId: item(slot) }, candidateMods: [{ powerId, tierId }], sparks: { mode: 'none' } };
}
function imported(slot: string, powerId: string, tierId: string): EquipmentSelection {
  return { slot, candidateMods: [], sparks: { mode: 'none' }, item: { kind: 'imported', instance: {
    baseItemId: item(slot), existingPowers: [{ powerId, tierId }],
    // Historical evidence is never aggregated (T0011-F2); this unrelated power must not appear.
    metadata: { sourceItem: { TSysPowers: [{ Power: 'power_4061', Tier: 9 }] } },
  } } };
}
/** Psychology + Deer at level 100 with naked bars; only the given gear. */
function psychDeer(...equipment: EquipmentSelection[]): BuildDocument {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Psychology', level: 100 };
  build.skillSlotB = { skillId: 'Deer', level: 100 };
  build.equipment = equipment;
  return build;
}
function scenario(abilityId: string, build: BuildDocument, count = 1) {
  const result = calculateAbilityDamage(abilityId, aggregateBuildModifiers(build, data), data);
  return { result, target: applyTargetDummy(result, { count, damageTypes: {} }) };
}

describe('curated exact treasure-power rules', () => {
  it('interprets every published tier of both Mock powers with its exact power ID and InternalName', () => {
    for (const powerId of [MOCK_AND_RIDICULE, MOCK_BOOST]) {
      const power = data.getTreasurePower(powerId)!;
      expect(TREASURE_EFFECT_RULES.some(rule => rule.powerId === powerId && rule.internalName === power.internalName)).toBe(true);
      for (const tier of power.tiers) {
        for (const description of tier.effectDescriptions) {
          expect(interpretTreasureEffect(powerId, description, data)?.kind, `${powerId}/${tier.id}`).toBe('drafts');
        }
      }
    }
  });

  it('maps +43% to Mock and Ridicule damage % and keeps taunt separate', () => {
    const tier = data.getTreasureTier(MOCK_AND_RIDICULE, 'id_20')!;
    expect(tier.effectDescriptions).toEqual(['<icon=2220><icon=2257>Mock and Ridicule deal +43% damage and taunt +200']);
    const result = interpretTreasureEffect(MOCK_AND_RIDICULE, tier.effectDescriptions[0]!, data);
    expect(result?.kind === 'drafts' && result.drafts.map(d => [d.attributeId, d.category, d.value])).toEqual([
      ['MOD_ABILITY_MOCK', 'ability-damage-percent', 0.43], ['MOD_ABILITY_RIDICULE', 'ability-damage-percent', 0.43],
      ['ABILITY_TAUNT_DELTA_MOCK', 'ability-taunt-flat', 200], ['ABILITY_TAUNT_DELTA_RIDICULE', 'ability-taunt-flat', 200],
    ]);
  });

  it('does not guess: other powers, other wording or a renamed power stay uninterpreted', () => {
    const text = data.getTreasureTier(MOCK_AND_RIDICULE, 'id_20')!.effectDescriptions[0]!;
    expect(interpretTreasureEffect('power_4002', text, data)).toBeNull();
    expect(interpretTreasureEffect(MOCK_AND_RIDICULE, text.replace('+43%', 'about 43%'), data)?.kind).toBe('template-mismatch');
    const renamed = { ...data, getTreasurePower: (id: string) => id === MOCK_AND_RIDICULE ? { ...data.getTreasurePower(id)!, internalName: 'Other' } : data.getTreasurePower(id) };
    expect(interpretTreasureEffect(MOCK_AND_RIDICULE, text, renamed)).toBeNull();
    // Other prose (e.g. Psychoanalyze extra damage) is still an unsupported record.
    const fixture = aggregateBuildModifiers(psychologyFixture(data.gameDataVersion), data);
    expect(fixture.unsupported.some(u => u.reason === 'prose-effect' && u.key.includes('power_4002'))).toBe(true);
  });
});

describe('customer Psychology + Deer scenario', () => {
  it('naked Mock 11 reproduces the published base; the OffHand +43% raises Mock and Ridicule only', () => {
    expect(scenario(MOCK_11, psychDeer()).result.provisionalDamage).toBe(178);
    const build = psychDeer(planned('OffHand', MOCK_AND_RIDICULE, 'id_20'));
    const mock = scenario(MOCK_11, build).result;
    expect(mock.provisionalDamage).toBeCloseTo(178 * 1.43, 10);
    const step = mock.components.find(c => c.id === 'health-specific')!.steps.find(s => s.category === 'ability-damage-percent')!;
    expect(step).toMatchObject({ operand: 0.43, basis: 178, modifierKey: 'equipment:OffHand#0/candidate:power_4066:id_20#0/effect:0/rule:damage:Mock' });
    expect(scenario(RIDICULE, build).result.provisionalDamage).toBeCloseTo(18 * 1.43, 10);
    // Unrelated Psychology ability: excluded by the official MOD_ABILITY_MOCK/RIDICULE hooks.
    const nerve = scenario(STRIKE_A_NERVE, build).result;
    expect(nerve.components.flatMap(c => c.decisions).filter(d => d.modifier.mappingRuleId === 'treasure:MockAndRidiculeBoost' && d.status === 'applied')).toEqual([]);
  });

  it('the Hands conversion makes Mock Burst (20 m), halves every hit at any enemy count and preserves taunt/reuse', () => {
    const build = psychDeer(planned('OffHand', MOCK_AND_RIDICULE, 'id_20'), planned('Hands', MOCK_BOOST, 'id_18'));
    const perTarget = 178 * 1.43 * 0.5;
    const at = (count: number) => scenario(MOCK_11, build, count).target;
    const one = at(1);
    expect(one.burst).toMatchObject({ source: 'treasure-conversion', radius: 20 });
    expect(one.hits[0]!.steps.map(s => [s.kind, s.multiplier])).toEqual([['ability-multiplier', 0.5]]);
    expect(one.hits[0]!.perTarget).toBeCloseTo(perTarget, 10);
    // 20 m radius: 5 full-damage targets.
    for (const count of [3, 5]) {
      const t = at(count);
      expect(t.affectedTargets).toBe(count);
      expect(t.hits[0]!.perTarget).toBeCloseTo(perTarget, 10);
      expect(t.hits[0]!.total).toBeCloseTo(perTarget * count, 10);
    }
    const nine = at(9);
    expect(nine.hits[0]!.perTarget).toBeCloseTo(perTarget * 0.25, 10);
    expect(nine.hits[0]!.total).toBeCloseTo(perTarget * 0.25 * 9, 10);
    expect(at(6).hits[0]!.total).toBeCloseTo(perTarget * 0.8125 * 6, 10);
    expect(at(6).hits[0]!.estimated).toBe(true);
    expect(one.abilityEffects.map(m => [m.category, m.value])).toEqual([
      ['ability-taunt-flat', 200], ['ability-burst-conversion', 20], ['ability-damage-multiplier', 0.5],
      ['ability-taunt-flat', 1080], ['ability-reset-time-flat', 1.5],
    ]);
    // Taunt and reuse never reach the damage engine.
    const decisions = scenario(MOCK_11, build).result.components.flatMap(c => c.decisions);
    expect(decisions.filter(d => ['ability-taunt-flat', 'ability-reset-time-flat'].includes(d.modifier.category)).every(d => d.reason === 'not-normal-damage')).toBe(true);
    // Ridicule is not converted.
    const ridicule = scenario(RIDICULE, build, 5).target;
    expect(ridicule.burst).toBeNull();
    expect(ridicule.affectedTargets).toBe(1);
    expect(ridicule.abilityEffects.map(m => m.attributeId)).toEqual(['ABILITY_TAUNT_DELTA_RIDICULE']);
  });

  it('works identically for imported working powers and ignores historical source evidence', () => {
    const plannedBuild = psychDeer(planned('OffHand', MOCK_AND_RIDICULE, 'id_20'), planned('Hands', MOCK_BOOST, 'id_18'));
    const importedBuild = psychDeer(imported('OffHand', MOCK_AND_RIDICULE, 'id_20'), imported('Hands', MOCK_BOOST, 'id_18'));
    const a = scenario(MOCK_11, plannedBuild, 5).target.hits[0]!;
    const b = scenario(MOCK_11, importedBuild, 5).target.hits[0]!;
    expect(b.perTarget).toBe(a.perTarget);
    expect(b.total).toBe(a.total);
    const aggregation = aggregateBuildModifiers(importedBuild, data);
    expect(aggregation.modifiers.some(m => JSON.stringify(m.source).includes('power_4061'))).toBe(false);
    expect(aggregation.modifiers.filter(m => m.source.kind === 'existing-power').length).toBe(8);
  });

  it('combines with flat, percentage and Skill Base sources once each, then halves the final hit', () => {
    const build = psychologyFixture(data.gameDataVersion);
    build.skillSlotB = { skillId: 'Deer', level: 100 };
    build.equipment.push(planned('OffHand', MOCK_AND_RIDICULE, 'id_20'), planned('Hands', MOCK_BOOST, 'id_18'));
    const { result, target } = scenario(MOCK_11, build, 3);
    const steps = result.components.find(c => c.id === 'health-specific')!.steps;
    // 178 + 175 + 58 = 411; +43% of 411; Skill Base +20% and +45% of 178.
    expect(steps.map(s => s.category)).toEqual(['original-base', 'all-direct-damage-flat', 'all-direct-damage-flat',
      'ability-damage-percent', 'skill-base-damage-percent', 'skill-base-damage-percent']);
    const keys = steps.map(s => s.modifierKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    const beforeHalving = 411 + 411 * 0.43 + 178 * 0.2 + 178 * 0.45;
    expect(result.provisionalDamage).toBeCloseTo(beforeHalving, 10);
    expect(target.hits[0]!.perTarget).toBeCloseTo(beforeHalving * 0.5, 10);
    expect(target.hits[0]!.total).toBeCloseTo(beforeHalving * 0.5 * 3, 10);
  });

  it('refuses to stack duplicated conversions without a known rule', () => {
    const build = psychDeer(planned('Hands', MOCK_BOOST, 'id_18'));
    build.equipment[0]!.candidateMods.push({ powerId: MOCK_BOOST, tierId: 'id_18' });
    const { target } = scenario(MOCK_11, build, 3);
    expect(target.warnings.map(w => w.code)).toContain('multiple-ability-conversions');
    expect(target.hits[0]!.perTarget).toBeNull();
  });
});

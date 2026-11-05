// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type EquipmentSelection } from '../build/document';
import { aggregateBuildModifiers, calculateAbilityDamage, calculateStampedeScenario } from './index';
import { interpretTreasureEffect } from './treasure-effect-rules';
const data = loadPlannerFixture();
const target = { count: 1, damageTypes: {} };
const mod = (powerId: string, tierId: string, slot = 'Necklace'): EquipmentSelection => ({ slot, item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [{ powerId, tierId }], sparks: { mode: 'none' } });
function run(stacks: number, stunned: boolean, equipment = [mod('power_20020', 'id_25'), mod('power_20004', 'id_20', 'Chest'), mod('power_20004', 'id_25', 'Hands')], id = 'ability_6138') {
 const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }); build.skillSlotA = { skillId: 'Cow', level: 0 }; build.equipment = equipment;
 const ordinary = calculateAbilityDamage(id, aggregateBuildModifiers(build, data), data);
 return { ordinary, scenario: calculateStampedeScenario(ordinary, target, stacks, data, stunned) };
}
describe('equipped player-stunned Stampede scenario', () => {
 it('maps all 25 exact tiers, rarity, slot and hook facts', () => {
  const power = data.getTreasurePower('power_20020')!; expect(power.internalName).toBe('CowStampedeVsStunned'); expect(power.slots).toEqual(['Necklace']); expect(power.tiers).toHaveLength(25);
  for (const tier of power.tiers) {
   const resolution = interpretTreasureEffect(power.id, tier.effectDescriptions[0]!, data)!;
   expect(resolution.kind).toBe('drafts');
   if (resolution.kind !== 'drafts') throw Error('missing rule');
   const tierNumber = Number(tier.id.slice(3));
   expect(resolution.drafts[0]!.value).toBe((50 + tierNumber * 50) / 100);
   expect(tier.minRarity).toBe(tierNumber <= 7 ? 'Rare' : 'Epic');
   expect(resolution.drafts[0]!.scope).toMatchObject({ skillId: 'Cow', attributeId: 'MOD_ABILITY_STAMPEDE', hook: 'AttributesThatModDamage' });
   expect(interpretTreasureEffect(power.id, tier.effectDescriptions[0] + ' extra', data)?.kind).toBe('template-mismatch');
  }
 });
 it.each([[0,false,208],[15,false,1933],[0,true,2912],[15,true,27062]] as const)('stacks %i, stunned %s -> %i (synthetic)', (stacks, stunned, expected) => {
  const { ordinary, scenario } = run(stacks, stunned); expect(ordinary.provisionalDamage).toBe(208);
  expect(scenario!.projected!.hits[0]!.perTarget).toBe(expected); expect(scenario!.stacked!.hits[0]!.perTarget).toBe(208 + stacks * 115);
  expect(scenario!.status).toBe('estimated');
  const steps = scenario!.projectedDamage!.components[0]!.steps.filter(s => s.category === 'ability-damage-percent');
  expect(steps).toHaveLength(stunned ? 1 : 0);
  if (stunned) expect(steps[0]!.contribution).toBe((208 + stacks * 115) * 13);
 });
 it('resolves tier replacement and removal, and supports a Necklace without stack mods', () => {
  expect(run(0,true,[mod('power_20020','id_1')]).scenario!.projected!.hits[0]!.perTarget).toBe(416);
  expect(run(0,true,[mod('power_20020','id_20')]).scenario!.projected!.hits[0]!.perTarget).toBe(2392);
  expect(run(0,false,[mod('power_20020','id_25')]).scenario!.projectedDamage!.provisionalDamage).toBe(208);
  expect(run(0,true,[]).scenario).toBeNull();
  expect(run(15,true,[mod('power_20004','id_20','Chest')]).scenario!.whileStunned).toBe(false);
  for (const id of ['ability_6124','ability_1298','ability_8169']) expect(run(15,true,undefined,id).scenario).toBeNull();
 });
 it('keeps other percentages additive and Skill Base on original base', () => {
  const { ordinary } = run(0,false);
  const template = ordinary.aggregation.modifiers.find(m => m.category === 'stampede-stunned-percent')!;
  const result = calculateAbilityDamage('ability_6138', { ...ordinary.aggregation, modifiers: [...ordinary.aggregation.modifiers,
   { ...template, key: 'other-percent', category: 'ability-damage-percent', value: 0.5 },
   { ...template, key: 'base-percent', category: 'skill-base-damage-percent', value: 0.5, attributeId: 'MOD_SKILL_COW', scope: { kind: 'skill', skillId: 'Cow' } },
  ] }, data);
  const projection = calculateStampedeScenario(result,target,15,data,true)!;
  expect(projection.projected!.hits[0]!.perTarget).toBe(1933 * 14.5 + 104);
  expect(projection.projectedDamage!.components[0]!.steps.find(s => s.operation === 'add-skill-base-contribution')!.basis).toBe(208);
 });
});

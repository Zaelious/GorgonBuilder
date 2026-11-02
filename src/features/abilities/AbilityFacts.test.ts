// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { describeDot, playerEffects } from './AbilityFacts';
let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
it('keeps zero-value conditional DoTs out of player effects but lists their exact source values', () => {
  const acid = data.getAbility('ability_2627')!;
  const { effects, technical } = playerEffects(acid);
  expect(effects).toEqual([]);
  expect(technical).toEqual(['DamagePerTick 0 · Poison · NumTicks 1 · Duration 6 s · SpecialRules BuffActivated, DelayedDamage',
    'On Critical Hit: DamagePerTick 0 · Poison · NumTicks 6 · Duration 12 s · SpecialRules BuffActivated']);
});
it('describes damaging DoTs in plain wording without rule enums', () => {
  const bramble = data.getAbility('ability_5386')!;
  expect(playerEffects(bramble).effects).toEqual(['Melee Damagers Suffer 310 Nature damage']);
  const multi = data.abilities.flatMap(a => a.pve.dots ?? []).find(dot => dot.damagePerTick > 0 && dot.numTicks > 1 && dot.duration > 0)!;
  expect(describeDot(multi)).toBe(`${multi.preface ? `${multi.preface} ` : ''}${multi.damagePerTick} ${multi.damageType} damage per tick × ${multi.numTicks} over ${multi.duration} s`);
  for (const ability of data.abilities.slice(0, 2000)) for (const text of playerEffects(ability).effects) expect(text).not.toMatch(/BuffActivated|DelayedDamage|^0 |DamagePerTick/u);
});

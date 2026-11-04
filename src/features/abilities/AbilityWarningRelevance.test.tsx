import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument } from '../../core/build/document';
import { aggregateBuildModifiers } from '../../core/calculation/aggregate';
import { calculateAbilityDamage } from '../../core/calculation/ability-damage';
import { applyTargetDummy } from '../../core/calculation/target-damage';
import type { UnsupportedEffect } from '../../core/calculation/modifiers';
import { AbilityResults } from './AbilityResults';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
it('removes only confirmed secondary remainders from visible warnings and preserves all source details and result confidence', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.equipment = [{ slot: 'Feet', item: { kind: 'database', itemId: 'item_40350' }, candidateMods: [
    { powerId: 'power_10305', tierId: 'id_9' }, { powerId: 'power_10202', tierId: 'id_9' },
  ], sparks: { mode: 'none' } }];
  const aggregation = aggregateBuildModifiers(build, data);
  expect(aggregation.unsupported).toHaveLength(2);
  const ability = data.abilities.find(a => a.pve.attributeHooks.AttributesThatDeltaDamage?.includes('BOOST_ABILITY_FIREARROW'))!;
  const target = { count: 1, damageTypes: {} };
  const original = calculateAbilityDamage(ability.id, aggregation, data);
  const expected = applyTargetDummy(original, target);
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<AbilityResults ability={ability} inputs={{ aggregation, target }} data={data} idPrefix="test" />));
    expect(container.querySelector('.result-build-limits')).toBeNull();
    expect(container.querySelector('[data-warning="unsupported-build-effects"]')).toBeNull();
    expect(container.textContent).not.toContain('unsupported build effects may change damage');
    expect(container.textContent).toContain('Non-damage source details (not simulated) (2)');
    expect(container.querySelectorAll('[data-relevance="non-damage"]')).toHaveLength(2);
    expect(container.textContent).toContain('power_10305/id_9');
    expect(container.textContent).toContain('Fire Arrow deals');
    expect(container.querySelector<HTMLElement>('.ability-results')!.dataset.confidence).toBe(expected.confidence);
    const value = container.querySelector('.damage-value')!.textContent;
    const unknown: UnsupportedEffect = { ...aggregation.unsupported[0]!, key: 'unknown', reason: 'prose-effect',
      source: { kind: 'equipment', equipmentIndex: 0, equipmentKey: 'Feet#0', slot: 'Feet', itemKind: 'database', itemId: 'item_40350', itemResolved: true }, message: 'Unresolved source meaning' };
    const damage: UnsupportedEffect = { ...aggregation.unsupported[0]!, key: 'damage', reason: 'prose-effect', message: 'Unresolved damage',
      source: { ...aggregation.modifiers[0]!.source, description: 'Mystery Strike deals +100 damage' } as UnsupportedEffect['source'] };
    const mixed = { ...aggregation, unsupported: [...aggregation.unsupported, unknown, damage] };
    await act(async () => root.render(<AbilityResults ability={ability} inputs={{ aggregation: mixed, target }} data={data} idPrefix="test" />));
    expect(container.querySelector('.result-build-limits')!.textContent).toContain('1 unresolved damage effect, 1 effect with unknown damage relevance');
    expect(container.querySelectorAll('[data-relevance="non-damage"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-relevance="damage-affecting"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-relevance="unknown"]')).toHaveLength(1);
    expect(container.querySelector('.damage-value')!.textContent).toBe(value);
    expect(calculateAbilityDamage(ability.id, aggregation, data)).toEqual(original);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

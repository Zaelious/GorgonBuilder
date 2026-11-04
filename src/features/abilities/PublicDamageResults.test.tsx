import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type TargetConfiguration } from '../../core/build/document';
import { aggregateBuildModifiers } from '../../core/calculation/aggregate';
import { calculateAbilityDamage } from '../../core/calculation/ability-damage';
import { AbilityResults } from './AbilityResults';
import { AbilityFacts } from './AbilityFacts';
import { damageDebugEnabled } from './damage-debug';
let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });
it('requires an explicit development flag and ignores it in production', () => {
  expect(damageDebugEnabled(true, '')).toBe(false);
  expect(damageDebugEnabled(true, '?debugDamage=1')).toBe(true);
  expect(damageDebugEnabled(false, '?debugDamage=1')).toBe(false);
  expect(damageDebugEnabled(true, '?debugDamage=0')).toBe(false);
});
it('keeps supported, partial and unavailable numbers truthful and retains full diagnostics only with explicit opt-in', async () => {
  history.replaceState(null, '', '/');
  const base = data.getAbility('ability_6553')!;
  // Narrow synthetic variants remove unrelated special mechanics or make a hit unresolved; no formula changes.
  const clean = { ...base, keywordRuleCandidates: [], conditionalKeywords: [], effectKeywordConstraints: [], specialInfo: null,
    pve: { ...base.pve, dots: [], specialValues: [] } };
  const repository = { ...data, getAbility: (id: string) => id === base.id ? clean : data.getAbility(id) };
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  const aggregation = aggregateBuildModifiers(build, data);
  const target: TargetConfiguration = { count: 1, damageTypes: {} };
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  try {
    const render = async (repo = repository, inputs = aggregation) => act(async () => root.render(<>
      <AbilityResults ability={clean} inputs={{ aggregation: inputs, target }} data={repo} idPrefix="public" />
      <AbilityFacts ability={clean} />
    </>));
    await render();
    expect(container.querySelector('.damage-value')!.textContent).toBe('178 Psychic');
    expect(container.querySelector('.result-status')).toBeNull();
    target.damageTypes.Psychic = { vulnerability: 10 };
    await render();
    expect(container.querySelector('.result-status')!.textContent).toBe('Estimated');
    expect(container.querySelector('.damage-value')!.textContent).toBe('195.8 Psychic');
    target.damageTypes = {};
    await render();
    expect(container.querySelector('.calc-breakdown, .technical-details, [data-unsupported], [data-warning], .official-id')).toBeNull();
    expect(container.textContent).not.toMatch(/Across build|Assumptions|MOD_|power_|Published base|Calculation breakdown/u);
    const partial = { ...aggregation, warnings: [{ code: 'unknown-power' as const, message: 'Private debug identity: power_unknown' }] };
    await render(repository, partial);
    expect(container.querySelector('.result-status')!.textContent).toBe('Partial');
    expect(container.textContent).not.toContain('power_unknown');
    expect(container.querySelector('.damage-value')!.textContent).toBe('178 Psychic');
    const unresolved = { ...repository, getAbility: () => ({ ...clean, damage: { ...clean.damage, healthSpecificDamage: Number.NaN } }) };
    await render(unresolved);
    expect(container.querySelector('.result-status')!.textContent).toBe('Unavailable');
    expect(container.querySelector('.result-rows')!.textContent).not.toMatch(/NaN|Infinity/u);
    const before = calculateAbilityDamage(clean.id, partial, repository);
    history.replaceState(null, '', '/?debugDamage=1');
    await render(repository, partial);
    expect(container.querySelector('.calc-breakdown')).not.toBeNull();
    expect(container.querySelector('.technical-details')).not.toBeNull();
    expect(container.textContent).toContain('Calculation breakdown');
    expect(calculateAbilityDamage(clean.id, partial, repository)).toEqual(before);
  } finally { await act(async () => root.unmount()); container.remove(); history.replaceState(null, '', '/'); }
});

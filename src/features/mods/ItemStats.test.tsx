import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import type { EquipmentSelection } from '../../core/build/document';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { ItemStats } from './ItemStats';
let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement, root: Root;
beforeAll(() => { data = loadPlannerFixture(); });
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const selection: EquipmentSelection = { slot: 'Chest', item: { kind: 'imported', instance: { baseItemId: 'item_42705', existingPowers: [{ powerId: 'power_10001', tierId: 'id_12' }] } },
  candidateMods: [{ powerId: 'power_14005', tierId: 'id_25' }, { powerId: 'power_10001', tierId: 'id_12' }, { powerId: 'power_101', tierId: null },
    { powerId: 'power_14154', tierId: null }, { powerId: 'power_129', tierId: 'id_120' }, { powerId: 'power_30101', tierId: null }, { powerId: 'missing', tierId: null }],
  sparks: { mode: 'none' } };
async function render(skillA: string | null, skillB: string | null) {
  await act(async () => root.render(<ItemStats selection={selection} item={data.getItem('item_42705')} data={data} skillA={skillA} skillB={skillB} />));
  return [...container.querySelectorAll<HTMLElement>('[data-stat-kind="planned"] .stat-chip')].map(chip => `${chip.textContent}:${chip.dataset.tone}`);
}
it('colours follow the current slots: swapping A/B swaps colours and group order; A=B uses one primary colour', async () => {
  const tail = ['Generic:generic', 'Endurance:endurance', 'Shamanic:shamanic', 'Unknown:unknown'];
  expect(await render('Druid', 'Archery')).toEqual(['Druid:skill-a', 'Druid:skill-a', 'Archery:skill-b', ...tail]);
  expect(await render('Archery', 'Druid')).toEqual(['Archery:skill-a', 'Druid:skill-b', 'Druid:skill-b', ...tail]);
  expect(await render('Druid', 'Druid')).toEqual(['Druid:skill-a', 'Druid:skill-a', ...tail.slice(0, 3), 'Archery:other', 'Unknown:unknown']);
  expect(container.querySelector('.item-stats-legend')!.textContent).toContain('A · Druid');
  expect(container.querySelector('.item-stats-legend')!.textContent).not.toContain('B ·');
  expect(await render(null, null)).toEqual(['Generic:generic', 'Endurance:endurance', 'Shamanic:shamanic', 'Druid:other', 'Druid:other', 'Archery:other', 'Unknown:unknown']);
  // Imported powers keep the outlined style with their slot tone; base rows stay neutral.
  await render('Archery', 'Druid');
  const imported = container.querySelector<HTMLElement>('[data-stat-kind="imported"] .stat-chip')!;
  expect(imported.className).toContain('stat-chip-imported');
  expect(imported.dataset.tone).toBe('skill-a');
  expect(imported.textContent).toBe('◇ Archery');
  expect([...container.querySelectorAll<HTMLElement>('[data-stat-kind="base"] .stat-chip')].every(chip => chip.dataset.tone === 'base')).toBe(true);
  expect([...container.querySelectorAll<HTMLElement>('[data-stat-kind="planned"]')].map(row => row.dataset.candidateEffect)).toEqual(['1', '0', '3', '2', '4', '5', '6']);
});

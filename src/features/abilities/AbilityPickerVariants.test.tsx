import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { AbilityPicker } from './AbilityPicker';
import { AbilityFacts } from './AbilityFacts';

let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement;
let root: Root;
beforeAll(() => {
  data = loadPlannerFixture();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
    close: { configurable: true, value() { this.removeAttribute('open'); } },
  });
});
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

async function openPicker(skillId: string, onChoose = vi.fn()) {
  await act(async () => root.render(<AbilityPicker slot="A" skill={{ skillId, level: 125 }} data={data} full={false} bar={[]}
    replaceIndex={null} returnFocus={null} onChoose={onChoose} onClose={vi.fn()} />));
  return onChoose;
}
const familyTitles = () => [...container.querySelectorAll('.family > details > summary .family-title')].map(node => node.firstChild?.textContent);

it('Animal Handling lists Mark Weakness once, without quick-add, and lets the user pick an exact ability from either series', async () => {
  const onChoose = await openPicker('AnimalHandling');
  expect(familyTitles().filter(title => title?.startsWith('Mark Weakness'))).toEqual(['Mark Weakness']);
  const family = [...container.querySelectorAll('.family')].find(node => node.querySelector('.family-title')?.firstChild?.textContent === 'Mark Weakness')!;
  expect(family.querySelector('.quick-add')).toBeNull();
  expect(family.querySelector('.family-title small')?.textContent).toBe('2 versions');
  const series = [...family.querySelectorAll('.ability-variant > summary')].map(node => node.textContent);
  expect(series).toEqual(['Mark Weakness10 abilities', 'Bonus version10 abilities']);
  const bonus = family.querySelector<HTMLButtonElement>('button[aria-label*="ability_4243"]')!;
  await act(async () => bonus.click());
  expect(onChoose).toHaveBeenCalledWith(data.getAbility('ability_4243'));
});

it('variant families show no InternalNames or data-model jargon in public picker text', async () => {
  for (const skillId of ['Vampirism', 'AnimalHandling', 'Bard', 'Mentalism', 'Necromancy', 'Priest']) {
    await openPicker(skillId);
    const text = [...container.querySelectorAll('.family-title small, .ability-variant > summary')].map(node => node.textContent).join(' | ');
    expect(text, skillId).not.toMatch(/TSys|UpgradeOf|Internal\d|Auto[AB]\d|official IDs|verified variant/u);
    expect(container.querySelector('.variant-internal'), skillId).toBeNull();
  }
});

it('single-series families list their abilities directly; ordinary families are unchanged', async () => {
  await openPicker('AnimalHandling');
  const pets = [...container.querySelectorAll('.family')].find(node => node.querySelector('.family-title')?.firstChild?.textContent === 'Call Stabled Pet')!;
  expect(pets.querySelector('.ability-variant')).toBeNull();
  expect(pets.querySelectorAll('.tier')).toHaveLength(7);
  expect(pets.querySelector('.family-title small')?.textContent).toBe('7 abilities');
  await openPicker('Unarmed');
  expect(container.querySelector('.ability-variant')).toBeNull();
  expect([...container.querySelectorAll('.family')].every(node => node.querySelector('.quick-add'))).toBe(true);
});

it('equipped facts tag a non-standard series so same-named abilities are distinguishable', async () => {
  await act(async () => root.render(<AbilityFacts ability={data.getAbility('ability_9212')!} />));
  expect(container.querySelector('[data-ability-series]')?.textContent).toBe('Alternate version A');
  await act(async () => root.render(<AbilityFacts ability={data.getAbility('ability_9062')!} />));
  expect(container.querySelector('[data-ability-series]')).toBeNull();
});

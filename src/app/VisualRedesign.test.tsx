import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { createDefaultBuildDocument } from '../core/build/document';
import { loadGameDataRepository } from '../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../persistence/local/storage';
import { loadPlannerFixture } from '../test/planner-fixture';

vi.mock('../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement, root: Root;
beforeAll(() => { data = loadPlannerFixture(); });
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  vi.mocked(loadGameDataRepository).mockReset().mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
function control<T extends HTMLElement = HTMLElement>(selector: string): T {
  const value = container.querySelector<T>(selector); if (!value) throw new Error(`Missing ${selector}`); return value;
}
const render = async () => { await act(async () => root.render(<App />)); };
const tick = async (ms = 500) => { await act(async () => vi.advanceTimersByTime(ms)); };
const click = async (selector: string) => { await act(async () => control(selector).click()); };
async function change(selector: string, value: string) {
  const element = control<HTMLSelectElement>(selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const saved = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as ReturnType<typeof createDefaultBuildDocument>;

it('renders the bundled mosaic portrait and ruins banner as decorative local artwork with a text wordmark', async () => {
  await render();
  const header = control('.site-header');
  expect(header.querySelector('.wordmark')!.textContent).toBe('Gorgon Builder');
  expect(header.querySelector('.project-label')!.textContent).toBe('Build Planner');
  const portrait = control<HTMLImageElement>('.brand-portrait');
  const banner = control<HTMLImageElement>('.site-banner-image');
  expect(portrait.alt).toBe(''); expect(banner.alt).toBe('');
  expect(control('.site-banner').getAttribute('aria-hidden')).toBe('true');
  for (const image of [portrait, banner]) {
    for (const candidate of image.srcset.split(',').map(entry => entry.trim().split(' ')[0]!)) {
      expect(candidate).toMatch(/^\/branding\/[a-z0-9-]+\.webp$/u);
      expect(existsSync(resolve('public', candidate.slice(1)))).toBe(true);
    }
  }
  // Missing artwork degrades to the gradient header; the wordmark stays readable.
  await act(async () => { portrait.dispatchEvent(new Event('error')); banner.dispatchEvent(new Event('error')); });
  expect(container.querySelector('.brand-portrait')).toBeNull();
  expect(container.querySelector('.site-banner-image')).toBeNull();
  expect(control('.wordmark').textContent).toBe('Gorgon Builder');
});

it('Save writes the current draft locally at once through the autosave path and reports success', async () => {
  await render();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  const save = control<HTMLButtonElement>('.save-draft');
  expect(save.getAttribute('aria-label')).toBe('Save local draft');
  expect(save.textContent).toBe('Save');
  await click('.save-draft');
  expect(saved().skillSlotA.skillId).toBeNull();
  expect(control('.save-status').textContent).toBe('Saved in this browser');
  // A pending edit is flushed immediately rather than after the 500 ms debounce, and written only once.
  await change('#skill-A', 'Cow');
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('.save-draft');
  expect(saved().skillSlotA.skillId).toBe('Cow');
  await tick();
  expect(writes.mock.calls.filter(([key]) => key === DRAFT_STORAGE_KEY)).toHaveLength(1);
});

it('Save reflects real storage failures and keeps the explicit retry', async () => {
  await render();
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await change('#skill-A', 'Cow');
  await click('.save-draft');
  expect(control('.save-status').textContent).toBe('Changes are not saved');
  expect(container.textContent).toContain('could not be saved');
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  setItem.mockRestore();
  await click('.save-draft');
  expect(saved().skillSlotA.skillId).toBe('Cow');
  expect(control('.save-status').textContent).toBe('Saved in this browser');
});

it('disables Save for protected drafts without writing', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  await render();
  expect(control<HTMLButtonElement>('.save-draft').disabled).toBe(true);
  await click('.save-draft'); await tick();
  expect(writes).not.toHaveBeenCalled();
});

it('marks skill rows for their accents, colors actual damage values only, and shows no invented bonus labels', async () => {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId: 'Druid', level: 125 }; build.skillSlotB = { skillId: 'Archery', level: 125 };
  build.abilityBarB = [{ abilityId: 'ability_2627', rank: data.getAbility('ability_2627')!.rank }];
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await render();
  expect([...container.querySelectorAll('.skill-panel')].map(panel => panel.classList.contains('skill-panel-A') ? 'A' : panel.classList.contains('skill-panel-B') ? 'B' : '?')).toEqual(['A', 'B']);
  expect(control('.planner-grid').textContent).not.toMatch(/\+\d+%/u);
  await click('.skill-panel:nth-child(2) .combat-slot:nth-child(1) .slot-button');
  const values = [...container.querySelectorAll('.ability-popover .ability-stats .damage-value')];
  expect(values.map(value => [value.textContent, value.className])).toEqual([
    ['529 Acid', 'damage-value damage-acid'], ['529 Acid', 'damage-value damage-acid'],
  ]);
  const labels = [...container.querySelectorAll('.ability-popover .ability-stats dt')].map(term => term.textContent);
  expect(labels).toEqual(['Damage', 'Armor damage', 'Power cost', 'Reuse time', 'Range', 'Min level']);
  // Edit bar and Remove stay inside the floating inspector.
  expect(control('.ability-popover .bar-edit-actions > summary').textContent).toBe('Edit bar');
  expect(control('.ability-popover .remove-ability').textContent).toBe('Remove');
});

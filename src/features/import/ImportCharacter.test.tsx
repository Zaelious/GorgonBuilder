import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { editBuild } from '../../app/editor/build-editor';
import { App } from '../../app/App';
import { createDefaultBuildDocument } from '../../core/build/document';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';

vi.mock('../../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
const characterText = readFileSync(resolve('src/core/import/fixtures/character-sheet.json'), 'utf8');
const storageText = readFileSync(resolve('src/features/import/fixtures/storage.json'), 'utf8');
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
beforeEach(async () => {
  vi.useFakeTimers(); localStorage.clear();
  vi.mocked(loadGameDataRepository).mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(<App />); });
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
function control<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector); if (!element) throw new Error(`Missing ${selector}`); return element;
}
async function click(selector: string) { await act(async () => { control(selector).click(); }); }
async function button(text: string) {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent === text);
  if (!button) throw new Error(`Missing button ${text}`);
  await act(async () => { button.click(); });
}
async function change(selector: string, value: string) {
  const element = control<HTMLInputElement | HTMLSelectElement>(selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function upload(selector: string, text: string, read?: () => Promise<string>) {
  const file = new File([text], 'private-source.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: read ?? (() => Promise.resolve(text)) });
  await act(async () => { const element = control<HTMLInputElement>(selector); Object.defineProperty(element, 'files', { configurable: true, value: [file] }); element.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function importReports(text = storageText) {
  await button('Import Character'); await upload('#character-file', characterText); await upload('#storage-file', text); await button('Use these reports');
}
const browse = () => click('.equipment-section > .section-heading button');
const tick = async () => { await act(async () => { vi.advanceTimersByTime(500); }); };
const draft = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as ReturnType<typeof createDefaultBuildDocument>;
async function remount() { await act(async () => { root.unmount(); }); root = createRoot(container); await act(async () => { root.render(<App />); }); }

it('imports both reports locally, exposes identity/levels and diagnostic counts without changing a draft', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  await button('Import Character');
  await upload('#character-file', characterText); await upload('#storage-file', storageText);
  expect(control('dialog').textContent).toContain('Fixture Adventurer');
  expect(control('dialog').textContent).toContain('Fixture Server');
  expect(control('dialog').textContent).toContain('2026-11-01T12:00:00Z');
  expect(control('dialog').textContent).toContain('2 skills · 3 known ability entries');
  await change('#verify-skill', 'Psychology');
  expect(control('tbody').textContent).toContain('90');
  expect(control('.import-counts').textContent).toContain('Exact treasure power/tier pairs3');
  await button('Use these reports'); await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull(); expect(network).not.toHaveBeenCalled();
  expect(document.activeElement?.textContent).toBe('Import Character');
  await browse(); expect(control('dialog').textContent).toContain('5 matching owned instances');
  expect(control('dialog').textContent).not.toContain('Fixture Tooth');
});

it('filters distinct instances and displays exact resolved/unresolved powers and imbues', async () => {
  await importReports(); await browse();
  await change('#my-items-search', 'twin'); expect(container.querySelectorAll('[data-import-path]')).toHaveLength(2);
  await change('#my-items-minimum', '100'); expect(container.querySelectorAll('[data-import-path]')).toHaveLength(1);
  expect(control('[data-import-path]').getAttribute('data-import-path')).toBe('/Items/1');
  await change('#my-items-minimum', ''); await change('#my-items-maximum', '91');
  expect(control('[data-import-path]').getAttribute('data-import-path')).toBe('/Items/0');
  const details = control('[data-import-path]');
  expect(details.textContent).toContain('Exact source tier: 777');
  expect(details.textContent).toContain('Power unresolved');
  expect(details.textContent).toContain('power_10001 / id_9');
  expect(details.textContent).toContain('Imbues (1)');
  expect(details.textContent).toContain('power_129 / id_120');
  await change('#my-items-rarity', 'Rare'); expect(container.querySelectorAll('[data-import-path]')).toHaveLength(0);
  await change('#my-items-rarity', ''); await change('#my-items-location', 'Inventory'); expect(container.querySelectorAll('[data-import-path]')).toHaveLength(1);
  await change('#my-items-search', ''); await change('#my-items-maximum', ''); await change('#my-items-location', ''); await change('#my-items-slot', 'OffHand');
  expect(container.querySelectorAll('[data-import-path]')).toHaveLength(2);
});

it('paginates a large collection without merging identical TypeIDs and selects the exact later instance', async () => {
  const report = JSON.parse(storageText) as { Items: Record<string, unknown>[] };
  const base = report.Items[0]!;
  report.Items = Array.from({ length: 23 }, (_, index) => ({ ...base, Name: `Bulk Fixture ${index}`, Level: 90 + index }));
  await importReports(JSON.stringify(report)); await browse();
  expect(container.querySelectorAll('[data-import-path]')).toHaveLength(10);
  expect(container.textContent).toContain('23 matching owned instances · Page 1 of 3');
  await button('Next'); expect(control('[data-import-path]').getAttribute('data-import-path')).toBe('/Items/10');
  await click('[data-import-path="/Items/11"] button'); await tick();
  const item = draft().equipment[0]!.item;
  expect(item.kind !== 'database' && item.instance.displayName).toBe('Bulk Fixture 11');
  expect(item.kind !== 'database' && item.instance.level).toBe(101);
});

it('persists selected imported gear including unresolved evidence, reopens details after refresh and clears with confirmation', async () => {
  await importReports(); await browse(); await click('[data-import-path="/Items/0"] button'); await tick();
  const saved = draft();
  expect(saved.schemaVersion).toBe(1); expect(saved.equipment[0]?.item.kind).toBe('imported');
  expect(JSON.stringify(saved)).toContain('FixtureUnresolvedPower'); expect(JSON.stringify(saved)).not.toContain('Fixture Tooth');
  await remount();
  expect(control<HTMLButtonElement>('.equipment-section > .section-heading button').disabled).toBe(true);
  await click('[data-equipment-row="MainHand"] > summary');
  expect(control('[data-equipment-row="MainHand"]').textContent).toContain('Actual level 91');
  expect(control('[data-equipment-row="MainHand"]').textContent).toContain('Exact source tier: 777');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('[data-equipment-row="MainHand"] .equipment-actions button:nth-child(2)'); await tick(); expect(draft()).toEqual(saved);
  confirm.mockReturnValue(true); await click('[data-equipment-row="MainHand"] .equipment-actions button:nth-child(2)'); await tick(); expect(draft().equipment).toEqual([]);
});

it('re-imports inventory without replacing the current loadout and confirms an explicit instance replacement', async () => {
  await importReports(); await browse(); await click('[data-import-path="/Items/0"] button'); await tick(); const saved = draft();
  await click('[aria-label="Close equipment picker"]');
  await button('Import Character'); await upload('#storage-file', storageText); await button('Replace My Items inventory'); await tick();
  expect(draft()).toEqual(saved);
  await browse(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await click('[data-import-path="/Items/1"] button'); await tick(); expect(draft()).toEqual(saved); expect(container.querySelector('dialog')).not.toBeNull();
  confirm.mockReturnValue(true); await click('[data-import-path="/Items/1"] button'); await tick();
  const item = draft().equipment[0]!.item; expect(item.kind !== 'database' && item.instance.level).toBe(100);
  expect(draft().equipment).toHaveLength(1);
});

it.each(['Character', 'ServerName'])('blocks mismatched %s reports and recovers without changing state', async key => {
  await button('Import Character'); await upload('#character-file', characterText);
  const other = JSON.parse(storageText) as Record<string, unknown>; other[key] = 'Different Fixture';
  await upload('#storage-file', JSON.stringify(other));
  expect(control('[role="alert"]').textContent).toContain('different');
  expect(control<HTMLButtonElement>('dialog .equipment-actions button').disabled).toBe(true);
  await upload('#storage-file', storageText); await button('Use these reports'); expect(container.querySelector('dialog')).toBeNull();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
});

it('recovers from invalid JSON, wrong report and file read errors without logging file contents', async () => {
  const log = vi.spyOn(console, 'log'); const error = vi.spyOn(console, 'error');
  await button('Import Character'); await upload('#character-file', '{ PRIVATE_SENTINEL');
  expect(control('[role="alert"]').textContent).toContain('invalid-json');
  expect(container.textContent).not.toContain('PRIVATE_SENTINEL');
  await upload('#character-file', storageText); expect(control('[role="alert"]').textContent).toContain('wrong-report-type');
  await upload('#character-file', '', () => Promise.reject(new Error('PRIVATE_SENTINEL'))); expect(control('[role="alert"]').textContent).toContain('could not be read locally');
  await upload('#character-file', characterText); await upload('#storage-file', storageText); await button('Use these reports');
  expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});

it('ignores an older asynchronous file read and keeps the most recently selected report', async () => {
  let finish!: (text: string) => void;
  await button('Import Character'); await upload('#character-file', '', () => new Promise(resolve => { finish = resolve; }));
  await upload('#character-file', characterText);
  await act(async () => { finish('{ invalid old file'); });
  expect(container.textContent).not.toContain('could not be imported');
  await upload('#storage-file', storageText); await button('Use these reports'); expect(container.querySelector('dialog')).toBeNull();
});

it('allows private import inspection while preserving a protected incompatible draft', async () => {
  const original = { ...createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }), schemaVersion: 2 };
  const bytes = JSON.stringify(original); localStorage.setItem(DRAFT_STORAGE_KEY, bytes); await remount();
  await importReports(); await browse();
  expect([...container.querySelectorAll<HTMLButtonElement>('[data-import-path] button')].every(button => button.disabled)).toBe(true);
  await tick(); expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
});

it('equips three slots, replaces only the exact twin and cancels/confirms unequip in one mounted general dialog', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  await importReports(); await browse();
  const dialog = control<HTMLDialogElement>('dialog');
  const search = control('#my-items-search');
  const action = (index: number) => `[data-import-path="/Items/${index}"] .equipment-result-heading button`;
  const row = (index: number) => control(`[data-import-path="/Items/${index}"]`);
  await click(action(0));
  expect(control('dialog')).toBe(dialog); expect(dialog.open).toBe(true);
  expect(row(0).querySelector('.owned-equipped')?.textContent).toBe('Equipped');
  expect(control(action(0)).textContent).toBe('Unequip');
  expect(control(action(1)).textContent).toBe('Replace');
  expect(row(1).querySelector('.owned-equipped')).toBeNull();
  await click(action(2)); await click(action(4)); await tick();
  expect(draft().equipment.map(entry => entry.slot)).toEqual(['MainHand', 'OffHandShield', 'Ring']);
  expect(container.querySelectorAll('.owned-equipped')).toHaveLength(3);
  expect(control('.equipment-section > .section-heading').textContent).toContain('3 selected');
  await click(action(1)); await tick();
  expect(row(0).querySelector('.owned-equipped')).toBeNull();
  expect(control(action(0)).textContent).toBe('Replace');
  expect(control(action(1)).textContent).toBe('Unequip');
  const before = draft();
  confirm.mockReturnValue(false); await click(action(2)); await tick();
  expect(draft()).toEqual(before); expect(control(action(2)).textContent).toBe('Unequip');
  confirm.mockReturnValue(true); await click(action(2)); await tick();
  expect(draft().equipment).toEqual([before.equipment[0], before.equipment[2]]);
  expect(control(action(2)).textContent).toBe('Equip');
  // Clearing index 1 shifts Ring's index. Its action must use the fresh build.
  await click(action(4)); await tick();
  expect(draft().equipment).toEqual([before.equipment[0]]);
  expect(control('dialog')).toBe(dialog); expect(control('#my-items-search')).toBe(search);
  expect(dialog.open).toBe(true);
});

it('preserves query, all filters, page and scroll through equip and unequip', async () => {
  const report = JSON.parse(storageText) as { Items: Record<string, unknown>[] };
  report.Items = Array.from({ length: 23 }, () => structuredClone(report.Items[0]!));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await importReports(JSON.stringify(report)); await browse();
  await change('#my-items-search', 'twin'); await change('#my-items-slot', 'MainHand');
  await change('#my-items-minimum', '90'); await change('#my-items-maximum', '100');
  await change('#my-items-rarity', 'Legendary'); await change('#my-items-location', 'Inventory');
  await button('Next');
  const dialog = control('dialog'); dialog.scrollTop = 350;
  const fields = [...dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')];
  const values = fields.map(field => field.value);
  await click('[data-import-path="/Items/11"] button');
  expect(control('dialog')).toBe(dialog); expect(dialog.scrollTop).toBe(350);
  expect(fields.map(field => field.value)).toEqual(values);
  expect(control('.equipment-results-title').textContent).toContain('Page 2 of 3');
  expect(container.querySelectorAll('[data-import-path]')).toHaveLength(10);
  expect(control('[data-import-path="/Items/10"] button').textContent).toBe('Replace');
  await click('[data-import-path="/Items/11"] button');
  expect(control('dialog')).toBe(dialog); expect(dialog.scrollTop).toBe(350);
  expect(fields.map(field => field.value)).toEqual(values);
  expect(control('.equipment-results-title').textContent).toContain('Page 2 of 3');
});

it('slot-specific owned selections still close and restore focus, and Unequip closes after confirmation', async () => {
  await importReports();
  await click('[data-equipment-row="MainHand"] > summary');
  await click('[aria-label="Browse MainHand items"]'); await button('My Items (6)');
  expect(control<HTMLSelectElement>('#my-items-slot').disabled).toBe(true);
  expect(container.querySelectorAll('[data-import-path]')).toHaveLength(2);
  await click('[data-import-path="/Items/0"] button');
  expect(container.querySelector('dialog')).toBeNull(); expect(document.activeElement).toBe(control('[data-equipment-row="MainHand"] > summary'));
  await click('[data-equipment-row="MainHand"] .equipment-actions button'); await button('My Items (6)');
  expect(control('[data-import-path="/Items/0"] button').textContent).toBe('Unequip');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await click('[data-import-path="/Items/0"] button'); await tick();
  expect(container.querySelector('dialog')).toBeNull(); expect(draft().equipment).toEqual([]);
  expect(document.activeElement).toBe(control('[data-equipment-row="MainHand"] > summary'));
});

it('recognizes the same report after autosave/refresh and working power edits, but rejects a newer report', async () => {
  await importReports(); await browse(); await click('[data-import-path="/Items/0"] button'); await tick();
  const saved = draft();
  const changed = editBuild(saved, { type: 'existing-mod-remove', equipmentIndex: 0, index: 0 }, data);
  expect(changed).not.toBe(saved);
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(changed)); await remount();
  await importReports(); await browse();
  expect(control('[data-import-path="/Items/0"] button').textContent).toBe('Unequip');
  expect(control('[data-import-path="/Items/1"] button').textContent).toBe('Replace');
  await click('[aria-label="Close equipment picker"]');
  const newer = JSON.parse(storageText) as Record<string, unknown>; newer.Timestamp = '2026-11-02T12:01:00Z';
  await button('Import Character'); await upload('#storage-file', JSON.stringify(newer)); await button('Replace My Items inventory'); await browse();
  expect(container.querySelectorAll('.owned-equipped')).toHaveLength(0);
  expect(control('[data-import-path="/Items/0"] button').textContent).toBe('Replace');
  expect(draft()).toEqual(changed);
});

it('retains candidates and Sparks on offhand replacement and protects them on removal', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await importReports(); await browse(); await click('[data-import-path="/Items/2"] button'); await tick();
  const saved = draft(); saved.equipment[0]!.candidateMods = [{ powerId: 'power_129', tierId: 'id_120' }];
  saved.equipment[0]!.sparks = { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 7, seed: 'keep' } };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(saved)); await remount(); await importReports(); await browse();
  expect(control('[data-import-path="/Items/3"] button').textContent).toBe('Replace');
  await click('[data-import-path="/Items/3"] button'); await tick();
  expect(draft().equipment).toHaveLength(1); expect(draft().equipment[0]?.slot).toBe('OffHand');
  expect(draft().equipment[0]?.candidateMods).toEqual(saved.equipment[0]?.candidateMods);
  expect(draft().equipment[0]?.sparks).toEqual(saved.equipment[0]?.sparks);
  expect(control('[data-import-path="/Items/2"] button').textContent).toBe('Replace');
  expect(control('dialog')).toBeTruthy();
  const confirm = vi.mocked(window.confirm); confirm.mockReturnValue(false);
  const before = draft(); await click('[data-import-path="/Items/3"] button'); await tick(); expect(draft()).toEqual(before);
  confirm.mockReturnValue(true); await click('[data-import-path="/Items/3"] button'); await tick(); expect(draft().equipment).toEqual([]);
});

it('allows inspection but disables Equipped/Unequip and Replace in a read-only snapshot', async () => {
  await importReports(); await browse(); await click('[data-import-path="/Items/0"] button'); await tick();
  const saved = { ...draft(), gameDataVersion: 'other-snapshot' };
  const bytes = JSON.stringify(saved); localStorage.setItem(DRAFT_STORAGE_KEY, bytes); await remount();
  await importReports(); await browse();
  expect(control('[data-import-path="/Items/0"] button').textContent).toBe('Unequip');
  expect([...container.querySelectorAll<HTMLButtonElement>('[data-import-path] button')].every(button => button.disabled)).toBe(true);
  await click('[data-import-path="/Items/0"] button'); await tick();
  expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(bytes);
});

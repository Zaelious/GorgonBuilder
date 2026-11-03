import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultBuildDocument, type BuildDocument, type EquipmentSelection } from '../../core/build/document';
import { sameLoadoutPosition } from '../../core/build/slots';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { ImportedItemDetails } from '../import/ImportedItemDetails';
import { restoredImportedItem } from '../import/inventory';
vi.mock('../../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));

let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement;
let root: Root;
beforeAll(() => { data = loadPlannerFixture(); });
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear();
  vi.mocked(loadGameDataRepository).mockReset().mockResolvedValue(data);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });

const SHIELD = 'item_45052'; // official EquipSlot OffHandShield
const PUBLISHED_SLOT = 'Published slot is';
const SOURCE_SLOT = 'differs from official base slot';

/** A CharacterSheet/Storage export that reports a shield in the player's OffHand position. */
function importedShield(sourceSlot: string): EquipmentSelection {
  return { slot: sourceSlot, candidateMods: [], sparks: { mode: 'none' }, item: { kind: 'imported', instance: {
    baseItemId: SHIELD, displayName: 'Fixture Shield', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }],
    provenance: { reference: 'project-gorgon-storage', exportedAt: '2026-11-01T12:01:00Z', reportVersion: '1', metadata: { characterName: 'Fixture Adventurer' } },
    metadata: { sourceItem: { TypeID: 45052, Name: 'Fixture Shield', Slot: sourceSlot, Level: 80, Rarity: 'Rare', IsInInventory: true, TSysPowers: [{ Power: 'power_129', Tier: 120 }] } },
  } } };
}
async function renderBuild(equipment: EquipmentSelection[]) {
  const build: BuildDocument = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.equipment = equipment;
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(build));
  await act(async () => root.render(<App />));
  return build;
}
async function openRow(slot: string) {
  const row = container.querySelector<HTMLDetailsElement>(`[data-equipment-row="${slot}"]`)!;
  if (!row.open) await act(async () => row.querySelector<HTMLElement>(':scope > summary')!.click());
  return row;
}

it('treats only OffHand and OffHandShield as the same loadout position', () => {
  expect(sameLoadoutPosition('OffHand', 'OffHandShield')).toBe(true);
  expect(sameLoadoutPosition('OffHandShield', 'OffHand')).toBe(true);
  expect(sameLoadoutPosition('Head', 'Head')).toBe(true);
  expect(sameLoadoutPosition('MainHand', 'OffHand')).toBe(false);
  expect(sameLoadoutPosition('Head', 'OffHandShield')).toBe(false);
});

it('hides benign OffHand/OffHandShield warnings for database and imported shields, including historical details and after refresh', async () => {
  const saved = await renderBuild([importedShield('OffHand')]);
  const row = await openRow('OffHand');
  expect(row.textContent).toContain('Fixture Shield');
  expect(row.textContent).not.toContain(PUBLISHED_SLOT);
  expect(row.textContent).not.toContain(SOURCE_SLOT);
  // Historical original-item details are still rendered with their exact source slot.
  expect(row.textContent).toContain('Original imported item');
  // Refresh (remount from the saved draft): still no warning; exact slots unchanged in persistence.
  await act(async () => root.unmount()); root = createRoot(container);
  await act(async () => root.render(<App />));
  expect((await openRow('OffHand')).textContent).not.toMatch(/Published slot is|differs from official base slot/u);
  expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!).equipment[0].slot).toBe('OffHand');
  expect(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!)).toEqual(saved);

  // A database shield saved in the OffHand position (legacy/imported placement).
  await act(async () => root.unmount()); root = createRoot(container);
  await renderBuild([{ slot: 'OffHand', item: { kind: 'database', itemId: SHIELD }, candidateMods: [], sparks: { mode: 'none' } }]);
  expect((await openRow('OffHand')).textContent).not.toContain(PUBLISHED_SLOT);
});

it('keeps the imported source item details free of the benign warning in My Items-style rendering', async () => {
  const instance = importedShield('OffHand').item;
  if (instance.kind !== 'imported') throw new Error('fixture');
  const item = restoredImportedItem(instance.instance, data)!;
  expect(item.slot).toBe('OffHand');
  expect(data.getItem(SHIELD)!.slot).toBe('OffHandShield');
  await act(async () => root.render(<ImportedItemDetails item={item} data={data} />));
  expect(container.textContent).not.toContain(SOURCE_SLOT);
  expect(container.textContent).toContain('OffHand');
});

it('still warns for genuinely incompatible slots and keeps the legacy double-offhand conflict', async () => {
  await renderBuild([
    { slot: 'Head', item: { kind: 'database', itemId: SHIELD }, candidateMods: [], sparks: { mode: 'none' } },
    importedShield('MainHand'),
  ]);
  expect((await openRow('Head')).textContent).toContain('Published slot is OffHandShield; saved slot Head is retained.');
  const main = await openRow('MainHand');
  expect(main.textContent).toContain('Published slot is OffHandShield; saved slot MainHand is retained.');
  expect(main.textContent).toContain('Source slot MainHand differs from official base slot OffHandShield; source slot retained.');

  await act(async () => root.unmount()); root = createRoot(container);
  await renderBuild([importedShield('OffHand'), { slot: 'OffHandShield', item: { kind: 'database', itemId: SHIELD }, candidateMods: [], sparks: { mode: 'none' } }]);
  const offhand = await openRow('OffHand');
  expect(offhand.textContent).toContain('This saved build has multiple offhand items sharing one position.');
  expect(offhand.textContent).not.toMatch(/Published slot is|differs from official base slot/u);
});

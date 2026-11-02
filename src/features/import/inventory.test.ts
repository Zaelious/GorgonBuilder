// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCharacterSheetJson, parseStorage, parseStorageJson } from '../../core/import';
import type { ImportResult, ImportedStorageSnapshot } from '../../core/import';
import { createDefaultBuildDocument } from '../../core/build/document';
import { deserializeBuildDocument, serializeBuildDocument } from '../../core/build/validation';
import { editBuild } from '../../app/editor/build-editor';
import { createLocalPersistence } from '../../persistence/local/storage';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { filterImportedItems, identityMismatch, importedSlot, inventoryDiagnostics, restoredImportedItem, selectedImportedInstance, type ImportSession, type InventoryFilters } from './inventory';

let data: ReturnType<typeof loadPlannerFixture>;
let session: ImportSession;
const storageText = readFileSync(new URL('./fixtures/storage.json', import.meta.url), 'utf8');
const characterText = readFileSync(new URL('../../core/import/fixtures/character-sheet.json', import.meta.url), 'utf8');
function storage(result: ImportResult<ImportedStorageSnapshot>) { if (!result.ok) throw new Error('Invalid fixture'); return result.value; }
beforeAll(() => {
  data = loadPlannerFixture();
  const resolver = createImportReferenceResolver(data);
  const character = parseCharacterSheetJson(characterText, resolver);
  if (!character.ok) throw new Error('Invalid character fixture');
  session = { character: character.value, storage: storage(parseStorageJson(storageText, resolver)), warnings: [] };
});
const filters = (patch: Partial<InventoryFilters> = {}): InventoryFilters => ({ query: '', slot: '', minimum: null, maximum: null, rarity: '', location: '', ...patch });

it('counts every source entry and exact owning power/tier without collapsing duplicate base items', () => {
  expect(inventoryDiagnostics(session, data)).toMatchObject({ 'Parsed items': 6, 'Equipment instances': 5,
    'Resolved item IDs': 5, 'Unresolved item IDs': 1, 'Resolved skills': 1, 'Unresolved skills': 1,
    'Resolved abilities': 2, 'Unresolved abilities': 1, 'Recognized treasure powers': 5,
    'Exact treasure power/tier pairs': 3, 'Unresolved or unverified treasure tiers': 3,
    'Recognized exact imbues': 1 });
  const blades = filterImportedItems(session.storage.items, filters({ query: 'twin FIXTURE' }), data);
  expect(blades).toHaveLength(2);
  expect(blades.map(item => item.sourcePath)).toEqual(['/Items/0', '/Items/1']);
  expect(blades[0]?.existingPowers).not.toEqual(blades[1]?.existingPowers);
});

it.each([
  [{}, 5], [{ slot: 'MainHand' }, 2], [{ slot: 'OffHand' }, 2],
  [{ minimum: 92 }, 2], [{ maximum: 91 }, 2], [{ minimum: 92, maximum: 99 }, 1],
  [{ query: 'unknown' }, 1], [{ rarity: 'Legendary' }, 2], [{ location: 'Fixture Vault' }, 2],
  [{ location: 'Inventory' }, 2], [{ query: 'TOOTH' }, 0],
  [{ minimum: 101 }, 0], [{ minimum: 100, maximum: 90 }, 0],
] as const)('filters owned equipment by actual fields %j', (patch, count) => {
  expect(filterImportedItems(session.storage.items, filters(patch), data)).toHaveLength(count);
});

it('uses published source slots, leaves unknown levels unknown and never uses CraftingTargetLevel', () => {
  const blade = session.storage.items[0]!;
  expect(blade.level).toBe(91); expect(data.getItem(blade.baseItemId!)?.level).toBe(90);
  expect(filterImportedItems([blade], filters({ minimum: 91, maximum: 91 }), data)).toHaveLength(1);
  expect(filterImportedItems([session.storage.items[4]!], filters({ minimum: 0 }), data)).toEqual([]);
  expect(importedSlot(session.storage.items[5]!, data)).toBeNull();
});

it('rejects mismatched character/server pairs and permits missing server information without guessing it', () => {
  expect(identityMismatch(session.character, session.storage)).toBeNull();
  const different = structuredClone(session.storage);
  different.source.characterName = 'Another Fixture';
  expect(identityMismatch(session.character, different)).toContain('different characters');
  different.source.characterName = session.character.source.characterName; different.source.server = 'Another Server';
  expect(identityMismatch(session.character, different)).toContain('different servers');
  different.source.server = null;
  expect(identityMismatch(session.character, different)).toBeNull();
});

it('projects only one selected item and necessary provenance into the existing schema', () => {
  const raw = JSON.parse(storageText) as Record<string, unknown>;
  raw.PrivateReportMetadata = 'DO_NOT_PERSIST_THE_REPORT';
  const parsed = storage(parseStorage(raw, createImportReferenceResolver(data)));
  const instance = selectedImportedInstance(parsed.items[0]!);
  expect(JSON.stringify(instance)).not.toContain('DO_NOT_PERSIST_THE_REPORT');
  expect(JSON.stringify(instance)).not.toContain('Fixture Tooth');
  expect(instance.metadata?.sourceItem).toEqual(parsed.items[0]!.metadata);
  expect(instance.provenance).toMatchObject({ exportedAt: parsed.source.exportedAt, reportVersion: '1' });
  expect(instance.existingPowers).toEqual([{ powerId: 'power_10001', tierId: 'id_9' }]);
  expect(restoredImportedItem(instance, data)?.treasurePowers).toEqual(parsed.items[0]?.treasurePowers);
  parsed.items[0]!.metadata.CraftPoints = 0;
  expect(restoredImportedItem(instance, data)?.metadata.CraftPoints).toBe(110);
});

it('equips, persists, restores, replaces and clears an owned instance while retaining unrelated build state', () => {
  const original = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  original.skillSlotA = { skillId: 'Psychology', level: 90 }; original.abilityBarA = [{ abilityId: 'ability_1201', rank: null }];
  original.equipment = [{ slot: 'MainHand', item: { kind: 'database', itemId: 'item_45640' }, candidateMods: [{ powerId: 'power_129', tierId: 'id_120' }],
    sparks: { mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 7, seed: 'retain' } } },
  { slot: 'Ring', item: { kind: 'database', itemId: 'item_49070' }, candidateMods: [], sparks: { mode: 'none' } }];
  const instance = selectedImportedInstance(session.storage.items[0]!);
  const edited = editBuild(original, { type: 'equipment-import', slot: 'MainHand', index: 0, instance }, data);
  expect(edited.equipment[0]).toEqual({ ...original.equipment[0], item: { kind: 'imported', instance } });
  expect(edited.equipment[1]).toBe(original.equipment[1]); expect(edited.abilityBarA).toBe(original.abilityBarA);
  expect(edited.skillSlotA).toBe(original.skillSlotA);
  const memory = new Map<string, string>();
  const persistence = createLocalPersistence({ gameDataVersion: data.gameDataVersion, storage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } } });
  expect(persistence.saveDraft(edited)).toEqual({ ok: true }); expect(persistence.restoreDraft().value).toEqual(edited);
  const json = serializeBuildDocument(edited); if (!json.ok) throw new Error('Invalid selected instance');
  expect(deserializeBuildDocument(json.value)).toEqual({ ok: true, value: edited });
  const replaced = editBuild(edited, { type: 'equipment-import', slot: 'MainHand', index: 0, instance: selectedImportedInstance(session.storage.items[1]!) }, data);
  expect(replaced.equipment[0]?.item).not.toEqual(edited.equipment[0]?.item);
  expect(replaced.equipment[0]?.sparks).toEqual(original.equipment[0]?.sparks);
  expect(editBuild(replaced, { type: 'equipment-clear', index: 0 }, data).equipment).toEqual([original.equipment[1]]);
});

it('enforces offhand exclusivity and refuses implicit replacement or conflict cleanup', () => {
  const original = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  const shield = selectedImportedInstance(session.storage.items[2]!);
  const equipped = editBuild(original, { type: 'equipment-import', slot: 'OffHandShield', index: null, instance: shield }, data);
  const dirk = selectedImportedInstance(session.storage.items[3]!);
  expect(editBuild(equipped, { type: 'equipment-import', slot: 'OffHand', index: null, instance: dirk }, data)).toBe(equipped);
  const swapped = editBuild(equipped, { type: 'equipment-import', slot: 'OffHand', index: 0, instance: dirk }, data);
  expect(swapped.equipment).toHaveLength(1); expect(swapped.equipment[0]?.slot).toBe('OffHand');
  const conflict = { ...equipped, equipment: [...equipped.equipment, ...swapped.equipment] };
  expect(editBuild(conflict, { type: 'equipment-import', slot: 'OffHand', index: 0, instance: dirk }, data)).toBe(conflict);
  expect(editBuild({ ...original, gameDataVersion: 'other' }, { type: 'equipment-import', slot: 'Ring', index: null, instance: shield }, data).equipment).toEqual([]);
});

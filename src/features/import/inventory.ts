import type { ItemInstance } from '../../core/build/document';
import type { ImportIssue, ImportedCharacterSnapshot, ImportedItemInstance, ImportedStorageSnapshot } from '../../core/import';
import { parseStorage } from '../../core/import';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import type { GameDataRepository } from '../../data/repository/repository';

export interface ImportSession {
  character: ImportedCharacterSnapshot;
  storage: ImportedStorageSnapshot;
  warnings: ImportIssue[];
}

export function identityMismatch(character: ImportedCharacterSnapshot, storage: ImportedStorageSnapshot): string | null {
  if (character.source.characterName !== storage.source.characterName) return 'The reports belong to different characters. Choose matching files.';
  if (character.source.server && storage.source.server && character.source.server !== storage.source.server) return 'The reports belong to different servers. Choose matching files.';
  return null;
}

/** Source slot first; a resolved official equipment definition is a fallback only. */
export function importedSlot(item: ImportedItemInstance, data: GameDataRepository): string | null {
  return item.slot?.trim() ? item.slot : data.getItem(item.baseItemId ?? '')?.slot ?? null;
}

export function itemLocation(item: ImportedItemInstance): string {
  const { isInInventory, storageVault } = item.location;
  if (isInInventory === true && storageVault) return `Inventory · ${storageVault}`;
  return storageVault ?? (isInInventory === true ? 'Inventory' : 'Unknown location');
}

export interface InventoryFilters {
  query: string; slot: string; minimum: number | null; maximum: number | null;
  rarity: string; location: string;
}

export function filterImportedItems(items: readonly ImportedItemInstance[], filters: InventoryFilters, data: GameDataRepository) {
  const query = filters.query.normalize('NFKC').toLowerCase().trim();
  return items.filter(item => {
    const slot = importedSlot(item, data);
    if (!slot) return false;
    if (filters.slot && (filters.slot === 'OffHand' ? !['OffHand', 'OffHandShield'].includes(slot) : slot !== filters.slot)) return false;
    if (query && !`${item.displayName ?? ''} ${item.originalTypeId}`.normalize('NFKC').toLowerCase().includes(query)) return false;
    // Unknown actual levels are never substituted with the base crafting target.
    if (filters.minimum !== null && (item.level === undefined || item.level < filters.minimum)) return false;
    if (filters.maximum !== null && (item.level === undefined || item.level > filters.maximum)) return false;
    if (filters.rarity && (item.rarity ?? 'Unknown rarity') !== filters.rarity) return false;
    return !filters.location || itemLocation(item) === filters.location;
  });
}

/** Persist one selected instance using schema v1. Never attach the report body. */
export function selectedImportedInstance(item: ImportedItemInstance): ItemInstance {
  return {
    baseItemId: item.baseItemId,
    ...(item.instanceId === undefined ? {} : { instanceId: item.instanceId }),
    ...(item.displayName === undefined ? {} : { displayName: item.displayName }),
    ...(item.level === undefined ? {} : { level: item.level }),
    ...(item.rarity === undefined ? {} : { rarity: item.rarity }),
    existingPowers: item.existingPowers.map(power => ({ ...power })),
    provenance: {
      reference: 'project-gorgon-storage', exportedAt: item.provenance.exportedAt,
      reportVersion: item.provenance.reportVersion,
      metadata: { characterName: item.provenance.characterName, server: item.provenance.server,
        sourcePath: item.sourcePath, gameDataVersion: item.provenance.resolvedWithGameDataVersion },
    },
    // Full selected source item preserves unknown powers/tiers/imbues/crafting.
    metadata: { sourceItem: structuredClone(item.metadata) },
  };
}

/** Reuse the importer to inspect selected source evidence after a refresh. */
export function restoredImportedItem(instance: ItemInstance, data: GameDataRepository): ImportedItemInstance | null {
  if (instance.provenance?.reference !== 'project-gorgon-storage' || !instance.metadata?.sourceItem) return null;
  const source = instance.provenance;
  const result = parseStorage({ Report: 'Storage', ReportVersion: source.reportVersion ?? 'unknown',
    Character: typeof source.metadata?.characterName === 'string' ? source.metadata.characterName : 'Imported character',
    Timestamp: source.exportedAt ?? 'Unknown', Items: [instance.metadata.sourceItem] }, createImportReferenceResolver(data));
  return result.ok ? result.value.items[0] ?? null : null;
}

export function inventoryDiagnostics(session: ImportSession, data: GameDataRepository) {
  const { character, storage } = session;
  const powers = storage.items.flatMap(item => item.treasurePowers);
  const treasure = powers.filter(power => power.kind === 'treasure');
  const imbues = powers.filter(power => power.kind === 'imbue');
  const resolvedSkills = character.skills.filter(skill => skill.reference.status === 'resolved').length;
  const resolvedAbilities = character.knownAbilities.filter(ref => ref.status === 'resolved').length;
  const resolvedItems = storage.items.filter(item => item.baseItemReference.status === 'resolved').length;
  return {
    'Parsed items': storage.items.length,
    'Equipment instances': storage.items.filter(item => importedSlot(item, data)).length,
    'Resolved item IDs': resolvedItems, 'Unresolved item IDs': storage.items.length - resolvedItems,
    'Resolved skills': resolvedSkills, 'Unresolved skills': character.skills.length - resolvedSkills,
    'Resolved abilities': resolvedAbilities, 'Unresolved abilities': character.knownAbilities.length - resolvedAbilities,
    'Recognized treasure powers': treasure.filter(power => power.power?.status === 'resolved').length,
    'Exact treasure power/tier pairs': treasure.filter(power => power.selection).length,
    'Unresolved or unverified treasure tiers': treasure.filter(power => !power.selection).length,
    'Imbue entries': imbues.length,
    'Recognized exact imbues': imbues.filter(power => power.selection).length,
    'Unresolved or unverified imbues': imbues.filter(power => !power.selection).length,
  };
}

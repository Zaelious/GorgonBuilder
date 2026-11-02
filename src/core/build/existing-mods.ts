import type { EquipmentSelection, ItemInstance, TreasureTierSelection } from './document';
import type { GameDataRepository } from '../../data/repository/repository';
import { createImportReferenceResolver } from '../../data/adapters/import-references';
import { parseStorage } from '../import/storage';

export type ExistingModEdit = { equipmentIndex: number } & (
  | { type: 'existing-mod-remove'; index: number }
  | { type: 'existing-mod-tier'; index: number; tierId: string }
  | { type: 'existing-mod-restore' }
);

/** Historical source only. Never read by effective STATS/Selected or future aggregation. */
export function originalImportedPowers(instance: ItemInstance, data: GameDataRepository): TreasureTierSelection[] | null {
  if (instance.provenance?.reference === 'project-gorgon-storage' && instance.metadata?.sourceItem) {
    const result = parseStorage({ Report: 'Storage', ReportVersion: instance.provenance.reportVersion ?? 'unknown',
      Character: 'Imported character', Timestamp: instance.provenance.exportedAt ?? 'Unknown',
      Items: [instance.metadata.sourceItem] }, createImportReferenceResolver(data));
    if (result.ok) return result.value.items[0]?.existingPowers ?? null;
  }
  // Older imported instances can lack report evidence. This is explicitly an
  // initial working baseline, not a fabricated Storage report or source item.
  const baseline = instance.metadata?.originalWorkingPowers;
  if (!Array.isArray(baseline)) return null;
  const pairs: TreasureTierSelection[] = [];
  for (const row of baseline) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.powerId !== 'string' || typeof row.tierId !== 'string') return null;
    const pair = { powerId: row.powerId, tierId: row.tierId };
    if (isResolvedExistingPower(pair, data)) pairs.push(pair);
  }
  return pairs;
}

/** Exact pairs only. Unknown saved pairs are retained but are not presented as editable mappings. */
export function isResolvedExistingPower(mod: TreasureTierSelection, data: GameDataRepository): boolean {
  return Boolean(data.getTreasurePower(mod.powerId) && data.getTreasureTier(mod.powerId, mod.tierId));
}

export function restoredExistingPowers(instance: ItemInstance, data: GameDataRepository): TreasureTierSelection[] | null {
  const original = originalImportedPowers(instance, data);
  // Legacy unresolved working pairs have no safe inferred replacement. Keep them as well.
  return original && [...original, ...instance.existingPowers.filter(mod => !isResolvedExistingPower(mod, data))];
}

export function sameExistingPowers(a: readonly TreasureTierSelection[], b: readonly TreasureTierSelection[]): boolean {
  return a.length === b.length && a.every((mod, index) => mod.powerId === b[index]?.powerId && mod.tierId === b[index]?.tierId);
}

/** Immutable working-copy edits; metadata/source evidence, candidates and Sparks are untouched. */
export function editExistingMods(selection: EquipmentSelection, edit: ExistingModEdit, data: GameDataRepository): EquipmentSelection {
  if (selection.item.kind !== 'imported') return selection;
  const instance = selection.item.instance;
  let existingPowers: TreasureTierSelection[];
  if (edit.type === 'existing-mod-restore') {
    const restored = restoredExistingPowers(instance, data);
    if (!restored || sameExistingPowers(restored, instance.existingPowers)) return selection;
    existingPowers = restored.map(mod => ({ ...mod }));
  } else {
    const mod = instance.existingPowers[edit.index];
    if (!Number.isInteger(edit.index) || !mod || !isResolvedExistingPower(mod, data)) return selection;
    if (edit.type === 'existing-mod-remove') existingPowers = instance.existingPowers.filter((_, index) => index !== edit.index);
    else {
      if (edit.tierId === mod.tierId || !data.getTreasureTier(mod.powerId, edit.tierId)) return selection;
      existingPowers = instance.existingPowers.map((row, index) => index === edit.index ? { ...row, tierId: edit.tierId } : row);
    }
  }
  const metadata = originalImportedPowers(instance, data) === null
    ? { ...instance.metadata, originalWorkingPowers: instance.existingPowers.map(mod => ({ ...mod })) }
    : instance.metadata;
  return { ...selection, item: { ...selection.item, instance: { ...instance, existingPowers, ...(metadata === undefined ? {} : { metadata }) } } };
}

import type { BuildDocument, ItemInstance } from '../../core/build/document';

/** Allowlist: retain mechanics, discard every report/provenance/extension field and private notes.
 * Used for every non-owner read AND foreign copy, including signed-in readers.
 * Free-form titles/descriptions are intentionally public author text.
 */
export function publicDocument(source: BuildDocument): BuildDocument {
  const instance = (value: ItemInstance): ItemInstance => ({
    baseItemId: value.baseItemId,
    existingPowers: structuredClone(value.existingPowers),
    ...(value.level === undefined ? {} : { level: value.level }),
    // rarity/displayName are arbitrary imported text, not calculation inputs.
  });
  return {
    schemaVersion: 1, gameDataVersion: source.gameDataVersion,
    title: source.title, notes: '',
    skillSlotA: { ...source.skillSlotA }, skillSlotB: { ...source.skillSlotB },
    abilityBarA: structuredClone(source.abilityBarA), abilityBarB: structuredClone(source.abilityBarB),
    equipment: source.equipment.map(entry => ({
      slot: entry.slot,
      item: entry.item.kind === 'database' ? { kind: 'database', itemId: entry.item.itemId }
        : { kind: 'manual', instance: instance(entry.item.instance) },
      candidateMods: structuredClone(entry.candidateMods), sparks: structuredClone(entry.sparks),
    })),
    target: {
      count: source.target.count,
      damageTypes: Object.fromEntries(Object.entries(source.target.damageTypes).map(([key, value]) => [key, {
        ...(value.resistance === undefined ? {} : { resistance: value.resistance }),
        ...(value.vulnerability === undefined ? {} : { vulnerability: value.vulnerability }),
      }])),
      // Scenario-only critical/Stampede inputs live outside BuildDocument.
      // Arbitrary target extension metadata is private.
    },
  };
}

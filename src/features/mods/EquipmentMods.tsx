import { useMemo } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import type { EquipmentDefinition } from '../../data/search/equipment';
import { ModPlanner } from './ModPlanner';

/** Sparks note and the inline Available | Selected editor; effects are shown by ItemStats. */
export function EquipmentMods({ selection, equipmentIndex, item, skillIds, data, onEdit, readOnly, expanded }: {
  selection: EquipmentSelection; equipmentIndex: number; item: EquipmentDefinition | undefined; skillIds: readonly string[];
  data: GameDataRepository; onEdit: (edit: CandidateModEdit) => void; readOnly: boolean; expanded: boolean;
}) {
  const context = useMemo(() => ({ item, skillIds }), [item, skillIds]);
  return <div className="equipment-mods">
    {selection.sparks.mode !== 'none' && <p className="muted">Spark settings: {selection.sparks.mode}</p>}
    {expanded && <ModPlanner selection={selection} equipmentIndex={equipmentIndex} context={context} data={data} onEdit={onEdit} readOnly={readOnly} />}
  </div>;
}

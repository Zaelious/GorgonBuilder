import { useMemo } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { ExistingModEdit } from '../../core/build/existing-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import type { EquipmentDefinition } from '../../data/search/equipment';
import type { ModBrowserState } from './ModBrowserControls';
import type { indexTreasurePowers } from '../../data/search/treasure';
import type { AvailableMods, PreparedModSearch } from '../../data/search/available-mods';
import { ModPlanner } from './ModPlanner';

/** Sparks note and the inline Available | Selected editor; effects are shown by ItemStats. */
export function EquipmentMods({ selection, equipmentIndex, item, skillIds, skillA, skillB, data, onEdit, readOnly, expanded, browser, available, searchIndex, preparedSearch }: {
  selection: EquipmentSelection; equipmentIndex: number; item: EquipmentDefinition | undefined; skillIds: readonly string[];
  skillA: string | null; skillB: string | null;
  data: GameDataRepository; onEdit: (edit: CandidateModEdit | ExistingModEdit) => void; readOnly: boolean; expanded: boolean; browser: ModBrowserState; available?: AvailableMods; searchIndex?: ReturnType<typeof indexTreasurePowers>; preparedSearch?: PreparedModSearch;
}) {
  const context = useMemo(() => ({ item, skillIds }), [item, skillIds]);
  return <div className="equipment-mods">
    {selection.sparks.mode !== 'none' && <p className="muted">Spark settings: {selection.sparks.mode}</p>}
    {expanded && <ModPlanner searchIndex={searchIndex} preparedSearch={preparedSearch} available={available} browser={browser} selection={selection} equipmentIndex={equipmentIndex} context={context} skillA={skillA} skillB={skillB} data={data} onEdit={onEdit} readOnly={readOnly} />}
  </div>;
}

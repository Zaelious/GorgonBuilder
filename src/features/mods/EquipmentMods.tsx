import { useMemo, useState } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import type { EquipmentDefinition } from '../../data/search/equipment';
import { CandidateList } from './CandidateList';
import { ModPlanner } from './ModPlanner';
import { SavedPower } from './PowerFacts';

/** On-demand editing keeps expanded equipment facts compact. */
export function EquipmentMods({ selection, equipmentIndex, item, skillIds, data, onEdit, readOnly }: {
  selection: EquipmentSelection; equipmentIndex: number; item: EquipmentDefinition | undefined; skillIds: readonly string[];
  data: GameDataRepository; onEdit: (edit: CandidateModEdit) => void; readOnly: boolean;
}) {
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const context = useMemo(() => ({ item, skillIds }), [item, skillIds]);
  const existing = selection.item.kind === 'database' ? [] : selection.item.instance.existingPowers;
  return <div className="equipment-mods">
    {existing.length > 0 && <details className="mod-more existing-powers"><summary>Existing instance powers ({existing.length})</summary>
      <p className="muted">Saved imported/manual powers; candidate edits leave these unchanged.</p>
      <ul>{existing.map((mod, index) => <li key={index}><SavedPower mod={mod} data={data} existing /></li>)}</ul>
    </details>}
    <div className="mod-actions"><button type="button" onClick={event => setOpener(event.currentTarget)} aria-label={`Plan candidate mods for equipment ${equipmentIndex + 1}`}>Plan candidate mods ({selection.candidateMods.length})</button>
      {selection.sparks.mode !== 'none' && <span className="muted">Spark settings: {selection.sparks.mode}</span>}
    </div>
    {selection.candidateMods.length > 0 && <details className="mod-more equipment-candidates"><summary>Staged candidates ({selection.candidateMods.length})</summary>
      <CandidateList mods={selection.candidateMods} data={data} equipmentIndex={equipmentIndex} onEdit={onEdit} readOnly={readOnly} />
    </details>}
    {opener && <ModPlanner selection={selection} equipmentIndex={equipmentIndex} context={context} data={data} onEdit={onEdit} readOnly={readOnly} returnFocus={opener} onClose={() => setOpener(null)} />}
  </div>;
}

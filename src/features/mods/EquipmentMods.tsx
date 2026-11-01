import { useMemo } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import type { EquipmentDefinition } from '../../data/search/equipment';
import { treasureCategoryLabel } from '../../data/search/treasure-planning';
import { ModPlanner } from './ModPlanner';
import { SavedPower } from './PowerFacts';

export function EquipmentMods({ selection, equipmentIndex, item, skillIds, data, onEdit, readOnly, expanded }: {
  selection: EquipmentSelection; equipmentIndex: number; item: EquipmentDefinition | undefined; skillIds: readonly string[];
  data: GameDataRepository; onEdit: (edit: CandidateModEdit) => void; readOnly: boolean; expanded: boolean;
}) {
  const context = useMemo(() => ({ item, skillIds }), [item, skillIds]);
  const existing = selection.item.kind === 'database' ? [] : selection.item.instance.existingPowers;
  return <div className="equipment-mods">
    {existing.length > 0 && <div className="existing-powers"><p className="mod-source-label">EXISTING · Saved instance powers</p>
      <ul>{existing.map((mod, index) => <li key={index}><SavedPower mod={mod} data={data} existing /></li>)}</ul>
    </div>}
    {selection.candidateMods.length > 0 && <ul className="equipment-candidate-effects" aria-label="Candidate item effects">{selection.candidateMods.map((mod, index) => {
      const power = data.getTreasurePower(mod.powerId);
      const tier = mod.tierId === null ? undefined : data.getTreasureTier(mod.powerId, mod.tierId);
      return <li key={index} data-candidate-effect={index}><span className="mod-source-label">CANDIDATE · {power ? treasureCategoryLabel(power, data) : 'Unknown association'}</span>
        <span>{tier ? tier.effectDescriptions.join(' · ') : `${mod.powerId} · ${mod.tierId === null ? 'No tier chosen' : `Tier ${mod.tierId} unavailable (retained)`}`}</span></li>;
    })}</ul>}
    {selection.sparks.mode !== 'none' && <p className="muted">Spark settings: {selection.sparks.mode}</p>}
    {expanded && <ModPlanner selection={selection} equipmentIndex={equipmentIndex} context={context} data={data} onEdit={onEdit} readOnly={readOnly} />}
  </div>;
}

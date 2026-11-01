import { useRef } from 'react';
import type { CandidateMod } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import { candidateTargetMismatch, treasureCategoryLabel, type ModTargetLevel } from '../../data/search/treasure-planning';
import { SavedPower, TierSelect } from './PowerFacts';

export function CandidateList({ mods, data, equipmentIndex, onEdit, readOnly, target }: {
  mods: CandidateMod[]; data: GameDataRepository; equipmentIndex: number; onEdit: (edit: CandidateModEdit) => void; readOnly: boolean; target: ModTargetLevel;
}) {
  const list = useRef<HTMLOListElement>(null);
  function focusRow(index: number) {
    requestAnimationFrame(() => {
      const element = list.current;
      if (!element) return;
      const rows = element.querySelectorAll<HTMLElement>(':scope > [data-mod-index]');
      const target = rows[Math.min(index, rows.length - 1)] ?? element;
      target.focus();
    });
  }
  return <ol className="candidate-list" ref={list} tabIndex={-1} aria-label="Staged candidate mods">
    {mods.length === 0 && <li className="muted">No candidates selected. Choose an Available effect.</li>}
    {mods.map((mod, index) => <li key={index} tabIndex={-1} data-mod-index={index}>
      <span className="mod-source-label">CANDIDATE · {data.getTreasurePower(mod.powerId) ? treasureCategoryLabel(data.getTreasurePower(mod.powerId)!, data) : 'Unknown association'}</span>
      <SavedPower mod={mod} data={data} />
      {candidateTargetMismatch(data.getTreasurePower(mod.powerId), mod.tierId, target) && <small className="mod-mismatch" title="Saved tier retained. Published ranges and rarity can overlap; change this tier explicitly if desired.">Differs from target preview</small>}
      <div className="candidate-controls"><TierSelect power={data.getTreasurePower(mod.powerId)} tierId={mod.tierId} disabled={readOnly}
        label={`Tier for candidate ${index + 1}`} onChange={tierId => onEdit({ type: 'mod-tier', equipmentIndex, index, tierId })} />
      <div className="mod-actions">
        <button type="button" disabled={readOnly || index === 0} aria-label={`Move candidate ${index + 1} up`} onClick={() => { onEdit({ type: 'mod-move', equipmentIndex, index, direction: -1 }); focusRow(index - 1); }}>↑</button>
        <button type="button" disabled={readOnly || index === mods.length - 1} aria-label={`Move candidate ${index + 1} down`} onClick={() => { onEdit({ type: 'mod-move', equipmentIndex, index, direction: 1 }); focusRow(index + 1); }}>↓</button>
        <button type="button" disabled={readOnly} aria-label={`Remove candidate ${index + 1}`} onClick={() => { onEdit({ type: 'mod-remove', equipmentIndex, index }); focusRow(index); }}>Remove</button>
      </div></div>
    </li>)}
  </ol>;
}

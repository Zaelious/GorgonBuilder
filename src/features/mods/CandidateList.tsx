import { useRef } from 'react';
import type { CandidateMod } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import { SavedPower, TierSelect } from './PowerFacts';

export function CandidateList({ mods, data, equipmentIndex, onEdit, readOnly }: {
  mods: CandidateMod[]; data: GameDataRepository; equipmentIndex: number; onEdit: (edit: CandidateModEdit) => void; readOnly: boolean;
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
    {mods.length === 0 && <li className="muted">No candidates staged. Browse powers to add one.</li>}
    {mods.map((mod, index) => <li key={index} tabIndex={-1} data-mod-index={index}>
      <SavedPower mod={mod} data={data} />
      <TierSelect power={data.getTreasurePower(mod.powerId)} tierId={mod.tierId} disabled={readOnly}
        label={`Tier for candidate ${index + 1}`} onChange={tierId => onEdit({ type: 'mod-tier', equipmentIndex, index, tierId })} />
      <div className="mod-actions">
        <button type="button" disabled={readOnly || index === 0} aria-label={`Move candidate ${index + 1} up`} onClick={() => { onEdit({ type: 'mod-move', equipmentIndex, index, direction: -1 }); focusRow(index - 1); }}>↑</button>
        <button type="button" disabled={readOnly || index === mods.length - 1} aria-label={`Move candidate ${index + 1} down`} onClick={() => { onEdit({ type: 'mod-move', equipmentIndex, index, direction: 1 }); focusRow(index + 1); }}>↓</button>
        <button type="button" disabled={readOnly} aria-label={`Remove candidate ${index + 1}`} onClick={() => { onEdit({ type: 'mod-remove', equipmentIndex, index }); focusRow(index); }}>Remove</button>
      </div>
    </li>)}
  </ol>;
}

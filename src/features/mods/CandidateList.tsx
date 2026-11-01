import { useRef } from 'react';
import type { CandidateMod } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import { candidateTargetMismatch, treasureCategoryLabel, type ModTargetLevel } from '../../data/search/treasure-planning';
import { SavedPower, TierFacts, TierSelect } from './PowerFacts';

export function CandidateList({ mods, data, equipmentIndex, onEdit, readOnly, target }: {
  mods: CandidateMod[]; data: GameDataRepository; equipmentIndex: number; onEdit: (edit: CandidateModEdit) => void; readOnly: boolean; target: ModTargetLevel;
}) {
  const list = useRef<HTMLOListElement>(null);
  function focusRow(index: number) {
    requestAnimationFrame(() => {
      const element = list.current;
      if (!element) return;
      const rows = element.querySelectorAll<HTMLElement>(':scope > [data-mod-index]');
      (rows[Math.min(index, rows.length - 1)] ?? element).focus();
    });
  }
  return <ol className="candidate-list" ref={list} tabIndex={-1} aria-label="Staged candidate mods">
    {mods.length === 0 && <li className="muted">No candidates selected. Choose an Available effect.</li>}
    {mods.map((mod, index) => {
      const power = data.getTreasurePower(mod.powerId);
      const tier = mod.tierId === null ? undefined : data.getTreasureTier(mod.powerId, mod.tierId);
      return <li key={index} tabIndex={-1} data-mod-index={index} className={!power || (mod.tierId !== null && !tier) ? 'candidate-unresolved' : undefined}>
        <div className="candidate-effect" title={power ? treasureCategoryLabel(power, data) : 'Unknown association'}><SavedPower mod={mod} data={data} details={false} /></div>
        {candidateTargetMismatch(power, mod.tierId, target) && <span className="mod-mismatch" role="img" aria-label="Differs from target preview" title="Differs from target preview. Saved tier retained; change explicitly if desired.">◦</span>}
        <details className="candidate-details mod-more"><summary aria-label={`Details and tier for candidate ${index + 1}`} title="Details, tier and ordering"><span aria-hidden="true">⋯</span></summary>
          <div className="candidate-detail-content">
            <p>Planned mod · {power ? treasureCategoryLabel(power, data) : 'Unknown association'} · {mod.powerId} / {mod.tierId ?? 'No tier chosen'}</p>
            {tier && <TierFacts tier={tier} data={data} />}
            {power && <p>Published slots: {power.slots.join(', ') || 'unknown'} · Profiles: {data.getProfilesForPower(power.id).map(profile => profile.id).join(', ') || 'none listed'}</p>}
            <div className="candidate-controls"><TierSelect power={power} tierId={mod.tierId} disabled={readOnly}
              label={`Tier for candidate ${index + 1}`} onChange={tierId => onEdit({ type: 'mod-tier', equipmentIndex, index, tierId })} />
              <div className="mod-actions">
                <button type="button" disabled={readOnly || index === 0} aria-label={`Move candidate ${index + 1} up`} onClick={() => { onEdit({ type: 'mod-move', equipmentIndex, index, direction: -1 }); focusRow(index - 1); }}>↑</button>
                <button type="button" disabled={readOnly || index === mods.length - 1} aria-label={`Move candidate ${index + 1} down`} onClick={() => { onEdit({ type: 'mod-move', equipmentIndex, index, direction: 1 }); focusRow(index + 1); }}>↓</button>
              </div>
            </div>
          </div>
        </details>
        <button className="candidate-remove" type="button" disabled={readOnly} aria-label={`Remove candidate ${index + 1}`} title="Remove candidate" onClick={() => { onEdit({ type: 'mod-remove', equipmentIndex, index }); focusRow(index); }}>×</button>
      </li>;
    })}
  </ol>;
}

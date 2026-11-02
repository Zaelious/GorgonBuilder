import { useRef } from 'react';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { ExistingModEdit } from '../../core/build/existing-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import { candidateTargetMismatch, treasureCategoryLabel, type EffectiveModRow, type ModTargetLevel } from '../../data/search/treasure-planning';
import { SavedPower, TierFacts, TierSelect } from './PowerFacts';
import { ModSkillChip } from './ModSkillChip';

export function CandidateList({ rows, candidateCount, skillA, skillB, data, equipmentIndex, onEdit, readOnly, target }: {
  rows: EffectiveModRow[]; candidateCount: number; skillA: string | null; skillB: string | null;
  data: GameDataRepository; equipmentIndex: number; onEdit: (edit: CandidateModEdit | ExistingModEdit) => void; readOnly: boolean; target: ModTargetLevel;
}) {
  const list = useRef<HTMLOListElement>(null);
  function focusRow(index: number) {
    requestAnimationFrame(() => {
      const element = list.current;
      if (!element) return;
      const rows = element.querySelectorAll<HTMLElement>(':scope > [data-mod-origin]');
      (rows[Math.min(index, rows.length - 1)] ?? element).focus();
    });
  }
  function focusCandidate(index: number) {
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`:scope > [data-mod-index="${index}"]`)?.focus());
  }
  return <ol className="candidate-list" ref={list} tabIndex={-1} aria-label="Selected working mods">
    {rows.length === 0 && <li className="muted">No mods selected. Choose an Available effect.</li>}
    {rows.map(({ mod, index, origin }, displayIndex) => {
      const power = data.getTreasurePower(mod.powerId);
      const tier = mod.tierId === null ? undefined : data.getTreasureTier(mod.powerId, mod.tierId);
      const imported = origin === 'imported';
      const label = imported ? `imported mod ${index + 1}` : `candidate ${index + 1}`;
      return <li key={`${origin}-${index}`} tabIndex={-1} data-mod-origin={origin} data-selected-power-id={mod.powerId} data-selected-tier-id={mod.tierId ?? ''}
        {...(imported ? { 'data-existing-mod-index': index } : { 'data-mod-index': index })} className={!power || (mod.tierId !== null && !tier) ? 'candidate-unresolved' : undefined}>
        <div className="candidate-effect" title={power ? treasureCategoryLabel(power, data) : 'Unknown association'}><div className="mod-row-labels"><ModSkillChip powerId={mod.powerId} origin={origin} skillA={skillA} skillB={skillB} data={data} /><small className="mod-origin">{imported ? 'Imported' : 'Planned'} · {mod.tierId ?? 'No tier'}</small></div><SavedPower mod={mod} data={data} existing={imported} details={false} /></div>
        {candidateTargetMismatch(power, mod.tierId, target) && <span className="mod-mismatch" role="img" aria-label="Differs from target preview" title="Differs from target preview. Saved tier retained; change explicitly if desired.">◦</span>}
        <details className="candidate-details mod-more"><summary aria-label={`Details and tier for ${label}`} title="Details, tier and ordering"><span aria-hidden="true">⋯</span></summary>
          <div className="candidate-detail-content">
            <p>{imported ? 'Imported working mod' : 'Planned mod'} · {power ? treasureCategoryLabel(power, data) : 'Unknown association'} · {mod.powerId} / {mod.tierId ?? 'No tier chosen'}</p>
            {tier && <TierFacts tier={tier} data={data} />}
            {power && <p>Published slots: {power.slots.join(', ') || 'unknown'} · Profiles: {data.getProfilesForPower(power.id).map(profile => profile.id).join(', ') || 'none listed'}</p>}
            <div className="candidate-controls"><TierSelect power={power} tierId={mod.tierId} disabled={readOnly} allowUnset={!imported}
              label={`Tier for ${label}`} onChange={tierId => {
                if (imported) { if (tierId !== null) onEdit({ type: 'existing-mod-tier', equipmentIndex, index, tierId }); }
                else onEdit({ type: 'mod-tier', equipmentIndex, index, tierId });
              }} />
              {!imported && <div className="mod-actions">
                <button type="button" disabled={readOnly || index === 0} aria-label={`Move candidate ${index + 1} up`} onClick={() => { onEdit({ type: 'mod-move', equipmentIndex, index, direction: -1 }); focusCandidate(index - 1); }}>↑</button>
                <button type="button" disabled={readOnly || index === candidateCount - 1} aria-label={`Move candidate ${index + 1} down`} onClick={() => { onEdit({ type: 'mod-move', equipmentIndex, index, direction: 1 }); focusCandidate(index + 1); }}>↓</button>
              </div>}
            </div>
          </div>
        </details>
        <button className="candidate-remove" type="button" disabled={readOnly} aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={() => { onEdit({ type: imported ? 'existing-mod-remove' : 'mod-remove', equipmentIndex, index }); focusRow(displayIndex); }}>×</button>
      </li>;
    })}
  </ol>;
}

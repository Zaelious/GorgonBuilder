import { useEffect, useMemo, useRef, useState } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import { browseTreasurePowers, indexTreasurePowers, powerName, treasureRelevance, type TreasureContext, type TreasurePower, type TreasureRelevance } from '../../data/search/treasure';
import { CandidateList } from './CandidateList';
import { PowerFacts, TierFacts, TierSelect } from './PowerFacts';
import './mods.css';

const PAGE_SIZE = 10;
function PowerCard({ power, relevance, context, data, onAdd, readOnly }: {
  power: TreasurePower; relevance: TreasureRelevance; context: TreasureContext; data: GameDataRepository;
  onAdd: (tierId: string | null) => void; readOnly: boolean;
}) {
  const [tierId, setTierId] = useState<string | null>(null);
  const tier = tierId === null ? undefined : data.getTreasureTier(power.id, tierId);
  return <article className="mod-power" data-power-id={power.id}>
    <div className="mod-power-heading"><h3>{powerName(power)}</h3><button type="button" disabled={readOnly} onClick={() => onAdd(tierId)} aria-label={`Stage ${power.id}`}>Stage candidate</button></div>
    <PowerFacts power={power} relevance={relevance} profileId={context.item?.treasureProfile?.profileId} data={data} />
    <TierSelect power={power} tierId={tierId} onChange={setTierId} disabled={false} label={`Published tier for ${power.id}`} />
    {tier ? <TierFacts tier={tier} /> : <p className="muted">{power.tiers.length} published tiers. Choose one to inspect its exact effects, or stage without a tier.</p>}
  </article>;
}

export function ModPlanner({ selection, equipmentIndex, context, data, onEdit, readOnly, returnFocus, onClose }: {
  selection: EquipmentSelection; equipmentIndex: number; context: TreasureContext; data: GameDataRepository;
  onEdit: (edit: CandidateModEdit) => void; readOnly: boolean; returnFocus: HTMLElement; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'browse' | 'staged'>('browse');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'relevant' | 'all'>('relevant');
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const index = useMemo(() => indexTreasurePowers(data.treasurePowers), [data]);
  const relevance = useMemo(() => new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)])), [data, context]);
  const matches = useMemo(() => browseTreasurePowers(index, query, relevance, mode), [index, query, relevance, mode]);
  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    element.querySelector<HTMLInputElement>('input[type=search]')?.focus();
    return () => { if (element.open) element.close(); if (returnFocus.isConnected) returnFocus.focus(); };
  }, [returnFocus]);
  function changePage(next: number) {
    setPage(next);
    dialog.current?.querySelector<HTMLElement>('.mod-results-title')?.focus();
    dialog.current?.querySelector('.mod-results-title')?.scrollIntoView({ block: 'nearest' });
  }
  return <dialog ref={dialog} className="ability-picker mod-planner" aria-labelledby="mod-planner-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="picker-content">
      <header className="dialog-heading"><div><p className="eyebrow">{selection.slot} · {context.item?.displayName ?? 'Saved item'}</p><h2 id="mod-planner-title">Candidate mods</h2></div><button type="button" aria-label="Close mod planner" onClick={onClose}>×</button></header>
      <div className="mod-actions" aria-label="Mod planner views">
        <button type="button" aria-pressed={view === 'browse'} onClick={() => setView('browse')}>Browse powers</button>
        <button type="button" aria-pressed={view === 'staged'} onClick={() => setView('staged')}>Staged ({selection.candidateMods.length})</button>
      </div>
      <p className="muted mod-help">Candidates are exploratory, with no final mod-count limit. Fixed effects, existing instance powers and Sparks are separate. Profile, slot and skill signals do not establish full eligibility; other restrictions remain unknown.</p>
      {readOnly && <p className="warning">This draft is read-only. You can inspect powers, but candidate changes are disabled.</p>}
      <p role="status" className="mod-notice">{notice}</p>
      {view === 'staged' ? <CandidateList mods={selection.candidateMods} data={data} equipmentIndex={equipmentIndex} onEdit={onEdit} readOnly={readOnly} /> : <>
        <label htmlFor="mod-search">Search treasure powers</label>
        <input id="mod-search" type="search" value={query} placeholder="Name, power ID, tier ID, or published effect…" onChange={event => { setQuery(event.target.value); setPage(0); }} />
        <label className="mod-browse-mode">Browse order<select aria-label="Power browsing" value={mode} onChange={event => { setMode(event.target.value as typeof mode); setPage(0); }}>
          <option value="relevant">Relevant first</option><option value="all">All powers (name order)</option>
        </select></label>
        <p className="muted mod-help">Relevant first ranks published profile membership, then exact slot and selected-skill matches. Both views include all matching powers, including unknowns.</p>
        {!context.item?.treasureProfile || context.item.treasureProfile.status !== 'resolved' || !data.getTreasureProfile(context.item.treasureProfile.profileId)
          ? <p className="warning">Item profile relevance is unknown. Browse all powers and inspect their published metadata.</p> : <p className="muted">Item profile: {context.item.treasureProfile.profileId} · Selected skills: {context.skillIds.join(', ') || 'none'}</p>}
        <p className="mod-results-title muted" tabIndex={-1} aria-live="polite">{matches.length} matching powers · Page {currentPage + 1} of {lastPage + 1}</p>
        {matches.length === 0 && <p>No official powers match. Try a name, ID or shorter effect phrase.</p>}
        <div className="mod-results">{matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(power => <PowerCard key={power.id} power={power} relevance={relevance.get(power.id)!} context={context} data={data} readOnly={readOnly}
          onAdd={tierId => { if (readOnly) return; onEdit({ type: 'mod-add', equipmentIndex, powerId: power.id, tierId }); setNotice(`Staged ${powerName(power)} / ${tierId ?? 'no tier chosen'}.`); }} />)}</div>
        {matches.length > PAGE_SIZE && <nav className="mod-actions" aria-label="Power results pages"><button type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage === lastPage} onClick={() => changePage(currentPage + 1)}>Next</button></nav>}
      </>}
    </div>
  </dialog>;
}

import { useId, useMemo, useState } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import { browseTreasurePowers, indexTreasurePowers, powerName, treasureRelevance, type TreasureContext, type TreasurePower, type TreasureRelevance } from '../../data/search/treasure';
import { groupTreasurePowers, orderTreasureTiers, previewTreasureTiers, type ModCategories, type ModTargetLevel, type TreasureTier } from '../../data/search/treasure-planning';
import { EffectDescriptions } from './EffectDescription';
import { CandidateList } from './CandidateList';
import { PowerFacts, TierFacts } from './PowerFacts';
import './mods.css';

function AvailablePower({ power, relevance, context, target, data, onAdd, readOnly }: {
  power: TreasurePower; relevance: TreasureRelevance; context: TreasureContext; target: ModTargetLevel; data: GameDataRepository;
  onAdd: (tierId: string | null) => void; readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const previews = previewTreasureTiers(power, target);
  const tier = previews[0];
  const effects = (record: TreasureTier) => <EffectDescriptions descriptions={record.effectDescriptions} data={data} fallback={powerName(power)} />;
  return <li className="mod-available-power" data-power-id={power.id} data-preview-tier={tier?.id ?? ''}>
    {tier ? <button type="button" className="available-effect" disabled={readOnly} onClick={() => onAdd(tier.id)} title={`Add ${powerName(power)} · ${tier.id}`}>
      <span className="available-effect-text">{effects(tier)}</span><span aria-hidden="true" className="mod-add-mark">＋</span>
    </button> : <p className="muted">{powerName(power)} · No published tier range at this target.</p>}
    <details className="mod-more available-details" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
      <summary aria-label={`Details and tiers for ${power.id}`} title={`${previews.length} preview tier options · Details and other tiers`}><span aria-hidden="true">⋯</span></summary>
      {open && <>
        <p>{previews.length} preview tier options</p>
        <PowerFacts power={power} relevance={relevance} profileId={context.item?.treasureProfile?.profileId} data={data} />
        <p className="muted">Preview: highest published minimum level{target === 'max' ? '' : ` within ${target}'s published ranges`}, then maximum level; rarity name and tier key break ties. This does not determine strength or unique legality.</p>
        {tier && <TierFacts tier={tier} data={data} />}
        <p className="muted">Choose any exact published tier below; overlapping ranges and rarity are not resolved as legality rules.</p>
        <ul className="mod-tier-alternatives">{orderTreasureTiers(power.tiers).map(other => <li key={other.id}>
          <button type="button" disabled={readOnly} onClick={() => onAdd(other.id)} data-tier-id={other.id}>{effects(other)}<span className="muted"> · {other.id} · Levels {other.minLevel}–{other.maxLevel} · {other.minRarity}</span></button>
        </li>)}</ul>
        <button type="button" disabled={readOnly} onClick={() => onAdd(null)}>Add without a tier</button>
      </>}
    </details>
  </li>;
}

/** Inline UI state is transient; candidate edits still use the existing schema/autosave. */
export function ModPlanner({ selection, equipmentIndex, context, data, onEdit, readOnly }: {
  selection: EquipmentSelection; equipmentIndex: number; context: TreasureContext; data: GameDataRepository;
  onEdit: (edit: CandidateModEdit) => void; readOnly: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<ModTargetLevel>('max');
  const [targetText, setTargetText] = useState('Max');
  const validTarget = targetText.trim().toLowerCase() === 'max' || (/^\d+$/u.test(targetText.trim()) && Number.isSafeInteger(Number(targetText)));
  const [allSkills, setAllSkills] = useState(false);
  const [categories, setCategories] = useState<ModCategories>({ generic: true, endurance: true, shamanic: true });
  const index = useMemo(() => indexTreasurePowers(data.treasurePowers), [data]);
  const relevance = useMemo(() => new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)])), [data, context]);
  const matches = useMemo(() => browseTreasurePowers(index, query, relevance, 'relevant'), [index, query, relevance]);
  const groups = useMemo(() => groupTreasurePowers(matches, context.skillIds, categories, allSkills, data), [matches, context.skillIds, categories, allSkills, data]);
  const active = context.skillIds.some(skill => data.getSkill(skill)?.combat);
  return <section className="mod-planner" aria-label={`Mods for equipment ${equipmentIndex + 1}`}>
    <div className="mod-toolbar">
      <label htmlFor={`${id}-target`}>Target level
        <input id={`${id}-target`} aria-label="Mod target level" list={`${id}-levels`} value={targetText} aria-invalid={!validTarget} onBlur={() => { if (!validTarget) setTargetText(target === 'max' ? 'Max' : String(target)); }} onChange={event => {
          setTargetText(event.target.value);
          const text = event.target.value.trim();
          if (text.toLowerCase() === 'max') setTarget('max');
          else if (/^\d+$/u.test(text) && Number.isSafeInteger(Number(text))) setTarget(Number(text));
        }} />
        <datalist id={`${id}-levels`}><option value="Max" /><option value="90" /><option value="100" /></datalist>
      </label>
      <label className="mod-search-label" htmlFor={`${id}-search`}>Search mods<input id={`${id}-search`} type="search" aria-label="Search treasure powers" value={query} onChange={event => setQuery(event.target.value)} placeholder="Effect, name, or ID…" /></label>
    </div>
    {!validTarget && <p className="warning">Use Max or a nonnegative whole target level. The previous preview is retained.</p>}
    <div className="mod-category-toggles">{([['generic', 'Generic'], ['endurance', 'Endurance'], ['shamanic', 'Shamanic Infusions']] as const).map(([key, label]) => <label key={key}>
      <input type="checkbox" checked={categories[key]} onChange={event => setCategories(previous => ({ ...previous, [key]: event.target.checked }))} />{label}
    </label>)}<label><input type="checkbox" checked={allSkills} onChange={event => setAllSkills(event.target.checked)} />All skills</label></div>
    <div className="mod-columns">
      <section className="mod-available" aria-labelledby={`${id}-available`}><h3 id={`${id}-available`}>Available</h3>
        {!active ? <p className="muted">Select a combat skill to view mods.</p> : <div className="mod-available-scroll">
          {groups.length === 0 && <p className="muted">No matching powers. Try a shorter search or All skills.</p>}
          {groups.map(group => <section key={group.id} data-mod-group={group.id} aria-label={group.label}>
            <h4>{group.label} <small>({group.powers.length})</small></h4>
            <ul>{group.powers.map(power => <AvailablePower key={power.id} power={power} relevance={relevance.get(power.id)!} context={context} target={target} data={data} readOnly={readOnly}
              onAdd={tierId => { if (!readOnly) onEdit({ type: 'mod-add', equipmentIndex, powerId: power.id, tierId }); }} />)}</ul>
          </section>)}
        </div>}
      </section>
      <section className="mod-selected" aria-labelledby={`${id}-selected`}><h3 id={`${id}-selected`} aria-live="polite">Selected ({selection.candidateMods.length})</h3>
        <CandidateList mods={selection.candidateMods} data={data} equipmentIndex={equipmentIndex} onEdit={onEdit} readOnly={readOnly} target={target} />
      </section>
    </div>
    {readOnly && <p className="warning">This draft is read-only. Candidate changes are disabled.</p>}
    <details className="mod-more mod-guidance"><summary>Categories, target levels &amp; relevance</summary>
      <p>Generic lists the published AnySkill selector; its skill association and eligibility are unknown. Endurance and Shamanic Infusions use exact published skill associations. Missing associations have their own Unknown group.</p>
      <p>Item profile {context.item?.treasureProfile?.profileId ?? 'unknown'}: profile membership, then exact slot matches guide order within each group. These are relevance signals, not full legality. All skills enables broader exploration. No final mod-count limit is imposed.</p>
      <p>Target changes only the available preview, never saved candidates, item target level or skill levels. Max uses the highest published minimum level, not calculated effect strength. Overlapping ranges/rarities remain explicit tier alternatives. Effects are exact published text, without damage math.</p>
    </details>
  </section>;
}

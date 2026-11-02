import { useId, useMemo, useState } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { CandidateModEdit } from '../../core/build/candidate-mods';
import { isResolvedExistingPower, restoredExistingPowers, sameExistingPowers, type ExistingModEdit } from '../../core/build/existing-mods';
import type { GameDataRepository } from '../../data/repository/repository';
import { browseTreasurePowers, indexTreasurePowers, powerName, treasureRelevance, type TreasureContext, type TreasurePower, type TreasureRelevance } from '../../data/search/treasure';
import { availableTreasurePowers, groupEffectiveMods, groupTreasurePowers, itemFit, type ItemFit, orderTreasureTiers, previewTreasureTiers, type ModTargetLevel, type TreasureTier } from '../../data/search/treasure-planning';
import { EffectDescriptions } from './EffectDescription';
import { CandidateList } from './CandidateList';
import { PowerFacts, TierFacts } from './PowerFacts';
import type { ModBrowserState } from './ModBrowserControls';
import './mods.css';

const FIT_FLAGS: Record<Exclude<ItemFit, 'listed'>, { text: string; title: (profile: string, slot: string) => string }> = {
  'outside-profile': { text: 'outside profile', title: profile => `Not listed in this item's published treasure profile (${profile}). Equipment eligibility unconfirmed.` },
  'other-slot': { text: 'other slot', title: (_, slot) => `Published slots do not include ${slot}. Shown only while exploring.` },
};

function AvailablePower({ power, relevance, context, target, data, onAdd, readOnly }: {
  power: TreasurePower; relevance: TreasureRelevance; context: TreasureContext; target: ModTargetLevel; data: GameDataRepository;
  onAdd: (tierId: string | null) => void; readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const previews = previewTreasureTiers(power, target);
  const tier = previews[0];
  const fit = itemFit(power, relevance, data);
  const flag = fit === 'listed' ? null : FIT_FLAGS[fit];
  const effects = (record: TreasureTier) => <EffectDescriptions descriptions={record.effectDescriptions} data={data} fallback={powerName(power)} />;
  return <li className="mod-available-power" data-power-id={power.id} data-preview-tier={tier?.id ?? ''} data-fit={fit}>
    {tier ? <button type="button" className="available-effect" disabled={readOnly} onClick={() => onAdd(tier.id)} title={`Add ${powerName(power)} · ${tier.id}`}>
      <span className="available-effect-text">{effects(tier)}{flag && <> <small className={`mod-fit-flag fit-${fit}`} title={flag.title(context.item?.treasureProfile?.profileId ?? 'unknown', context.item?.slot ?? 'this slot')}>{flag.text}</small></>}</span><span aria-hidden="true" className="mod-add-mark">＋</span>
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
export function ModPlanner({ selection, equipmentIndex, context, skillA, skillB, data, onEdit, readOnly, browser }: {
  selection: EquipmentSelection; equipmentIndex: number; context: TreasureContext; data: GameDataRepository;
  skillA: string | null; skillB: string | null; browser: ModBrowserState;
  onEdit: (edit: CandidateModEdit | ExistingModEdit) => void; readOnly: boolean;
}) {
  const id = useId();
  const { query, target, allSkills, allSlots, categories } = browser;
  const index = useMemo(() => indexTreasurePowers(data.treasurePowers), [data]);
  const relevance = useMemo(() => new Map(data.treasurePowers.map(power => [power.id, treasureRelevance(power, context, data)])), [data, context]);
  const effective = groupEffectiveMods(selection, skillA, skillB, data);
  const selected = effective.filter(row => row.origin === 'planned' || (selection.item.kind === 'imported' && row.mod.tierId !== null && isResolvedExistingPower({ powerId: row.mod.powerId, tierId: row.mod.tierId }, data)));
  const staged = new Set(effective.map(row => row.mod.powerId));
  const restore = useMemo(() => selection.item.kind === 'imported' ? restoredExistingPowers(selection.item.instance, data) : null, [selection.item, data]);
  const canRestore = restore !== null && selection.item.kind === 'imported' && !sameExistingPowers(restore, selection.item.instance.existingPowers);
  const matches = useMemo(() => availableTreasurePowers(browseTreasurePowers(index, query, relevance, 'relevant'), relevance, staged, allSlots, data, context.skillIds),
    [index, query, relevance, staged, allSlots, data, context.skillIds]);
  const groups = useMemo(() => groupTreasurePowers(matches, context.skillIds, categories, allSkills, data), [matches, context.skillIds, categories, allSkills, data]);
  const active = context.skillIds.some(skill => data.getSkill(skill)?.combat);
  return <section className="mod-planner" aria-label={`Mods for equipment ${equipmentIndex + 1}`}>
    <div className="mod-columns">
      <section className="mod-available" aria-labelledby={`${id}-available`}><h3 id={`${id}-available`}>Available</h3>
        {!active ? <p className="muted">Select a combat skill to view mods.</p> : <div className="mod-available-scroll">
          {groups.length === 0 && <p className="muted">No matching powers. Try a shorter search, All skills, or Other slots &amp; profiles.</p>}
          {!context.item && <p className="muted">Item definition unavailable: slot/profile filtering is off.</p>}
          {groups.map(group => <section key={group.id} data-mod-group={group.id} aria-label={group.label}>
            <h4>{group.label} <small>({group.powers.length})</small>{(() => {
              const outside = group.powers.filter(power => itemFit(power, relevance.get(power.id)!, data) === 'outside-profile').length;
              return outside > 0 && <small className="mod-fit-note" title="Not listed in this item's published treasure profile; equipment eligibility unconfirmed."> · {outside} outside item profile</small>;
            })()}</h4>
            <ul>{group.powers.map(power => <AvailablePower key={power.id} power={power} relevance={relevance.get(power.id)!} context={context} target={target} data={data} readOnly={readOnly}
              onAdd={tierId => { if (!readOnly) onEdit({ type: 'mod-add', equipmentIndex, powerId: power.id, tierId, unique: true }); }} />)}</ul>
          </section>)}
        </div>}
      </section>
      <section className="mod-selected" aria-labelledby={`${id}-selected`}><h3 id={`${id}-selected`} aria-live="polite">Selected ({selected.length})</h3>
        <CandidateList rows={selected} candidateCount={selection.candidateMods.length} skillA={skillA} skillB={skillB} data={data} equipmentIndex={equipmentIndex} onEdit={onEdit} readOnly={readOnly} target={target} />
        {selection.item.kind === 'imported' && <button className="restore-imported-mods" type="button" disabled={readOnly || !canRestore} onClick={() => {
          if (!restore) return;
          const collision = restore.some(mod => selection.candidateMods.some(candidate => candidate.powerId === mod.powerId));
          if (collision && !window.confirm('Some original imported powers are also staged as planned mods. Restore the original imported powers and keep those planned copies too?')) return;
          onEdit({ type: 'existing-mod-restore', equipmentIndex });
        }}>Restore Imported Mods</button>}
        {selection.item.kind === 'imported' && effective.some(row => row.origin === 'imported' && !selected.includes(row)) && <p className="warning">Unresolved working pairs are retained read-only in Stats. Original unresolved entries and imbues remain under Original imported item.</p>}
      </section>
    </div>
    {readOnly && <p className="warning">This draft is read-only. Mod changes are disabled.</p>}
  </section>;
}

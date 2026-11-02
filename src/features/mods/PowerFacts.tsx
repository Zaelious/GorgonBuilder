import { EffectDescriptions, EffectRequirements, ExactEffects } from './EffectDescription';
import type { CandidateMod } from '../../core/build/document';
import type { Runtime } from '../../data/repository/contracts';
import type { NormalizedTreasureTier } from '../../data/normalized/items-treasure';
import type { GameDataRepository } from '../../data/repository/repository';
import { treasureCategoryLabel } from '../../data/search/treasure-planning';
import { powerName, type TreasurePower, type TreasureRelevance } from '../../data/search/treasure';

export function TierFacts({ tier, data }: { tier: Runtime<NormalizedTreasureTier>; data: GameDataRepository }) {
  return <div className="mod-tier-facts">
    <p><EffectDescriptions descriptions={tier.effectDescriptions} data={data} /></p><EffectRequirements descriptions={tier.effectDescriptions} data={data} /><ExactEffects descriptions={tier.effectDescriptions} />
    <p className="muted">Published levels {tier.minLevel}–{tier.maxLevel} · Minimum rarity: {tier.minRarity} · Skill level prerequisite: {tier.skillLevelPrerequisite}</p>
    <p className="muted">{tier.powerId} / {tier.id}</p>
  </div>;
}

export function TierSelect({ power, tierId, onChange, disabled, label }: {
  power: TreasurePower | undefined; tierId: string | null; onChange: (id: string | null) => void; disabled: boolean; label: string;
}) {
  const tiers = [...(power?.tiers ?? [])].sort((a, b) => a.minLevel - b.minLevel || a.id.localeCompare(b.id, undefined, { numeric: true }));
  return <label className="mod-tier-select">Tier
    <select aria-label={label} value={tierId ?? ''} disabled={disabled} onChange={event => onChange(event.target.value || null)}>
      <option value="">No tier chosen</option>
      {tierId !== null && !tiers.some(tier => tier.id === tierId) && <option value={tierId}>{tierId} — unavailable (retained)</option>}
      {tiers.map(tier => <option value={tier.id} key={tier.id}>Levels {tier.minLevel}–{tier.maxLevel} · {tier.minRarity}{tiers.filter(other => other.minLevel === tier.minLevel && other.maxLevel === tier.maxLevel && other.minRarity === tier.minRarity).length > 1 ? ` · ${tier.id}` : ''}</option>)}
    </select>
  </label>;
}

export function SavedPower({ mod, data, existing = false, details = true }: { mod: CandidateMod; data: GameDataRepository; existing?: boolean; details?: boolean }) {
  const power = data.getTreasurePower(mod.powerId);
  const tier = mod.tierId === null ? undefined : data.getTreasureTier(mod.powerId, mod.tierId);
  return <>
    {tier ? <span className="mod-effect-text"><EffectDescriptions descriptions={tier.effectDescriptions} data={data} fallback={power ? powerName(power) : 'Saved power'} /></span>
      : <p>{power ? powerName(power) : mod.powerId} · {mod.tierId === null ? 'No tier chosen' : 'Saved tier unavailable'}</p>}
    {!power && <p className="warning">Official power unavailable. Saved ID retained; inspect with a matching data snapshot{existing ? '.' : ' or remove this candidate explicitly.'}</p>}
    {mod.tierId !== null && !tier && <p className="warning">Official tier {mod.tierId} unavailable for {mod.powerId}. Saved ID retained; {existing ? 'inspect with a matching data snapshot.' : 'choose a published tier, clear the tier, or remove this candidate.'}</p>}
    {details && <details className="mod-more saved-power-details"><summary aria-label={`Details for saved power ${mod.powerId}`} title="Saved power details"><span aria-hidden="true">⋯</span></summary>
      <p>{mod.powerId} / {mod.tierId ?? 'No tier chosen'} · {power ? powerName(power) : 'Unknown power'}</p>
      {power && <p>{treasureCategoryLabel(power, data)} · {power.internalName}</p>}
      {tier && <TierFacts tier={tier} data={data} />}
    </details>}
  </>;
}

export function PowerFacts({ power, relevance, profileId, data }: {
  power: TreasurePower; relevance: TreasureRelevance; profileId: string | undefined; data: GameDataRepository;
}) {
  const skill = power.skill.status === 'resolved' && power.skill.skillId !== null ? data.getSkill(power.skill.skillId) : undefined;
  return <>
    <p className="mod-association">Skill: {skill ? (skill.name ?? skill.id) : `${power.skill.sourceId} — association unknown`}</p>
    <p className="mod-signals">Profile{profileId ? ` ${profileId}` : ''}: {relevance.profile === 'match' ? 'published member' : relevance.profile === 'different' ? 'not listed' : 'unknown'} · Slot: {relevance.slot === 'match' ? 'published match' : relevance.slot === 'different' ? 'not listed' : 'unknown'} · Selected skill: {relevance.skill === 'match' ? 'matches' : relevance.skill === 'different' ? 'different' : 'unknown'}</p>
    {power.isUnavailable === true && <p className="warning">Published as unavailable; retained for exploratory planning.</p>}
    <details className="mod-more"><summary>Power metadata</summary>
      <p>{power.id} · {power.internalName}</p>
      <p>Published name: {[power.prefix, power.suffix].filter(Boolean).join(' / ') || 'none; internal name shown'}</p>
      <p>Published slots: {power.slots.join(', ') || 'unknown'}</p>
      <p>Unavailable: {String(power.isUnavailable ?? 'unknown')} · Hidden from transmutation: {String(power.isHiddenFromTransmutation ?? 'unknown')}</p>
      <p>Published profile memberships: {data.getProfilesForPower(power.id).map(profile => profile.id).join(', ') || 'none listed'}</p>
      <a href={data.getSourceMetadata(power.source).sourceUrl} target="_blank" rel="noreferrer">Official {data.gameDataVersion} TSys source</a>
    </details>
  </>;
}

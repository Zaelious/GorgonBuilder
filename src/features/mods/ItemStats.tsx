import type { CandidateMod, EquipmentSelection } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import type { EquipmentDefinition } from '../../data/search/equipment';
import { powerName } from '../../data/search/treasure';
import { groupPlannedMods, skillTone, treasureCategoryLabel, treasureChipLabel, type SkillTone } from '../../data/search/treasure-planning';
import { EffectDescription, EffectDescriptions } from './EffectDescription';
import './item-stats.css';

type Kind = 'base' | 'imported' | 'planned';

const TONE_TITLES: Record<SkillTone, string> = { 'skill-a': 'Skill A', 'skill-b': 'Skill B', generic: 'Generic', endurance: 'Endurance',
  shamanic: 'Shamanic Infusions', other: 'Skill not in either combat slot', unknown: 'Unknown association' };

/** Colour is a supplement: the chip text always names the skill/category. */
function Chip({ kind, label, tone, title }: { kind: Kind; label: string; tone: SkillTone | 'base'; title: string }) {
  return <span className={`stat-chip stat-chip-${kind} tone-${tone}`} data-tone={tone} title={title}>{kind === 'imported' ? '◇ ' : ''}{label}</span>;
}

function PowerRow({ mod, kind, data, index, skillA, skillB }: { mod: CandidateMod; kind: Exclude<Kind, 'base'>; data: GameDataRepository; index: number; skillA: string | null; skillB: string | null }) {
  const power = data.getTreasurePower(mod.powerId);
  const tier = mod.tierId === null ? undefined : data.getTreasureTier(mod.powerId, mod.tierId);
  const label = treasureChipLabel(power, data);
  const source = kind === 'planned' ? 'Planned mod' : 'Imported existing power';
  const tone = skillTone(power, skillA, skillB, data);
  return <li className={`stat-row stat-${kind}`} data-stat-kind={kind} data-power-id={mod.powerId} data-tier-id={mod.tierId ?? ''}
    {...(kind === 'planned' ? { 'data-candidate-effect': index } : { 'data-existing-power': index })}>
    <Chip kind={kind} label={label} tone={tone}
      title={`${source} · ${TONE_TITLES[tone]} · ${power ? treasureCategoryLabel(power, data) : 'Unknown association'} · ${mod.powerId} / ${mod.tierId ?? 'No tier chosen'}`} />
    <span className="stat-text">{tier ? <EffectDescriptions descriptions={tier.effectDescriptions} data={data} fallback={power ? powerName(power) : 'Saved power'} />
      : <span className="warning">{power ? powerName(power) : mod.powerId} · {mod.tierId === null ? 'No tier chosen' : !power ? 'Official power unavailable (retained)' : `Tier ${mod.tierId} unavailable (retained)`}</span>}</span>
  </li>;
}

/** One structured STATS panel: every published fixed effect, imported existing powers, then planned mods grouped by
 * skill for display only (saved candidate order and indices are unchanged). Skill A is blue, Skill B gold. */
export function ItemStats({ selection, item, data, skillA = null, skillB = null }: {
  selection: EquipmentSelection; item: EquipmentDefinition | undefined; data: GameDataRepository; skillA?: string | null; skillB?: string | null;
}) {
  const fixed = item?.fixedEffects ?? [];
  const existing = selection.item.kind === 'database' ? [] : selection.item.instance.existingPowers;
  const planned = selection.candidateMods;
  const grouped = groupPlannedMods(planned, skillA, skillB, data);
  const slotLegend = ([['skill-a', skillA], ['skill-b', skillA === skillB ? null : skillB]] as const)
    .flatMap(([tone, id]) => id ? [{ tone, name: data.getSkill(id)?.name ?? id }] : []);
  const kinds: [Kind, boolean, string][] = [['base', fixed.length > 0, 'Base'], ['imported', existing.length > 0, '◇ Imported'], ['planned', planned.length > 0, 'Planned']];
  return <section className="item-stats" aria-label="Item stats">
    <div className="item-stats-heading"><h4>Stats</h4>
      <span className="item-stats-legend" aria-hidden="true">{kinds.filter(([, shown]) => shown).map(([kind, , text]) =>
        <span key={kind} className={`legend-${kind}`}>{text}</span>)}
        {slotLegend.map(({ tone, name }) => <span key={tone} className={`legend-tone tone-${tone}`}>{tone === 'skill-a' ? 'A' : 'B'} · {name}</span>)}</span>
    </div>
    <ul className="stat-rows">
      {fixed.map((effect, index) => <li key={`b${index}`} className="stat-row stat-base" data-stat-kind="base" data-fixed-effect={index}>
        <Chip kind="base" label="Base" tone="base" title="Published fixed item effect" />
        <span className="stat-text"><EffectDescription description={effect.description} data={data} /></span>
      </li>)}
      {existing.map((mod, index) => <PowerRow key={`e${index}`} mod={mod} kind="imported" data={data} index={index} skillA={skillA} skillB={skillB} />)}
      {grouped.map(({ mod, index }) => <PowerRow key={`p${index}`} mod={mod} kind="planned" data={data} index={index} skillA={skillA} skillB={skillB} />)}
      {fixed.length + existing.length + planned.length === 0 && <li className="stat-row stat-empty muted">{item ? 'No fixed effects published. Choose Available mods below.' : 'No official base definition; no published stats.'}</li>}
    </ul>
  </section>;
}

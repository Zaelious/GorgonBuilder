import type { CSSProperties } from 'react';
import type { CandidateMod, EquipmentSelection } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import type { EquipmentDefinition } from '../../data/search/equipment';
import { powerName } from '../../data/search/treasure';
import { powerCategoryId, treasureCategoryLabel, treasureChipLabel } from '../../data/search/treasure-planning';
import { EffectDescription, EffectDescriptions } from './EffectDescription';
import './item-stats.css';

/** Distinct, readable hues for skill chips; fixed hues for the non-skill categories. */
// Warning-like yellow and error-like red hues are deliberately excluded.
const SKILL_HUES = [205, 145, 28, 280, 335, 175, 240, 95, 315, 190, 260, 120];
const CATEGORY_HUES: Record<string, number> = { AnySkill: 215, Endurance: 35, ShamanicInfusion: 165 };

export function categoryHue(categoryId: string): number | null {
  if (categoryId === 'unknown') return null;
  if (categoryId in CATEGORY_HUES) return CATEGORY_HUES[categoryId]!;
  let hash = 0;
  for (const char of categoryId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SKILL_HUES[hash % SKILL_HUES.length]!;
}

type Kind = 'base' | 'imported' | 'planned';

function Chip({ kind, label, hue, title }: { kind: Kind; label: string; hue: number | null; title: string }) {
  return <span className={`stat-chip stat-chip-${kind}${hue === null ? ' stat-chip-unknown' : ''}`} title={title}
    style={hue === null ? undefined : { '--chip-hue': hue } as CSSProperties}>{kind === 'imported' ? '◇ ' : ''}{label}</span>;
}

function PowerRow({ mod, kind, data, index }: { mod: CandidateMod; kind: Exclude<Kind, 'base'>; data: GameDataRepository; index: number }) {
  const power = data.getTreasurePower(mod.powerId);
  const tier = mod.tierId === null ? undefined : data.getTreasureTier(mod.powerId, mod.tierId);
  const label = treasureChipLabel(power, data);
  const source = kind === 'planned' ? 'Planned mod' : 'Imported existing power';
  return <li className={`stat-row stat-${kind}`} data-stat-kind={kind} data-power-id={mod.powerId} data-tier-id={mod.tierId ?? ''}
    {...(kind === 'planned' ? { 'data-candidate-effect': index } : { 'data-existing-power': index })}>
    <Chip kind={kind} label={label} hue={power ? categoryHue(powerCategoryId(power, data)) : null}
      title={`${source} · ${power ? treasureCategoryLabel(power, data) : 'Unknown association'} · ${mod.powerId} / ${mod.tierId ?? 'No tier chosen'}`} />
    <span className="stat-text">{tier ? <EffectDescriptions descriptions={tier.effectDescriptions} data={data} fallback={power ? powerName(power) : 'Saved power'} />
      : <span className="warning">{power ? powerName(power) : mod.powerId} · {mod.tierId === null ? 'No tier chosen' : !power ? 'Official power unavailable (retained)' : `Tier ${mod.tierId} unavailable (retained)`}</span>}</span>
  </li>;
}

/** One structured STATS panel: every published fixed effect, imported existing powers, then planned mods. */
export function ItemStats({ selection, item, data }: { selection: EquipmentSelection; item: EquipmentDefinition | undefined; data: GameDataRepository }) {
  const fixed = item?.fixedEffects ?? [];
  const existing = selection.item.kind === 'database' ? [] : selection.item.instance.existingPowers;
  const planned = selection.candidateMods;
  const kinds: [Kind, boolean, string][] = [['base', fixed.length > 0, 'Base'], ['imported', existing.length > 0, '◇ Imported'], ['planned', planned.length > 0, 'Planned']];
  return <section className="item-stats" aria-label="Item stats">
    <div className="item-stats-heading"><h4>Stats</h4>
      <span className="item-stats-legend" aria-hidden="true">{kinds.filter(([, shown]) => shown).map(([kind, , text]) =>
        <span key={kind} className={`legend-${kind}`}>{text}</span>)}</span>
    </div>
    <ul className="stat-rows">
      {fixed.map((effect, index) => <li key={`b${index}`} className="stat-row stat-base" data-stat-kind="base" data-fixed-effect={index}>
        <Chip kind="base" label="Base" hue={null} title="Published fixed item effect" />
        <span className="stat-text"><EffectDescription description={effect.description} data={data} /></span>
      </li>)}
      {existing.map((mod, index) => <PowerRow key={`e${index}`} mod={mod} kind="imported" data={data} index={index} />)}
      {planned.map((mod, index) => <PowerRow key={`p${index}`} mod={mod} kind="planned" data={data} index={index} />)}
      {fixed.length + existing.length + planned.length === 0 && <li className="stat-row stat-empty muted">{item ? 'No fixed effects published. Choose Available mods below.' : 'No official base definition; no published stats.'}</li>}
    </ul>
  </section>;
}

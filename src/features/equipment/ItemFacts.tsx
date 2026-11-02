import type { ReactNode } from 'react';
import type { EquipmentDefinition } from '../../data/search/equipment';
import { EffectDescription } from '../mods/EffectDescription';
import { matchesEquipmentText } from '../../data/search/equipment';
import type { GameDataRepository } from '../../data/repository/repository';

/** Every published fixed effect is shown immediately, using the shared effect formatter. `stats` replaces the
 * plain list with the structured STATS panel for equipped items. */
export function ItemFacts({ item, data, query = '', stats }: { item: EquipmentDefinition; data: GameDataRepository; query?: string; stats?: ReactNode }) {
  const effects = [...(item.fixedEffects ?? [])].sort((a, b) =>
    Number(matchesEquipmentText(b.description, query)) - Number(matchesEquipmentText(a.description, query)));
  const source = data.getSourceMetadata(item.source);
  const acquisition = data.getItemAcquisition(item.id);
  return <div className="item-facts">
    <p className="item-meta">{item.level === null ? 'Unknown target level' : `Target level ${item.level}`}</p>
    <p className="item-requirements">Published skill requirements: {item.skillRequirements?.length
      ? item.skillRequirements.map(req => `${data.getSkill(req.skill.skillId ?? '')?.name ?? req.skill.sourceId} ${req.level}`).join(', ')
      : 'none published'}</p>
    {stats ?? (effects.length > 0 ? <ul className="item-effects">{effects.map((effect, index) => <li key={index}><EffectDescription description={effect.description} data={data} /></li>)}</ul>
      : <p className="muted">No fixed effects published.</p>)}
    <details className="item-more"><summary>Description &amp; official source</summary>
      <p className="item-description">{item.description || 'No description published.'}</p>
      <p>{item.id} · {item.slot} · {item.internalName}</p>
      <p>Target level is published CraftingTargetLevel, not a confirmed equip requirement.</p>
      <p>Official {source.gameDataVersion} · <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.dataset} source</a> · {source.recordId}</p>
      <details><summary>Exact published fixed effects</summary><ul className="item-effects">{item.fixedEffects?.map((effect, index) => <li key={index}><code>{effect.description}</code></li>)}</ul></details>
      {acquisition && <details><summary>Published acquisition data</summary><pre>{JSON.stringify(acquisition.entries, null, 2)}</pre></details>}
    </details>
  </div>;
}

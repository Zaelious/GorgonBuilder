import type { EquipmentDefinition } from '../../data/search/equipment';
import { EffectDescription } from '../mods/EffectDescription';
import { matchesEquipmentText } from '../../data/search/equipment';
import type { GameDataRepository } from '../../data/repository/repository';

function ItemRequirements({ item, data }: { item: EquipmentDefinition; data: GameDataRepository }) {
  return <>
    <p className="item-meta">{item.level === null ? 'Unknown target level' : `Target level ${item.level}`}</p>
    <p className="item-requirements">Published skill requirements: {item.skillRequirements?.length
      ? item.skillRequirements.map(req => `${data.getSkill(req.skill.skillId ?? '')?.name ?? req.skill.sourceId} ${req.level}`).join(', ')
      : 'none published'}</p>
  </>;
}

/** Published source facts, reusable inside the equipped item's single disclosure. */
export function PublishedItemDetails({ item, data, includeRequirements = true }: { item: EquipmentDefinition; data: GameDataRepository; includeRequirements?: boolean }) {
  const source = data.getSourceMetadata(item.source);
  const acquisition = data.getItemAcquisition(item.id);
  return <div className="item-source-details">
    {includeRequirements && <ItemRequirements item={item} data={data} />}
    <p className="item-description">{item.description || 'No description published.'}</p>
    <p>{item.id} · {item.slot} · {item.internalName}</p>
    <p>Target level is published CraftingTargetLevel, not a confirmed equip requirement.</p>
    <p>Official {source.gameDataVersion} · <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.dataset} source</a> · {source.recordId}</p>
    <details><summary>Exact published fixed effects</summary><ul className="item-effects">{item.fixedEffects?.map((effect, index) => <li key={index}><code>{effect.description}</code></li>)}</ul></details>
    {acquisition && <details><summary>Published acquisition data</summary><pre>{JSON.stringify(acquisition.entries, null, 2)}</pre></details>}
  </div>;
}

/** Picker results retain their compact level/requirements and immediately readable fixed effects. */
export function ItemFacts({ item, data, query = '' }: { item: EquipmentDefinition; data: GameDataRepository; query?: string }) {
  const effects = [...(item.fixedEffects ?? [])].sort((a, b) =>
    Number(matchesEquipmentText(b.description, query)) - Number(matchesEquipmentText(a.description, query)));
  return <div className="item-facts">
    <ItemRequirements item={item} data={data} />
    {effects.length > 0 ? <ul className="item-effects">{effects.map((effect, index) => <li key={index}><EffectDescription description={effect.description} data={data} /></li>)}</ul>
      : <p className="muted">No fixed effects published.</p>}
    <details className="item-more"><summary>Description &amp; official source</summary><PublishedItemDetails item={item} data={data} includeRequirements={false} /></details>
  </div>;
}

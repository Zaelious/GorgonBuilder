import type { ImportedItemInstance, ImportedTreasurePower } from '../../core/import';
import type { GameDataRepository } from '../../data/repository/repository';
import { powerName } from '../../data/search/treasure';
import { EffectDescriptions } from '../mods/EffectDescription';
import { importedSlot, itemLocation } from './inventory';

function Power({ entry, data }: { entry: ImportedTreasurePower; data: GameDataRepository }) {
  const power = entry.power?.id ? data.getTreasurePower(entry.power.id) : undefined;
  const tier = entry.selection ? data.getTreasureTier(entry.selection.powerId, entry.selection.tierId) : undefined;
  return <li className="imported-power">
    <strong>{power ? powerName(power) : entry.power ? String(entry.power.sourceId) : 'Unverified power entry'}</strong>
    <span className="import-source">Source power: {entry.power ? String(entry.power.sourceId) : 'unverified'} · Exact source tier: {entry.sourceTier === null ? 'missing' : JSON.stringify(entry.sourceTier)}</span>
    {tier ? <><span className="import-source">{entry.selection!.powerId} / {entry.selection!.tierId}</span><EffectDescriptions descriptions={tier.effectDescriptions} data={data} fallback="No published effect description" /></>
      : <p className="warning">{power ? 'Exact tier unresolved; original retained.' : 'Power unresolved or unverified; original retained.'}</p>}
    {!entry.power && <details><summary>Original entry</summary><pre>{JSON.stringify(entry.metadata, null, 2)}</pre></details>}
  </li>;
}

export function ImportedItemDetails({ item, data }: { item: ImportedItemInstance; data: GameDataRepository }) {
  const base = data.getItem(item.baseItemId ?? '');
  const treasure = item.treasurePowers.filter(entry => entry.kind === 'treasure');
  const imbues = item.treasurePowers.filter(entry => entry.kind === 'imbue');
  return <div className="imported-item-details">
    <p className="item-meta">Actual level {item.level ?? 'unknown'} · {item.rarity ?? 'Unknown rarity'} · {importedSlot(item, data) ?? 'Unknown slot'} · {itemLocation(item)}</p>
    <details className="item-more"><summary>Exact powers &amp; instance details</summary>
      <p>Original TypeID: {item.originalTypeId} · {base ? `${base.displayName} (${base.id})` : item.baseItemReference.status === 'resolved' ? 'Official non-equipment item' : 'Unresolved official item ID'}</p>
      {base && item.slot && item.slot !== base.slot && <p className="warning">Source slot {item.slot} differs from official base slot {base.slot}; source slot retained.</p>}
      <h4>Existing treasure powers ({treasure.length})</h4>
      {treasure.length ? <ul className="imported-powers">{treasure.map((entry, index) => <Power key={index} entry={entry} data={data} />)}</ul> : <p className="muted">None published for this instance.</p>}
      {imbues.length > 0 && <><h4>Imbues ({imbues.length})</h4><ul className="imported-powers">{imbues.map((entry, index) => <Power key={index} entry={entry} data={data} />)}</ul></>}
      <p className="import-source">Storage export: {item.provenance.exportedAt} · Report version {item.provenance.reportVersion}</p>
      <details className="item-more"><summary>Crafting, augmentation &amp; original item metadata</summary><pre>{JSON.stringify(item.metadata, null, 2)}</pre></details>
    </details>
  </div>;
}

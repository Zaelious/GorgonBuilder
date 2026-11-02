import { useState } from 'react';
import type { ImportedItemInstance } from '../../core/import';
import type { GameDataRepository } from '../../data/repository/repository';
import { EquipmentIcon } from '../equipment/EquipmentIcon';
import { ImportedItemDetails } from './ImportedItemDetails';
import { filterImportedItems, importedSlot, itemLocation, type ImportSession, type InventoryFilters } from './inventory';

export function MyItemsBrowser({ session, slot, data, readOnly, offhandConflict, onChoose }: {
  session: ImportSession | null; slot: string; data: GameDataRepository; readOnly: boolean;
  offhandConflict: boolean; onChoose: (item: ImportedItemInstance) => void;
}) {
  const [filters, setFilters] = useState<InventoryFilters>({ query: '', slot, minimum: null, maximum: null, rarity: '', location: '' });
  const [page, setPage] = useState(0);
  const items = session?.storage.items ?? [];
  const equipment = items.filter(item => importedSlot(item, data));
  const matches = filterImportedItems(items, filters, data);
  const lastPage = Math.max(0, Math.ceil(matches.length / 10) - 1);
  const currentPage = Math.min(page, lastPage);
  function update(patch: Partial<InventoryFilters>) { setFilters(previous => ({ ...previous, ...patch })); setPage(0); }
  const slots = [...new Set(equipment.map(item => importedSlot(item, data)!).map(value => value === 'OffHandShield' ? 'OffHand' : value))].sort();
  const rarities = [...new Set(equipment.map(item => item.rarity ?? 'Unknown rarity'))].sort();
  const locations = [...new Set(equipment.map(itemLocation))].sort();
  if (!session) return <p className="empty-state">Use Import Character above the planner to load your reports. The owned inventory is held in this page only; selected gear stays in your local draft.</p>;
  return <div className="my-items-browser">
    <label htmlFor="my-items-search">Search My Items</label><input id="my-items-search" type="search" value={filters.query} placeholder="Partial item name or TypeID…" onChange={event => update({ query: event.target.value })} />
    <div className="my-items-filters"><div><label htmlFor="my-items-slot">Equipment slot</label><select id="my-items-slot" value={filters.slot} disabled={Boolean(slot)} onChange={event => update({ slot: event.target.value })}><option value="">All equipment slots</option>{[...new Set([...(slot ? [slot] : []), ...slots])].map(value => <option key={value} value={value}>{value === 'OffHand' ? 'OffHand / Shield' : value}</option>)}</select></div>
      {(['minimum', 'maximum'] as const).map(key => <div key={key}><label htmlFor={`my-items-${key}`}>{key === 'minimum' ? 'Minimum' : 'Maximum'} actual level</label><input id={`my-items-${key}`} type="number" min="0" step="1" value={filters[key] ?? ''} placeholder="Any" onChange={event => {
        const value = event.target.value === '' ? null : Number(event.target.value);
        if (value === null || (Number.isSafeInteger(value) && value >= 0)) update({ [key]: value });
      }} /></div>)}
      <div><label htmlFor="my-items-rarity">Rarity</label><select id="my-items-rarity" value={filters.rarity} onChange={event => update({ rarity: event.target.value })}><option value="">All rarities</option>{rarities.map(value => <option key={value}>{value}</option>)}</select></div>
      <div><label htmlFor="my-items-location">Inventory / storage location</label><select id="my-items-location" value={filters.location} onChange={event => update({ location: event.target.value })}><option value="">All locations</option>{locations.map(value => <option key={value}>{value}</option>)}</select></div>
    </div>
    <p className="muted picker-help">Actual owned-item levels; database crafting targets are not used. A level bound excludes unknown levels. {items.length - equipment.length} non-equipment entries are hidden.</p>
    {readOnly && <p className="warning">This draft is protected. You can inspect imported gear; equipment editing is disabled.</p>}
    {offhandConflict && <p className="warning">Resolve the saved offhand conflict before selecting an offhand item.</p>}
    <p className="equipment-results-title muted" aria-live="polite">{matches.length} matching owned {matches.length === 1 ? 'instance' : 'instances'} · Page {currentPage + 1} of {lastPage + 1}</p>
    {!matches.length && <p className="empty-state">No owned equipment matches. Change the filters or import another Storage report.</p>}
    <div className="equipment-results">{matches.slice(currentPage * 10, currentPage * 10 + 10).map(item => {
      const slot = importedSlot(item, data)!;
      const base = data.getItem(item.baseItemId ?? '');
      return <article className="equipment-result" key={item.sourcePath} data-import-path={item.sourcePath}>
        <div className="equipment-result-heading"><EquipmentIcon slot={slot} iconId={base?.iconId} version={data.gameDataVersion} /><h3>{item.displayName}</h3><button type="button" disabled={readOnly || (offhandConflict && ['OffHand', 'OffHandShield'].includes(slot))} onClick={() => onChoose(item)} aria-label={`Equip owned ${item.displayName}, ${item.sourcePath}`}>Equip</button></div>
        <p className="import-source">Owned instance {Number(item.sourcePath.split('/').at(-1)) + 1} · TypeID {item.originalTypeId}{item.baseItemReference.status !== 'resolved' && ' · Unresolved item ID'}</p>
        <ImportedItemDetails item={item} data={data} />
      </article>;
    })}</div>
    {lastPage > 0 && <nav className="equipment-pages" aria-label="My Items pages"><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
  </div>;
}

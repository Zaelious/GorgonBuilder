import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameDataRepository } from '../../data/repository/repository';
import { filterEquipment } from '../../data/search/equipment';
import { ItemFacts } from './ItemFacts';
import { EquipmentIcon } from './EquipmentIcon';
import { isOffhandSlot } from '../../app/editor/build-editor';
import type { ImportedItemInstance } from '../../core/import';
import type { ImportSession } from '../import/inventory';
import { MyItemsBrowser } from '../import/MyItemsBrowser';

interface Props {
  slot: string;
  data: GameDataRepository;
  minimum: number | null;
  preferenceProtected: boolean;
  preferenceNotice: ReactNode;
  onMinimumChange: (value: number | null) => void;
  readOnly: boolean;
  replacing: boolean;
  returnFocus: HTMLElement | null;
  fallbackFocus: HTMLElement | null;
  onChoose: (itemId: string) => void;
  imported: ImportSession | null;
  initialSource?: 'database' | 'owned';
  offhandConflict: boolean;
  onChooseImported: (item: ImportedItemInstance) => void;
  onClose: () => void;
}

const PAGE_SIZE = 10;

export function EquipmentPicker({ slot, data, minimum, preferenceProtected, preferenceNotice, onMinimumChange, readOnly, replacing, returnFocus, fallbackFocus, onChoose, onClose, imported, initialSource = 'database', offhandConflict, onChooseImported }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [page, setPage] = useState(0);
  const [source, setSource] = useState(initialSource);
  // 3,078 definitions: measured before adding an index/cache. Only 10 results
  // render at once; the already loaded repository is the only data source.
  const offhand = isOffhandSlot(slot);
  const candidates = offhand ? data.items.filter(item => isOffhandSlot(item.slot)) : data.items;
  const matches = filterEquipment(candidates, { slot: offhand || !slot ? undefined : slot, query, minimumTargetLevel: minimum, includeUnknownTargetLevel: includeUnknown });
  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const results = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  useEffect(() => {
    const element = dialog.current!;
    const opener = returnFocus ?? document.activeElement;
    element.showModal();
    element.querySelector<HTMLInputElement>('input[type=search]')?.focus();
    return () => {
      if (element.open) element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      else if (fallbackFocus?.isConnected) fallbackFocus.focus();
    };
  }, [returnFocus, fallbackFocus]);

  function changePage(next: number) {
    setPage(next);
    dialog.current?.querySelector<HTMLElement>('.equipment-results-title')?.focus();
    dialog.current?.querySelector('.equipment-results-title')?.scrollIntoView({ block: 'nearest' });
  }

  return <dialog ref={dialog} className="ability-picker equipment-picker" aria-labelledby="equipment-picker-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      // Search inputs can consume Escape to clear their text before the native
      // dialog cancel event. Always close once and restore the opener's focus.
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}>
    <div className="picker-content">
      <header className="dialog-heading"><div><p className="eyebrow">{slot}</p><h2 id="equipment-picker-title">{replacing ? 'Replace equipment' : 'Choose equipment'}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close equipment picker">×</button></header>
      <div className="equipment-source-buttons" aria-label="Equipment source"><button type="button" aria-pressed={source === 'database'} onClick={() => setSource('database')}>Official database</button><button type="button" aria-pressed={source === 'owned'} onClick={() => setSource('owned')}>My Items{imported ? ` (${imported.storage.items.length})` : ''}</button></div>
      {source === 'owned' ? <MyItemsBrowser session={imported} slot={slot} data={data} readOnly={readOnly} offhandConflict={offhandConflict} onChoose={onChooseImported} /> : <>
      <label htmlFor="equipment-search">Search equipment</label>
      <input id="equipment-search" type="search" autoFocus value={query} placeholder="Name, fixed effect, keyword, or ID…" onChange={event => { setQuery(event.target.value); setPage(0); }} />
      <div className="equipment-filters"><div><label htmlFor="minimum-target-level">Minimum target level</label>
        <input id="minimum-target-level" type="number" min="0" step="1" placeholder="No minimum" value={minimum ?? ''} disabled={preferenceProtected}
          aria-describedby="target-level-help" onChange={event => {
            const value = event.target.value === '' ? null : Number(event.target.value);
            if (value !== null && (!Number.isSafeInteger(value) || value < 0)) return;
            onMinimumChange(value); setPage(0);
          }} /></div>
        <label className="equipment-checkbox"><input type="checkbox" checked={includeUnknown} onChange={event => { setIncludeUnknown(event.target.checked); setPage(0); }} />Include unknown target level</label>
      </div>
      <p id="target-level-help" className="muted picker-help">Published crafting target level; not a confirmed equip requirement. Clear the minimum to show all levels, including unknowns. Filters keep your equipped items.</p>
      {preferenceNotice}
      {offhand && <p className="muted picker-help">Offhand weapons and shields share one position. Choosing either replaces the current item and retains its official slot type.</p>}
      {replacing && <p className="muted picker-help">Replacing changes this item only. Staged mods and Spark settings are retained.</p>}
      <p className="equipment-results-title muted" tabIndex={-1} aria-live="polite">{matches.length} matching {matches.length === 1 ? 'item' : 'items'}{matches.length > PAGE_SIZE && ` · Page ${currentPage + 1} of ${lastPage + 1}`}</p>
      {matches.length === 0 && <p className="empty-state">No official equipment matches. Try another search, a lower minimum, or include unknown target levels.</p>}
      <div className="equipment-results">{results.map(item => <article className="equipment-result" key={item.id}>
        <div className="equipment-result-heading"><EquipmentIcon slot={item.slot} iconId={item.iconId} version={data.gameDataVersion} /><h3>{item.displayName}</h3><button type="button" disabled={readOnly || (offhandConflict && isOffhandSlot(item.slot))} onClick={() => onChoose(item.id)} aria-label={`Equip ${item.displayName}, ${item.id}`}>{replacing ? 'Replace' : 'Equip'}</button></div>
        {offhand && <p className="item-meta">{item.slot === 'OffHandShield' ? 'Shield' : 'Offhand weapon'} · {item.slot}</p>}
        <ItemFacts item={item} data={data} query={query} />
      </article>)}</div>
      {matches.length > PAGE_SIZE && <nav className="equipment-pages" aria-label="Equipment results pages">
        <button type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>Previous</button>
        <button type="button" disabled={currentPage === lastPage} onClick={() => changePage(currentPage + 1)}>Next</button>
      </nav>}
      </>}
    </div>
  </dialog>;
}

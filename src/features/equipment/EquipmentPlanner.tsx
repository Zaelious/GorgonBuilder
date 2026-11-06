import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sameImportedInstance } from '../../core/build/imported-identity';
import { sameLoadoutPosition } from '../../core/build/slots';
import { getUniqueActiveSkillIds } from '../../core/build/document';
import { EquipmentMods } from '../mods/EquipmentMods';
import { ItemStats } from '../mods/ItemStats';
import { DEFAULT_MOD_BROWSER, ModBrowserControls } from '../mods/ModBrowserControls';
import type { BuildDocument, EquipmentSelection } from '../../core/build/document';
import type { BuildEdit } from '../../app/editor/build-editor';
import { isOffhandSlot } from '../../app/editor/build-editor';
import type { GameDataRepository } from '../../data/repository/repository';
import { EquipmentPicker } from './EquipmentPicker';
import { EquipmentIcon } from './EquipmentIcon';
import { PublishedItemDetails } from './ItemFacts';
import { ImportedItemDetails, ImportedItemWarnings } from '../import/ImportedItemDetails';
import { importedSlot, restoredImportedItem, selectedImportedInstance, type ImportSession } from '../import/inventory';
import { equipmentRowMatches, prepareModSearch, selectAvailableMods } from '../../data/search/available-mods';
import { isOffensiveSparkSlot } from '../../core/sparks';
import { SparkEditor, sparkRowNote } from '../sparks/SparkEditor';
import { indexTreasurePowers, normalizeTreasureSearch } from '../../data/search/treasure';
import './equipment.css';

interface Props {
  build: BuildDocument;
  data: GameDataRepository;
  onEdit: (edit: BuildEdit) => void;
  readOnly: boolean;
  minimum: number | null;
  preferenceProtected: boolean;
  preferenceNotice: ReactNode;
  onMinimumChange: (value: number | null) => void;
  imported?: ImportSession | null;
}

/** Sparks belong to the physical item (T0015): replacing it clears them, so say so in the existing confirmation. */
function sparkReplacementNote(previous: EquipmentSelection | undefined): string {
  return previous && previous.sparks.mode !== 'none' ? ' Its Mastery Spark settings belong to the replaced item and will be cleared.' : '';
}

const PRIMARY_SLOTS = ['Head', 'Chest', 'Legs', 'Hands', 'Feet', 'Ring', 'Necklace', 'MainHand', 'OffHand'] as const;

export function EquipmentPlanner({ build, data, onEdit, readOnly, minimum, preferenceProtected, preferenceNotice, onMinimumChange, imported = null }: Props) {
  const skillIds = useMemo(() => getUniqueActiveSkillIds(build), [build.skillSlotA, build.skillSlotB]);
  const section = useRef<HTMLElement>(null);
  const lastFocusedControl = useRef<HTMLElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [modBrowser, setModBrowser] = useState(DEFAULT_MOD_BROWSER);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const searching = normalizeTreasureSearch(modBrowser.query).length > 0;
  const searchIndex = useMemo(() => indexTreasurePowers(data.treasurePowers), [data]);
  const definitionIds = JSON.stringify(build.equipment.map(selection => selection.item.kind === 'database'
    ? selection.item.itemId : selection.item.instance.baseItemId));
  const prepared = useMemo(() => (JSON.parse(definitionIds) as (string | null)[]).map(id =>
    prepareModSearch({ item: id === null ? undefined : data.getItem(id), skillIds }, data, searchIndex)),
  [definitionIds, skillIds, data, searchIndex]);
  const available = useMemo(() => searching ? build.equipment.map((selection, index) => {
    const itemId = selection.item.kind === 'database' ? selection.item.itemId : selection.item.instance.baseItemId;
    return selectAvailableMods(selection, { item: itemId === null ? undefined : data.getItem(itemId), skillIds },
      build.skillSlotA.skillId, build.skillSlotB.skillId, modBrowser, data, searchIndex, prepared[index]);
  }) : [], [searching, build.equipment, build.skillSlotA.skillId, build.skillSlotB.skillId, skillIds, modBrowser, data, searchIndex, prepared]);
  useLayoutEffect(() => {
    const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : lastFocused.current;
    // Selecting the last match can hide its expanded row. Return to the shared search, never to a hidden control.
    if (focused?.isConnected && section.current?.contains(focused) && (focused.closest('[hidden]') ||
      (document.activeElement === document.body && lastFocusedControl.current && !lastFocusedControl.current.isConnected))) {
      section.current.querySelector<HTMLInputElement>('[aria-label="Search treasure powers"]')?.focus({ preventScroll: true });
    }
  });
  const officialSlots = new Set(data.items.map(item => item.slot));
  // Offhand types share a position; saved selections retain canonical slot values.
  const otherSlots = [...new Set([...officialSlots, ...build.equipment.map(selection => selection.slot)])]
    .filter(slot => !PRIMARY_SLOTS.some(primary => primary === slot) && slot !== 'OffHandShield').sort();
  const [picker, setPicker] = useState<{ mode: 'general' | 'slot'; slot: string; index: number | null; returnFocus: HTMLElement; fallbackFocus: HTMLElement | null; initialSource?: 'database' | 'owned' } | null>(null);
  const offhandCount = build.equipment.filter(selection => isOffhandSlot(selection.slot)).length;

  function definition(selection: EquipmentSelection) {
    const id = selection.item.kind === 'database' ? selection.item.itemId : selection.item.instance.baseItemId;
    return id === null ? undefined : data.getItem(id);
  }
  function name(selection: EquipmentSelection) {
    return (selection.item.kind !== 'database' ? selection.item.instance.displayName : undefined)
      ?? definition(selection)?.displayName
      ?? (selection.item.kind === 'database' ? selection.item.itemId : selection.item.instance.baseItemId ?? 'Manual item');
  }
  function openPicker(slot: string, index: number | null, opener: HTMLButtonElement) {
    setPicker({ mode: 'slot', slot: isOffhandSlot(slot) ? 'OffHand' : slot, index, returnFocus: opener, fallbackFocus: opener.closest('.equipment-row')?.querySelector<HTMLElement>('summary') ?? null });
  }
  function clearSelection(index: number): boolean {
    if (readOnly) return false;
    const selection = build.equipment[index];
    if (!selection) return false;
    const retainedData = selection.item.kind !== 'database' || selection.candidateMods.length > 0 || selection.sparks.mode !== 'none';
    if (retainedData && !window.confirm(`Clear ${name(selection)} and its saved instance, staged mods, and Spark settings from this slot?`)) return false;
    onEdit({ type: 'equipment-clear', index });
    return true;
  }
  function renderSelection(selection: EquipmentSelection, index: number, multiple: boolean) {
    const item = definition(selection);
    const owned = selection.item.kind === 'imported' ? restoredImportedItem(selection.item.instance, data) : null;
    const conflict = isOffhandSlot(selection.slot) && offhandCount > 1;
    return <article className="equipment-selection" key={index} data-selection-index={index}>
      {multiple && <p className="equipment-entry-label">Saved entry {index + 1}: {name(selection)}</p>}
      {!item && <p className="warning">This saved selection has no available official base definition. It is retained.</p>}
      {item && !sameLoadoutPosition(item.slot, selection.slot) && <p className="warning">Published slot is {item.slot}; saved slot {selection.slot} is retained.</p>}
      {owned && <ImportedItemWarnings item={owned} data={data} historical />}
      <ItemStats selection={selection} item={item} data={data} skillA={build.skillSlotA.skillId} skillB={build.skillSlotB.skillId} />
      {/* T0015-R1 order: STATS → Mastery Sparks → treasure mods → actions → details & source. */}
      {(isOffensiveSparkSlot(selection.slot) || selection.sparks.mode !== 'none') && <div className="equipment-sparks">
        <SparkEditor selection={selection} equipmentIndex={index} activeSkillIds={skillIds} data={data} onEdit={onEdit} readOnly={readOnly} offhandConflict={conflict} /></div>}
      <EquipmentMods searchIndex={searchIndex} preparedSearch={prepared[index]} browser={modBrowser} selection={selection} equipmentIndex={index} item={item} skillIds={skillIds} skillA={build.skillSlotA.skillId} skillB={build.skillSlotB.skillId} data={data} onEdit={onEdit} readOnly={readOnly} available={available[index]} expanded={expanded.has(isOffhandSlot(selection.slot) ? 'OffHand' : selection.slot)} />
      <div className="equipment-actions"><button type="button" disabled={readOnly || conflict || !officialSlots.has(selection.slot)} onClick={event => openPicker(selection.slot, index, event.currentTarget)}>Replace {isOffhandSlot(selection.slot) ? 'OffHand' : selection.slot}</button>
        <button type="button" disabled={readOnly} onClick={event => {
          if (!clearSelection(index)) return;
          // Always-visible primary row summaries survive clearing their selection.
          const summary = event.currentTarget.closest('.equipment-row')?.querySelector<HTMLElement>('summary');
          const otherSummary = document.getElementById('other-equipment-summary');
          requestAnimationFrame(() => (summary?.isConnected ? summary : otherSummary)?.focus());
        }}>Clear {selection.slot}</button>
        {conflict && <button type="button" disabled={readOnly} aria-label={`Keep ${name(selection)} (${selection.slot}) in the offhand position`} onClick={event => {
          const removed = build.equipment.filter((entry, entryIndex) => isOffhandSlot(entry.slot) && entryIndex !== index);
          if (!window.confirm(`Keep ${name(selection)} (${selection.slot}) and remove ${removed.map(entry => `${name(entry)} (${entry.slot})`).join(', ')}? Removed entries lose their saved instance data, staged mods, and Spark settings. The kept entry and all its data are retained.`)) return;
          const summary = event.currentTarget.closest('.equipment-row')?.querySelector<HTMLElement>('summary');
          onEdit({ type: 'equipment-resolve-offhand', keepIndex: index });
          requestAnimationFrame(() => summary?.focus());
        }}>Keep this item</button>}
      </div>
      <details className="item-more item-details-source"><summary>Item details &amp; source</summary>
        <p className="muted equipment-selection-type">{selection.slot}{selection.item.kind !== 'database' && ` · ${selection.item.kind} instance`}</p>
        {owned && <ImportedItemDetails item={owned} data={data} historical embedded />}
        {selection.item.kind !== 'database' && <details className="item-more"><summary>Saved {selection.item.kind} instance</summary><pre>{JSON.stringify(selection.item.instance, null, 2)}</pre></details>}
        {item && <PublishedItemDetails item={item} data={data} />}
      </details>
    </article>;
  }
  function rowCount(slot: string, selected = false) {
    return build.equipment.reduce((total, selection, index) => total +
      (sameLoadoutPosition(selection.slot, slot) ? (selected ? available[index]?.selectedCount : available[index]?.count) ?? 0 : 0), 0);
  }
  const matchingRows = [...PRIMARY_SLOTS, ...otherSlots].filter(slot => rowCount(slot) + rowCount(slot, true) > 0).length;
  function renderRow(slot: string) {
    const slots = slot === 'OffHand' ? ['OffHand', 'OffHandShield'] : [slot];
    const selections = build.equipment.map((selection, index) => ({ selection, index })).filter(entry => slots.includes(entry.selection.slot));
    const first = selections[0]?.selection;
    const item = first ? definition(first) : undefined;
    return <details className={`equipment-row${first ? ' has-equipment' : ''}`} key={slot} hidden={!equipmentRowMatches(rowCount(slot) + rowCount(slot, true), searching, showAll)} data-equipment-row={slot} data-available-count={rowCount(slot)} data-selected-count={rowCount(slot, true)} onToggle={event => {
      if (event.target !== event.currentTarget) return;
      const open = event.currentTarget.open;
      setExpanded(previous => {
        if (previous.has(slot) === open) return previous;
        const next = new Set(previous); if (open) next.add(slot); else next.delete(slot); return next;
      });
    }}>
      <summary onClick={event => {
        const open = !(event.currentTarget.parentElement as HTMLDetailsElement).open;
        setExpanded(previous => { const next = new Set(previous); if (open) next.add(slot); else next.delete(slot); return next; });
      }}><EquipmentIcon slot={first?.slot ?? slot} iconId={item?.iconId} version={data.gameDataVersion} />
        <span className="equipment-slot-name">{slot}</span>
        <span className="equipment-row-name">{first ? `${name(first)}${selections.length > 1 ? ` + ${selections.length - 1} more` : ''}` : 'No gear selected'}</span>
        {searching && <span className="equipment-mod-count">{rowCount(slot)} Available · {rowCount(slot, true)} Selected</span>}
        {first && <small className={slot === 'OffHand' && selections.length > 1 ? 'warning' : undefined}>{selections.length > 1 ? `${slot === 'OffHand' ? 'Conflict · ' : ''}${selections.length} saved` : `${first.slot === 'OffHandShield' ? 'Shield · ' : ''}${first.item.kind !== 'database' ? `${first.item.kind} instance` : item?.level == null ? 'Unknown target level' : `Target ${item.level}`}${sparkRowNote(first) ? ` · ${sparkRowNote(first)}` : ''}`}</small>}
      </summary>
      <div className="equipment-row-content">
        {slot === 'OffHand' && selections.length > 1 && <p className="warning offhand-help" role="alert">This saved build has multiple offhand items sharing one position. All entries are retained. Choose an item to keep or clear individual entries before replacing equipment.</p>}
        <div className="equipment-canonical-slot" data-equipment-slot={slot}>
          {selections.map(entry => renderSelection(entry.selection, entry.index, selections.length > 1))}
          {selections.length === 0 && <button type="button" disabled={!officialSlots.has(slot)} aria-label={`Browse ${slot} items`} onClick={event => openPicker(slot, null, event.currentTarget)}>Choose gear</button>}
        </div>
      </div>
    </details>;
  }

  return <section ref={section} data-effective-query={modBrowser.query} onFocusCapture={event => { lastFocusedControl.current = event.target; lastFocused.current = event.target.closest<HTMLElement>('.equipment-row') ?? event.target; }} className="equipment-section" aria-labelledby="equipment-title">
    <div className="section-heading"><h2 id="equipment-title"><svg className="section-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 16v-5a7 7 0 0 1 14 0v5M5 12h14M9 12v7m6-7v7M5 16l4 3h6l4-3" /></svg>Equipment</h2><button type="button" disabled={!imported} onClick={event => setPicker({ mode: 'general', slot: '', index: null, returnFocus: event.currentTarget, fallbackFocus: event.currentTarget, initialSource: 'owned' })}>My Items{imported ? ` (${imported.storage.items.filter(item => importedSlot(item, data)).length})` : ''}</button><span className="muted">{build.equipment.length} selected</span></div>
    <ModBrowserControls browser={modBrowser} onChange={next => {
      if (!normalizeTreasureSearch(next.query)) setShowAll(false);
      setModBrowser(next);
    }} />
    {searching && <div className="equipment-search-status">
      <p role="status">{matchingRows === 0 ? 'No equipment has matching Available or Selected mods. Try a shorter search, different skills or Mod Browser Settings.'
        : `${matchingRows} equipment ${matchingRows === 1 ? 'row has' : 'rows have'} matching Available or Selected mods.`}</p>
      <label><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} />Show all equipment</label>
    </div>}
    {!picker && preferenceNotice}
    <div className="equipment-primary">{PRIMARY_SLOTS.map(renderRow)}</div>
    <details className="equipment-other" hidden={searching && !showAll && !otherSlots.some(slot => rowCount(slot) + rowCount(slot, true) > 0)}><summary id="other-equipment-summary">Other slots{build.equipment.some(selection => otherSlots.includes(selection.slot)) && <span className="muted"> · {build.equipment.filter(selection => otherSlots.includes(selection.slot)).length} selected</span>}</summary>
      {otherSlots.map(renderRow)}
    </details>
    {picker && <EquipmentPicker {...picker} equipment={build.equipment} data={data} imported={imported} offhandConflict={offhandCount > 1} minimum={minimum} preferenceProtected={preferenceProtected} preferenceNotice={preferenceNotice} onMinimumChange={onMinimumChange} readOnly={readOnly} replacing={picker.index !== null}
      onClose={() => setPicker(null)} onChoose={itemId => {
        if (readOnly) return;
        const item = data.getItem(itemId);
        if (!item || (offhandCount > 1 && isOffhandSlot(item.slot))) return;
        const found = picker.slot ? picker.index : build.equipment.findIndex(entry => isOffhandSlot(item.slot) ? isOffhandSlot(entry.slot) : entry.slot === item.slot);
        const index = found === -1 ? null : found;
        const previous = index === null ? undefined : build.equipment[index];
        // Re-picking the identical item is a no-op edit and never clears Sparks.
        const sparks = previous?.item.kind === 'database' && previous.item.itemId === itemId ? '' : sparkReplacementNote(previous);
        if (previous && previous.item.kind !== 'database' && !window.confirm(`Replace this saved instance with a database definition? Its instance metadata and existing powers will be removed.${sparks} Staged candidate mods are retained.`)) return;
        if (previous?.item.kind === 'database' && (!picker.slot || sparks) && !window.confirm(`Replace the selected database item in this slot?${sparks} Staged candidate mods are retained.`)) return;
        onEdit({ type: 'equipment-equip', slot: item.slot, index, itemId });
        setPicker(null);
      }} onChooseImported={item => {
        if (readOnly) return;
        const slot = importedSlot(item, data);
        if (!slot || (offhandCount > 1 && isOffhandSlot(slot)) || (picker.mode === 'slot' && (isOffhandSlot(picker.slot) ? !isOffhandSlot(slot) : slot !== picker.slot))) return;
        const instance = selectedImportedInstance(item);
        if (build.equipment.some(entry => entry.item.kind === 'imported' && sameImportedInstance(entry.item.instance, instance))) return;
        const found = picker.slot ? picker.index : build.equipment.findIndex(entry => isOffhandSlot(slot) ? isOffhandSlot(entry.slot) : entry.slot === slot);
        const index = found === -1 ? null : found;
        if (index !== null && !window.confirm(`Replace the selected item with this owned instance? The previous item and its existing powers/metadata will be replaced.${sparkReplacementNote(build.equipment[index])} Staged candidate mods are retained.`)) return;
        onEdit({ type: 'equipment-import', slot, index, instance });
        if (picker.mode === 'slot') setPicker(null);
      }} onUnequipImported={item => {
        const instance = selectedImportedInstance(item);
        const index = build.equipment.findIndex(entry => entry.item.kind === 'imported' && sameImportedInstance(entry.item.instance, instance));
        if (index !== -1 && clearSelection(index) && picker.mode === 'slot') setPicker(null);
      }} />}
  </section>;
}

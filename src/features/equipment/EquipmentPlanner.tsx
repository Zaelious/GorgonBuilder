import { useMemo, useState, type ReactNode } from 'react';
import { getUniqueActiveSkillIds } from '../../core/build/document';
import { EquipmentMods } from '../mods/EquipmentMods';
import { ItemStats } from '../mods/ItemStats';
import type { BuildDocument, EquipmentSelection } from '../../core/build/document';
import type { BuildEdit } from '../../app/editor/build-editor';
import { isOffhandSlot } from '../../app/editor/build-editor';
import type { GameDataRepository } from '../../data/repository/repository';
import { EquipmentPicker } from './EquipmentPicker';
import { EquipmentIcon } from './EquipmentIcon';
import { ItemFacts } from './ItemFacts';
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
}

const PRIMARY_SLOTS = ['Head', 'Chest', 'Legs', 'Hands', 'Feet', 'Ring', 'Necklace', 'MainHand', 'OffHand'] as const;

export function EquipmentPlanner({ build, data, onEdit, readOnly, minimum, preferenceProtected, preferenceNotice, onMinimumChange }: Props) {
  const skillIds = useMemo(() => getUniqueActiveSkillIds(build), [build.skillSlotA, build.skillSlotB]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const officialSlots = new Set(data.items.map(item => item.slot));
  // Offhand types share a position; saved selections retain canonical slot values.
  const otherSlots = [...new Set([...officialSlots, ...build.equipment.map(selection => selection.slot)])]
    .filter(slot => !PRIMARY_SLOTS.some(primary => primary === slot) && slot !== 'OffHandShield').sort();
  const [picker, setPicker] = useState<{ slot: string; index: number | null; returnFocus: HTMLElement; fallbackFocus: HTMLElement | null } | null>(null);
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
    setPicker({ slot: isOffhandSlot(slot) ? 'OffHand' : slot, index, returnFocus: opener, fallbackFocus: opener.closest('.equipment-row')?.querySelector<HTMLElement>('summary') ?? null });
  }
  function renderSelection(selection: EquipmentSelection, index: number, multiple: boolean) {
    const item = definition(selection);
    const conflict = isOffhandSlot(selection.slot) && offhandCount > 1;
    return <article className="equipment-selection" key={index} data-selection-index={index}>
      {multiple && <p className="equipment-entry-label">Saved entry {index + 1}: {name(selection)}</p>}
      <p className="muted equipment-selection-type">{selection.slot}{selection.item.kind !== 'database' && ` · ${selection.item.kind} instance`}</p>
      {item ? <ItemFacts item={item} data={data} stats={<ItemStats selection={selection} item={item} data={data} />} />
        : <><p className="warning">This saved selection has no available official base definition. It is retained.</p><ItemStats selection={selection} item={undefined} data={data} /></>}
      {item && item.slot !== selection.slot && <p className="warning">Published slot is {item.slot}; saved slot {selection.slot} is retained.</p>}
      {selection.item.kind !== 'database' && <details className="item-more"><summary>Saved {selection.item.kind} instance</summary><pre>{JSON.stringify(selection.item.instance, null, 2)}</pre></details>}
      <EquipmentMods selection={selection} equipmentIndex={index} item={item} skillIds={skillIds} data={data} onEdit={onEdit} readOnly={readOnly} expanded={expanded.has(isOffhandSlot(selection.slot) ? 'OffHand' : selection.slot)} />
      <div className="equipment-actions"><button type="button" disabled={readOnly || conflict || !officialSlots.has(selection.slot)} onClick={event => openPicker(selection.slot, index, event.currentTarget)}>Replace {isOffhandSlot(selection.slot) ? 'OffHand' : selection.slot}</button>
        <button type="button" disabled={readOnly} onClick={event => {
          const retainedData = selection.item.kind !== 'database' || selection.candidateMods.length > 0 || selection.sparks.mode !== 'none';
          if (retainedData && !window.confirm(`Clear ${name(selection)} and its saved instance, staged mods, and Spark settings from this slot?`)) return;
          // Always-visible primary row summaries survive clearing their selection.
          const summary = event.currentTarget.closest('.equipment-row')?.querySelector<HTMLElement>('summary');
          const otherSummary = document.getElementById('other-equipment-summary');
          onEdit({ type: 'equipment-clear', index });
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
    </article>;
  }
  function renderRow(slot: string) {
    const slots = slot === 'OffHand' ? ['OffHand', 'OffHandShield'] : [slot];
    const selections = build.equipment.map((selection, index) => ({ selection, index })).filter(entry => slots.includes(entry.selection.slot));
    const first = selections[0]?.selection;
    const item = first ? definition(first) : undefined;
    return <details className={`equipment-row${first ? ' has-equipment' : ''}`} key={slot} data-equipment-row={slot} onToggle={event => {
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
        {first && <small className={slot === 'OffHand' && selections.length > 1 ? 'warning' : undefined}>{selections.length > 1 ? `${slot === 'OffHand' ? 'Conflict · ' : ''}${selections.length} saved` : `${first.slot === 'OffHandShield' ? 'Shield · ' : ''}${first.item.kind !== 'database' ? `${first.item.kind} instance` : item?.level == null ? 'Unknown target level' : `Target ${item.level}`}`}</small>}
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

  return <section className="equipment-section" aria-labelledby="equipment-title">
    <div className="section-heading"><h2 id="equipment-title">Equipment</h2><span className="muted">{build.equipment.length} selected</span></div>
    {!picker && preferenceNotice}
    <div className="equipment-primary">{PRIMARY_SLOTS.map(renderRow)}</div>
    <details className="equipment-other"><summary id="other-equipment-summary">Other slots{build.equipment.some(selection => otherSlots.includes(selection.slot)) && <span className="muted"> · {build.equipment.filter(selection => otherSlots.includes(selection.slot)).length} selected</span>}</summary>
      {otherSlots.map(renderRow)}
    </details>
    {picker && <EquipmentPicker {...picker} data={data} minimum={minimum} preferenceProtected={preferenceProtected} preferenceNotice={preferenceNotice} onMinimumChange={onMinimumChange} readOnly={readOnly} replacing={picker.index !== null}
      onClose={() => setPicker(null)} onChoose={itemId => {
        const previous = picker.index === null ? undefined : build.equipment[picker.index];
        if (previous && previous.item.kind !== 'database' && !window.confirm('Replace this saved instance with a database definition? Its instance metadata and existing powers will be removed. Staged mods and Spark settings are retained.')) return;
        const item = data.getItem(itemId);
        if (item) onEdit({ type: 'equipment-equip', slot: item.slot, index: picker.index, itemId });
        setPicker(null);
      }} />}
  </section>;
}

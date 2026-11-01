import { useState, type ReactNode } from 'react';
import type { BuildDocument, EquipmentSelection } from '../../core/build/document';
import type { BuildEdit } from '../../app/editor/build-editor';
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
  const officialSlots = new Set(data.items.map(item => item.slot));
  // Presentation groups only. Every edit and saved selection keeps its exact slot.
  const otherSlots = [...new Set([...officialSlots, ...build.equipment.map(selection => selection.slot)])]
    .filter(slot => !PRIMARY_SLOTS.some(primary => primary === slot) && slot !== 'OffHandShield').sort();
  const [picker, setPicker] = useState<{ slot: string; index: number | null; returnFocus: HTMLElement; fallbackFocus: HTMLElement | null } | null>(null);

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
    setPicker({ slot, index, returnFocus: opener, fallbackFocus: opener.closest('.equipment-row')?.querySelector<HTMLElement>('summary') ?? null });
  }
  function renderSelection(selection: EquipmentSelection, index: number) {
    const item = definition(selection);
    return <article className="equipment-selection" key={index} data-selection-index={index}>
      <div className="equipment-selection-heading"><EquipmentIcon slot={selection.slot} iconId={item?.iconId} version={data.gameDataVersion} />
        <h3>{name(selection)}</h3><span className="muted">{selection.slot}{selection.item.kind !== 'database' && ` · ${selection.item.kind} instance`}</span></div>
      {item ? <ItemFacts item={item} data={data} /> : <p className="warning">This saved selection has no available official base definition. It is retained.</p>}
      {item && item.slot !== selection.slot && <p className="warning">Published slot is {item.slot}; saved slot {selection.slot} is retained.</p>}
      {selection.item.kind !== 'database' && <details className="item-more"><summary>Saved {selection.item.kind} instance</summary><pre>{JSON.stringify(selection.item.instance, null, 2)}</pre></details>}
      {(selection.candidateMods.length > 0 || selection.sparks.mode !== 'none') && <p className="muted">{selection.candidateMods.length} staged mods · Spark settings: {selection.sparks.mode}</p>}
      <div className="equipment-actions"><button type="button" disabled={readOnly || !officialSlots.has(selection.slot)} onClick={event => openPicker(selection.slot, index, event.currentTarget)}>Replace {selection.slot}</button>
        <button type="button" disabled={readOnly} onClick={event => {
          const retainedData = selection.item.kind !== 'database' || selection.candidateMods.length > 0 || selection.sparks.mode !== 'none';
          if (retainedData && !window.confirm(`Clear ${name(selection)} and its saved instance, staged mods, and Spark settings from this slot?`)) return;
          // Always-visible primary row summaries survive clearing their selection.
          const summary = event.currentTarget.closest('.equipment-row')?.querySelector<HTMLElement>('summary');
          const otherSummary = document.getElementById('other-equipment-summary');
          onEdit({ type: 'equipment-clear', index });
          requestAnimationFrame(() => (summary?.isConnected ? summary : otherSummary)?.focus());
        }}>Clear {selection.slot}</button></div>
    </article>;
  }
  function renderRow(slot: string) {
    const slots = slot === 'OffHand' ? ['OffHand', 'OffHandShield'] : [slot];
    const selections = build.equipment.map((selection, index) => ({ selection, index })).filter(entry => slots.includes(entry.selection.slot));
    const first = selections[0]?.selection;
    const item = first ? definition(first) : undefined;
    return <details className={`equipment-row${first ? ' has-equipment' : ''}`} key={slot} data-equipment-row={slot}>
      <summary><EquipmentIcon slot={first?.slot ?? slot} iconId={item?.iconId} version={data.gameDataVersion} />
        <span className="equipment-slot-name">{slot}</span>
        <span className="equipment-row-name">{first ? `${name(first)}${selections.length > 1 ? ` + ${selections.length - 1} more` : ''}` : 'No gear selected'}</span>
        {first && <small>{selections.length > 1 ? `${selections.length} selected` : `${first.slot === 'OffHandShield' ? 'Shield · ' : ''}${first.item.kind !== 'database' ? `${first.item.kind} instance` : item?.level == null ? 'Unknown target level' : `Target ${item.level}`}`}</small>}
      </summary>
      <div className="equipment-row-content">
        {slot === 'OffHand' && <p className="muted offhand-help">OffHand and OffHandShield are separate official slots. Each selection is saved independently.</p>}
        {slots.map(canonicalSlot => {
          const entries = selections.filter(entry => entry.selection.slot === canonicalSlot);
          return <div className="equipment-canonical-slot" key={canonicalSlot} data-equipment-slot={canonicalSlot}>
            {slot === 'OffHand' && <h3 className="canonical-slot-heading">{canonicalSlot === 'OffHandShield' ? 'Shields (OffHandShield)' : 'Offhand items (OffHand)'}</h3>}
            {entries.map(entry => renderSelection(entry.selection, entry.index))}
            {entries.length === 0 && <button type="button" disabled={!officialSlots.has(canonicalSlot)} aria-label={`Browse ${canonicalSlot} items`} onClick={event => openPicker(canonicalSlot, null, event.currentTarget)}>Choose {canonicalSlot === 'OffHandShield' ? 'a shield' : 'gear'}</button>}
          </div>;
        })}
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
        onEdit({ type: 'equipment-equip', slot: picker.slot, index: picker.index, itemId });
        setPicker(null);
      }} />}
  </section>;
}

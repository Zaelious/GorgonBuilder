import { useState, type ReactNode } from 'react';
import type { BuildDocument } from '../../core/build/document';
import type { BuildEdit } from '../../app/editor/build-editor';
import type { GameDataRepository } from '../../data/repository/repository';
import { EquipmentPicker } from './EquipmentPicker';
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

export function EquipmentPlanner({ build, data, onEdit, readOnly, minimum, preferenceProtected, preferenceNotice, onMinimumChange }: Props) {
  const slots = [...new Set(data.items.map(item => item.slot))].sort();
  const [slot, setSlot] = useState(slots.includes('MainHand') ? 'MainHand' : slots[0] ?? '');
  const [picker, setPicker] = useState<{ slot: string; index: number | null; returnFocus: HTMLElement | null } | null>(null);
  const existingIndex = build.equipment.findIndex(selection => selection.slot === slot);
  return <section className="equipment-section" aria-labelledby="equipment-title">
    <div className="section-heading"><h2 id="equipment-title">Equipment</h2><span className="muted">{build.equipment.length} selected</span></div>
    {!picker && preferenceNotice}
    <div className="equipment-toolbar"><label htmlFor="equipment-slot">Official slot</label>
      <select id="equipment-slot" value={slot} onChange={event => setSlot(event.target.value)}>{slots.map(value => <option key={value}>{value}</option>)}</select>
      <button type="button" disabled={!slot} onClick={event => setPicker({ slot, index: existingIndex < 0 ? null : existingIndex, returnFocus: event.currentTarget })}>Browse items</button>
    </div>
    {build.equipment.length === 0 && <p className="equipment-empty muted">No equipment selected. Choose a slot to browse official items.</p>}
    <div className="equipment-overview">{build.equipment.map((selection, index) => {
      const id = selection.item.kind === 'database' ? selection.item.itemId : selection.item.instance.baseItemId;
      const item = id === null ? undefined : data.getItem(id);
      const name = selection.item.kind !== 'database' && selection.item.instance.displayName
        ? selection.item.instance.displayName : item?.displayName ?? id ?? 'Manual item';
      return <details className="equipment-selection" key={`${index}-${selection.slot}-${id}`}>
        <summary><span className="equipment-slot-name">{selection.slot}</span><span>{name}</span><small>{selection.item.kind !== 'database' ? `${selection.item.kind} instance` : item?.level === null || !item ? 'Unknown target level' : `Target ${item.level}`}</small></summary>
        <div className="equipment-selection-content">
          {item ? <ItemFacts item={item} data={data} /> : <p className="warning">{id ? `Official definition ${id} is unavailable.` : 'No base definition is linked.'} This saved selection is retained.</p>}
          {item && item.slot !== selection.slot && <p className="warning">Published slot is {item.slot}; saved slot {selection.slot} is retained.</p>}
          {selection.item.kind !== 'database' && <details className="item-more"><summary>Saved {selection.item.kind} instance</summary><pre>{JSON.stringify(selection.item.instance, null, 2)}</pre></details>}
          {(selection.candidateMods.length > 0 || selection.sparks.mode !== 'none') && <p className="muted">{selection.candidateMods.length} staged mods · Spark settings: {selection.sparks.mode}</p>}
          <div className="equipment-actions"><button type="button" disabled={readOnly || !slots.includes(selection.slot)} onClick={event => setPicker({ slot: selection.slot, index, returnFocus: event.currentTarget })}>Replace {selection.slot}</button>
            <button type="button" disabled={readOnly} onClick={event => {
              const retainedData = selection.item.kind !== 'database' || selection.candidateMods.length > 0 || selection.sparks.mode !== 'none';
              if (retainedData && !window.confirm(`Clear ${name} and its saved instance, staged mods, and Spark settings from this slot?`)) return;
              const section = event.currentTarget.closest('section');
              onEdit({ type: 'equipment-clear', index });
              section?.querySelector<HTMLSelectElement>('#equipment-slot')?.focus();
            }}>Clear {selection.slot}</button></div>
        </div>
      </details>;
    })}</div>
    {picker && <EquipmentPicker {...picker} data={data} minimum={minimum} preferenceProtected={preferenceProtected} preferenceNotice={preferenceNotice} onMinimumChange={onMinimumChange} readOnly={readOnly} replacing={picker.index !== null}
      onClose={() => setPicker(null)} onChoose={itemId => {
        const previous = picker.index === null ? undefined : build.equipment[picker.index];
        if (previous && previous.item.kind !== 'database' && !window.confirm('Replace this saved instance with a database definition? Its instance metadata and existing powers will be removed. Staged mods and Spark settings are retained.')) return;
        onEdit({ type: 'equipment-equip', slot: picker.slot, index: picker.index, itemId });
        setPicker(null);
      }} />}
  </section>;
}

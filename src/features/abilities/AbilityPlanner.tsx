import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AbilitySelection, SkillSlot } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import { COMBAT_BAR_SIZE, selectionWarnings, type BuildEdit, type Slot } from '../../app/editor/build-editor';
import { rankLabel } from './groups';
import { AbilityIcon } from './AbilityIcon';
import { AbilityFacts } from './AbilityFacts';
import { AbilityPicker } from './AbilityPicker';

interface Props {
  slot: Slot;
  skill: SkillSlot;
  bar: AbilitySelection[];
  data: GameDataRepository;
  onEdit: (edit: BuildEdit) => void;
  readOnly: boolean;
  detailSlot: Slot | null;
  onDetailOpen: (slot: Slot) => void;
}

function DetailPopover({ id, selection, anchor, warnings, data, onClose, onEnter, onLeave, children }: {
  id: string;
  selection: AbilitySelection;
  anchor: HTMLButtonElement | undefined;
  warnings: string[];
  data: GameDataRepository;
  onClose: (restoreFocus?: boolean) => void;
  onEnter: () => void;
  onLeave: () => void;
  children: React.ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const ability = data.getAbility(selection.abilityId);
  useLayoutEffect(() => {
    const element = popup.current!;
    function position() {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 32);
      element.style.width = `${width}px`;
      const desiredHeight = element.scrollHeight + 2;
      const below = Math.max(0, window.innerHeight - rect.bottom - 24);
      const above = Math.max(0, rect.top - 24);
      const placeBelow = desiredHeight <= below || (desiredHeight > above && below >= above);
      const room = placeBelow ? below : above;
      element.style.maxHeight = `${room}px`;
      const height = Math.min(desiredHeight, room);
      element.style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`;
      element.style.top = `${placeBelow ? Math.max(16, rect.bottom + 8) : Math.max(16, rect.top - height - 8)}px`;
    }
    // Associate the invoker so native Tab order enters the interactive panel.
    element.showPopover?.({ source: anchor });
    position();
    function onOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !element.contains(target) && !anchor?.contains(target)) onClose();
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose(element.contains(document.activeElement));
      }
    }
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    document.addEventListener('keydown', onEscape);
    element.addEventListener('toggle', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', onOutsidePointer, true);
      document.removeEventListener('keydown', onEscape);
      element.removeEventListener('toggle', position, true);
    };
  }, [anchor, selection.abilityId, warnings.length]);
  return <div ref={popup} id={id} className="ability-popover" popover="manual" role="dialog" aria-label={`Ability details: ${ability?.displayName ?? selection.abilityId}`}
    onMouseEnter={onEnter} onMouseLeave={onLeave}
    onBlur={e => { if (!(e.relatedTarget instanceof Node) || (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== anchor)) onClose(); }}
    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(true); } }}>
    <div className="detail-heading"><AbilityIcon ability={ability} version={data.gameDataVersion} /><div><h3>{ability?.displayName ?? selection.abilityId}</h3>{ability && ability.rank !== null && <p className="detail-rank">{rankLabel(ability.rank)}</p>}</div><button type="button" aria-label="Close ability details" onClick={() => onClose(true)}>×</button></div>
    {ability && <AbilityFacts ability={ability} />}
    {warnings.map(w => <p key={w} className="warning">{w}</p>)}
    <div className="detail-actions">{children}</div>
  </div>;
}

export function AbilityBar({ slot, skill, bar, data, onEdit, readOnly, detailSlot, onDetailOpen }: Props) {
  const [picker, setPicker] = useState<{ replaceIndex: number | null; returnFocus: HTMLElement | null } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const triggers = useRef(new Map<number, HTMLButtonElement>());
  const pinned = useRef(false);
  const ignoreFocus = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const full = bar.length >= COMBAT_BAR_SIZE;

  function cancelLeave() { clearTimeout(leaveTimer.current); }
  function closeDetail(restoreFocus = false) {
    cancelLeave();
    const trigger = active === null ? undefined : triggers.current.get(active);
    setActive(null);
    pinned.current = false;
    if (restoreFocus && trigger) {
      ignoreFocus.current = true;
      trigger.focus();
      ignoreFocus.current = false;
    }
  }
  function openDetail(index: number, pin: boolean) {
    cancelLeave();
    if (ignoreFocus.current) return;
    pinned.current = pin;
    setActive(index);
    onDetailOpen(slot);
  }
  function leaveDetail() {
    cancelLeave();
    if (!pinned.current) leaveTimer.current = setTimeout(() => setActive(null), 150);
  }
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  function openPicker(replaceIndex: number | null) {
    const returnFocus = active !== null ? triggers.current.get(active) ?? null : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeDetail();
    setPicker({ replaceIndex, returnFocus });
  }
  function move(index: number, direction: -1 | 1) {
    closeDetail();
    onEdit({ type: 'move', slot, index, direction });
    requestAnimationFrame(() => triggers.current.get(index + direction)?.focus());
  }
  const activeSelection = active === null ? undefined : bar[active];
  return <section className="ability-bar" aria-labelledby={`bar-${slot}`}>
    <div className="bar-heading"><h3 id={`bar-${slot}`}>Combat bar {slot}</h3><span className="muted">{bar.length} / {COMBAT_BAR_SIZE}</span></div>
    <ol className="combat-slots">
      {Array.from({ length: Math.max(COMBAT_BAR_SIZE, bar.length) }, (_, index) => {
        const selection = bar[index];
        const ability = selection && data.getAbility(selection.abilityId);
        const warnings = selection ? selectionWarnings(selection, skill.skillId, data) : [];
        return <li key={index} className={`combat-slot ${index >= COMBAT_BAR_SIZE ? 'legacy-slot' : ''}`}>
          {selection ? <button type="button" className="slot-button" ref={element => { if (element) triggers.current.set(index, element); else triggers.current.delete(index); }}
            aria-label={`Bar ${slot} slot ${index + 1}: ${ability?.displayName ?? selection.abilityId}${warnings.length ? ' (needs review)' : ''}`}
            aria-haspopup="dialog" aria-expanded={detailSlot === slot && active === index} aria-controls={detailSlot === slot && active === index ? `equipped-ability-detail-${slot}` : undefined}
            onMouseEnter={() => openDetail(index, false)} onMouseLeave={leaveDetail}
            onFocus={() => openDetail(index, true)} onBlur={e => {
              const popup = document.getElementById(`equipped-ability-detail-${slot}`);
              if (!(e.relatedTarget instanceof Node) || !popup?.contains(e.relatedTarget)) closeDetail();
            }} onClick={() => openDetail(index, true)}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); closeDetail(true); } }}>
            <AbilityIcon ability={ability} version={data.gameDataVersion} />
            <span className="slot-number">{index + 1}</span>{warnings.length > 0 && <span className="slot-warning" aria-hidden="true">!</span>}
          </button> : <button type="button" className="slot-button empty-slot" ref={element => { if (element) triggers.current.set(index, element); else triggers.current.delete(index); }} disabled={readOnly || skill.skillId === null}
            aria-label={`Add ability to bar ${slot}, empty slot ${index + 1}`} onClick={() => openPicker(null)}><span aria-hidden="true">+</span><span className="slot-number">{index + 1}</span></button>}
        </li>;
      })}
    </ol>
    <button type="button" className="open-picker" disabled={readOnly || skill.skillId === null} onClick={() => openPicker(null)} aria-label={`Open ability picker for bar ${slot}`}>+ <span>Abilities</span></button>
    {full && <p className="bar-message warning">{bar.length > COMBAT_BAR_SIZE
      ? `Legacy draft has ${bar.length} abilities in bar ${slot}; all are retained. Remove entries to return to six.`
      : `Bar ${slot} is full. Remove or replace an equipped ability to make room.`}</p>}
    {bar.some(s => selectionWarnings(s, skill.skillId, data).length > 0) && <p className="bar-message warning">Marked slots need review. Open a slot for details; saved selections are retained.</p>}
    {detailSlot === slot && activeSelection && active !== null && <DetailPopover id={`equipped-ability-detail-${slot}`} key={`${slot}-${active}`} selection={activeSelection} anchor={triggers.current.get(active)}
      warnings={selectionWarnings(activeSelection, skill.skillId, data)} data={data} onClose={closeDetail} onEnter={cancelLeave} onLeave={leaveDetail}>
      <details className="bar-edit-actions"><summary>Edit bar</summary><div>
      <button type="button" disabled={readOnly} onClick={() => openPicker(active)}>Replace</button>
      <button type="button" disabled={readOnly || active === 0} onClick={() => move(active, -1)} aria-label={`Move entry ${active + 1} up in bar ${slot}`}>← Move earlier</button>
      <button type="button" disabled={readOnly || active === bar.length - 1} onClick={() => move(active, 1)} aria-label={`Move entry ${active + 1} down in bar ${slot}`}>Move later →</button>
      </div></details>
      <button type="button" className="remove-ability" disabled={readOnly} onClick={() => { closeDetail(); onEdit({ type: 'remove', slot, index: active }); requestAnimationFrame(() => triggers.current.get(Math.max(0, active - 1))?.focus()); }} aria-label={`Remove entry ${active + 1} from bar ${slot}`}>Remove</button>
    </DetailPopover>}
    {picker && <AbilityPicker slot={slot} skill={skill} data={data} full={full} replaceIndex={picker.replaceIndex} returnFocus={picker.returnFocus} onClose={() => setPicker(null)}
      onChoose={ability => {
        onEdit(picker.replaceIndex === null ? { type: 'add', slot, abilityId: ability.id } : { type: 'replace', slot, index: picker.replaceIndex, abilityId: ability.id });
        setPicker(null);
      }} />}
  </section>;
}

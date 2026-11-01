import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkillSlot } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import type { Slot } from '../../app/editor/build-editor';
import { groupAbilities, highestTier, rankLabel, type Ability } from './groups';
import { AbilityIcon } from './AbilityIcon';
import { AbilityFacts } from './AbilityFacts';

interface Props {
  slot: Slot;
  skill: SkillSlot;
  data: GameDataRepository;
  full: boolean;
  replaceIndex: number | null;
  returnFocus: HTMLElement | null;
  onChoose: (ability: Ability) => void;
  onClose: () => void;
}

export function AbilityPicker({ slot, skill, data, full, replaceIndex, returnFocus, onChoose, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [expandedTier, setExpandedTier] = useState<string | null>(null);
  const groups = useMemo(() => groupAbilities(skill.skillId === null ? [] : data.getAbilitiesForSkill(skill.skillId)), [data, skill.skillId]);
  const search = query.trim().toLocaleLowerCase();
  const matches = groups.filter(g => g.abilities.some(a => `${a.displayName} ${a.description} ${a.id}`.toLocaleLowerCase().includes(search)));
  const blocked = full && replaceIndex === null;

  useEffect(() => {
    const element = dialog.current!;
    const opener = returnFocus ?? document.activeElement;
    element.showModal();
    element.querySelector<HTMLInputElement>('input[type=search]')?.focus();
    return () => {
      if (element.open) element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return <dialog ref={dialog} className="ability-picker" aria-labelledby={`picker-title-${slot}`}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]')]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="picker-content">
      <header className="dialog-heading"><div><p className="eyebrow">Skill {slot} · {data.getSkill(skill.skillId ?? '')?.name ?? skill.skillId ?? 'Empty slot'}</p>
        <h2 id={`picker-title-${slot}`}>{replaceIndex === null ? 'Choose an ability' : `Replace slot ${replaceIndex + 1}`}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close ability picker">×</button>
      </header>
      <label htmlFor={`ability-search-${slot}`}>Search abilities</label>
      <input autoFocus id={`ability-search-${slot}`} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names, descriptions, or IDs…" />
      <p className="muted picker-help">+ adds the highest published level in a family. Expand a family to choose another tier.</p>
      {blocked && <p role="status" className="warning">Bar {slot} is full (six abilities). Remove or replace an equipped ability to make room.</p>}
      {skill.skillId === null && <p className="empty-state">Choose Skill {slot} before adding abilities.</p>}
      {matches.length === 0 && <p className="empty-state">No official abilities match. Try another search or skill.</p>}
      <div className="picker-results">
        {matches.map(group => {
          const highest = highestTier(group);
          return <div className="family" key={group.id}>
            <details>
              <summary><AbilityIcon ability={highest} version={data.gameDataVersion} /><span className="family-title">{group.name}<small>{group.abilities.length} published {group.abilities.length === 1 ? 'tier' : 'tiers'}</small></span></summary>
              <div className="family-tiers">{group.abilities.map(ability => <article className="tier" key={ability.id}>
                <div className="tier-row"><div className="tier-identity"><h3>{ability.displayName}</h3>
                  <p className="tier-stats">{ability.rank !== null && `Rank ${ability.rank} · `}Lv {ability.level} · {ability.pve.powerCost} power{ability.damage.damage !== null && ` · Base ${ability.damage.damage} ${ability.damage.damageType}`}</p>
                </div><div className="tier-controls">
                  <button type="button" className="tier-add" disabled={blocked} onClick={() => onChoose(ability)} aria-label={`Select ${ability.displayName}, ${rankLabel(ability.rank)}, level ${ability.level}, ${ability.id}`}>
                    {replaceIndex === null ? 'Add' : 'Use'}
                  </button>
                  <button type="button" className="tier-details-toggle" aria-expanded={expandedTier === ability.id} aria-controls={`tier-detail-${slot}-${ability.id}`}
                    aria-label={`Details for ${ability.displayName}`} onClick={() => setExpandedTier(current => current === ability.id ? null : ability.id)}>Details</button>
                </div></div>
                <div id={`tier-detail-${slot}-${ability.id}`} hidden={expandedTier !== ability.id}>
                  {expandedTier === ability.id && <AbilityFacts ability={ability} />}
                </div>
              </article>)}</div>
            </details>
            <button type="button" className="quick-add" disabled={blocked} onClick={() => onChoose(highest)}
              aria-label={`Quick-add ${group.name}, highest published level ${highest.level}`}>+</button>
          </div>;
        })}
      </div>
    </div>
  </dialog>;
}

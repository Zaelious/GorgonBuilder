import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AbilitySelection, SkillSlot } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import { COMBAT_BAR_SIZE, type Slot } from '../../app/editor/build-editor';
import './picker.css';
import { groupAbilities, highestTier, quickAddTier, rankLabel, type Ability } from './groups';
import { AbilityIcon } from './AbilityIcon';
import { AbilityFacts } from './AbilityFacts';
import { useSessionFlag } from '../../app/useSessionFlag';

interface Props {
  slot: Slot;
  skill: SkillSlot;
  data: GameDataRepository;
  full: boolean;
  bar: readonly AbilitySelection[];
  replaceIndex: number | null;
  returnFocus: HTMLElement | null;
  onChoose: (ability: Ability) => void;
  onClose: () => void;
}

export function AbilityPicker({ slot, skill, data, bar, full, replaceIndex, returnFocus, onChoose, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingScroll = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingScroll.current !== null && dialog.current) {
      dialog.current.scrollTop = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [bar]);
  function choose(ability: Ability) {
    pendingScroll.current = dialog.current?.scrollTop ?? null;
    onChoose(ability);
  }
  const [query, setQuery] = useState('');
  const [expandedTier, setExpandedTier] = useState<string | null>(null);
  // Session-only picker option (T0014): remembered across picker openings, never saved in the build and never
  // applied to already-equipped abilities.
  const [respectSkillLevel, setRespectSkillLevel] = useSessionFlag('respectSkillLevel');
  const groups = useMemo(() => groupAbilities(skill.skillId === null ? [] : data.getAbilitiesForSkill(skill.skillId)), [data, skill.skillId]);
  const search = query.trim().toLocaleLowerCase();
  const matches = groups.filter(g => g.abilities.some(a => `${a.displayName} ${a.description} ${a.id}`.toLocaleLowerCase().includes(search)));
  const selectedCount = (ability: Ability) => bar.filter(selection => selection.abilityId === ability.id && selection.rank === ability.rank).length;
  const selectedLabel = (count: number) => count === 1 ? 'On this bar' : `On this bar ×${count}`;
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
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
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
      <div className="picker-options">
        <p className="muted picker-help" id={`quick-add-help-${slot}`}>{respectSkillLevel
          ? `+ adds the highest published level at or below Lv ${skill.level}. Expand a family to choose any tier.`
          : '+ adds the highest published level in a family. Expand a family to choose another tier.'}</p>
        <label className="respect-skill-level"><input type="checkbox" checked={respectSkillLevel} onChange={e => setRespectSkillLevel(e.target.checked)}
          aria-describedby={`quick-add-help-${slot}`} />Respect Skill Level</label>
      </div>
      <div className="picker-status"><p className="picker-count" aria-live="polite" aria-atomic="true">{bar.length} / {COMBAT_BAR_SIZE} abilities</p>
      {blocked && <p role="status" className="warning">Bar {slot} is full (six abilities). Remove or replace an equipped ability to make room.</p>}</div>
      {skill.skillId === null && <p className="empty-state">Choose Skill {slot} before adding abilities.</p>}
      {matches.length === 0 && <p className="empty-state">No official abilities match. Try another search or skill.</p>}
      <div className="picker-results">
        {matches.map(group => {
          const quick = quickAddTier(group, respectSkillLevel, skill.level);
          const highest = highestTier(group);
          return <div className="family" key={group.id}>
            <details>
              <summary><AbilityIcon ability={highest} version={data.gameDataVersion} /><span className="family-title">{group.name}<small>{group.abilities.length} published {group.abilities.length === 1 ? 'tier' : 'tiers'}{group.abilities.some(ability => selectedCount(ability) > 0) && ' · On this bar'}</small>
                {quick.kind === 'none' && <small className="quick-add-none">No tier at or below Lv {skill.level} (lowest is Lv {quick.lowestLevel}). Expand to choose any tier.</small>}</span></summary>
              <div className="family-tiers">{group.abilities.map(ability => <article className="tier" key={ability.id}>
                <div className="tier-row"><div className="tier-identity"><h3>{ability.displayName}</h3>
                  {selectedCount(ability) > 0 && <small className="selected-ability">{selectedLabel(selectedCount(ability))}</small>}
                  <p className="tier-stats">{ability.rank !== null && `Rank ${ability.rank} · `}Lv {ability.level} · {ability.pve.powerCost} power{ability.damage.damage !== null && ` · Base ${ability.damage.damage} ${ability.damage.damageType}`}</p>
                </div><div className="tier-controls">
                  <button type="button" className="tier-add" disabled={blocked} onClick={() => choose(ability)} aria-label={`Select ${ability.displayName}, ${rankLabel(ability.rank)}, level ${ability.level}, ${ability.id}`}>
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
            <button type="button" className="quick-add" disabled={blocked || quick.kind === 'none'} onClick={() => { if (quick.kind === 'tier') choose(quick.ability); }}
              aria-label={quick.kind === 'none' ? `Quick-add ${group.name} unavailable: no published level at or below skill level ${skill.level}`
                : respectSkillLevel ? `Quick-add ${group.name}, highest published level at or below ${skill.level}: level ${quick.ability.level}`
                  : `Quick-add ${group.name}, highest published level ${quick.ability.level}`}>+</button>
          </div>;
        })}
      </div>
    </div>
  </dialog>;
}

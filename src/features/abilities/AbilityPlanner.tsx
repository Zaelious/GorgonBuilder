import { useMemo, useState } from 'react';
import type { AbilitySelection, SkillSlot } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import { selectionWarnings, type BuildEdit, type Slot } from '../../app/editor/build-editor';
import { groupAbilities, rankLabel, type AbilityGroup } from './groups';

interface Props {
  slot: Slot;
  skill: SkillSlot;
  data: GameDataRepository;
  onEdit: (edit: BuildEdit) => void;
  readOnly: boolean;
}

function RankCard({ group, slot, skill, onEdit, readOnly }: Omit<Props, 'data'> & { group: AbilityGroup }) {
  const [id, setId] = useState(group.abilities[0]!.id);
  const ability = group.abilities.find(a => a.id === id)!;
  return (
    <article className="ability-card">
      <h4>{group.name}</h4>
      <label htmlFor={`rank-${slot}-${group.id}`}>Official ability / rank</label>
      <select id={`rank-${slot}-${group.id}`} value={id} onChange={e => setId(e.target.value)}>
        {group.abilities.map(a => <option key={a.id} value={a.id}>{a.displayName} · {rankLabel(a.rank)} · Level {a.level} · {a.id}</option>)}
      </select>
      <p className="ability-meta">{ability.displayName} · {rankLabel(ability.rank)} · Published level {ability.level}</p>
      <p className="ability-description">{ability.description || 'No description published.'}</p>
      {ability.level > skill.level && <p className="warning">Published level {ability.level} exceeds configured skill level {skill.level}. You can still plan with this ability.</p>}
      <div className="card-footer"><code>{ability.id}</code><button type="button" disabled={readOnly} onClick={() => onEdit({ type: 'add', slot, abilityId: ability.id })}>Add to bar {slot}</button></div>
    </article>
  );
}

export function AbilityBrowser({ slot, skill, data, onEdit, readOnly }: Props) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupAbilities(skill.skillId === null ? [] : data.getAbilitiesForSkill(skill.skillId)), [data, skill.skillId]);
  const search = query.trim().toLocaleLowerCase();
  const matches = groups.filter(g => g.abilities.some(a => `${a.displayName} ${a.description} ${a.id}`.toLocaleLowerCase().includes(search)));
  return (
    <section className="ability-browser" aria-labelledby={`browser-${slot}`}>
      <h3 id={`browser-${slot}`}>Ability browser {slot}</h3>
      {skill.skillId === null ? <p className="empty-state">Choose Skill {slot} to browse its official abilities.</p> : <>
        <label htmlFor={`ability-search-${slot}`}>Search abilities in Skill {slot}</label>
        <input id={`ability-search-${slot}`} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names, descriptions, or IDs…" />
        <p className="muted">{matches.length} ability groups. Ranks follow published UpgradeOf links; level and rank are separate facts.</p>
        {matches.length === 0 && <p className="empty-state">No official abilities match. Try another search or skill.</p>}
        <div className="ability-results">{matches.map(group => <RankCard key={group.id} group={group} slot={slot} skill={skill} onEdit={onEdit} readOnly={readOnly} />)}</div>
      </>}
    </section>
  );
}

export function AbilityBar({ slot, skill, bar, data, onEdit, readOnly }: Props & { bar: AbilitySelection[] }) {
  return (
    <section className="ability-bar" aria-labelledby={`bar-${slot}`}>
      <div className="bar-heading"><h3 id={`bar-${slot}`}>Ability bar {slot}</h3><span className="muted">{bar.length} selected</span></div>
      <p className="muted">This bar keeps its own order. Changing or clearing this skill retains entries for review.</p>
      {bar.length === 0 && <p className="empty-state">Add an ability from browser {slot} to start your bar.</p>}
      <ol>{bar.map((selection, index) => {
        const ability = data.getAbility(selection.abilityId);
        const warnings = selectionWarnings(selection, skill.skillId, skill.level, data);
        return <li key={`${index}-${selection.abilityId}`} className="bar-entry">
          <div><strong>{ability?.displayName ?? selection.abilityId}</strong><p className="ability-meta">{rankLabel(selection.rank)}{ability && ` · Published level ${ability.level}`}</p><code>{selection.abilityId}</code></div>
          <div className="bar-actions">
            <button type="button" disabled={readOnly || index === 0} aria-label={`Move entry ${index + 1} up in bar ${slot}`} onClick={() => onEdit({ type: 'move', slot, index, direction: -1 })}>↑</button>
            <button type="button" disabled={readOnly || index === bar.length - 1} aria-label={`Move entry ${index + 1} down in bar ${slot}`} onClick={() => onEdit({ type: 'move', slot, index, direction: 1 })}>↓</button>
            <button type="button" disabled={readOnly} aria-label={`Remove entry ${index + 1} from bar ${slot}`} onClick={() => onEdit({ type: 'remove', slot, index })}>Remove</button>
          </div>
          {warnings.map(w => <p key={w} className="warning">{w}</p>)}
        </li>;
      })}</ol>
    </section>
  );
}

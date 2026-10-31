import { useMemo, useState } from 'react';
import type { AbilitySelection, SkillSlot } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import type { BuildEdit, Slot } from '../../app/editor/build-editor';
import { AbilityBrowser, AbilityBar } from '../abilities/AbilityPlanner';

interface Props {
  slot: Slot;
  skill: SkillSlot;
  bar: AbilitySelection[];
  data: GameDataRepository;
  onEdit: (edit: BuildEdit) => void;
  readOnly: boolean;
}

function SkillLevel({ slot, level, onEdit }: { slot: Slot; level: number; onEdit: Props['onEdit'] }) {
  const [text, setText] = useState(String(level));
  const valid = text.trim() !== '' && Number.isSafeInteger(Number(text)) && Number(text) >= 0;
  return <><input id={`level-${slot}`} type="number" min="0" step="1" value={text}
    aria-invalid={!valid} aria-describedby={!valid ? `level-error-${slot}` : undefined}
    onChange={e => {
      const value = e.target.value;
      setText(value);
      const next = Number(value);
      if (value.trim() !== '' && Number.isSafeInteger(next) && next >= 0) onEdit({ type: 'level', slot, level: next });
    }} onBlur={() => setText(String(level))} />
    {!valid && <p id={`level-error-${slot}`} className="warning">Use a nonnegative whole number. The saved level is unchanged.</p>}</>;
}

export function SkillPlanner({ slot, skill, bar, data, onEdit, readOnly }: Props) {
  const [query, setQuery] = useState('');
  const skills = useMemo(() => data.skills.filter(s => s.combat)
    .toSorted((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)), [data]);
  const matches = skills.filter(s => (s.name ?? s.id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = skill.skillId === null ? undefined : data.getSkill(skill.skillId);
  const unavailable = skill.skillId !== null && !selected;
  return (
    <section className="skill-panel" aria-labelledby={`slot-${slot}`}>
      <header className="panel-heading"><p className="eyebrow">Skill {slot}</p><h2 id={`slot-${slot}`}>{selected?.name ?? skill.skillId ?? 'Choose a combat skill'}</h2></header>
      <fieldset disabled={readOnly} className="skill-controls">
        <legend className="sr-only">Skill {slot} configuration</legend>
        <label htmlFor={`skill-search-${slot}`}>Filter skills by name</label>
        <input id={`skill-search-${slot}`} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search combat skills…" />
        <div className="skill-inputs">
          <div><label htmlFor={`skill-${slot}`}>Skill {slot}</label>
            <select id={`skill-${slot}`} value={skill.skillId ?? ''} onChange={e => onEdit({ type: 'skill', slot, skillId: e.target.value || null })}>
              <option value="">Empty slot</option>
              {skill.skillId !== null && !matches.some(s => s.id === skill.skillId) && <option value={skill.skillId}>{selected?.name ?? skill.skillId}{unavailable ? ' (unavailable)' : ' (selected)'}</option>}
              {matches.map(s => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
            </select>
          </div>
          <div><label htmlFor={`level-${slot}`}>Skill {slot} level</label>
            <SkillLevel slot={slot} level={skill.level} onEdit={onEdit} />
          </div>
        </div>
        {matches.length === 0 && <p className="muted">No combat skills match this filter.</p>}
      </fieldset>
      {unavailable && <p role="alert" className="warning">Official skill {skill.skillId} is unavailable. Your saved selection has been retained.</p>}
      {selected && !selected.combat && <p role="alert" className="warning">The saved skill is not marked as a combat skill in loaded data.</p>}
      {selected?.description && <p className="skill-description">{selected.description}</p>}
      <AbilityBar slot={slot} skill={skill} bar={bar} data={data} onEdit={onEdit} readOnly={readOnly} />
      <AbilityBrowser key={skill.skillId ?? 'empty'} slot={slot} skill={skill} data={data} onEdit={onEdit} readOnly={readOnly} />
    </section>
  );
}

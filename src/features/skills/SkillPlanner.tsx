import { useMemo, useRef, useState } from 'react';
import type { AbilitySelection, SkillSlot } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import type { BuildEdit, Slot } from '../../app/editor/build-editor';
import { AbilityBar } from '../abilities/AbilityPlanner';

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

function SkillLevel({ slot, level, onEdit }: { slot: Slot; level: number; onEdit: Props['onEdit'] }) {
  const [text, setText] = useState(String(level));
  const valid = text.trim() !== '' && Number.isSafeInteger(Number(text)) && Number(text) >= 0;
  return <><input id={`level-${slot}`} type="number" aria-label={`Skill ${slot} level`} min="0" step="1" value={text}
    aria-invalid={!valid} aria-describedby={!valid ? `level-error-${slot}` : undefined}
    onChange={e => {
      const value = e.target.value;
      setText(value);
      const next = Number(value);
      if (value.trim() !== '' && Number.isSafeInteger(next) && next >= 0) onEdit({ type: 'level', slot, level: next });
    }} onBlur={() => setText(String(level))} />
    {!valid && <p id={`level-error-${slot}`} className="warning">Use a nonnegative whole number. The saved level is unchanged.</p>}</>;
}

export function SkillPlanner({ slot, skill, bar, data, onEdit, readOnly, detailSlot, onDetailOpen }: Props) {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const skills = useMemo(() => data.skills.filter(s => s.combat)
    .toSorted((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)), [data]);
  const matches = skills.filter(s => (s.name ?? s.id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = skill.skillId === null ? undefined : data.getSkill(skill.skillId);
  const unavailable = skill.skillId !== null && !selected;
  return (
    <section className="skill-panel" aria-labelledby={`slot-${slot}`}>
      <h3 id={`slot-${slot}`} className="sr-only">Skill {slot}: {selected?.name ?? skill.skillId ?? 'Empty slot'}</h3>
      <fieldset disabled={readOnly} className="skill-controls">
        <legend className="sr-only">Skill {slot} configuration</legend>
        <div className="skill-inputs">
          <label className="skill-slot-label" htmlFor={`skill-${slot}`}>Skill {slot}</label>
            <select id={`skill-${slot}`} value={skill.skillId ?? ''} onChange={e => onEdit({ type: 'skill', slot, skillId: e.target.value || null })}>
              <option value="">Empty slot</option>
              {skill.skillId !== null && !matches.some(s => s.id === skill.skillId) && <option value={skill.skillId}>{selected?.name ?? skill.skillId}{unavailable ? ' (unavailable)' : ' (selected)'}</option>}
              {matches.map(s => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
            </select>
          <div className="skill-level"><label htmlFor={`level-${slot}`}><span aria-hidden="true">Lv</span><span className="sr-only">Skill {slot} level</span></label>
            <SkillLevel slot={slot} level={skill.level} onEdit={onEdit} />
          </div>
        <details className="skill-filter" onToggle={e => { if (e.currentTarget.open) search.current?.focus(); }} onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.open = false; e.currentTarget.querySelector<HTMLElement>('summary')?.focus(); }
        }}><summary aria-label={`Filter skills for Skill ${slot}`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg></summary>
          <div className="skill-search-panel"><label htmlFor={`skill-search-${slot}`}>Filter skills by name</label>
          <input ref={search} id={`skill-search-${slot}`} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search combat skills…" />
          {matches.length === 0 && <p className="muted">No combat skills match this filter.</p>}
          </div>
        </details>
        </div>
      </fieldset>
      <AbilityBar key={skill.skillId ?? 'empty'} slot={slot} skill={skill} bar={bar} data={data} onEdit={onEdit} readOnly={readOnly} detailSlot={detailSlot} onDetailOpen={onDetailOpen} />
      {unavailable && <p role="alert" className="warning">Official skill {skill.skillId} is unavailable. Your saved selection has been retained.</p>}
      {selected && !selected.combat && <p role="alert" className="warning">The saved skill is not marked as a combat skill in loaded data.</p>}

    </section>
  );
}

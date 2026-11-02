import { useMemo, useState } from 'react';
import type { AbilitySelection, EquipmentSelection, SkillSlot } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import type { BuildEdit, Slot } from '../../app/editor/build-editor';
import type { ImportedCharacterSnapshot } from '../../core/import';
import { importedSkillLevel } from '../import/skill-levels';
import './skills.css';
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
  imported?: ImportedCharacterSnapshot;
  equipment?: readonly EquipmentSelection[];
}

function SkillLevel({ slot, level, onEdit }: { slot: Slot; level: number; onEdit: Props['onEdit'] }) {
  const [draft, setDraft] = useState({ committed: level, text: String(level) });
  // Keep incomplete/locally formatted typing until an external commit changes the level.
  if (draft.committed !== level) setDraft({ committed: level, text: String(level) });
  const text = draft.committed === level ? draft.text : String(level);
  const valid = text.trim() !== '' && Number.isSafeInteger(Number(text)) && Number(text) >= 0;
  return <><input id={`level-${slot}`} type="number" aria-label={`Skill ${slot} level`} min="0" step="1" value={text}
    aria-invalid={!valid} aria-describedby={!valid ? `level-error-${slot}` : undefined}
    onChange={e => {
      const value = e.target.value;
      const next = Number(value);
      setDraft({ committed: value.trim() !== '' && Number.isSafeInteger(next) && next >= 0 ? next : level, text: value });
      if (value.trim() !== '' && Number.isSafeInteger(next) && next >= 0) onEdit({ type: 'level', slot, level: next });
    }} onBlur={() => setDraft({ committed: level, text: String(level) })} />
    {!valid && <p id={`level-error-${slot}`} className="warning">Use a nonnegative whole number. The saved level is unchanged.</p>}</>;
}

export function SkillPlanner({ slot, skill, bar, data, onEdit, readOnly, detailSlot, onDetailOpen, equipment, imported }: Props) {
  const skills = useMemo(() => data.skills.filter(s => s.combat)
    .toSorted((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)), [data]);
  const selected = skill.skillId === null ? undefined : data.getSkill(skill.skillId);
  const importedLevel = importedSkillLevel(imported, skill.skillId, data);
  const unavailable = skill.skillId !== null && !selected;
  return (
    <section className="skill-panel" aria-labelledby={`slot-${slot}`}>
      <h3 id={`slot-${slot}`} className="sr-only">Skill {slot}: {selected?.name ?? skill.skillId ?? 'Empty slot'}</h3>
      <fieldset disabled={readOnly} className="skill-controls">
        <legend className="sr-only">Skill {slot} configuration</legend>
        <div className="skill-inputs">
          <label className="skill-slot-label" htmlFor={`skill-${slot}`}>Skill {slot}</label>
            <select id={`skill-${slot}`} value={skill.skillId ?? ''} onChange={e => {
              const skillId = e.target.value || null;
              const level = importedSkillLevel(imported, skillId, data);
              onEdit({ type: 'skill', slot, skillId, ...(level === null ? {} : { level }) });
            }}>
              <option value="">Empty slot</option>
              {skill.skillId !== null && !skills.some(s => s.id === skill.skillId) && <option value={skill.skillId}>{selected?.name ?? skill.skillId}{unavailable ? ' (unavailable)' : ' (selected)'}</option>}
              {skills.map(s => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
            </select>
          <div className="skill-level"><label htmlFor={`level-${slot}`}><span aria-hidden="true">Lv</span><span className="sr-only">Skill {slot} level</span></label>
            <SkillLevel key={skill.skillId ?? 'empty'} slot={slot} level={skill.level} onEdit={onEdit} />
          </div>
          {importedLevel !== null && importedLevel !== skill.level && <button type="button" className="apply-imported-level"
            aria-label={`Apply imported level for skill ${slot}: ${importedLevel}`} title={`Set Skill ${slot} level to ${importedLevel}`}
            onClick={() => onEdit({ type: 'level', slot, level: importedLevel })}>Apply imported level</button>}
        </div>
      </fieldset>
      <AbilityBar key={skill.skillId ?? 'empty'} slot={slot} skill={skill} bar={bar} data={data} onEdit={onEdit} readOnly={readOnly} detailSlot={detailSlot} onDetailOpen={onDetailOpen} equipment={equipment} />
      {imported && skill.skillId && importedLevel === null && <p className="muted">Imported effective level unavailable for this skill. Your manual level is retained.</p>}
      {unavailable && <p role="alert" className="warning">Official skill {skill.skillId} is unavailable. Your saved selection has been retained.</p>}
      {selected && !selected.combat && <p role="alert" className="warning">The saved skill is not marked as a combat skill in loaded data.</p>}

    </section>
  );
}

import { useMemo, useState } from 'react';
import type { BuildDocument } from '../../core/build/document';
import {
  configuredTargetDamageTypes, TARGET_COUNT_MAX, TARGET_COUNT_MIN, TARGET_PERCENT_MAX, TARGET_PERCENT_MIN, type TargetPercentField,
} from '../../core/build/target';
import type { GameDataRepository } from '../../data/repository/repository';
import type { ImportedCharacterSnapshot } from '../../core/import';
import {
  CRITICAL_SKILL_LEVEL_MAX, CRITICAL_SKILL_LEVEL_MIN, creatureTypes, getCreatureType, isValidCriticalSkillLevel, resolveCriticalSkillLevel,
  setManualCriticalLevel, type CriticalSkillLevel,
} from '../../core/calculation';
import type { CriticalScenario, EliteSetting } from '../../persistence/local/critical-scenario';
import type { BuildEdit } from '../../app/editor/build-editor';
import { NON_DAMAGING_TYPE, damageTypeClass } from './AbilityFacts';
import { damageDebugEnabled } from './damage-debug';
import './target-dummy.css';

/** Published damage types of equipped abilities (hits and DoTs), then any other saved target keys. */
export function targetDamageTypes(build: BuildDocument, data: GameDataRepository): string[] {
  const types = new Set<string>();
  for (const selection of [...build.abilityBarA, ...build.abilityBarB]) {
    const ability = data.getAbility(selection.abilityId);
    if (!ability) continue;
    const { damage } = ability;
    if (damage.damage !== null || damage.healthSpecificDamage !== null || damage.armorSpecificDamage !== null) types.add(damage.damageType);
    for (const dot of ability.pve.dots ?? []) types.add(dot.damageType);
  }
  types.delete(NON_DAMAGING_TYPE);
  const equipped = [...types].sort((a, b) => a.localeCompare(b));
  return [...equipped, ...Object.keys(build.target.damageTypes).filter(type => !types.has(type))];
}

/** Whole-number text input that commits only valid values and restores the saved value on blur. */
function NumberField({ id, label, value, min, max, step, onCommit, error, describedBy }: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  onCommit: (value: number) => void; error: string; describedBy?: string;
}) {
  const [draft, setDraft] = useState({ committed: value, text: String(value) });
  if (draft.committed !== value) setDraft({ committed: value, text: String(value) });
  const text = draft.committed === value ? draft.text : String(value);
  const parsed = Number(text);
  const valid = text.trim() !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max && (step !== 1 || Number.isInteger(parsed));
  return <><input id={id} type="number" inputMode={step === 1 ? 'numeric' : 'decimal'} min={min} max={max} step={step} value={text} aria-label={label}
    aria-invalid={!valid} aria-describedby={[!valid ? `${id}-error` : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined}
    onChange={e => {
      const next = e.target.value;
      const number = Number(next);
      const ok = next.trim() !== '' && Number.isFinite(number) && number >= min && number <= max && (step !== 1 || Number.isInteger(number));
      setDraft({ committed: ok ? number : value, text: next });
      if (ok) onCommit(number);
    }} onBlur={() => setDraft({ committed: value, text: String(value) })} />
    {!valid && <span id={`${id}-error`} className="warning target-error" role="alert">{error}</span>}</>;
}

export interface CriticalTargetProps {
  readonly scenario: CriticalScenario;
  readonly onChange: (next: CriticalScenario) => void;
  /** Local CharacterSheet snapshot; never uploaded. */
  readonly imported: ImportedCharacterSnapshot | undefined;
}

/** Manual sub-skill level: empty means "use the imported level"; only valid whole numbers are committed. */
function CriticalLevelField({ skill, onCommit }: { skill: CriticalSkillLevel; onCommit: (level: number | null) => void }) {
  const shown = skill.level === null ? '' : String(skill.level);
  const [draft, setDraft] = useState({ shown, text: shown });
  if (draft.shown !== shown) setDraft({ shown, text: shown });
  const text = draft.shown === shown ? draft.text : shown;
  const id = `critical-level-${skill.skillId}`;
  const valid = text.trim() === '' || isValidCriticalSkillLevel(Number(text));
  return <><input id={id} type="number" inputMode="numeric" min={CRITICAL_SKILL_LEVEL_MIN} max={CRITICAL_SKILL_LEVEL_MAX} step={1} value={text}
    placeholder="—" aria-label={`${skill.skillName} level`} aria-invalid={!valid} aria-describedby={!valid ? `${id}-error` : undefined}
    onChange={e => {
      const next = e.target.value;
      setDraft({ shown, text: next });
      if (next.trim() === '') onCommit(null);
      else if (isValidCriticalSkillLevel(Number(next))) onCommit(Number(next));
    }} onBlur={() => setDraft({ shown, text: shown })} />
    {!valid && <span id={`${id}-error`} className="warning target-error" role="alert">Use a whole number {CRITICAL_SKILL_LEVEL_MIN}–{CRITICAL_SKILL_LEVEL_MAX}.</span>}</>;
}

function sourceText(skill: CriticalSkillLevel): string {
  if (skill.origin === 'manual') return 'Manual';
  if (skill.origin === 'imported') return 'Imported';
  if (skill.imported && skill.imported.status !== 'resolved') return 'Not in import';
  return 'Not set';
}

/** T0013-F2: creature type, Elite flag and the selected creature's Anatomy/Phrenology levels (session scenario only). */
function CriticalTargetControls({ data, critical }: { data: GameDataRepository; critical: CriticalTargetProps }) {
  const { scenario, onChange, imported } = critical;
  const types = useMemo(() => creatureTypes(data), [data]);
  const creature = getCreatureType(scenario.creatureType, data);
  const skills = creature ? [creature.anatomySkillId, creature.phrenologySkillId].filter((id): id is string => id !== null)
    .map(id => resolveCriticalSkillLevel(id, { snapshot: imported, manualLevels: scenario.manualLevels }, data)) : [];
  const set = skills.filter(skill => skill.level !== null).length;
  const setLevel = (skillId: string, level: number | null) => {
    const manualLevels = setManualCriticalLevel(scenario.manualLevels, skillId, level);
    if (manualLevels !== scenario.manualLevels) onChange({ ...scenario, manualLevels });
  };
  return <fieldset className="target-critical-fields">
    <legend className="sr-only">Critical-hit target</legend>
    <label className="target-select" htmlFor="target-creature"><span>Creature</span>
      <select id="target-creature" value={creature?.id ?? ''} onChange={e => onChange({ ...scenario, creatureType: e.target.value || null })}>
        <option value="">Unknown</option>
        {types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
      </select></label>
    <label className="target-select" htmlFor="target-elite"><span>Elite</span>
      <select id="target-elite" value={scenario.elite} onChange={e => onChange({ ...scenario, elite: e.target.value as EliteSetting })}>
        <option value="unknown">Unknown</option><option value="elite">Elite</option><option value="non-elite">Not Elite</option>
      </select></label>
    <details className="target-critical">
      <summary>Critical skills{creature && <span className="target-set-count"> · {set} of {skills.length} set</span>}</summary>
      <div className="target-critical-content">
        {!creature ? <p className="muted">Choose a creature type to use its Anatomy and Phrenology levels.</p> : <>
          <table><thead><tr><th scope="col">Sub-skill</th><th scope="col">Level</th><th scope="col">Source</th></tr></thead>
            <tbody>{skills.map(skill => <tr key={skill.skillId} data-critical-skill={skill.skillId} data-origin={skill.origin ?? 'none'}>
              <th scope="row"><label htmlFor={`critical-level-${skill.skillId}`}>{skill.skillName}</label></th>
              <td><CriticalLevelField skill={skill} onCommit={level => setLevel(skill.skillId, level)} /></td>
              <td><span className="critical-source">{sourceText(skill)}</span>
                {skill.origin === 'manual' && skill.imported?.status === 'resolved' && <button type="button" className="link-button critical-use-imported"
                  onClick={() => setLevel(skill.skillId, null)}>Use imported ({skill.imported.level})</button>}
                {skill.origin === 'manual' && skill.imported?.status !== 'resolved' && <button type="button" className="link-button critical-clear"
                  aria-label={`Clear ${skill.skillName} level`} onClick={() => setLevel(skill.skillId, null)}>Clear</button>}</td>
            </tr>)}</tbody></table>
          {!creature.phrenologySkillId && <p className="muted">{creature.label} has no Phrenology sub-skill.</p>}
          <p className="muted">Imported levels come from your local CharacterSheet. A typed level overrides it for this browser session.</p>
        </>}
      </div>
    </details>
  </fieldset>;
}

/**
 * Custom target dummy (T0014): enemy count 1–20 and per-damage-type vulnerability/resistance percentages, saved in
 * the existing BuildDocument v1 `target`. Math lives in core/calculation/target-damage.
 */
export function TargetDummy({ build, data, onEdit, readOnly, critical }: { build: BuildDocument; data: GameDataRepository; onEdit: (edit: BuildEdit) => void; readOnly: boolean;
  /** T0013-F2 critical scenario; session state, so it stays usable on read-only builds. */
  critical?: CriticalTargetProps }) {
  const types = useMemo(() => targetDamageTypes(build, data), [build, data]);
  const configured = configuredTargetDamageTypes(build.target).length;
  const percentField = (damageType: string, field: TargetPercentField) => {
    const label = field === 'vulnerability' ? 'vulnerability' : 'resistance';
    const id = `target-${field}-${damageType.replace(/[^A-Za-z0-9_-]/gu, '_')}`;
    return <NumberField id={id} label={`${damageType} ${label} percent`} value={build.target.damageTypes[damageType]?.[field] ?? 0}
      min={TARGET_PERCENT_MIN} max={TARGET_PERCENT_MAX} step={0.1} describedBy="target-percent-help"
      error={`Use ${TARGET_PERCENT_MIN}–${TARGET_PERCENT_MAX}.`} onCommit={value => onEdit({ type: 'target-damage-type', damageType, field, value })} />;
  };
  return <section className="target-dummy" aria-labelledby="target-dummy-title">
    <fieldset disabled={readOnly}>
      <legend className="sr-only">Target dummy</legend>
      <h3 id="target-dummy-title" className="target-dummy-title">Target dummy</h3>
      <label className="target-count" htmlFor="target-count"><span>Enemies</span>
        <NumberField id="target-count" label="Enemy count" value={build.target.count} min={TARGET_COUNT_MIN} max={TARGET_COUNT_MAX} step={1}
          error={`Use a whole number ${TARGET_COUNT_MIN}–${TARGET_COUNT_MAX}.`} onCommit={count => onEdit({ type: 'target-count', count })} />
      </label>
      <details className="target-damage-types">
        <summary>Vulnerability &amp; resistance{configured > 0 && <span className="target-set-count"> · {configured} set</span>}</summary>
        <div className="target-damage-types-content">
          <p id="target-percent-help" className="muted">Set vulnerability and resistance percentages for each damage type.</p>
          {damageDebugEnabled() && <p className="muted">Each applies only to hits of that exact type, netted (vulnerability − resistance) after build contributions. This rule is assumed until validated in game.</p>}
          {types.length === 0 ? <p className="muted">Equip damaging abilities to set damage-type modifiers.</p>
            : <table><thead><tr><th scope="col">Damage type</th><th scope="col">Vulnerability %</th><th scope="col">Resistance %</th></tr></thead>
              <tbody>{types.map(type => <tr key={type}><th scope="row"><span className={`damage-value ${damageTypeClass(type)}`}>{type}</span></th>
                <td>{percentField(type, 'vulnerability')}</td><td>{percentField(type, 'resistance')}</td></tr>)}</tbody></table>}
        </div>
      </details>
    </fieldset>
    {critical && <CriticalTargetControls data={data} critical={critical} />}
  </section>;
}

import { useMemo, useState } from 'react';
import type { BuildDocument } from '../../core/build/document';
import {
  configuredTargetDamageTypes, TARGET_COUNT_MAX, TARGET_COUNT_MIN, TARGET_PERCENT_MAX, TARGET_PERCENT_MIN, type TargetPercentField,
} from '../../core/build/target';
import type { GameDataRepository } from '../../data/repository/repository';
import type { BuildEdit } from '../../app/editor/build-editor';
import { NON_DAMAGING_TYPE, damageTypeClass } from './AbilityFacts';
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

/**
 * Custom target dummy (T0014): enemy count 1–20 and per-damage-type vulnerability/resistance percentages, saved in
 * the existing BuildDocument v1 `target`. Math lives in core/calculation/target-damage.
 */
export function TargetDummy({ build, data, onEdit, readOnly }: { build: BuildDocument; data: GameDataRepository; onEdit: (edit: BuildEdit) => void; readOnly: boolean }) {
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
          <p id="target-percent-help" className="muted">Percent for each damage type. Each applies only to hits of that exact type,
            netted (vulnerability − resistance) after build contributions. This rule is assumed until validated in game.</p>
          {types.length === 0 ? <p className="muted">Equip damaging abilities to set damage-type modifiers.</p>
            : <table><thead><tr><th scope="col">Damage type</th><th scope="col">Vulnerability %</th><th scope="col">Resistance %</th></tr></thead>
              <tbody>{types.map(type => <tr key={type}><th scope="row"><span className={`damage-value ${damageTypeClass(type)}`}>{type}</span></th>
                <td>{percentField(type, 'vulnerability')}</td><td>{percentField(type, 'resistance')}</td></tr>)}</tbody></table>}
        </div>
      </details>
    </fieldset>
  </section>;
}

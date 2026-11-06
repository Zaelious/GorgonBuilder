import { useId, useMemo, useRef, useState, type FocusEvent } from 'react';
import type { EquipmentItem, EquipmentSelection, SparkOutcomeCounts } from '../../core/build/document';
import type { SparkEdit, SparkRequest } from '../../core/build/sparks';
import {
  MAX_SPARKS_PER_ITEM, SKILL_DAMAGE_SPARK_OUTCOMES, SPARK_OUTCOME_KEYS, evaluateSparkConfiguration, expectedSkillDamageSparks,
  isOffensiveSparkSlot, sparkBonusTotals, sparkOutcomeText, totalSparkOutcomes, zeroSparkOutcomeCounts, type SkillDamageSparkOutcome,
} from '../../core/sparks';
import { sparkOutcomeSupport } from '../../core/calculation/spark-modifiers';
import type { GameDataRepository } from '../../data/repository/repository';
import { createSparkSeed } from './seed';
import './sparks.css';

type Mode = 'none' | 'simulated' | 'actual';
const MODES: readonly { mode: Mode; label: string }[] = [
  { mode: 'none', label: 'No Sparks' }, { mode: 'simulated', label: 'Simulate' }, { mode: 'actual', label: 'Enter Actual Results' },
];

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export function formatSparkBonus(outcome: SkillDamageSparkOutcome, value: number): string {
  return `+${NUMBER.format(value)}${outcome.unit === 'percent' ? '%' : ''}`;
}
/** Bonus name in the official attribute label style: "Psychology Base Damage %", "All Direct Damage". */
export function sparkBonusName(outcome: SkillDamageSparkOutcome, skillName: string | null): string {
  return `${sparkOutcomeText(outcome, skillName).replace(/^\+[\d.]+%? /u, '')}${outcome.unit === 'percent' ? ' %' : ''}`;
}

/** Concise collapsed equipment-row note, e.g. "110 Sparks"; null when no Sparks are configured. */
export function sparkRowNote(selection: EquipmentSelection): string | null {
  const { sparks } = selection;
  if (sparks.mode === 'none') return null;
  const count = sparks.mode === 'simulated' ? sparks.input.count : totalSparkOutcomes(sparks.outcomeCounts);
  return `${count} ${count === 1 ? 'Spark' : 'Sparks'}`;
}

const isWhole = (text: string) => /^\d+$/u.test(text.trim()) && Number(text) <= MAX_SPARKS_PER_ITEM;

interface Props {
  readonly selection: EquipmentSelection;
  readonly equipmentIndex: number;
  /** Unique active skills (A then B); only combat skills are offered. */
  readonly activeSkillIds: readonly string[];
  readonly data: GameDataRepository;
  readonly onEdit: (edit: SparkEdit) => void;
  readonly readOnly: boolean;
  /** This entry shares the exclusive offhand position with another saved entry (legacy conflict). */
  readonly offhandConflict: boolean;
}

/**
 * Compact, collapsed-by-default Mastery Spark editor for one equipped item. All state is the saved BuildDocument
 * configuration; the only transient state is unsaved text in number fields and the last configuration of each mode
 * for this exact item (so switching modes back and forth does not lose manual entries).
 */
export function SparkEditor({ selection, equipmentIndex, activeSkillIds, data, onEdit, readOnly, offhandConflict }: Props) {
  const id = useId();
  const { sparks } = selection;
  const mode: Mode = sparks.mode;
  const memory = useRef<{ item: EquipmentItem; simulated?: SparkRequest; actual?: SparkRequest } | null>(null);
  if (memory.current?.item !== selection.item) memory.current = { item: selection.item };
  const combatSkills = useMemo(() => activeSkillIds.filter(skill => data.getSkill(skill)?.combat), [activeSkillIds, data]);
  const configuredSkill = sparks.mode === 'simulated' ? sparks.input.skillId : sparks.mode === 'actual' ? sparks.skillId : null;
  const skillId = configuredSkill ?? combatSkills[0] ?? null;
  const skillName = (skill: string | null) => skill === null ? null : data.getSkill(skill)?.name ?? skill;
  const evaluation = evaluateSparkConfiguration(sparks);
  const slotSupported = isOffensiveSparkSlot(selection.slot);
  const skillActive = configuredSkill !== null && combatSkills.includes(configuredSkill);
  const editable = !readOnly && slotSupported && !offhandConflict;
  const applied = evaluation.status === 'valid' && slotSupported && !offhandConflict && skillActive;
  const support = useMemo(() => skillId === null ? null : new Map(sparkOutcomeSupport(skillId, data).map(entry => [entry.outcome.key, entry.supported])), [skillId, data]);

  const counts: SparkOutcomeCounts = sparks.mode === 'actual' ? sparks.outcomeCounts
    : sparks.mode === 'simulated' && evaluation.status === 'valid' ? evaluation.outcomeCounts : zeroSparkOutcomeCounts();
  const total = sparks.mode === 'simulated' ? sparks.input.count : totalSparkOutcomes(counts);
  const bonuses = sparkBonusTotals(counts);
  const expected = expectedSkillDamageSparks(total);

  function request(sparksRequest: SparkRequest) {
    if (editable || sparksRequest.mode === 'none') onEdit({ type: 'sparks-set', equipmentIndex, sparks: sparksRequest });
  }
  function remember() {
    const saved = memory.current!;
    if (sparks.mode === 'simulated') saved.simulated = { mode: 'simulated', skillId: sparks.input.skillId, count: sparks.input.count, seed: sparks.input.seed };
    if (sparks.mode === 'actual') saved.actual = { mode: 'actual', skillId: sparks.skillId, outcomeCounts: sparks.outcomeCounts };
  }
  function changeMode(next: Mode) {
    if (next === mode || readOnly) return;
    remember();
    if (next === 'none') { request({ mode: 'none' }); return; }
    if (skillId === null) return;
    const remembered = memory.current![next];
    if (remembered) request(remembered);
    else if (next === 'simulated') request({ mode: 'simulated', skillId, count: MAX_SPARKS_PER_ITEM, seed: createSparkSeed() });
    else request({ mode: 'actual', skillId, outcomeCounts: zeroSparkOutcomeCounts() });
  }
  function changeSkill(next: string) {
    if (sparks.mode === 'simulated') request({ mode: 'simulated', skillId: next, count: sparks.input.count, seed: sparks.input.seed || createSparkSeed() });
    else if (sparks.mode === 'actual') request({ mode: 'actual', skillId: next, outcomeCounts: sparks.outcomeCounts });
  }
  function reroll() {
    if (sparks.mode !== 'simulated') return;
    const count = Number.isSafeInteger(sparks.input.count) && sparks.input.count >= 0 && sparks.input.count <= MAX_SPARKS_PER_ITEM ? sparks.input.count : MAX_SPARKS_PER_ITEM;
    request({ mode: 'simulated', skillId: sparks.input.skillId, count, seed: createSparkSeed(sparks.input.seed) });
  }

  const status = mode === 'none' ? 'None'
    : !slotSupported || offhandConflict || evaluation.status === 'invalid' ? 'Not applied'
      : evaluation.status === 'pending' ? 'Not simulated'
        : `${skillName(configuredSkill)} · ${total} ${mode === 'simulated' ? 'simulated' : 'actual'}${skillActive ? '' : ' · inactive'}`;
  const notice = !slotSupported ? 'Sparks are modeled only on MainHand, OffHand, Ring and Necklace. This saved setting is kept but not applied.'
    : offhandConflict ? 'Several saved items share the offhand position. Keep one item to edit or apply its Sparks.'
      : evaluation.status === 'invalid' ? `${evaluation.issue.message}${evaluation.issue.code === 'result-mismatch' || evaluation.issue.code === 'unsupported-model-version' ? '' : ' Saved values are kept but not applied.'}`
        : evaluation.status === 'pending' ? 'Not simulated yet. Choose Simulate to roll these Sparks.'
          : mode !== 'none' && !skillActive ? `${skillName(configuredSkill)} is not an active skill. These Sparks are kept but not applied; choose an active skill to apply them.`
            : null;
  const unmodeled = mode === 'none' || !support ? [] : SKILL_DAMAGE_SPARK_OUTCOMES.filter(outcome => support.get(outcome.key) === false);

  return <details className="spark-editor" data-spark-mode={mode} data-spark-applied={applied ? 'true' : 'false'}>
    <summary><span className="spark-title">Mastery Sparks</span>
      <span className={`spark-summary${applied ? '' : mode === 'none' ? ' muted' : ' warning'}`} data-spark-summary="">{status}</span></summary>
    <div className="spark-body">
      {notice && <p className="warning spark-notice" role="status">{notice}</p>}
      {selection.slot === 'OffHandShield' && mode !== 'none' && <p className="muted spark-note">Official Spark scrolls list Off-Hand Weapons; shield eligibility is unconfirmed.</p>}
      <fieldset className="spark-modes" disabled={readOnly}>
        <legend className="sr-only">Spark mode</legend>
        {MODES.map(option => {
          const disabled = option.mode !== 'none' && option.mode !== mode && (!editable || skillId === null);
          return <label key={option.mode} className={`spark-mode${option.mode === mode ? ' selected' : ''}`}>
            <input type="radio" name={`${id}-mode`} value={option.mode} checked={option.mode === mode} disabled={disabled} onChange={() => changeMode(option.mode)} />
            {option.label}</label>;
        })}
      </fieldset>
      {mode === 'none' && <p className="muted spark-note">{combatSkills.length === 0 ? 'Select a combat skill to configure Skill Damage Sparks.'
        : `Plan up to ${MAX_SPARKS_PER_ITEM} Skill Damage Sparks for a Mastercrafted or Prophecied item.`}</p>}
      {mode !== 'none' && <>
        <div className="spark-controls">
          <label className="spark-field"><span>Skill</span>
            <select value={configuredSkill ?? ''} disabled={!editable} onChange={event => changeSkill(event.target.value)}>
              {configuredSkill !== null && !combatSkills.includes(configuredSkill) && <option value={configuredSkill}>{skillName(configuredSkill)} (inactive)</option>}
              {combatSkills.map(skill => <option key={skill} value={skill}>{skillName(skill)}</option>)}
            </select></label>
          {sparks.mode === 'simulated' && <>
            <label className="spark-field"><span>Sparks</span>
              <CountField value={sparks.input.count} disabled={!editable} label="Number of Sparks to simulate" id={`${id}-count`}
                onCommit={count => request({ mode: 'simulated', skillId: sparks.input.skillId, count, seed: sparks.input.seed || createSparkSeed() })} /></label>
            <button type="button" className="spark-reroll" disabled={!editable} onClick={reroll}
              title="Roll again with a new random seed">{evaluation.status === 'valid' ? 'Reroll' : 'Simulate'}</button>
          </>}
        </div>
        {sparks.mode === 'actual'
          ? <ManualOutcomes counts={sparks.outcomeCounts} skillName={skillName(configuredSkill)} bonuses={bonuses} support={support}
            disabled={!editable} idPrefix={id} onCommit={outcomeCounts => request({ mode: 'actual', skillId: sparks.skillId, outcomeCounts })} />
          : <OutcomeTable counts={evaluation.status === 'valid' ? counts : null} skillName={skillName(configuredSkill)} bonuses={bonuses} support={support} total={total} />}
        {unmodeled.length > 0 && <p className="muted spark-note">{unmodeled.map(outcome => sparkOutcomeText(outcome, skillName(skillId))).join(', ')}: no official {skillName(skillId)} attribute, so not applied.</p>}
        {sparks.mode === 'simulated' && sparks.input.seed && <p className="muted spark-seed">Seed <code>{sparks.input.seed}</code></p>}
        {expected.ok && total > 0 && <details className="spark-expected"><summary>Expected average · {total} Sparks</summary>
          <ul>{SKILL_DAMAGE_SPARK_OUTCOMES.map(outcome => <li key={outcome.key} data-expected-outcome={outcome.key}>
            <span>{sparkBonusName(outcome, skillName(skillId))}</span>
            <span className="spark-number">{formatSparkBonus(outcome, expected.value.bonuses[outcome.key])}</span></li>)}</ul>
          <p className="muted">Long-run average of the Spark odds, not a guaranteed result. Not applied to damage.</p>
        </details>}
      </>}
    </div>
  </details>;
}

function OutcomeTable({ counts, skillName, bonuses, support, total }: {
  counts: SparkOutcomeCounts | null; skillName: string | null; bonuses: ReturnType<typeof sparkBonusTotals>;
  support: ReadonlyMap<string, boolean> | null; total: number;
}) {
  return <table className="spark-outcomes">
    <caption className="sr-only">Simulated Spark outcomes and current bonuses</caption>
    <thead><tr><th scope="col">Outcome</th><th scope="col" className="spark-number">Count</th><th scope="col" className="spark-number">Bonus</th></tr></thead>
    <tbody>{SKILL_DAMAGE_SPARK_OUTCOMES.map(outcome => <tr key={outcome.key} data-outcome={outcome.key}>
      <th scope="row">{sparkOutcomeText(outcome, skillName)}<small>{outcome.weight}% chance</small></th>
      <td className="spark-number">{counts ? counts[outcome.key] : '—'}</td>
      <td className="spark-number">{bonusCell(outcome, counts ? bonuses[outcome.key] : null, support)}</td>
    </tr>)}</tbody>
    <tfoot><tr><th scope="row">Total</th><td className="spark-number" data-spark-total="">{counts ? totalSparkOutcomes(counts) : '—'} / {total}</td><td /></tr></tfoot>
  </table>;
}

function bonusCell(outcome: SkillDamageSparkOutcome, value: number | null, support: ReadonlyMap<string, boolean> | null) {
  if (support?.get(outcome.key) === false) return <span className="muted" title="This skill has no official attribute for this outcome.">Not modeled</span>;
  return value === null ? '—' : formatSparkBonus(outcome, value);
}

/** Five whole-number inputs; only a complete set totalling at most 110 is committed. Leaving the group restores saved values. */
function ManualOutcomes({ counts, skillName, bonuses, support, disabled, idPrefix, onCommit }: {
  counts: SparkOutcomeCounts; skillName: string | null; bonuses: ReturnType<typeof sparkBonusTotals>; support: ReadonlyMap<string, boolean> | null;
  disabled: boolean; idPrefix: string; onCommit: (counts: SparkOutcomeCounts) => void;
}) {
  const saved = SPARK_OUTCOME_KEYS.map(key => String(counts[key]));
  const basis = saved.join(',');
  // Unsaved text survives only while it belongs to the currently saved counts (undo/clear/reload replace it).
  const [draft, setDraft] = useState<{ basis: string; values: string[] } | null>(null);
  const values = draft?.basis === basis ? draft.values : saved;
  const fieldsValid = values.map(isWhole);
  const total = values.reduce((sum, text, index) => sum + (fieldsValid[index] ? Number(text) : 0), 0);
  const error = !fieldsValid.every(Boolean) ? `Enter whole numbers from 0 to ${MAX_SPARKS_PER_ITEM}. Not saved.`
    : total > MAX_SPARKS_PER_ITEM ? `Total ${total} is over ${MAX_SPARKS_PER_ITEM}. Not saved.` : null;
  function change(index: number, text: string) {
    const next = values.map((value, i) => i === index ? text : value);
    const valid = next.every(isWhole) && next.reduce((sum, value) => sum + Number(value), 0) <= MAX_SPARKS_PER_ITEM;
    setDraft({ basis: valid ? next.map(Number).join(',') : basis, values: next });
    if (valid) onCommit(Object.fromEntries(SPARK_OUTCOME_KEYS.map((key, i) => [key, Number(next[i])])) as unknown as SparkOutcomeCounts);
  }
  function leave(event: FocusEvent<HTMLTableElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraft(null);
  }
  const errorId = `${idPrefix}-manual-error`;
  return <>
    <table className="spark-outcomes spark-manual" onBlur={leave}>
      <caption className="sr-only">Actual Spark results and current bonuses</caption>
      <thead><tr><th scope="col">Outcome</th><th scope="col" className="spark-number">Count</th><th scope="col" className="spark-number">Bonus</th></tr></thead>
      <tbody>{SKILL_DAMAGE_SPARK_OUTCOMES.map((outcome, index) => <tr key={outcome.key} data-outcome={outcome.key}>
        <th scope="row"><label htmlFor={`${idPrefix}-${outcome.key}`}>{sparkOutcomeText(outcome, skillName)}</label><small>{outcome.weight}% chance</small></th>
        <td className="spark-number"><input id={`${idPrefix}-${outcome.key}`} type="number" inputMode="numeric" min={0} max={MAX_SPARKS_PER_ITEM} step={1}
          value={values[index]} disabled={disabled} aria-invalid={!fieldsValid[index] || total > MAX_SPARKS_PER_ITEM}
          aria-describedby={error ? errorId : undefined} onChange={event => change(index, event.target.value)} /></td>
        <td className="spark-number">{bonusCell(outcome, bonuses[outcome.key], support)}</td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Total</th><td className="spark-number" data-spark-total="">{total} / {MAX_SPARKS_PER_ITEM}</td><td /></tr></tfoot>
    </table>
    {error && <p id={errorId} className="warning spark-error" role="alert">{error}</p>}
  </>;
}

/** Whole-number Spark count; commits only 0–110 and restores the saved value on blur. */
function CountField({ value, disabled, label, id, onCommit }: { value: number; disabled: boolean; label: string; id: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState({ committed: value, text: String(value) });
  const text = draft.committed === value ? draft.text : String(value);
  const valid = isWhole(text);
  return <><input id={id} type="number" inputMode="numeric" min={0} max={MAX_SPARKS_PER_ITEM} step={1} value={text} disabled={disabled}
    aria-label={label} aria-invalid={!valid} aria-describedby={valid ? undefined : `${id}-error`}
    onChange={event => {
      const next = event.target.value;
      const ok = isWhole(next);
      setDraft({ committed: ok ? Number(next) : value, text: next });
      if (ok && Number(next) !== value) onCommit(Number(next));
    }}
    onBlur={() => setDraft({ committed: value, text: String(value) })} />
    {!valid && <span id={`${id}-error`} className="warning spark-error" role="alert">0–{MAX_SPARKS_PER_ITEM}</span>}</>;
}

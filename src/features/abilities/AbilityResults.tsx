import { useMemo } from 'react';
import type { TargetConfiguration } from '../../core/build/document';
import {
  applyTargetDummy, calculateAbilityDamage,
  type AbilityDamageResult, type AbilityDamageStep, type ComponentDamageResult, type DamageComponentId,
  type ModifierAggregationResult, type ModifierConfidence, type ModifierSource, type NormalizedModifier, type TargetDamageResult,
} from '../../core/calculation';
import type { GameDataRepository } from '../../data/repository/repository';
import { damageTypeClass, isNonDamaging } from './AbilityFacts';
import type { Ability } from './groups';
import './results.css';

/** Build-wide calculation inputs, computed once per build edit by the planner. */
export interface AbilityDamageInputs {
  readonly aggregation: ModifierAggregationResult;
  readonly target: TargetConfiguration;
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const formatDamage = (value: number) => NUMBER.format(value);
const signed = (value: number) => `${value < 0 ? '−' : '+'}${NUMBER.format(Math.abs(value))}`;
const percent = (fraction: number) => `${signed(fraction * 100)}%`;

const HIT_LABELS: Record<string, string> = { damage: 'Normal hit', 'health-specific': 'Health hit', 'armor-specific': 'Armor hit' };
export const hitLabel = (id: DamageComponentId) => HIT_LABELS[id] ?? id;

export const CONFIDENCE_LABELS: Record<ModifierConfidence, { label: string; help: string }> = {
  validated: { label: 'Validated', help: 'Every rule and input used is validated against the game.' },
  partially_validated: { label: 'Partly validated', help: 'Some inputs are only partly validated.' },
  assumed: { label: 'Provisional', help: 'Uses documented, not yet game-validated formula assumptions. See the breakdown.' },
  unknown: { label: 'Incomplete', help: 'Some build effects or ability mechanics are not modeled, so the value covers supported contributions only.' },
};

const CATEGORY_LABELS: Partial<Record<AbilityDamageStep['category'], string>> = {
  'original-base': 'Published base',
  'skill-base-damage-percent': 'Skill Base damage',
  'skill-damage-flat': 'Skill flat damage',
  'skill-damage-percent': 'Skill damage %',
  'ability-damage-flat': 'Ability flat damage',
  'ability-damage-percent': 'Ability damage %',
  'all-direct-damage-flat': 'All direct flat damage',
  'all-direct-damage-percent': 'All direct damage %',
  'all-damage-flat': 'All flat damage',
  'all-damage-percent': 'All damage %',
  'damage-type-direct-flat': 'Damage-type direct flat',
  'damage-type-direct-percent': 'Damage-type direct %',
  'damage-type-flat': 'Damage-type flat',
  'damage-type-percent': 'Damage-type %',
};

function sourceLabel(source: ModifierSource): string {
  switch (source.kind) {
    case 'skill-advancement': return `${source.skillId} Lv ${source.level} advancement`;
    case 'item-fixed-effect': return `${source.slot === 'OffHandShield' ? 'OffHand' : source.slot} item effect`;
    case 'existing-power': return `${source.slot === 'OffHandShield' ? 'OffHand' : source.slot} imported power`;
    case 'candidate-mod': return `${source.slot === 'OffHandShield' ? 'OffHand' : source.slot} planned mod`;
  }
}

/** Specific omitted interactions, phrased for the compact visible line. Full messages stay in the breakdown. */
export function notIncluded(result: AbilityDamageResult, target: TargetDamageResult): string[] {
  const codes = new Set(result.warnings.map(w => w.code));
  const out: string[] = [];
  if (codes.has('missing-ability')) out.push('official ability record');
  if (codes.has('game-data-version-mismatch')) out.push('matching game-data version');
  if (codes.has('indirect-not-calculated')) out.push('DoT damage');
  const unmodeled = result.aggregation.unsupported.filter(u => u.reason !== 'progression-rewards-not-modifiers').length;
  if (codes.has('unsupported-build-effects')) out.push(`${unmodeled} unmodeled build ${unmodeled === 1 ? 'effect' : 'effects'}`);
  if (codes.has('aggregation-incomplete')) out.push('unresolved build sources');
  const uncertain = new Set(result.components.flatMap(c => c.decisions.filter(d => d.status === 'uncertain').map(d => d.modifier.key))).size;
  if (uncertain > 0) out.push(`${uncertain} uncertain ${uncertain === 1 ? 'mod' : 'mods'}`);
  if (codes.has('ability-mechanics-unresolved')) out.push('special ability rules');
  if (codes.has('target-bonus-not-applied')) out.push('vulnerable-target bonus');
  if (target.warnings.some(w => w.code === 'invalid-target-modifier')) out.push('net resistance above 100%');
  return out;
}

function StepRow({ step, modifier }: { step: AbilityDamageStep; modifier: NormalizedModifier | undefined }) {
  const label = step.category === 'original-base' ? 'Published base' : modifier?.attributeLabel ?? CATEGORY_LABELS[step.category] ?? step.category;
  const detail = step.operation === 'base' ? null
    : step.operation === 'add-flat' ? signed(step.operand)
      : `${percent(step.operand)} of ${step.operation === 'add-skill-base-contribution' ? 'base ' : ''}${formatDamage(step.basis)}`;
  return <li className="calc-step" data-category={step.category} data-confidence={step.confidence} title={step.explanation}>
    <span className="calc-step-label">{label}{modifier && <small>{sourceLabel(modifier.source)}{detail && ` · ${detail}`}</small>}</span>
    <span className="calc-step-value">{step.operation === 'base' ? formatDamage(step.contribution) : signed(step.contribution)}</span>
    <span className="calc-step-total">{formatDamage(step.after)}</span>
  </li>;
}

function ComponentBreakdown({ component, target, modifiers }: { component: ComponentDamageResult; target: TargetDamageResult; modifiers: ReadonlyMap<string, NormalizedModifier> }) {
  const hit = target.hits.find(h => h.componentId === component.id);
  const uncertain = component.decisions.filter(d => d.status === 'uncertain');
  const excluded = component.decisions.filter(d => d.status === 'excluded' && d.reason !== 'not-normal-damage').length;
  return <section className="calc-component" aria-label={`${hitLabel(component.id)} breakdown`}>
    <h5>{hitLabel(component.id)} <small>{component.sourcePath} · {component.damageType}</small></h5>
    {component.steps.length === 0 ? <p className="muted">No calculation: the published base is unresolved.</p> : <ol className="calc-steps">
      {component.steps.map((step, index) => <StepRow key={index} step={step} modifier={step.modifierKey ? modifiers.get(step.modifierKey) : undefined} />)}
      {hit?.steps.map(step => <li key={step.kind} className="calc-step" data-category={step.kind === 'damage-type' ? 'target-damage-type' : step.kind} data-confidence={step.confidence} title={step.explanation}>
        <span className="calc-step-label">{step.label}<small>{step.detail}</small></span>
        <span className="calc-step-value">{step.multiplier === null ? '—' : `× ${formatDamage(step.multiplier)}`}</span>
        <span className="calc-step-total">{step.after !== null && Number.isFinite(step.after) && step.after >= 0 ? formatDamage(step.after) : '—'}</span>
      </li>)}
      {hit && target.configuredTargets > 1 && <li className="calc-step" data-category="affected-targets">
        <span className="calc-step-label">Affected enemies<small>{target.affectedTargets === null ? `${target.configuredTargets} configured · target cap unknown`
          : target.burst ? `${target.affectedTargets} configured · all within ${target.burst.radius} m (scenario)` : `${target.affectedTargets} of ${target.configuredTargets} configured`}</small></span>
        <span className="calc-step-value">{target.affectedTargets === null ? '—' : `× ${target.affectedTargets}`}</span>
        <span className="calc-step-total">{hit.total === null ? '—' : formatDamage(hit.total)}</span>
      </li>}
    </ol>}
    {uncertain.length > 0 && <><p className="calc-subhead">Not added (uncertain):</p><ul className="calc-notes">{uncertain.map(d =>
      <li key={d.modifier.key} data-modifier-key={d.modifier.key}>{d.modifier.attributeLabel ?? d.modifier.attributeId} ({sourceLabel(d.modifier.source)}): {d.explanation}</li>)}</ul></>}
    {excluded > 0 && <p className="muted calc-excluded">{excluded} other damage {excluded === 1 ? 'mod does' : 'mods do'} not apply to this hit (different skill, ability, damage type or delivery).</p>}
  </section>;
}

/**
 * Damage results for one equipped ability: per-target normal hit, AoE total where a target cap is known, critical
 * limitation and an expandable ordered breakdown. All math comes from the pure T0013/T0014 core functions.
 */
export function AbilityResults({ ability, inputs, data, idPrefix }: { ability: Ability; inputs: AbilityDamageInputs; data: GameDataRepository; idPrefix: string }) {
  const { result, target } = useMemo(() => {
    const result = calculateAbilityDamage(ability.id, inputs.aggregation, data);
    return { result, target: applyTargetDummy(result, inputs.target) };
  }, [ability.id, inputs, data]);
  const modifiers = useMemo(() => new Map(result.aggregation.modifiers.map(m => [m.key, m])), [result]);
  const hits = target.hits;
  // Buffs/utility abilities (no published hit, only zero-value DoT records) get no Damage section.
  if (hits.length === 0 && (isNonDamaging(ability.damage) || !ability.pve.dots?.some(dot => dot.damagePerTick > 0))) return null;
  const omitted = notIncluded(result, target);
  const count = target.configuredTargets;
  const breakdownComponents = result.components.filter(c => c.delivery === 'direct' && c.baseStatus !== 'absent');
  const targetLimits = target.warnings.filter(w => ['target-cap-unknown', 'single-target-ability', 'burst-falloff-undocumented',
    'burst-falloff-probabilistic', 'multiple-ability-conversions'].includes(w.code));
  const sideEffects = target.abilityEffects.filter(m => m.category === 'ability-taunt-flat' || m.category === 'ability-reset-time-flat');
  const assumptions = [...new Set([...result.assumptions, ...target.assumptions])];
  const allWarnings = [...result.warnings, ...target.warnings];
  const unmodeled = result.aggregation.unsupported.filter(u => u.reason !== 'progression-rewards-not-modifiers');
  const uniqueWarnings = [...new Map(allWarnings.map(w => [`${w.code}|${w.message}`, w])).values()];
  return <section className="ability-results" aria-labelledby={`${idPrefix}-results-title`} data-confidence={target.confidence}>
    <h4 id={`${idPrefix}-results-title`}>Damage{target.burst && <span className="result-scope"> · Burst {target.burst.radius} m{target.burst.source === 'treasure-conversion' ? ' (mod)' : ''}</span>}</h4>
    {hits.length === 0 ? <p className="muted">No direct hit is published{ability.pve.dots?.length ? '; DoT damage is not calculated yet.' : '.'}</p>
      : <dl className="result-rows">{hits.map(hit => <div key={hit.componentId} className="result-row" data-component={hit.componentId}>
        <dt>{hitLabel(hit.componentId)}{count > 1 ? ' · per target' : ''}</dt>
        <dd>{hit.perTarget === null ? <span className="muted">Unavailable</span>
          : <span className={`damage-value ${damageTypeClass(hit.damageType)}`}>{formatDamage(hit.perTarget)} {hit.damageType}</span>}</dd>
      </div>)}
      {count > 1 && hits.map(hit => <div key={`total-${hit.componentId}`} className="result-row result-total" data-component={hit.componentId}>
        <dt>{hits.length > 1 ? `${hitLabel(hit.componentId)} total` : 'Total'} · {target.affectedTargets ?? count} {(target.affectedTargets ?? count) === 1 ? 'enemy' : 'enemies'}</dt>
        <dd>{hit.total === null ? <span className="muted">{target.affectedTargets === null ? 'Target cap not published' : 'Unavailable'}</span> : formatDamage(hit.total)}</dd>
      </div>)}
      <div className="result-row"><dt>Critical hit</dt><dd><span className="muted" title="Critical chance and multipliers are not modeled yet.">Not modeled</span></dd></div>
    </dl>}
    {count > 1 && targetLimits.map(w => <p key={w.code} className="result-note" data-warning={w.code}>{w.message}</p>)}
    {sideEffects.length > 0 && <p className="result-note result-side-effects">Not damage: {sideEffects.map(m => m.category === 'ability-taunt-flat'
      ? `taunt +${formatDamage(m.value)}` : `reuse timer +${formatDamage(m.value)} s`).join(' · ')}</p>}
    {omitted.length > 0 && <p className="result-note result-limits">Not included: {omitted.join(' · ')}</p>}
    <details className="calc-breakdown"><summary>Calculation breakdown</summary>
      <p className="calc-confidence">{CONFIDENCE_LABELS[target.confidence].help} Values are calculations from published data, not in-game measurements. * marks an assumed rule.</p>
      {breakdownComponents.map(component => <ComponentBreakdown key={component.id} component={component} target={target} modifiers={modifiers} />)}
      {uniqueWarnings.length > 0 && <><p className="calc-subhead">Limitations</p><ul className="calc-notes">{uniqueWarnings.map(w =>
        <li key={`${w.code}|${w.message}`} data-warning={w.code}>{w.message}</li>)}</ul></>}
      {unmodeled.length > 0 && <><p className="calc-subhead">Unmodeled build effects ({unmodeled.length})</p><ul className="calc-notes">{unmodeled.map(u =>
        <li key={u.key} data-unsupported={u.key}>{u.message}</li>)}</ul></>}
      {target.falloff && <><p className="calc-subhead">Burst target-count rules (2024-07-30 notes)</p><ul className="calc-notes">
        <li data-falloff="direct">Direct: {target.falloff.direct.explanation}</li>
        <li data-falloff="indirect">Indirect (DoTs, not calculated): {target.falloff.indirect.explanation}</li></ul></>}
      {target.abilityEffects.length > 0 && <><p className="calc-subhead">Ability changes from mods</p><ul className="calc-notes">{target.abilityEffects.map(m =>
        <li key={m.key} data-ability-effect={m.category}>{m.attributeLabel ?? m.attributeId}: {m.sourceValue}{m.unit === 'seconds' ? ' s' : m.unit === 'meters' ? ' m' : ''} ({sourceLabel(m.source)})</li>)}</ul></>}
      {assumptions.length > 0 && <><p className="calc-subhead">Assumptions</p><ul className="calc-notes">
        {assumptions.map(a => <li key={a}>{a}</li>)}</ul></>}
    </details>
  </section>;
}

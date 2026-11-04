import { useMemo } from 'react';
import type { TargetConfiguration } from '../../core/build/document';
import {
  applyTargetDummy, BURST_FALLOFF_RULES, calculateAbilityDamage,
  type AbilityDamageResult, type AbilityDamageStep, type ComponentDamageResult, type DamageComponentId,
  type ModifierAggregationResult, type ModifierConfidence, type ModifierSource, type NormalizedModifier, type TargetDamageResult,
} from '../../core/calculation';
import type { GameDataRepository } from '../../data/repository/repository';
import { classifyBuildWarnings, type ClassifiedUnsupportedEffect } from '../../core/calculation/warning-relevance';
import { damageDebugEnabled } from './damage-debug';
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

/** Numerical presentation only: all operands, contributions and totals come from engine steps. */
function PublicBreakdown({ components, target, modifiers }: { components: readonly ComponentDamageResult[]; target: TargetDamageResult; modifiers: ReadonlyMap<string, NormalizedModifier> }) {
  const number = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0 ? formatDamage(value) : 'Unavailable';
  return <details className="damage-breakdown calc-breakdown"><summary>Damage breakdown</summary>
    {components.map(component => {
      const hit = target.hits.find(row => row.componentId === component.id);
      return <section className="calc-component" key={component.id} aria-label={`${hitLabel(component.id)} calculation`}>
        <h5>{hitLabel(component.id)}</h5><ol className="calc-steps">
          {component.steps.map((step, index) => {
            const modifier = step.modifierKey ? modifiers.get(step.modifierKey) : undefined;
            const label = step.operation === 'base' ? 'Published base' : (modifier?.attributeLabel && modifier.attributeLabel !== modifier.attributeId ? modifier.attributeLabel : CATEGORY_LABELS[step.category]) ?? 'Damage bonus';
            const source = modifier ? modifier.source.kind === 'skill-advancement'
              ? `${modifier.source.skillId} advancement` : modifier.source.slot === 'OffHandShield' ? 'OffHand' : modifier.source.slot : null;
            return <li className="calc-step" key={index}>
              <span className="calc-step-label">{label}{source && ` — ${source}`}
                {step.operation !== 'base' && step.operation !== 'add-flat' && <small>{percent(step.operand)} of {step.operation === 'add-skill-base-contribution' ? 'original base ' : ''}{formatDamage(step.basis)}</small>}</span>
              <span className="calc-step-value">{step.operation === 'base' ? number(step.contribution) : Number.isFinite(step.contribution) ? signed(step.contribution) : 'Unavailable'}</span>
              <span className="calc-step-total">{number(step.after)}</span>
            </li>;
          })}
          {hit?.steps.map((step, index) => <li className="calc-step" key={`target-${index}`}>
            <span className="calc-step-label">{step.kind === 'ability-multiplier' ? 'Ability damage multiplier' : step.kind === 'burst-falloff' ? 'Burst target multiplier' : 'Target resistance / vulnerability'}</span>
            <span className="calc-step-value">{step.multiplier === null ? 'Unavailable' : `× ${formatDamage(step.multiplier)}`}</span>
            <span className="calc-step-total">{number(step.after)}</span>
          </li>)}
          <li className="calc-step public-final-hit"><span>Final hit</span><span /><span className="calc-step-total">{number(hit?.perTarget ?? null)}</span></li>
          {target.configuredTargets > 1 && <li className="calc-step"><span>Enemy total</span><span>{target.affectedTargets === null ? 'Unavailable' : `× ${target.affectedTargets}`}</span><span className="calc-step-total">{number(hit?.total ?? null)}</span></li>}
        </ol>
      </section>;
    })}
  </details>;
}

function UnsupportedDetails({ records, label }: { records: readonly ClassifiedUnsupportedEffect[]; label: string }) {
  if (!records.length) return null;
  return <><p className="calc-subhead">{label} ({records.length})</p><ul className="calc-notes">{records.map(({ effect, evidence, kind }) =>
    <li key={effect.key} data-unsupported={effect.key} data-relevance={kind}>
      {effect.message}<small> {evidence} Source: {'slot' in effect.source ? `${effect.source.slot} · ${effect.source.itemId ?? 'unknown item'}` : effect.source.skillId}
        {'powerId' in effect.source && ` · ${effect.source.powerId}/${effect.source.tierId} · effect ${effect.source.effectIndex + 1}`}
        {'description' in effect.source && ` · ${effect.source.description}`}</small>
    </li>)}</ul></>;
}

/**
 * Damage results for one equipped ability: per-target normal hit, AoE total where a target cap is known, critical
 * limitation and an expandable ordered breakdown. All math comes from the pure T0013/T0014 core functions.
 */
export function AbilityResults({ ability, inputs, data, idPrefix, result: precomputed }: { ability: Ability; inputs: AbilityDamageInputs; data: GameDataRepository; idPrefix: string;
  /** Optional result already calculated by the caller for the same ability and inputs. */
  result?: AbilityDamageResult }) {
  const { result, target } = useMemo(() => {
    const result = precomputed ?? calculateAbilityDamage(ability.id, inputs.aggregation, data);
    return { result, target: applyTargetDummy(result, inputs.target) };
  }, [precomputed, ability.id, inputs, data]);
  const modifiers = useMemo(() => new Map(result.aggregation.modifiers.map(m => [m.key, m])), [result]);
  const debug = damageDebugEnabled();
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
  const allWarnings = [...result.warnings, ...target.warnings].filter(w => w.code !== 'unsupported-build-effects');
  const classified = classifyBuildWarnings(result.aggregation, data);
  const warningParts = [
    classified.damage.length > 0 ? `${classified.damage.length} unresolved damage ${classified.damage.length === 1 ? 'effect' : 'effects'}` : null,
    classified.unknown.length > 0 ? `${classified.unknown.length} ${classified.unknown.length === 1 ? 'effect' : 'effects'} with unknown damage relevance` : null,
  ].filter(Boolean);
  const buildWarning = warningParts.length > 0 ? `Across build: ${warningParts.join(', ')}; applicability to this ability is unconfirmed.` : null;
  const uniqueWarnings = [...new Map(allWarnings.map(w => [`${w.code}|${w.message}`, w])).values()];
  const informationalCodes = new Set(['critical-unavailable', 'provisional-formula', 'components-not-combined', 'single-target-ability', 'unsupported-build-effects']);
  const status = hits.length === 0 || hits.every(hit => hit.perTarget === null) ? 'Unavailable'
    : hits.some(hit => hit.perTarget === null || (count > 1 && hit.total === null)) || classified.damage.length + classified.unknown.length > 0 ||
      allWarnings.some(warning => !informationalCodes.has(warning.code)) ? 'Estimated'
      : target.confidence !== 'validated' || hits.some(hit => hit.estimated) ? 'Estimated' : null;
  return <section className="ability-results" aria-labelledby={`${idPrefix}-results-title`} data-confidence={target.confidence}>
    <h4 id={`${idPrefix}-results-title`}>Damage{status && <small className="result-status" role="status" title={status === 'Estimated' ? 'This value uses estimated or provisional rules.' : 'A supported value cannot be calculated.'}>{status}</small>}{target.burst && <span className="result-scope"> · Burst {target.burst.radius} m{target.burst.source === 'treasure-conversion' ? ' (mod)' : ''}</span>}</h4>
    {hits.length === 0 ? <p className="muted">No direct hit is published{ability.pve.dots?.length ? '; DoT damage is not calculated yet.' : '.'}</p>
      : <dl className="result-rows">{hits.map(hit => <div key={hit.componentId} className="result-row" data-component={hit.componentId}>
        <dt>{hitLabel(hit.componentId)}{count > 1 ? ' · per target' : ''}</dt>
        <dd>{hit.perTarget === null ? <span className="muted">Unavailable</span>
          : <><span className={`damage-value ${damageTypeClass(hit.damageType)}`}>{formatDamage(hit.perTarget)} {hit.damageType}</span>{hit.estimated && <small className="result-estimate">Estimated</small>}</>}</dd>
      </div>)}
      {count > 1 && hits.map(hit => <div key={`total-${hit.componentId}`} className="result-row result-total" data-component={hit.componentId}>
        <dt>{hits.length > 1 ? `${hitLabel(hit.componentId)} total` : 'Total'} · {target.affectedTargets ?? count} {(target.affectedTargets ?? count) === 1 ? 'enemy' : 'enemies'}</dt>
        <dd>{hit.total === null ? <span className="muted">Unavailable</span>
          : <>{formatDamage(hit.total)}{hit.estimated && <small className="result-estimate">Estimated</small>}</>}</dd>
      </div>)}
      <div className="result-row"><dt>Critical hit</dt><dd>{result.criticalDamage === null ? <span className="muted">Unavailable</span> : formatDamage(result.criticalDamage)}</dd></div>
    </dl>}
    <PublicBreakdown components={breakdownComponents} target={target} modifiers={modifiers} />
    {debug && <>
    {count > 1 && targetLimits.map(w => <p key={w.code} className="result-note" data-warning={w.code}>{w.message}</p>)}
    {sideEffects.length > 0 && <p className="result-note result-side-effects">Not damage: {sideEffects.map(m => m.category === 'ability-taunt-flat'
      ? `taunt +${formatDamage(m.value)}` : `reuse timer +${formatDamage(m.value)} s`).join(' · ')}</p>}
    {omitted.length > 0 && <p className="result-note result-limits">Not included: {omitted.join(' · ')}</p>}
    {buildWarning && <p className="result-note result-build-limits">{buildWarning}</p>}
    {result.warnings.some(w => w.code === 'aggregation-incomplete') && <p className="result-note result-build-limits">Across build: some sources could not be resolved.</p>}
    <details className="calc-breakdown"><summary>Calculation breakdown</summary>
      <p className="calc-confidence">{CONFIDENCE_LABELS[target.confidence].help} Values are calculations from published data, not in-game measurements. * marks an assumed rule.</p>
      {breakdownComponents.map(component => <ComponentBreakdown key={component.id} component={component} target={target} modifiers={modifiers} />)}
      {uniqueWarnings.length > 0 && <><p className="calc-subhead">Limitations</p><ul className="calc-notes">{uniqueWarnings.map(w =>
        <li key={`${w.code}|${w.message}`} data-warning={w.code}>{w.message}</li>)}</ul></>}
      <UnsupportedDetails records={classified.damage} label="Unresolved damage effects" />
      <UnsupportedDetails records={classified.unknown} label="Unknown damage relevance" />
      <UnsupportedDetails records={classified.nonDamage} label="Non-damage source details (not simulated)" />
      {target.falloff && <><p className="calc-subhead">Burst target-count rules (<a href={BURST_FALLOFF_RULES.sourceUrl} target="_blank" rel="noreferrer">2024-07-30 notes</a>)</p><ul className="calc-notes">
        <li data-falloff="direct">Direct: {target.falloff.direct.explanation}</li>
        <li data-falloff="indirect">Indirect (DoTs, not calculated): {target.falloff.indirect.explanation}</li></ul></>}
      {target.abilityEffects.length > 0 && <><p className="calc-subhead">Ability changes from mods</p><ul className="calc-notes">{target.abilityEffects.map(m =>
        <li key={m.key} data-ability-effect={m.category}>{m.attributeLabel ?? m.attributeId}: {m.sourceValue}{m.unit === 'seconds' ? ' s' : m.unit === 'meters' ? ' m' : ''} ({sourceLabel(m.source)})</li>)}</ul></>}
      {assumptions.length > 0 && <><p className="calc-subhead">Assumptions</p><ul className="calc-notes">
        {assumptions.map(a => <li key={a}>{a}</li>)}</ul></>}
    </details>
    </>}
  </section>;
}

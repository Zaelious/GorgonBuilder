import type { DamageProcResult, StampedeScenarioResult, ModifierSource, UnsupportedEffect } from '../../core/calculation';
import type { GameDataRepository } from '../../data/repository/repository';
import { writeStampedeStacks, writeWhileStunned } from '../../persistence/local/stampede-scenario';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const value = (n: number | null) => n === null ? 'Unavailable' : number.format(n);
const chance = (p: number | null) => p === null ? 'Unavailable' : `${number.format(p * 100)}%`;
function sourceName(source: ModifierSource | UnsupportedEffect['source'], data: GameDataRepository): string {
  if (source.kind !== 'existing-power' && source.kind !== 'candidate-mod') return 'Equipment';
  const power = data.getTreasurePower(source.powerId);
  return `${source.slot === 'OffHandShield' ? 'OffHand' : source.slot} · ${power?.suffix ?? power?.prefix ?? 'Damage mod'}`;
}

export function StampedeRows({ scenario, idPrefix }: { scenario: StampedeScenarioResult; idPrefix: string }) {
  const count = scenario.baseline.configuredTargets;
  return <>
    {scenario.hasStackSources && <div className="result-row stampede-control"><dt><label htmlFor={`${idPrefix}-stampede-stacks`}>Current Stampede stacks</label></dt><dd>
      <select id={`${idPrefix}-stampede-stacks`} value={scenario.stacks} onChange={event => writeStampedeStacks(Number(event.target.value))}
        title="Assumed current stacks before this attack; 0 is the first attack.">
        {Array.from({ length: 16 }, (_, stacks) => <option key={stacks} value={stacks}>{stacks}</option>)}
      </select>
    </dd></div>}
    {scenario.stunnedModifiers.length > 0 && <div className="result-row stampede-control"><dt><label htmlFor={`${idPrefix}-while-stunned`}>While Stunned</label></dt><dd><input id={`${idPrefix}-while-stunned`} type="checkbox" checked={scenario.whileStunned} onChange={event => writeWhileStunned(event.target.checked)} /></dd></div>}
    {scenario.baseline.hits.map(hit => {
      const projected = (scenario.whileStunned ? scenario.stacked : scenario.projected)?.hits.find(row => row.componentId === hit.componentId);
      return <div className="result-row" key={hit.componentId} data-stampede="projected"><dt>Stampede at {scenario.stacks} stacks{count > 1 ? ' · per target' : ''}</dt>
        <dd>{value(projected?.perTarget ?? null)} <small className="result-estimate">{scenario.status === 'estimated' ? 'Estimated' : 'Unavailable'}</small></dd></div>;
    })}
    {scenario.whileStunned && scenario.baseline.hits.map(hit => <div className="result-row" key={`stunned-${hit.componentId}`} data-stampede="stunned"><dt>Stampede at {scenario.stacks} stacks · While Stunned{count > 1 ? ' · per target' : ''}</dt><dd>{value(scenario.projected?.hits.find(h => h.componentId === hit.componentId)?.perTarget ?? null)} <small className="result-estimate">{scenario.status === 'estimated' ? 'Estimated' : 'Unavailable'}</small></dd></div>)}
    {count > 1 && scenario.projected?.hits.map(hit => <div className="result-row" key={`total-${hit.componentId}`} data-stampede="total">
      <dt>Stacked total</dt><dd>{value(hit.total)}</dd></div>)}
  </>;
}

export function ProcRows({ proc, count }: { proc: DamageProcResult; count: number }) {
  return <>
    <div className="result-row" data-proc="chance"><dt>Proc chance</dt><dd>{chance(proc.probability)} <small className="result-estimate">{proc.status === 'estimated' ? 'Estimated' : 'Unavailable'}</small></dd></div>
    {proc.hits.map(hit => <div className="result-row" data-proc="hit" key={hit.componentId}>
      <dt>Proc-triggered hit{count > 1 ? ' · per target' : ''}</dt><dd>{value(hit.triggered)}</dd></div>)}
    {proc.hits.map(hit => <div className="result-row" data-proc="expected" key={`expected-${hit.componentId}`}>
      <dt>Expected per successful hit (proc only){count > 1 ? ' · per target' : ''}</dt><dd>{value(hit.expected)}</dd></div>)}
    {count > 1 && proc.hits.map(hit => <div className="result-row" data-proc="total" key={`total-${hit.componentId}`}>
      <dt>Proc hit / expected total</dt><dd>{value(hit.triggeredTotal)} / {value(hit.expectedTotal)}</dd></div>)}
  </>;
}

/** Numerical source contributions only; assumptions and raw source identities remain in the debug view. */
export function ScenarioBreakdown({ stampede, proc, data }: { stampede: StampedeScenarioResult | null; proc: DamageProcResult | null; data: GameDataRepository }) {
  return <>
    {stampede && <section className="calc-component" aria-label="Stampede stack contributions"><h5>Current stacks · {stampede.stacks} <small>{stampede.status === 'estimated' ? 'Estimated' : 'Unavailable'}</small></h5>
      <ol className="calc-steps">{stampede.contributions.map(contribution => <li className="calc-step" key={contribution.modifier.key}>
        <span className="calc-step-label">{sourceName(contribution.modifier.source, data)}<small>+{value(contribution.perStack)} per stack × {contribution.stacks}</small></span>
        <span className="calc-step-value">+{value(contribution.flatBonus)}</span><span />
      </li>)}<li className="calc-step"><span>Stack flat bonus</span><span>+{value(stampede.flatBonus)}</span><span /></li></ol>
    </section>}
    {proc && <section className="calc-component" aria-label="Random damage proc calculation"><h5>Random damage proc <small>{proc.status === 'estimated' ? 'Estimated' : 'Unavailable'}</small></h5>
      {proc.sources.map(source => <div key={source.modifier.key} className="proc-source">
        <p>{sourceName(source.modifier.source, data)} · {chance(source.probability)} · {source.modifier.proc?.effect === 'add-flat' ? '+' : '× '}{value(source.modifier.value)}</p>
        <ol className="calc-steps">{source.hits.map(hit => <li className="calc-step" key={hit.componentId}>
          <span className="calc-step-label">{proc.sources.length > 1 || proc.unresolved.length ? 'Source-only' : 'Ordinary / proc hit'}<small>{value(hit.normal)} → {value(hit.triggered)}</small></span>
          <span className="calc-step-value">{source.probability === null ? 'Unavailable' : chance(source.probability)}</span><span className="calc-step-total">{value(hit.expected)}</span>
        </li>)}</ol>
      </div>)}
      {proc.sources.length > 1 && <p className="muted">Combined proc · Unavailable</p>}
      {proc.unresolved.map(row => <p className="muted" key={row.effect.key}>{sourceName(row.effect.source, data)} · Unavailable</p>)}
      <p className="muted">Expected per successful hit · excludes criticals</p>
    </section>}
  </>;
}

export function ScenarioDiagnostics({ stampede, proc }: { stampede: StampedeScenarioResult | null; proc: DamageProcResult | null }) {
  if (!stampede && !proc) return null;
  return <section data-scenario-debug><h5>Stack / proc diagnostics</h5><ul className="calc-notes">
    {[...(stampede?.assumptions ?? []), ...(stampede?.warnings ?? []), ...(proc?.assumptions ?? []), ...(proc?.warnings ?? [])].map((note, i) => <li key={i}>{note}</li>)}
    {[...(stampede?.decisions ?? []), ...(proc?.decisions ?? [])].map(decision => <li key={decision.modifier.key}>
      {decision.modifier.key} · {decision.status}: {decision.explanation} · {decision.modifier.source.kind === 'candidate-mod' || decision.modifier.source.kind === 'existing-power'
        ? `${decision.modifier.source.powerId}/${decision.modifier.source.tierId}: ${decision.modifier.source.description}` : decision.modifier.attributeId}
    </li>)}
  </ul></section>;
}

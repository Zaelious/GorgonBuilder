import { useState } from 'react';
import type { GameDataRepository } from '../../data/repository/repository';
import { abilityIconUrl } from '../abilities/AbilityIcon';
import { presentEffect } from './effect-description';
import './effect-description.css';

function EffectIcon({ token, version }: { token: string; version: string }) {
  const id = /^\d+$/u.test(token) ? Number(token) : NaN;
  const url = abilityIconUrl(id, version);
  const [failed, setFailed] = useState<string | null>(null);
  const label = Number.isSafeInteger(id) && id >= 0 ? `Official effect icon ${id}` : 'Invalid official effect icon';
  return url && failed !== url
    ? <img className="effect-icon" src={url} width="18" height="18" alt={label} loading="lazy" onError={() => setFailed(url)} />
    : <span className="effect-icon effect-icon-fallback" role="img" aria-label={`${label} unavailable`} title={`${label} unavailable`}>◇</span>;
}

/** Recognize only the official icon token; everything else stays escaped React text. */
function InlineText({ text, version }: { text: string; version: string }) {
  const parts = text.split(/(<icon=[^>]*(?:>|$))/gu);
  return parts.map((part, index) => part.startsWith('<icon=')
    ? <EffectIcon key={index} token={part.slice(6, part.endsWith('>') ? -1 : undefined)} version={version} /> : part);
}

export function EffectDescription({ description, data, fallback = 'Published effect' }: {
  description: string; data: GameDataRepository; fallback?: string;
}) {
  const presentation = presentEffect(description, data);
  return <span className="effect-description">
    {presentation.kind === 'prose' ? <InlineText text={presentation.text} version={data.gameDataVersion} />
      : presentation.kind === 'attribute' ? <>{presentation.label}{presentation.sourceValue ? ' modifier' : ''}: {presentation.value}
        {presentation.context && <span className="effect-context"> · context: {presentation.context}</span>}
        {presentation.sourceValue && <small className="effect-value-note" title={`Published ${presentation.displayType} value unchanged; percentage/scaling convention is unverified. See exact source in Details.`}> source value</small>}
      </> : <>{fallback} <small className="effect-unformatted" title="This official template cannot be safely formatted. Inspect its exact published text in Details.">unformatted official effect</small></>}
  </span>;
}

export function EffectDescriptions({ descriptions, data, fallback }: { descriptions: readonly string[]; data: GameDataRepository; fallback?: string }) {
  return <>{descriptions.map((description, index) => <span key={index}>{index > 0 && ' · '}<EffectDescription description={description} data={data} fallback={fallback} /></span>)}</>;
}

export function ExactEffects({ descriptions }: { descriptions: readonly string[] }) {
  return <details className="mod-more exact-effects"><summary>Exact published effect text</summary>
    {descriptions.map((description, index) => <pre key={index}>{description}</pre>)}
  </details>;
}

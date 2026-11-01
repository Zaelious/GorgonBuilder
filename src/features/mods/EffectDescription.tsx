import { useState } from 'react';
import type { GameDataRepository } from '../../data/repository/repository';
import { abilityIconUrl } from '../abilities/AbilityIcon';
import { effectSummaryText, presentEffect, requiredSkills, type EffectPresentation } from './effect-description';
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

function AttributeText({ presentation }: { presentation: Extract<EffectPresentation, { kind: 'attribute' }> }) {
  return <>{presentation.label} {presentation.value}
    {!presentation.verified && <small className="effect-value-note" title={`Published ${presentation.displayType} value unchanged; this display type's player-facing scale is not established by the pinned data. See exact source in Details.`}> (scale unverified)</small>}
  </>;
}

const UNFORMATTED = <small className="effect-unformatted" title="This official template cannot be safely formatted. Inspect its exact published text in Details.">unformatted official effect</small>;

export function EffectDescription({ description, data, fallback = 'Published effect' }: {
  description: string; data: GameDataRepository; fallback?: string;
}) {
  const presentation = presentEffect(description, data);
  return <span className="effect-description">
    {presentation.kind === 'prose' ? <InlineText text={presentation.text} version={data.gameDataVersion} />
      : presentation.kind === 'attribute' ? <AttributeText presentation={presentation} />
        : <>{fallback} {UNFORMATTED}</>}
  </span>;
}

/** One readable mod effect per tier: every published line is shown, comma-separated. */
export function EffectDescriptions({ descriptions, data, fallback = 'Published effect' }: { descriptions: readonly string[]; data: GameDataRepository; fallback?: string }) {
  const presentations = descriptions.map(description => presentEffect(description, data));
  const shown = presentations.flatMap((presentation, index) => presentation.kind === 'unsupported' ? [] : [{ presentation, index }]);
  const unsupported = shown.length < presentations.length;
  const title = [effectSummaryText(descriptions, data, fallback), ...requiredSkills(descriptions, data).map(requirementText)].join(' · ');
  return <span className="effect-description" title={title}>
    {shown.map(({ presentation, index }, position) => <span key={index}>{position > 0 && ', '}
      {presentation.kind === 'prose' ? <InlineText text={presentation.text} version={data.gameDataVersion} /> : presentation.kind === 'attribute' && <AttributeText presentation={presentation} />}
    </span>)}
    {unsupported && <>{shown.length > 0 ? ', ' : ''}{fallback} {UNFORMATTED}</>}
  </span>;
}

export function requirementText(skill: string) { return `Requires ${skill} active`; }

/** Subtle eligibility note for expanded details. */
export function EffectRequirements({ descriptions, data }: { descriptions: readonly string[]; data: GameDataRepository }) {
  const skills = requiredSkills(descriptions, data);
  return skills.length ? <p className="effect-requirement">{skills.map(requirementText).join(' · ')}</p> : null;
}

export function ExactEffects({ descriptions }: { descriptions: readonly string[] }) {
  return <details className="mod-more exact-effects"><summary>Exact published effect text</summary>
    {descriptions.map((description, index) => <pre key={index}>{description}</pre>)}
  </details>;
}

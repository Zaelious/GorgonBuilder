import type { GameDataRepository } from '../../data/repository/repository';

export type EffectPresentation =
  | { kind: 'prose'; text: string }
  | {
    kind: 'attribute'; label: string; value: string; displayType: string;
    /** false when the pinned data does not establish this display type's player-facing scale. */
    verified: boolean;
    /** Official third argument: the player must have this skill active to get the buff. */
    requiredSkill: string | null;
  }
  | { kind: 'unsupported' };

/**
 * Official tsysclientinfo notes: attribute descriptions are `{attributeName}{delta}{requiredSkill}`;
 * the optional skill "must be active" for the buff. Display types below are only those whose
 * player-facing presentation is evidenced (see docs/T0010_Verification.md):
 * - Percent display: the attribute label ends in `%` and its DisplayType is a multiplier/percent
 *   mode. The delta is a fraction, shown as delta × 100 with a sign (0.25 → +25%, 0.625 → +62.5%).
 * - Additive display: integer/delta modes with non-% labels show the signed delta unchanged.
 * Anything else keeps the unchanged source number with an explicit "scale unverified" flag.
 * This is presentation only; no stacking, baselines or damage formulas are implied.
 */
const PERCENT_DISPLAY_TYPES = new Set(['AsBuffMod', 'AsDebuffMod', 'AsPercent', 'AsDoubleTimes100']);
const ADDITIVE_DISPLAY_TYPES = new Set(['AsBuffDelta', 'AsDebuffDelta', 'AsInt', 'AsDouble']);
const NUMBER = /^([+-]?)(\d*)(?:\.(\d*))?$/u;

/** Exact decimal string shift (no floating-point drift): ('0.625', 2) → '62.5'. */
export function shiftDecimal(value: string, places: number): string | null {
  const match = NUMBER.exec(value);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null;
  const sign = match[1] === '-' ? '-' : '';
  let integer = match[2]!;
  let fraction = match[3] ?? '';
  fraction = fraction.padEnd(places, '0');
  integer += fraction.slice(0, places);
  fraction = fraction.slice(places).replace(/0+$/u, '');
  integer = integer.replace(/^0+(?=\d)/u, '') || '0';
  const result = fraction ? `${integer}.${fraction}` : integer;
  return /^0(?:\.0*)?$/u.test(result) ? result : sign + result;
}

/** Signed display of an exact numeric source string. */
export function signed(value: string): string | null {
  const normal = shiftDecimal(value, 0);
  if (normal === null) return null;
  return normal.startsWith('-') ? normal : `+${normal}`;
}

export function presentEffect(description: string, data: GameDataRepository): EffectPresentation {
  if (!/[{}]/u.test(description)) return { kind: 'prose', text: description };
  const match = /^\{([A-Z_0-9]+)\}\{([+-]?(?:\d+(?:\.\d+)?|\.\d+))\}(?:\{([A-Za-z0-9_]+)\})?$/u.exec(description);
  if (!match || !Number.isFinite(Number(match[2]))) return { kind: 'unsupported' };
  const attribute = data.getAttribute(match[1]!);
  if (!attribute?.label || attribute.displayRule === 'Never') return { kind: 'unsupported' };
  const skillId = match[3];
  const skill = skillId === undefined ? null : data.getSkill(skillId);
  if (skill === undefined) return { kind: 'unsupported' };
  const requiredSkill = skill ? skill.name ?? skill.id : null;
  const percentLabel = /\s*%$/u.test(attribute.label);
  const label = attribute.label.replace(/\s*%$/u, '');
  const raw = match[2]!;
  const base = { kind: 'attribute' as const, label, displayType: attribute.displayType, requiredSkill };
  if (percentLabel && PERCENT_DISPLAY_TYPES.has(attribute.displayType)) {
    const shifted = signed(shiftDecimal(raw, 2)!);
    return { ...base, value: `${shifted}%`, verified: true };
  }
  if (!percentLabel && ADDITIVE_DISPLAY_TYPES.has(attribute.displayType)) return { ...base, value: signed(raw)!, verified: true };
  return { ...base, value: raw, verified: false };
}

/** Plain-text rendering of a whole tier (comma-joined), for tooltips and accessible names. */
export function effectSummaryText(descriptions: readonly string[], data: GameDataRepository, fallback = 'Published effect'): string {
  const parts: string[] = [];
  let unsupported = false;
  for (const description of descriptions) {
    const presentation = presentEffect(description, data);
    if (presentation.kind === 'prose') parts.push(presentation.text.replace(/<icon=[^>]*(?:>|$)\s*/gu, '').trim());
    else if (presentation.kind === 'attribute') parts.push(`${presentation.label} ${presentation.value}`);
    else unsupported = true;
  }
  if (unsupported) parts.push(`${fallback} (unformatted official effect)`);
  return parts.join(', ');
}

/** Unique required active skills for a tier's attribute descriptions. */
export function requiredSkills(descriptions: readonly string[], data: GameDataRepository): string[] {
  const skills = descriptions.map(description => presentEffect(description, data))
    .flatMap(presentation => presentation.kind === 'attribute' && presentation.requiredSkill ? [presentation.requiredSkill] : []);
  return [...new Set(skills)];
}

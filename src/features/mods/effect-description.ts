import type { GameDataRepository } from '../../data/repository/repository';

export type EffectPresentation =
  | { kind: 'prose'; text: string }
  | { kind: 'attribute'; label: string; value: string; sourceValue: boolean; context: string | null; displayType: string }
  | { kind: 'unsupported' };

/** Presentation only: exact attribute lookup and unchanged numeric source text.
 * The pinned data names display modes, but does not define AsBuffMod/AsPercent
 * conversions. Never assume baseline subtraction, percentage scaling or formulas.
 */
export function presentEffect(description: string, data: GameDataRepository): EffectPresentation {
  if (!/[{}]/u.test(description)) return { kind: 'prose', text: description };
  const match = /^\{([A-Z_0-9]+)\}\{([+-]?(?:\d+(?:\.\d+)?|\.\d+))\}(?:\{([^{}]+)\})?$/u.exec(description);
  if (!match || !Number.isFinite(Number(match[2]))) return { kind: 'unsupported' };
  const attribute = data.getAttribute(match[1]!);
  if (!attribute?.label || attribute.displayRule === 'Never') return { kind: 'unsupported' };
  const context = match[3] === undefined ? null : data.getSkill(match[3]);
  if (context === undefined) return { kind: 'unsupported' };
  const sourceValue = !['AsInt', 'AsDouble', 'AsBuffDelta', 'AsDebuffDelta'].includes(attribute.displayType);
  return { kind: 'attribute', label: attribute.label.replace(/\s*%$/u, ''), value: match[2]!, sourceValue,
    context: context ? context.name ?? context.id : null, displayType: attribute.displayType };
}

/**
 * Pure placement for the floating ability tooltip (T0022-F2). No DOM or React: the caller measures the card's natural
 * height at the fixed tooltip width and receives viewport coordinates.
 *
 * The card is always one narrow column (≈440 px desktop, never above 480 px; bounded by the viewport on phones) and is
 * never widened or split into columns to fit. Preference: below the slot, then above, horizontally clamped into the
 * viewport; if neither has room, a narrow card beside the slot (right, then left); on narrow screens without side room,
 * the whole card is kept inside the viewport as close to the slot as possible. Only content taller than the viewport
 * scrolls, inside a bounded full-height column (title and close stay pinned).
 */

export interface AnchorRect { left: number; top: number; right: number; bottom: number }
export interface ViewportSize { width: number; height: number }
export type PopoverSide = 'below' | 'above' | 'right' | 'left' | 'overlay';

export interface PopoverPlacement {
  side: PopoverSide;
  left: number;
  top: number;
  width: number;
  /** Room for the card; equals the content height whenever it fits. */
  maxHeight: number;
  /** False only when the content is taller than the chosen room and scrolls internally (last resort). */
  fits: boolean;
}

/** Keeps the card clear of the viewport edge and the slot. */
export const VIEWPORT_MARGIN = 16;
export const ANCHOR_GAP = 6;
/** Fixed tooltip width at normal desktop zoom (requirement: ≈400–460 px, hard ceiling 480 px). */
export const TOOLTIP_WIDTH = 440;
export const TOOLTIP_MAX_WIDTH = 480;

export function tooltipWidth(viewport: ViewportSize): number {
  return Math.max(0, Math.min(TOOLTIP_WIDTH, TOOLTIP_MAX_WIDTH, viewport.width - 2 * VIEWPORT_MARGIN));
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Choose where the card goes. `height` is the card's full natural height (including borders) at `tooltipWidth`. */
export function choosePopoverPlacement(anchor: AnchorRect, viewport: ViewportSize, height: number): PopoverPlacement {
  const m = VIEWPORT_MARGIN, gap = ANCHOR_GAP;
  const width = tooltipWidth(viewport);
  const left = clamp(anchor.left, m, viewport.width - m - width);
  const below = viewport.height - anchor.bottom - gap - m;
  const above = anchor.top - gap - m;
  const full = viewport.height - 2 * m;
  const right = viewport.width - anchor.right - gap - m >= width;
  const leftSide = anchor.left - gap - m >= width;
  const sideTop = (shown: number) => clamp(anchor.top, m, viewport.height - m - shown);
  const sideLeft = right ? anchor.right + gap : anchor.left - gap - width;

  if (height <= below) return { side: 'below', left, top: anchor.bottom + gap, width, maxHeight: height, fits: true };
  if (height <= above) return { side: 'above', left, top: anchor.top - gap - height, width, maxHeight: height, fits: true };
  if ((right || leftSide) && height <= full) {
    return { side: right ? 'right' : 'left', left: sideLeft, top: sideTop(height), width, maxHeight: height, fits: true };
  }

  // Narrow screens without room beside the slot: keep the whole card inside the viewport, as close to the slot as possible.
  const near = (shown: number) => clamp(anchor.bottom + gap, m, viewport.height - m - shown);
  if (height <= full) return { side: 'overlay', left, top: near(height), width, maxHeight: height, fits: true };
  // Last resort: content taller than the viewport scrolls inside one narrow, full-height column (beside the slot when possible).
  if (right || leftSide) return { side: right ? 'right' : 'left', left: sideLeft, top: m, width, maxHeight: full, fits: false };
  return { side: 'overlay', left, top: m, width, maxHeight: full, fits: false };
}

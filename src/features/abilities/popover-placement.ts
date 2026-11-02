/**
 * Pure placement for the floating ability inspector (T0022-F1). No DOM or React: callers measure the popover's natural
 * height for a candidate width/layout and receive viewport coordinates.
 *
 * Order of preference: keep the compact single-column card and fit it entirely, trying growing widths (fewer wrapped
 * lines) and every side of the slot (below, above, right, left). Only when no compact card fits does it switch to the
 * expanded presentation: two columns beside the slot when a side has room, otherwise a wide card (two columns when the
 * viewport allows) placed beside or, failing that, over the slot row. Internal scrolling remains solely as a last
 * resort when even the expanded card is taller than the viewport (e.g. very long content on a phone).
 */

export interface AnchorRect { left: number; top: number; right: number; bottom: number }
export interface ViewportSize { width: number; height: number }
export type PopoverSide = 'below' | 'above' | 'right' | 'left' | 'overlay';
export type PopoverLayout = 'compact' | 'expanded' | 'expanded-columns';

export interface PopoverPlacement {
  side: PopoverSide;
  layout: PopoverLayout;
  left: number;
  top: number;
  width: number;
  /** Viewport room for the card; equals the content height whenever it fits. */
  maxHeight: number;
  /** False only when the content is taller than all available room and scrolls internally. */
  fits: boolean;
}

/** Keeps the card clear of the viewport edge and the slot. */
export const VIEWPORT_MARGIN = 16;
export const ANCHOR_GAP = 8;
/** Desktop compact widths, narrowest first (≈440–560 px). */
export const COMPACT_WIDTHS = [460, 520, 560] as const;
export const NARROW_COMPACT_WIDTH = 440;
export const DESKTOP_MIN_VIEWPORT = 1024;
export const EXPANDED_MAX_WIDTH = 920;
/** Below this width the expanded card keeps one column. */
export const COLUMNS_MIN_WIDTH = 680;

export function compactWidths(viewport: ViewportSize): number[] {
  const room = Math.max(0, viewport.width - 2 * VIEWPORT_MARGIN);
  const preferred = viewport.width >= DESKTOP_MIN_VIEWPORT ? COMPACT_WIDTHS : [NARROW_COMPACT_WIDTH];
  return [...new Set(preferred.map(width => Math.min(width, room)))];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** The first side, in preference order, where a card of this size fits entirely without covering the slot. */
export function fitBesideAnchor(anchor: AnchorRect, viewport: ViewportSize, width: number, height: number): Pick<PopoverPlacement, 'side' | 'left' | 'top'> | null {
  const m = VIEWPORT_MARGIN, gap = ANCHOR_GAP;
  const horizontal = clamp(anchor.left, m, viewport.width - m - width);
  const vertical = clamp(anchor.top, m, viewport.height - m - height);
  if (width > viewport.width - 2 * m) return null;
  if (height <= viewport.height - anchor.bottom - gap - m) return { side: 'below', left: horizontal, top: anchor.bottom + gap };
  if (height <= anchor.top - gap - m) return { side: 'above', left: horizontal, top: anchor.top - gap - height };
  if (height > viewport.height - 2 * m) return null;
  if (width <= viewport.width - anchor.right - gap - m) return { side: 'right', left: anchor.right + gap, top: vertical };
  if (width <= anchor.left - gap - m) return { side: 'left', left: anchor.left - gap - width, top: vertical };
  return null;
}

/**
 * Choose the popover placement. `measure(width, layout)` returns the card's full natural height (including borders)
 * when rendered at that width and layout.
 */
export function choosePopoverPlacement(anchor: AnchorRect, viewport: ViewportSize, measure: (width: number, layout: PopoverLayout) => number): PopoverPlacement {
  for (const width of compactWidths(viewport)) {
    const height = measure(width, 'compact');
    const fit = fitBesideAnchor(anchor, viewport, width, height);
    if (fit) return { ...fit, layout: 'compact', width, maxHeight: height, fits: true };
  }
  const room = viewport.height - 2 * VIEWPORT_MARGIN;
  // Two columns beside the slot (keeps the hovered slot visible) when the side has room for them.
  for (const side of ['right', 'left'] as const) {
    const sideRoom = side === 'right' ? viewport.width - anchor.right - ANCHOR_GAP - VIEWPORT_MARGIN : anchor.left - ANCHOR_GAP - VIEWPORT_MARGIN;
    const sideWidth = Math.floor(Math.min(EXPANDED_MAX_WIDTH, sideRoom));
    if (sideWidth < COLUMNS_MIN_WIDTH) continue;
    const height = measure(sideWidth, 'expanded-columns');
    if (height > room) continue;
    return { side, layout: 'expanded-columns', width: sideWidth, maxHeight: height, fits: true,
      left: side === 'right' ? anchor.right + ANCHOR_GAP : anchor.left - ANCHOR_GAP - sideWidth,
      top: clamp(anchor.top, VIEWPORT_MARGIN, viewport.height - VIEWPORT_MARGIN - height) };
  }
  const width = Math.max(0, Math.min(EXPANDED_MAX_WIDTH, viewport.width - 2 * VIEWPORT_MARGIN));
  const layout: PopoverLayout = width >= COLUMNS_MIN_WIDTH ? 'expanded-columns' : 'expanded';
  const height = measure(width, layout);
  const beside = fitBesideAnchor(anchor, viewport, width, height);
  if (beside) return { ...beside, layout, width, maxHeight: height, fits: true };
  // Overlay: as close to the slot as possible while staying fully inside the viewport.
  const shown = Math.min(height, room);
  const center = (anchor.left + anchor.right) / 2;
  return {
    side: 'overlay', layout, width,
    left: clamp(center - width / 2, VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - width),
    top: clamp(anchor.bottom + ANCHOR_GAP, VIEWPORT_MARGIN, viewport.height - VIEWPORT_MARGIN - shown),
    maxHeight: room, fits: height <= room,
  };
}

import { describe, expect, it } from 'vitest';
import { TOOLTIP_MAX_WIDTH, choosePopoverPlacement, tooltipWidth, type AnchorRect } from './popover-placement';

const slot = (left: number, top: number, size = 52): AnchorRect => ({ left, top, right: left + size, bottom: top + size });
const desktop = { width: 1920, height: 1080 };

describe('tooltipWidth', () => {
  it('is one fixed narrow column: 440 px on desktop, viewport-bounded on phones, never above 480 px', () => {
    expect(tooltipWidth(desktop)).toBe(440);
    expect(tooltipWidth({ width: 1366, height: 768 })).toBe(440);
    expect(tooltipWidth({ width: 375, height: 812 })).toBe(343);
    expect(tooltipWidth({ width: 320, height: 568 })).toBe(288);
    expect(tooltipWidth({ width: 5000, height: 2000 })).toBeLessThanOrEqual(TOOLTIP_MAX_WIDTH);
  });
});

describe('choosePopoverPlacement', () => {
  it('prefers below the slot, aligned to it', () => {
    expect(choosePopoverPlacement(slot(557, 225), desktop, 600)).toEqual({ side: 'below', left: 557, top: 283, width: 440, maxHeight: 600, fits: true });
  });

  it('clamps horizontally only enough to stay inside the viewport', () => {
    expect(choosePopoverPlacement(slot(1800, 225), desktop, 300).left).toBe(1920 - 16 - 440);
    expect(choosePopoverPlacement(slot(4, 225), desktop, 300).left).toBe(16);
  });

  it('uses above when below has no room', () => {
    expect(choosePopoverPlacement(slot(557, 800), desktop, 600)).toMatchObject({ side: 'above', top: 800 - 6 - 600, fits: true, width: 440 });
  });

  it('places a narrow card beside the slot when neither below nor above has room, never wider or split', () => {
    const p = choosePopoverPlacement(slot(424, 225), { width: 1366, height: 768 }, 640);
    expect(p).toEqual({ side: 'right', left: 482, top: 112, width: 440, maxHeight: 640, fits: true });
    expect(choosePopoverPlacement(slot(1250, 225), { width: 1366, height: 768 }, 640)).toMatchObject({ side: 'left', left: 1250 - 6 - 440, width: 440 });
  });

  it('keeps the whole card inside a small viewport, near the slot, when no side has room', () => {
    const p = choosePopoverPlacement(slot(30, 400, 44), { width: 375, height: 812 }, 675);
    expect(p).toEqual({ side: 'overlay', width: 343, left: 16, top: 812 - 16 - 675, maxHeight: 675, fits: true });
  });

  it('scrolls only content taller than the viewport, in one narrow full-height column', () => {
    expect(choosePopoverPlacement(slot(424, 225), { width: 1366, height: 768 }, 900)).toEqual({ side: 'right', left: 482, top: 16, width: 440, maxHeight: 736, fits: false });
    expect(choosePopoverPlacement(slot(30, 300, 44), { width: 320, height: 568 }, 738)).toEqual({ side: 'overlay', left: 16, top: 16, width: 288, maxHeight: 536, fits: false });
  });
});

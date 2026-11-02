import { describe, expect, it } from 'vitest';
import { choosePopoverPlacement, compactWidths, fitBesideAnchor, type AnchorRect, type PopoverLayout } from './popover-placement';

const slot = (left: number, top: number, size = 52): AnchorRect => ({ left, top, right: left + size, bottom: top + size });
/** Synthetic content: total text area is constant, so wider cards are shorter; columns roughly halve the height. */
const content = (area: number, chrome = 120) => (width: number, layout: PopoverLayout) =>
  chrome + Math.ceil(area / (layout === 'expanded-columns' ? width * 1.8 : width));
const inside = (p: ReturnType<typeof choosePopoverPlacement>, vw: number, vh: number) =>
  p.left >= 16 && p.left + p.width <= vw - 16 && p.top >= 16 && p.top + Math.min(p.maxHeight, vh) <= vh - 16;

describe('compactWidths', () => {
  it('offers 460–560 px on desktop and a viewport-bounded width on phones', () => {
    expect(compactWidths({ width: 1920, height: 1080 })).toEqual([460, 520, 560]);
    expect(compactWidths({ width: 375, height: 812 })).toEqual([343]);
    expect(compactWidths({ width: 320, height: 568 })).toEqual([288]);
  });
});

describe('fitBesideAnchor', () => {
  it('prefers below, then above, then right, then left, and never covers the slot', () => {
    const anchor = slot(560, 300);
    expect(fitBesideAnchor(anchor, { width: 1920, height: 1080 }, 460, 500)?.side).toBe('below');
    expect(fitBesideAnchor(slot(560, 800), { width: 1920, height: 1080 }, 460, 500)?.side).toBe('above');
    const right = fitBesideAnchor(anchor, { width: 1920, height: 1080 }, 460, 900)!;
    expect(right).toEqual({ side: 'right', left: 620, top: 164 });
    expect(fitBesideAnchor(slot(1400, 300), { width: 1920, height: 1080 }, 460, 900)?.side).toBe('left');
    expect(fitBesideAnchor(anchor, { width: 1920, height: 1080 }, 460, 1100)).toBeNull();
  });
});

describe('choosePopoverPlacement', () => {
  it('keeps a short card compact below the slot (Acid Arrow-like)', () => {
    const p = choosePopoverPlacement(slot(557, 306), { width: 1920, height: 1080 }, () => 495);
    expect(p).toMatchObject({ side: 'below', layout: 'compact', width: 460, fits: true, maxHeight: 495, top: 366 });
  });

  it('moves a tall card beside the slot instead of scrolling (Chew Cud-like at 1920×1080)', () => {
    const p = choosePopoverPlacement(slot(557, 225), { width: 1920, height: 1080 }, () => 818);
    expect(p).toMatchObject({ side: 'right', layout: 'compact', width: 460, fits: true, maxHeight: 818 });
    expect(inside(p, 1920, 1080)).toBe(true);
  });

  it('widens the compact card when that removes enough wrapping to fit', () => {
    const measure = content(460 * 680);
    const p = choosePopoverPlacement(slot(557, 225), { width: 1920, height: 760 }, measure);
    expect(p.layout).toBe('compact');
    expect(p.width).toBeGreaterThan(460);
    expect(p.width).toBeLessThanOrEqual(560);
    expect(p.fits).toBe(true);
  });

  it('switches to two columns beside the slot when no compact width fits', () => {
    const p = choosePopoverPlacement(slot(424, 225), { width: 1366, height: 768 }, content(460 * 900));
    expect(p).toMatchObject({ side: 'right', layout: 'expanded-columns', fits: true, left: 484 });
    expect(p.width).toBe(1366 - 476 - 8 - 16);
    expect(inside(p, 1366, 768)).toBe(true);
  });

  it('falls back to a full-height sheet that scrolls only when content cannot fit at all (phone)', () => {
    const p = choosePopoverPlacement(slot(30, 400, 44), { width: 375, height: 812 }, () => 900);
    expect(p).toMatchObject({ side: 'overlay', layout: 'expanded', width: 343, left: 16, top: 16, maxHeight: 780, fits: false });
  });

  it('places an expanded card that fits without scrolling on a phone', () => {
    const p = choosePopoverPlacement(slot(30, 400, 44), { width: 375, height: 812 }, (_width, layout) => layout === 'compact' ? 500 : 480);
    expect(p).toMatchObject({ side: 'overlay', layout: 'expanded', fits: true, left: 16, top: 812 - 16 - 480 });
  });
});

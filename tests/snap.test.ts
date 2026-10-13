import { describe, expect, it } from 'vitest';
import { collectSnapTargets, rectTargets, slideTargets, snapRect, snapResizeBox, unionRects } from '../src/render/snap';

const canvas = { slideCount: 3, aspect: '4:5' as const, slideWidthPx: 1080 }; // 3240 x 1350

describe('snap targets', () => {
  it('includes every slide edge and center and the horizontal midlines', () => {
    const t = slideTargets(canvas);
    expect(t.x.map((l) => l.pos)).toEqual([0, 540, 1080, 1620, 2160, 2700, 3240]);
    expect(t.y.map((l) => l.pos)).toEqual([0, 675, 1350]);
    expect(t.x[0]).toMatchObject({ from: 0, to: 1350 });
  });

  it('derives edge/center lines from other rects', () => {
    const t = rectTargets([{ x: 100, y: 200, width: 400, height: 100 }]);
    expect(t.x.map((l) => l.pos)).toEqual([100, 300, 500]);
    expect(t.y.map((l) => l.pos)).toEqual([200, 250, 300]);
    expect(t.x[0]).toMatchObject({ from: 200, to: 300 });
  });

  it('unions rects', () => {
    expect(unionRects([])).toBeNull();
    expect(
      unionRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 5, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 30, height: 15 });
  });
});

describe('snapRect', () => {
  const targets = collectSnapTargets(canvas, []);

  it('snaps an edge to a slide seam within the threshold', () => {
    const r = snapRect({ x: 1074, y: 100, width: 200, height: 200 }, targets, 8);
    expect(r.snappedX).toBe(true);
    expect(r.dx).toBe(6);
    expect(r.guides.some((g) => g.orientation === 'v' && g.pos === 1080)).toBe(true);
  });

  it('snaps the center to a slide center', () => {
    const r = snapRect({ x: 440, y: 0, width: 200, height: 200 }, targets, 8); // center 540
    expect(r.dx).toBe(0);
    expect(r.snappedX).toBe(true);
    const r2 = snapRect({ x: 437, y: 575, width: 200, height: 200 }, targets, 8); // cx 537, cy 675
    expect(r2.dx).toBe(3);
    expect(r2.dy).toBe(0);
    expect(r2.guides.filter((g) => g.orientation === 'h').map((g) => g.pos)).toEqual([675]);
  });

  it('does not snap outside the threshold', () => {
    const r = snapRect({ x: 1000, y: 100, width: 50, height: 50 }, targets, 8);
    expect(r.snappedX).toBe(false);
    expect(r.dx).toBe(0);
    expect(r.guides).toEqual([]);
  });

  it('picks the closest of several candidates', () => {
    const t = { x: [{ pos: 100, from: 0, to: 10 }, { pos: 104, from: 0, to: 10 }], y: [] };
    expect(snapRect({ x: 101, y: 0, width: 10, height: 10 }, t, 5).dx).toBe(-1);
    expect(snapRect({ x: 103, y: 0, width: 10, height: 10 }, t, 5).dx).toBe(1);
  });

  it('snaps to other layers and spans the guide across both rects', () => {
    const other = { x: 500, y: 600, width: 300, height: 100 };
    const t = collectSnapTargets(canvas, [other]);
    const r = snapRect({ x: 497, y: 100, width: 100, height: 100 }, t, 8);
    expect(r.dx).toBe(3);
    const g = r.guides.find((g) => g.orientation === 'v' && g.pos === 500)!;
    expect(g.from).toBe(100);
    expect(g.to).toBe(700);
  });

  it('snaps both axes independently', () => {
    const r = snapRect({ x: 3, y: 1348 - 100, width: 100, height: 100 }, targets, 8);
    expect(r).toMatchObject({ snappedX: true, snappedY: true, dx: -3, dy: 2 });
  });

  it('zero threshold only matches exact alignment', () => {
    expect(snapRect({ x: 1, y: 0, width: 5, height: 5 }, targets, 0).snappedX).toBe(false);
    expect(snapRect({ x: 0, y: 0, width: 5, height: 5 }, targets, 0).snappedX).toBe(true);
  });

  it('snaps right edge to the canvas end', () => {
    const r = snapRect({ x: 3200, y: 10, width: 36, height: 10 }, targets, 6);
    expect(r.dx).toBe(4);
  });
});

describe('snapResizeBox', () => {
  const targets = slideTargets(canvas); // x lines every 540, y lines 0/675/1350

  it('snaps only the moving edge of a side anchor', () => {
    const r = snapResizeBox({ x: 100, y: 100, width: 975, height: 300 }, 'middle-right', targets, 8, false);
    expect(r.rect).toEqual({ x: 100, y: 100, width: 980, height: 300 }); // right edge 1075 -> 1080
    expect(r.guides).toContainEqual(expect.objectContaining({ orientation: 'v', pos: 1080 }));
  });

  it('moves x and shrinks width when the left edge snaps', () => {
    const r = snapResizeBox({ x: 545, y: 100, width: 300, height: 300 }, 'middle-left', targets, 8, false);
    expect(r.rect).toEqual({ x: 540, y: 100, width: 305, height: 300 });
  });

  it('ignores edges the anchor does not move', () => {
    // left edge is at 541 (near 540) but the bottom anchor only moves the bottom edge
    const r = snapResizeBox({ x: 541, y: 100, width: 300, height: 572 }, 'bottom-center', targets, 8, false);
    expect(r.rect).toEqual({ x: 541, y: 100, width: 300, height: 575 }); // bottom 672 -> 675
  });

  it('keeps the aspect ratio on corner anchors, anchored at the opposite corner', () => {
    // bottom-right corner at (1076, 410): x within 4 of 1080, y not near any line
    const r = snapResizeBox({ x: 76, y: 10, width: 1000, height: 400 }, 'bottom-right', targets, 8, true);
    expect(r.rect.x).toBe(76);
    expect(r.rect.y).toBe(10);
    expect(r.rect.width).toBeCloseTo(1004);
    expect(r.rect.height).toBeCloseTo(401.6);
  });

  it('keepRatio top-left keeps the bottom-right corner fixed', () => {
    const r = snapResizeBox({ x: 543, y: 300, width: 400, height: 200 }, 'top-left', targets, 8, true);
    expect(r.rect.x).toBe(540);
    expect(r.rect.x + r.rect.width).toBeCloseTo(943);
    expect(r.rect.y + r.rect.height).toBeCloseTo(500);
    expect(r.rect.width / r.rect.height).toBeCloseTo(2);
  });

  it('returns the box unchanged when nothing is in range', () => {
    const box = { x: 100, y: 100, width: 300, height: 300 };
    expect(snapResizeBox(box, 'bottom-right', targets, 8, false)).toEqual({ rect: box, guides: [] });
  });
});

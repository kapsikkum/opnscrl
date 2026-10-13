import { describe, expect, it } from 'vitest';
import {
  canvasSize,
  fitImage,
  gradientLine,
  layerBounds,
  layerCrossesSeam,
  slideHeightPx,
  slidesTouchedByLayer,
  slicePlan,
} from '../src/core/geometry';

const canvas = (over = {}) => ({ slideCount: 3, aspect: '4:5' as const, slideWidthPx: 1080, ...over });

describe('slide geometry', () => {
  it('derives slide height from aspect', () => {
    expect(slideHeightPx(canvas({ aspect: '4:5' }))).toBe(1350);
    expect(slideHeightPx(canvas({ aspect: '1:1' }))).toBe(1080);
    expect(slideHeightPx(canvas({ aspect: '9:16' }))).toBe(1920);
    expect(slideHeightPx(canvas({ aspect: '3:4' }))).toBe(1440);
  });

  it('computes the panorama size', () => {
    expect(canvasSize(canvas())).toEqual({ width: 3240, height: 1350 });
    expect(canvasSize(canvas({ slideCount: 20, aspect: '1:1' }))).toEqual({ width: 21600, height: 1080 });
  });
});

describe('slice math', () => {
  it('cuts the panorama into contiguous, gap-free slices', () => {
    const plan = slicePlan(canvas());
    expect(plan).toHaveLength(3);
    expect(plan.map((s) => s.source.x)).toEqual([0, 1080, 2160]);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i]!.source.x).toBe(plan[i - 1]!.source.x + plan[i - 1]!.source.width);
    }
    const last = plan[plan.length - 1]!;
    expect(last.source.x + last.source.width).toBe(canvasSize(canvas()).width);
    expect(plan.every((s) => s.source.height === 1350)).toBe(true);
  });

  it('applies the export scale to output sizes only', () => {
    const plan = slicePlan(canvas(), 2);
    expect(plan[0]).toMatchObject({ outWidth: 2160, outHeight: 2700 });
    expect(plan[0]!.source.width).toBe(1080);
    const half = slicePlan(canvas(), 0.5);
    expect(half[1]).toMatchObject({ outWidth: 540, outHeight: 675, source: { x: 1080 } });
  });

  it('never produces empty output sizes and rejects bad scales', () => {
    expect(slicePlan(canvas({ slideWidthPx: 100 }), 0.001)[0]!.outWidth).toBe(1);
    expect(() => slicePlan(canvas(), 0)).toThrow();
  });

  it('finds the slides a layer touches', () => {
    const l = { x: 1000, y: 0, width: 200, height: 100, rotation: 0 };
    expect(slidesTouchedByLayer(l, canvas())).toEqual([0, 1]);
    expect(layerCrossesSeam(l, canvas())).toBe(true);
    // ends before the seam: touches slide 0 only
    expect(slidesTouchedByLayer({ ...l, x: 880 }, canvas())).toEqual([0]);
    expect(layerCrossesSeam({ ...l, x: 100 }, canvas())).toBe(false);
  });

  it('accounts for rotation in layer bounds', () => {
    const b = layerBounds({ x: 100, y: 100, width: 200, height: 100, rotation: 90 });
    expect(b.x).toBeCloseTo(0);
    expect(b.y).toBeCloseTo(100);
    expect(b.width).toBeCloseTo(100);
    expect(b.height).toBeCloseTo(200);
  });
});

describe('gradientLine', () => {
  it('runs left to right at 90deg across the full width', () => {
    const { start, end } = gradientLine(90, 400, 200);
    expect(start.x).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(400);
    expect(start.y).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(100);
  });
  it('runs top to bottom at 180deg', () => {
    const { start, end } = gradientLine(180, 400, 200);
    expect(start.y).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(200);
  });
});

describe('fitImage', () => {
  it('cover crops the source centered to the box aspect', () => {
    const r = fitImage({ width: 2000, height: 1000 }, { width: 500, height: 500 }, 'cover');
    expect(r.crop).toEqual({ x: 500, y: 0, width: 1000, height: 1000 });
    expect(r.dest).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });
  it('contain letterboxes inside the box', () => {
    const r = fitImage({ width: 2000, height: 1000 }, { width: 500, height: 500 }, 'contain');
    expect(r.crop).toEqual({ x: 0, y: 0, width: 2000, height: 1000 });
    expect(r.dest).toEqual({ x: 0, y: 125, width: 500, height: 250 });
  });
  it('applies a normalized crop before fitting', () => {
    const r = fitImage({ width: 1000, height: 1000 }, { width: 100, height: 100 }, 'cover', {
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 1,
    });
    expect(r.crop).toEqual({ x: 500, y: 250, width: 500, height: 500 });
  });
});

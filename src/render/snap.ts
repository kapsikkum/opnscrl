/**
 * Pure snapping math for drag interactions (no Konva, no DOM).
 *
 * A moving rectangle has three anchors per axis (start, center, end). Each
 * anchor snaps to the nearest target line within `threshold`; targets are
 * slide edges/centers, the canvas edges, and other layers' edges/centers.
 * The result is the correction to apply plus the guide lines to display.
 */
import type { Rect } from '../core/geometry';
import { slideRects } from '../core/geometry';
import type { CanvasSettings } from '../core/types';

/** A snap line at `pos` on its axis, spanning [from, to] on the other axis. */
export interface SnapLine {
  pos: number;
  from: number;
  to: number;
}

export interface SnapTargets {
  /** Vertical lines (x positions). */
  x: SnapLine[];
  /** Horizontal lines (y positions). */
  y: SnapLine[];
}

export interface Guide {
  orientation: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
}

export interface SnapResult {
  /** Add to the moving rect's x/y to land on the snapped position. */
  dx: number;
  dy: number;
  guides: Guide[];
  snappedX: boolean;
  snappedY: boolean;
}

type CanvasGeometry = Pick<CanvasSettings, 'aspect' | 'slideWidthPx' | 'slideCount'> & { customHeightPx?: number };

/** Targets for the slides themselves: every slide edge and center (so also both canvas edges and the canvas center slide line). */
export function slideTargets(canvas: CanvasGeometry): SnapTargets {
  const slides = slideRects(canvas);
  const first = slides[0];
  if (!first) return { x: [], y: [] };
  const H = first.height;
  const W = canvas.slideCount * canvas.slideWidthPx;
  const x: SnapLine[] = [];
  const seen = new Set<number>();
  const addX = (pos: number) => {
    if (!seen.has(pos)) {
      seen.add(pos);
      x.push({ pos, from: 0, to: H });
    }
  };
  for (const s of slides) {
    addX(s.x);
    addX(s.x + s.width / 2);
    addX(s.x + s.width);
  }
  const y: SnapLine[] = [0, H / 2, H].map((pos) => ({ pos, from: 0, to: W }));
  return { x, y };
}

/** Targets contributed by other layers' (axis-aligned) bounding boxes. */
export function rectTargets(rects: readonly Rect[]): SnapTargets {
  const x: SnapLine[] = [];
  const y: SnapLine[] = [];
  for (const r of rects) {
    for (const pos of [r.x, r.x + r.width / 2, r.x + r.width]) x.push({ pos, from: r.y, to: r.y + r.height });
    for (const pos of [r.y, r.y + r.height / 2, r.y + r.height]) y.push({ pos, from: r.x, to: r.x + r.width });
  }
  return { x, y };
}

export function collectSnapTargets(canvas: CanvasGeometry, others: readonly Rect[]): SnapTargets {
  const s = slideTargets(canvas);
  const o = rectTargets(others);
  return { x: [...s.x, ...o.x], y: [...s.y, ...o.y] };
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const EPS = 0.01;

/** Best correction on one axis: smallest |target - anchor| within threshold, or null. */
function bestDelta(anchors: readonly number[], lines: readonly SnapLine[], threshold: number): number | null {
  let best: number | null = null;
  for (const a of anchors) {
    for (const t of lines) {
      const d = t.pos - a;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

/**
 * Snap `rect` (its current, unsnapped position) against `targets`.
 * `threshold` is in the same units as the rect (model px): divide a screen
 * tolerance by the zoom first.
 */
export function snapRect(rect: Rect, targets: SnapTargets, threshold: number): SnapResult {
  const xAnchors = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  const yAnchors = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
  const dxRaw = bestDelta(xAnchors, targets.x, threshold);
  const dyRaw = bestDelta(yAnchors, targets.y, threshold);
  const dx = dxRaw ?? 0;
  const dy = dyRaw ?? 0;
  const moved: Rect = { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };

  const guides: Guide[] = [];
  if (dxRaw !== null) {
    const anchors = [moved.x, moved.x + moved.width / 2, moved.x + moved.width];
    const byPos = new Map<number, Guide>();
    for (const t of targets.x) {
      if (!anchors.some((a) => Math.abs(a - t.pos) < EPS)) continue;
      const key = Math.round(t.pos * 100);
      const g = byPos.get(key) ?? { orientation: 'v' as const, pos: t.pos, from: moved.y, to: moved.y + moved.height };
      g.from = Math.min(g.from, t.from);
      g.to = Math.max(g.to, t.to);
      byPos.set(key, g);
    }
    guides.push(...byPos.values());
  }
  if (dyRaw !== null) {
    const anchors = [moved.y, moved.y + moved.height / 2, moved.y + moved.height];
    const byPos = new Map<number, Guide>();
    for (const t of targets.y) {
      if (!anchors.some((a) => Math.abs(a - t.pos) < EPS)) continue;
      const key = Math.round(t.pos * 100);
      const g = byPos.get(key) ?? { orientation: 'h' as const, pos: t.pos, from: moved.x, to: moved.x + moved.width };
      g.from = Math.min(g.from, t.from);
      g.to = Math.max(g.to, t.to);
      byPos.set(key, g);
    }
    guides.push(...byPos.values());
  }
  return { dx, dy, guides, snappedX: dxRaw !== null, snappedY: dyRaw !== null };
}

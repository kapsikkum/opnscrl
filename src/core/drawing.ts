/**
 * Freehand drawing math (pure). Strokes are stored with points normalized to
 * the drawing layer's box so resizing the layer scales the drawing; these
 * helpers convert between canvas px and that normalized space, simplify raw
 * pointer samples, and hit-test strokes for the eraser.
 */
import type { DrawingLayer, Stroke } from './types';

export interface Pt {
  x: number;
  y: number;
}

type Box = Pick<DrawingLayer, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

/** Canvas px -> layer-local px (undo the rotation about the top-left corner). */
export function toLocal(box: Box, p: Pt): Pt {
  const a = (-box.rotation * Math.PI) / 180;
  const dx = p.x - box.x;
  const dy = p.y - box.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Flat canvas-px points -> flat points normalized to the layer box. */
export function normalizePoints(box: Box, flat: readonly number[]): number[] {
  const out: number[] = [];
  const w = box.width || 1;
  const h = box.height || 1;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const l = toLocal(box, { x: flat[i]!, y: flat[i + 1]! });
    out.push(round4(l.x / w), round4(l.y / h));
  }
  return out;
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Drop samples closer than `minDist` to the previous kept one (pointer events
 * arrive much faster than the eye needs); always keeps the last point.
 */
export function simplifyPoints(flat: readonly number[], minDist: number): number[] {
  if (flat.length <= 4) return [...flat];
  const out = [flat[0]!, flat[1]!];
  for (let i = 2; i + 1 < flat.length; i += 2) {
    const px = out[out.length - 2]!;
    const py = out[out.length - 1]!;
    if (Math.hypot(flat[i]! - px, flat[i + 1]! - py) >= minDist) out.push(flat[i]!, flat[i + 1]!);
  }
  const lx = flat[flat.length - 2]!;
  const ly = flat[flat.length - 1]!;
  if (out[out.length - 2] !== lx || out[out.length - 1] !== ly) out.push(lx, ly);
  return out;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Does an eraser circle at canvas point `p` with `radius` touch a stroke of `layer`? */
export function strokeHit(layer: Box, stroke: Stroke, p: Pt, radius: number): boolean {
  const l = toLocal(layer, p);
  const w = layer.width;
  const h = layer.height;
  const reach = radius + stroke.width / 2;
  const pts = stroke.points;
  if (pts.length < 2) return false;
  if (pts.length < 4) return Math.hypot(pts[0]! * w - l.x, pts[1]! * h - l.y) <= reach;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const a = { x: pts[i]! * w, y: pts[i + 1]! * h };
    const b = { x: pts[i + 2]! * w, y: pts[i + 3]! * h };
    if (distToSegment(l, a, b) <= reach) return true;
  }
  return false;
}

/** Indices of strokes in `layer` touched anywhere along an eraser path (flat canvas px). */
export function strokesHitByPath(layer: DrawingLayer, path: readonly number[], radius: number): number[] {
  const hit: number[] = [];
  layer.props.strokes.forEach((s, i) => {
    for (let k = 0; k + 1 < path.length; k += 2) {
      if (strokeHit(layer, s, { x: path[k]!, y: path[k + 1]! }, radius)) {
        hit.push(i);
        return;
      }
    }
  });
  return hit;
}

/**
 * Drawing actions. The renderer reports finished pen strokes and eraser paths
 * in canvas px; these turn them into undoable ops (one per stroke).
 */
import { normalizePoints, simplifyPoints, strokesHitByPath } from '../core/drawing';
import { canvasSize } from '../core/geometry';
import type { DrawingLayer } from '../core/types';
import { createLayer } from '../layers';
import type { Editor } from '../state/editor';

export interface PenSettings {
  color: string;
  width: number;
  opacity: number;
}

/**
 * The drawing layer new strokes go into: the selected drawing if there is
 * one, otherwise the top-most unlocked drawing, otherwise none (a new one is
 * created on the first stroke).
 */
export function targetDrawing(editor: Editor): DrawingLayer | null {
  const p = editor.project.peek();
  const sel = editor.selection.peek();
  const selected = p.layers.find((l) => sel.includes(l.id) && l.type === 'drawing' && !l.locked);
  if (selected) return selected as DrawingLayer;
  for (let i = p.layers.length - 1; i >= 0; i--) {
    const l = p.layers[i]!;
    if (l.type === 'drawing' && !l.locked && !l.hidden) return l;
  }
  return null;
}

/** Append one stroke (flat canvas-px points) as a single undoable step. */
export function addStroke(editor: Editor, points: readonly number[], pen: PenSettings): string | null {
  const simplified = simplifyPoints(points, Math.max(1, pen.width * 0.15));
  if (simplified.length < 2) return null;
  const existing = targetDrawing(editor);
  if (existing) {
    const stroke = { points: normalizePoints(existing, simplified), color: pen.color, width: pen.width, opacity: pen.opacity };
    editor.dispatch({ op: 'updateLayer', id: existing.id, patch: { props: { strokes: [...existing.props.strokes, stroke] } } });
    editor.history.breakCoalescing();
    return existing.id;
  }
  // first stroke: a drawing layer covering the whole canvas
  const { width, height } = canvasSize(editor.project.peek().canvas);
  const box = { x: 0, y: 0, width, height, rotation: 0 };
  const layer = createLayer('drawing', {
    ...box,
    props: { strokes: [{ points: normalizePoints(box, simplified), color: pen.color, width: pen.width, opacity: pen.opacity }] },
  });
  editor.dispatch({ op: 'addLayer', layer });
  editor.history.breakCoalescing();
  return layer.id;
}

/** Remove every stroke the eraser path touches, across all unlocked drawings, as one step. */
export function eraseAlong(editor: Editor, path: readonly number[], radius: number): number {
  const p = editor.project.peek();
  const ops = [];
  let removed = 0;
  for (const l of p.layers) {
    if (l.type !== 'drawing' || l.locked || l.hidden) continue;
    const hit = new Set(strokesHitByPath(l, path, radius));
    if (!hit.size) continue;
    removed += hit.size;
    ops.push({ op: 'updateLayer' as const, id: l.id, patch: { props: { strokes: l.props.strokes.filter((_, i) => !hit.has(i)) } } });
  }
  if (ops.length) {
    editor.dispatch(ops.length === 1 ? ops[0]! : { op: 'batch', ops });
    editor.history.breakCoalescing();
  }
  return removed;
}

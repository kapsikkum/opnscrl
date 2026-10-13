import Konva from 'konva';
import { drawingPropsSchema } from '../../core/schema';
import type { DrawingLayer } from '../../core/types';
import { applyBase, createLayerGroup, HIT_NAME } from '../shared/base';
import type { LayerDefinition } from '../types';

const STROKE_NAME = 'opnscrl-stroke';

function apply(group: Konva.Group, layer: DrawingLayer): void {
  applyBase(group, layer);
  // A drawing usually covers a whole slide or more: only the strokes are
  // clickable, so the empty area never blocks layers underneath.
  group.findOne<Konva.Rect>(`.${HIT_NAME}`)?.listening(false);
  const strokes = layer.props.strokes;
  const lines = group.find<Konva.Line>(`.${STROKE_NAME}`);
  for (let i = strokes.length; i < lines.length; i++) lines[i]!.destroy();
  strokes.forEach((s, i) => {
    let line = lines[i];
    if (!line) {
      line = new Konva.Line({ name: STROKE_NAME, lineCap: 'round', lineJoin: 'round', tension: 0.4 });
      group.add(line);
    }
    const pts = s.points.map((v, k) => (k % 2 === 0 ? v * layer.width : v * layer.height));
    line.setAttrs({
      points: pts.length === 2 ? [pts[0]!, pts[1]!, pts[0]! + 0.01, pts[1]!] : pts,
      stroke: s.color,
      strokeWidth: s.width,
      opacity: s.opacity,
      hitStrokeWidth: Math.max(s.width, 24),
    });
  });
  group.getLayer()?.batchDraw();
}

/** Freehand strokes, normalized to the layer box (resizing scales the drawing). */
export const drawingLayer: LayerDefinition<'drawing'> = {
  type: 'drawing',
  label: 'Drawing',
  icon: 'pen',
  schema: drawingPropsSchema,
  defaults: () => ({ strokes: [] }),
  render(layer) {
    const group = createLayerGroup(layer);
    apply(group, layer);
    return group;
  },
  update(node, layer) {
    apply(node, layer);
  },
};

import Konva from 'konva';
import { resolveCornerRadii } from '../../core/geometry';
import { shapePropsSchema } from '../../core/schema';
import type { ShapeLayer } from '../../core/types';
import { applyBase, createLayerGroup } from '../shared/base';
import { applyFill } from '../shared/fill';
import { radiusField } from '../shared/inspector';
import type { LayerDefinition } from '../types';

const SHAPE_NAME = 'opnscrl-shape';

function createShape(kind: ShapeLayer['props']['kind']): Konva.Shape {
  switch (kind) {
    case 'rect':
      return new Konva.Rect({ name: SHAPE_NAME, listening: false });
    case 'ellipse':
      return new Konva.Ellipse({ name: SHAPE_NAME, listening: false, radiusX: 1, radiusY: 1 });
    case 'line':
      return new Konva.Line({ name: SHAPE_NAME, listening: false, points: [0, 0, 1, 0], lineCap: 'round' });
  }
}

function apply(group: Konva.Group, layer: ShapeLayer): void {
  applyBase(group, layer);
  const p = layer.props;
  let node = group.findOne<Konva.Shape>(`.${SHAPE_NAME}`);
  if (node && node.getAttr('kind') !== p.kind) {
    node.destroy();
    node = undefined;
  }
  if (!node) {
    node = createShape(p.kind);
    node.setAttr('kind', p.kind);
    group.add(node);
  }
  const { width: w, height: h } = layer;
  if (p.kind === 'rect') {
    node.setAttrs({ width: w, height: h, cornerRadius: resolveCornerRadii(p.cornerRadius, w, h) });
  } else if (p.kind === 'ellipse') {
    node.setAttrs({ x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2 });
  } else {
    node.setAttrs({ points: [0, h / 2, w, h / 2] });
  }
  if (p.kind === 'line') {
    node.setAttrs({ stroke: p.stroke, strokeWidth: p.strokeWidth, fillEnabled: false });
  } else {
    applyFill(node, p.fill, w, h);
    node.setAttrs({ stroke: p.stroke, strokeWidth: p.strokeWidth, strokeEnabled: p.strokeWidth > 0 });
  }
}

export const shapeLayer: LayerDefinition<'shape'> = {
  type: 'shape',
  label: 'Shape',
  icon: 'square',
  schema: shapePropsSchema,
  defaults: () => ({
    kind: 'rect',
    fill: { kind: 'solid', color: '#ff5a36' },
    stroke: '#111111',
    strokeWidth: 0,
    cornerRadius: 0,
  }),
  base: { width: 500, height: 500 },
  inspector: [
    {
      key: 'kind',
      label: 'Shape',
      kind: 'select',
      options: [
        { value: 'rect', label: 'Rectangle' },
        { value: 'ellipse', label: 'Ellipse' },
      ],
    },
    { key: 'fill', label: 'Fill', kind: 'fill' },
    { key: 'stroke', label: 'Stroke color', kind: 'color' },
    { key: 'strokeWidth', label: 'Stroke width', kind: 'slider', min: 0, max: 80, step: 1, unit: 'px' },
    { ...radiusField, showWhen: { key: 'kind', value: 'rect' } },
  ],
  render(layer) {
    const group = createLayerGroup(layer);
    apply(group, layer);
    return group;
  },
  update(node, layer) {
    apply(node, layer);
  },
};

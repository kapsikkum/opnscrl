import Konva from 'konva';
import { textPropsSchema } from '../../core/schema';
import type { TextLayer } from '../../core/types';
import { applyBase, createLayerGroup } from '../shared/base';
import type { LayerDefinition } from '../types';

const TEXT_NAME = 'opnscrl-text';

function apply(group: Konva.Group, layer: TextLayer): void {
  let node = group.findOne<Konva.Text>(`.${TEXT_NAME}`);
  if (!node) {
    node = new Konva.Text({ name: TEXT_NAME, listening: false, wrap: 'word', fillAfterStrokeEnabled: true, lineJoin: 'round' });
    group.add(node);
  }
  const p = layer.props;
  node.setAttrs({
    text: p.text,
    fontFamily: p.fontFamily,
    fontSize: p.fontSize,
    fontStyle: String(p.fontWeight),
    fill: p.color,
    align: p.align,
    lineHeight: p.lineHeight,
    letterSpacing: p.letterSpacing,
    width: layer.width,
    stroke: p.stroke ? p.stroke.color : 'black',
    strokeWidth: p.stroke ? p.stroke.width : 0,
    strokeEnabled: !!p.stroke,
    shadowEnabled: !!p.shadow,
    shadowColor: p.shadow?.color ?? 'black',
    shadowBlur: p.shadow?.blur ?? 0,
    shadowOffsetX: p.shadow?.offsetX ?? 0,
    shadowOffsetY: p.shadow?.offsetY ?? 0,
    shadowOpacity: p.shadow?.opacity ?? 1,
  });
  // A box narrower than a single glyph makes word wrap drop every line;
  // never let text vanish: fall back to no wrapping in that case.
  node.wrap('word');
  if (p.text.trim() && node.textArr.length === 0) node.wrap('none');
  // Selection bounds follow the measured text height, not the stored one.
  applyBase(group, layer, node.height());
}

/**
 * Text. Width is the wrap width; height is measured from the content (the
 * renderer reports the measured height back in transform-end patches).
 */
export const textLayer: LayerDefinition<'text'> = {
  type: 'text',
  label: 'Text',
  icon: 'type',
  schema: textPropsSchema,
  defaults: () => ({
    text: 'Your text',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 96,
    fontWeight: 700,
    color: '#111111',
    align: 'left',
    lineHeight: 1.1,
    letterSpacing: 0,
    stroke: null,
    shadow: null,
  }),
  base: { width: 800, height: 110 },
  inspector: [
    { key: 'text', label: 'Text', kind: 'textarea' },
    { key: 'fontFamily', label: 'Font', kind: 'font' },
    { key: 'fontSize', label: 'Size', kind: 'slider', min: 12, max: 600, step: 1, unit: 'px' },
    {
      key: 'fontWeight',
      label: 'Weight',
      kind: 'select',
      options: [
        { value: 300, label: 'Light' },
        { value: 400, label: 'Regular' },
        { value: 500, label: 'Medium' },
        { value: 600, label: 'Semibold' },
        { value: 700, label: 'Bold' },
        { value: 800, label: 'Extra bold' },
        { value: 900, label: 'Black' },
      ],
    },
    { key: 'color', label: 'Color', kind: 'color' },
    {
      key: 'align',
      label: 'Align',
      kind: 'select',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' },
      ],
    },
    { key: 'lineHeight', label: 'Line height', kind: 'slider', min: 0.6, max: 2.5, step: 0.05 },
    { key: 'letterSpacing', label: 'Letter spacing', kind: 'slider', min: -10, max: 60, step: 0.5, unit: 'px' },
    {
      key: 'stroke',
      label: 'Outline',
      kind: 'group',
      initial: { color: '#000000', width: 6 },
      fields: [
        { key: 'width', label: 'Width', kind: 'slider', min: 1, max: 40, step: 1, unit: 'px' },
        { key: 'color', label: 'Color', kind: 'color' },
      ],
    },
    {
      key: 'shadow',
      label: 'Shadow',
      kind: 'group',
      initial: { color: '#000000', blur: 12, offsetX: 0, offsetY: 6, opacity: 0.4 },
      fields: [
        { key: 'color', label: 'Color', kind: 'color' },
        { key: 'blur', label: 'Blur', kind: 'slider', min: 0, max: 100, step: 1, unit: 'px' },
        { key: 'offsetX', label: 'Offset X', kind: 'slider', min: -100, max: 100, step: 1, unit: 'px' },
        { key: 'offsetY', label: 'Offset Y', kind: 'slider', min: -100, max: 100, step: 1, unit: 'px' },
        { key: 'opacity', label: 'Opacity', kind: 'slider', min: 0, max: 1, step: 0.01 },
      ],
    },
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

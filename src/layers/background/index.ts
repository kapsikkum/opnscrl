import Konva from 'konva';
import { backgroundPropsSchema } from '../../core/schema';
import type { BackgroundLayer } from '../../core/types';
import { applyBase, createLayerGroup } from '../shared/base';
import { applyFill } from '../shared/fill';
import type { LayerDefinition } from '../types';

function apply(group: Konva.Group, layer: BackgroundLayer): void {
  applyBase(group, layer);
  let rect = group.findOne<Konva.Rect>('.fill');
  if (!rect) {
    rect = new Konva.Rect({ name: 'fill', listening: false });
    group.add(rect);
  }
  rect.setAttrs({ width: layer.width, height: layer.height });
  applyFill(rect, layer.props.fill, layer.width, layer.height);
}

/** A solid or linear-gradient fill covering its box (normally the whole panorama). */
export const backgroundLayer: LayerDefinition<'background'> = {
  type: 'background',
  label: 'Background',
  icon: 'paint',
  schema: backgroundPropsSchema,
  defaults: () => ({ fill: { kind: 'solid', color: '#f4f1ea' } }),
  base: { locked: true },
  inspector: [{ key: 'fill', label: 'Fill', kind: 'fill' }],
  render(layer) {
    const group = createLayerGroup(layer);
    apply(group, layer);
    return group;
  },
  update(node, layer) {
    apply(node, layer);
  },
};

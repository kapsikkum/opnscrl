import { imagePropsSchema } from '../../core/schema';
import type { ImageLayer } from '../../core/types';
import { applyBase, createLayerGroup } from '../shared/base';
import { borderField, fitField, radiusField, shadowField } from '../shared/inspector';
import { updateSlot } from '../shared/imageSlot';
import type { LayerDefinition, LayerRenderContext } from '../types';
import type Konva from 'konva';

function apply(group: Konva.Group, layer: ImageLayer, ctx: LayerRenderContext): void {
  applyBase(group, layer);
  const p = layer.props;
  updateSlot(
    group,
    {
      assetId: p.assetId || null,
      fit: p.fit,
      crop: p.crop,
      flipX: p.flipX,
      flipY: p.flipY,
      cornerRadius: p.cornerRadius,
      border: p.border,
      shadow: p.shadow,
      width: layer.width,
      height: layer.height,
      placeholderLabel: '',
      showPlaceholder: ctx.mode === 'edit',
    },
    ctx,
  );
}

export const imageLayer: LayerDefinition<'image'> = {
  type: 'image',
  label: 'Image',
  icon: 'image',
  schema: imagePropsSchema,
  defaults: () => ({
    assetId: '',
    fit: 'cover',
    crop: null,
    cornerRadius: 0,
    flipX: false,
    flipY: false,
    border: null,
    shadow: null,
  }),
  base: { width: 1080, height: 1080 },
  inspector: [
    fitField,
    radiusField,
    { key: 'flipX', label: 'Flip horizontal', kind: 'toggle' },
    { key: 'flipY', label: 'Flip vertical', kind: 'toggle' },
    borderField,
    shadowField,
  ],
  render(layer, ctx) {
    const group = createLayerGroup(layer);
    apply(group, layer, ctx);
    return group;
  },
  update(node, layer, ctx) {
    apply(node, layer, ctx);
  },
};

import type Konva from 'konva';
import { framePropsSchema } from '../../core/schema';
import type { FrameLayer } from '../../core/types';
import { applyBase, createLayerGroup } from '../shared/base';
import { borderField, fitField, radiusField, shadowField } from '../shared/inspector';
import { updateSlot } from '../shared/imageSlot';
import type { LayerDefinition, LayerRenderContext } from '../types';

function apply(group: Konva.Group, layer: FrameLayer, ctx: LayerRenderContext): void {
  applyBase(group, layer);
  const p = layer.props;
  updateSlot(
    group,
    {
      assetId: p.assetId,
      fit: p.fit,
      crop: null,
      flipX: false,
      flipY: false,
      cornerRadius: p.cornerRadius,
      border: p.border,
      shadow: p.shadow,
      width: layer.width,
      height: layer.height,
      placeholderLabel: p.placeholderLabel,
      showPlaceholder: ctx.mode === 'edit',
    },
    ctx,
  );
}

/** A rect / rounded slot that holds an image, or shows a placeholder (editor only) when empty. */
export const frameLayer: LayerDefinition<'frame'> = {
  type: 'frame',
  label: 'Frame',
  icon: 'frame',
  schema: framePropsSchema,
  defaults: () => ({
    cornerRadius: 24,
    assetId: null,
    fit: 'cover',
    placeholderLabel: 'Drop photo',
    border: null,
    shadow: null,
  }),
  base: { width: 700, height: 900 },
  inspector: [fitField, radiusField, { key: 'placeholderLabel', label: 'Placeholder text', kind: 'text' }, borderField, shadowField],
  render(layer, ctx) {
    const group = createLayerGroup(layer);
    apply(group, layer, ctx);
    return group;
  },
  update(node, layer, ctx) {
    apply(node, layer, ctx);
  },
};

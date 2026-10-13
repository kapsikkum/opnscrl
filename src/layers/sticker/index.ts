import Konva from 'konva';
import { fitImage } from '../../core/geometry';
import { stickerPropsSchema } from '../../core/schema';
import type { StickerLayer } from '../../core/types';
import { applyBase, createLayerGroup } from '../shared/base';
import { sourceSize } from '../shared/imageSlot';
import type { ImageSource, LayerDefinition, LayerRenderContext } from '../types';
import { getBuiltinSticker, stickerDataUrl } from './builtin';

const IMAGE_NAME = 'opnscrl-sticker';

/** Decoded built-in sticker images, per id + color. */
const builtinCache = new Map<string, Promise<HTMLImageElement>>();

function loadBuiltin(id: string, color: string | null): Promise<HTMLImageElement> {
  const s = getBuiltinSticker(id);
  if (!s) return Promise.reject(new Error(`Unknown sticker "${id}"`));
  const key = `${id}|${color ?? ''}`;
  let p = builtinCache.get(key);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not draw sticker "${id}"`));
      img.src = stickerDataUrl(s, color ?? undefined, 1024);
    });
    builtinCache.set(key, p);
  }
  return p;
}

interface StickerState {
  key: string;
  source?: ImageSource;
}
const states = new WeakMap<Konva.Group, StickerState>();

function layout(group: Konva.Group, layer: StickerLayer): void {
  const img = group.findOne<Konva.Image>(`.${IMAGE_NAME}`)!;
  const src = states.get(group)?.source;
  if (!src) {
    img.visible(false);
    return;
  }
  const { dest } = fitImage(sourceSize(src), { width: layer.width, height: layer.height }, 'contain', null);
  const p = layer.props;
  img.setAttrs({
    visible: true,
    image: src,
    x: p.flipX ? dest.x + dest.width : dest.x,
    y: p.flipY ? dest.y + dest.height : dest.y,
    width: dest.width,
    height: dest.height,
    scaleX: p.flipX ? -1 : 1,
    scaleY: p.flipY ? -1 : 1,
    crop: undefined,
  });
  group.getLayer()?.batchDraw();
}

function apply(group: Konva.Group, layer: StickerLayer, ctx: LayerRenderContext): void {
  applyBase(group, layer);
  if (!group.findOne(`.${IMAGE_NAME}`)) group.add(new Konva.Image({ name: IMAGE_NAME, image: undefined, listening: false }));
  const p = layer.props;
  const key = p.builtinId ? `b:${p.builtinId}|${p.tint ?? ''}` : p.assetId ? `a:${p.assetId}` : '';
  let st = states.get(group);
  if (!st) {
    st = { key: '' };
    states.set(group, st);
  }
  if (st.key !== key) {
    st.key = key;
    st.source = undefined;
    if (key) {
      const s = st;
      const work = (p.builtinId ? loadBuiltin(p.builtinId, p.tint) : ctx.resolveAsset(p.assetId!)).then((src) => {
        if (s.key !== key) return;
        s.source = src;
        layout(group, layer);
      });
      ctx.track(work);
      work.catch(() => {});
    }
  }
  layout(group, layer);
}

/** A built-in vector sticker or an uploaded PNG/SVG, fitted (contain) inside its box. */
export const stickerLayer: LayerDefinition<'sticker'> = {
  type: 'sticker',
  label: 'Sticker',
  icon: 'sticker',
  schema: stickerPropsSchema,
  defaults: () => ({ builtinId: 'star', assetId: null, tint: null, flipX: false, flipY: false }),
  base: { width: 360, height: 360 },
  inspector: [
    { key: 'tint', label: 'Color', kind: 'color' },
    { key: 'flipX', label: 'Flip horizontal', kind: 'toggle' },
    { key: 'flipY', label: 'Flip vertical', kind: 'toggle' },
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

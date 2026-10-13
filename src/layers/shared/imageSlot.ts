/**
 * Shared "image inside a box" behaviour used by the image and frame layers:
 * async asset loading (race-safe), cover/contain fitting with optional crop,
 * flipping, per-corner rounded clip, border, drop shadow and an edit-mode
 * placeholder.
 *
 * Node structure (children of the layer group, back to front):
 *   hit rect (from createLayerGroup) | shadow | clip group { placeholder, image } | border
 * The shadow is a sibling of the clip group (a clipped group would cut it off).
 */
import Konva from 'konva';
import { fitImage, resolveCornerRadii, type Rect } from '../../core/geometry';
import type { Border, BoxShadow, CornerRadius, Crop } from '../../core/types';
import type { ImageSource, LayerRenderContext } from '../types';
import { pathRoundedRect, setRoundedClip } from './base';

export interface SlotParams {
  assetId: string | null;
  fit: 'cover' | 'contain';
  crop: Crop | null;
  flipX: boolean;
  flipY: boolean;
  cornerRadius: CornerRadius;
  border: Border | null;
  shadow: BoxShadow | null;
  width: number;
  height: number;
  placeholderLabel: string;
  showPlaceholder: boolean;
}

interface SlotState {
  assetId: string | null;
  source?: ImageSource;
  params: SlotParams;
}

const IMAGE_NAME = 'opnscrl-image';
const PLACEHOLDER_NAME = 'opnscrl-placeholder';
const CLIP_NAME = 'opnscrl-clip';
const SHADOW_NAME = 'opnscrl-shadow';
const BORDER_NAME = 'opnscrl-border';
const states = new WeakMap<Konva.Group, SlotState>();

export function sourceSize(src: ImageSource): { width: number; height: number } {
  if ('naturalWidth' in src) return { width: src.naturalWidth || src.width, height: src.naturalHeight || src.height };
  return { width: src.width, height: src.height };
}

/** Far off-canvas device-pixel offset used to draw only the shadow of an opaque shape. */
const SHADOW_OFFSET_TRICK = 60000;

interface ShadowSpec {
  shadow: BoxShadow;
  rect: Rect;
  radii: [number, number, number, number];
}

/**
 * Draws just the shadow of a rounded rect (no fill), so transparent PNGs do not
 * show a dark box. The rect is drawn far outside the canvas and its shadow is
 * offset back by the same amount; shadow offset/blur are in device pixels, so
 * they are multiplied by the current transform's scale to follow zoom/export.
 */
function drawShadow(ctx: Konva.Context, shape: Konva.Shape): void {
  const spec = shape.getAttr('shadowSpec') as ShadowSpec | undefined;
  if (!spec) return;
  const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
  const m = c.getTransform();
  const k = Math.hypot(m.a, m.b);
  const { shadow, rect, radii } = spec;
  c.save();
  c.setTransform(m.a, m.b, m.c, m.d, m.e - SHADOW_OFFSET_TRICK, m.f);
  c.globalAlpha *= shadow.opacity;
  c.shadowColor = shadow.color;
  c.shadowBlur = shadow.blur * k;
  c.shadowOffsetX = SHADOW_OFFSET_TRICK + shadow.offsetX * k;
  c.shadowOffsetY = shadow.offsetY * k;
  c.fillStyle = '#000';
  pathRoundedRect(c, rect.x, rect.y, rect.width, rect.height, radii);
  c.fill();
  c.restore();
}

function ensureChildren(group: Konva.Group): {
  image: Konva.Image;
  placeholder: Konva.Group;
  clip: Konva.Group;
  shadow: Konva.Shape;
  border: Konva.Rect;
} {
  let shadow = group.findOne<Konva.Shape>(`.${SHADOW_NAME}`);
  if (!shadow) {
    shadow = new Konva.Shape({ name: SHADOW_NAME, listening: false, sceneFunc: drawShadow });
    group.add(shadow);
  }
  let clip = group.findOne<Konva.Group>(`.${CLIP_NAME}`);
  if (!clip) {
    clip = new Konva.Group({ name: CLIP_NAME, listening: false });
    group.add(clip);
  }
  let placeholder = clip.findOne<Konva.Group>(`.${PLACEHOLDER_NAME}`);
  if (!placeholder) {
    placeholder = new Konva.Group({ name: PLACEHOLDER_NAME, listening: false });
    placeholder.add(
      new Konva.Rect({ name: 'box', fill: '#e5e7eb', stroke: '#9ca3af', strokeWidth: 3, dash: [12, 10] }),
      new Konva.Text({ name: 'label', align: 'center', verticalAlign: 'middle', fill: '#6b7280', fontFamily: 'sans-serif' }),
    );
    clip.add(placeholder);
  }
  let image = clip.findOne<Konva.Image>(`.${IMAGE_NAME}`);
  if (!image) {
    image = new Konva.Image({ name: IMAGE_NAME, image: undefined, listening: false });
    clip.add(image);
  }
  let border = group.findOne<Konva.Rect>(`.${BORDER_NAME}`);
  if (!border) {
    border = new Konva.Rect({ name: BORDER_NAME, listening: false, fillEnabled: false });
    group.add(border);
  }
  // keep draw order: shadow < clip < border (the hit rect stays first)
  shadow.moveToBottom();
  group.findOne<Konva.Rect>('.opnscrl-hit')?.moveToBottom();
  border.moveToTop();
  return { image, placeholder, clip, shadow, border };
}

function layout(group: Konva.Group): void {
  const state = states.get(group);
  if (!state) return;
  const { params, source } = state;
  const { image, placeholder, clip, shadow, border } = ensureChildren(group);
  const w = params.width;
  const h = params.height;

  const fitted = source ? fitImage(sourceSize(source), { width: w, height: h }, params.fit, params.crop) : null;
  // The rect the picture visibly occupies: whole box, or the letterboxed area for 'contain'.
  const visible: Rect = fitted && params.fit === 'contain' ? fitted.dest : { x: 0, y: 0, width: w, height: h };
  const radii = resolveCornerRadii(params.cornerRadius, visible.width, visible.height);

  setRoundedClip(clip, visible, params.cornerRadius);

  placeholder.visible(!source && params.showPlaceholder);
  const box = placeholder.findOne<Konva.Rect>('.box');
  box?.setAttrs({ width: w, height: h, cornerRadius: resolveCornerRadii(params.cornerRadius, w, h) });
  const label = placeholder.findOne<Konva.Text>('.label');
  label?.setAttrs({
    width: w,
    height: h,
    text: params.placeholderLabel,
    fontSize: Math.max(14, Math.min(48, Math.min(w, h) / 10)),
  });

  if (!source || !fitted) {
    image.visible(false);
  } else {
    image.setAttrs({
      visible: true,
      image: source,
      x: params.flipX ? w - fitted.dest.x : fitted.dest.x,
      y: params.flipY ? h - fitted.dest.y : fitted.dest.y,
      scaleX: params.flipX ? -1 : 1,
      scaleY: params.flipY ? -1 : 1,
      width: fitted.dest.width,
      height: fitted.dest.height,
      crop: fitted.crop,
    });
  }

  // Shadow follows the visible picture; an empty slot (placeholder) casts none.
  const shadowParams = source ? params.shadow : null;
  const castsShadow = shadowParams !== null;
  shadow.setAttr('shadowSpec', castsShadow ? ({ shadow: shadowParams, rect: visible, radii } satisfies ShadowSpec) : undefined);
  shadow.visible(castsShadow);

  const bw = params.border?.width ?? 0;
  if (params.border && bw > 0) {
    const inset = Math.min(bw / 2, visible.width / 2, visible.height / 2);
    border.setAttrs({
      visible: true,
      x: visible.x + inset,
      y: visible.y + inset,
      width: Math.max(0, visible.width - 2 * inset),
      height: Math.max(0, visible.height - 2 * inset),
      stroke: params.border.color,
      strokeWidth: bw,
      cornerRadius: radii.map((r) => Math.max(0, r - inset)),
    });
  } else {
    border.visible(false);
  }
  group.getLayer()?.batchDraw();
}

export function updateSlot(group: Konva.Group, params: SlotParams, ctx: LayerRenderContext): void {
  ensureChildren(group);
  let state = states.get(group);
  if (!state) {
    state = { assetId: null, params };
    states.set(group, state);
  }
  state.params = params;

  if (params.assetId !== state.assetId) {
    const id = params.assetId;
    state.assetId = id;
    state.source = undefined;
    if (id) {
      const st = state;
      const work = ctx.resolveAsset(id).then((src) => {
        if (st.assetId !== id) return; // superseded while loading
        st.source = src;
        layout(group);
      });
      ctx.track(work);
      work.catch(() => {
        /* editor keeps showing the placeholder; the exporter sees the rejection via track() */
      });
    }
  }
  layout(group);
}

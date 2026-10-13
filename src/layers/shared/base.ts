import Konva from 'konva';
import { resolveCornerRadii, type Rect } from '../../core/geometry';
import type { CornerRadius, Layer } from '../../core/types';

export const HIT_NAME = 'opnscrl-hit';
export const LAYER_NAME = 'opnscrl-layer';

/** Create the root group for a layer, with a transparent hit/bounds rect as first child. */
export function createLayerGroup(layer: Layer): Konva.Group {
  const group = new Konva.Group({ id: layer.id, name: LAYER_NAME });
  group.add(
    new Konva.Rect({ name: HIT_NAME, fill: 'rgba(0,0,0,0)', width: layer.width, height: layer.height }),
  );
  applyBase(group, layer);
  return group;
}

/** Apply the transform/visibility fields common to every layer. */
export function applyBase(group: Konva.Group, layer: Layer, heightOverride?: number): void {
  const height = heightOverride ?? layer.height;
  group.setAttrs({
    id: layer.id,
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: !layer.hidden,
    scaleX: 1,
    scaleY: 1,
    width: layer.width,
    height,
  });
  const hit = group.findOne<Konva.Rect>(`.${HIT_NAME}`);
  hit?.setAttrs({ width: layer.width, height });
}

/** Minimal path API shared by CanvasRenderingContext2D and Konva's context wrapper. */
interface PathContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  closePath(): void;
}

/** Trace a rect with per-corner radii [tl, tr, br, bl] (already resolved/clamped). */
export function pathRoundedRect(
  ctx: PathContext,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: readonly [number, number, number, number],
): void {
  const [tl, tr, br, bl] = radii;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + w, y, x + w, y + h, tr);
  ctx.arcTo(x + w, y + h, x, y + h, br);
  ctx.arcTo(x, y + h, x, y, bl);
  ctx.arcTo(x, y, x + w, y, tl);
  ctx.closePath();
}

/** Rounded-rect clip for a group (uniform or per-corner radii); all-zero radii remove the clip. */
export function setRoundedClip(group: Konva.Group, rect: Rect, radius: CornerRadius): void {
  const radii = resolveCornerRadii(radius, rect.width, rect.height);
  group.clipFunc((ctx) => {
    // Always clip to the rect (even with square corners) so cover-fit crops stay inside the box.
    pathRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, radii);
  });
}

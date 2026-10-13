/** Pure geometry / slice math. No DOM. */
import type { Aspect, CanvasSettings, Crop, Layer } from './types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Width : height of each fixed aspect. 'custom' is driven by `customHeightPx` instead. */
const ASPECT_RATIOS: Record<Exclude<Aspect, 'custom'>, readonly [number, number]> = {
  '4:5': [4, 5],
  '1:1': [1, 1],
  '9:16': [9, 16],
  '3:4': [3, 4],
  '16:9': [16, 9],
  '2:3': [2, 3],
  '4:3': [4, 3],
  '1.91:1': [191, 100],
};

export const DEFAULT_CUSTOM_HEIGHT = 1350;

/** Subset of CanvasSettings needed for geometry. `customHeightPx` only matters for aspect 'custom'. */
export type CanvasGeom = Pick<CanvasSettings, 'aspect' | 'slideWidthPx'> & { customHeightPx?: number };
export type CanvasGeomFull = CanvasGeom & Pick<CanvasSettings, 'slideCount'>;

export function aspectParts(aspect: Aspect, customHeightPx = DEFAULT_CUSTOM_HEIGHT): readonly [number, number] {
  return aspect === 'custom' ? [1080, customHeightPx] : ASPECT_RATIOS[aspect];
}

export function slideHeightPx(canvas: CanvasGeom): number {
  if (canvas.aspect === 'custom') return Math.round(canvas.customHeightPx ?? DEFAULT_CUSTOM_HEIGHT);
  const [w, h] = ASPECT_RATIOS[canvas.aspect];
  return Math.round((canvas.slideWidthPx * h) / w);
}

/** Size of the whole panorama in export pixels. */
export function canvasSize(canvas: CanvasGeomFull): {
  width: number;
  height: number;
} {
  return { width: canvas.slideCount * canvas.slideWidthPx, height: slideHeightPx(canvas) };
}

export interface SlideRect extends Rect {
  index: number;
}

/** Slide rectangles in panorama coordinates. */
export function slideRects(canvas: CanvasGeomFull): SlideRect[] {
  const height = slideHeightPx(canvas);
  return Array.from({ length: canvas.slideCount }, (_, index) => ({
    index,
    x: index * canvas.slideWidthPx,
    y: 0,
    width: canvas.slideWidthPx,
    height,
  }));
}

export interface SlicePlan {
  index: number;
  /** Source rectangle in panorama (model) pixels. */
  source: Rect;
  /** Output bitmap size in pixels (source size * scale, rounded). */
  outWidth: number;
  outHeight: number;
}

/**
 * How the panorama is cut into output files. `scale` multiplies the export
 * resolution (1 = slideWidthPx per slide). Slice i covers
 * [i*slideWidthPx, (i+1)*slideWidthPx) so seams are pixel-exact and no column
 * is dropped or duplicated.
 */
export function slicePlan(
  canvas: CanvasGeomFull,
  scale = 1,
): SlicePlan[] {
  if (!(scale > 0)) throw new RangeError('scale must be > 0');
  return slideRects(canvas).map((r) => ({
    index: r.index,
    source: { x: r.x, y: r.y, width: r.width, height: r.height },
    outWidth: Math.max(1, Math.round(r.width * scale)),
    outHeight: Math.max(1, Math.round(r.height * scale)),
  }));
}

/** Rotated layer bounding box (axis aligned), rotation about the layer's top-left. */
export function layerBounds(l: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>): Rect {
  const rad = (l.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pts = [
    [0, 0],
    [l.width, 0],
    [l.width, l.height],
    [0, l.height],
  ].map(([px, py]) => [l.x + px! * cos - py! * sin, l.y + px! * sin + py! * cos] as const);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** Indices of slides whose area the layer's bounding box overlaps. */
export function slidesTouchedByLayer(
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  canvas: CanvasGeomFull,
): number[] {
  const b = layerBounds(layer);
  const out: number[] = [];
  for (const s of slideRects(canvas)) {
    if (b.x < s.x + s.width && b.x + b.width > s.x) out.push(s.index);
  }
  return out;
}

/** True if the layer's bounding box crosses at least one slide seam. */
export function layerCrossesSeam(
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  canvas: CanvasGeomFull,
): boolean {
  return slidesTouchedByLayer(layer, canvas).length > 1;
}

/**
 * Start/end points of a CSS-style linear gradient line for a box of the given
 * size. angle: 0 = to top, 90 = to right, 180 = to bottom. The line length
 * follows the CSS spec so corners receive the first/last stop colors exactly.
 */
export function gradientLine(
  angleDeg: number,
  width: number,
  height: number,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(width * dx) + Math.abs(height * dy);
  const cx = width / 2;
  const cy = height / 2;
  return {
    start: { x: cx - (dx * len) / 2, y: cy - (dy * len) / 2 },
    end: { x: cx + (dx * len) / 2, y: cy + (dy * len) / 2 },
  };
}

export interface ImageFit {
  /** Source crop rectangle in source pixels. */
  crop: Rect;
  /** Destination rectangle inside the layer box (box-local pixels). */
  dest: Rect;
}

/**
 * Compute how a source image (optionally pre-cropped with a normalized crop)
 * is placed in a box. `cover` fills the box by cropping the source centered;
 * `contain` draws the whole (cropped) source centered inside the box.
 */
export function fitImage(
  src: { width: number; height: number },
  box: { width: number; height: number },
  fit: 'cover' | 'contain',
  crop: Crop | null = null,
): ImageFit {
  const base: Rect = crop
    ? { x: crop.x * src.width, y: crop.y * src.height, width: crop.width * src.width, height: crop.height * src.height }
    : { x: 0, y: 0, width: src.width, height: src.height };
  if (base.width <= 0 || base.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { crop: base, dest: { x: 0, y: 0, width: box.width, height: box.height } };
  }
  const srcAspect = base.width / base.height;
  const boxAspect = box.width / box.height;
  if (fit === 'cover') {
    let cw = base.width;
    let ch = base.height;
    if (srcAspect > boxAspect) cw = base.height * boxAspect;
    else ch = base.width / boxAspect;
    return {
      crop: { x: base.x + (base.width - cw) / 2, y: base.y + (base.height - ch) / 2, width: cw, height: ch },
      dest: { x: 0, y: 0, width: box.width, height: box.height },
    };
  }
  let dw = box.width;
  let dh = box.height;
  if (srcAspect > boxAspect) dh = box.width / srcAspect;
  else dw = box.height * srcAspect;
  return { crop: base, dest: { x: (box.width - dw) / 2, y: (box.height - dh) / 2, width: dw, height: dh } };
}

/**
 * Resolve a corner radius (uniform or [tl, tr, br, bl]) for a w x h box.
 * Radii are clamped like CSS border-radius: if two neighbouring radii exceed
 * the side they share, all radii scale down together, so shapes never overlap.
 */
export function resolveCornerRadii(
  radius: number | readonly [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const r: [number, number, number, number] =
    typeof radius === 'number' ? [radius, radius, radius, radius] : [radius[0], radius[1], radius[2], radius[3]];
  for (let i = 0; i < 4; i++) r[i] = Math.max(0, r[i]!);
  const [tl, tr, br, bl] = r;
  const ratios = [
    tl + tr > 0 ? width / (tl + tr) : Infinity,
    bl + br > 0 ? width / (bl + br) : Infinity,
    tl + bl > 0 ? height / (tl + bl) : Infinity,
    tr + br > 0 ? height / (tr + br) : Infinity,
  ];
  const f = Math.min(1, ...ratios);
  return f < 1 ? [tl * f, tr * f, br * f, bl * f] : r;
}

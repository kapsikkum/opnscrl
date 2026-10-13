/**
 * Zod schemas are the single source of truth for the document model.
 * TypeScript types are inferred from them (see ./types.ts).
 *
 * Layer prop schemas live in core (not in layers/) so that serialization can
 * validate a whole document without importing from higher layers. Each layer
 * folder re-exports its schema through its LayerDefinition.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 3;

export const ASPECTS = ['4:5', '1:1', '9:16', '3:4', '16:9', '2:3', '4:3', '1.91:1', 'custom'] as const;
export const aspectSchema = z.enum(ASPECTS);

/** Slide height limits (px, at the fixed 1080 px slide width) for the 'custom' aspect. */
export const MIN_CUSTOM_HEIGHT = 565;
export const MAX_CUSTOM_HEIGHT = 1920;

export const MIN_SLIDES = 1;
export const MAX_SLIDES = 20;

const color = z.string().min(1);

// ---------- Fill ----------
export const gradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color,
});

export const fillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solid'), color }),
  z.object({
    kind: z.literal('linear-gradient'),
    /** CSS convention: 0 = to top, 90 = to right, 180 = to bottom. */
    angle: z.number(),
    stops: z.array(gradientStopSchema).min(2),
  }),
]);

// ---------- Layer props ----------
export const cropSchema = z.object({
  /** Normalized (0..1) rectangle inside the source image. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
});

export const fitSchema = z.enum(['cover', 'contain']);

/** Uniform radius, or per-corner [topLeft, topRight, bottomRight, bottomLeft]. */
export const cornerRadiusSchema = z.union([
  z.number().min(0),
  z.tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)]),
]);

export const borderSchema = z.object({ width: z.number().min(0), color });

export const boxShadowSchema = z.object({
  color,
  blur: z.number().min(0),
  offsetX: z.number(),
  offsetY: z.number(),
  opacity: z.number().min(0).max(1),
});

/**
 * Photo adjustments. Every value is neutral at 0. Signed sliders run -100..100;
 * one-sided effects (sharpen, blur, grain, vignette) run 0..100.
 */
export const ADJUST_KEYS = [
  'brightness',
  'contrast',
  'saturation',
  'exposure',
  'temperature',
  'tint',
  'vibrance',
  'highlights',
  'shadows',
  'sharpen',
  'blur',
  'grain',
  'vignette',
] as const;
export const ONE_SIDED_ADJUST = ['sharpen', 'blur', 'grain', 'vignette'] as const;

export const adjustSchema = z.object(
  Object.fromEntries(ADJUST_KEYS.map((k) => [k, z.number().min(-100).max(100)])) as Record<
    (typeof ADJUST_KEYS)[number],
    z.ZodNumber
  >,
);

export const imagePropsSchema = z.object({
  assetId: z.string(),
  fit: fitSchema,
  crop: cropSchema.nullable(),
  cornerRadius: cornerRadiusSchema,
  flipX: z.boolean(),
  flipY: z.boolean(),
  border: borderSchema.nullable(),
  shadow: boxShadowSchema.nullable(),
  adjust: adjustSchema,
  /** Named look (see core/adjust PRESETS) layered under `adjust`; null = none. */
  preset: z.string().nullable(),
});

export const textStrokeSchema = z.object({ color, width: z.number().min(0) });
export const textShadowSchema = z.object({
  color,
  blur: z.number().min(0),
  offsetX: z.number(),
  offsetY: z.number(),
  opacity: z.number().min(0).max(1),
});

export const textPropsSchema = z.object({
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().gt(0),
  fontWeight: z.number().int().min(100).max(900),
  color,
  align: z.enum(['left', 'center', 'right']),
  lineHeight: z.number().gt(0),
  letterSpacing: z.number(),
  stroke: textStrokeSchema.nullable(),
  shadow: textShadowSchema.nullable(),
});

export const shapePropsSchema = z.object({
  kind: z.enum(['rect', 'ellipse', 'line']),
  fill: fillSchema,
  stroke: color,
  strokeWidth: z.number().min(0),
  cornerRadius: cornerRadiusSchema,
});

export const framePropsSchema = z.object({
  cornerRadius: cornerRadiusSchema,
  assetId: z.string().nullable(),
  fit: fitSchema,
  placeholderLabel: z.string(),
  border: borderSchema.nullable(),
  shadow: boxShadowSchema.nullable(),
  adjust: adjustSchema,
  preset: z.string().nullable(),
});

export const LINE_DASHES = ['solid', 'dashed', 'dotted'] as const;
export const LINE_CAPS = ['none', 'arrow', 'circle', 'diamond'] as const;

const point = z.object({ x: z.number(), y: z.number() });

/**
 * A straight line. `start` / `end` are normalized to the layer box
 * (0..1 on both axes), so resizing the box with the Transformer scales the
 * line and rotation turns it.
 */
export const linePropsSchema = z.object({
  start: point,
  end: point,
  color,
  width: z.number().min(0),
  dash: z.enum(LINE_DASHES),
  startCap: z.enum(LINE_CAPS),
  endCap: z.enum(LINE_CAPS),
});

/**
 * A sticker: a built-in vector sticker (`builtinId`) or an uploaded PNG/SVG
 * (`assetId`), fitted inside the box. `tint` recolors single-color built-ins.
 */
export const stickerPropsSchema = z.object({
  builtinId: z.string().nullable(),
  assetId: z.string().nullable(),
  tint: color.nullable(),
  flipX: z.boolean(),
  flipY: z.boolean(),
});

/** One freehand stroke; `points` is a flat [x0, y0, x1, y1, ...] list normalized to the layer box. */
export const strokeSchema = z.object({
  points: z.array(z.number()),
  color,
  /** Stroke width in canvas px. */
  width: z.number().gt(0),
  opacity: z.number().min(0).max(1),
});

export const drawingPropsSchema = z.object({
  strokes: z.array(strokeSchema),
});

export const backgroundPropsSchema = z.object({
  fill: fillSchema,
});

// ---------- Layers ----------
const layerBase = {
  id: z.string().min(1),
  /** Top-left corner of the (unrotated) box, in panorama export pixels. */
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
  /** Degrees, clockwise, about the top-left corner (Konva convention). */
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
  name: z.string(),
};

export const imageLayerSchema = z.object({ ...layerBase, type: z.literal('image'), props: imagePropsSchema });
export const textLayerSchema = z.object({ ...layerBase, type: z.literal('text'), props: textPropsSchema });
export const shapeLayerSchema = z.object({ ...layerBase, type: z.literal('shape'), props: shapePropsSchema });
export const frameLayerSchema = z.object({ ...layerBase, type: z.literal('frame'), props: framePropsSchema });
export const lineLayerSchema = z.object({ ...layerBase, type: z.literal('line'), props: linePropsSchema });
export const stickerLayerSchema = z.object({ ...layerBase, type: z.literal('sticker'), props: stickerPropsSchema });
export const drawingLayerSchema = z.object({ ...layerBase, type: z.literal('drawing'), props: drawingPropsSchema });
export const backgroundLayerSchema = z.object({
  ...layerBase,
  type: z.literal('background'),
  props: backgroundPropsSchema,
});

export const layerSchema = z.discriminatedUnion('type', [
  imageLayerSchema,
  textLayerSchema,
  shapeLayerSchema,
  frameLayerSchema,
  lineLayerSchema,
  stickerLayerSchema,
  drawingLayerSchema,
  backgroundLayerSchema,
]);

// ---------- Project ----------
export const assetMetaSchema = z.object({
  mime: z.string(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

export const canvasSchema = z.object({
  slideCount: z.number().int().min(MIN_SLIDES).max(MAX_SLIDES),
  aspect: aspectSchema,
  /** Slide height when aspect is 'custom' (slide width stays 1080). Ignored for other aspects. */
  customHeightPx: z.number().int().min(MIN_CUSTOM_HEIGHT).max(MAX_CUSTOM_HEIGHT),
  /** Export width of one slide in px. */
  slideWidthPx: z.number().int().min(100).max(4096),
  background: fillSchema,
});

export const projectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    canvas: canvasSchema,
    layers: z.array(layerSchema),
    assets: z.record(z.string(), assetMetaSchema),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    p.layers.forEach((l, i) => {
      if (seen.has(l.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate layer id "${l.id}"`, path: ['layers', i, 'id'] });
      }
      seen.add(l.id);
    });
  });

/**
 * Template format. A template is a project stripped of personal content: the
 * canvas and layers, with photos turned into empty frames (placeholders)
 * unless the author chose to embed them as data URLs.
 *
 * `schemaVersion` is the core document schema version (templates embed the
 * canvas + layers, so core migrations apply to them unchanged).
 */
import { z } from 'zod';
import { canvasSchema, gridGroupSchema, layerSchema, SCHEMA_VERSION } from '../core/schema';

/** Embedded assets are limited to raster images; SVG is excluded on purpose. */
const DATA_URL = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]*={0,2}$/;

export const templateAssetSchema = z.object({
  mime: z.string().max(100),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  dataUrl: z.string().regex(DATA_URL, 'must be a base64 raster image data URL'),
});

export const MAX_TEMPLATE_LAYERS = 500;

export const templateSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20),
    canvas: canvasSchema,
    layers: z.array(layerSchema).max(MAX_TEMPLATE_LAYERS),
    /** Grid groups by id; their cells reference layer ids in this template. */
    grids: z.record(z.string(), gridGroupSchema).default({}),
    /** Present only when the template embeds its photos. */
    assets: z.record(z.string(), templateAssetSchema).optional(),
    createdAt: z.number(),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    t.layers.forEach((l, i) => {
      if (seen.has(l.id)) ctx.addIssue({ code: 'custom', message: `duplicate layer id "${l.id}"`, path: ['layers', i, 'id'] });
      seen.add(l.id);
      const assetId = l.type === 'image' || l.type === 'frame' || l.type === 'sticker' ? l.props.assetId : null;
      if (assetId && !t.assets?.[assetId]) {
        ctx.addIssue({ code: 'custom', message: `layer references missing asset "${assetId}"`, path: ['layers', i, 'props', 'assetId'] });
      }
    });
  });

export type Template = z.infer<typeof templateSchema>;
export type TemplateAsset = z.infer<typeof templateAssetSchema>;

/** Lightweight description used by template browsers; enough to list without loading layers. */
export interface TemplateListing {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  slideCount: number;
  aspect: Template['canvas']['aspect'];
  createdAt: number;
  /** Optional remote thumbnail (future online galleries). */
  thumbnailUrl?: string;
}

export function toListing(t: Template): TemplateListing {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    tags: t.tags,
    slideCount: t.canvas.slideCount,
    aspect: t.canvas.aspect,
    createdAt: t.createdAt,
  };
}

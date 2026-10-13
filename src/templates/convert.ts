import { createId } from '../core/id';
import { SCHEMA_VERSION } from '../core/schema';
import { validateProject } from '../core/serialize';
import type { FrameLayer, Layer, Project } from '../core/types';
import { templateSchema, type Template, type TemplateAsset } from './schema';

export interface ProjectToTemplateOptions {
  id?: string;
  name?: string;
  description?: string;
  tags?: string[];
  /**
   * Keep photos: image/frame layers keep their assets, embedded as data URLs.
   * `assetDataUrls` must then contain a data URL for every referenced asset.
   */
  includeAssets?: boolean;
  assetDataUrls?: Record<string, string>;
  now?: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function emptyFrame(layer: Layer & { type: 'image' | 'frame' }, index: number): FrameLayer {
  const p = layer.props;
  return {
    id: layer.id,
    type: 'frame',
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    locked: layer.locked,
    hidden: layer.hidden,
    // image layers are usually named after the user's file; do not leak that
    name: layer.type === 'image' ? `Photo ${index}` : layer.name,
    props: {
      cornerRadius: clone(p.cornerRadius),
      assetId: null,
      fit: p.fit,
      placeholderLabel: (p as { placeholderLabel?: string }).placeholderLabel ?? 'Drop photo',
      border: clone(p.border),
      shadow: clone(p.shadow),
    },
  };
}

/** Make a shareable template from a project. Photos become empty frames unless `includeAssets`. */
export function projectToTemplate(project: Project, opts: ProjectToTemplateOptions = {}): Template {
  const includeAssets = !!opts.includeAssets;
  let photoIndex = 0;
  const used = new Set<string>();
  const layers: Layer[] = project.layers.map((l) => {
    if (l.type !== 'image' && l.type !== 'frame') return clone(l);
    if (includeAssets) {
      if (l.props.assetId) used.add(l.props.assetId);
      return clone(l);
    }
    if (l.type === 'image') photoIndex++;
    return emptyFrame(l, photoIndex);
  });

  let assets: Record<string, TemplateAsset> | undefined;
  if (includeAssets && used.size) {
    assets = {};
    for (const id of used) {
      const meta = project.assets[id];
      const dataUrl = opts.assetDataUrls?.[id];
      if (!meta || !dataUrl) throw new Error(`Cannot embed asset "${id}": missing data`);
      assets[id] = { mime: meta.mime, w: meta.w, h: meta.h, dataUrl };
    }
  }

  const template: Template = {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id ?? createId('tpl'),
    name: (opts.name ?? project.name).trim() || 'Untitled template',
    ...(opts.description ? { description: opts.description } : {}),
    tags: opts.tags ?? [],
    canvas: clone(project.canvas),
    layers,
    ...(assets ? { assets } : {}),
    createdAt: opts.now ?? Date.now(),
  };
  return templateSchema.parse(template);
}

export interface TemplateToProjectOptions {
  name?: string;
  now?: number;
  /** Called for each embedded asset with its fresh id, so the caller can store the bytes. */
  onAsset?: (assetId: string, asset: TemplateAsset) => void;
}

/** Instantiate a template as a new project: fresh project, layer and asset ids. */
export function templateToProject(template: Template, opts: TemplateToProjectOptions = {}): Project {
  const now = opts.now ?? Date.now();
  const assetIds = new Map<string, string>();
  const assets: Project['assets'] = {};
  for (const [oldId, a] of Object.entries(template.assets ?? {})) {
    const id = createId('ast');
    assetIds.set(oldId, id);
    assets[id] = { mime: a.mime, w: a.w, h: a.h };
    opts.onAsset?.(id, a);
  }
  const layers = template.layers.map((l): Layer => {
    const copy = clone(l);
    copy.id = createId('lyr');
    if ((copy.type === 'image' || copy.type === 'frame') && copy.props.assetId) {
      const mapped = assetIds.get(copy.props.assetId);
      copy.props.assetId = mapped ?? (copy.type === 'image' ? '' : null);
    }
    return copy;
  });
  return validateProject({
    id: createId('prj'),
    name: opts.name ?? template.name,
    schemaVersion: SCHEMA_VERSION,
    canvas: clone(template.canvas),
    layers,
    assets,
    createdAt: now,
    updatedAt: now,
  });
}

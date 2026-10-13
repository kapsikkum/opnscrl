import Konva from 'konva';
import { slicePlan } from '../core/geometry';
import type { Project } from '../core/types';
import type { AssetResolver } from '../layers/types';
import { createAssetCache } from './assets';
import { createCanvasBackground, updateCanvasBackground } from './canvasBackground';
import { Reconciler } from './reconcile';

export interface ExportOptions {
  format?: 'png' | 'jpeg';
  /** JPEG quality 0..1 (ignored for PNG). Default 0.92. */
  quality?: number;
  /** Multiplier on slideWidthPx. Default 1 (e.g. 1080 px wide slides). */
  scale?: number;
  /** Only render these slide indices (0-based), e.g. [0] for a thumbnail. Default: all. */
  only?: readonly number[];
  /** Called after each slice is encoded. */
  onProgress?: (done: number, total: number) => void;
}

async function loadFonts(project: Project): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const wanted = new Set<string>();
  for (const l of project.layers) {
    if (l.type === 'text' && !l.hidden) {
      wanted.add(`${l.props.fontWeight} ${l.props.fontSize}px ${l.props.fontFamily}`);
    }
  }
  await Promise.allSettled([...wanted].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
}

/**
 * Render the whole panorama at export resolution and cut it into one Blob per
 * slide. Implementation note: instead of allocating one giant canvas (which
 * breaks on iOS/Safari above ~16M pixels, i.e. 8+ slides), a single offscreen
 * stage the size of one slide is re-pointed at each slice window in turn. The
 * output is pixel-identical to rendering the full canvas and cropping it, and
 * peak memory stays at one slide. Editor guides are never part of this scene.
 */
export async function exportSlides(
  project: Project,
  resolveAsset: AssetResolver,
  opts: ExportOptions = {},
): Promise<Blob[]> {
  const format = opts.format ?? 'png';
  const quality = opts.quality ?? 0.92;
  const scale = opts.scale ?? 1;
  const only = opts.only ? new Set(opts.only) : null;
  const plan = slicePlan(project.canvas, scale).filter((s) => !only || only.has(s.index));
  if (!plan.length) return [];
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

  await loadFonts(project);

  const first = plan[0]!;
  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width: first.outWidth,
    height: first.outHeight,
  });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    const world = new Konva.Group();
    layer.add(world);

    const bg = createCanvasBackground();
    updateCanvasBackground(bg, project.canvas);
    world.add(bg);
    const content = new Konva.Group();
    world.add(content);

    const pending: Promise<unknown>[] = [];
    const reconciler = new Reconciler(content, {
      mode: 'export',
      resolveAsset: createAssetCache(resolveAsset),
      track: (p) => pending.push(p),
    });
    reconciler.sync(project.layers);
    await Promise.all(pending);

    const blobs: Blob[] = [];
    for (const slice of plan) {
      stage.size({ width: slice.outWidth, height: slice.outHeight });
      world.setAttrs({
        x: (-slice.source.x * slice.outWidth) / slice.source.width,
        y: (-slice.source.y * slice.outHeight) / slice.source.height,
        scaleX: slice.outWidth / slice.source.width,
        scaleY: slice.outHeight / slice.source.height,
      });
      layer.draw();
      const blob = await stage.toBlob({ mimeType, quality, pixelRatio: 1 });
      if (!blob) throw new Error(`Failed to encode slide ${slice.index + 1}`);
      blobs.push(blob);
      opts.onProgress?.(blobs.length, plan.length);
    }
    return blobs;
  } finally {
    stage.destroy();
  }
}

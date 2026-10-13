/**
 * Slide-level operations expressed as ops: insert, remove and reorder slides
 * by shifting layers by whole slide widths. A layer "belongs" to the slide
 * that contains the center of its bounding box. Full-canvas backgrounds never
 * move (setCanvas with fitBackgrounds resizes them).
 */
import type { Op } from './commands';
import { layerBounds, slideRects } from './geometry';
import { MAX_SLIDES, MIN_SLIDES } from './schema';
import type { Layer, Project } from './types';

/** Index of the slide containing the center of the layer, clamped to existing slides. */
export function layerSlideIndex(
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  project: Pick<Project, 'canvas'>,
): number {
  const b = layerBounds(layer);
  const cx = b.x + b.width / 2;
  const w = project.canvas.slideWidthPx;
  return Math.max(0, Math.min(project.canvas.slideCount - 1, Math.floor(cx / w)));
}

const movable = (l: Layer): boolean => l.type !== 'background';

const shift = (l: Layer, dx: number): Op => ({ op: 'updateLayer', id: l.id, patch: { x: l.x + dx } });

/** Insert an empty slide so that it ends up at `index` (0..slideCount). Returns null at the slide limit. */
export function insertSlideOps(project: Project, index: number): Op | null {
  if (project.canvas.slideCount >= MAX_SLIDES) return null;
  const at = Math.max(0, Math.min(project.canvas.slideCount, Math.trunc(index)));
  const w = project.canvas.slideWidthPx;
  const ops: Op[] = [{ op: 'setCanvas', patch: { slideCount: project.canvas.slideCount + 1 }, fitBackgrounds: true }];
  for (const l of project.layers) {
    if (!movable(l)) continue;
    const b = layerBounds(l);
    if (b.x + b.width / 2 >= at * w) ops.push(shift(l, w));
  }
  return { op: 'batch', ops };
}

/** Layers that removing slide `index` would delete (center inside that slide). */
export function layersOnSlide(project: Project, index: number): Layer[] {
  return project.layers.filter((l) => movable(l) && layerSlideIndex(l, project) === index);
}

/** Remove slide `index` and its layers; later layers shift left. Returns null if only one slide remains. */
export function removeSlideOps(project: Project, index: number): Op | null {
  if (project.canvas.slideCount <= MIN_SLIDES) return null;
  if (!slideRects(project.canvas)[index]) return null;
  const w = project.canvas.slideWidthPx;
  const ops: Op[] = [];
  for (const l of project.layers) {
    if (!movable(l)) continue;
    const s = layerSlideIndex(l, project);
    if (s === index) ops.push({ op: 'removeLayer', id: l.id });
    else if (s > index) ops.push(shift(l, -w));
  }
  ops.push({ op: 'setCanvas', patch: { slideCount: project.canvas.slideCount - 1 }, fitBackgrounds: true });
  return { op: 'batch', ops };
}

/** Swap slide `from` with its neighbour `from + dir` (dir = -1 or 1) by shifting layers +-1 slide width. */
export function moveSlideOps(project: Project, from: number, dir: -1 | 1): Op | null {
  const to = from + dir;
  if (from < 0 || to < 0 || from >= project.canvas.slideCount || to >= project.canvas.slideCount) return null;
  const w = project.canvas.slideWidthPx;
  const ops: Op[] = [];
  for (const l of project.layers) {
    if (!movable(l)) continue;
    const s = layerSlideIndex(l, project);
    if (s === from) ops.push(shift(l, dir * w));
    else if (s === to) ops.push(shift(l, -dir * w));
  }
  return ops.length ? { op: 'batch', ops } : null;
}

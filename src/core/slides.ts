/**
 * Slide-level operations expressed as ops: insert, remove and reorder slides
 * by shifting layers by whole slide widths. A layer "belongs" to the slide
 * that contains the center of its bounding box. Full-canvas backgrounds never
 * move (setCanvas with fitBackgrounds resizes them).
 */
import type { Op } from './commands';
import { layerBounds, slideRects } from './geometry';
import { isGridEmpty } from './gridGroup';
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

/**
 * Ops that keep grid groups in step with their frames. `dx` maps frame id to
 * its horizontal shift and `removed` holds deleted frame ids. A group whose
 * surviving frames all shift by the same amount gets its area shifted too (so a
 * later relayout does not snap back); a group left with no frames is dropped
 * (undo restores it); a group whose frames diverge is left to `syncGridArea`.
 */
function gridFollowOps(project: Project, dx: Map<string, number>, removed: Set<string> = new Set()): Op[] {
  const ops: Op[] = [];
  const alive = new Set(project.layers.filter((l) => l.type === 'frame' && !removed.has(l.id)).map((l) => l.id));
  for (const [id, grid] of Object.entries(project.grids)) {
    const cellIds = grid.cells.map((c) => c.frameId);
    if (!isGridEmpty(project, grid) && !cellIds.some((f) => alive.has(f))) {
      ops.push({ op: 'setGrid', id, grid: null });
      continue;
    }
    const shifts = new Set(cellIds.filter((f) => alive.has(f)).map((f) => dx.get(f) ?? 0));
    if (shifts.size !== 1) continue;
    const d = [...shifts][0]!;
    if (d !== 0) ops.push({ op: 'setGrid', id, grid: { ...grid, area: { ...grid.area, x: grid.area.x + d } } });
  }
  return ops;
}

/** Insert an empty slide so that it ends up at `index` (0..slideCount). Returns null at the slide limit. */
export function insertSlideOps(project: Project, index: number): Op | null {
  if (project.canvas.slideCount >= MAX_SLIDES) return null;
  const at = Math.max(0, Math.min(project.canvas.slideCount, Math.trunc(index)));
  const w = project.canvas.slideWidthPx;
  const ops: Op[] = [{ op: 'setCanvas', patch: { slideCount: project.canvas.slideCount + 1 }, fitBackgrounds: true }];
  const dx = new Map<string, number>();
  for (const l of project.layers) {
    if (!movable(l)) continue;
    const b = layerBounds(l);
    if (b.x + b.width / 2 >= at * w) {
      ops.push(shift(l, w));
      dx.set(l.id, w);
    }
  }
  ops.push(...gridFollowOps(project, dx));
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
  const dx = new Map<string, number>();
  const removed = new Set<string>();
  for (const l of project.layers) {
    if (!movable(l)) continue;
    const s = layerSlideIndex(l, project);
    if (s === index) {
      ops.push({ op: 'removeLayer', id: l.id });
      removed.add(l.id);
    } else if (s > index) {
      ops.push(shift(l, -w));
      dx.set(l.id, -w);
    }
  }
  ops.push(...gridFollowOps(project, dx, removed));
  ops.push({ op: 'setCanvas', patch: { slideCount: project.canvas.slideCount - 1 }, fitBackgrounds: true });
  return { op: 'batch', ops };
}

/** Swap slide `from` with its neighbour `from + dir` (dir = -1 or 1) by shifting layers +-1 slide width. */
export function moveSlideOps(project: Project, from: number, dir: -1 | 1): Op | null {
  const to = from + dir;
  if (from < 0 || to < 0 || from >= project.canvas.slideCount || to >= project.canvas.slideCount) return null;
  const w = project.canvas.slideWidthPx;
  const ops: Op[] = [];
  const dx = new Map<string, number>();
  for (const l of project.layers) {
    if (!movable(l)) continue;
    const s = layerSlideIndex(l, project);
    if (s === from) {
      ops.push(shift(l, dir * w));
      dx.set(l.id, dir * w);
    } else if (s === to) {
      ops.push(shift(l, -dir * w));
      dx.set(l.id, -dir * w);
    }
  }
  ops.push(...gridFollowOps(project, dx));
  return ops.length ? { op: 'batch', ops } : null;
}

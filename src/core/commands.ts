/**
 * Commands: pure functions (project, args) -> { project, inverse }.
 *
 * Every command is also expressible as a plain data `Op` so that History can
 * store it, replay it (redo) and merge consecutive ones. `applyOp(project, op)`
 * dispatches an Op to the matching command. Inputs are never mutated; unchanged
 * subtrees are shared structurally (cheap change detection for the renderer).
 */
import { canvasSize } from './geometry';
import { gridFrameRects, syncGridArea } from './gridGroup';
import { MAX_SLIDES, MIN_SLIDES } from './schema';
import type { AssetMeta, CanvasSettings, GridGroup, Layer, LayerPatch, Project } from './types';

export type Op =
  | { op: 'addLayer'; layer: Layer; index?: number }
  | { op: 'removeLayer'; id: string }
  | { op: 'updateLayer'; id: string; patch: LayerPatch }
  | { op: 'reorder'; id: string; toIndex: number }
  | { op: 'duplicate'; id: string; newId: string; offset?: { x: number; y: number } }
  | { op: 'setCanvas'; patch: Partial<CanvasSettings>; fitBackgrounds?: boolean; fitLayers?: boolean }
  | { op: 'addAsset'; id: string; meta: AssetMeta }
  | { op: 'removeAsset'; id: string }
  | { op: 'rename'; name: string }
  /** Set (or with `grid: null` delete) the grid group `id`. Frames are not touched. */
  | { op: 'setGrid'; id: string; grid: GridGroup | null }
  | { op: 'batch'; ops: Op[] };

export interface CommandResult {
  project: Project;
  /** Applying this op to `project` restores the input project (modulo updatedAt). */
  inverse: Op;
}

const findIndex = (p: Project, id: string): number => {
  const i = p.layers.findIndex((l) => l.id === id);
  if (i < 0) throw new Error(`Layer not found: ${id}`);
  return i;
};

export function addLayer(project: Project, layer: Layer, index?: number): CommandResult {
  if (project.layers.some((l) => l.id === layer.id)) throw new Error(`Duplicate layer id: ${layer.id}`);
  const at = index === undefined ? project.layers.length : Math.max(0, Math.min(index, project.layers.length));
  const layers = project.layers.slice();
  layers.splice(at, 0, layer);
  return { project: { ...project, layers }, inverse: { op: 'removeLayer', id: layer.id } };
}

export function removeLayer(project: Project, id: string): CommandResult {
  const i = findIndex(project, id);
  const layer = project.layers[i]!;
  const layers = project.layers.slice();
  layers.splice(i, 1);
  return { project: { ...project, layers }, inverse: { op: 'addLayer', layer, index: i } };
}

export function updateLayer(project: Project, id: string, patch: LayerPatch): CommandResult {
  const i = findIndex(project, id);
  const old = project.layers[i]!;
  const { props: propsPatch, ...rest } = patch;
  const invRest: Record<string, unknown> = {};
  for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
    invRest[key] = (old as Record<string, unknown>)[key];
  }
  const inversePatch: LayerPatch = invRest as LayerPatch;
  let props = old.props;
  if (propsPatch) {
    const invProps: Record<string, unknown> = {};
    for (const key of Object.keys(propsPatch)) invProps[key] = (old.props as Record<string, unknown>)[key];
    inversePatch.props = invProps as LayerPatch['props'];
    props = { ...old.props, ...propsPatch } as Layer['props'];
  }
  const next = { ...old, ...rest, props } as Layer;
  const layers = project.layers.slice();
  layers[i] = next;
  return { project: { ...project, layers }, inverse: { op: 'updateLayer', id, patch: inversePatch } };
}

export function reorder(project: Project, id: string, toIndex: number): CommandResult {
  const from = findIndex(project, id);
  const to = Math.max(0, Math.min(Math.trunc(toIndex), project.layers.length - 1));
  const layers = project.layers.slice();
  const [layer] = layers.splice(from, 1);
  layers.splice(to, 0, layer!);
  return { project: { ...project, layers }, inverse: { op: 'reorder', id, toIndex: from } };
}

export function duplicate(
  project: Project,
  id: string,
  newId: string,
  offset: { x: number; y: number } = { x: 40, y: 40 },
): CommandResult {
  const i = findIndex(project, id);
  const src = project.layers[i]!;
  const copy = {
    ...src,
    id: newId,
    name: `${src.name} copy`,
    x: src.x + offset.x,
    y: src.y + offset.y,
    props: structuredCloneJson(src.props),
  } as Layer;
  return addLayer(project, copy, i + 1);
}

export function addAsset(project: Project, id: string, meta: AssetMeta): CommandResult {
  const prev = project.assets[id];
  return {
    project: { ...project, assets: { ...project.assets, [id]: meta } },
    inverse: prev ? { op: 'addAsset', id, meta: prev } : { op: 'removeAsset', id },
  };
}

export function removeAsset(project: Project, id: string): CommandResult {
  const prev = project.assets[id];
  if (!prev) return { project, inverse: { op: 'batch', ops: [] } };
  const { [id]: _removed, ...assets } = project.assets;
  return { project: { ...project, assets }, inverse: { op: 'addAsset', id, meta: prev } };
}

/** Set or delete (null) a grid group record. Never touches layers; cells may reference missing frames. */
export function setGrid(project: Project, id: string, grid: GridGroup | null): CommandResult {
  const prev = project.grids[id] ?? null;
  const grids = { ...project.grids };
  if (grid) grids[id] = grid;
  else delete grids[id];
  return { project: { ...project, grids }, inverse: { op: 'setGrid', id, grid: prev } };
}

/**
 * Change slide count / aspect / width / background. By default layers keep
 * their panorama coordinates. With `fitBackgrounds`, background layers that
 * exactly covered the old canvas are resized to cover the new one. With
 * `fitLayers`, a change of slide size (aspect, custom height, slide width)
 * rescales the layout: frames stretch with the slide (grids keep filling it)
 * and every other layer keeps its size but moves with its center. Frames that
 * belong to a grid group are laid out from the group instead: its area is
 * scaled and the frames follow it (gutter and padding stay in px).
 */
export function setCanvas(
  project: Project,
  patch: Partial<CanvasSettings>,
  fitBackgrounds = false,
  fitLayers = false,
): CommandResult {
  const next: CanvasSettings = { ...project.canvas, ...patch };
  if (patch.slideCount !== undefined) {
    next.slideCount = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(patch.slideCount)));
  }
  const prevValues: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof CanvasSettings)[]) prevValues[key] = project.canvas[key];
  const canvasInverse: Op = { op: 'setCanvas', patch: prevValues as Partial<CanvasSettings> };

  let current: Project = { ...project, canvas: next };
  if (!fitBackgrounds && !fitLayers) return { project: current, inverse: canvasInverse };

  const oldSize = canvasSize(project.canvas);
  const newSize = canvasSize(next);
  const sx = next.slideWidthPx / project.canvas.slideWidthPx;
  const sy = newSize.height / oldSize.height;
  const scaleLayers = fitLayers && (sx !== 1 || sy !== 1);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const inverses: Op[] = [];
  const gridded = new Set<string>();
  if (scaleLayers) {
    for (const [gid, g] of Object.entries(project.grids)) {
      const synced = syncGridArea(project, g);
      const a = synced.area;
      const scaled: GridGroup = {
        ...synced,
        area: { x: r2(a.x * sx), y: r2(a.y * sy), width: r2(a.width * sx), height: r2(a.height * sy) },
      };
      let rects;
      try {
        rects = gridFrameRects(scaled);
      } catch {
        continue; // does not fit any more: leave these frames to plain scaling
      }
      const gr = setGrid(current, gid, scaled);
      current = gr.project;
      inverses.push(gr.inverse);
      scaled.cells.forEach((cell, i) => {
        const frame = current.layers.find((l) => l.id === cell.frameId && l.type === 'frame');
        if (!frame || gridded.has(frame.id)) return;
        gridded.add(frame.id);
        const { x, y, width, height } = rects[i]!;
        const r = updateLayer(current, frame.id, { x, y, width, height });
        current = r.project;
        inverses.push(r.inverse);
      });
    }
  }
  for (const l of project.layers) {
    if (gridded.has(l.id)) continue;
    let patch: LayerPatch | null = null;
    if (l.type === 'background' && l.x === 0 && l.y === 0 && l.width === oldSize.width && l.height === oldSize.height) {
      if (fitBackgrounds) patch = { width: newSize.width, height: newSize.height };
    } else if (scaleLayers) {
      if (l.type === 'frame') {
        patch = { x: r2(l.x * sx), y: r2(l.y * sy), width: r2(l.width * sx), height: r2(l.height * sy) };
      } else {
        const cx = l.x + l.width / 2;
        const cy = l.y + l.height / 2;
        patch = { x: r2(cx * sx - l.width / 2), y: r2(cy * sy - l.height / 2) };
      }
    }
    if (!patch) continue;
    const r = updateLayer(current, l.id, patch);
    current = r.project;
    inverses.push(r.inverse);
  }
  if (!inverses.length) return { project: current, inverse: canvasInverse };
  return { project: current, inverse: { op: 'batch', ops: [...inverses.reverse(), canvasInverse] } };
}

/** Change the project's name. */
export function renameProject(project: Project, name: string): CommandResult {
  return { project: { ...project, name }, inverse: { op: 'rename', name: project.name } };
}

export function batch(project: Project, ops: Op[]): CommandResult {
  let current = project;
  const inverses: Op[] = [];
  for (const op of ops) {
    const r = applyOp(current, op);
    current = r.project;
    inverses.push(r.inverse);
  }
  return { project: current, inverse: { op: 'batch', ops: inverses.reverse() } };
}

export function applyOp(project: Project, op: Op): CommandResult {
  switch (op.op) {
    case 'addLayer':
      return addLayer(project, op.layer, op.index);
    case 'removeLayer':
      return removeLayer(project, op.id);
    case 'updateLayer':
      return updateLayer(project, op.id, op.patch);
    case 'reorder':
      return reorder(project, op.id, op.toIndex);
    case 'duplicate':
      return duplicate(project, op.id, op.newId, op.offset);
    case 'setCanvas':
      return setCanvas(project, op.patch, op.fitBackgrounds, op.fitLayers);
    case 'addAsset':
      return addAsset(project, op.id, op.meta);
    case 'removeAsset':
      return removeAsset(project, op.id);
    case 'rename':
      return renameProject(project, op.name);
    case 'setGrid':
      return setGrid(project, op.id, op.grid);
    case 'batch':
      return batch(project, op.ops);
  }
}

/** Merge two consecutive updateLayer patches (later wins). */
function mergePatch(a: LayerPatch, b: LayerPatch): LayerPatch {
  const { props: pa, ...ra } = a;
  const { props: pb, ...rb } = b;
  const out: LayerPatch = { ...ra, ...rb };
  if (pa || pb) out.props = { ...pa, ...pb } as LayerPatch['props'];
  return out;
}

/**
 * Combine two consecutive ops into one (used by History coalescing). Returns
 * the merged forward op and inverse op. `updateLayer` on the same layer folds
 * into a single patch; anything else becomes a batch.
 */
export function mergeOps(
  first: { op: Op; inverse: Op },
  second: { op: Op; inverse: Op },
): { op: Op; inverse: Op } {
  const a = first.op;
  const b = second.op;
  const ai = first.inverse;
  const bi = second.inverse;
  if (a.op === 'rename' && b.op === 'rename') {
    return { op: b, inverse: first.inverse };
  }
  if (
    a.op === 'updateLayer' &&
    b.op === 'updateLayer' &&
    a.id === b.id &&
    ai.op === 'updateLayer' &&
    bi.op === 'updateLayer'
  ) {
    return {
      op: { op: 'updateLayer', id: a.id, patch: mergePatch(a.patch, b.patch) },
      // the earliest captured values win when restoring
      inverse: { op: 'updateLayer', id: a.id, patch: mergePatch(bi.patch, ai.patch) },
    };
  }
  return {
    op: { op: 'batch', ops: [a, b] },
    inverse: { op: 'batch', ops: [bi, ai] },
  };
}

function structuredCloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

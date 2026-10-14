/**
 * Grid groups: the pure model (no ops). A `GridGroup` (see schema.ts) is the
 * recipe that positions a set of frame layers: an area, gutter, padding and
 * unit-square cells. The group is the source of truth for the frames' geometry;
 * the frames themselves stay ordinary layers.
 *
 * Cells whose frame no longer exists (deleted layer) are skipped everywhere.
 *
 * Functions here only read the project; the ops that write (`createGridOps`,
 * `relayoutOps`, `ungroupOps`) live in ./grid.ts.
 */
import type { Rect } from './geometry';
import { layoutCells } from './gridLayouts';
import type { FrameLayer, GridGroup, Project } from './types';

const EPS = 1e-6;
const TINY = 1e-9;

/** Pixel rectangle of every cell (same order as `grid.cells`), padding and gutter applied. Throws RangeError if a cell collapses. */
export function gridFrameRects(grid: GridGroup): Rect[] {
  return layoutCells(grid.area, grid.cells, grid.gutter, grid.padding);
}

function safeRects(grid: GridGroup): Rect[] | null {
  try {
    return gridFrameRects(grid);
  } catch {
    return null;
  }
}

function frameMap(project: Project): Map<string, FrameLayer> {
  const m = new Map<string, FrameLayer>();
  for (const l of project.layers) if (l.type === 'frame') m.set(l.id, l);
  return m;
}

/** Cells (with expected rect and actual frame) whose frame still exists. Prefers non-inset cells, falls back to all. */
function existingCells(project: Project, grid: GridGroup, rects: Rect[]) {
  const frames = frameMap(project);
  const all: { index: number; rect: Rect; frame: FrameLayer; inset: boolean }[] = [];
  grid.cells.forEach((cell, index) => {
    const frame = frames.get(cell.frameId);
    if (frame) all.push({ index, rect: rects[index]!, frame, inset: !!cell.inset });
  });
  const tiles = all.filter((c) => !c.inset);
  return tiles.length ? tiles : all;
}

/** The grid that owns `frameId`, if any. */
export function gridOfFrame(project: Project, frameId: string): { id: string; grid: GridGroup } | null {
  for (const [id, grid] of Object.entries(project.grids)) {
    if (grid.cells.some((c) => c.frameId === frameId)) return { id, grid };
  }
  return null;
}

/** True when no cell of the grid has an existing frame (the group is dead weight and may be pruned). */
export function isGridEmpty(project: Project, grid: GridGroup): boolean {
  const frames = frameMap(project);
  return !grid.cells.some((c) => frames.has(c.frameId));
}

/**
 * Self-healing for translations. Frames can be moved by other ops (dragging,
 * nudging, slide insert/remove/reorder) without touching the grid record. This
 * returns the grid with its area translated by however far the first existing
 * non-inset cell's frame sits from where the grid expects it (inset cells are
 * used only if there are no others). Returns the same object when nothing moved
 * or no cell has a frame. Call it on the stored grid before editing gutter,
 * padding or dividers, so a relayout does not snap frames back.
 */
export function syncGridArea(project: Project, grid: GridGroup): GridGroup {
  const rects = safeRects(grid);
  if (!rects) return grid;
  const first = existingCells(project, grid, rects)[0];
  if (!first) return grid;
  const dx = first.frame.x - first.rect.x;
  const dy = first.frame.y - first.rect.y;
  if (Math.abs(dx) < TINY && Math.abs(dy) < TINY) return grid;
  return { ...grid, area: { ...grid.area, x: grid.area.x + dx, y: grid.area.y + dy } };
}

/**
 * Self-healing for a whole-grid transform (translate + scale). Compares the
 * bounding box of the existing (non-inset, else all) cell frames with the box
 * the grid expects for those same cells, and maps `area` through that affine.
 * A pure translation therefore yields the same result as `syncGridArea`, but a
 * resize of the group's bounding box also scales the area. Frame rotation is
 * ignored. Returns the same object when the boxes match or are degenerate.
 */
export function gridFromBounds(project: Project, grid: GridGroup): GridGroup {
  const rects = safeRects(grid);
  if (!rects) return grid;
  const cells = existingCells(project, grid, rects);
  if (!cells.length) return grid;
  const box = (rs: Rect[]) => {
    const x0 = Math.min(...rs.map((r) => r.x));
    const y0 = Math.min(...rs.map((r) => r.y));
    const x1 = Math.max(...rs.map((r) => r.x + r.width));
    const y1 = Math.max(...rs.map((r) => r.y + r.height));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  };
  const E = box(cells.map((c) => c.rect));
  const A = box(cells.map((c) => c.frame));
  if (E.width <= 0 || E.height <= 0) return grid;
  const sx = A.width / E.width;
  const sy = A.height / E.height;
  const a = grid.area;
  const next = {
    x: A.x + (a.x - E.x) * sx,
    y: A.y + (a.y - E.y) * sy,
    width: a.width * sx,
    height: a.height * sy,
  };
  const same =
    Math.abs(next.x - a.x) < TINY &&
    Math.abs(next.y - a.y) < TINY &&
    Math.abs(next.width - a.width) < TINY &&
    Math.abs(next.height - a.height) < TINY;
  return same ? grid : { ...grid, area: next };
}

// ---------- dividers ----------

export interface GridDivider {
  axis: 'x' | 'y';
  /** Position in the unit square along `axis`. */
  value: number;
  /** Extent along the other axis, in unit coordinates. */
  from: number;
  to: number;
  /** Cells touching this divider: `end` cells lie before it (their far edge is the divider), `start` cells after it. */
  cells: { index: number; side: 'start' | 'end' }[];
}

/**
 * The draggable dividers of a grid, from the internal edges of its non-inset
 * cells. For each interior edge position, cells touching it are split into
 * connected runs (cells overlapping or abutting along the other axis), so e.g. a brick
 * layout's x = 0.5 gives one divider per row. A run only counts when it has
 * cells on both sides. Sorted: x dividers first, then y; by value, then span.
 */
export function gridDividers(grid: GridGroup): GridDivider[] {
  const out: GridDivider[] = [];
  for (const axis of ['x', 'y'] as const) {
    const a = axis === 'x' ? 0 : 1; // index of the axis' start coordinate in box
    const o = axis === 'x' ? 1 : 0; // other axis
    const tiles = grid.cells.map((cell, index) => ({ cell, index })).filter((t) => !t.cell.inset);

    const values: number[] = [];
    for (const { cell } of tiles) {
      for (const v of [cell.box[a]!, cell.box[a + 2]!]) {
        if (v > EPS && v < 1 - EPS && !values.some((u) => Math.abs(u - v) < EPS)) values.push(v);
      }
    }
    values.sort((p, q) => p - q);

    for (const value of values) {
      const touching: { index: number; side: 'start' | 'end'; lo: number; hi: number }[] = [];
      for (const { cell, index } of tiles) {
        const lo = cell.box[o]!;
        const hi = cell.box[o + 2]!;
        if (Math.abs(cell.box[a]! - value) < EPS) touching.push({ index, side: 'start', lo, hi });
        else if (Math.abs(cell.box[a + 2]! - value) < EPS) touching.push({ index, side: 'end', lo, hi });
      }
      // union-find on overlapping spans
      const parent = touching.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
      for (let i = 0; i < touching.length; i++) {
        for (let j = i + 1; j < touching.length; j++) {
          const overlap = Math.min(touching[i]!.hi, touching[j]!.hi) - Math.max(touching[i]!.lo, touching[j]!.lo);
          if (overlap > -EPS) parent[find(i)] = find(j); // overlapping or abutting
        }
      }
      const groups = new Map<number, typeof touching>();
      touching.forEach((t, i) => {
        const r = find(i);
        const g = groups.get(r);
        if (g) g.push(t);
        else groups.set(r, [t]);
      });
      for (const g of groups.values()) {
        if (!g.some((t) => t.side === 'start') || !g.some((t) => t.side === 'end')) continue;
        out.push({
          axis,
          value,
          from: Math.min(...g.map((t) => t.lo)),
          to: Math.max(...g.map((t) => t.hi)),
          cells: g.map((t) => ({ index: t.index, side: t.side })).sort((p, q) => p.index - q.index),
        });
      }
    }
  }
  return out.sort((p, q) => (p.axis === q.axis ? p.value - q.value || p.from - q.from : p.axis === 'x' ? -1 : 1));
}

/**
 * Move a divider to `newValue` (unit coordinate). Only the divider's own cells
 * change: `end` cells grow/shrink their far edge, `start` cells their near edge.
 * The value is clamped so every affected cell stays at least `minSize` (unit)
 * wide/tall along the axis, and never forced past where it already is. Pure;
 * returns the same grid when nothing changes.
 */
export function moveDivider(grid: GridGroup, divider: GridDivider, newValue: number, minSize = 0.04): GridGroup {
  const a = divider.axis === 'x' ? 0 : 1;
  let lo = 0;
  let hi = 1;
  for (const { index, side } of divider.cells) {
    const box = grid.cells[index]?.box;
    if (!box) return grid;
    if (side === 'end') lo = Math.max(lo, box[a]! + minSize);
    else hi = Math.min(hi, box[a + 2]! - minSize);
  }
  lo = Math.min(lo, divider.value);
  hi = Math.max(hi, divider.value);
  const value = Math.min(hi, Math.max(lo, newValue));
  if (Math.abs(value - divider.value) < TINY) return grid;
  const cells = grid.cells.slice();
  for (const { index, side } of divider.cells) {
    const cell = cells[index]!;
    const box = [...cell.box] as [number, number, number, number];
    box[side === 'end' ? a + 2 : a] = value;
    cells[index] = { ...cell, box };
  }
  return { ...grid, cells };
}

// ---------- selection ----------

/** Ids of the cell frames of a grid that still exist, in cell order. */
export function gridFrameIds(project: Project, grid: GridGroup): string[] {
  const frames = frameMap(project);
  return grid.cells.map((c) => c.frameId).filter((id) => frames.has(id));
}

export interface GridSelectionState {
  gridId: string;
  grid: GridGroup;
  /** `whole`: the selection is exactly the grid's existing frames. `cell`: one cell of a multi-cell grid. */
  mode: 'whole' | 'cell';
}

/**
 * How a selection relates to grid groups. `whole` when the selected ids are
 * exactly the existing frames of one grid (a grid left with a single frame
 * counts as whole); `cell` when a single frame of a grid with more than one
 * existing frame is selected; otherwise null (including partial selections).
 */
export function selectionGridState(project: Project, selection: readonly string[]): GridSelectionState | null {
  if (!selection.length) return null;
  const first = gridOfFrame(project, selection[0]!);
  if (!first) return null;
  const ids = gridFrameIds(project, first.grid);
  if (!ids.length) return null;
  const sel = new Set(selection);
  if (sel.size === ids.length && ids.every((id) => sel.has(id))) return { gridId: first.id, grid: first.grid, mode: 'whole' };
  if (sel.size === 1) return { gridId: first.id, grid: first.grid, mode: 'cell' };
  return null;
}

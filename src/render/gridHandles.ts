/**
 * Pure geometry for the grid divider handles: where a handle sits (canvas px)
 * and how a pointer position maps back to a divider's unit value. Mirrors
 * `layoutCells` (core/gridLayouts): a tiled cell's start edge at unit v is at
 * area + padding + v * (inner + gutter) and its end edge a gutter earlier, so a
 * divider's gutter centre is at area + padding + v * (inner + gutter) - gutter / 2.
 */
import type { Rect } from '../core/geometry';
import { gridFrameRects, moveDivider, type GridDivider } from '../core/gridGroup';
import type { GridGroup } from '../core/types';

/** Gutter-centre position of the divider along its axis, in canvas px. */
export function dividerAxisPx(grid: GridGroup, divider: GridDivider): number {
  const horizontal = divider.axis === 'x';
  const start = horizontal ? grid.area.x : grid.area.y;
  const size = (horizontal ? grid.area.width : grid.area.height) - 2 * grid.padding;
  return start + grid.padding + divider.value * (size + grid.gutter) - grid.gutter / 2;
}

/** Inverse of `dividerAxisPx`: the unit value whose gutter centre is at `px` along `axis`. Unclamped. */
export function dividerValueFromPx(grid: GridGroup, axis: 'x' | 'y', px: number): number {
  const horizontal = axis === 'x';
  const start = horizontal ? grid.area.x : grid.area.y;
  const size = (horizontal ? grid.area.width : grid.area.height) - 2 * grid.padding;
  return (px - start - grid.padding + grid.gutter / 2) / (size + grid.gutter);
}

/**
 * Centre of a divider's handle in canvas px: the gutter centre along the
 * divider's axis, the middle of the divider's span along the other. Null if
 * the grid cannot be laid out.
 */
export function dividerHandlePoint(grid: GridGroup, divider: GridDivider): { x: number; y: number } | null {
  let rects: Rect[];
  try {
    rects = gridFrameRects(grid);
  } catch {
    return null;
  }
  const horizontal = divider.axis === 'x';
  const along = dividerAxisPx(grid, divider);
  let lo = Infinity;
  let hi = -Infinity;
  for (const { index } of divider.cells) {
    const r = rects[index];
    if (!r) continue;
    lo = Math.min(lo, horizontal ? r.y : r.x);
    hi = Math.max(hi, horizontal ? r.y + r.height : r.x + r.width);
  }
  if (!Number.isFinite(lo)) return null;
  const mid = (lo + hi) / 2;
  return horizontal ? { x: along, y: mid } : { x: mid, y: along };
}

export interface DividerDrag {
  /** The grid with the divider moved (same object when nothing changed). */
  grid: GridGroup;
  /** New pixel rect of every cell the divider touches, by cell index. */
  rects: Map<number, Rect>;
  /** Where the handle ends up (clamped), canvas px. */
  handle: { x: number; y: number } | null;
}

/**
 * Drag a divider so its gutter centre follows `px` (canvas px along the axis).
 * `divider` must come from `gridDividers(base)`; the value is clamped by
 * `moveDivider`. Returns null if the result cannot be laid out.
 */
export function dragDivider(base: GridGroup, divider: GridDivider, px: number): DividerDrag | null {
  const grid = moveDivider(base, divider, dividerValueFromPx(base, divider.axis, px));
  let all: Rect[];
  try {
    all = gridFrameRects(grid);
  } catch {
    return null;
  }
  const rects = new Map<number, Rect>();
  for (const { index } of divider.cells) {
    const r = all[index];
    if (r) rects.set(index, r);
  }
  const handle = dividerHandlePoint(grid, { ...divider, value: valueOf(grid, divider) });
  return { grid, rects, handle };
}

function valueOf(grid: GridGroup, divider: GridDivider): number {
  const first = divider.cells[0]!;
  const box = grid.cells[first.index]!.box;
  const a = divider.axis === 'x' ? 0 : 1;
  return first.side === 'end' ? box[a + 2]! : box[a]!;
}

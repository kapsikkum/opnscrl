/**
 * Grid layout helper: fills an area of the canvas with a rows x cols grid of
 * empty frame layers. Pure; the result is an ordinary batch of `addLayer`
 * ops, so it undoes/redoes through History like everything else.
 */
import { neutralAdjust } from './adjust';
import { batch, type CommandResult, type Op } from './commands';
import { canvasSize, slideRects, type Rect } from './geometry';
import { createId } from './id';
import type { FrameLayer, Layer, Project } from './types';

export interface GridArgs {
  rows: number;
  cols: number;
  /** Space between cells in px. */
  gutter: number;
  /** Space between the area edge and the outer cells in px. */
  padding: number;
  /**
   * Where the grid goes: the whole panorama, one slide by index, or an
   * explicit rectangle in panorama pixels.
   */
  area: 'canvas' | { slide: number } | Rect;
  /** Corner radius of the generated frames (default 16). */
  cornerRadius?: number;
  /** Supply ids for deterministic output (tests); otherwise random. */
  ids?: readonly string[];
}

export function gridArea(project: Project, area: GridArgs['area']): Rect {
  if (area === 'canvas') {
    const { width, height } = canvasSize(project.canvas);
    return { x: 0, y: 0, width, height };
  }
  if ('slide' in area) {
    const r = slideRects(project.canvas)[area.slide];
    if (!r) throw new RangeError(`No slide ${area.slide}`);
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return area;
}

/** Cell rectangles, row-major. Edges are rounded to whole pixels without drifting or leaving gaps. */
export function gridCells(area: Rect, args: Pick<GridArgs, 'rows' | 'cols' | 'gutter' | 'padding'>): Rect[] {
  const { rows, cols, gutter, padding } = args;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new RangeError('rows and cols must be integers >= 1');
  }
  if (gutter < 0 || padding < 0) throw new RangeError('gutter and padding must be >= 0');
  const innerW = area.width - 2 * padding - gutter * (cols - 1);
  const innerH = area.height - 2 * padding - gutter * (rows - 1);
  if (innerW <= 0 || innerH <= 0) throw new RangeError('Grid does not fit: padding and gutter leave no room for cells');
  const cw = innerW / cols;
  const ch = innerH / rows;
  const cells: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round(area.x + padding + c * (cw + gutter));
      const x1 = Math.round(area.x + padding + c * (cw + gutter) + cw);
      const y0 = Math.round(area.y + padding + r * (ch + gutter));
      const y1 = Math.round(area.y + padding + r * (ch + gutter) + ch);
      cells.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
  }
  return cells;
}

/** The frame layers a grid would create (not yet added to the project). */
export function gridLayers(project: Project, args: GridArgs): FrameLayer[] {
  const cells = gridCells(gridArea(project, args.area), args);
  if (args.ids && args.ids.length < cells.length) throw new RangeError('Not enough ids supplied');
  return cells.map((cell, i) => {
    const row = Math.floor(i / args.cols) + 1;
    const col = (i % args.cols) + 1;
    return {
      id: args.ids?.[i] ?? createId('lyr'),
      type: 'frame',
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      name: `Frame r${row}c${col}`,
      props: {
        cornerRadius: args.cornerRadius ?? 16,
        assetId: null,
        fit: 'cover',
        placeholderLabel: 'Drop photo',
        border: null,
        shadow: null,
        adjust: neutralAdjust(),
        preset: null,
      },
    } satisfies FrameLayer;
  });
}

/** The ops that add the grid (one addLayer per cell). Dispatch `{ op: 'batch', ops }` for a single undo step. */
export function gridOps(project: Project, args: GridArgs): Op[] {
  return gridLayers(project, args).map((layer): Op => ({ op: 'addLayer', layer: layer as Layer }));
}

/** Command: add a rows x cols grid of frames to the project. */
export function applyGrid(project: Project, args: GridArgs): CommandResult {
  return batch(project, gridOps(project, args));
}

/**
 * Grid layout helper: fills an area of the canvas with a rows x cols grid of
 * empty frame layers. Pure; the result is an ordinary batch of `addLayer`
 * ops, so it undoes/redoes through History like everything else.
 */
import { neutralAdjust } from './adjust';
import { batch, type CommandResult, type Op } from './commands';
import { gridFrameRects } from './gridGroup';
import { canvasSize, slideRects, type Rect } from './geometry';
import { createId } from './id';
import { getGridLayout, layoutCells, uniformCells } from './gridLayouts';
import type { FrameLayer, GridGroup, Layer, LayerPatch, Project } from './types';

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
  /**
   * A named layout from core/gridLayouts (its cells replace rows x cols).
   * `rows`/`cols` are ignored when this is set.
   */
  layout?: string;
  /** Corner radius of the generated frames (default 0). */
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
/** Cell rectangles for the grid args: a named layout or an even rows x cols grid. */
export function gridArgsCells(project: Project, args: GridArgs): Rect[] {
  const area = gridArea(project, args.area);
  if (args.layout) {
    const layout = getGridLayout(args.layout);
    if (!layout) throw new RangeError(`Unknown grid layout "${args.layout}"`);
    return layoutCells(area, layout.cells, args.gutter, args.padding);
  }
  return gridCells(area, args);
}

export function gridLayers(project: Project, args: GridArgs): FrameLayer[] {
  const cells = gridArgsCells(project, args);
  if (args.ids && args.ids.length < cells.length) throw new RangeError('Not enough ids supplied');
  return cells.map((cell, i) => {
    const row = Math.floor(i / Math.max(1, args.cols)) + 1;
    const col = (i % Math.max(1, args.cols)) + 1;
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
      name: args.layout ? `Cell ${i + 1}` : `Frame r${row}c${col}`,
      props: {
        cornerRadius: args.cornerRadius ?? 0,
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

/**
 * The ops that add the grid as loose frames (one addLayer per cell, no grid
 * group; use `createGridOps` for an editable one). Dispatch
 * `{ op: 'batch', ops }` for a single undo step.
 */
export function gridOps(project: Project, args: GridArgs): Op[] {
  return gridLayers(project, args).map((layer): Op => ({ op: 'addLayer', layer: layer as Layer }));
}

/** Command: add a rows x cols grid of frames to the project. */
export function applyGrid(project: Project, args: GridArgs): CommandResult {
  return batch(project, gridOps(project, args));
}

/**
 * Ops that create a grid group: one `addLayer` per cell plus a `setGrid` that
 * records the layout. Frame geometry comes from `gridFrameRects` of the new
 * group, so a later relayout does not move anything. `id` names the group
 * (default: random `grd_...`); `ids` names the frames. Dispatch as one batch.
 */
export function createGridOps(project: Project, args: GridArgs & { id?: string }): Op[] {
  const area = gridArea(project, args.area);
  const layout = args.layout ? getGridLayout(args.layout) : undefined;
  if (args.layout && !layout) throw new RangeError(`Unknown grid layout "${args.layout}"`);
  const cells = layout ? layout.cells : uniformCells(args.rows, args.cols);
  if (!layout) {
    // validate rows/cols/gutter/padding with the same errors as gridLayers
    gridCells(area, args);
  }
  const frames = gridLayers(project, args);
  const grid: GridGroup = {
    area: { x: area.x, y: area.y, width: area.width, height: area.height },
    gutter: args.gutter,
    padding: args.padding,
    cornerRadius: args.cornerRadius ?? 0,
    cells: cells.map((c, i) => ({
      frameId: frames[i]!.id,
      box: [c.box[0], c.box[1], c.box[2], c.box[3]],
      ...(c.inset ? { inset: true } : {}),
    })),
  };
  const rects = gridFrameRects(grid);
  const ops: Op[] = frames.map((f, i): Op => ({ op: 'addLayer', layer: { ...f, ...rects[i]! } as Layer }));
  ops.push({ op: 'setGrid', id: args.id ?? createId('grd'), grid });
  return ops;
}

/**
 * Ops that make `grid` the new state of group `gridId` and move every
 * existing cell frame to match (x, y, size, rotation 0, corner radius). Cells
 * whose frame was deleted are skipped. If frames were moved since the group was
 * last laid out, pass `syncGridArea(project, stored)` as the basis for `grid`
 * so they are not snapped back.
 */
export function relayoutOps(project: Project, gridId: string, grid: GridGroup): Op[] {
  const rects = gridFrameRects(grid);
  const frames = new Set(project.layers.filter((l) => l.type === 'frame').map((l) => l.id));
  const ops: Op[] = [{ op: 'setGrid', id: gridId, grid }];
  grid.cells.forEach((cell, i) => {
    if (!frames.has(cell.frameId)) return;
    const { x, y, width, height } = rects[i]!;
    const patch = { x, y, width, height, rotation: 0, props: { cornerRadius: grid.cornerRadius } } as LayerPatch;
    ops.push({ op: 'updateLayer', id: cell.frameId, patch });
  });
  return ops;
}

/** Dissolve a grid group: the frames stay where they are as ordinary layers. */
export function ungroupOps(_project: Project, gridId: string): Op[] {
  return [{ op: 'setGrid', id: gridId, grid: null }];
}

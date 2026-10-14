/**
 * Named collage layouts (opnscrl's own set). A layout is a list of cells in
 * a unit square: [x0, y0, x1, y1] with 0..1 coordinates. Placing a layout in
 * an area applies `padding` on the area's outer edge and splits `gutter` on
 * every edge where two cells meet, so any layout keeps even spacing.
 * `inset` cells float on top (overlaps, picture-in-picture) and only get
 * the padding treatment of their own box.
 */
import type { Rect } from './geometry';

export interface LayoutCell {
  box: readonly [number, number, number, number];
  inset?: boolean;
}

export interface GridLayout {
  id: string;
  label: string;
  group: 'basic' | 'feature' | 'mosaic' | 'panorama';
  cells: readonly LayoutCell[];
}

const c = (x0: number, y0: number, x1: number, y1: number, inset = false): LayoutCell => (inset ? { box: [x0, y0, x1, y1], inset } : { box: [x0, y0, x1, y1] });

/** Even rows x cols grid as layout cells. */
export function uniformCells(rows: number, cols: number): LayoutCell[] {
  const out: LayoutCell[] = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) out.push(c(k / cols, r / rows, (k + 1) / cols, (r + 1) / rows));
  return out;
}

const G = 0.618; // golden split

export const GRID_LAYOUTS: readonly GridLayout[] = [
  // basic
  { id: 'single', label: 'Single', group: 'basic', cells: [c(0, 0, 1, 1)] },
  { id: 'halves-v', label: 'Two columns', group: 'basic', cells: uniformCells(1, 2) },
  { id: 'halves-h', label: 'Two rows', group: 'basic', cells: uniformCells(2, 1) },
  { id: 'thirds-v', label: 'Three columns', group: 'basic', cells: uniformCells(1, 3) },
  { id: 'thirds-h', label: 'Three rows', group: 'basic', cells: uniformCells(3, 1) },
  { id: 'quad', label: '2 x 2', group: 'basic', cells: uniformCells(2, 2) },
  { id: 'six', label: '2 x 3', group: 'basic', cells: uniformCells(3, 2) },
  { id: 'nine', label: '3 x 3', group: 'basic', cells: uniformCells(3, 3) },
  // feature: one large photo with supporting ones
  { id: 'feature-left-2', label: 'Large left, two right', group: 'feature', cells: [c(0, 0, G, 1), c(G, 0, 1, 0.5), c(G, 0.5, 1, 1)] },
  { id: 'feature-right-2', label: 'Large right, two left', group: 'feature', cells: [c(1 - G, 0, 1, 1), c(0, 0, 1 - G, 0.5), c(0, 0.5, 1 - G, 1)] },
  { id: 'feature-top-2', label: 'Large top, two below', group: 'feature', cells: [c(0, 0, 1, G), c(0, G, 0.5, 1), c(0.5, G, 1, 1)] },
  { id: 'feature-bottom-2', label: 'Large bottom, two above', group: 'feature', cells: [c(0, 1 - G, 1, 1), c(0, 0, 0.5, 1 - G), c(0.5, 0, 1, 1 - G)] },
  { id: 'feature-left-3', label: 'Large left, three right', group: 'feature', cells: [c(0, 0, 2 / 3, 1), c(2 / 3, 0, 1, 1 / 3), c(2 / 3, 1 / 3, 1, 2 / 3), c(2 / 3, 2 / 3, 1, 1)] },
  { id: 'feature-top-3', label: 'Large top, three below', group: 'feature', cells: [c(0, 0, 1, 2 / 3), c(0, 2 / 3, 1 / 3, 1), c(1 / 3, 2 / 3, 2 / 3, 1), c(2 / 3, 2 / 3, 1, 1)] },
  { id: 'golden-v', label: 'Golden split', group: 'feature', cells: [c(0, 0, G, 1), c(G, 0, 1, 1)] },
  { id: 'third-h', label: 'One third / two thirds', group: 'feature', cells: [c(0, 0, 1, 1 / 3), c(0, 1 / 3, 1, 1)] },
  { id: 'inset-corner', label: 'Photo with inset', group: 'feature', cells: [c(0, 0, 1, 1), c(0.56, 0.6, 0.94, 0.94, true)] },
  { id: 'inset-pair', label: 'Two overlapping', group: 'feature', cells: [c(0.06, 0.06, 0.7, 0.62, true), c(0.3, 0.38, 0.94, 0.94, true)] },
  // mosaic
  { id: 'mosaic-5', label: 'Two over three', group: 'mosaic', cells: [c(0, 0, 0.5, 0.5), c(0.5, 0, 1, 0.5), c(0, 0.5, 1 / 3, 1), c(1 / 3, 0.5, 2 / 3, 1), c(2 / 3, 0.5, 1, 1)] },
  { id: 'brick', label: 'Brick', group: 'mosaic', cells: [c(0, 0, 0.5, 1 / 3), c(0.5, 0, 1, 1 / 3), c(0, 1 / 3, 1, 2 / 3), c(0, 2 / 3, 0.5, 1), c(0.5, 2 / 3, 1, 1)] },
  { id: 'stairs', label: 'Stairs', group: 'mosaic', cells: [c(0, 0, 0.62, 0.5), c(0.62, 0, 1, 0.5), c(0, 0.5, 0.38, 1), c(0.38, 0.5, 1, 1)] },
  { id: 'pinwheel', label: 'Pinwheel', group: 'mosaic', cells: [c(0, 0, 2 / 3, 1 / 3), c(2 / 3, 0, 1, 2 / 3), c(1 / 3, 2 / 3, 1, 1), c(0, 1 / 3, 1 / 3, 1), c(1 / 3, 1 / 3, 2 / 3, 2 / 3)] },
  { id: 'columns-offset', label: 'Offset columns', group: 'mosaic', cells: [c(0, 0, 1 / 3, 0.6), c(0, 0.6, 1 / 3, 1), c(1 / 3, 0, 2 / 3, 0.4), c(1 / 3, 0.4, 2 / 3, 1), c(2 / 3, 0, 1, 0.6), c(2 / 3, 0.6, 1, 1)] },
  // panorama: best applied to the whole canvas so cells cross the seams
  { id: 'filmstrip', label: 'Film strip', group: 'panorama', cells: [0, 1, 2, 3, 4, 5].map((i) => c(i / 6, 0.18, (i + 1) / 6, 0.82)) },
  { id: 'wave', label: 'Wave', group: 'panorama', cells: [c(0, 0.08, 0.3, 0.62), c(0.24, 0.38, 0.54, 0.92, true), c(0.48, 0.08, 0.78, 0.62, true), c(0.72, 0.38, 1, 0.92, true)] },
  { id: 'hero-span', label: 'Hero across seams', group: 'panorama', cells: [c(0.12, 0.1, 0.88, 0.7), c(0, 0.7, 0.25, 1), c(0.25, 0.7, 0.5, 1), c(0.5, 0.7, 0.75, 1), c(0.75, 0.7, 1, 1)] },
];

const byId = new Map(GRID_LAYOUTS.map((l) => [l.id, l]));
export function getGridLayout(id: string): GridLayout | undefined {
  return byId.get(id);
}

/**
 * Place layout cells in `area`. Outer edges sit `padding` inside the area;
 * edges shared with another cell are pulled back by half the gutter. Edges are
 * rounded to whole pixels. Throws if a cell would collapse.
 */
export function layoutCells(area: Rect, cells: readonly LayoutCell[], gutter: number, padding: number): Rect[] {
  if (gutter < 0 || padding < 0) throw new RangeError('gutter and padding must be >= 0');
  const iw = area.width - 2 * padding;
  const ih = area.height - 2 * padding;
  if (iw <= 0 || ih <= 0) throw new RangeError('Padding leaves no room for cells');
  // Tiled cells: a start edge at v sits at v * (size + gutter) and an end edge
  // at v * (size + gutter) - gutter, so equal fractions give equal cells and
  // every shared edge has exactly one gutter between its neighbours.
  const at = (v: number, size: number, isStart: boolean, inset?: boolean) => (inset ? v * size : v * (size + gutter) - (isStart ? 0 : gutter));
  return cells.map(({ box: [x0, y0, x1, y1], inset }) => {
    const l = Math.round(area.x + padding + at(x0, iw, true, inset));
    const r = Math.round(area.x + padding + at(x1, iw, false, inset));
    const t = Math.round(area.y + padding + at(y0, ih, true, inset));
    const b = Math.round(area.y + padding + at(y1, ih, false, inset));
    if (r - l < 1 || b - t < 1) throw new RangeError('Gutter is too large for this layout');
    return { x: l, y: t, width: r - l, height: b - t };
  });
}

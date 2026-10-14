import { describe, expect, it } from 'vitest';
import { gridArea, gridArgsCells, gridLayers } from '../src/core/grid';
import { GRID_LAYOUTS, getGridLayout, layoutCells } from '../src/core/gridLayouts';
import { createProject } from '../src/core/project';

const area = { x: 0, y: 0, width: 1080, height: 1350 };

describe('grid layouts', () => {
  it('has unique ids, at least 24 layouts, and cells inside the unit square', () => {
    const ids = GRID_LAYOUTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(24);
    for (const l of GRID_LAYOUTS) {
      expect(l.cells.length, l.id).toBeGreaterThan(0);
      for (const { box: [x0, y0, x1, y1] } of l.cells) {
        expect(x0).toBeGreaterThanOrEqual(0);
        expect(y0).toBeGreaterThanOrEqual(0);
        expect(x1).toBeLessThanOrEqual(1);
        expect(y1).toBeLessThanOrEqual(1);
        expect(x1).toBeGreaterThan(x0);
        expect(y1).toBeGreaterThan(y0);
      }
    }
  });

  it('non-inset cells never overlap', () => {
    for (const l of GRID_LAYOUTS) {
      const tiles = l.cells.filter((c) => !c.inset).map((c) => c.box);
      for (let i = 0; i < tiles.length; i++)
        for (let j = i + 1; j < tiles.length; j++) {
          const [a, b] = [tiles[i]!, tiles[j]!];
          const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
          const oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
          expect(ox > 1e-9 && oy > 1e-9, `${l.id} cells ${i}/${j}`).toBe(false);
        }
    }
  });

  it('applies padding on the outside and an even gutter between cells', () => {
    const [big, top, bottom] = layoutCells(area, getGridLayout('feature-left-2')!.cells, 20, 40);
    expect(big!.x).toBe(40);
    expect(big!.y).toBe(40);
    expect(big!.y + big!.height).toBe(1310);
    expect(top!.x - (big!.x + big!.width)).toBe(20);
    expect(bottom!.y - (top!.y + top!.height)).toBe(20);
    expect(top!.x + top!.width).toBe(1040);
  });

  it('matches the uniform grid for basic layouts', () => {
    const p = createProject({ slideCount: 1 });
    const viaLayout = gridArgsCells(p, { rows: 0, cols: 0, gutter: 24, padding: 48, area: { slide: 0 }, layout: 'quad' });
    const viaGrid = gridArgsCells(p, { rows: 2, cols: 2, gutter: 24, padding: 48, area: { slide: 0 } });
    expect(viaLayout).toEqual(viaGrid);
  });

  it('builds frame layers for every layout on a slide and across the canvas', () => {
    const p = createProject({ slideCount: 3 });
    for (const l of GRID_LAYOUTS) {
      for (const where of [{ slide: 1 }, 'canvas' as const]) {
        const layers = gridLayers(p, { rows: 1, cols: 1, gutter: 16, padding: 32, area: where, layout: l.id });
        expect(layers).toHaveLength(l.cells.length);
        const a = gridArea(p, where);
        for (const f of layers) {
          expect(f.type).toBe('frame');
          expect(f.x).toBeGreaterThanOrEqual(a.x);
          expect(f.x + f.width).toBeLessThanOrEqual(a.x + a.width);
        }
      }
    }
  });

  it('rejects unknown layouts and oversized gutters', () => {
    const p = createProject({ slideCount: 1 });
    expect(() => gridArgsCells(p, { rows: 1, cols: 1, gutter: 0, padding: 0, area: 'canvas', layout: 'nope' })).toThrow(/Unknown/);
    expect(() => layoutCells({ x: 0, y: 0, width: 30, height: 30 }, getGridLayout('nine')!.cells, 20, 0)).toThrow(/Gutter/);
  });
});

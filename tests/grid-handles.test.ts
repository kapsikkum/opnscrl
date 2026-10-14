import { describe, expect, it } from 'vitest';
import { applyOp, type Op } from '../src/core/commands';
import { createGridOps, relayoutOps } from '../src/core/grid';
import { getGridLayout } from '../src/core/gridLayouts';
import {
  gridDividers,
  gridFrameIds,
  gridFrameRects,
  gridFromBounds,
  selectionGridState,
} from '../src/core/gridGroup';
import { createProject } from '../src/core/project';
import type { Project } from '../src/core/types';
import { dividerAxisPx, dividerHandlePoint, dividerValueFromPx, dragDivider } from '../src/render/gridHandles';

const run = (p: Project, ops: Op[]) => applyOp(p, { op: 'batch', ops }).project;

function make(layout = 'quad', gutter = 20, padding = 40): Project {
  const p = createProject({ id: 'p', slideCount: 2, aspect: '4:5', now: 1 });
  const n = getGridLayout(layout)!.cells.length;
  const ids = Array.from({ length: n }, (_, i) => `f${i}`);
  return run(p, createGridOps(p, { rows: 0, cols: 0, gutter, padding, area: { slide: 0 }, layout, ids, id: 'g1' }));
}

describe('divider px mapping', () => {
  it('round-trips unit value and canvas px', () => {
    const grid = make('quad', 24, 60).grids.g1!;
    for (const d of gridDividers(grid)) {
      const px = dividerAxisPx(grid, d);
      expect(dividerValueFromPx(grid, d.axis, px)).toBeCloseTo(d.value, 9);
    }
  });

  it('puts the handle in the middle of the gutter between the neighbouring frames', () => {
    const grid = make('quad', 20, 40).grids.g1!;
    const rects = gridFrameRects(grid);
    const dividers = gridDividers(grid);
    const dx = dividers.find((d) => d.axis === 'x')!;
    const pt = dividerHandlePoint(grid, dx)!;
    const end = rects[dx.cells.find((c) => c.side === 'end')!.index]!;
    const start = rects[dx.cells.find((c) => c.side === 'start')!.index]!;
    expect(pt.x).toBeCloseTo((end.x + end.width + start.x) / 2, 6);
    expect(pt.y).toBeCloseTo(grid.area.y + grid.area.height / 2, 6);
    const dy = dividers.find((d) => d.axis === 'y')!;
    const py = dividerHandlePoint(grid, dy)!;
    const top = rects[dy.cells.find((c) => c.side === 'end')!.index]!;
    const bottom = rects[dy.cells.find((c) => c.side === 'start')!.index]!;
    expect(py.y).toBeCloseTo((top.y + top.height + bottom.y) / 2, 6);
  });
});

describe('dragDivider', () => {
  it('moves the neighbouring cells and keeps the gutter', () => {
    const grid = make('quad', 20, 40).grids.g1!;
    const dx = gridDividers(grid).find((d) => d.axis === 'x')!;
    const px = dividerAxisPx(grid, dx) + 100;
    const drag = dragDivider(grid, dx, px)!;
    expect(drag.grid).not.toBe(grid);
    const all = gridFrameRects(drag.grid);
    const end = all[dx.cells.find((c) => c.side === 'end')!.index]!;
    const start = all[dx.cells.find((c) => c.side === 'start')!.index]!;
    expect(start.x - (end.x + end.width)).toBe(20);
    expect(drag.handle!.x).toBeCloseTo(px, 0);
    expect([...drag.rects.keys()].sort()).toEqual(dx.cells.map((c) => c.index).sort());
  });

  it('clamps so cells keep a minimum size, and is a no-op at the current position', () => {
    const grid = make('quad').grids.g1!;
    const dx = gridDividers(grid).find((d) => d.axis === 'x')!;
    const drag = dragDivider(grid, dx, -5000)!;
    expect(drag.grid.cells.every((c) => c.box[2] - c.box[0] >= 0.04 - 1e-9)).toBe(true);
    expect(dragDivider(grid, dx, dividerAxisPx(grid, dx))!.grid).toBe(grid);
  });
});

describe('selectionGridState', () => {
  const p = make('quad');
  it('recognises the whole grid in any order', () => {
    expect(selectionGridState(p, ['f3', 'f0', 'f2', 'f1'])).toMatchObject({ gridId: 'g1', mode: 'whole' });
  });
  it('recognises a single cell', () => {
    expect(selectionGridState(p, ['f2'])).toMatchObject({ gridId: 'g1', mode: 'cell' });
  });
  it('is null for partial multi-selection, empty and non-grid selections', () => {
    expect(selectionGridState(p, ['f0', 'f1'])).toBeNull();
    expect(selectionGridState(p, [])).toBeNull();
    expect(selectionGridState(p, ['nope'])).toBeNull();
  });
  it('ignores deleted cells and treats a lone survivor as whole', () => {
    const q = run(p, [{ op: 'removeLayer', id: 'f1' }]);
    expect(gridFrameIds(q, q.grids.g1!)).toEqual(['f0', 'f2', 'f3']);
    expect(selectionGridState(q, ['f0', 'f2', 'f3'])).toMatchObject({ mode: 'whole' });
    expect(selectionGridState(q, ['f0'])).toMatchObject({ mode: 'cell' });
    const r = run(q, [
      { op: 'removeLayer', id: 'f0' },
      { op: 'removeLayer', id: 'f2' },
    ]);
    expect(selectionGridState(r, ['f3'])).toMatchObject({ mode: 'whole' });
    const none = run(r, [{ op: 'removeLayer', id: 'f3' }]);
    expect(selectionGridState(none, ['f3'])).toBeNull();
  });
});

describe('whole-grid transform relayout (host recipe)', () => {
  it('scales the grid area with the frames and keeps gutters', () => {
    const p = make('quad', 20, 40);
    const ids = ['f0', 'f1', 'f2', 'f3'];
    // a whole-grid resize as the transformer reports it: frame boxes scaled about the origin
    const moved = run(
      p,
      ids.map((id): Op => {
        const f = p.layers.find((l) => l.id === id)!;
        return { op: 'updateLayer', id, patch: { x: f.x * 1.1, y: f.y * 1.1, width: f.width * 1.1, height: f.height * 1.1 } };
      }),
    );
    const next = gridFromBounds(moved, moved.grids.g1!);
    expect(next.area.width).toBeCloseTo(p.grids.g1!.area.width * 1.1, 3);
    const done = run(moved, relayoutOps(moved, 'g1', next));
    expect(done.grids.g1!.gutter).toBe(20);
    const rects = gridFrameRects(done.grids.g1!);
    ids.forEach((id, i) => {
      const f = done.layers.find((l) => l.id === id)!;
      expect([f.x, f.y, f.width, f.height]).toEqual([rects[i]!.x, rects[i]!.y, rects[i]!.width, rects[i]!.height]);
    });
  });
});

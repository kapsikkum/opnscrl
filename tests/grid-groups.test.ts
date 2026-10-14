import { describe, expect, it } from 'vitest';
import { applyOp, type Op } from '../src/core/commands';
import { canvasSize } from '../src/core/geometry';
import {
  createGridOps,
  gridDividers,
  gridFrameRects,
  gridFromBounds,
  gridOfFrame,
  moveDivider,
  relayoutOps,
  syncGridArea,
  ungroupOps,
} from '../src/core';
import { getGridLayout } from '../src/core/gridLayouts';
import { migrateDocument } from '../src/core/migrations';
import { createProject } from '../src/core/project';
import { SCHEMA_VERSION } from '../src/core/schema';
import { parseProject, serializeProject } from '../src/core/serialize';
import { insertSlideOps, moveSlideOps, removeSlideOps } from '../src/core/slides';
import type { GridGroup, Project } from '../src/core/types';
import {
  decodeShareLink,
  decodeTemplateFile,
  encodeShareLink,
  encodeTemplateFile,
  projectToTemplate,
  templateToProject,
} from '../src/templates';

const run = (p: Project, ops: Op[]) => applyOp(p, { op: 'batch', ops });

function layoutGrid(layout: string): GridGroup {
  return {
    area: { x: 0, y: 0, width: 1080, height: 1350 },
    gutter: 20,
    padding: 40,
    cornerRadius: 8,
    cells: getGridLayout(layout)!.cells.map((c, i) => ({
      frameId: `f${i}`,
      box: [...c.box] as [number, number, number, number],
      ...(c.inset ? { inset: true } : {}),
    })),
  };
}

function withGrid(slideCount = 3, layout = 'quad', area: 'canvas' | { slide: number } = { slide: 1 }) {
  const p = createProject({ id: 'p', slideCount, aspect: '4:5', now: 1 });
  const ids = Array.from({ length: getGridLayout(layout)!.cells.length }, (_, i) => `f${i}`);
  const ops = createGridOps(p, { rows: 0, cols: 0, gutter: 20, padding: 40, area, layout, cornerRadius: 8, ids, id: 'g1' });
  return run(p, ops).project;
}

const frame = (p: Project, id: string) => p.layers.find((l) => l.id === id)!;

describe('migration v4 -> v5', () => {
  it('adds an empty grids map', () => {
    const v4 = {
      id: 'p',
      name: 'v4',
      schemaVersion: 4,
      canvas: { slideCount: 1, aspect: '1:1', customHeightPx: 1350, slideWidthPx: 1080, background: { kind: 'solid', color: '#fff' } },
      layers: [],
      assets: {},
      createdAt: 1,
      updatedAt: 1,
    };
    const p = parseProject(migrateDocument(v4));
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.grids).toEqual({});
    expect(parseProject(JSON.stringify(v4)).grids).toEqual({});
  });

  it('createProject has grids', () => {
    expect(createProject().grids).toEqual({});
  });
});

describe('createGridOps', () => {
  it('adds frames plus a grid record that matches them exactly', () => {
    const p = withGrid();
    const grid = p.grids.g1!;
    expect(p.layers.filter((l) => l.type === 'frame')).toHaveLength(4);
    expect(grid.cells.map((c) => c.frameId)).toEqual(['f0', 'f1', 'f2', 'f3']);
    expect(grid.area).toEqual({ x: 1080, y: 0, width: 1080, height: 1350 });
    const rects = gridFrameRects(grid);
    grid.cells.forEach((c, i) => {
      const f = frame(p, c.frameId);
      expect(f).toMatchObject(rects[i]!);
      expect(f.type === 'frame' && f.props.cornerRadius).toBe(8);
    });
    expect(gridOfFrame(p, 'f2')).toEqual({ id: 'g1', grid });
    expect(gridOfFrame(p, 'nope')).toBeNull();
  });

  it('supports custom rows x cols and undoes in one step', () => {
    const p0 = createProject({ slideCount: 1 });
    const r = applyOp(p0, {
      op: 'batch',
      ops: createGridOps(p0, { rows: 2, cols: 3, gutter: 10, padding: 10, area: 'canvas', id: 'g' }),
    });
    expect(r.project.grids.g!.cells).toHaveLength(6);
    expect(Object.keys(r.project.grids)).toEqual(['g']);
    expect(applyOp(r.project, r.inverse).project).toEqual(p0);
  });

  it('defaults to a generated grd_ id and validates', () => {
    const p0 = createProject({ slideCount: 1 });
    const p = run(p0, createGridOps(p0, { rows: 1, cols: 2, gutter: 0, padding: 0, area: 'canvas' })).project;
    expect(Object.keys(p.grids)[0]).toMatch(/^grd_/);
    expect(parseProject(serializeProject(p))).toEqual(p);
    expect(() => createGridOps(p0, { rows: 1, cols: 1, gutter: 0, padding: 0, area: 'canvas', layout: 'nope' })).toThrow(/Unknown/);
  });

  it('ungroupOps keeps the frames', () => {
    const p = withGrid();
    const r = run(p, ungroupOps(p, 'g1'));
    expect(r.project.grids).toEqual({});
    expect(r.project.layers).toEqual(p.layers);
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });
});

describe('gridDividers', () => {
  const cellsAt = (d: { cells: { index: number; side: string }[] }) => d.cells.map((c) => `${c.index}${c.side[0]}`);

  it('quad has one divider per axis spanning everything', () => {
    const d = gridDividers(layoutGrid('quad'));
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ axis: 'x', value: 0.5, from: 0, to: 1 });
    expect(cellsAt(d[0]!)).toEqual(['0e', '1s', '2e', '3s']);
    expect(d[1]).toMatchObject({ axis: 'y', value: 0.5, from: 0, to: 1 });
  });

  it('brick splits x = 0.5 into a top and a bottom divider', () => {
    const d = gridDividers(layoutGrid('brick'));
    const xs = d.filter((v) => v.axis === 'x');
    expect(xs).toHaveLength(2);
    expect(xs[0]).toMatchObject({ value: 0.5, from: 0 });
    expect(xs[0]!.to).toBeCloseTo(1 / 3);
    expect(cellsAt(xs[0]!)).toEqual(['0e', '1s']);
    expect(xs[1]!.from).toBeCloseTo(2 / 3);
    expect(xs[1]).toMatchObject({ value: 0.5, to: 1 });
    expect(cellsAt(xs[1]!)).toEqual(['3e', '4s']);
    expect(d.filter((v) => v.axis === 'y')).toHaveLength(2); // y = 1/3 and y = 2/3 span the full width
  });

  it('feature-left-2 has a full-height x divider and a partial y divider', () => {
    const d = gridDividers(layoutGrid('feature-left-2'));
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ axis: 'x', from: 0, to: 1 });
    expect(cellsAt(d[0]!)).toEqual(['0e', '1s', '2s']);
    expect(d[1]).toMatchObject({ axis: 'y', value: 0.5 });
    expect(d[1]!.from).toBeCloseTo(0.618);
    expect(d[1]!.to).toBe(1);
    expect(cellsAt(d[1]!)).toEqual(['1e', '2s']);
  });

  it('ignores inset cells and one-sided edges', () => {
    expect(gridDividers(layoutGrid('inset-corner'))).toEqual([]);
    expect(gridDividers(layoutGrid('inset-pair'))).toEqual([]);
    expect(gridDividers(layoutGrid('single'))).toEqual([]);
    // filmstrip: its y edges (0.18 / 0.82) have no cell on the other side
    const film = gridDividers(layoutGrid('filmstrip'));
    expect(film.every((d) => d.axis === 'x')).toBe(true);
    expect(film).toHaveLength(5);
  });
});

describe('moveDivider', () => {
  it('moves only the divider cells', () => {
    const g = layoutGrid('feature-left-2');
    const x = gridDividers(g)[0]!;
    const moved = moveDivider(g, x, 0.4);
    expect(moved.cells.map((c) => [c.box[0], c.box[2]])).toEqual([
      [0, 0.4],
      [0.4, 1],
      [0.4, 1],
    ]);
    expect(g.cells[0]!.box[2]).toBeCloseTo(0.618); // input untouched
    const [a, b] = gridFrameRects(moved);
    expect(b!.x - (a!.x + a!.width)).toBe(20);
  });

  it('only changes its own run in brick', () => {
    const g = layoutGrid('brick');
    const top = gridDividers(g).find((d) => d.axis === 'x' && d.from === 0)!;
    const moved = moveDivider(g, top, 0.3);
    expect(moved.cells[0]!.box[2]).toBe(0.3);
    expect(moved.cells[1]!.box[0]).toBe(0.3);
    expect(moved.cells[3]).toBe(g.cells[3]);
    expect(moved.cells[4]).toBe(g.cells[4]);
  });

  it('clamps to the minimum size and returns the same grid when unchanged', () => {
    const g = layoutGrid('quad');
    const x = gridDividers(g)[0]!;
    expect(moveDivider(g, x, -5).cells[0]!.box[2]).toBeCloseTo(0.04);
    expect(moveDivider(g, x, 5).cells[1]!.box[0]).toBeCloseTo(0.96);
    expect(moveDivider(g, x, 0.5)).toBe(g);
    expect(moveDivider(g, x, 0.5000000001)).toBe(g);
    expect(moveDivider(g, x, 0.9, 0.2).cells[1]!.box[0]).toBeCloseTo(0.8);
  });

  it('moves the frames through relayoutOps and undoes exactly', () => {
    const p = withGrid();
    const g = p.grids.g1!;
    const moved = moveDivider(g, gridDividers(g)[0]!, 0.3);
    const r = run(p, relayoutOps(p, 'g1', moved));
    expect(r.project.grids.g1).toEqual(moved);
    const f0 = frame(r.project, 'f0');
    const f1 = frame(r.project, 'f1');
    expect(f1.x).toBeGreaterThan(f0.x + f0.width);
    expect(f0.width).toBeLessThan(500);
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });
});

describe('relayoutOps', () => {
  it('applies gutter, padding and corner radius, resets rotation, skips deleted frames', () => {
    let p = withGrid();
    p = applyOp(p, { op: 'updateLayer', id: 'f1', patch: { rotation: 12 } }).project;
    p = applyOp(p, { op: 'removeLayer', id: 'f3' }).project;
    const next: GridGroup = { ...p.grids.g1!, gutter: 60, padding: 0, cornerRadius: 30 };
    const r = run(p, relayoutOps(p, 'g1', next));
    const rects = gridFrameRects(next);
    for (const i of [0, 1, 2]) {
      const f = frame(r.project, `f${i}`);
      expect(f).toMatchObject({ ...rects[i]!, rotation: 0 });
      expect(f.type === 'frame' && f.props.cornerRadius).toBe(30);
    }
    expect(r.project.layers.some((l) => l.id === 'f3')).toBe(false);
    expect(r.project.grids.g1!.cells).toHaveLength(4); // dangling cell kept
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });
});

describe('self-healing', () => {
  it('syncGridArea follows translated frames; gridFromBounds also follows scaling', () => {
    const p = withGrid();
    const g = p.grids.g1!;
    expect(syncGridArea(p, g)).toBe(g);
    expect(gridFromBounds(p, g)).toBe(g);

    let moved = p;
    for (const c of g.cells) {
      const f = frame(moved, c.frameId);
      moved = applyOp(moved, { op: 'updateLayer', id: f.id, patch: { x: f.x - 1080 + 7, y: f.y + 13 } }).project;
    }
    expect(syncGridArea(moved, g).area).toEqual({ x: 7, y: 13, width: 1080, height: 1350 });
    expect(gridFromBounds(moved, g).area).toEqual({ x: 7, y: 13, width: 1080, height: 1350 });

    // scale all frames by 1/2 about the origin
    let scaled = p;
    for (const c of g.cells) {
      const f = frame(scaled, c.frameId);
      scaled = applyOp(scaled, {
        op: 'updateLayer',
        id: f.id,
        patch: { x: f.x / 2, y: f.y / 2, width: f.width / 2, height: f.height / 2 },
      }).project;
    }
    const a = gridFromBounds(scaled, g).area;
    expect(a.x).toBeCloseTo(540);
    expect(a.width).toBeCloseTo(540);
    expect(a.height).toBeCloseTo(675);
  });

  it('syncGridArea ignores deleted frames and returns the grid when none exist', () => {
    let p = withGrid();
    const g = p.grids.g1!;
    p = applyOp(p, { op: 'removeLayer', id: 'f0' }).project;
    p = applyOp(p, { op: 'updateLayer', id: 'f1', patch: { x: frame(p, 'f1').x + 100 } }).project;
    expect(syncGridArea(p, g).area.x).toBe(1180);
    for (const id of ['f1', 'f2', 'f3']) p = applyOp(p, { op: 'removeLayer', id }).project;
    expect(syncGridArea(p, g)).toBe(g);
  });
});

describe('setCanvas', () => {
  it('keeps the grid filling the slide when the aspect changes, and undo restores everything', () => {
    const p = withGrid(2, 'feature-left-2', 'canvas');
    const r = applyOp(p, { op: 'setCanvas', patch: { aspect: '9:16' }, fitBackgrounds: true, fitLayers: true });
    const { width, height } = canvasSize(r.project.canvas);
    const grid = r.project.grids.g1!;
    expect(grid.area).toEqual({ x: 0, y: 0, width, height });
    const rects = gridFrameRects(grid);
    grid.cells.forEach((c, i) => expect(frame(r.project, c.frameId)).toMatchObject(rects[i]!));
    const frames = r.project.layers.filter((l) => l.type === 'frame');
    expect(Math.max(...frames.map((f) => f.y + f.height))).toBe(height - 40);
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });

  it('scales from the frames when they were moved without touching the record', () => {
    let p = withGrid(2, 'quad', { slide: 1 });
    for (const id of ['f0', 'f1', 'f2', 'f3']) {
      p = applyOp(p, { op: 'updateLayer', id, patch: { x: frame(p, id).x - 1080 } }).project; // dragged to slide 0
    }
    const r = applyOp(p, { op: 'setCanvas', patch: { aspect: '1:1' }, fitLayers: true });
    expect(r.project.grids.g1!.area).toEqual({ x: 0, y: 0, width: 1080, height: 1080 });
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });

  it('plain canvas changes do not touch grids', () => {
    const p = withGrid();
    const r = applyOp(p, { op: 'setCanvas', patch: { slideCount: 5 } });
    expect(r.project.grids).toBe(p.grids);
  });
});

describe('slides', () => {
  it('inserting a slide shifts the grid area, and a relayout keeps position', () => {
    const p = withGrid(3, 'quad', { slide: 1 });
    const ins = applyOp(p, insertSlideOps(p, 0)!);
    const g = ins.project.grids.g1!;
    expect(g.area.x).toBe(2160);
    expect(frame(ins.project, 'f0').x).toBe(2160 + 40);
    const re = run(ins.project, relayoutOps(ins.project, 'g1', { ...g, gutter: 40 })).project;
    expect(frame(re, 'f0').x).toBe(2160 + 40);
    expect(applyOp(ins.project, ins.inverse).project).toEqual(p);
  });

  it('a manual shift (no explicit grid update) self-heals through syncGridArea', () => {
    const p = withGrid(3, 'quad', { slide: 1 });
    let q = p;
    for (const id of ['f0', 'f1', 'f2', 'f3']) q = applyOp(q, { op: 'updateLayer', id, patch: { x: frame(q, id).x + 1080 } }).project;
    const healed = syncGridArea(q, q.grids.g1!);
    const re = run(q, relayoutOps(q, 'g1', { ...healed, gutter: 40 })).project;
    expect(frame(re, 'f0').x).toBe(2160 + 40);
  });

  it('removing and reordering slides moves or drops grids', () => {
    const p = withGrid(3, 'quad', { slide: 1 });
    const rm0 = applyOp(p, removeSlideOps(p, 0)!);
    expect(rm0.project.grids.g1!.area.x).toBe(0);
    expect(frame(rm0.project, 'f0').x).toBe(40);
    expect(applyOp(rm0.project, rm0.inverse).project).toEqual(p);

    const rm1 = applyOp(p, removeSlideOps(p, 1)!);
    expect(rm1.project.layers.filter((l) => l.type === 'frame')).toHaveLength(0);
    expect(rm1.project.grids).toEqual({});
    expect(applyOp(rm1.project, rm1.inverse).project).toEqual(p);

    const mv = applyOp(p, moveSlideOps(p, 1, 1)!);
    expect(mv.project.grids.g1!.area.x).toBe(2160);
    expect(applyOp(mv.project, mv.inverse).project).toEqual(p);
  });

  it('removing a frame leaves the record alone, and duplicates are free frames', () => {
    const p = withGrid();
    const rm = applyOp(p, { op: 'removeLayer', id: 'f0' }).project;
    expect(rm.grids.g1).toBe(p.grids.g1);
    const dup = applyOp(p, { op: 'duplicate', id: 'f0', newId: 'copy' }).project;
    expect(dup.grids.g1).toBe(p.grids.g1);
    expect(gridOfFrame(dup, 'copy')).toBeNull();
  });
});

describe('serialization and templates', () => {
  it('validates grids', () => {
    const p = withGrid();
    expect(parseProject(serializeProject(p)).grids).toEqual(p.grids);
    const bad = JSON.parse(serializeProject(p));
    bad.grids.g1.cells[0].box = [0, 0, 2, 1];
    expect(() => parseProject(bad)).toThrow(/grids/);
    bad.grids.g1.cells[0].box = [0, 0, 1, 1];
    bad.grids.g1.gutter = -1;
    expect(() => parseProject(bad)).toThrow();
  });

  it('allows dangling frame ids', () => {
    const p = applyOp(withGrid(), { op: 'removeLayer', id: 'f0' }).project;
    expect(parseProject(serializeProject(p)).grids.g1!.cells[0]!.frameId).toBe('f0');
  });

  it('round-trips through template file and share link, remapping ids consistently', () => {
    const p = withGrid();
    const t = projectToTemplate(p, { id: 'tpl_x', now: 1 });
    expect(t.grids).toEqual(p.grids);
    expect(decodeTemplateFile(encodeTemplateFile(t))).toEqual(t);
    expect(decodeShareLink(encodeShareLink(t, 'https://x.test/').url)).toEqual(t);

    const inst = templateToProject(t, { now: 2 });
    const ids = new Set(inst.layers.map((l) => l.id));
    const entries = Object.entries(inst.grids);
    expect(entries).toHaveLength(1);
    const [gid, g] = entries[0]!;
    expect(gid).not.toBe('g1');
    expect(gid).toMatch(/^grd_/);
    expect(g.cells).toHaveLength(4);
    for (const c of g.cells) {
      expect(ids.has(c.frameId)).toBe(true);
      expect(['f0', 'f1', 'f2', 'f3']).not.toContain(c.frameId);
    }
    expect(new Set(g.cells.map((c) => c.frameId)).size).toBe(4);
    expect({ ...g, cells: g.cells.map((c) => ({ ...c, frameId: '' })) }).toEqual({
      ...p.grids.g1!,
      cells: p.grids.g1!.cells.map((c) => ({ ...c, frameId: '' })),
    });
    // the instantiated grid still lines up with its frames
    expect(syncGridArea(inst, g)).toBe(g);
    // and survives another template round trip
    const t2 = projectToTemplate(inst, { id: 'tpl_y', now: 1 });
    expect(decodeTemplateFile(encodeTemplateFile(t2))).toEqual(t2);
  });

  it('a template without grids (older v5 document) still loads', () => {
    const t = projectToTemplate(withGrid(), { id: 'tpl_z', now: 1 });
    const { grids: _g, ...raw } = t;
    expect(decodeTemplateFile(JSON.stringify(raw)).grids).toEqual({});
  });
});

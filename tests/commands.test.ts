import { describe, expect, it } from 'vitest';
import {
  addAsset,
  addLayer,
  applyOp,
  batch,
  duplicate,
  removeLayer,
  reorder,
  setCanvas,
  updateLayer,
  type Op,
} from '../src/core/commands';
import { canvasSize } from '../src/core/geometry';
import type { Layer } from '../src/core/types';
import { rectLayer, sampleProject } from './helpers';

const ids = (p: { layers: { id: string }[] }) => p.layers.map((l) => l.id);

describe('commands', () => {
  it('addLayer appends / inserts and inverts', () => {
    const p = sampleProject(['a', 'b']);
    const r = addLayer(p, rectLayer('c'));
    expect(ids(r.project)).toEqual(['a', 'b', 'c']);
    const r2 = addLayer(p, rectLayer('c'), 1);
    expect(ids(r2.project)).toEqual(['a', 'c', 'b']);
    expect(applyOp(r2.project, r2.inverse).project).toEqual(p);
    expect(() => addLayer(p, rectLayer('a'))).toThrow(/Duplicate/);
  });

  it('removeLayer restores at the same index', () => {
    const p = sampleProject(['a', 'b', 'c']);
    const r = removeLayer(p, 'b');
    expect(ids(r.project)).toEqual(['a', 'c']);
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
    expect(() => removeLayer(p, 'zzz')).toThrow(/not found/);
  });

  it('updateLayer patches fields and props; inverse restores exactly', () => {
    const p = sampleProject(['a']);
    const r = updateLayer(p, 'a', { x: 50, opacity: 0.5, props: { cornerRadius: 12 } });
    const l = r.project.layers[0]!;
    expect(l).toMatchObject({ x: 50, opacity: 0.5, y: 0 });
    expect((l.props as { cornerRadius: number }).cornerRadius).toBe(12);
    expect((l.props as { kind: string }).kind).toBe('rect');
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
    // input is never mutated
    expect(p.layers[0]!.x).toBe(0);
  });

  it('updateLayer keeps untouched layers referentially equal (cheap diffing)', () => {
    const p = sampleProject(['a', 'b']);
    const r = updateLayer(p, 'a', { x: 5 });
    expect(r.project.layers[1]).toBe(p.layers[1]);
    expect(r.project.layers[0]).not.toBe(p.layers[0]);
  });

  it('reorder moves in z-order and inverts', () => {
    const p = sampleProject(['a', 'b', 'c']);
    const r = reorder(p, 'a', 2);
    expect(ids(r.project)).toEqual(['b', 'c', 'a']);
    expect(ids(applyOp(r.project, r.inverse).project)).toEqual(['a', 'b', 'c']);
    expect(ids(reorder(p, 'c', -5).project)).toEqual(['c', 'a', 'b']);
    expect(ids(reorder(p, 'a', 99).project)).toEqual(['b', 'c', 'a']);
  });

  it('duplicate inserts a copy above the original with an offset', () => {
    const p = sampleProject(['a', 'b']);
    const r = duplicate(p, 'a', 'a2');
    expect(ids(r.project)).toEqual(['a', 'a2', 'b']);
    expect(r.project.layers[1]).toMatchObject({ id: 'a2', x: 40, y: 40 });
    expect(r.project.layers[1]!.props).not.toBe(r.project.layers[0]!.props);
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });

  it('setCanvas keeps layers where they are', () => {
    let p = sampleProject(['a']);
    p = updateLayer(p, 'a', { x: 1500, y: 200 }).project;
    const before = p.layers[0];
    const r = setCanvas(p, { slideCount: 5, aspect: '1:1' });
    expect(r.project.canvas).toMatchObject({ slideCount: 5, aspect: '1:1' });
    expect(r.project.layers[0]).toBe(before);
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });

  it('setCanvas clamps slideCount to 1..20', () => {
    const p = sampleProject();
    expect(setCanvas(p, { slideCount: 99 }).project.canvas.slideCount).toBe(20);
    expect(setCanvas(p, { slideCount: 0 }).project.canvas.slideCount).toBe(1);
  });

  it('setCanvas can resize full-canvas background layers and invert it', () => {
    let p = sampleProject();
    const { width, height } = canvasSize(p.canvas);
    const bg = {
      ...rectLayer('bg'),
      type: 'background',
      width,
      height,
      props: { fill: { kind: 'solid', color: '#000' } },
    } as Layer;
    p = addLayer(p, bg).project;
    const r = setCanvas(p, { slideCount: 5 }, true);
    expect(r.project.layers[0]).toMatchObject({ width: 5400, height: 1350 });
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });

  it('assets add/remove invert', () => {
    const p = sampleProject();
    const r = addAsset(p, 'x', { mime: 'image/png', w: 10, h: 10 });
    expect(r.project.assets.x).toBeDefined();
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });

  it('batch applies in order and inverts in reverse', () => {
    const p = sampleProject(['a']);
    const ops: Op[] = [
      { op: 'addLayer', layer: rectLayer('b') },
      { op: 'updateLayer', id: 'b', patch: { x: 9 } },
      { op: 'removeLayer', id: 'a' },
    ];
    const r = batch(p, ops);
    expect(ids(r.project)).toEqual(['b']);
    expect(r.project.layers[0]!.x).toBe(9);
    expect(applyOp(r.project, r.inverse).project).toEqual(p);
  });
});

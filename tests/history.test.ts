import { describe, expect, it } from 'vitest';
import { History, type HistoryOptions } from '../src/core/history';
import { rectLayer, sampleProject } from './helpers';

function setup(opts: HistoryOptions = {}) {
  let t = 1000;
  const clock = { advance: (ms: number) => (t += ms) };
  const h = new History(sampleProject(['a']), { now: () => t, ...opts });
  return { h, clock };
}

describe('History', () => {
  it('do / undo / redo', () => {
    const { h } = setup();
    expect(h.canUndo).toBe(false);
    h.do({ op: 'addLayer', layer: rectLayer('b') });
    expect(h.project.layers.map((l) => l.id)).toEqual(['a', 'b']);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
    h.undo();
    expect(h.project.layers.map((l) => l.id)).toEqual(['a']);
    expect(h.canRedo).toBe(true);
    h.redo();
    expect(h.project.layers.map((l) => l.id)).toEqual(['a', 'b']);
    expect(h.canRedo).toBe(false);
  });

  it('a new op clears the redo stack', () => {
    const { h } = setup();
    h.do({ op: 'addLayer', layer: rectLayer('b') });
    h.undo();
    h.do({ op: 'addLayer', layer: rectLayer('c') });
    expect(h.canRedo).toBe(false);
    expect(h.project.layers.map((l) => l.id)).toEqual(['a', 'c']);
  });

  it('undo/redo are no-ops on empty stacks', () => {
    const { h } = setup();
    const p = h.project;
    expect(h.undo()).toBe(p);
    expect(h.redo()).toBe(p);
  });

  it('a failing op leaves state and history untouched', () => {
    const { h } = setup();
    expect(() => h.do({ op: 'removeLayer', id: 'nope' })).toThrow();
    expect(h.canUndo).toBe(false);
    expect(h.project.layers).toHaveLength(1);
  });

  it('coalesces consecutive ops with the same key into one undo step', () => {
    const { h, clock } = setup();
    for (let i = 1; i <= 5; i++) {
      h.do({ op: 'updateLayer', id: 'a', patch: { x: i * 10 } }, { coalesceKey: 'drag:a' });
      clock.advance(50);
    }
    expect(h.project.layers[0]!.x).toBe(50);
    expect(h.undoCount).toBe(1);
    h.undo();
    expect(h.project.layers[0]!.x).toBe(0); // back to the pre-drag value
    expect(h.canUndo).toBe(false);
    h.redo();
    expect(h.project.layers[0]!.x).toBe(50);
  });

  it('does not coalesce different keys, no key, or after the window expires', () => {
    const { h, clock } = setup({ coalesceMs: 500 });
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 1 } }, { coalesceKey: 'k1' });
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 2 } }, { coalesceKey: 'k2' });
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 3 } });
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 4 } }, { coalesceKey: 'k2' });
    expect(h.undoCount).toBe(4);
    clock.advance(600);
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 5 } }, { coalesceKey: 'k2' });
    expect(h.undoCount).toBe(5);
  });

  it('does not coalesce across an undo or breakCoalescing()', () => {
    const { h } = setup();
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 1 } }, { coalesceKey: 'k' });
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 2 } }, { coalesceKey: 'k' });
    expect(h.undoCount).toBe(1);
    h.breakCoalescing();
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 3 } }, { coalesceKey: 'k' });
    expect(h.undoCount).toBe(2);
    h.undo();
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 9 } }, { coalesceKey: 'k' });
    expect(h.undoCount).toBe(2);
  });

  it('coalesces non-update ops via batch and still undoes exactly', () => {
    const { h } = setup();
    const start = h.project;
    h.do({ op: 'addLayer', layer: rectLayer('b') }, { coalesceKey: 'k' });
    h.do({ op: 'updateLayer', id: 'b', patch: { x: 5 } }, { coalesceKey: 'k' });
    expect(h.undoCount).toBe(1);
    h.undo();
    expect(h.project.layers).toEqual(start.layers);
  });

  it('respects the undo limit and notifies subscribers', () => {
    const { h } = setup({ limit: 3 });
    let calls = 0;
    const off = h.subscribe(() => calls++);
    for (let i = 0; i < 6; i++) h.do({ op: 'updateLayer', id: 'a', patch: { x: i } });
    expect(h.undoCount).toBe(3);
    h.undo();
    expect(calls).toBe(7);
    off();
    h.undo();
    expect(calls).toBe(7);
  });

  it('stamps updatedAt from the injected clock', () => {
    const { h, clock } = setup();
    clock.advance(500);
    h.do({ op: 'updateLayer', id: 'a', patch: { x: 1 } });
    expect(h.project.updatedAt).toBe(1500);
  });
});

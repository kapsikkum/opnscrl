import { describe, expect, it } from 'vitest';
import { frameAtPoint, pickFillTargets } from '../src/app/actions';
import type { Layer } from '../src/core/types';
import { rectLayer } from './helpers';

const frame = (id: string, x: number, assetId?: string): Layer =>
  rectLayer(id, { type: 'frame', x, props: { assetId } } as Partial<Layer>);

describe('pickFillTargets', () => {
  const layers = [frame('a', 0), frame('b', 200), frame('c', 400, 'filled')];
  it('no selection -> free-floating (no targets)', () => {
    expect(pickFillTargets(layers, new Set())).toEqual([]);
  });
  it('non-frame selection -> no targets', () => {
    expect(pickFillTargets([...layers, rectLayer('s')], new Set(['s']))).toEqual([]);
  });
  it('selected empty frame first, then other empties; filled frames skipped', () => {
    expect(pickFillTargets(layers, new Set(['b'])).map((l) => l.id)).toEqual(['b', 'a']);
  });
  it('selected filled frame -> no targets', () => {
    expect(pickFillTargets(layers, new Set(['c']))).toEqual([]);
  });
});

describe('dropping photos onto a frame', () => {
  const layers = [frame('a', 0), frame('b', 200), frame('c', 400, 'filled')];
  it('the frame under the drop takes the first photo, even if it is filled', () => {
    expect(pickFillTargets(layers, new Set(), 'c').map((l) => l.id)).toEqual(['c', 'a', 'b']);
    expect(pickFillTargets(layers, new Set(['a']), 'b').map((l) => l.id)).toEqual(['b', 'a']);
  });
  it('a drop id that is not a frame falls back to the selection rules', () => {
    expect(pickFillTargets([...layers, rectLayer('s')], new Set(), 's')).toEqual([]);
  });
  it('finds the topmost frame under a point, rotation aware', () => {
    const f = (id: string, x: number, rotation = 0) => rectLayer(id, { type: 'frame', x, y: 0, width: 100, height: 100, rotation } as Partial<Layer>);
    const stack = [f('under', 0), f('over', 50)];
    expect(frameAtPoint(stack, { x: 75, y: 50 })?.id).toBe('over');
    expect(frameAtPoint(stack, { x: 25, y: 50 })?.id).toBe('under');
    expect(frameAtPoint(stack, { x: 500, y: 50 })).toBeNull();
    // rotated 90deg about its top-left: occupies x -100..0
    expect(frameAtPoint([f('r', 0, 90)], { x: -50, y: 50 })?.id).toBe('r');
    expect(frameAtPoint([{ ...f('h', 0), hidden: true }], { x: 50, y: 50 })).toBeNull();
  });
});

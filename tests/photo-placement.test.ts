import { describe, expect, it } from 'vitest';
import { pickFillTargets } from '../src/app/actions';
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

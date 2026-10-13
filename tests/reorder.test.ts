import { describe, expect, it } from 'vitest';
import { History } from '../src/core/history';
import { gapAt, reorderTarget } from '../src/core/reorder';
import { sampleProject } from './helpers';

describe('reorderTarget', () => {
  // 4 layers, model [a b c d] (back..front); displayed rows: d c b a
  it('returns null when dropped in place', () => {
    expect(reorderTarget(4, 3, 0)).toBeNull(); // d, gap before itself
    expect(reorderTarget(4, 3, 1)).toBeNull(); // d, gap after itself
    expect(reorderTarget(4, 0, 3)).toBeNull();
    expect(reorderTarget(4, 0, 4)).toBeNull();
  });
  it('moves to the front / back', () => {
    expect(reorderTarget(4, 0, 0)).toBe(3); // a to the top row
    expect(reorderTarget(4, 3, 4)).toBe(0); // d to the bottom row
  });
  it('moves within the list', () => {
    expect(reorderTarget(4, 1, 0)).toBe(3); // b to front
    expect(reorderTarget(4, 2, 3)).toBe(1); // c: before row 3 (a) -> index 1
    expect(reorderTarget(4, 1, 1)).toBe(2); // b just above c... gap 1 is before row 1 (c)
  });
  it('applies through History as one undo step', () => {
    const h = new History(sampleProject(['a', 'b', 'c', 'd']));
    const to = reorderTarget(4, 0, 0)!;
    h.do({ op: 'reorder', id: 'a', toIndex: to });
    expect(h.project.layers.map((l) => l.id)).toEqual(['b', 'c', 'd', 'a']);
    h.undo();
    expect(h.project.layers.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('ignores degenerate input', () => {
    expect(reorderTarget(1, 0, 0)).toBeNull();
    expect(reorderTarget(3, 5, 0)).toBeNull();
  });
});

describe('gapAt', () => {
  it('counts midpoints above the pointer', () => {
    const mids = [10, 30, 50];
    expect(gapAt(0, mids)).toBe(0);
    expect(gapAt(20, mids)).toBe(1);
    expect(gapAt(100, mids)).toBe(3);
  });
});

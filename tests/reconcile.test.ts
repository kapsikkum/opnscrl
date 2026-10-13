import Konva from 'konva';
import { describe, expect, it } from 'vitest';
import { updateLayer } from '../src/core/commands';
import { createLayer } from '../src/layers/registry';
import { Reconciler } from '../src/render/reconcile';
import { createEditor } from '../src/state/editor';
import { sampleProject } from './helpers';

const ctx = { mode: 'edit' as const, resolveAsset: () => Promise.reject(new Error('none')), track: () => {} };

function setup() {
  const parent = new Konva.Group();
  const rec = new Reconciler(parent, ctx);
  return { parent, rec };
}

describe('Reconciler', () => {
  it('creates nodes keyed by layer id in z-order', () => {
    const { parent, rec } = setup();
    const a = createLayer('shape', { id: 'a' });
    const b = createLayer('shape', { id: 'b' });
    expect(rec.sync([a, b])).toBe(true);
    expect(parent.getChildren().map((n) => n.id())).toEqual(['a', 'b']);
  });

  it('reuses nodes on update and skips unchanged layers', () => {
    const { parent, rec } = setup();
    const a = createLayer('shape', { id: 'a', x: 10 });
    const b = createLayer('shape', { id: 'b' });
    rec.sync([a, b]);
    const nodeA = rec.getNode('a')!;
    const nodeB = rec.getNode('b')!;
    const a2 = { ...a, x: 99 };
    expect(rec.sync([a2, b])).toBe(false); // no structural change
    expect(rec.getNode('a')).toBe(nodeA);
    expect(rec.getNode('b')).toBe(nodeB);
    expect(nodeA.x()).toBe(99);
    expect(parent.getChildren()).toHaveLength(2);
  });

  it('removes nodes for deleted layers and follows reordering', () => {
    const { parent, rec } = setup();
    const [a, b, c] = ['a', 'b', 'c'].map((id) => createLayer('shape', { id }));
    rec.sync([a!, b!, c!]);
    rec.sync([c!, a!]);
    expect(parent.getChildren().map((n) => n.id())).toEqual(['c', 'a']);
    expect(rec.getNode('b')).toBeUndefined();
  });

  it('applies hidden/opacity/rotation from the model and resets scale', () => {
    const { rec } = setup();
    const a = createLayer('shape', { id: 'a' });
    rec.sync([a]);
    const node = rec.getNode('a')!;
    node.scale({ x: 3, y: 3 }); // as left behind by a Transformer
    rec.sync([{ ...a, hidden: true, opacity: 0.4, rotation: 30 }]);
    expect(node.visible()).toBe(false);
    expect(node.opacity()).toBe(0.4);
    expect(node.rotation()).toBe(30);
    expect(node.scaleX()).toBe(1);
  });

  it('forceIds re-applies a layer even when its object is unchanged', () => {
    const { rec } = setup();
    const a = createLayer('shape', { id: 'a', x: 5 });
    rec.sync([a]);
    const node = rec.getNode('a')!;
    node.x(500);
    rec.sync([a]);
    expect(node.x()).toBe(500);
    rec.sync([a], new Set(['a']));
    expect(node.x()).toBe(5);
  });

  it('swaps the node when a layer is replaced by a different type under the same id', () => {
    const { rec } = setup();
    const s = createLayer('shape', { id: 'a' });
    rec.sync([s]);
    const before = rec.getNode('a');
    rec.sync([createLayer('background', { id: 'a' })]);
    expect(rec.getNode('a')).not.toBe(before);
  });

  it('changes the underlying shape when the shape kind changes', () => {
    const { rec } = setup();
    const s = createLayer('shape', { id: 'a' });
    rec.sync([s]);
    const group = rec.getNode('a')!;
    expect(group.findOne('.opnscrl-shape')?.className).toBe('Rect');
    rec.sync([{ ...s, props: { ...s.props, kind: 'ellipse' } }]);
    expect(group.findOne('.opnscrl-shape')?.className).toBe('Ellipse');
  });
});

describe('editor store', () => {
  it('tracks project, undo availability and prunes stale selection', () => {
    const ed = createEditor(sampleProject(['a', 'b']));
    ed.select(['a', 'b']);
    expect(ed.selectedLayers.value.map((l) => l.id)).toEqual(['a', 'b']);
    ed.dispatch({ op: 'removeLayer', id: 'b' });
    expect(ed.selection.value).toEqual(['a']);
    expect(ed.canUndo.value).toBe(true);
    ed.undo();
    expect(ed.project.value.layers).toHaveLength(2);
    expect(ed.canRedo.value).toBe(true);
    ed.redo();
    expect(ed.project.value.layers).toHaveLength(1);
    // referential identity of the project signal follows the history
    expect(ed.project.value).toBe(ed.history.project);
    expect(updateLayer(ed.project.value, 'a', { x: 1 }).project.layers[0]!.x).toBe(1);
  });
});

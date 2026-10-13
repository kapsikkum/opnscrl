import { describe, expect, it } from 'vitest';
import { History } from '../src/core/history';
import {
  canvasSize,
  layerBounds,
  resolveCornerRadii,
  slideHeightPx,
  slicePlan,
} from '../src/core/geometry';
import { applyGrid, gridCells, gridLayers, gridOps } from '../src/core/grid';
import { createProject } from '../src/core/project';
import { ASPECTS, layerSchema, MAX_CUSTOM_HEIGHT, MIN_CUSTOM_HEIGHT } from '../src/core/schema';
import { parseProject, serializeProject } from '../src/core/serialize';
import { insertSlideOps, layersOnSlide, layerSlideIndex, moveSlideOps, removeSlideOps } from '../src/core/slides';
import { applyOp } from '../src/core/commands';
import { createLayer } from '../src/layers/registry';
import { rectLayer, sampleProject } from './helpers';

describe('aspects', () => {
  const base = { slideWidthPx: 1080, slideCount: 2 };
  it('computes slide heights for the new ratios', () => {
    expect(slideHeightPx({ ...base, aspect: '16:9' })).toBe(608); // 607.5 rounds up
    expect(slideHeightPx({ ...base, aspect: '2:3' })).toBe(1620);
    expect(slideHeightPx({ ...base, aspect: '4:3' })).toBe(810);
    expect(slideHeightPx({ ...base, aspect: '1.91:1' })).toBe(565);
  });

  it('custom aspect uses customHeightPx', () => {
    expect(slideHeightPx({ ...base, aspect: 'custom', customHeightPx: 700 })).toBe(700);
    expect(canvasSize({ ...base, aspect: 'custom', customHeightPx: 700 })).toEqual({ width: 2160, height: 700 });
    expect(slicePlan({ ...base, aspect: 'custom', customHeightPx: 700 })[1]!.outHeight).toBe(700);
  });

  it('every aspect yields a project the schema accepts, and custom height is range-checked', () => {
    for (const aspect of ASPECTS) {
      const p = createProject({ aspect, customHeightPx: 900 });
      expect(() => serializeProject(p)).not.toThrow();
      const h = slideHeightPx(p.canvas);
      expect(h).toBeGreaterThanOrEqual(MIN_CUSTOM_HEIGHT);
      expect(h).toBeLessThanOrEqual(1920);
    }
    const p = createProject({ aspect: 'custom' });
    expect(() => parseProject({ ...p, canvas: { ...p.canvas, customHeightPx: MIN_CUSTOM_HEIGHT - 1 } })).toThrow();
    expect(() => parseProject({ ...p, canvas: { ...p.canvas, customHeightPx: MAX_CUSTOM_HEIGHT + 1 } })).toThrow();
    expect(() => parseProject({ ...p, canvas: { ...p.canvas, customHeightPx: MIN_CUSTOM_HEIGHT } })).not.toThrow();
  });
});

describe('line layer', () => {
  it('has valid defaults and round-trips', () => {
    const l = createLayer('line', { props: { endCap: 'arrow', dash: 'dashed' } });
    expect(layerSchema.safeParse(l).success).toBe(true);
    const p = { ...sampleProject(), layers: [l] };
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it('rejects unknown dash styles and caps', () => {
    const l = createLayer('line');
    expect(layerSchema.safeParse({ ...l, props: { ...l.props, dash: 'wavy' } }).success).toBe(false);
    expect(layerSchema.safeParse({ ...l, props: { ...l.props, startCap: 'star' } }).success).toBe(false);
    expect(layerSchema.safeParse({ ...l, props: { ...l.props, end: { x: 1 } } }).success).toBe(false);
  });
});

describe('corner radius, border, shadow', () => {
  it('accepts numbers and 4-tuples, rejects other shapes and negatives', () => {
    const f = createLayer('frame');
    const ok = (cornerRadius: unknown) => layerSchema.safeParse({ ...f, props: { ...f.props, cornerRadius } }).success;
    expect(ok(12)).toBe(true);
    expect(ok([1, 2, 3, 4])).toBe(true);
    expect(ok([1, 2, 3])).toBe(false);
    expect(ok(-1)).toBe(false);
    expect(ok('8')).toBe(false);
  });

  it('image and frame accept border and shadow; opacity is bounded', () => {
    const img = createLayer('image', {
      props: {
        border: { width: 8, color: '#fff' },
        shadow: { color: '#000', blur: 20, offsetX: 0, offsetY: 8, opacity: 0.4 },
        cornerRadius: [0, 24, 0, 24],
      },
    });
    expect(layerSchema.safeParse(img).success).toBe(true);
    const bad = { ...img, props: { ...img.props, shadow: { ...img.props.shadow!, opacity: 2 } } };
    expect(layerSchema.safeParse(bad).success).toBe(false);
  });

  it('resolveCornerRadii clamps like CSS', () => {
    expect(resolveCornerRadii(10, 100, 100)).toEqual([10, 10, 10, 10]);
    expect(resolveCornerRadii([1, 2, 3, 4], 100, 100)).toEqual([1, 2, 3, 4]);
    // 60 + 60 > 100 wide: scale all by 100/120
    const r = resolveCornerRadii(60, 100, 400);
    expect(r[0]).toBeCloseTo(50);
    expect(resolveCornerRadii(500, 100, 40)).toEqual([20, 20, 20, 20]);
    expect(resolveCornerRadii(-5, 10, 10)).toEqual([0, 0, 0, 0]);
  });
});

describe('applyGrid', () => {
  const project = () => createProject({ slideCount: 2, aspect: '4:5', id: 'g', now: 1 }); // 2160 x 1350

  it('lays out cells with gutter and padding, row-major', () => {
    const cells = gridCells({ x: 0, y: 0, width: 1000, height: 600 }, { rows: 2, cols: 2, gutter: 20, padding: 40 });
    expect(cells).toEqual([
      { x: 40, y: 40, width: 450, height: 250 },
      { x: 510, y: 40, width: 450, height: 250 },
      { x: 40, y: 310, width: 450, height: 250 },
      { x: 510, y: 310, width: 450, height: 250 },
    ]);
  });

  it('has no gaps or overlaps beyond the gutter even with fractional cell sizes', () => {
    const cells = gridCells({ x: 0, y: 0, width: 1000, height: 1000 }, { rows: 1, cols: 3, gutter: 0, padding: 0 });
    expect(cells[0]!.x).toBe(0);
    for (let i = 1; i < 3; i++) expect(cells[i]!.x).toBe(cells[i - 1]!.x + cells[i - 1]!.width);
    expect(cells[2]!.x + cells[2]!.width).toBe(1000);
  });

  it('creates frame layers on the chosen slide', () => {
    const p = project();
    const layers = gridLayers(p, { rows: 1, cols: 2, gutter: 0, padding: 0, area: { slide: 1 }, ids: ['a', 'b'] });
    expect(layers.map((l) => l.id)).toEqual(['a', 'b']);
    expect(layers[0]).toMatchObject({ type: 'frame', x: 1080, y: 0, width: 540, height: 1350 });
    expect(layers[1]).toMatchObject({ x: 1620, width: 540 });
    expect(layers.every((l) => layerSchema.safeParse(l).success)).toBe(true);
  });

  it('accepts canvas and rect areas', () => {
    const p = project();
    const all = gridLayers(p, { rows: 1, cols: 1, gutter: 0, padding: 10, area: 'canvas' });
    expect(all[0]).toMatchObject({ x: 10, y: 10, width: 2140, height: 1330 });
    const rect = gridLayers(p, { rows: 2, cols: 1, gutter: 10, padding: 0, area: { x: 100, y: 200, width: 300, height: 410 } });
    expect(rect.map((l) => [l.y, l.height])).toEqual([[200, 200], [410, 200]]);
  });

  it('applyGrid returns a command result whose inverse removes the cells', () => {
    const p = { ...project(), layers: [rectLayer('keep')] };
    const r = applyGrid(p, { rows: 2, cols: 2, gutter: 10, padding: 10, area: { slide: 0 }, ids: ['1', '2', '3', '4'] });
    expect(r.project.layers.map((l) => l.id)).toEqual(['keep', '1', '2', '3', '4']);
    const back = applyOp(r.project, r.inverse).project;
    expect(back.layers.map((l) => l.id)).toEqual(['keep']);
  });

  it('is undoable as one History step', () => {
    const h = new History(project());
    h.do({ op: 'batch', ops: gridOps(h.project, { rows: 2, cols: 3, gutter: 8, padding: 8, area: 'canvas' }) });
    expect(h.project.layers).toHaveLength(6);
    h.undo();
    expect(h.project.layers).toHaveLength(0);
    h.redo();
    expect(h.project.layers).toHaveLength(6);
  });

  it('rejects impossible grids', () => {
    const p = project();
    expect(() => gridLayers(p, { rows: 0, cols: 1, gutter: 0, padding: 0, area: 'canvas' })).toThrow();
    expect(() => gridLayers(p, { rows: 1, cols: 1.5, gutter: 0, padding: 0, area: 'canvas' })).toThrow();
    expect(() => gridLayers(p, { rows: 1, cols: 1, gutter: 0, padding: 5000, area: 'canvas' })).toThrow(/does not fit/);
    expect(() => gridLayers(p, { rows: 1, cols: 1, gutter: 0, padding: 0, area: { slide: 9 } })).toThrow();
    expect(() => gridLayers(p, { rows: 1, cols: 2, gutter: 0, padding: 0, area: 'canvas', ids: ['only-one'] })).toThrow();
  });
});

describe('slide operations', () => {
  const at = (id: string, x: number) => rectLayer(id, { x, y: 0, width: 100, height: 100 });
  const withLayers = () => {
    const p = createProject({ slideCount: 3, aspect: '1:1', id: 's', now: 1 }); // 3240 x 1080
    const { width, height } = canvasSize(p.canvas);
    const bg = createLayer('background', { id: 'bg', x: 0, y: 0, width, height });
    return { ...p, layers: [bg, at('s0', 100), at('s1', 1200), at('s2', 2300)] };
  };
  const run = (p: ReturnType<typeof withLayers>, op: ReturnType<typeof insertSlideOps>) => applyOp(p, op!).project;

  it('knows which slide a layer is on', () => {
    const p = withLayers();
    expect(p.layers.slice(1).map((l) => layerSlideIndex(l, p))).toEqual([0, 1, 2]);
    expect(layersOnSlide(p, 1).map((l) => l.id)).toEqual(['s1']);
  });

  it('inserts a slide, shifting later layers and resizing the background', () => {
    const p = withLayers();
    const out = run(p, insertSlideOps(p, 1));
    expect(out.canvas.slideCount).toBe(4);
    expect(out.layers.map((l) => [l.id, l.x])).toEqual([['bg', 0], ['s0', 100], ['s1', 2280], ['s2', 3380]]);
    expect(out.layers[0]!.width).toBe(4320);
  });

  it('inserting at the end or start works and respects the slide limit', () => {
    const p = withLayers();
    expect(run(p, insertSlideOps(p, 3)).layers.map((l) => l.x)).toEqual([0, 100, 1200, 2300]);
    expect(run(p, insertSlideOps(p, 0)).layers.map((l) => l.x)).toEqual([0, 1180, 2280, 3380]);
    const full = { ...p, canvas: { ...p.canvas, slideCount: 20 } };
    expect(insertSlideOps(full, 0)).toBeNull();
  });

  it('removes a slide with its layers and pulls later layers left', () => {
    const p = withLayers();
    const out = run(p, removeSlideOps(p, 1));
    expect(out.canvas.slideCount).toBe(2);
    expect(out.layers.map((l) => [l.id, l.x])).toEqual([['bg', 0], ['s0', 100], ['s2', 1220]]);
    expect(out.layers[0]!.width).toBe(2160);
    expect(removeSlideOps({ ...p, canvas: { ...p.canvas, slideCount: 1 } }, 0)).toBeNull();
  });

  it('moves a slide by swapping layers with its neighbour', () => {
    const p = withLayers();
    const out = run(p, moveSlideOps(p, 0, 1));
    expect(out.layers.map((l) => [l.id, l.x])).toEqual([['bg', 0], ['s0', 1180], ['s1', 120], ['s2', 2300]]);
    expect(moveSlideOps(p, 0, -1)).toBeNull();
    expect(moveSlideOps(p, 2, 1)).toBeNull();
  });

  it('every slide operation undoes in one step', () => {
    const p = withLayers();
    const h = new History(p);
    h.do(removeSlideOps(h.project, 0)!);
    h.undo();
    expect(h.project.canvas.slideCount).toBe(3);
    expect(h.project.layers.map((l) => l.x)).toEqual(p.layers.map((l) => l.x));
    h.do(insertSlideOps(h.project, 0)!);
    h.undo();
    expect(layerBounds(h.project.layers[0]!).width).toBe(3240);
  });
});

describe('rename command', () => {
  it('renames, inverts, and coalesces keystrokes into one undo step', () => {
    const h = new History(createProject({ id: 'r', name: 'Old', now: 1 }));
    h.do({ op: 'rename', name: 'N' }, { coalesceKey: 'rename' });
    h.do({ op: 'rename', name: 'Ne' }, { coalesceKey: 'rename' });
    h.do({ op: 'rename', name: 'New' }, { coalesceKey: 'rename' });
    expect(h.project.name).toBe('New');
    expect(h.undoCount).toBe(1);
    h.undo();
    expect(h.project.name).toBe('Old');
    h.redo();
    expect(h.project.name).toBe('New');
  });
});

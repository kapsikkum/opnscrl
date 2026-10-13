import { describe, expect, it } from 'vitest';
import { applyAdjust, effectiveAdjust, isNeutral, neutralAdjust, PRESETS } from '../src/core/adjust';
import { normalizePoints, simplifyPoints, strokesHitByPath, toLocal } from '../src/core/drawing';
import { migrateDocument } from '../src/core/migrations';
import { parseProject } from '../src/core/serialize';
import type { DrawingLayer } from '../src/core/types';
import { createLayer } from '../src/layers';
import { BUILTIN_STICKERS, getBuiltinSticker, stickerSvg } from '../src/layers/sticker/builtin';

const px = (r: number, g: number, b: number, n = 1) => {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) d.set([r, g, b, 255], i * 4);
  return d;
};

describe('photo adjustments', () => {
  it('neutral adjustments leave pixels untouched', () => {
    const d = px(10, 120, 250, 4);
    const before = [...d];
    applyAdjust(d, 2, 2, neutralAdjust());
    expect([...d]).toEqual(before);
    expect(isNeutral(neutralAdjust())).toBe(true);
  });

  it('brightness and exposure lighten, contrast spreads from mid grey', () => {
    const a = { ...neutralAdjust(), brightness: 50 };
    const d = px(100, 100, 100);
    applyAdjust(d, 1, 1, a);
    expect(d[0]).toBeGreaterThan(100);

    const e = px(100, 100, 100);
    applyAdjust(e, 1, 1, { ...neutralAdjust(), exposure: 50 });
    expect(e[0]).toBe(200); // +1 stop

    const c = px(200, 200, 200);
    applyAdjust(c, 1, 1, { ...neutralAdjust(), contrast: 50 });
    expect(c[0]).toBeGreaterThan(200);
  });

  it('saturation -100 makes grey, temperature warms', () => {
    const d = px(200, 50, 50);
    applyAdjust(d, 1, 1, { ...neutralAdjust(), saturation: -100 });
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);

    const w = px(100, 100, 100);
    applyAdjust(w, 1, 1, { ...neutralAdjust(), temperature: 60 });
    expect(w[0]).toBeGreaterThan(w[2]!);
  });

  it('vignette darkens corners more than the center; grain is deterministic', () => {
    const n = 9;
    const d = px(200, 200, 200, n * n);
    applyAdjust(d, n, n, { ...neutralAdjust(), vignette: 100 });
    const at = (x: number, y: number) => d[(y * n + x) * 4]!;
    expect(at(0, 0)).toBeLessThan(at(4, 4));

    const g1 = px(128, 128, 128, 16);
    const g2 = px(128, 128, 128, 16);
    applyAdjust(g1, 4, 4, { ...neutralAdjust(), grain: 80 });
    applyAdjust(g2, 4, 4, { ...neutralAdjust(), grain: 80 });
    expect([...g1]).toEqual([...g2]);
  });

  it('blur averages neighbours', () => {
    const n = 5;
    const d = px(0, 0, 0, n * n);
    d.set([255, 255, 255, 255], (2 * n + 2) * 4);
    applyAdjust(d, n, n, { ...neutralAdjust(), blur: 100 });
    expect(d[(2 * n + 2) * 4]).toBeLessThan(255);
    expect(d[(2 * n + 1) * 4]).toBeGreaterThan(0);
  });

  it('presets fold under the sliders and clamp', () => {
    const mono = PRESETS.find((p) => p.id === 'mono')!;
    const eff = effectiveAdjust({ ...neutralAdjust(), saturation: -50, contrast: 10 }, 'mono');
    expect(eff.saturation).toBe(-100); // -100 + -50 clamps
    expect(eff.contrast).toBe(10 + (mono.adjust.contrast ?? 0));
    expect(effectiveAdjust(neutralAdjust(), 'nope')).toEqual(neutralAdjust());
    // one-sided effects never go negative
    expect(effectiveAdjust({ ...neutralAdjust(), grain: -40 }, null).grain).toBe(0);
  });
});

describe('migration v2 -> v3', () => {
  it('adds neutral adjust + null preset to image and frame layers', () => {
    const v2 = {
      id: 'p',
      name: 'old',
      schemaVersion: 2,
      canvas: { slideCount: 2, aspect: '4:5', customHeightPx: 1350, slideWidthPx: 1080, background: { kind: 'solid', color: '#fff' } },
      layers: [
        { id: 'a', type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, locked: false, hidden: false, name: 'a', props: { assetId: 'x', fit: 'cover', crop: null, cornerRadius: 0, flipX: false, flipY: false, border: null, shadow: null } },
        { id: 'b', type: 'frame', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, locked: false, hidden: false, name: 'b', props: { assetId: null, fit: 'cover', cornerRadius: 0, placeholderLabel: '', border: null, shadow: null } },
      ],
      assets: { x: { mime: 'image/png', w: 1, h: 1 } },
      createdAt: 1,
      updatedAt: 1,
    };
    const p = parseProject(migrateDocument(v2));
    expect(p.schemaVersion).toBe(3);
    for (const l of p.layers) {
      if (l.type !== 'image' && l.type !== 'frame') throw new Error('unexpected');
      expect(l.props.adjust).toEqual(neutralAdjust());
      expect(l.props.preset).toBeNull();
    }
  });
});

describe('drawing helpers', () => {
  const layer = (rotation = 0): DrawingLayer =>
    createLayer('drawing', {
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      rotation,
      props: { strokes: [{ points: [0, 0.5, 1, 0.5], color: '#000', width: 10, opacity: 1 }, { points: [0.5, 0, 0.5, 0.2], color: '#f00', width: 4, opacity: 1 }] },
    });

  it('normalizes canvas points into the (rotated) layer box', () => {
    expect(normalizePoints(layer(), [100, 150, 300, 150])).toEqual([0, 0.5, 1, 0.5]);
    const l = toLocal(layer(90), { x: 100, y: 300 }); // rotated 90deg cw: canvas +y is local +x
    expect(l.x).toBeCloseTo(200);
    expect(l.y).toBeCloseTo(0);
  });

  it('simplifies dense samples but keeps the endpoints', () => {
    const pts = [0, 0, 0.5, 0, 1, 0, 1.5, 0, 10, 0];
    expect(simplifyPoints(pts, 2)).toEqual([0, 0, 10, 0]);
  });

  it('hit-tests strokes along an eraser path', () => {
    // horizontal stroke at canvas y=150 from x=100..300; vertical one near x=200, y 100..120
    expect(strokesHitByPath(layer(), [150, 152], 4)).toEqual([0]);
    expect(strokesHitByPath(layer(), [200, 110], 2)).toEqual([1]);
    expect(strokesHitByPath(layer(), [150, 300], 10)).toEqual([]);
    expect(strokesHitByPath(layer(), [150, 300, 150, 151], 2)).toEqual([0]);
  });
});

describe('built-in stickers', () => {
  it('have unique ids and render to standalone SVG in a tint color', () => {
    const ids = BUILTIN_STICKERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(24);
    const svg = stickerSvg(getBuiltinSticker('heart')!, '#00ff00');
    expect(svg).toContain('#00ff00');
    expect(svg).not.toContain('currentColor');
  });
});

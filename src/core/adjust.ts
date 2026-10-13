/**
 * Photo adjustments: neutral values, named presets, and the per-pixel math.
 * Pure TypeScript (no DOM): the renderer feeds ImageData buffers through
 * `applyAdjust`, tests feed plain arrays.
 */
import { ADJUST_KEYS } from './schema';
import type { Adjust, AdjustKey } from './types';

export function neutralAdjust(): Adjust {
  return Object.fromEntries(ADJUST_KEYS.map((k) => [k, 0])) as Adjust;
}

export interface AdjustPreset {
  id: string;
  label: string;
  adjust: Partial<Adjust>;
}

/** Original looks, each just a combination of the sliders. */
export const PRESETS: readonly AdjustPreset[] = [
  { id: 'warm', label: 'Warm', adjust: { temperature: 35, saturation: 10, highlights: -10, vignette: 15 } },
  { id: 'cool', label: 'Cool', adjust: { temperature: -35, tint: -5, contrast: 8, saturation: -5 } },
  { id: 'punch', label: 'Punch', adjust: { contrast: 30, vibrance: 35, shadows: -10, sharpen: 25 } },
  { id: 'fade', label: 'Fade', adjust: { contrast: -30, shadows: 35, saturation: -20, exposure: 5 } },
  { id: 'mono', label: 'Mono', adjust: { saturation: -100, contrast: 18, grain: 12 } },
  { id: 'film', label: 'Film', adjust: { contrast: -10, temperature: 15, tint: 6, shadows: 20, grain: 30, vignette: 25, saturation: -10 } },
  { id: 'dream', label: 'Dream', adjust: { blur: 8, exposure: 12, highlights: 20, saturation: -15, temperature: 10 } },
  { id: 'noir', label: 'Noir', adjust: { saturation: -100, contrast: 45, shadows: -25, vignette: 45, grain: 18 } },
];

export function getPreset(id: string | null | undefined): AdjustPreset | undefined {
  return id ? PRESETS.find((p) => p.id === id) : undefined;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The preset's values plus the user's sliders, clamped to the slider ranges. */
export function effectiveAdjust(adjust: Adjust, presetId: string | null | undefined): Adjust {
  const preset = getPreset(presetId)?.adjust ?? {};
  const out = {} as Adjust;
  for (const k of ADJUST_KEYS) out[k] = clamp((adjust[k] ?? 0) + (preset[k] ?? 0), -100, 100);
  for (const k of ['sharpen', 'blur', 'grain', 'vignette'] as const) out[k] = Math.max(0, out[k]);
  return out;
}

export function isNeutral(a: Adjust): boolean {
  return ADJUST_KEYS.every((k) => !a[k]);
}

/** Stable cache key for an effective adjustment. */
export function adjustKey(a: Adjust): string {
  return ADJUST_KEYS.map((k) => Math.round(a[k] * 10) / 10).join(',');
}

/** Deterministic per-pixel noise in [-1, 1] so grain is identical in preview and export. */
function noise(i: number): number {
  let x = (i * 374761393) ^ 0x5bd1e995;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return ((x & 0xffff) / 0xffff) * 2 - 1;
}

/** Separable box blur (three passes approximate a gaussian), in place on RGB. */
function boxBlur(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius < 1) return;
  const r = Math.round(radius);
  const tmp = new Float32Array(w * h * 3);
  const pass = (src: Uint8ClampedArray | Float32Array, dst: Uint8ClampedArray | Float32Array, horizontal: boolean, srcStride: number, dstStride: number) => {
    const lines = horizontal ? h : w;
    const len = horizontal ? w : h;
    const win = r * 2 + 1;
    for (let line = 0; line < lines; line++) {
      for (let c = 0; c < 3; c++) {
        const at = (i: number) => {
          const j = clamp(i, 0, len - 1);
          const px = horizontal ? line * w + j : j * w + line;
          return src[px * srcStride + c]!;
        };
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += at(i);
        for (let i = 0; i < len; i++) {
          const px = horizontal ? line * w + i : i * w + line;
          dst[px * dstStride + c] = sum / win;
          sum += at(i + r + 1) - at(i - r);
        }
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(data, tmp, true, 4, 3);
    pass(tmp, data, false, 3, 4);
  }
}

/** 3x3 unsharp mask on RGB, in place. */
function sharpen(data: Uint8ClampedArray, w: number, h: number, amount: number): void {
  if (amount <= 0 || w < 3 || h < 3) return;
  const src = data.slice();
  const a = amount * 1.5;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const lap = 4 * src[i + c]! - src[i - 4 + c]! - src[i + 4 + c]! - src[i - w * 4 + c]! - src[i + w * 4 + c]!;
        data[i + c] = src[i + c]! + lap * a * 0.25;
      }
    }
  }
}

/**
 * Apply an (effective) adjustment to RGBA pixels in place. `w`/`h` describe the
 * buffer. Order: blur, tone/color per pixel, sharpen, then grain + vignette.
 */
export function applyAdjust(data: Uint8ClampedArray, w: number, h: number, a: Adjust): void {
  const short = Math.min(w, h);
  if (a.blur > 0) boxBlur(data, w, h, Math.max(1, (a.blur / 100) * short * 0.02));

  const bright = a.brightness * 0.6; // additive, in 0..255 units
  const expo = Math.pow(2, a.exposure / 50); // +-1 stop at the ends... per 50
  const contrast = 1 + a.contrast / 100; // 0..2
  const sat = 1 + a.saturation / 100; // 0..2
  const vib = a.vibrance / 100;
  const temp = a.temperature * 0.35;
  const tint = a.tint * 0.3;
  const hi = a.highlights / 100;
  const sh = a.shadows / 100;
  const tone = bright !== 0 || expo !== 1 || contrast !== 1 || sat !== 1 || vib !== 0 || temp !== 0 || tint !== 0 || hi !== 0 || sh !== 0;

  if (tone) {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]! * expo + bright;
      let g = data[i + 1]! * expo + bright;
      let b = data[i + 2]! * expo + bright;
      // white balance
      r += temp;
      b -= temp;
      g -= tint;
      r += tint * 0.5;
      b += tint * 0.5;
      // highlights / shadows on luminance-weighted masks
      if (hi !== 0 || sh !== 0) {
        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const lc = clamp(l, 0, 1);
        const d = hi * 60 * lc * lc + sh * 60 * (1 - lc) * (1 - lc);
        r += d;
        g += d;
        b += d;
      }
      // contrast around mid grey
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
      // saturation + vibrance (vibrance boosts muted colors more)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let s = sat;
      if (vib !== 0) {
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const chroma = clamp((mx - mn) / 255, 0, 1);
        s *= 1 + vib * (1 - chroma);
      }
      r = lum + (r - lum) * s;
      g = lum + (g - lum) * s;
      b = lum + (b - lum) * s;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  if (a.sharpen > 0) sharpen(data, w, h, a.sharpen / 100);

  if (a.grain > 0 || a.vignette > 0) {
    const grain = (a.grain / 100) * 40;
    const vig = a.vignette / 100;
    const cx = w / 2;
    const cy = h / 2;
    const maxD = Math.hypot(cx, cy) || 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let k = 1;
        if (vig > 0) {
          const d = Math.hypot(x - cx, y - cy) / maxD;
          k = 1 - vig * 0.75 * Math.pow(clamp((d - 0.35) / 0.65, 0, 1), 1.6);
        }
        const n = grain > 0 ? noise(y * 65537 + x) * grain : 0;
        data[i] = data[i]! * k + n;
        data[i + 1] = data[i + 1]! * k + n;
        data[i + 2] = data[i + 2]! * k + n;
      }
    }
  }
}

export type { Adjust, AdjustKey };

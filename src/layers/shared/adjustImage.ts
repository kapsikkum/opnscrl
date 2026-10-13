/**
 * Renders a photo with an adjustment applied, into a canvas Konva can draw.
 * Edit mode works on a downscaled copy (fast enough to follow a slider);
 * export mode works at full resolution. Results are cached per source image
 * and adjustment, so undo/redo and re-renders are instant.
 */
import { adjustKey, applyAdjust } from '../../core/adjust';
import type { Adjust } from '../../core/types';
import type { ImageSource } from '../types';
import { sourceSize } from './imageSlot';

export const EDIT_MAX_EDGE = 1600;
const PER_SOURCE = 4;

const cache = new WeakMap<ImageSource, Map<string, HTMLCanvasElement>>();

export function adjustCacheKey(adjust: Adjust, maxEdge: number): string {
  return `${maxEdge}|${adjustKey(adjust)}`;
}

export function getCachedAdjusted(src: ImageSource, key: string): HTMLCanvasElement | undefined {
  return cache.get(src)?.get(key);
}

export function renderAdjusted(src: ImageSource, adjust: Adjust, maxEdge: number): HTMLCanvasElement {
  const key = adjustCacheKey(adjust, maxEdge);
  const hit = getCachedAdjusted(src, key);
  if (hit) return hit;
  const { width, height } = sourceSize(src);
  const k = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src as CanvasImageSource, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  applyAdjust(data.data, w, h, adjust);
  g.putImageData(data, 0, 0);

  let m = cache.get(src);
  if (!m) {
    m = new Map();
    cache.set(src, m);
  }
  m.set(key, canvas);
  // keep only the most recent few looks per photo
  while (m.size > PER_SOURCE) m.delete(m.keys().next().value!);
  return canvas;
}

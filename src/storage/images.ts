/** Prepare user photos for storage: decode, read size, and downscale huge originals. */
import type { ImageSource } from '../layers/types';
import { decodeBlob } from './assetResolver';

/** Longest edge kept in storage. Slides are 1080 px wide, so even a 5-slide panorama needs < 5400. */
export const MAX_IMPORT_EDGE = 4096;

export interface PreparedImage {
  blob: Blob;
  mime: string;
  w: number;
  h: number;
  /** The decoded image when the original was kept as is (lets the caller skip a second decode). */
  source?: ImageSource;
}

function sizeOf(src: CanvasImageSource & { width: number; height: number }): { w: number; h: number } {
  const s = src as { naturalWidth?: number; naturalHeight?: number; width: number; height: number };
  return { w: s.naturalWidth || s.width, h: s.naturalHeight || s.height };
}

/**
 * Decode a user-chosen file, apply EXIF orientation (the browser does it when
 * decoding) and downscale to MAX_IMPORT_EDGE if larger. Throws a readable
 * error for undecodable files (e.g. HEIC in browsers without support).
 */
export async function prepareImage(file: Blob, maxEdge = MAX_IMPORT_EDGE): Promise<PreparedImage> {
  let src;
  try {
    src = await decodeBlob(file);
  } catch {
    throw new Error(`This browser can't read that image format (${file.type || 'unknown type'}).`);
  }
  const { w, h } = sizeOf(src as CanvasImageSource & { width: number; height: number });
  if (!w || !h) throw new Error('The image is empty.');
  const mime = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  if (Math.max(w, h) <= maxEdge && /^image\/(png|jpeg|webp|gif|avif)$/.test(mime)) {
    return { blob: file, mime, w, h, source: src };
  }
  // re-encode: too large, or a format we do not want to keep verbatim
  const k = Math.min(1, maxEdge / Math.max(w, h));
  const ow = Math.max(1, Math.round(w * k));
  const oh = Math.max(1, Math.round(h * k));
  const canvas = document.createElement('canvas');
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src as CanvasImageSource, 0, 0, ow, oh);
  if ('close' in src) (src as ImageBitmap).close();
  const keepPng = mime === 'image/png';
  const outMime = keepPng ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, outMime, 0.92));
  if (!blob) throw new Error('Could not re-encode the image.');
  return { blob, mime: outMime, w: ow, h: oh };
}

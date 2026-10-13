/**
 * Sticker actions: place built-in stickers, emoji and uploaded stickers, and
 * manage the "My stickers" library.
 */
import { slideRects } from '../core/geometry';
import type { Op } from '../core/commands';
import type { Project } from '../core/types';
import { createLayer } from '../layers';
import { getBuiltinSticker } from '../layers/sticker/builtin';
import type { Editor } from '../state/editor';
import { addLibrarySticker, prepareImage, type StickerRecord } from '../storage';

const STICKER_MAX_EDGE = 1024;

function placeOnSlide(p: Project, slide: number, aspect: number, frac = 0.34) {
  const rects = slideRects(p.canvas);
  const s = rects[Math.max(0, Math.min(rects.length - 1, slide))]!;
  let w = s.width * frac;
  let h = w / aspect;
  if (h > s.height * 0.5) {
    h = s.height * 0.5;
    w = h * aspect;
  }
  return { x: Math.round(s.x + (s.width - w) / 2), y: Math.round((s.height - h) / 2), width: Math.round(w), height: Math.round(h) };
}

export function addBuiltinSticker(editor: Editor, slide: number, id: string): string | null {
  const st = getBuiltinSticker(id);
  if (!st) return null;
  const layer = createLayer('sticker', {
    name: st.label,
    ...placeOnSlide(editor.project.peek(), slide, st.w / 100),
    // store the color so the inspector shows (and edits) the real tint
    props: { builtinId: id, assetId: null, tint: st.color },
  });
  editor.dispatch({ op: 'addLayer', layer });
  editor.select([layer.id]);
  return layer.id;
}

export function addLibraryStickerLayer(editor: Editor, slide: number, rec: StickerRecord): string {
  const ops: Op[] = [];
  if (!editor.project.peek().assets[rec.assetId]) ops.push({ op: 'addAsset', id: rec.assetId, meta: { mime: rec.mime, w: rec.w, h: rec.h } });
  const layer = createLayer('sticker', {
    name: 'Sticker',
    ...placeOnSlide(editor.project.peek(), slide, rec.w / rec.h),
    props: { builtinId: null, assetId: rec.assetId, tint: null },
  });
  ops.push({ op: 'addLayer', layer });
  editor.dispatch(ops.length === 1 ? ops[0]! : { op: 'batch', ops });
  editor.select([layer.id]);
  return layer.id;
}

/** Emoji are plain text layers in the system emoji font. */
export function addEmoji(editor: Editor, slide: number, emoji: string): string {
  const pos = placeOnSlide(editor.project.peek(), slide, 1, 0.3);
  const layer = createLayer('text', {
    name: `Emoji ${emoji}`,
    x: pos.x,
    y: pos.y,
    width: pos.width,
    props: {
      text: emoji,
      // color emoji glyphs are ~1.4x as wide as the font size; leave room so it never wraps away
      fontSize: Math.round(pos.width / 1.6),
      align: 'center',
      fontWeight: 400,
      lineHeight: 1.05,
      fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
    },
  });
  editor.dispatch({ op: 'addLayer', layer });
  editor.select([layer.id]);
  return layer.id;
}

/** Rasterize an SVG file to a PNG (createImageBitmap cannot decode SVG everywhere). */
async function svgToPng(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that SVG."));
      el.src = url;
    });
    const iw = img.naturalWidth || 512;
    const ih = img.naturalHeight || 512;
    const k = STICKER_MAX_EDGE / Math.max(iw, ih);
    const w = Math.max(1, Math.round(iw * k));
    const h = Math.max(1, Math.round(ih * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error("Couldn't convert that SVG.");
    return { blob, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Save uploaded PNG/SVG/WebP files to the "My stickers" library (transparency kept). */
export async function uploadStickers(files: readonly File[]): Promise<{ added: StickerRecord[]; failed: { name: string; reason: string }[] }> {
  const added: StickerRecord[] = [];
  const failed: { name: string; reason: string }[] = [];
  for (const f of files) {
    try {
      const isSvg = f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);
      if (isSvg) {
        const png = await svgToPng(f);
        added.push(await addLibrarySticker(png.blob, png));
      } else {
        const img = await prepareImage(f, STICKER_MAX_EDGE);
        added.push(await addLibrarySticker(img.blob, img));
      }
    } catch (e) {
      failed.push({ name: f.name, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { added, failed };
}

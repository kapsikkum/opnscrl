export type ImageFormat = 'png' | 'jpeg';

export const extensionFor = (format: ImageFormat): string => (format === 'png' ? 'png' : 'jpg');

/** Filesystem-safe slug; falls back to "carousel". */
export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  return s || 'carousel';
}

/** `my-trip-01.png`, zero-padded to the slide count's width (min 2). */
export function sliceFileName(baseName: string, index: number, total: number, format: ImageFormat): string {
  const pad = Math.max(2, String(total).length);
  return `${slugify(baseName)}-${String(index + 1).padStart(pad, '0')}.${extensionFor(format)}`;
}

/** Build a ZIP containing one file per slice. */
export async function zipSlices(
  blobs: readonly Blob[],
  opts: { baseName: string; format: ImageFormat },
): Promise<Blob> {
  const { default: JSZip } = await import('jszip'); // loaded only when exporting
  const zip = new JSZip();
  blobs.forEach((blob, i) => {
    // STORE: PNG/JPEG are already compressed; deflating again only burns CPU.
    zip.file(sliceFileName(opts.baseName, i, blobs.length, opts.format), blob, { compression: 'STORE' });
  });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Download each slice as its own file (small delay so browsers don't drop multi-downloads). */
export async function downloadSlices(
  blobs: readonly Blob[],
  opts: { baseName: string; format: ImageFormat; delayMs?: number },
): Promise<void> {
  for (let i = 0; i < blobs.length; i++) {
    downloadBlob(blobs[i]!, sliceFileName(opts.baseName, i, blobs.length, opts.format));
    if (i < blobs.length - 1) await new Promise((r) => setTimeout(r, opts.delayMs ?? 250));
  }
}

export async function downloadZip(
  blobs: readonly Blob[],
  opts: { baseName: string; format: ImageFormat },
): Promise<void> {
  downloadBlob(await zipSlices(blobs, opts), `${slugify(opts.baseName)}.zip`);
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

export function canShareFiles(files: File[]): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files })
  );
}

/**
 * Share slices through the OS share sheet (Instagram on mobile shows up
 * there). Returns 'unsupported' when the Web Share API can't take files, so
 * the caller can fall back to download.
 */
export async function shareSlices(
  blobs: readonly Blob[],
  opts: { baseName: string; format: ImageFormat; title?: string; text?: string },
): Promise<ShareResult> {
  const mime = opts.format === 'png' ? 'image/png' : 'image/jpeg';
  const files = blobs.map(
    (b, i) => new File([b], sliceFileName(opts.baseName, i, blobs.length, opts.format), { type: mime }),
  );
  if (!canShareFiles(files)) return 'unsupported';
  try {
    await navigator.share({ files, title: opts.title, text: opts.text });
    return 'shared';
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

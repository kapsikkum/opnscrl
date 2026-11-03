import { slugify } from './index';

/**
 * Bridge to the Tauri shell (Android / iOS). No @tauri-apps/api dependency:
 * the shell injects `window.__TAURI_INTERNALS__`, and the three commands below
 * are the whole native contract. All pure logic takes an injectable `invoke`
 * so it can be tested without a shell.
 */

export type InvokeFn = (cmd: string, args?: unknown, options?: { headers?: Record<string, string> }) => Promise<unknown>;

export type GalleryPermission = 'granted' | 'denied' | 'prompt';
export type GalleryMime = 'image/png' | 'image/jpeg';

export const DEFAULT_ALBUM = 'opnscrl';

/** True inside the Tauri shell, false in a plain browser / installed PWA. */
export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** The shell's invoke, or a function that rejects when there is no shell. */
export function nativeInvoke(): InvokeFn {
  if (isNativeApp()) {
    const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: InvokeFn } }).__TAURI_INTERNALS__;
    return (cmd, args, options) => internals.invoke(cmd, args, options);
  }
  return () => Promise.reject('Not running inside the app');
}

function asPermission(v: unknown): GalleryPermission {
  return v === 'granted' || v === 'prompt' ? v : 'denied';
}

export async function galleryPermissionStatus(invoke: InvokeFn = nativeInvoke()): Promise<GalleryPermission> {
  return asPermission(await invoke('gallery_permission_status'));
}

export async function requestGalleryPermission(invoke: InvokeFn = nativeInvoke()): Promise<GalleryPermission> {
  return asPermission(await invoke('gallery_request_permission'));
}

/** Resolve to true when saving is allowed, asking the user once if needed. */
export async function ensureGalleryPermission(invoke: InvokeFn = nativeInvoke()): Promise<boolean> {
  const status = await galleryPermissionStatus(invoke);
  if (status === 'granted') return true;
  return (await requestGalleryPermission(invoke)) === 'granted';
}

/** Save one image: the raw bytes are the request body, metadata travels in (URI-encoded) headers. */
export async function saveImageToGallery(
  invoke: InvokeFn,
  img: { bytes: Uint8Array; album: string; fileName: string; mime: GalleryMime },
): Promise<void> {
  await invoke('save_image_to_gallery', img.bytes, {
    headers: {
      'x-album': encodeURIComponent(img.album),
      'x-filename': encodeURIComponent(img.fileName),
      'x-mime': img.mime,
    },
  });
}

/** Album (folder) name for a project: the slug, or "opnscrl" when the name is empty. */
export function albumFor(projectName: string): string {
  return projectName.trim() ? slugify(projectName) : DEFAULT_ALBUM;
}

export interface SliceItem {
  blob: Blob;
  fileName: string;
}

export interface GalleryProgress {
  /** Images saved so far. */
  done: number;
  /** Images that failed (and are available for retry). */
  failed: number;
  total: number;
}

export interface FailedItem extends SliceItem {
  error: string;
}

export interface SaveSlicesOptions {
  /** Pulled lazily, one at a time: a slice is rendered only when the previous one is saved. */
  items: AsyncIterable<SliceItem> | Iterable<SliceItem>;
  total: number;
  album?: string;
  invoke?: InvokeFn;
  signal?: AbortSignal;
  onProgress?: (p: GalleryProgress) => void;
}

export type SaveStatus = 'done' | 'cancelled' | 'permission-denied';

export interface SaveResult {
  status: SaveStatus;
  saved: number;
  /** Failed items, blobs kept so only these are resent. */
  failedItems: readonly FailedItem[];
  /** Resend only the failed items (sequentially); progress continues from the current counts. */
  retryFailed(signal?: AbortSignal): Promise<SaveResult>;
}

const mimeOf = (name: string): GalleryMime => (/\.jpe?g$/i.test(name) ? 'image/jpeg' : 'image/png');

const messageOf = (e: unknown): string => (typeof e === 'string' ? e : e instanceof Error ? e.message : 'Save failed');

/**
 * Save slices to the gallery one at a time (concurrency 1: the Blob is released
 * right after its upload, so memory stays at one image). A single failed image
 * never throws; it is recorded and can be resent with `retryFailed()`. Aborting
 * stops before the next image. An iterator that throws (render error) rejects.
 */
export async function saveSlicesToGallery(opts: SaveSlicesOptions): Promise<SaveResult> {
  const invoke = opts.invoke ?? nativeInvoke();
  const album = opts.album || DEFAULT_ALBUM;
  const failedItems: FailedItem[] = [];
  let saved = 0;

  const emit = () => opts.onProgress?.({ done: saved, failed: failedItems.length, total: opts.total });

  const sendOne = async (item: SliceItem): Promise<FailedItem | null> => {
    try {
      const bytes = new Uint8Array(await item.blob.arrayBuffer());
      await saveImageToGallery(invoke, { bytes, album, fileName: item.fileName, mime: mimeOf(item.fileName) });
      saved++;
      return null;
    } catch (e) {
      return { ...item, error: messageOf(e) };
    }
  };

  const result = (status: SaveStatus): SaveResult => ({
    status,
    saved,
    failedItems: [...failedItems],
    retryFailed: async (signal) => {
      const todo = failedItems.splice(0);
      emit();
      let status: SaveStatus = 'done';
      for (const item of todo) {
        if (signal?.aborted) {
          failedItems.push(item);
          status = 'cancelled';
          continue;
        }
        const failed = await sendOne(item);
        if (failed) failedItems.push(failed);
        emit();
      }
      return result(status);
    },
  });

  let allowed = false;
  try {
    allowed = await ensureGalleryPermission(invoke);
  } catch {
    allowed = false;
  }
  if (!allowed) return result('permission-denied');

  emit();
  const iterator = (Symbol.asyncIterator in opts.items ? opts.items[Symbol.asyncIterator]() : opts.items[Symbol.iterator]()) as
    | AsyncIterator<SliceItem>
    | Iterator<SliceItem>;
  let status: SaveStatus = 'done';
  try {
    while (true) {
      if (opts.signal?.aborted) {
        status = 'cancelled';
        break;
      }
      const next = await iterator.next();
      if (next.done) break;
      const failed = await sendOne(next.value);
      if (failed) failedItems.push(failed);
      emit();
    }
  } finally {
    // Stops the generator (and frees its canvases) when we leave early.
    await iterator.return?.();
  }
  return result(status);
}

/** True in the iOS app, where photos are picked with the system Photos picker instead of an <input>. */
export function usesNativePhotoPicker(): boolean {
  if (!isNativeApp() || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

interface PickedImage {
  path: string;
  name: string;
  mime: string;
}

/**
 * Open the native Photos picker (iOS) and return the chosen pictures as File objects, so they go through
 * the same handlers as an <input type=file>. The Swift side writes each one to a temp file (HEIC is turned
 * into JPEG); each is read back through `read_picked_image` one at a time, which also deletes it.
 * Resolves to [] when the user cancels.
 */
export async function pickPhotos(multiple: boolean, invoke: InvokeFn = nativeInvoke()): Promise<File[]> {
  const res = (await invoke('pick_images', { multiple })) as { files?: PickedImage[] } | null;
  const out: File[] = [];
  for (const f of res?.files ?? []) {
    const data = (await invoke('read_picked_image', { path: f.path })) as ArrayBuffer;
    out.push(new File([data], f.name, { type: f.mime }));
  }
  return out;
}

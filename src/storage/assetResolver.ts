import type { AssetResolver, ImageSource } from '../layers/types';
import { getAsset } from './assets';

/** Decode a Blob into something Konva can draw. Prefers ImageBitmap, falls back to <img>. */
export async function decodeBlob(blob: Blob): Promise<ImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through to <img> (e.g. formats createImageBitmap rejects) */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // the decoded <img> keeps its pixels after the URL is revoked
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export interface AssetStoreResolver extends AssetResolver {
  /** Drop a decoded image from the cache (after an asset is deleted or replaced). */
  forget(assetId: string): void;
  /** Make a just-imported asset resolvable immediately without a storage round trip. */
  prime(assetId: string, source: ImageSource): void;
  clear(): void;
}

/**
 * The renderer's `resolveAsset`: loads photo blobs from storage by asset id and
 * keeps decoded images in memory. Failed loads are not cached.
 */
export function createAssetResolver(getBlob: (id: string) => Promise<Blob | undefined> = getAsset): AssetStoreResolver {
  const cache = new Map<string, Promise<ImageSource>>();
  const resolve = ((assetId: string) => {
    let p = cache.get(assetId);
    if (!p) {
      p = (async () => {
        const blob = await getBlob(assetId);
        if (!blob) throw new Error(`Photo not found in storage: ${assetId}`);
        return decodeBlob(blob);
      })();
      cache.set(assetId, p);
      p.catch(() => cache.delete(assetId));
    }
    return p;
  }) as AssetStoreResolver;
  resolve.forget = (id) => {
    cache.delete(id);
  };
  resolve.prime = (id, source) => {
    cache.set(id, Promise.resolve(source));
  };
  resolve.clear = () => cache.clear();
  return resolve;
}

import type { AssetResolver } from '../layers/types';

/** Memoize an AssetResolver per asset id. Failed loads are evicted so they can be retried. */
export function createAssetCache(resolve: AssetResolver): AssetResolver & { clear(): void } {
  const cache = new Map<string, ReturnType<AssetResolver>>();
  const fn = ((assetId: string) => {
    let p = cache.get(assetId);
    if (!p) {
      p = resolve(assetId);
      cache.set(assetId, p);
      p.catch(() => cache.delete(assetId));
    }
    return p;
  }) as AssetResolver & { clear(): void };
  fn.clear = () => cache.clear();
  return fn;
}

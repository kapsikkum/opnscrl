/** The "My stickers" library: uploaded PNG/SVG stickers reusable across projects. */
import { getDb, type StickerRecord } from './db';
import { gcAssets, putAsset } from './assets';

export async function addLibrarySticker(blob: Blob, size: { w: number; h: number }): Promise<StickerRecord> {
  const assetId = await putAsset(blob);
  const rec: StickerRecord = { assetId, mime: blob.type || 'image/png', w: size.w, h: size.h, addedAt: Date.now() };
  const db = await getDb();
  await db.put('stickers', rec);
  return rec;
}

/** Newest first. */
export async function listLibraryStickers(): Promise<StickerRecord[]> {
  const db = await getDb();
  return (await db.getAllFromIndex('stickers', 'addedAt')).reverse();
}

/** Remove from the library; the image bytes go too unless a saved project still uses them. */
export async function removeLibrarySticker(assetId: string): Promise<void> {
  const db = await getDb();
  await db.delete('stickers', assetId);
  await gcAssets([assetId]);
}

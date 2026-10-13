import { createId } from '../core/id';
import { getDb } from './db';

export async function putAsset(blob: Blob, id: string = createId('ast')): Promise<string> {
  const db = await getDb();
  await db.put('assets', blob, id);
  return id;
}

export async function getAsset(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('assets', id);
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('assets', id);
}

export async function listAssetIds(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('assets')) as string[];
}

/** Every asset id a project refers to (its asset table plus any layer reference). */
export function projectAssetIds(project: {
  assets: Record<string, unknown>;
  layers: readonly { type: string; props: unknown }[];
}): Set<string> {
  const ids = new Set(Object.keys(project.assets));
  for (const l of project.layers) {
    if (l.type === 'image' || l.type === 'frame' || l.type === 'sticker') {
      const id = (l.props as { assetId?: string | null }).assetId;
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Delete stored photos that no saved project refers to. With `candidates`, only
 * those ids are considered (used right after deleting a project); without, the
 * whole asset store is swept. Returns the ids that were removed.
 */
export async function gcAssets(candidates?: Iterable<string>): Promise<string[]> {
  const db = await getDb();
  const referenced = new Set<string>();
  for (const p of await db.getAll('projects')) for (const id of projectAssetIds(p)) referenced.add(id);
  // the "My stickers" library keeps its images even when no project uses them
  for (const id of (await db.getAllKeys('stickers')) as string[]) referenced.add(id);
  const pool = candidates ? [...new Set(candidates)] : ((await db.getAllKeys('assets')) as string[]);
  const removed: string[] = [];
  const tx = db.transaction('assets', 'readwrite');
  for (const id of pool) {
    if (!referenced.has(id)) {
      await tx.store.delete(id);
      removed.push(id);
    }
  }
  await tx.done;
  return removed;
}

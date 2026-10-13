/**
 * IndexedDB (via idb). One database, four stores:
 *   projects    key: project.id      value: Project (plain JSON-safe object)
 *   templates   key: template.id     value: Template
 *   assets      key: assetId         value: Blob (the photo bytes)
 *   thumbnails  key: project.id      value: { blob, updatedAt } (scaled export of slide 1)
 */
import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../core/types';
import type { Template } from '../templates/schema';

export interface ThumbnailRecord {
  blob: Blob;
  /** project.updatedAt this thumbnail was rendered from. */
  updatedAt: number;
}

export interface OpnscrlDB extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
  templates: { key: string; value: Template };
  assets: { key: string; value: Blob };
  thumbnails: { key: string; value: ThumbnailRecord };
}

export const DB_NAME = 'opnscrl';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OpnscrlDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<OpnscrlDB>> {
  dbPromise ??= openDB<OpnscrlDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const projects = db.createObjectStore('projects', { keyPath: 'id' });
      projects.createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('templates', { keyPath: 'id' });
      db.createObjectStore('assets');
      db.createObjectStore('thumbnails');
    },
    terminated() {
      dbPromise = null;
    },
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

/** Close the connection and delete the whole database (tests, "reset app data"). */
export async function resetDatabase(): Promise<void> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      /* ignore */
    }
    dbPromise = null;
  }
  await deleteDB(DB_NAME);
}

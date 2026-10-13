import { createId } from '../core/id';
import { parseProject } from '../core/serialize';
import { validateProject } from '../core/serialize';
import type { Aspect, Project } from '../core/types';
import { projectAssetIds, gcAssets } from './assets';
import { getDb, type ThumbnailRecord } from './db';

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  slideCount: number;
  aspect: Aspect;
  layerCount: number;
}

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    slideCount: p.canvas.slideCount,
    aspect: p.canvas.aspect,
    layerCount: p.layers.length,
  };
}

/** Validate and store a project (insert or replace). */
export async function saveProject(project: Project): Promise<void> {
  const valid = validateProject(project);
  const db = await getDb();
  await db.put('projects', valid);
}

/** Load a project by id, applying schema migrations; null if it does not exist. */
export async function loadProject(id: string): Promise<Project | null> {
  const db = await getDb();
  const raw = await db.get('projects', id);
  return raw ? parseProject(raw) : null;
}

/** All projects, most recently edited first. Unreadable records are skipped. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const out: ProjectSummary[] = [];
  for (const raw of await db.getAll('projects')) {
    try {
      out.push(summarize(parseProject(raw)));
    } catch {
      /* corrupt record: ignore rather than break the home screen */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Delete a project, its thumbnail and any photos nothing else uses. */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('projects', id);
  const tx = db.transaction(['projects', 'thumbnails'], 'readwrite');
  await Promise.all([tx.objectStore('projects').delete(id), tx.objectStore('thumbnails').delete(id), tx.done]);
  if (existing) await gcAssets(projectAssetIds(existing));
}

/** Copy a project under a new id (photos are shared, not copied). Returns the copy. */
export async function duplicateProject(id: string, now = Date.now()): Promise<Project | null> {
  const src = await loadProject(id);
  if (!src) return null;
  const copy: Project = { ...src, id: createId('prj'), name: `${src.name} copy`, createdAt: now, updatedAt: now };
  await saveProject(copy);
  return copy;
}

export async function putThumbnail(projectId: string, record: ThumbnailRecord): Promise<void> {
  const db = await getDb();
  await db.put('thumbnails', record, projectId);
}

export async function getThumbnail(projectId: string): Promise<ThumbnailRecord | undefined> {
  const db = await getDb();
  return db.get('thumbnails', projectId);
}

import type { Project } from '../core/types';
import { exportSlides } from '../render';
import { getThumbnail, putThumbnail } from '../storage';
import { ensureProjectFonts } from './fonts';
import { assetResolver } from './services';

const THUMB_WIDTH = 360;

/** Render slide 1 at thumbnail size and cache it in storage, keyed by project.updatedAt. */
export async function renderThumbnail(project: Project): Promise<void> {
  try {
    await ensureProjectFonts(project);
    const [blob] = await exportSlides(project, assetResolver, {
      format: 'jpeg',
      quality: 0.82,
      scale: THUMB_WIDTH / project.canvas.slideWidthPx,
      only: [0],
    });
    if (blob) await putThumbnail(project.id, { blob, updatedAt: project.updatedAt });
  } catch (e) {
    console.warn('thumbnail failed', e);
  }
}

/** Make sure a current thumbnail exists; returns the stored blob if there is one. */
export async function ensureThumbnail(project: Project): Promise<Blob | undefined> {
  const existing = await getThumbnail(project.id);
  if (existing && existing.updatedAt >= project.updatedAt) return existing.blob;
  await renderThumbnail(project);
  return (await getThumbnail(project.id))?.blob ?? existing?.blob;
}

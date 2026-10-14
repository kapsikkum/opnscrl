import { createId } from './id';
import { SCHEMA_VERSION } from './schema';
import { DEFAULT_CUSTOM_HEIGHT } from './geometry';
import type { Aspect, CanvasSettings, Fill, Project } from './types';

export const DEFAULT_SLIDE_WIDTH = 1080;

export const solid = (color: string): Fill => ({ kind: 'solid', color });

export interface CreateProjectOptions {
  id?: string;
  name?: string;
  slideCount?: number;
  aspect?: Aspect;
  customHeightPx?: number;
  slideWidthPx?: number;
  background?: Fill;
  now?: number;
}

export function createProject(opts: CreateProjectOptions = {}): Project {
  const now = opts.now ?? Date.now();
  const canvas: CanvasSettings = {
    slideCount: opts.slideCount ?? 1,
    aspect: opts.aspect ?? '4:5',
    customHeightPx: opts.customHeightPx ?? DEFAULT_CUSTOM_HEIGHT,
    slideWidthPx: opts.slideWidthPx ?? DEFAULT_SLIDE_WIDTH,
    background: opts.background ?? solid('#ffffff'),
  };
  return {
    id: opts.id ?? createId('prj'),
    name: opts.name ?? 'Untitled carousel',
    schemaVersion: SCHEMA_VERSION,
    canvas,
    layers: [],
    assets: {},
    grids: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Where templates come from. The UI only talks to `TemplateSource`s, so a
 * future online gallery is just another implementation (list() fetching a
 * remote index, get() downloading one `.opnscrl.json`) - nothing else changes.
 */
import { validateTemplate } from './codec';
import { toListing, type Template, type TemplateListing } from './schema';

import gradientGallery from './builtin/gradient-gallery.json';
import grid2x2 from './builtin/grid-2x2.json';
import minimalBorder from './builtin/minimal-border.json';
import polaroidRow from './builtin/polaroid-row.json';
import quotePhoto from './builtin/quote-photo.json';
import story5 from './builtin/story-5.json';
import tallStory from './builtin/tall-story.json';
import triplePanorama from './builtin/triple-panorama.json';

export interface TemplateSource {
  /** Stable id of the source, e.g. 'builtin', 'local'. */
  readonly id: string;
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** Whether users can delete templates from this source. */
  readonly writable?: boolean;
  list(): Promise<TemplateListing[]>;
  /** Full template, or null if the id is unknown. */
  get(id: string): Promise<Template | null>;
}

const BUILTIN_RAW: readonly unknown[] = [
  triplePanorama,
  grid2x2,
  polaroidRow,
  quotePhoto,
  story5,
  minimalBorder,
  gradientGallery,
  tallStory,
];

let builtinCache: Template[] | null = null;

/** Built-in starter templates (validated on first use). */
export function builtinTemplates(): readonly Template[] {
  return (builtinCache ??= BUILTIN_RAW.map((raw) => validateTemplate(raw)));
}

export const builtinSource: TemplateSource = {
  id: 'builtin',
  name: 'Starter templates',
  async list() {
    return builtinTemplates().map(toListing);
  },
  async get(id) {
    return builtinTemplates().find((t) => t.id === id) ?? null;
  },
};

/** Minimal persistence the local source needs (implemented by storage/). */
export interface TemplateStore {
  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | null | undefined>;
  deleteTemplate?(id: string): Promise<void>;
}

/** The user's own templates, backed by an injected store. */
export function createLocalSource(store: TemplateStore): TemplateSource {
  return {
    id: 'local',
    name: 'My templates',
    writable: true,
    async list() {
      const all = await store.listTemplates();
      return all.map(toListing).sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id) {
      return (await store.getTemplate(id)) ?? null;
    },
  };
}

/** Unique tags across listings, most common first. */
export function collectTags(listings: readonly TemplateListing[]): string[] {
  const counts = new Map<string, number>();
  for (const l of listings) for (const t of l.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

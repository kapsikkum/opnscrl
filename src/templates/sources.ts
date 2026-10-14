/**
 * Where templates come from. The UI only talks to `TemplateSource`s, so a
 * future online gallery is just another implementation (list() fetching a
 * remote index, get() downloading one `.opnscrl.json`) - nothing else changes.
 */
import { validateTemplate } from './codec';
import { toListing, type Template, type TemplateListing } from './schema';

// Every generated file in builtin/ ships; ORDER only sets the gallery order
// (unlisted ones follow alphabetically).
const BUILTIN_FILES = import.meta.glob('./builtin/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const ORDER = [
  'triple-panorama',
  'grid-2x2',
  'polaroid-row',
  'travel-journal',
  'hero-seams',
  'weekend-dump',
  'quote-photo',
  'story-5',
  'mood-board',
  'film-strip',
  'annotated',
  'party-confetti',
  'recipe-card',
  'before-after',
  'tips-list',
  'product-launch',
  'event-poster',
  'pastel-hearts',
  'noir-portrait',
  'minimal-border',
  'gradient-gallery',
  'tall-story',
];
const rank = (path: string) => {
  const i = ORDER.indexOf(path.slice(path.lastIndexOf('/') + 1, -'.json'.length));
  return i < 0 ? ORDER.length : i;
};

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

const BUILTIN_RAW: readonly unknown[] = Object.keys(BUILTIN_FILES)
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  .map((k) => BUILTIN_FILES[k]);

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

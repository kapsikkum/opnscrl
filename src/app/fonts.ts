/**
 * Curated Google Fonts, loaded on demand. Only families in this list are ever
 * requested from fonts.googleapis.com, so a template can't make the app
 * contact arbitrary URLs through a font name.
 */
import { signal } from '@preact/signals';
import type { Project } from '../core/types';

export interface FontDef {
  family: string;
  category: 'sans' | 'serif' | 'display' | 'handwriting' | 'mono';
  /** Weights offered by Google Fonts for this family. */
  weights: readonly number[];
  /** CSS font-family stack stored in text layers. */
  stack: string;
}

const f = (family: string, category: FontDef['category'], weights: number[], fallback: string): FontDef => ({
  family,
  category,
  weights,
  stack: `${/\s/.test(family) ? `'${family}'` : family}, ${fallback}`,
});

const ALL = [300, 400, 500, 600, 700, 800, 900];

export const FONTS: readonly FontDef[] = [
  // Inter's stack matches the text layer default.
  { family: 'Inter', category: 'sans', weights: ALL, stack: 'Inter, system-ui, sans-serif' },
  f('Montserrat', 'sans', ALL, 'system-ui, sans-serif'),
  f('Poppins', 'sans', ALL, 'system-ui, sans-serif'),
  f('Raleway', 'sans', ALL, 'system-ui, sans-serif'),
  f('DM Sans', 'sans', [300, 400, 500, 600, 700], 'system-ui, sans-serif'),
  f('Space Grotesk', 'sans', [300, 400, 500, 600, 700], 'system-ui, sans-serif'),
  f('Oswald', 'display', [300, 400, 500, 600, 700], 'Impact, sans-serif'),
  f('Bebas Neue', 'display', [400], 'Impact, sans-serif'),
  f('Anton', 'display', [400], 'Impact, sans-serif'),
  f('Archivo Black', 'display', [400], 'Impact, sans-serif'),
  f('Playfair Display', 'serif', [400, 500, 600, 700, 800, 900], 'Georgia, serif'),
  f('Lora', 'serif', [400, 500, 600, 700], 'Georgia, serif'),
  f('Cormorant Garamond', 'serif', [300, 400, 500, 600, 700], 'Georgia, serif'),
  f('DM Serif Display', 'serif', [400], 'Georgia, serif'),
  f('Caveat', 'handwriting', [400, 500, 600, 700], "'Comic Sans MS', cursive"),
  f('Pacifico', 'handwriting', [400], "'Comic Sans MS', cursive"),
  f('Space Mono', 'mono', [400, 700], 'ui-monospace, monospace'),
];

const byFamily = new Map(FONTS.map((x) => [x.family.toLowerCase(), x]));

/** First family name of a CSS font stack, unquoted. */
export function familyOf(stack: string): string {
  const first = stack.split(',')[0]?.trim() ?? '';
  return first.replace(/^['"]|['"]$/g, '');
}

export function findFont(stackOrFamily: string): FontDef | undefined {
  return byFamily.get(familyOf(stackOrFamily).toLowerCase());
}

/** Bumped whenever a web font finished loading; the editor re-measures text on change. */
export const fontsVersion = signal(0);

const loaded = new Map<string, Promise<void>>();

function stylesheetUrl(font: FontDef): string {
  const fam = font.family.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${[...font.weights].sort((a, b) => a - b).join(';')}&display=swap`;
}

function addStylesheet(url: string): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // offline: fall back to the stack's system fonts
    document.head.appendChild(link);
  });
}

/** Load a curated family (all its weights). Unknown families and offline failures resolve quietly. */
export function loadFont(stackOrFamily: string): Promise<void> {
  const font = findFont(stackOrFamily);
  if (!font || typeof document === 'undefined') return Promise.resolve();
  const key = font.family;
  let p = loaded.get(key);
  if (!p) {
    p = (async () => {
      await addStylesheet(stylesheetUrl(font));
      if (document.fonts) {
        await Promise.allSettled(font.weights.map((w) => document.fonts.load(`${w} 32px "${font.family}"`, 'Abc')));
      }
      fontsVersion.value++;
    })();
    loaded.set(key, p);
  }
  return p;
}

/** Load every curated font used by the project's text layers. */
export async function ensureProjectFonts(project: Project): Promise<void> {
  const stacks = new Set<string>();
  for (const l of project.layers) if (l.type === 'text') stacks.add(l.props.fontFamily);
  await Promise.all([...stacks].map(loadFont));
}

/**
 * Schema migrations. `migrations[n]` upgrades a raw document from version n to
 * n + 1 (operating on untyped JSON, before zod validation). To change the
 * schema: bump SCHEMA_VERSION in schema.ts, add `migrations[oldVersion]`, and
 * add a test.
 */
import { neutralAdjust } from './adjust';
import { SCHEMA_VERSION } from './schema';

export type RawDoc = Record<string, unknown>;
export type Migration = (doc: RawDoc) => RawDoc;
export type MigrationMap = Record<number, Migration>;

const isObj = (v: unknown): v is RawDoc => typeof v === 'object' && v !== null && !Array.isArray(v);

export const migrations: MigrationMap = {
  /**
   * v0 -> v1. The pre-release (v0) draft format used `canvas.slides` and
   * `canvas.ratio`, had no `assets` map, and layers had optional lock/hidden
   * flags and no `name`.
   */
  0: (doc) => {
    const canvas: RawDoc = isObj(doc.canvas) ? { ...doc.canvas } : {};
    if ('slides' in canvas) {
      canvas.slideCount = canvas.slides;
      delete canvas.slides;
    }
    if ('ratio' in canvas) {
      canvas.aspect = canvas.ratio;
      delete canvas.ratio;
    }
    const layers = Array.isArray(doc.layers)
      ? doc.layers.map((l, i) => {
          if (!isObj(l)) return l;
          return {
            ...l,
            name: typeof l.name === 'string' ? l.name : `${String(l.type ?? 'layer')} ${i + 1}`,
            locked: l.locked ?? false,
            hidden: l.hidden ?? false,
          };
        })
      : [];
    return { ...doc, canvas, layers, assets: isObj(doc.assets) ? doc.assets : {}, schemaVersion: 1 };
  },
};

/**
 * v1 -> v2: more aspects (+ `canvas.customHeightPx`), image/frame `border` and
 * `shadow` (both null), and per-corner radii (numbers stay valid). The new
 * `line` layer type needs no migration.
 */
migrations[1] = (doc) => {
  const canvas: RawDoc = isObj(doc.canvas) ? { ...doc.canvas } : {};
  if (canvas.customHeightPx === undefined) canvas.customHeightPx = 1350;
  const layers = Array.isArray(doc.layers)
    ? doc.layers.map((l) => {
        if (!isObj(l) || (l.type !== 'image' && l.type !== 'frame') || !isObj(l.props)) return l;
        return { ...l, props: { border: null, shadow: null, ...l.props } };
      })
    : doc.layers;
  return { ...doc, canvas, layers };
};

/**
 * v2 -> v3: image/frame layers gain photo `adjust` (all neutral) and `preset`
 * (null). The new `sticker` and `drawing` layer types need no migration.
 */
migrations[2] = (doc) => {
  const layers = Array.isArray(doc.layers)
    ? doc.layers.map((l) => {
        if (!isObj(l) || (l.type !== 'image' && l.type !== 'frame') || !isObj(l.props)) return l;
        return { ...l, props: { adjust: neutralAdjust(), preset: null, ...l.props } };
      })
    : doc.layers;
  return { ...doc, layers };
};

export function detectVersion(doc: RawDoc): number {
  const v = doc.schemaVersion;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Apply migrations from the document's version up to `target`. */
export function migrateDocument(
  doc: RawDoc,
  map: MigrationMap = migrations,
  target: number = SCHEMA_VERSION,
): RawDoc {
  let version = detectVersion(doc);
  if (version > target) {
    throw new Error(`Document schemaVersion ${version} is newer than supported (${target})`);
  }
  let current = doc;
  while (version < target) {
    const step = map[version];
    if (!step) throw new Error(`No migration from schemaVersion ${version}`);
    current = { ...step(current), schemaVersion: version + 1 };
    version += 1;
  }
  return current;
}

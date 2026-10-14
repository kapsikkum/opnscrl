import { describe, expect, it } from 'vitest';
import { detectVersion, migrateDocument, migrations, type MigrationMap } from '../src/core/migrations';
import { SCHEMA_VERSION } from '../src/core/schema';
import { parseProject } from '../src/core/serialize';

const v0Doc = () => ({
  // no schemaVersion => v0
  id: 'old1',
  name: 'Legacy',
  canvas: {
    slides: 4,
    ratio: '1:1',
    slideWidthPx: 1080,
    background: { kind: 'solid', color: '#fff' },
  },
  layers: [
    {
      id: 'l1',
      type: 'shape',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      opacity: 1,
      props: { kind: 'rect', fill: { kind: 'solid', color: '#000' }, stroke: '#000', strokeWidth: 0, cornerRadius: 0 },
    },
  ],
  createdAt: 1,
  updatedAt: 2,
});

describe('migrations', () => {
  it('detects missing version as 0', () => {
    expect(detectVersion({})).toBe(0);
    expect(detectVersion({ schemaVersion: 1 })).toBe(1);
  });

  it('migrates a fake v0 document to the current schema', () => {
    const migrated = migrateDocument(v0Doc());
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    const canvas = migrated.canvas as Record<string, unknown>;
    expect(canvas.slideCount).toBe(4);
    expect(canvas.aspect).toBe('1:1');
    expect(canvas.slides).toBeUndefined();
    expect(migrated.assets).toEqual({});
  });

  it('parseProject runs migrations then validates', () => {
    const p = parseProject(JSON.stringify(v0Doc()));
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.canvas.slideCount).toBe(4);
    expect(p.layers[0]).toMatchObject({ locked: false, hidden: false, name: 'shape 1' });
  });

  it('chains multiple steps in order', () => {
    const calls: number[] = [];
    const map: MigrationMap = {
      0: (d) => (calls.push(0), { ...d, a: 1 }),
      1: (d) => (calls.push(1), { ...d, b: 2 }),
      2: (d) => (calls.push(2), { ...d, c: 3 }),
    };
    const out = migrateDocument({}, map, 3);
    expect(calls).toEqual([0, 1, 2]);
    expect(out).toMatchObject({ a: 1, b: 2, c: 3, schemaVersion: 3 });
  });

  it('rejects documents from the future and missing steps', () => {
    expect(() => migrateDocument({ schemaVersion: 99 })).toThrow(/newer/);
    expect(() => migrateDocument({ schemaVersion: 0 }, {}, 1)).toThrow(/No migration/);
  });

  it('has a migration for every historical version', () => {
    for (let v = 0; v < SCHEMA_VERSION; v++) expect(migrations[v]).toBeTypeOf('function');
  });
});

describe('migration v1 -> v2', () => {
  const v1Doc = () => ({
    id: 'p1',
    name: 'V1',
    schemaVersion: 1,
    canvas: { slideCount: 2, aspect: '4:5', slideWidthPx: 1080, background: { kind: 'solid', color: '#fff' } },
    layers: [
      {
        id: 'img',
        type: 'image',
        x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, locked: false, hidden: false, name: 'img',
        props: { assetId: 'a', fit: 'cover', crop: null, cornerRadius: 12, flipX: false, flipY: false },
      },
      {
        id: 'frm',
        type: 'frame',
        x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, locked: false, hidden: false, name: 'frm',
        props: { cornerRadius: 24, assetId: null, fit: 'cover', placeholderLabel: 'Drop photo' },
      },
      {
        id: 'shp',
        type: 'shape',
        x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, locked: false, hidden: false, name: 'shp',
        props: { kind: 'rect', fill: { kind: 'solid', color: '#000' }, stroke: '#000', strokeWidth: 0, cornerRadius: 4 },
      },
    ],
    assets: { a: { mime: 'image/png', w: 10, h: 10 } },
    createdAt: 1,
    updatedAt: 2,
  });

  it('adds customHeightPx, border and shadow without touching existing values', () => {
    const p = parseProject(v1Doc());
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.canvas.customHeightPx).toBe(1350);
    expect(p.canvas.aspect).toBe('4:5');
    const [img, frm, shp] = p.layers;
    expect(img!.props).toMatchObject({ cornerRadius: 12, border: null, shadow: null });
    expect(frm!.props).toMatchObject({ cornerRadius: 24, border: null, shadow: null });
    expect(shp!.props).toMatchObject({ cornerRadius: 4 });
  });

  it('migrates v0 documents all the way to v2', () => {
    const v0 = { ...v1Doc(), schemaVersion: undefined, canvas: { slides: 2, ratio: '1:1', slideWidthPx: 1080, background: { kind: 'solid', color: '#fff' } } };
    const p = parseProject(v0);
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.canvas.slideCount).toBe(2);
    expect(p.canvas.customHeightPx).toBe(1350);
  });

  it('keeps already-present border values', () => {
    const doc = v1Doc();
    (doc.layers[0] as { props: Record<string, unknown> }).props.border = { width: 4, color: '#fff' };
    const p = parseProject(doc);
    expect((p.layers[0]!.props as { border: unknown }).border).toEqual({ width: 4, color: '#fff' });
  });
});

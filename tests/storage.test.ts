import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '../src/core/schema';
import { createProject } from '../src/core/project';
import type { Project } from '../src/core/types';
import { createLayer } from '../src/layers/registry';
import {
  createAssetResolver,
  createAutosave,
  deleteAsset,
  deleteProject,
  deleteTemplate,
  duplicateProject,
  gcAssets,
  getAsset,
  getThumbnail,
  listAssetIds,
  listProjects,
  listTemplates,
  loadProject,
  putAsset,
  putThumbnail,
  resetDatabase,
  saveProject,
  saveTemplate,
  getTemplate,
  templateStore,
} from '../src/storage';
import { builtinTemplates, createLocalSource } from '../src/templates';

const blob = (text: string) => new Blob([text], { type: 'image/png' });

function projectWithAsset(id: string, assetId: string, now = 1): Project {
  const p = createProject({ id, name: id, now });
  return {
    ...p,
    assets: { [assetId]: { mime: 'image/png', w: 10, h: 10 } },
    layers: [createLayer('image', { id: `${id}-img`, props: { assetId } })],
  };
}

beforeEach(async () => {
  await resetDatabase();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('projects store', () => {
  it('saves, loads and lists newest first', async () => {
    await saveProject(createProject({ id: 'a', name: 'A', now: 10 }));
    await saveProject(createProject({ id: 'b', name: 'B', now: 20, slideCount: 5 }));
    expect((await loadProject('a'))?.name).toBe('A');
    expect(await loadProject('missing')).toBeNull();
    const list = await listProjects();
    expect(list.map((p) => p.id)).toEqual(['b', 'a']);
    expect(list[0]).toMatchObject({ slideCount: 5, aspect: '4:5', layerCount: 0 });
  });

  it('overwrites on save and rejects invalid projects', async () => {
    const p = createProject({ id: 'a', name: 'One', now: 1 });
    await saveProject(p);
    await saveProject({ ...p, name: 'Two', updatedAt: 5 });
    expect((await loadProject('a'))?.name).toBe('Two');
    expect(await listProjects()).toHaveLength(1);
    await expect(saveProject({ ...p, canvas: { ...p.canvas, slideCount: 99 } })).rejects.toThrow();
  });

  it('migrates old stored documents on load', async () => {
    const { getDb } = await import('../src/storage');
    const db = await getDb();
    const p = createProject({ id: 'old', now: 1 });
    const v1 = JSON.parse(JSON.stringify(p));
    v1.schemaVersion = 1;
    delete v1.canvas.customHeightPx;
    await db.put('projects', v1);
    const loaded = await loadProject('old');
    expect(loaded?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded?.canvas.customHeightPx).toBe(1350);
  });

  it('duplicates with a new id and name, sharing assets', async () => {
    await putAsset(blob('x'), 'a1');
    await saveProject(projectWithAsset('a', 'a1'));
    const copy = await duplicateProject('a', 99);
    expect(copy).toMatchObject({ name: 'a copy', createdAt: 99 });
    expect(copy!.id).not.toBe('a');
    expect(copy!.assets).toEqual((await loadProject('a'))!.assets);
    expect(await listProjects()).toHaveLength(2);
    expect(await duplicateProject('nope')).toBeNull();
  });

  it('stores thumbnails per project and removes them with the project', async () => {
    await saveProject(createProject({ id: 'a', now: 1 }));
    await putThumbnail('a', { blob: blob('t'), updatedAt: 1 });
    expect((await getThumbnail('a'))?.updatedAt).toBe(1);
    await deleteProject('a');
    expect(await getThumbnail('a')).toBeUndefined();
  });
});

describe('assets store + garbage collection', () => {
  it('round-trips blobs by id', async () => {
    const id = await putAsset(blob('hello'));
    expect(id).toMatch(/^ast_/);
    const out = await getAsset(id);
    expect(out).toBeDefined();
    expect(await out!.text()).toBe('hello');
    await deleteAsset(id);
    expect(await getAsset(id)).toBeUndefined();
  });

  it('deleting a project removes only the photos nothing else uses', async () => {
    await putAsset(blob('1'), 'shared');
    await putAsset(blob('2'), 'only-a');
    await saveProject({
      ...projectWithAsset('a', 'only-a'),
      assets: { 'only-a': { mime: 'image/png', w: 1, h: 1 }, shared: { mime: 'image/png', w: 1, h: 1 } },
    });
    await saveProject(projectWithAsset('b', 'shared'));
    await deleteProject('a');
    expect((await listAssetIds()).sort()).toEqual(['shared']);
    expect(await loadProject('a')).toBeNull();
    await deleteProject('b');
    expect(await listAssetIds()).toEqual([]);
  });

  it('deleting a missing project is a no-op', async () => {
    await putAsset(blob('1'), 'keep-me');
    await deleteProject('ghost');
    expect(await listAssetIds()).toEqual(['keep-me']);
  });

  it('a full sweep removes orphans and counts layer references too', async () => {
    await putAsset(blob('1'), 'orphan');
    await putAsset(blob('2'), 'used');
    await putAsset(blob('3'), 'layer-only');
    const p = projectWithAsset('a', 'used');
    p.layers.push(createLayer('frame', { id: 'f', props: { assetId: 'layer-only' } }));
    await saveProject(p);
    expect(await gcAssets()).toEqual(['orphan']);
    expect((await listAssetIds()).sort()).toEqual(['layer-only', 'used']);
  });
});

describe('templates store', () => {
  it('saves, lists, gets and deletes validated templates', async () => {
    const t = { ...builtinTemplates()[0]!, id: 'mine', createdAt: 5 };
    await saveTemplate(t);
    await saveTemplate({ ...builtinTemplates()[1]!, id: 'mine2', createdAt: 9 });
    expect((await listTemplates()).map((x) => x.id)).toEqual(['mine2', 'mine']);
    expect((await getTemplate('mine'))?.name).toBe(t.name);
    expect(await getTemplate('nope')).toBeNull();
    await deleteTemplate('mine');
    expect((await listTemplates()).map((x) => x.id)).toEqual(['mine2']);
    await expect(saveTemplate({ ...t, tags: 'bad' as never })).rejects.toThrow();
  });

  it('plugs into the local TemplateSource', async () => {
    await saveTemplate({ ...builtinTemplates()[2]!, id: 'loc', createdAt: 3 });
    const src = createLocalSource(templateStore);
    expect((await src.list()).map((l) => l.id)).toEqual(['loc']);
    expect((await src.get('loc'))?.id).toBe('loc');
  });
});

describe('asset resolver', () => {
  it('loads each asset once, caches the promise and does not cache failures', async () => {
    const getBlob = vi.fn(async (id: string) => (id === 'good' ? blob('x') : undefined));
    // jsdom/node has no image decoding: provide a fake decoder through createImageBitmap
    const fake = { width: 4, height: 3 } as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn(async () => fake));
    const r = createAssetResolver(getBlob);
    const [a, b] = await Promise.all([r('good'), r('good')]);
    expect(a).toBe(fake);
    expect(b).toBe(fake);
    expect(getBlob).toHaveBeenCalledTimes(1);
    await expect(r('bad')).rejects.toThrow(/not found/);
    await expect(r('bad')).rejects.toThrow(/not found/);
    expect(getBlob).toHaveBeenCalledTimes(3); // failure retried
    r.forget('good');
    await r('good');
    expect(getBlob).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();
  });
});

describe('autosave', () => {
  it('debounces and saves only the latest project', async () => {
    vi.useFakeTimers();
    const saved: Project[] = [];
    const statuses: string[] = [];
    const a = createAutosave({ save: async (p) => void saved.push(p), delay: 800, onStatus: (s) => statuses.push(s) });
    const p1 = createProject({ id: 'x', name: '1', now: 1 });
    a.schedule(p1);
    vi.advanceTimersByTime(500);
    a.schedule({ ...p1, name: '2' });
    vi.advanceTimersByTime(500);
    a.schedule({ ...p1, name: '3' });
    expect(saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(800);
    expect(saved.map((p) => p.name)).toEqual(['3']);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('flush saves immediately and does not double-save an unchanged project', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    const a = createAutosave({ save });
    const p = createProject({ id: 'x', now: 1 });
    a.schedule(p);
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    a.schedule(p); // identical object: nothing to do
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    a.dispose();
    a.schedule({ ...p, name: 'later' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('serializes writes and reports errors, retrying on flush', async () => {
    vi.useFakeTimers();
    let fail = true;
    const order: string[] = [];
    const statuses: string[] = [];
    const a = createAutosave({
      save: async (p) => {
        if (fail) throw new Error('disk full');
        order.push(p.name);
      },
      onStatus: (s) => statuses.push(s),
    });
    const p = createProject({ id: 'x', name: 'v1', now: 1 });
    a.schedule(p);
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses).toContain('error');
    fail = false;
    await a.flush();
    expect(order).toEqual(['v1']);
    expect(statuses.at(-1)).toBe('saved');
  });
});

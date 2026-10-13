import { compressToEncodedURIComponent } from 'lz-string';
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/core/project';
import { parseProject } from '../src/core/serialize';
import type { Layer, Project } from '../src/core/types';
import { createLayer } from '../src/layers/registry';
import {
  SHARE_LINK_WARN_LENGTH,
  TemplateParseError,
  builtinSource,
  builtinTemplates,
  collectTags,
  createLocalSource,
  decodeShareLink,
  decodeTemplateFile,
  encodeShareLink,
  encodeTemplateFile,
  encodeTemplatePayload,
  projectToTemplate,
  templateFileName,
  templateToProject,
  type Template,
} from '../src/templates';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function sampleProject(): Project {
  const p = createProject({ id: 'p1', name: 'Trip', slideCount: 3, now: 5 });
  const layers: Layer[] = [
    createLayer('background', { id: 'bg', width: 3240, height: 1350 }),
    createLayer('image', {
      id: 'img1',
      name: 'IMG_2231.jpg',
      props: { assetId: 'a1', cornerRadius: [4, 8, 12, 16], border: { width: 6, color: '#fff' } },
    }),
    createLayer('frame', { id: 'frm', props: { assetId: 'a2', placeholderLabel: 'Hello' } }),
    createLayer('text', { id: 'txt', props: { text: 'Hi' } }),
    createLayer('line', { id: 'ln', props: { endCap: 'arrow' } }),
  ];
  return {
    ...p,
    layers,
    assets: { a1: { mime: 'image/png', w: 10, h: 10 }, a2: { mime: 'image/png', w: 20, h: 20 }, unused: { mime: 'image/png', w: 1, h: 1 } },
  };
}

describe('projectToTemplate', () => {
  it('turns photos into empty frames and strips asset references', () => {
    const t = projectToTemplate(sampleProject(), { name: 'My look', tags: ['a'], now: 1, id: 'tpl_x' });
    expect(t).toMatchObject({ id: 'tpl_x', name: 'My look', tags: ['a'], createdAt: 1, schemaVersion: 2 });
    expect(t.assets).toBeUndefined();
    const img = t.layers.find((l) => l.id === 'img1')!;
    expect(img.type).toBe('frame');
    expect(img.name).toBe('Photo 1'); // no file names leak
    expect(img.props).toMatchObject({ assetId: null, cornerRadius: [4, 8, 12, 16], border: { width: 6, color: '#fff' } });
    const frm = t.layers.find((l) => l.id === 'frm')!;
    expect(frm.props).toMatchObject({ assetId: null, placeholderLabel: 'Hello' });
    expect(JSON.stringify(t)).not.toContain('IMG_2231');
    expect(JSON.stringify(t)).not.toContain('"a1"');
  });

  it('keeps non-photo layers unchanged', () => {
    const p = sampleProject();
    const t = projectToTemplate(p);
    for (const id of ['bg', 'txt', 'ln']) expect(t.layers.find((l) => l.id === id)).toEqual(p.layers.find((l) => l.id === id));
  });

  it('embeds only referenced assets as data URLs with includeAssets', () => {
    const t = projectToTemplate(sampleProject(), { includeAssets: true, assetDataUrls: { a1: PNG, a2: PNG, unused: PNG } });
    expect(Object.keys(t.assets!).sort()).toEqual(['a1', 'a2']);
    expect(t.assets!.a1).toEqual({ mime: 'image/png', w: 10, h: 10, dataUrl: PNG });
    expect(t.layers.find((l) => l.id === 'img1')!.type).toBe('image');
  });

  it('throws when asset data is missing for includeAssets', () => {
    expect(() => projectToTemplate(sampleProject(), { includeAssets: true, assetDataUrls: { a1: PNG } })).toThrow(/a2/);
  });
});

describe('templateToProject', () => {
  it('creates a valid project with fresh ids', () => {
    const t = projectToTemplate(sampleProject(), { id: 'tpl_x' });
    const a = templateToProject(t, { now: 9 });
    const b = templateToProject(t, { now: 9 });
    expect(() => parseProject(JSON.stringify(a))).not.toThrow();
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe('p1');
    const ids = new Set(a.layers.map((l) => l.id));
    expect(ids.size).toBe(a.layers.length);
    for (const l of t.layers) expect(ids.has(l.id)).toBe(false);
    for (const l of b.layers) expect(ids.has(l.id)).toBe(false);
    expect(a.name).toBe('Trip');
    expect(a.createdAt).toBe(9);
    expect(a.layers.map((l) => l.type)).toEqual(t.layers.map((l) => l.type));
    expect(a.assets).toEqual({});
  });

  it('remaps embedded assets and reports them', () => {
    const t = projectToTemplate(sampleProject(), { includeAssets: true, assetDataUrls: { a1: PNG, a2: PNG } });
    const seen: string[] = [];
    const p = templateToProject(t, { onAsset: (id) => seen.push(id) });
    expect(seen).toHaveLength(2);
    expect(Object.keys(p.assets).sort()).toEqual([...seen].sort());
    const ids = p.layers.flatMap((l) => (l.type === 'image' || l.type === 'frame') && l.props.assetId ? [l.props.assetId] : []);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(seen).toContain(id);
    expect(ids).not.toContain('a1');
  });
});

describe('template file codec', () => {
  const t = projectToTemplate(sampleProject(), { id: 'tpl_x', now: 1, description: 'desc', tags: ['x'] });

  it('round-trips exactly', () => {
    expect(decodeTemplateFile(encodeTemplateFile(t))).toEqual(t);
    const withAssets = projectToTemplate(sampleProject(), { id: 'tpl_y', now: 1, includeAssets: true, assetDataUrls: { a1: PNG, a2: PNG } });
    expect(decodeTemplateFile(encodeTemplateFile(withAssets))).toEqual(withAssets);
  });

  it('names files .opnscrl.json', () => {
    expect(templateFileName({ name: 'My Great Look!' })).toBe('my-great-look.opnscrl.json');
    expect(templateFileName({ name: '???' })).toBe('template.opnscrl.json');
  });

  it('rejects malformed input', () => {
    const good = JSON.parse(encodeTemplateFile(t));
    const bad: [string, unknown][] = [
      ['not json', '{nope'],
      ['array', []],
      ['null', null],
      ['string', '"hi"'],
      ['missing tags', { ...good, tags: undefined }],
      ['missing canvas', { ...good, canvas: undefined }],
      ['empty name', { ...good, name: '' }],
      ['future version', { ...good, schemaVersion: 99 }],
      ['bad layer', { ...good, layers: [{ id: 'x', type: 'sparkle' }] }],
      ['duplicate layer ids', { ...good, layers: [good.layers[0], good.layers[0]] }],
      ['too many tags', { ...good, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
      ['project file instead of template', sampleProject()],
    ];
    for (const [label, value] of bad) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      expect(() => decodeTemplateFile(text), label).toThrow(TemplateParseError);
    }
  });

  it('rejects unsafe or dangling embedded assets', () => {
    const withAssets = JSON.parse(
      encodeTemplateFile(projectToTemplate(sampleProject(), { id: 'tpl_y', includeAssets: true, assetDataUrls: { a1: PNG, a2: PNG } })),
    );
    const mutate = (fn: (d: any) => void) => {
      const d = structuredClone(withAssets);
      fn(d);
      return JSON.stringify(d);
    };
    expect(() => decodeTemplateFile(mutate((d) => (d.assets.a1.dataUrl = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')))).toThrow(TemplateParseError);
    expect(() => decodeTemplateFile(mutate((d) => (d.assets.a1.dataUrl = 'https://example.com/x.png')))).toThrow(TemplateParseError);
    expect(() => decodeTemplateFile(mutate((d) => (d.assets.a1.dataUrl = 'javascript:alert(1)')))).toThrow(TemplateParseError);
    expect(() => decodeTemplateFile(mutate((d) => delete d.assets.a1))).toThrow(/missing asset/);
  });

  it('migrates an older (v1) template file', () => {
    const old = JSON.parse(encodeTemplateFile(t));
    old.schemaVersion = 1;
    delete old.canvas.customHeightPx;
    for (const l of old.layers) {
      if (l.type === 'frame') {
        delete l.props.border;
        delete l.props.shadow;
      }
    }
    const decoded = decodeTemplateFile(JSON.stringify(old));
    expect(decoded.schemaVersion).toBe(2);
    expect(decoded.canvas.customHeightPx).toBe(1350);
    expect(decoded.layers.find((l) => l.type === 'frame')!.props).toMatchObject({ border: null, shadow: null });
  });
});

describe('share links', () => {
  const t = projectToTemplate(sampleProject(), { id: 'tpl_x', now: 1, name: 'Linked' });
  const base = 'https://example.com/opnscrl/';

  it('round-trips through the URL hash', () => {
    const link = encodeShareLink(t, base);
    expect(link.url.startsWith(`${base}#t=`)).toBe(true);
    expect(link.length).toBe(link.url.length);
    expect(link.tooLong).toBe(false);
    expect(decodeShareLink(link.url)).toEqual(t);
    expect(decodeShareLink(link.url.slice(base.length - 1))).toEqual(t); // just "#t=..."
  });

  it('uses the lz-string URI-safe alphabet only', () => {
    expect(encodeTemplatePayload(t)).toMatch(/^[A-Za-z0-9+\-$]+$/);
  });

  it('replaces an existing hash on the base URL', () => {
    expect(encodeShareLink(t, `${base}#old`).url.startsWith(`${base}#t=`)).toBe(true);
  });

  it('flags links that are too long', () => {
    // incompressible text makes the link long
    let seed = 7;
    const noise = () => Array.from({ length: 300 }, () => String.fromCharCode(33 + ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 90))).join('');
    const texts = Array.from({ length: 40 }, (_, i) => createLayer('text', { id: `t${i}`, props: { text: noise() } }));
    const big = { ...t, layers: [...t.layers, ...texts] };
    const link = encodeShareLink(big, base);
    expect(link.length).toBeGreaterThan(SHARE_LINK_WARN_LENGTH);
    expect(link.tooLong).toBe(true);
    expect(decodeShareLink(link.url)).toEqual(big);
  });

  it('returns null when there is no template in the URL', () => {
    expect(decodeShareLink('https://example.com/')).toBeNull();
    expect(decodeShareLink('https://example.com/#other=1')).toBeNull();
    expect(decodeShareLink('#t=')).toBeNull();
    expect(decodeShareLink('')).toBeNull();
  });

  it('throws on damaged or invalid payloads', () => {
    const payload = encodeTemplatePayload(t);
    expect(() => decodeShareLink(`#t=${payload.slice(0, payload.length - 20)}`)).toThrow(TemplateParseError);
    expect(() => decodeShareLink('#t=%%%not-lz%%%')).toThrow(TemplateParseError);
    expect(() => decodeShareLink(`#t=${compressToEncodedURIComponent('{"hello":1}')}`)).toThrow(TemplateParseError);
    expect(() => decodeShareLink(`#t=${compressToEncodedURIComponent('not json')}`)).toThrow(TemplateParseError);
    expect(() => decodeShareLink(`#t=${compressToEncodedURIComponent('[]')}`)).toThrow(TemplateParseError);
  });

  it('accepts the payload after other hash params', () => {
    expect(decodeShareLink(`#x=1&t=${encodeTemplatePayload(t)}`)).toEqual(t);
  });
});

describe('template sources', () => {
  it('ships 6-8 valid, distinct built-in templates', () => {
    const all = builtinTemplates();
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(all.length).toBeLessThanOrEqual(8);
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    expect(new Set(all.map((x) => x.name)).size).toBe(all.length);
    for (const tpl of all) {
      expect(tpl.assets).toBeUndefined();
      expect(tpl.layers.some((l) => l.type === 'frame')).toBe(true);
      // instantiable, and valid after a file round trip
      expect(() => parseProject(JSON.stringify(templateToProject(tpl)))).not.toThrow();
      expect(decodeTemplateFile(encodeTemplateFile(tpl))).toEqual(tpl);
      for (const l of tpl.layers) expect(l.type === 'image').toBe(false);
    }
  });

  it('builtinSource lists and gets', async () => {
    const list = await builtinSource.list();
    expect(list.length).toBe(builtinTemplates().length);
    expect(list[0]).toMatchObject({ id: expect.any(String), slideCount: expect.any(Number), tags: expect.any(Array) });
    const first = await builtinSource.get(list[0]!.id);
    expect(first?.id).toBe(list[0]!.id);
    expect(await builtinSource.get('nope')).toBeNull();
  });

  it('built-in share links stay reasonably short', () => {
    for (const tpl of builtinTemplates()) expect(encodeShareLink(tpl, 'https://x.test/').tooLong, tpl.name).toBe(false);
  });

  it('localSource wraps an injected store, newest first', async () => {
    const a: Template = { ...builtinTemplates()[0]!, id: 'a', createdAt: 1 };
    const b: Template = { ...builtinTemplates()[1]!, id: 'b', createdAt: 2 };
    const src = createLocalSource({
      listTemplates: async () => [a, b],
      getTemplate: async (id) => [a, b].find((t) => t.id === id),
    });
    expect(src.id).toBe('local');
    expect((await src.list()).map((l) => l.id)).toEqual(['b', 'a']);
    expect((await src.get('a'))?.id).toBe('a');
    expect(await src.get('zzz')).toBeNull();
  });

  it('collects tags by frequency', () => {
    const tags = collectTags([
      { id: '1', name: '', tags: ['a', 'b'], slideCount: 1, aspect: '1:1', createdAt: 0 },
      { id: '2', name: '', tags: ['b'], slideCount: 1, aspect: '1:1', createdAt: 0 },
    ]);
    expect(tags).toEqual(['b', 'a']);
  });
});

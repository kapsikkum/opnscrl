import { describe, expect, it } from 'vitest';
import { layerSchema } from '../src/core/schema';
import { createProject } from '../src/core/project';
import { ProjectParseError, parseProject, serializeProject } from '../src/core/serialize';
import { createLayer, layerRegistry, layerTypes } from '../src/layers/registry';
import { rectLayer, sampleProject } from './helpers';

describe('serialization', () => {
  it('round-trips a project exactly', () => {
    const p = {
      ...sampleProject(['a', 'b']),
      assets: { img1: { mime: 'image/jpeg', w: 4000, h: 3000 } },
    };
    const json = serializeProject(p);
    expect(parseProject(json)).toEqual(p);
    expect(parseProject(JSON.parse(json))).toEqual(p);
  });

  it('createProject output is valid', () => {
    expect(() => serializeProject(createProject())).not.toThrow();
  });

  it('rejects invalid JSON, non-objects and schema violations with ProjectParseError', () => {
    expect(() => parseProject('{nope')).toThrow(ProjectParseError);
    expect(() => parseProject('[]')).toThrow(ProjectParseError);
    const p = sampleProject(['a']);
    const bad = { ...p, canvas: { ...p.canvas, slideCount: 21 } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/canvas\.slideCount/);
    const badAspect = { ...p, canvas: { ...p.canvas, aspect: '7:5' } };
    expect(() => parseProject(badAspect)).toThrow(ProjectParseError);
  });

  it('rejects duplicate layer ids and unknown layer types', () => {
    const p = sampleProject(['a']);
    expect(() => parseProject({ ...p, layers: [rectLayer('a'), rectLayer('a')] })).toThrow(/duplicate/);
    expect(() => parseProject({ ...p, layers: [{ ...rectLayer('a'), type: 'sparkle' }] })).toThrow(ProjectParseError);
  });

  it('validates layer props per type', () => {
    const p = sampleProject(['a']);
    const badProps = { ...rectLayer('a'), props: { kind: 'hexagon' } };
    expect(() => parseProject({ ...p, layers: [badProps] })).toThrow(ProjectParseError);
  });
});

describe('layer registry', () => {
  it('registers every layer type and defaults satisfy their own schema', () => {
    expect([...layerTypes].sort()).toEqual(['background', 'frame', 'image', 'line', 'shape', 'text']);
    for (const type of layerTypes) {
      const def = layerRegistry[type];
      expect(def.type).toBe(type);
      expect(def.schema.safeParse(def.defaults()).success).toBe(true);
      expect(def.defaults()).not.toBe(def.defaults()); // fresh object per call
    }
  });

  it('createLayer builds schema-valid layers for every type', () => {
    for (const type of layerTypes) {
      const l = createLayer(type);
      expect(layerSchema.safeParse(l).success, type).toBe(true);
    }
    expect(createLayer('background').locked).toBe(true);
    expect(createLayer('text', { props: { text: 'hi' }, x: 5 })).toMatchObject({
      x: 5,
      props: { text: 'hi', fontSize: 96 },
    });
  });

  it('whole documents of created layers round-trip', () => {
    const p = { ...sampleProject(), layers: layerTypes.map((t) => createLayer(t)) };
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
});

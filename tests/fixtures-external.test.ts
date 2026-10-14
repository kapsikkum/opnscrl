/**
 * Real-world template fixtures. They live in the gitignored fixtures/ folder
 * (converted locally from third-party templates and never committed), so this
 * suite skips itself when the folder is absent, e.g. in CI.
 */
import { describe, expect, it } from 'vitest';
import { canvasSize, layerBounds } from '../src/core/geometry';
import { serializeProject, parseProject } from '../src/core/serialize';
import { decodeShareLink, decodeTemplateFile, encodeShareLink, encodeTemplateFile, projectToTemplate, templateToProject } from '../src/templates';

// Vite resolves the glob at build time; an absent folder simply yields no files.
const fixtures = import.meta.glob('../fixtures/scrl/*.opnscrl.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(fixtures);

describe.skipIf(files.length === 0)('external template fixtures', () => {
  for (const f of files) {
    describe(f, () => {
      const text = fixtures[f]!;

      it('decodes as a valid template', () => {
        const t = decodeTemplateFile(text);
        expect(t.layers.length).toBeGreaterThan(0);
      });

      it('keeps every layer on the canvas and inside a slide-sized height', () => {
        const t = decodeTemplateFile(text);
        const { width, height } = canvasSize(t.canvas);
        for (const l of t.layers) {
          const b = layerBounds(l);
          expect(b.x + b.width, `${l.name} right edge`).toBeGreaterThan(0);
          expect(b.x, `${l.name} left edge`).toBeLessThan(width);
          expect(b.y + b.height, `${l.name} bottom`).toBeGreaterThan(0);
          expect(b.y, `${l.name} top`).toBeLessThan(height);
        }
      });

      it('instantiates as a project and survives save/load', () => {
        const p = templateToProject(decodeTemplateFile(text), { now: 1 });
        const again = parseProject(JSON.parse(serializeProject(p)));
        expect(again.layers.map((l) => l.type)).toEqual(p.layers.map((l) => l.type));
      });

      it('round-trips through a share link and back to a template file', () => {
        const t = decodeTemplateFile(text);
        const link = encodeShareLink(t, 'https://opnscrl.test/');
        const back = decodeShareLink(link.url)!;
        expect(back.layers).toEqual(t.layers);
        const reTemplate = projectToTemplate(templateToProject(back, { now: 1 }), { id: t.id, now: 0 });
        expect(decodeTemplateFile(encodeTemplateFile(reTemplate)).layers.length).toBe(t.layers.length);
      });
    });
  }
});

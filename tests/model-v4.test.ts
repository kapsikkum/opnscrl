import { describe, expect, it } from 'vitest';
import { migrateDocument } from '../src/core/migrations';
import { SCHEMA_VERSION } from '../src/core/schema';
import { parseProject } from '../src/core/serialize';
import { createLayer } from '../src/layers';

describe('migration v3 -> v4', () => {
  it('adds a null text background and validates', () => {
    const text = createLayer('text');
    const { background: _drop, ...oldProps } = text.props;
    const v3 = {
      id: 'p',
      name: 'v3',
      schemaVersion: 3,
      canvas: { slideCount: 1, aspect: '1:1', customHeightPx: 1350, slideWidthPx: 1080, background: { kind: 'solid', color: '#fff' } },
      layers: [{ ...text, props: oldProps }],
      assets: {},
      createdAt: 1,
      updatedAt: 1,
    };
    const p = parseProject(migrateDocument(v3));
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    const t = p.layers[0]!;
    expect(t.type === 'text' && t.props.background).toBeNull();
  });

  it('accepts a pill background', () => {
    const t = createLayer('text', { props: { background: { color: '#fff', opacity: 1, paddingX: 20, paddingY: 10, radius: 999 } } });
    expect(t.props.background?.radius).toBe(999);
  });
});

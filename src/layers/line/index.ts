import Konva from 'konva';
import { linePropsSchema } from '../../core/schema';
import type { LineLayer, LineProps } from '../../core/types';
import { applyBase, createLayerGroup } from '../shared/base';
import type { LayerDefinition } from '../types';

const PART = 'opnscrl-line-part';

type Cap = LineProps['startCap'];

/** Pixel size of a cap for a given stroke width. */
export function capSize(strokeWidth: number): number {
  return strokeWidth * 3 + 8;
}

/** Endpoints in layer-local pixels. */
export function linePoints(layer: Pick<LineLayer, 'width' | 'height' | 'props'>): { a: Konva.Vector2d; b: Konva.Vector2d } {
  const { start, end } = layer.props;
  return {
    a: { x: start.x * layer.width, y: start.y * layer.height },
    b: { x: end.x * layer.width, y: end.y * layer.height },
  };
}

export type CapGeometry =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'polygon'; points: number[] };

/**
 * Pure geometry of an end cap with its tip/center at `at`, for a line running
 * from `at` towards `towards`. Shared by the Konva layer and SVG previews.
 */
export function capGeometry(cap: Cap, at: Konva.Vector2d, towards: Konva.Vector2d, width: number): CapGeometry | null {
  if (cap === 'none') return null;
  const dx = towards.x - at.x;
  const dy = towards.y - at.y;
  const len = Math.hypot(dx, dy) || 1;
  // unit vector pointing from the endpoint back along the line, and its normal
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const s = capSize(width);
  if (cap === 'circle') return { kind: 'circle', x: at.x, y: at.y, r: s * 0.4 };
  if (cap === 'diamond') {
    const h = s * 0.55;
    const w = s * 0.38;
    return {
      kind: 'polygon',
      points: [at.x + ux * h, at.y + uy * h, at.x + nx * w, at.y + ny * w, at.x - ux * h, at.y - uy * h, at.x - nx * w, at.y - ny * w],
    };
  }
  // arrow: tip at the endpoint, base `s` back along the line
  const hw = s * 0.42;
  return {
    kind: 'polygon',
    points: [at.x, at.y, at.x + ux * s + nx * hw, at.y + uy * s + ny * hw, at.x + ux * s - nx * hw, at.y + uy * s - ny * hw],
  };
}

function capNode(cap: Cap, at: Konva.Vector2d, towards: Konva.Vector2d, color: string, width: number): Konva.Shape | null {
  const g = capGeometry(cap, at, towards, width);
  if (!g) return null;
  const common = { name: PART, listening: false, fill: color } as const;
  if (g.kind === 'circle') return new Konva.Circle({ ...common, x: g.x, y: g.y, radius: g.r });
  return new Konva.Line({ ...common, closed: true, points: g.points });
}

function apply(group: Konva.Group, layer: LineLayer): void {
  applyBase(group, layer);
  for (const n of group.find(`.${PART}`)) n.destroy();
  const p = layer.props;
  const { a, b } = linePoints(layer);
  const w = Math.max(0, p.width);
  // stop the body short of an arrowhead so a thick stroke does not poke out past the tip
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const trim = (cap: Cap) => (cap === 'arrow' ? Math.min(capSize(w) * 0.8, len / 2) : 0);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const a2 = { x: a.x + ux * trim(p.startCap), y: a.y + uy * trim(p.startCap) };
  const b2 = { x: b.x - ux * trim(p.endCap), y: b.y - uy * trim(p.endCap) };

  const body = new Konva.Line({
    name: PART,
    listening: false,
    points: [a2.x, a2.y, b2.x, b2.y],
    stroke: p.color,
    strokeWidth: w,
    strokeEnabled: w > 0,
    lineCap: p.dash === 'dotted' ? 'round' : 'butt',
    dash: p.dash === 'dashed' ? [w * 3, w * 2] : p.dash === 'dotted' ? [0.01, Math.max(w * 2, 1)] : undefined,
  });
  group.add(body);
  const startCap = capNode(p.startCap, a, b, p.color, w);
  const endCap = capNode(p.endCap, b, a, p.color, w);
  if (startCap) group.add(startCap);
  if (endCap) group.add(endCap);
}

/** A straight line with optional dash style and start/end caps (arrow, circle, diamond). */
export const lineLayer: LayerDefinition<'line'> = {
  type: 'line',
  label: 'Line',
  icon: 'line',
  schema: linePropsSchema,
  defaults: () => ({
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
    color: '#111111',
    width: 8,
    dash: 'solid',
    startCap: 'none',
    endCap: 'none',
  }),
  base: { width: 600, height: 48 },
  inspector: [
    { key: 'color', label: 'Color', kind: 'color' },
    { key: 'width', label: 'Thickness', kind: 'slider', min: 1, max: 80, step: 1, unit: 'px' },
    {
      key: 'dash',
      label: 'Style',
      kind: 'select',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'dashed', label: 'Dashed' },
        { value: 'dotted', label: 'Dotted' },
      ],
    },
    {
      key: 'startCap',
      label: 'Start cap',
      kind: 'select',
      options: [
        { value: 'none', label: 'None' },
        { value: 'arrow', label: 'Arrow' },
        { value: 'circle', label: 'Circle' },
        { value: 'diamond', label: 'Diamond' },
      ],
    },
    {
      key: 'endCap',
      label: 'End cap',
      kind: 'select',
      options: [
        { value: 'none', label: 'None' },
        { value: 'arrow', label: 'Arrow' },
        { value: 'circle', label: 'Circle' },
        { value: 'diamond', label: 'Diamond' },
      ],
    },
  ],
  render(layer) {
    const group = createLayerGroup(layer);
    apply(group, layer);
    return group;
  },
  update(node, layer) {
    apply(node, layer);
  },
};

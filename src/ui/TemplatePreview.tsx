import type { JSX } from 'preact';
import { canvasSize, gradientLine, resolveCornerRadii } from '../core/geometry';
import type { CanvasSettings, Fill, Layer } from '../core/types';
import { capGeometry, linePoints } from '../layers/line';

let uid = 0;

/** SVG path for a rect with per-corner radii. */
export function roundedRectD(x: number, y: number, w: number, h: number, radii: readonly [number, number, number, number]): string {
  const [tl, tr, br, bl] = radii;
  return [
    `M${x + tl} ${y}`,
    `H${x + w - tr}`,
    `A${tr} ${tr} 0 0 1 ${x + w} ${y + tr}`,
    `V${y + h - br}`,
    `A${br} ${br} 0 0 1 ${x + w - br} ${y + h}`,
    `H${x + bl}`,
    `A${bl} ${bl} 0 0 1 ${x} ${y + h - bl}`,
    `V${y + tl}`,
    `A${tl} ${tl} 0 0 1 ${x + tl} ${y}`,
    'Z',
  ].join(' ');
}

function makeFill(fill: Fill, x: number, y: number, w: number, h: number, defs: JSX.Element[]): string {
  if (fill.kind === 'solid') return fill.color;
  const id = `tp${++uid}`;
  const { start, end } = gradientLine(fill.angle, w, h);
  defs.push(
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x + start.x} y1={y + start.y} x2={x + end.x} y2={y + end.y}>
      {[...fill.stops]
        .sort((a, b) => a.offset - b.offset)
        .map((s) => (
          <stop offset={s.offset} stop-color={s.color} />
        ))}
    </linearGradient>,
  );
  return `url(#${id})`;
}

function layerSvg(l: Layer, defs: JSX.Element[]): JSX.Element | null {
  if (l.hidden) return null;
  const tf = `translate(${l.x} ${l.y}) rotate(${l.rotation})`;
  switch (l.type) {
    case 'background': {
      const fill = makeFill(l.props.fill, 0, 0, l.width, l.height, defs);
      return <rect transform={tf} width={l.width} height={l.height} fill={fill} opacity={l.opacity} />;
    }
    case 'shape': {
      const p = l.props;
      const fill = makeFill(p.fill, 0, 0, l.width, l.height, defs);
      const stroke = p.strokeWidth > 0 ? { stroke: p.stroke, 'stroke-width': p.strokeWidth } : {};
      if (p.kind === 'ellipse') {
        return <ellipse transform={tf} cx={l.width / 2} cy={l.height / 2} rx={l.width / 2} ry={l.height / 2} fill={fill} opacity={l.opacity} {...stroke} />;
      }
      return <path transform={tf} d={roundedRectD(0, 0, l.width, l.height, resolveCornerRadii(p.cornerRadius, l.width, l.height))} fill={fill} opacity={l.opacity} {...stroke} />;
    }
    case 'frame':
    case 'image': {
      const d = roundedRectD(0, 0, l.width, l.height, resolveCornerRadii(l.props.cornerRadius, l.width, l.height));
      const b = l.props.border;
      return (
        <g transform={tf} opacity={l.opacity}>
          <path d={d} fill="#d9dce3" stroke={b && b.width > 0 ? b.color : '#9aa0ad'} stroke-width={b && b.width > 0 ? b.width : 3} stroke-dasharray={b && b.width > 0 ? undefined : '14 10'} />
          <path d={`M${l.width * 0.18} ${l.height * 0.78} L${l.width * 0.4} ${l.height * 0.5} L${l.width * 0.55} ${l.height * 0.66} L${l.width * 0.7} ${l.height * 0.45} L${l.width * 0.84} ${l.height * 0.78} Z`} fill="#b9bfcc" />
          <circle cx={l.width * 0.7} cy={l.height * 0.28} r={Math.min(l.width, l.height) * 0.07} fill="#b9bfcc" />
        </g>
      );
    }
    case 'line': {
      const p = l.props;
      const { a, b } = linePoints(l);
      const w = Math.max(1, p.width);
      const dash = p.dash === 'dashed' ? `${w * 3} ${w * 2}` : p.dash === 'dotted' ? `0.01 ${w * 2}` : undefined;
      const caps = [capGeometry(p.startCap, a, b, w), capGeometry(p.endCap, b, a, w)];
      return (
        <g transform={tf} opacity={l.opacity}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={p.color} stroke-width={w} stroke-dasharray={dash} stroke-linecap={p.dash === 'dotted' ? 'round' : 'butt'} />
          {caps.map((c) =>
            !c ? null : c.kind === 'circle' ? (
              <circle cx={c.x} cy={c.y} r={c.r} fill={p.color} />
            ) : (
              <polygon points={c.points.join(' ')} fill={p.color} />
            ),
          )}
        </g>
      );
    }
    case 'text': {
      const p = l.props;
      return (
        <foreignObject transform={tf} width={l.width} height={Math.max(l.height, p.fontSize * p.lineHeight)} opacity={l.opacity} style="overflow:visible">
          <div
            // @ts-expect-error xmlns is valid on an HTML element inside foreignObject
            xmlns="http://www.w3.org/1999/xhtml"
            style={{
              width: `${l.width}px`,
              font: `${p.fontWeight} ${p.fontSize}px/${p.lineHeight} ${p.fontFamily}`,
              color: p.color,
              textAlign: p.align,
              letterSpacing: `${p.letterSpacing}px`,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word',
            }}
          >
            {p.text}
          </div>
        </foreignObject>
      );
    }
  }
}

/** Lightweight, dependency-free SVG sketch of a template or project (placeholders for photos). */
export function TemplatePreview({
  canvas,
  layers,
  class: className,
}: {
  canvas: CanvasSettings;
  layers: readonly Layer[];
  class?: string;
}) {
  const { width, height } = canvasSize(canvas);
  const defs: JSX.Element[] = [];
  const bg = makeFill(canvas.background, 0, 0, width, height, defs);
  const body = layers.map((l) => layerSvg(l, defs)); // fills the gradient defs before <defs> renders
  const clipId = `tpclip${++uid}`;
  const sw = canvas.slideWidthPx;
  return (
    <svg class={`tpl-preview ${className ?? ''}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img">
      <defs>{defs}</defs>
      <clipPath id={clipId}>
        <rect width={width} height={height} />
      </clipPath>
      <rect width={width} height={height} fill={bg} />
      <g clip-path={`url(#${clipId})`}>{body}</g>
      {Array.from({ length: canvas.slideCount - 1 }, (_, i) => (
        <line x1={(i + 1) * sw} y1={0} x2={(i + 1) * sw} y2={height} stroke="rgba(255,255,255,0.9)" stroke-width={Math.max(4, width / 400)} stroke-dasharray={`${width / 120} ${width / 120}`} />
      ))}
    </svg>
  );
}

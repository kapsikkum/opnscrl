import type Konva from 'konva';
import { gradientLine } from '../../core/geometry';
import type { Fill } from '../../core/types';

/** Apply a solid/gradient Fill to a Konva shape covering a (0,0,w,h) box. */
export function applyFill(shape: Konva.Shape, fill: Fill, width: number, height: number): void {
  if (fill.kind === 'solid') {
    shape.fillPriority('color');
    shape.fill(fill.color);
    return;
  }
  const { start, end } = gradientLine(fill.angle, width, height);
  const stops: (number | string)[] = [];
  for (const s of [...fill.stops].sort((a, b) => a.offset - b.offset)) stops.push(s.offset, s.color);
  shape.fillPriority('linear-gradient');
  shape.fillLinearGradientStartPoint(start);
  shape.fillLinearGradientEndPoint(end);
  shape.fillLinearGradientColorStops(stops);
}

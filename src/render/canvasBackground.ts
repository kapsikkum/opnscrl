import Konva from 'konva';
import { canvasSize } from '../core/geometry';
import type { CanvasSettings } from '../core/types';
import { applyFill } from '../layers/shared/fill';

/** The panorama's base fill (project.canvas.background). Shared by editor and exporter. */
export function createCanvasBackground(): Konva.Rect {
  return new Konva.Rect({ name: 'opnscrl-canvas-bg', listening: false });
}

export function updateCanvasBackground(rect: Konva.Rect, canvas: CanvasSettings): void {
  const { width, height } = canvasSize(canvas);
  rect.setAttrs({ x: 0, y: 0, width, height });
  applyFill(rect, canvas.background, width, height);
}

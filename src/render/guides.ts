import Konva from 'konva';
import { canvasSize, slideHeightPx } from '../core/geometry';
import type { CanvasSettings } from '../core/types';

export interface GuideOptions {
  /** Dashed lines at slide boundaries. Default true. */
  seams: boolean;
  /**
   * Safe-area rectangle drawn inside every slide, as fractions of the slide
   * size on each side (e.g. 0.05 = 5%). null disables it.
   */
  safeArea: { insetX: number; insetY: number } | null;
}

export const defaultGuides: GuideOptions = { seams: true, safeArea: null };

/**
 * Editor-only overlay. Lives in its own Konva layer that the exporter never
 * creates, so guides can never leak into exported slices.
 */
export function rebuildGuides(group: Konva.Group, canvas: CanvasSettings, opts: GuideOptions): void {
  group.destroyChildren();
  const { width, height } = canvasSize(canvas);
  const sw = canvas.slideWidthPx;
  const sh = slideHeightPx(canvas);

  const outline = { listening: false, strokeScaleEnabled: false } as const;
  group.add(new Konva.Rect({ ...outline, width, height, stroke: 'rgba(0,0,0,0.35)', strokeWidth: 1 }));

  if (opts.seams) {
    for (let i = 1; i < canvas.slideCount; i++) {
      const x = i * sw;
      const points = [x, 0, x, height];
      // dark underlay + light dashes: readable on any background
      group.add(new Konva.Line({ ...outline, points, stroke: 'rgba(0,0,0,0.5)', strokeWidth: 2 }));
      group.add(new Konva.Line({ ...outline, points, stroke: '#ffffff', strokeWidth: 1, dash: [6, 6] }));
    }
  }

  if (opts.safeArea) {
    const { insetX, insetY } = opts.safeArea;
    for (let i = 0; i < canvas.slideCount; i++) {
      group.add(
        new Konva.Rect({
          ...outline,
          x: i * sw + sw * insetX,
          y: sh * insetY,
          width: sw * (1 - 2 * insetX),
          height: sh * (1 - 2 * insetY),
          stroke: '#38bdf8',
          strokeWidth: 1,
          dash: [3, 5],
        }),
      );
    }
  }
}

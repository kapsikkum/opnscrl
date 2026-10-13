import { aspectParts } from '../core/geometry';
import type { Aspect } from '../core/types';

export const ASPECT_LABELS: Record<Aspect, { name: string; hint: string }> = {
  '4:5': { name: '4:5', hint: 'Portrait (feed)' },
  '1:1': { name: '1:1', hint: 'Square' },
  '9:16': { name: '9:16', hint: 'Story / reel' },
  '3:4': { name: '3:4', hint: 'Portrait' },
  '2:3': { name: '2:3', hint: 'Tall portrait' },
  '4:3': { name: '4:3', hint: 'Landscape' },
  '16:9': { name: '16:9', hint: 'Widescreen' },
  '1.91:1': { name: '1.91:1', hint: 'Wide landscape' },
  custom: { name: 'Custom', hint: 'Set the height' },
};

/** width / height of one slide, for drawing little ratio swatches. */
export function aspectRatio(aspect: Aspect, customHeightPx: number): number {
  const [w, h] = aspectParts(aspect, customHeightPx);
  return w / h;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day');
  return new Date(ts).toLocaleDateString();
}

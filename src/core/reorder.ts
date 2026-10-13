/**
 * Index math for drag-reordering a front-first list (the layer panel shows the
 * z-order reversed: the model's last layer is the first row).
 */

/**
 * Convert a drop position into the model index for a `reorder` op.
 *
 * @param count    number of layers
 * @param modelIndex current model (back-to-front) index of the dragged layer
 * @param gap      insertion gap in the displayed (front-first) list, 0..count.
 *                 Gap `g` sits just before displayed row `g`; `count` = after the last row.
 * @returns the target model index, or null when the drop would not change the order
 */
export function reorderTarget(count: number, modelIndex: number, gap: number): number | null {
  if (count < 2 || modelIndex < 0 || modelIndex >= count) return null;
  const g = Math.max(0, Math.min(count, Math.round(gap)));
  const row = count - 1 - modelIndex; // displayed row of the dragged layer
  const position = g > row ? g - 1 : g; // displayed row after removing it
  if (position === row) return null;
  return count - 1 - position;
}

/** Which gap (0..n) a pointer at `y` is over, given the vertical midpoints of the displayed rows. */
export function gapAt(y: number, midpoints: readonly number[]): number {
  let gap = 0;
  for (const m of midpoints) if (y > m) gap++;
  return gap;
}

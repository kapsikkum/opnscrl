import { effect, signal } from '@preact/signals';

/** Editor view preferences, remembered per browser. */
const KEY = 'opnscrl:view';

interface Stored {
  seams: boolean;
  safeArea: boolean;
  snapping: boolean;
}

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Stored>;
    return { seams: raw.seams ?? true, safeArea: raw.safeArea ?? false, snapping: raw.snapping ?? true };
  } catch {
    return { seams: true, safeArea: false, snapping: true };
  }
}

const initial = load();
export const showSeams = signal(initial.seams);
export const showSafeArea = signal(initial.safeArea);
export const snapping = signal(initial.snapping);

effect(() => {
  const v: Stored = { seams: showSeams.value, safeArea: showSafeArea.value, snapping: snapping.value };
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
});

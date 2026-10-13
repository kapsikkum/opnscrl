import { signal } from '@preact/signals';
import { closeSession, currentSession, openProject } from '../app/session';
import { toast } from '../app/services';

export type View = 'home' | 'editor';

/** Which screen is showing. Kept in history.state so the browser/hardware back button works. */
export const view = signal<View>('home');

export function showEditor(): void {
  if (view.peek() === 'editor') return;
  history.pushState({ view: 'editor' }, '');
  view.value = 'editor';
}

/** Leave the editor (flushes autosave first). */
export async function goHome(): Promise<void> {
  if (view.peek() === 'home') return;
  view.value = 'home';
  if (history.state?.view === 'editor') history.back();
  await closeSession();
}

export async function openAndShow(id: string): Promise<boolean> {
  const s = await openProject(id);
  if (!s) {
    toast('That project could not be opened.', 'error');
    return false;
  }
  showEditor();
  return true;
}

export function initNavigation(): void {
  history.replaceState({ view: 'home' }, '');
  window.addEventListener('popstate', (e) => {
    const target: View = (e.state as { view?: View } | null)?.view === 'editor' ? 'editor' : 'home';
    if (target === 'home' && view.peek() === 'editor') {
      view.value = 'home';
      void closeSession();
    } else if (target === 'editor' && !currentSession.peek()) {
      history.replaceState({ view: 'home' }, '');
      view.value = 'home';
    }
  });
}

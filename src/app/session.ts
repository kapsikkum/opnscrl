/**
 * The open document: an Editor (signals + history), its autosave, and small
 * pieces of per-session UI state. Opening/creating/closing projects goes
 * through here so persistence and the renderer never disagree about what is open.
 */
import { effect, signal, type Signal } from '@preact/signals';
import { createProject, type CreateProjectOptions } from '../core/project';
import type { Project } from '../core/types';
import { createAutosave, loadProject, saveProject, type SaveStatus } from '../storage';
import { createEditor, type Editor } from '../state/editor';
import { ensureProjectFonts } from './fonts';
import { renderThumbnail } from './thumbnails';

const LAST_KEY = 'opnscrl:lastProject';

export interface Session {
  readonly editor: Editor;
  readonly projectId: string;
  readonly status: Signal<SaveStatus>;
  /** 0-based slide new content goes to; also what the slide controls act on. */
  readonly currentSlide: Signal<number>;
  flush(): Promise<void>;
  /** Flush, refresh the thumbnail and tear down. */
  close(): Promise<void>;
}

export const currentSession = signal<Session | null>(null);

export function rememberLastProject(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* storage may be blocked */
  }
}

export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function startSession(project: Project): Session {
  const editor = createEditor(project);
  const status = signal<SaveStatus>('saved');
  const currentSlide = signal(0);
  let thumbTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const autosave = createAutosave({
    save: saveProject,
    delay: 800,
    onStatus: (s) => {
      status.value = s;
      if (s === 'saved' && !closed) {
        if (thumbTimer) clearTimeout(thumbTimer);
        thumbTimer = setTimeout(() => void renderThumbnail(editor.project.peek()), 4000);
      }
    },
  });
  const stop = effect(() => {
    const p = editor.project.value;
    if (p !== project) autosave.schedule(p); // the untouched initial project is already saved
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') void autosave.flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  const session: Session = {
    editor,
    projectId: project.id,
    status,
    currentSlide,
    flush: () => autosave.flush(),
    async close() {
      if (closed) return;
      closed = true;
      stop();
      if (thumbTimer) clearTimeout(thumbTimer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      await autosave.flush();
      autosave.dispose();
      await renderThumbnail(editor.project.peek());
    },
  };
  return session;
}

async function activate(project: Project): Promise<Session> {
  await currentSession.peek()?.close();
  const session = startSession(project);
  currentSession.value = session;
  rememberLastProject(project.id);
  void ensureProjectFonts(project);
  return session;
}

/** Open a stored project. Returns null if it no longer exists or is unreadable. */
export async function openProject(id: string): Promise<Session | null> {
  try {
    const project = await loadProject(id);
    if (!project) return null;
    return await activate(project);
  } catch (e) {
    console.error('openProject failed', e);
    return null;
  }
}

/** Persist a brand-new project (e.g. from the New dialog or a template) and open it. */
export async function openNewProject(project: Project): Promise<Session> {
  await saveProject(project);
  return activate(project);
}

export async function createBlankProject(opts: CreateProjectOptions): Promise<Session> {
  return openNewProject(createProject(opts));
}

export async function closeSession(): Promise<void> {
  const s = currentSession.peek();
  if (!s) return;
  currentSession.value = null;
  rememberLastProject(null);
  await s.close();
}

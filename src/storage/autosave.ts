import type { Project } from '../core/types';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface AutosaveOptions {
  save: (project: Project) => Promise<void>;
  /** Debounce in ms. Default 800. */
  delay?: number;
  onStatus?: (status: SaveStatus, error?: unknown) => void;
}

export interface Autosave {
  /** Call on every change; the latest project is saved after `delay` ms of quiet. */
  schedule(project: Project): void;
  /** Save now if anything is pending; resolves when the write finished. */
  flush(): Promise<void>;
  /** Stop timers (pending changes are dropped unless flushed first). */
  dispose(): void;
}

/**
 * Debounced saver for the open project. Writes are serialized, so a slow write
 * never overlaps a newer one, and the newest pending project always wins.
 */
export function createAutosave(opts: AutosaveOptions): Autosave {
  const delay = opts.delay ?? 800;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Project | null = null;
  let lastSaved: Project | null = null;
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;

  const run = (): Promise<void> => {
    timer = null;
    const project = pending;
    pending = null;
    if (!project || project === lastSaved) return chain;
    opts.onStatus?.('saving');
    chain = chain.then(async () => {
      try {
        await opts.save(project);
        lastSaved = project;
        opts.onStatus?.(pending ? 'dirty' : 'saved');
      } catch (e) {
        pending ??= project; // retry with the next change / flush
        opts.onStatus?.('error', e);
      }
    });
    return chain;
  };

  return {
    schedule(project) {
      if (disposed) return;
      if (project === lastSaved && !pending) return;
      pending = project;
      opts.onStatus?.('dirty');
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delay);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      await run();
      await chain;
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

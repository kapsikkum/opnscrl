/**
 * Reactive editor store (signals). Holds the project, its undo history and the
 * selection. UI code reads signals; every model change goes through dispatch().
 * Depends only on core (not on render/layers), so it is trivially testable.
 */
import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { DoOptions, HistoryOptions } from '../core/history';
import { History } from '../core/history';
import type { Op } from '../core/commands';
import type { Layer, Project } from '../core/types';

export interface Editor {
  readonly project: ReadonlySignal<Project>;
  readonly selection: ReadonlySignal<readonly string[]>;
  readonly selectedLayers: ReadonlySignal<readonly Layer[]>;
  readonly canUndo: ReadonlySignal<boolean>;
  readonly canRedo: ReadonlySignal<boolean>;
  dispatch(op: Op, opts?: DoOptions): void;
  undo(): void;
  redo(): void;
  select(ids: readonly string[]): void;
  /** Replace the document (e.g. open / new) and clear history + selection. */
  load(project: Project): void;
  readonly history: History;
}

export function createEditor(initial: Project, historyOpts?: HistoryOptions): Editor {
  const history = new History(initial, historyOpts);
  const project = signal(initial);
  const selection = signal<readonly string[]>([]);
  const canUndo = signal(false);
  const canRedo = signal(false);

  const sync = () => {
    project.value = history.project;
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
    // drop ids that no longer exist (deleted layer, undone add...)
    const ids = new Set(history.project.layers.map((l) => l.id));
    const kept = selection.peek().filter((id) => ids.has(id));
    if (kept.length !== selection.peek().length) selection.value = kept;
  };
  history.subscribe(sync);

  return {
    project,
    selection,
    selectedLayers: computed(() => {
      const ids = new Set(selection.value);
      return project.value.layers.filter((l) => ids.has(l.id));
    }),
    canUndo,
    canRedo,
    dispatch: (op, opts) => void history.do(op, opts),
    undo: () => void history.undo(),
    redo: () => void history.redo(),
    select: (ids) => {
      selection.value = [...ids];
    },
    load: (p) => {
      selection.value = [];
      history.reset(p);
    },
    history,
  };
}

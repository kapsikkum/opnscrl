import { applyOp, mergeOps, type Op } from './commands';
import type { Project } from './types';

interface Entry {
  op: Op;
  inverse: Op;
  key?: string;
  time: number;
  label?: string;
}

export interface DoOptions {
  /** Consecutive ops with the same key (within `coalesceMs`) become one undo step, e.g. `drag:<layerId>`. */
  coalesceKey?: string;
  label?: string;
}

export interface HistoryOptions {
  /** Max undo steps kept. Default 200. */
  limit?: number;
  /** Coalescing window in ms. Default 1000. */
  coalesceMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

/**
 * Linear undo/redo stack over a Project. The History owns the current
 * project; `do()` applies an Op, `undo()`/`redo()` replay inverses/originals.
 * If an op throws (e.g. unknown layer id) the state is left untouched.
 */
export class History {
  private _project: Project;
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private listeners = new Set<() => void>();
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;
  /** Set when the top of the undo stack may still absorb a coalesced op. */
  private mergeable = false;

  constructor(initial: Project, opts: HistoryOptions = {}) {
    this._project = initial;
    this.limit = opts.limit ?? 200;
    this.coalesceMs = opts.coalesceMs ?? 1000;
    this.now = opts.now ?? Date.now;
  }

  get project(): Project {
    return this._project;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  get undoCount(): number {
    return this.undoStack.length;
  }

  do(op: Op, opts: DoOptions = {}): Project {
    const result = applyOp(this._project, op); // throws before any state change
    const time = this.now();
    const next: Project = { ...result.project, updatedAt: time };
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      opts.coalesceKey !== undefined &&
      this.mergeable &&
      top &&
      top.key === opts.coalesceKey &&
      time - top.time <= this.coalesceMs
    ) {
      const merged = mergeOps(top, { op, inverse: result.inverse });
      top.op = merged.op;
      top.inverse = merged.inverse;
      top.time = time;
    } else {
      this.undoStack.push({ op, inverse: result.inverse, key: opts.coalesceKey, time, label: opts.label });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.redoStack = [];
    this.mergeable = opts.coalesceKey !== undefined;
    this._project = next;
    this.emit();
    return next;
  }

  undo(): Project {
    const entry = this.undoStack.pop();
    if (!entry) return this._project;
    const r = applyOp(this._project, entry.inverse);
    this._project = { ...r.project, updatedAt: this.now() };
    this.redoStack.push(entry);
    this.mergeable = false;
    this.emit();
    return this._project;
  }

  redo(): Project {
    const entry = this.redoStack.pop();
    if (!entry) return this._project;
    const r = applyOp(this._project, entry.op);
    this._project = { ...r.project, updatedAt: this.now() };
    this.undoStack.push(entry);
    this.mergeable = false;
    this.emit();
    return this._project;
  }

  /** Stop the next op from merging into the previous one (e.g. on pointer-up). */
  breakCoalescing(): void {
    this.mergeable = false;
  }

  /** Replace the project (e.g. opening a document) and clear history. */
  reset(project: Project): void {
    this._project = project;
    this.undoStack = [];
    this.redoStack = [];
    this.mergeable = false;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }
}

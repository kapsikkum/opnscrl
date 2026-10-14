/**
 * User-level editing actions. Every one of them builds core ops and sends them
 * through Editor.dispatch (History), so everything is undoable and nothing
 * mutates the model directly.
 */
import type { Op } from '../core/commands';
import { slideRects } from '../core/geometry';
import { gridOps, type GridArgs } from '../core/grid';
import { createId } from '../core/id';
import { insertSlideOps, layerSlideIndex, layersOnSlide, moveSlideOps, removeSlideOps } from '../core/slides';
import type { CanvasSettings, Fill, Layer, LayerPatch, Project } from '../core/types';
import { createLayer } from '../layers';
import type { Editor } from '../state/editor';
import { prepareImage, putAsset } from '../storage';
import { assetResolver, errorMessage } from './services';

const clampSlide = (p: Project, i: number) => Math.max(0, Math.min(p.canvas.slideCount - 1, Math.round(i)));

/** Slide rectangle + helpers for placing new content on a slide. */
function slideBox(p: Project, slide: number) {
  const s = slideRects(p.canvas)[clampSlide(p, slide)]!;
  return {
    ...s,
    center: (w: number, h: number) => ({ x: Math.round(s.x + (s.width - w) / 2), y: Math.round((s.height - h) / 2) }),
  };
}

function addAndSelect(editor: Editor, layer: Layer): void {
  editor.dispatch({ op: 'addLayer', layer });
  editor.select([layer.id]);
}

export function addText(editor: Editor, slide: number): string {
  const p = editor.project.peek();
  const b = slideBox(p, slide);
  const w = Math.round(b.width * 0.8);
  const pos = b.center(w, 110);
  const layer = createLayer('text', { x: pos.x, y: Math.round(b.height / 2 - 55), width: w, props: { text: 'Your text', align: 'center' } });
  addAndSelect(editor, layer);
  return layer.id;
}

export function addShape(editor: Editor, slide: number, kind: 'rect' | 'ellipse'): void {
  const p = editor.project.peek();
  const b = slideBox(p, slide);
  const size = Math.round(Math.min(b.width, b.height) * 0.45);
  const pos = b.center(size, size);
  addAndSelect(
    editor,
    createLayer('shape', {
      name: kind === 'rect' ? 'Rectangle' : 'Ellipse',
      x: pos.x,
      y: pos.y,
      width: size,
      height: size,
      props: { kind, fill: { kind: 'solid', color: kind === 'rect' ? '#ff5a36' : '#2f7cf6' }, cornerRadius: kind === 'rect' ? 24 : 0 },
    }),
  );
}

export function addLine(editor: Editor, slide: number): void {
  const p = editor.project.peek();
  const b = slideBox(p, slide);
  const w = Math.round(b.width * 0.7);
  const pos = b.center(w, 48);
  addAndSelect(editor, createLayer('line', { x: pos.x, y: Math.round(b.height / 2 - 24), width: w, height: 48, props: { endCap: 'arrow' } }));
}

export function addFrame(editor: Editor, slide: number): void {
  const p = editor.project.peek();
  const b = slideBox(p, slide);
  const w = Math.round(b.width * 0.7);
  const h = Math.round(Math.min(b.height * 0.7, w * 1.25));
  const pos = b.center(w, h);
  addAndSelect(editor, createLayer('frame', { x: pos.x, y: pos.y, width: w, height: h }));
}

export function addGrid(editor: Editor, args: GridArgs): string[] {
  const p = editor.project.peek();
  const ops = gridOps(p, args);
  editor.dispatch({ op: 'batch', ops });
  const ids = ops.flatMap((o) => (o.op === 'addLayer' ? [o.layer.id] : []));
  editor.select(ids);
  return ids;
}

// ---------- photos ----------

export interface AddPhotosResult {
  filled: number;
  added: number;
  failed: { name: string; reason: string }[];
}

function isEmptyFrame(l: Layer): boolean {
  return l.type === 'frame' && !l.props.assetId && !l.hidden && !l.locked;
}

/**
 * Frames that incoming photos fill: only when an empty frame is selected, that frame
 * first, then (for further files) the remaining empty frames in reading order.
 * No empty frame selected -> [] (photos become free-floating image layers).
 */
export function pickFillTargets(layers: readonly Layer[], selection: ReadonlySet<string>): Layer[] {
  const empty = layers.filter(isEmptyFrame);
  const order = (a: Layer, b: Layer) => (a.x === b.x ? a.y - b.y : a.x - b.x);
  const sel = empty.filter((l) => selection.has(l.id)).sort(order);
  if (!sel.length) return [];
  return [...sel, ...empty.filter((l) => !selection.has(l.id)).sort(order)];
}

/**
 * Add photos. A selected empty frame takes the first photo (more photos continue
 * into other empty frames); otherwise photos become free image layers centered on
 * the current slide.
 */
export async function addPhotos(editor: Editor, files: readonly File[], currentSlide: number): Promise<AddPhotosResult> {
  const result: AddPhotosResult = { filled: 0, added: 0, failed: [] };
  const prepared: Awaited<ReturnType<typeof prepareImage>>[] = [];
  const names: string[] = [];
  for (const file of files) {
    if (file.type && !file.type.startsWith('image/')) {
      result.failed.push({ name: file.name, reason: 'Not an image' });
      continue;
    }
    try {
      prepared.push(await prepareImage(file));
      names.push(file.name);
    } catch (e) {
      result.failed.push({ name: file.name, reason: errorMessage(e) });
    }
  }
  if (!prepared.length) return result;

  const ops: Op[] = [];
  const project = editor.project.peek();
  const selection = new Set(editor.selection.peek());

  const targets = pickFillTargets(project.layers, selection);

  const newIds: string[] = [];
  const slideCursor = clampSlide(project, currentSlide);
  let added = 0;
  for (let i = 0; i < prepared.length; i++) {
    const img = prepared[i]!;
    const assetId = await putAsset(img.blob);
    if (img.source) assetResolver.prime(assetId, img.source);
    ops.push({ op: 'addAsset', id: assetId, meta: { mime: img.mime, w: img.w, h: img.h } });
    const frame = targets.shift();
    if (frame) {
      ops.push({ op: 'updateLayer', id: frame.id, patch: { props: { assetId } } });
      newIds.push(frame.id);
      result.filled++;
      continue;
    }
    const b = slideBox(project, slideCursor);
    const aspect = img.w / img.h;
    let h = b.height * 0.8;
    let w = h * aspect;
    if (w > b.width * 0.92) {
      w = b.width * 0.92;
      h = w / aspect;
    }
    const jitter = added * 40;
    const pos = b.center(Math.round(w), Math.round(h));
    const layer = createLayer('image', {
      name: names[i]!.replace(/\.[a-z0-9]+$/i, '') || 'Photo',
      x: pos.x + jitter,
      y: pos.y + jitter,
      width: Math.round(w),
      height: Math.round(h),
      props: { assetId },
    });
    ops.push({ op: 'addLayer', layer });
    newIds.push(layer.id);
    result.added++;
    added++;
  }
  editor.dispatch({ op: 'batch', ops });
  editor.select(newIds);
  return result;
}

/** Put a photo into an existing frame/image layer (replace). */
export async function replacePhoto(editor: Editor, layerId: string, file: File): Promise<void> {
  const img = await prepareImage(file);
  const assetId = await putAsset(img.blob);
  if (img.source) assetResolver.prime(assetId, img.source);
  editor.dispatch({
    op: 'batch',
    ops: [
      { op: 'addAsset', id: assetId, meta: { mime: img.mime, w: img.w, h: img.h } },
      { op: 'updateLayer', id: layerId, patch: { props: { assetId } } },
    ],
  });
}

export function clearPhoto(editor: Editor, layerId: string): void {
  editor.dispatch({ op: 'updateLayer', id: layerId, patch: { props: { assetId: null } } });
}

// ---------- layer operations ----------

export function patchLayer(editor: Editor, id: string, patch: LayerPatch, coalesceKey?: string): void {
  editor.dispatch({ op: 'updateLayer', id, patch }, coalesceKey ? { coalesceKey } : undefined);
}

export function deleteSelected(editor: Editor): void {
  const ids = editor.selection.peek();
  if (!ids.length) return;
  editor.dispatch({ op: 'batch', ops: ids.map((id) => ({ op: 'removeLayer' as const, id })) });
}

export function deleteLayer(editor: Editor, id: string): void {
  editor.dispatch({ op: 'removeLayer', id });
}

export function duplicateLayers(editor: Editor, ids: readonly string[]): void {
  if (!ids.length) return;
  const newIds = ids.map(() => createId('lyr'));
  editor.dispatch({ op: 'batch', ops: ids.map((id, i): Op => ({ op: 'duplicate', id, newId: newIds[i]!, offset: { x: 40, y: 40 } })) });
  editor.select(newIds);
}

export function duplicateSelected(editor: Editor): void {
  duplicateLayers(editor, editor.selection.peek());
}

/** Move selected layers by (dx, dy) px; consecutive nudges of the same layers share one undo step. */
export function nudgeSelected(editor: Editor, dx: number, dy: number): void {
  const p = editor.project.peek();
  const ids = editor.selection.peek();
  const ops: Op[] = [];
  for (const l of p.layers) {
    if (ids.includes(l.id) && !l.locked) ops.push({ op: 'updateLayer', id: l.id, patch: { x: l.x + dx, y: l.y + dy } });
  }
  if (!ops.length) return;
  editor.dispatch(ops.length === 1 ? ops[0]! : { op: 'batch', ops }, { coalesceKey: `nudge:${ids.join(',')}` });
}

/** Move a layer one step in the z-order. `delta` +1 = towards the front. */
export function moveInStack(editor: Editor, id: string, delta: number): void {
  const p = editor.project.peek();
  const i = p.layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  const to = Math.max(0, Math.min(p.layers.length - 1, i + delta));
  if (to !== i) editor.dispatch({ op: 'reorder', id, toIndex: to });
}

export function selectAll(editor: Editor): void {
  editor.select(editor.project.peek().layers.filter((l) => !l.locked && !l.hidden).map((l) => l.id));
}

// ---------- slides & canvas ----------

export function addSlideAt(editor: Editor, index: number): boolean {
  const op = insertSlideOps(editor.project.peek(), index);
  if (!op) return false;
  editor.dispatch(op);
  return true;
}

export function removeSlide(editor: Editor, index: number): boolean {
  const op = removeSlideOps(editor.project.peek(), index);
  if (!op) return false;
  editor.dispatch(op);
  return true;
}

export function moveSlide(editor: Editor, index: number, dir: -1 | 1): boolean {
  const op = moveSlideOps(editor.project.peek(), index, dir);
  if (!op) return false;
  editor.dispatch(op);
  return true;
}

export function layerCountOnSlide(project: Project, index: number): number {
  return layersOnSlide(project, index).length;
}

export function setCanvasSettings(editor: Editor, patch: Partial<CanvasSettings>): void {
  editor.dispatch({ op: 'setCanvas', patch, fitBackgrounds: true, fitLayers: true }, { coalesceKey: `canvas:${Object.keys(patch).join(',')}` });
}

export function setCanvasBackground(editor: Editor, fill: Fill): void {
  editor.dispatch({ op: 'setCanvas', patch: { background: fill } }, { coalesceKey: 'canvas:background' });
}

/** The slide a layer mostly sits on. */
export function slideOfLayer(project: Project, layer: Layer): number {
  return layerSlideIndex(layer, project);
}


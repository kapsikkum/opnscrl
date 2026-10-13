import Konva from 'konva';
import { canvasSize, layerBounds, slideRects, type Rect } from '../core/geometry';
import type { CanvasSettings, Layer, LayerPatch, Project } from '../core/types';
import { LAYER_NAME } from '../layers/shared/base';
import type { AssetResolver } from '../layers/types';
import { createAssetCache } from './assets';
import { createCanvasBackground, updateCanvasBackground } from './canvasBackground';
import { defaultGuides, rebuildGuides, type GuideOptions } from './guides';
import { Reconciler } from './reconcile';
import {
  collectSnapTargets,
  snapRect,
  snapResizeBox,
  unionRects,
  type Guide,
  type ResizeAnchor,
  type SnapTargets,
} from './snap';

export interface RendererOptions {
  /** Injected asset lookup; the renderer memoizes it per asset id. */
  resolveAsset: AssetResolver;
  /** Initial guide settings (seams on, safe area off by default). */
  guides?: Partial<GuideOptions>;
  /** Empty space around the canvas for zoomToFit, in screen px. Default 32. */
  padding?: number;
}

export interface LayerChange {
  id: string;
  patch: LayerPatch;
}

/**
 * Emitted when the user finishes dragging or transforming. The renderer never
 * mutates the model: turn `changes` into updateLayer commands (one batch op,
 * ideally with a coalesce key). If the host does not call setProject with the
 * result, the renderer snaps the nodes back to the model on the next tick.
 */
export interface TransformEndEvent {
  kind: 'drag' | 'transform';
  changes: LayerChange[];
}

export interface RendererEvents {
  select: string[];
  'transform-end': TransformEndEvent;
  /** Double-click / double-tap on a layer. */
  activate: string;
}

export interface Renderer {
  setProject(project: Project): void;
  /** Programmatic selection (does not emit 'select'). Unknown ids are ignored. */
  setSelection(ids: readonly string[]): void;
  on<K extends keyof RendererEvents>(event: K, cb: (payload: RendererEvents[K]) => void): () => void;
  zoomToFit(): void;
  /** Zoom and center so the given panorama-pixel rectangle fills the viewport. */
  zoomToRect(rect: Rect): void;
  /** Zoom to one slide (0-based). */
  zoomToSlide(index: number): void;
  getZoom(): number;
  /** Re-render text layers (call after web fonts finish loading so text is re-measured). */
  refreshText(): void;
  /** Enable or disable drag snapping (Alt also disables it temporarily). Default on. */
  setSnapping(enabled: boolean): void;
  /** Zoom around the viewport center. */
  setZoom(scale: number): void;
  setGuides(opts: Partial<GuideOptions>): void;
  /** The underlying Konva stage (escape hatch for tests and tooling). */
  readonly stage: Konva.Stage;
  destroy(): void;
}

/** Snap tolerance in screen pixels. */
const SNAP_PX = 8;
type KonvaBox = Parameters<NonNullable<Konva.TransformerConfig['boundBoxFunc']>>[0];
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 4;
const r2 = (v: number) => Math.round(v * 100) / 100;
const normalizeAngle = (a: number) => {
  const m = ((((a + 180) % 360) + 360) % 360) - 180;
  return m === -180 ? 180 : m;
};

export function createRenderer(container: HTMLDivElement, opts: RendererOptions): Renderer {
  const resolveAsset = createAssetCache(opts.resolveAsset);
  const padding = opts.padding ?? 32;

  const stage = new Konva.Stage({
    container,
    width: container.clientWidth || 300,
    height: container.clientHeight || 300,
  });
  const artLayer = new Konva.Layer({ listening: false });
  const contentLayer = new Konva.Layer();
  const uiLayer = new Konva.Layer();
  stage.add(artLayer, contentLayer, uiLayer);

  const artboard = createCanvasBackground();
  artboard.setAttrs({
    shadowColor: 'rgba(0,0,0,0.45)',
    shadowBlur: 32,
    shadowOffsetY: 8,
    shadowForStrokeEnabled: false,
  });
  artLayer.add(artboard);

  const world = new Konva.Group();
  contentLayer.add(world);

  const guidesGroup = new Konva.Group({ listening: false });
  const transformer = new Konva.Transformer({
    rotateEnabled: true,
    flipEnabled: false,
    ignoreStroke: true,
    keepRatio: true,
    anchorSize: 11,
    anchorCornerRadius: 3,
    anchorStroke: '#2f7cf6',
    anchorFill: '#ffffff',
    borderStroke: '#2f7cf6',
    rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
    rotationSnapTolerance: 4,
    boundBoxFunc: (oldBox, newBox) => resizeBound(oldBox, newBox),
  });
  const snapGroup = new Konva.Group({ listening: false });
  uiLayer.add(guidesGroup, snapGroup, transformer);

  // ---- state ----
  let project: Project | null = null;
  let prevCanvas: CanvasSettings | null = null;
  let layerById = new Map<string, Layer>();
  let selection: string[] = [];
  let version = 0;
  let fitMode = true;
  let guideOpts: GuideOptions = { ...defaultGuides, ...opts.guides };
  const listeners: { [K in keyof RendererEvents]: Set<(p: RendererEvents[K]) => void> } = {
    select: new Set(),
    'transform-end': new Set(),
    activate: new Set(),
  };
  let snapping = true;
  function emit<K extends keyof RendererEvents>(event: K, payload: RendererEvents[K]): void {
    for (const cb of [...listeners[event]]) cb(payload);
  }

  const reconciler = new Reconciler(
    world,
    {
      mode: 'edit',
      resolveAsset,
      track: () => {},
    },
    (node, layer) => {
      node.draggable(!layer.locked && !layer.hidden);
      node.listening(!layer.locked && !layer.hidden);
    },
  );

  // ---- selection / transformer ----
  function isInteractive(id: string): boolean {
    const l = layerById.get(id);
    return !!l && !l.locked && !l.hidden;
  }

  function attachTransformer(): void {
    const nodes: Konva.Node[] = [];
    let hasText = false;
    for (const id of selection) {
      if (!isInteractive(id)) continue;
      const n = reconciler.getNode(id);
      if (!n) continue;
      nodes.push(n);
      if (layerById.get(id)?.type === 'text') hasText = true;
    }
    transformer.enabledAnchors(
      hasText
        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']
        : ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
    );
    transformer.nodes(nodes);
    uiLayer.batchDraw();
  }

  function pruneSelection(): void {
    selection = selection.filter((id) => layerById.has(id));
  }

  function userSelect(ids: string[]): void {
    selection = ids.filter((id) => layerById.has(id));
    attachTransformer();
    emit('select', [...selection]);
  }

  // ---- model sync ----
  function updateClip(): void {
    if (!project) return;
    const { width, height } = canvasSize(project.canvas);
    contentLayer.clip({ x: 0, y: 0, width, height });
  }

  function setProject(next: Project): void {
    const first = project === null;
    project = next;
    version++;
    layerById = new Map(next.layers.map((l) => [l.id, l]));

    if (prevCanvas !== next.canvas) {
      const sizeChanged =
        !prevCanvas ||
        canvasSize(prevCanvas).width !== canvasSize(next.canvas).width ||
        canvasSize(prevCanvas).height !== canvasSize(next.canvas).height;
      updateCanvasBackground(artboard, next.canvas);
      updateClip();
      rebuildGuides(guidesGroup, next.canvas, guideOpts);
      prevCanvas = next.canvas;
      if (first || (sizeChanged && fitMode)) zoomToFit();
      artLayer.batchDraw();
    }

    reconciler.sync(next.layers);
    pruneSelection();
    attachTransformer();
    contentLayer.batchDraw();
  }

  // ---- interaction: selection ----
  function findLayerGroup(node: Konva.Node): Konva.Node | null {
    let n: Konva.Node | null = node;
    while (n && n !== stage) {
      if (n.hasName(LAYER_NAME)) return n;
      n = n.getParent();
    }
    return null;
  }
  function insideTransformer(node: Konva.Node): boolean {
    let n: Konva.Node | null = node;
    while (n) {
      if (n === transformer) return true;
      n = n.getParent();
    }
    return false;
  }

  let pinching = false;
  // one-pointer pan when dragging empty space
  let pan: { px: number; py: number; sx: number; sy: number } | null = null;
  function beginPan(): void {
    const p = stage.getPointerPosition();
    pan = p ? { px: p.x, py: p.y, sx: stage.x(), sy: stage.y() } : null;
  }
  stage.on('mousemove touchmove', () => {
    if (!pan || pinching) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    fitMode = false;
    applyViewport(stage.scaleX(), pan.sx + (p.x - pan.px), pan.sy + (p.y - pan.py));
  });
  window.addEventListener('mouseup', endPan);
  window.addEventListener('touchend', endPan);
  window.addEventListener('touchcancel', endPan);
  function endPan(): void {
    pan = null;
  }
  stage.on('mousedown touchstart', (e) => {
    if (pinching) return;
    const target = e.target;
    if (target === stage) {
      if (selection.length) userSelect([]);
      beginPan();
      return;
    }
    if (insideTransformer(target)) return;
    const group = findLayerGroup(target);
    if (!group) {
      if (selection.length) userSelect([]);
      beginPan();
      return;
    }
    const id = group.id();
    const evt = e.evt as MouseEvent;
    if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
      userSelect(selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]);
    } else if (!selection.includes(id)) {
      userSelect([id]);
    }
  });

  // ---- interaction: drag (multi-select aware, with snapping) ----
  let dragAnchor: Konva.Node | null = null;
  let dragStart = new Map<string, { x: number; y: number }>();
  let dragBounds: Rect | null = null;
  let snapTargets: SnapTargets | null = null;

  const nodeBounds = (n: Konva.Node): Rect =>
    layerBounds({ x: n.x(), y: n.y(), width: n.width(), height: n.height(), rotation: n.rotation() });

  function showSnapGuides(guides: readonly Guide[]): void {
    snapGroup.destroyChildren();
    for (const g of guides) {
      const points = g.orientation === 'v' ? [g.pos, g.from, g.pos, g.to] : [g.from, g.pos, g.to, g.pos];
      snapGroup.add(
        new Konva.Line({ points, stroke: '#ff2d78', strokeWidth: 1, strokeScaleEnabled: false, listening: false }),
      );
    }
    uiLayer.batchDraw();
  }
  function clearSnapGuides(): void {
    if (snapGroup.getChildren().length) {
      snapGroup.destroyChildren();
      uiLayer.batchDraw();
    }
  }

  world.on('dragstart', (e) => {
    dragAnchor = e.target;
    dragStart = new Map();
    const ids = selection.includes(e.target.id()) ? selection.filter(isInteractive) : [e.target.id()];
    for (const id of ids) {
      const n = reconciler.getNode(id);
      if (n) dragStart.set(id, { x: n.x(), y: n.y() });
    }
    dragBounds = unionRects([...dragStart.keys()].map((id) => reconciler.getNode(id)).filter((n): n is Konva.Group => !!n).map(nodeBounds));
    snapTargets = dragBounds ? targetsExcluding(new Set(dragStart.keys())) : null;
  });

  /** Slide/canvas lines plus the bounds of every visible layer not in `moving`. */
  function targetsExcluding(moving: ReadonlySet<string>): SnapTargets | null {
    if (!project) return null;
    const others: Rect[] = [];
    for (const l of project.layers) {
      if (moving.has(l.id) || l.hidden || l.type === 'background') continue;
      const n = reconciler.getNode(l.id);
      if (n) others.push(nodeBounds(n));
    }
    return collectSnapTargets(project.canvas, others);
  }
  world.on('dragmove', (e) => {
    const start = dragAnchor && dragStart.get(dragAnchor.id());
    if (!dragAnchor || !start || e.target !== dragAnchor) return;
    let dx = dragAnchor.x() - start.x;
    let dy = dragAnchor.y() - start.y;
    const alt = !!(e.evt as MouseEvent | undefined)?.altKey || altDown;
    if (snapping && !alt && snapTargets && dragBounds) {
      const moved: Rect = { ...dragBounds, x: dragBounds.x + dx, y: dragBounds.y + dy };
      const r = snapRect(moved, snapTargets, SNAP_PX / stage.scaleX());
      dx += r.dx;
      dy += r.dy;
      dragAnchor.position({ x: start.x + dx, y: start.y + dy });
      showSnapGuides(r.guides);
    } else {
      clearSnapGuides();
    }
    for (const [id, s] of dragStart) {
      if (id === dragAnchor.id()) continue;
      reconciler.getNode(id)?.position({ x: s.x + dx, y: s.y + dy });
    }
  });
  world.on('dragend', (e) => {
    if (e.target !== dragAnchor) return;
    const changes: LayerChange[] = [];
    for (const id of dragStart.keys()) {
      const n = reconciler.getNode(id);
      if (n) changes.push({ id, patch: { x: r2(n.x()), y: r2(n.y()) } });
    }
    dragAnchor = null;
    dragStart = new Map();
    dragBounds = null;
    snapTargets = null;
    clearSnapGuides();
    commit('drag', changes);
  });

  // ---- interaction: transform (live re-render + resize snapping) ----
  // Alt disables snapping; boundBoxFunc gets no event, so track the key here.
  let altDown = false;
  const onKey = (e: KeyboardEvent) => {
    altDown = e.altKey;
  };
  const onBlur = () => {
    altDown = false;
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);

  /** Transient layers holding each node's live geometry during a gesture (never written to the model). */
  let live = new Map<string, Layer>();
  let resizeTargets: SnapTargets | null = null;

  const MIN_BOX_PX = 8;
  function resizeBound(oldBox: KonvaBox, newBox: KonvaBox): KonvaBox {
    if (newBox.width < MIN_BOX_PX || newBox.height < MIN_BOX_PX) return oldBox;
    const anchor = transformer.getActiveAnchor() as ResizeAnchor | 'rotater' | null;
    const axisAligned = Math.abs(Math.sin(newBox.rotation)) < 1e-4 && Math.cos(newBox.rotation) > 0;
    if (!anchor || anchor === 'rotater' || !axisAligned || !snapping || altDown || !resizeTargets) {
      clearSnapGuides();
      return newBox;
    }
    // Transformer boxes are in stage (screen) space; snapping works in model px.
    const s = stage.scaleX();
    const toModel = (b: KonvaBox): Rect => ({
      x: (b.x - stage.x()) / s,
      y: (b.y - stage.y()) / s,
      width: b.width / s,
      height: b.height / s,
    });
    const r = snapResizeBox(
      toModel(newBox),
      anchor,
      resizeTargets,
      SNAP_PX / s,
      transformer.keepRatio(),
      MIN_BOX_PX / s,
    );
    showSnapGuides(r.guides);
    return {
      ...newBox,
      x: r.rect.x * s + stage.x(),
      y: r.rect.y * s + stage.y(),
      width: r.rect.width * s,
      height: r.rect.height * s,
    };
  }

  transformer.on('transformstart', () => {
    live = new Map();
    for (const n of transformer.nodes()) {
      const layer = layerById.get(n.id());
      if (layer) live.set(layer.id, layer);
    }
    resizeTargets = targetsExcluding(new Set(live.keys()));
  });

  // Bake the transformer's scale into width/height every frame and re-render
  // through the layer definition, so crops, radii, borders and text wrap
  // update while resizing instead of stretching until release.
  transformer.on('transform', () => {
    for (const n of transformer.nodes()) {
      const prev = live.get(n.id());
      if (!prev) continue;
      const sx = n.scaleX();
      const sy = n.scaleY();
      const next = {
        ...prev,
        x: n.x(),
        y: n.y(),
        rotation: n.rotation(),
        width: Math.max(1, prev.width * sx),
        height: Math.max(1, n.height() * sy),
      } as Layer;
      if (next.type === 'text' && Math.abs(sx - 1) > 1e-3 && Math.abs(sx - sy) < 1e-3) {
        // corner drag on text scales the type, side drag only changes the wrap width
        next.props = { ...next.props, fontSize: Math.max(1, next.props.fontSize * sx) };
      }
      if (reconciler.preview(next.id, next)) {
        live.set(next.id, next);
      }
      // (if a type cannot update in place it keeps scaling and is baked at transformend)
    }
    contentLayer.batchDraw();
  });

  transformer.on('transformend', () => {
    clearSnapGuides();
    resizeTargets = null;
    const changes: LayerChange[] = [];
    for (const n of transformer.nodes()) {
      const layer = layerById.get(n.id());
      const cur = live.get(n.id());
      if (!layer || !cur) continue;
      // nodes that previewed have scale 1; any leftover scale is baked here
      const sx = n.scaleX();
      const sy = n.scaleY();
      const patch: LayerPatch = {
        x: r2(n.x()),
        y: r2(n.y()),
        rotation: r2(normalizeAngle(n.rotation())),
        width: Math.max(1, r2(cur.width * sx)),
        height: Math.max(1, r2(n.height() * sy)),
      };
      if (layer.type === 'text' && cur.type === 'text' && cur.props.fontSize !== layer.props.fontSize) {
        patch.props = { fontSize: r2(cur.props.fontSize) };
      }
      changes.push({ id: layer.id, patch });
    }
    live = new Map();
    commit('transform', changes);
  });

  function commit(kind: TransformEndEvent['kind'], changes: LayerChange[]): void {
    if (!changes.length) return;
    const v = version;
    emit('transform-end', { kind, changes });
    // The renderer never owns the model: if the host did not apply the change,
    // snap the touched nodes back to the model state.
    queueMicrotask(() => {
      if (version !== v || !project) return;
      reconciler.sync(project.layers, new Set(changes.map((c) => c.id)));
      attachTransformer();
      contentLayer.batchDraw();
    });
  }

  stage.on('dblclick dbltap', (e) => {
    const group = findLayerGroup(e.target);
    if (group && !insideTransformer(e.target)) emit('activate', group.id());
  });

  // ---- viewport: fit, zoom, pan ----
  function applyViewport(scale: number, x: number, y: number): void {
    stage.scale({ x: scale, y: scale });
    stage.position({ x, y });
    stage.batchDraw();
  }

  function zoomToFit(): void {
    fitMode = true;
    if (!project) return;
    const { width, height } = canvasSize(project.canvas);
    const sw = stage.width();
    const sh = stage.height();
    const s = Math.max(
      MIN_ZOOM / 10,
      Math.min((sw - padding * 2) / width, (sh - padding * 2) / height),
    );
    applyViewport(s, (sw - width * s) / 2, (sh - height * s) / 2);
  }

  function zoomToRect(rect: Rect): void {
    fitMode = false;
    const sw = stage.width();
    const sh = stage.height();
    const s = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM / 10, Math.min((sw - padding) / rect.width, (sh - padding) / rect.height)),
    );
    applyViewport(s, (sw - rect.width * s) / 2 - rect.x * s, (sh - rect.height * s) / 2 - rect.y * s);
  }

  function zoomAround(point: { x: number; y: number }, next: number): void {
    const old = stage.scaleX();
    const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const mx = (point.x - stage.x()) / old;
    const my = (point.y - stage.y()) / old;
    fitMode = false;
    applyViewport(s, point.x - mx * s, point.y - my * s);
  }

  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    if (e.evt.ctrlKey || e.evt.metaKey) {
      zoomAround(pointer, stage.scaleX() * Math.exp(-e.evt.deltaY * 0.0025));
    } else {
      fitMode = false;
      applyViewport(stage.scaleX(), stage.x() - e.evt.deltaX, stage.y() - e.evt.deltaY);
    }
  });

  // two-finger pinch + pan
  let lastDist = 0;
  let lastCenter: { x: number; y: number } | null = null;
  stage.on('touchmove', (e) => {
    const touches = (e.evt as TouchEvent).touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const rect = container.getBoundingClientRect();
    const a = touches[0]!;
    const b = touches[1]!;
    const center = { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top };
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinching) {
      pinching = true;
      for (const n of world.getChildren()) n.stopDrag();
    }
    if (lastCenter && lastDist) {
      zoomAround(center, stage.scaleX() * (dist / lastDist));
      stage.position({ x: stage.x() + (center.x - lastCenter.x), y: stage.y() + (center.y - lastCenter.y) });
      stage.batchDraw();
    }
    lastDist = dist;
    lastCenter = center;
  });
  stage.on('touchend touchcancel', () => {
    lastDist = 0;
    lastCenter = null;
    pinching = false;
  });

  // ---- resize ----
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (!w || !h) return;
          stage.size({ width: w, height: h });
          if (fitMode) zoomToFit();
          else stage.batchDraw();
        })
      : null;
  ro?.observe(container);

  return {
    stage,
    setProject,
    setSelection(ids) {
      selection = ids.filter((id) => layerById.has(id));
      attachTransformer();
    },
    on(event, cb) {
      const set = listeners[event] as Set<typeof cb>;
      set.add(cb);
      return () => set.delete(cb);
    },
    zoomToFit,
    zoomToRect,
    zoomToSlide(index) {
      if (!project) return;
      const r = slideRects(project.canvas)[index];
      if (r) zoomToRect(r);
    },
    refreshText() {
      if (!project) return;
      const ids = new Set(project.layers.filter((l) => l.type === 'text').map((l) => l.id));
      if (!ids.size) return;
      reconciler.sync(project.layers, ids);
      attachTransformer();
      contentLayer.batchDraw();
    },
    setSnapping(enabled) {
      snapping = enabled;
      if (!enabled) clearSnapGuides();
    },
    getZoom: () => stage.scaleX(),
    setZoom(scale) {
      zoomAround({ x: stage.width() / 2, y: stage.height() / 2 }, scale);
    },
    setGuides(next) {
      guideOpts = { ...guideOpts, ...next };
      if (project) rebuildGuides(guidesGroup, project.canvas, guideOpts);
      uiLayer.batchDraw();
    },
    destroy() {
      ro?.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mouseup', endPan);
      window.removeEventListener('touchend', endPan);
      window.removeEventListener('touchcancel', endPan);
      listeners.select.clear();
      listeners['transform-end'].clear();
      listeners.activate.clear();
      reconciler.destroy();
      stage.destroy();
    },
  };
}

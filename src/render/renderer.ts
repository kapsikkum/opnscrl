import Konva from 'konva';
import { canvasSize, layerBounds, slideRects, type Rect } from '../core/geometry';
import { gridDividers, gridFrameIds, selectionGridState, syncGridArea, type GridDivider } from '../core/gridGroup';
import type { CanvasSettings, GridGroup, Layer, LayerPatch, Project } from '../core/types';
import { LAYER_NAME } from '../layers/shared/base';
import type { AssetResolver } from '../layers/types';
import { createAssetCache } from './assets';
import { createCanvasBackground, updateCanvasBackground } from './canvasBackground';
import { dividerAxisPx, dividerHandlePoint, dragDivider, type DividerDrag } from './gridHandles';
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
  /** A finished pen stroke while the draw tool is on: flat [x0, y0, x1, y1, ...] in canvas px. */
  stroke: number[];
  /** A finished eraser path while the draw tool is in eraser mode (canvas px). */
  erase: number[];
  /**
   * A grid divider was dragged and released: `grid` is the whole grid with the
   * divider moved (already synced to where the frames are). The host turns it
   * into one undoable relayout; the renderer never mutates the model.
   */
  'grid-divider': GridDividerEvent;
}

export interface GridDividerEvent {
  gridId: string;
  grid: GridGroup;
}

/** Draw-mode settings; widths are in canvas px. */
export interface DrawTool {
  mode: 'pen' | 'eraser';
  color: string;
  width: number;
  opacity: number;
  /** Eraser radius in canvas px. */
  eraserRadius: number;
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
  /** Hide the Konva text of a layer while an HTML editor overlays it (null = show again). */
  setEditingText(id: string | null): void;
  /** Where a layer's top-left corner is, relative to the container, plus zoom and rotation (degrees). */
  getLayerScreenBox(id: string): { left: number; top: number; scale: number; rotation: number } | null;
  /** Subscribe to viewport changes (pan/zoom/resize). */
  onViewportChange(cb: () => void): () => void;
  /** Turn freehand draw mode on (pen or eraser) or off (null). Selection and dragging pause while on. */
  setDrawTool(tool: DrawTool | null): void;
  /** Viewport (client) coordinates -> canvas px. */
  clientToCanvas(clientX: number, clientY: number): { x: number; y: number };
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
  const handlesGroup = new Konva.Group();
  // outline for a lone grid cell (it has no transformer: it cannot be resized or torn out of its grid)
  const cellOutline = new Konva.Rect({ visible: false, listening: false, stroke: '#2f7cf6', strokeWidth: 2, strokeScaleEnabled: false });
  uiLayer.add(guidesGroup, snapGroup, cellOutline, handlesGroup, transformer);

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
    stroke: new Set(),
    erase: new Set(),
    'grid-divider': new Set(),
  };
  let snapping = true;
  let editingId: string | null = null;
  const viewportListeners = new Set<() => void>();
  function syncEditingVisibility(): void {
    for (const l of project?.layers ?? []) {
      if (l.type !== 'text') continue;
      const node = reconciler.getNode(l.id)?.findOne('.opnscrl-text');
      node?.visible(l.id !== editingId);
    }
    // the selection box would show the pre-edit size; the overlay has its own outline
    transformer.visible(!editingId);
    contentLayer.batchDraw();
    uiLayer.batchDraw();
  }
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

  /** frameId -> gridId for every cell of every grid group (rebuilt on each setProject). */
  let frameGrid = new Map<string, string>();
  /** The selected frame while it is the only selection of a multi-cell grid (not draggable, no transformer). */
  let soleCell: string | null = null;
  let collapseOnClick: string | null = null;

  function setSoleCell(id: string | null): void {
    if (soleCell && soleCell !== id) reconciler.getNode(soleCell)?.draggable(isInteractive(soleCell));
    soleCell = id;
    if (id) reconciler.getNode(id)?.draggable(false);
  }

  /** Existing, interactive frames of a grid. */
  function gridMembers(gridId: string): string[] {
    const grid = project?.grids[gridId];
    return project && grid ? gridFrameIds(project, grid).filter(isInteractive) : [];
  }

  function attachTransformer(): void {
    if (drawTool) return;
    const st = project ? selectionGridState(project, selection) : null;
    const lone = st?.mode === 'cell' ? selection[0]! : null;
    const nodes: Konva.Node[] = [];
    let hasText = false;
    for (const id of selection) {
      if (!isInteractive(id) || id === lone) continue;
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
    // grid cells never rotate: the grid stays axis-aligned so gutters stay crisp
    transformer.rotateEnabled(!selection.some((id) => frameGrid.has(id)));
    transformer.nodes(nodes);
    setSoleCell(lone && isInteractive(lone) ? lone : null);
    updateCellOutline();
    rebuildHandles();
    uiLayer.batchDraw();
  }

  function updateCellOutline(layerOverride?: Layer): void {
    const layer = layerOverride ?? (soleCell ? layerById.get(soleCell) : undefined);
    if (!soleCell || !layer || drawTool) {
      cellOutline.visible(false);
      return;
    }
    cellOutline.setAttrs({ visible: true, x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation });
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
    frameGrid = new Map();
    for (const [gridId, grid] of Object.entries(next.grids ?? {})) {
      for (const cell of grid.cells) if (!frameGrid.has(cell.frameId)) frameGrid.set(cell.frameId, gridId);
    }

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
    if (editingId) syncEditingVisibility();
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
  function insideHandles(node: Konva.Node): boolean {
    let n: Konva.Node | null = node;
    while (n) {
      if (n === handlesGroup) return true;
      n = n.getParent();
    }
    return false;
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
    if (drawTool) return;
    if (pinching || ((e.evt as TouchEvent).touches?.length ?? 0) > 1) return;
    const target = e.target;
    if (target === stage) {
      if (selection.length) userSelect([]);
      beginPan();
      return;
    }
    if (insideTransformer(target) || insideHandles(target)) return;
    collapseOnClick = null;
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
    } else {
      const gridId = frameGrid.get(id);
      if (!gridId) {
        if (!selection.includes(id)) userSelect([id]);
        return;
      }
      // Grid cells select as a group. A press on a cell of the already-selected grid waits
      // for the release: a drag moves the whole grid, a click narrows to that one cell.
      const members = gridMembers(gridId);
      if (members.length === selection.length && members.every((m) => selection.includes(m))) {
        collapseOnClick = id;
      } else if (selection.length === 1 && frameGrid.get(selection[0]!) === gridId) {
        if (selection[0] !== id) userSelect([id]); // hop between cells of the grid being edited
      } else if (!selection.includes(id)) {
        userSelect(members.length ? members : [id]);
      }
    }
  });
  stage.on('click tap', (e) => {
    const id = collapseOnClick;
    collapseOnClick = null;
    if (!id || insideTransformer(e.target)) return;
    if (findLayerGroup(e.target)?.id() === id) userSelect([id]);
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
    collapseOnClick = null;
    if (e.target.id() === soleCell) {
      // a lone grid cell stays in its grid (the press that selected it may have armed a drag)
      dragAnchor = null;
      dragStart = new Map();
      e.target.stopDrag();
      const l = layerById.get(e.target.id());
      if (l) e.target.position({ x: l.x, y: l.y });
      return;
    }
    handlesGroup.visible(false);
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
    handlesGroup.visible(false);
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
    resyncIfUnchanged(v, changes.map((c) => c.id));
  }

  /**
   * The renderer never owns the model: if the host did not apply the change
   * (setProject was not called since `v`), snap the touched nodes back to the model state.
   */
  function resyncIfUnchanged(v: number, ids: readonly string[]): void {
    queueMicrotask(() => {
      if (version !== v || !project) return;
      reconciler.sync(project.layers, new Set(ids));
      attachTransformer();
      contentLayer.batchDraw();
    });
  }

  // ---- grid divider handles ----
  const HANDLE_LONG = 40;
  const HANDLE_SHORT = 6;
  let handleDrag: { base: GridGroup; divider: GridDivider; grab: number; last: DividerDrag | null } | null = null;

  function setHandleCursor(cursor: string): void {
    if (!drawTool) container.style.cursor = cursor;
  }

  function previewDivider(base: GridGroup, drag: DividerDrag): void {
    for (const [index, rect] of drag.rects) {
      const id = base.cells[index]?.frameId;
      const layer = id ? layerById.get(id) : undefined;
      if (!id || !layer || layer.type !== 'frame') continue;
      const next = { ...layer, ...rect } as Layer;
      reconciler.preview(id, next);
      if (id === soleCell) updateCellOutline(next);
    }
    contentLayer.batchDraw();
  }

  function makeHandle(gridId: string, base: GridGroup, divider: GridDivider): Konva.Group | null {
    const pt = dividerHandlePoint(base, divider);
    if (!pt) return null;
    const vertical = divider.axis === 'x'; // pill is a vertical bar for a divider on the x axis
    const w = vertical ? HANDLE_SHORT : HANDLE_LONG;
    const h = vertical ? HANDLE_LONG : HANDLE_SHORT;
    const k = 1 / stage.scaleX();
    const group = new Konva.Group({ x: pt.x, y: pt.y, scaleX: k, scaleY: k, draggable: true, name: 'grid-handle' });
    // generous invisible hit area around the thin pill
    group.add(new Konva.Rect({ x: -w / 2 - 8, y: -h / 2 - 8, width: w + 16, height: h + 16, fill: 'rgba(0,0,0,0.001)' }));
    group.add(
      new Konva.Rect({
        x: -w / 2,
        y: -h / 2,
        width: w,
        height: h,
        cornerRadius: HANDLE_SHORT / 2,
        fill: '#ffffff',
        stroke: '#2f7cf6',
        strokeWidth: 1.5,
        strokeScaleEnabled: false,
        listening: false,
      }),
    );
    const cursor = vertical ? 'ew-resize' : 'ns-resize';
    group.on('mouseenter', () => setHandleCursor(cursor));
    group.on('mouseleave', () => {
      if (!handleDrag) setHandleCursor('');
    });
    group.on('dragstart', () => {
      const p = pointer();
      if (!p) return;
      const along = divider.axis === 'x' ? p.x : p.y;
      handleDrag = { base, divider, grab: along - dividerAxisPx(base, divider), last: null };
      clearSnapGuides();
    });
    group.on('dragmove', () => {
      const p = pointer();
      if (!handleDrag || !p) return;
      const along = (divider.axis === 'x' ? p.x : p.y) - handleDrag.grab;
      const drag = dragDivider(handleDrag.base, handleDrag.divider, along);
      if (!drag) return;
      handleDrag.last = drag;
      previewDivider(handleDrag.base, drag);
      // stay on the divider's axis, snapped to the clamped gutter centre
      group.position(drag.handle ?? { x: pt.x, y: pt.y });
      uiLayer.batchDraw();
    });
    group.on('dragend', () => {
      const d = handleDrag;
      const v = version;
      const ids = d ? d.divider.cells.map((c) => d.base.cells[c.index]?.frameId).filter((x): x is string => !!x) : [];
      if (d?.last && d.last.grid !== d.base) emit('grid-divider', { gridId, grid: d.last.grid });
      // Not synchronously: the host's setProject would destroy this handle mid-event.
      queueMicrotask(() => {
        handleDrag = null;
        setHandleCursor('');
        if (project && version === v) {
          reconciler.sync(project.layers, new Set(ids)); // host did not apply: undo the preview
          contentLayer.batchDraw();
        }
        attachTransformer();
      });
    });
    return group;
  }

  /** (Re)build the divider handles for the current selection: shown for a whole grid or one of its cells. */
  function rebuildHandles(): void {
    if (handleDrag) return; // a handle is mid-drag; rebuilt when it ends
    handlesGroup.destroyChildren();
    handlesGroup.visible(true);
    if (!project || drawTool) return;
    const st = selectionGridState(project, selection);
    if (!st) return;
    const base = syncGridArea(project, st.grid);
    for (const divider of gridDividers(base)) {
      const sides = { start: false, end: false };
      for (const { index, side } of divider.cells) {
        const id = base.cells[index]?.frameId;
        if (id && layerById.get(id)?.type === 'frame' && isInteractive(id)) sides[side] = true;
      }
      if (!sides.start || !sides.end) continue; // dangling, locked or hidden neighbours
      const h = makeHandle(st.gridId, base, divider);
      if (h) handlesGroup.add(h);
    }
  }

  stage.on('dblclick dbltap', (e) => {
    const group = findLayerGroup(e.target);
    if (group && !insideTransformer(e.target)) emit('activate', group.id());
  });

  // ---- draw tool (freehand pen / stroke eraser) ----
  let drawTool: DrawTool | null = null;
  let drawing: { points: number[]; line: Konva.Line } | null = null;
  const eraserCursor = new Konva.Circle({ visible: false, listening: false, stroke: '#2f7cf6', strokeWidth: 1.5, strokeScaleEnabled: false, dash: [4, 3] });
  uiLayer.add(eraserCursor);

  function pointer(): { x: number; y: number } | null {
    return stage.getRelativePointerPosition();
  }
  function beginStroke(): void {
    const p = pointer();
    if (!drawTool || !p) return;
    const eraser = drawTool.mode === 'eraser';
    const line = new Konva.Line({
      points: [p.x, p.y, p.x + 0.01, p.y],
      stroke: eraser ? 'rgba(47,124,246,0.35)' : drawTool.color,
      strokeWidth: eraser ? drawTool.eraserRadius * 2 : drawTool.width,
      opacity: eraser ? 1 : drawTool.opacity,
      lineCap: 'round',
      lineJoin: 'round',
      tension: 0.4,
      listening: false,
    });
    uiLayer.add(line);
    drawing = { points: [p.x, p.y], line };
    uiLayer.batchDraw();
  }
  function extendStroke(): void {
    const p = pointer();
    if (!p) return;
    if (drawTool?.mode === 'eraser') {
      eraserCursor.setAttrs({ visible: true, x: p.x, y: p.y, radius: drawTool.eraserRadius });
    }
    if (!drawing) {
      uiLayer.batchDraw();
      return;
    }
    drawing.points.push(p.x, p.y);
    drawing.line.points(drawing.points);
    uiLayer.batchDraw();
  }
  function endStroke(cancel = false): void {
    if (!drawing) return;
    const { points, line } = drawing;
    drawing = null;
    line.destroy();
    uiLayer.batchDraw();
    if (cancel || !drawTool) return;
    emit(drawTool.mode === 'eraser' ? 'erase' : 'stroke', points);
  }
  stage.on('mousedown.draw touchstart.draw', (e) => {
    if (!drawTool) return;
    if (((e.evt as TouchEvent).touches?.length ?? 0) > 1) {
      endStroke(true); // second finger: this is a pinch, not a stroke
      return;
    }
    e.evt.preventDefault();
    beginStroke();
  });
  stage.on('mousemove.draw touchmove.draw', () => {
    if (drawTool && !pinching) extendStroke();
  });
  const finishDraw = () => endStroke(pinching);
  window.addEventListener('mouseup', finishDraw);
  window.addEventListener('touchend', finishDraw);
  stage.on('mouseleave.draw', () => {
    eraserCursor.visible(false);
    uiLayer.batchDraw();
  });

  function setDrawTool(tool: DrawTool | null): void {
    if (!tool) endStroke(true);
    drawTool = tool;
    world.listening(!tool);
    eraserCursor.visible(false);
    container.style.cursor = tool ? (tool.mode === 'eraser' ? 'cell' : 'crosshair') : '';
    if (tool) {
      transformer.nodes([]);
      handlesGroup.destroyChildren();
      cellOutline.visible(false);
    } else attachTransformer();
    uiLayer.batchDraw();
  }

  // ---- viewport: fit, zoom, pan ----
  function applyViewport(scale: number, x: number, y: number): void {
    stage.scale({ x: scale, y: scale });
    stage.position({ x, y });
    for (const h of handlesGroup.getChildren()) h.scale({ x: 1 / scale, y: 1 / scale });
    stage.batchDraw();
    for (const cb of [...viewportListeners]) cb();
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
    for (const n of handlesGroup.getChildren()) n.stopDrag();
    }
    if (lastCenter && lastDist) {
      zoomAround(center, stage.scaleX() * (dist / lastDist));
      stage.position({ x: stage.x() + (center.x - lastCenter.x), y: stage.y() + (center.y - lastCenter.y) });
      stage.batchDraw();
      for (const cb of [...viewportListeners]) cb();
    }
    lastDist = dist;
    lastCenter = center;
  });
  // A second finger turns any one-finger pan/drag into a pinch immediately.
  stage.on('touchstart', (e) => {
    if ((e.evt as TouchEvent).touches.length < 2) return;
    pinching = true;
    pan = null;
    lastDist = 0;
    lastCenter = null;
    for (const n of world.getChildren()) n.stopDrag();
    for (const n of handlesGroup.getChildren()) n.stopDrag();
    transformer.stopTransform();
  });
  stage.on('touchend touchcancel', (e) => {
    lastDist = 0;
    lastCenter = null;
    pan = null; // never resume a pan from a stale start point
    // stay in pinch mode until every finger is up, so a lingering finger doesn't drag
    if (!(e.evt as TouchEvent).touches?.length) pinching = false;
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
          for (const cb of [...viewportListeners]) cb();
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
      if (editingId) syncEditingVisibility();
      attachTransformer();
      contentLayer.batchDraw();
    },
    setEditingText(id) {
      editingId = id;
      syncEditingVisibility();
    },
    getLayerScreenBox(id) {
      const node = reconciler.getNode(id);
      if (!node) return null;
      const abs = node.getAbsoluteTransform().point({ x: 0, y: 0 });
      return { left: abs.x, top: abs.y, scale: node.getAbsoluteScale().x, rotation: node.getAbsoluteRotation() };
    },
    setDrawTool,
    clientToCanvas(clientX, clientY) {
      const r = container.getBoundingClientRect();
      return world.getAbsoluteTransform().copy().invert().point({ x: clientX - r.left, y: clientY - r.top });
    },
    onViewportChange(cb) {
      viewportListeners.add(cb);
      return () => viewportListeners.delete(cb);
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
      window.removeEventListener('mouseup', finishDraw);
      window.removeEventListener('touchend', finishDraw);
      window.removeEventListener('mouseup', endPan);
      window.removeEventListener('touchend', endPan);
      window.removeEventListener('touchcancel', endPan);
      listeners.select.clear();
      listeners['transform-end'].clear();
      listeners.activate.clear();
      listeners.stroke.clear();
      listeners.erase.clear();
      listeners['grid-divider'].clear();
      viewportListeners.clear();
      reconciler.destroy();
      stage.destroy();
    },
  };
}

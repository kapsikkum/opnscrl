import { effect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  addFrame,
  addLine,
  addPhotos,
  addShape,
  addText,
  deleteSelected,
  duplicateSelected,
  moveGridDivider,
  nudgeSelected,
  selectAll,
  slideOfLayer,
} from '../app/actions';
import { fontsVersion } from '../app/fonts';
import { assetResolver, errorMessage, toast } from '../app/services';
import type { Session } from '../app/session';
import { applyOp, type Op } from '../core/commands';
import { gridFromBounds, selectionGridState } from '../core/gridGroup';
import { relayoutOps } from '../core/grid';
import { createRenderer, type Renderer } from '../render';
import { Icon } from './Icon';
import { goHome } from './nav';
import { CanvasPanel, LayerPanel, SlidesPanel } from './Panels';
import { Inspector } from './Inspector';
import { ExportDialog } from './ExportDialog';
import { GridDialog } from './GridDialog';
import { Preview } from './Preview';
import { ShareTemplateDialog } from './ShareTemplateDialog';
import { TextEditOverlay } from './TextEditOverlay';
import { StickerPicker } from './StickerPicker';
import { DrawBar } from './DrawBar';
import { addStroke, eraseAlong } from '../app/drawing';
import type { DrawTool } from '../render';
import { showSafeArea, showSeams, snapping } from './viewSettings';

type Tab = 'edit' | 'layers' | 'slides' | 'canvas';
type Modal = null | 'export' | 'preview' | 'share' | 'grid' | 'sticker';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'edit', label: 'Edit', icon: 'sliders' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
  { id: 'slides', label: 'Slides', icon: 'slide' },
  { id: 'canvas', label: 'Canvas', icon: 'paint' },
];

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable);
};

export function Editor({ session }: { session: Session }) {
  const { editor } = session;
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('edit');
  const [panelOpen, setPanelOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [shapeMenu, setShapeMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
  const lastPen = useRef<DrawTool>({ mode: 'pen', color: '#111111', width: 14, opacity: 1, eraserRadius: 30 });
  const drawRef = useRef<DrawTool | null>(null);
  drawRef.current = drawTool;
  const modalRef = useRef<Modal>(null);
  modalRef.current = modal;

  const project = editor.project.value;
  const count = project.canvas.slideCount;
  const cur = Math.min(session.currentSlide.value, count - 1);
  const status = session.status.value;

  // ---- renderer lifecycle + model/selection/view bindings ----
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = createRenderer(host, { resolveAsset: assetResolver });
    rendererRef.current = renderer;

    const offSelect = renderer.on('select', (ids) => {
      editor.select(ids);
      if (ids.length === 1) setTab('edit');
    });
    const offEnd = renderer.on('transform-end', ({ kind, changes }) => {
      const ops: Op[] = changes.map((c) => ({ op: 'updateLayer' as const, id: c.id, patch: c.patch }));
      // A whole grid moved or resized: re-derive the grid from where its frames landed and relayout
      // in the same batch, so gutters and cell edges stay pixel-crisp.
      const before = editor.project.peek();
      const whole = selectionGridState(before, changes.map((c) => c.id));
      if (whole?.mode === 'whole') {
        try {
          const scratch = applyOp(before, { op: 'batch', ops }).project;
          const stored = scratch.grids[whole.gridId];
          if (stored) ops.push(...relayoutOps(scratch, whole.gridId, gridFromBounds(scratch, stored)));
        } catch {
          /* cannot lay out: keep the plain frame updates (the grid self-heals on its next edit) */
        }
      }
      const key = `${kind}:${changes.map((c) => c.id).join(',')}`;
      editor.dispatch(ops.length === 1 ? ops[0]! : { op: 'batch', ops }, { coalesceKey: key });
      editor.history.breakCoalescing();
    });
    const offDivider = renderer.on('grid-divider', ({ gridId, grid }) => {
      moveGridDivider(editor, gridId, grid);
    });
    const offActivate = renderer.on('activate', (id) => {
      const layer = editor.project.peek().layers.find((l) => l.id === id);
      if (!layer) return;
      editor.select([id]);
      setTab('edit');
      if (layer.type === 'text') setEditingText(id);
      else setPanelOpen(true);
    });
    const offStroke = renderer.on('stroke', (pts) => {
      const t = drawRef.current;
      if (t) addStroke(editor, pts, t);
    });
    const offErase = renderer.on('erase', (pts) => {
      const t = drawRef.current;
      if (t) eraseAlong(editor, pts, t.eraserRadius);
    });
    const stops = [
      effect(() => renderer.setProject(editor.project.value)),
      effect(() => renderer.setSelection(editor.selection.value)),
      effect(() => {
        void fontsVersion.value; // a web font finished loading: re-measure text
        renderer.refreshText();
      }),
      effect(() =>
        renderer.setGuides({
          seams: showSeams.value,
          safeArea: showSafeArea.value ? { insetX: 0.06, insetY: 0.06 } : null,
        }),
      ),
      effect(() => renderer.setSnapping(snapping.value)),
      effect(() => {
        const ids = editor.selection.value;
        if (ids.length !== 1) return;
        const layer = editor.project.peek().layers.find((l) => l.id === ids[0]);
        if (layer && layer.type !== 'background') session.currentSlide.value = slideOfLayer(editor.project.peek(), layer);
      }),
    ];

    if (new URLSearchParams(location.search).has('debug')) {
      (window as unknown as { __opnscrl: unknown }).__opnscrl = { session, editor, renderer };
    }
    return () => {
      offSelect();
      offEnd();
      offDivider();
      offActivate();
      offStroke();
      offErase();
      stops.forEach((s) => s());
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    rendererRef.current?.setDrawTool(drawTool);
    if (drawTool) lastPen.current = drawTool;
  }, [drawTool]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || modalRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        editor.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelected(editor);
      } else if (mod && key === 'a') {
        e.preventDefault();
        selectAll(editor);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected(editor);
      } else if (e.key === 'Escape') {
        if (drawRef.current) setDrawTool(null);
        else editor.select([]);
      } else if (e.key.startsWith('Arrow') && editor.selection.peek().length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudgeSelected(editor, e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setImporting(true);
    try {
      const r = await addPhotos(editor, files, session.currentSlide.peek());
      const parts = [];
      if (r.filled) parts.push(`filled ${r.filled} frame${r.filled === 1 ? '' : 's'}`);
      if (r.added) parts.push(`added ${r.added} photo${r.added === 1 ? '' : 's'}`);
      if (parts.length) toast(parts.join(', ').replace(/^./, (c) => c.toUpperCase()), 'success');
      for (const f of r.failed.slice(0, 3)) toast(`${f.name}: ${f.reason}`, 'error', 6000);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setImporting(false);
    }
  }

  const focusSlide = (i: number) => rendererRef.current?.zoomToSlide(i);
  const addAt = () => session.currentSlide.peek();

  const tools: { id: string; label: string; icon: string; run: () => void }[] = [
    { id: 'photo', label: 'Photo', icon: 'photo', run: () => photoInput.current?.click() },
    { id: 'text', label: 'Text', icon: 'type', run: () => setEditingText(addText(editor, addAt())) },
    { id: 'shape', label: 'Shape', icon: 'shape', run: () => setShapeMenu((v) => !v) },
    { id: 'line', label: 'Line', icon: 'line', run: () => addLine(editor, addAt()) },
    { id: 'frame', label: 'Frame', icon: 'frame', run: () => addFrame(editor, addAt()) },
    { id: 'grid', label: 'Grid', icon: 'grid', run: () => setModal('grid') },
    { id: 'sticker', label: 'Sticker', icon: 'sticker', run: () => setModal('sticker') },
    { id: 'draw', label: 'Draw', icon: 'pen', run: () => setDrawTool((t) => (t ? null : { ...lastPen.current })) },
  ];

  return (
    <div class="editor">
      <header class="topbar">
        <button class="icon-btn" onClick={() => void goHome()} aria-label="Back to projects" title="Back to projects">
          <Icon name="back" />
        </button>
        <input
          class="project-name"
          type="text"
          value={project.name}
          aria-label="Project name"
          maxLength={80}
          onInput={(e) => editor.dispatch({ op: 'rename', name: e.currentTarget.value }, { coalesceKey: 'rename' })}
        />
        <span class={`save-state ${status}`} role="status" title="Projects are saved automatically on this device">
          {status === 'saved' ? 'Saved' : status === 'error' ? 'Save failed' : 'Saving...'}
        </span>
        <div class="topbar-actions">
          <button class="icon-btn" disabled={!editor.canUndo.value} onClick={() => editor.undo()} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Icon name="undo" />
          </button>
          <button class="icon-btn" disabled={!editor.canRedo.value} onClick={() => editor.redo()} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Icon name="redo" />
          </button>
          <button class="icon-btn" onClick={() => setModal('preview')} aria-label="Preview" title="Preview as a swipeable post">
            <Icon name="play" />
          </button>
          <button class="icon-btn" onClick={() => setModal('share')} aria-label="Share template" title="Share as template">
            <Icon name="link" />
          </button>
          <button class="primary" onClick={() => setModal('export')}>
            <Icon name="export" size={18} /> <span class="hide-narrow">Export</span>
          </button>
        </div>
      </header>

      <div class="workspace">
        <main class="canvas-area">
          <div class="canvas-tools" role="toolbar" aria-label="View">
            <button class="icon-btn" onClick={() => rendererRef.current?.zoomToFit()} aria-label="Zoom to fit" title="Zoom to fit">
              <Icon name="fit" size={18} />
            </button>
            <button class="icon-btn" onClick={() => rendererRef.current?.zoomToSlide(cur)} aria-label="Zoom to current slide" title="Zoom to current slide">
              <Icon name="slide" size={18} />
            </button>
            <button
              class="icon-btn"
              onClick={() => rendererRef.current?.setZoom(rendererRef.current.getZoom() / 1.25)}
              aria-label="Zoom out"
            >
              <Icon name="minus" size={18} />
            </button>
            <button
              class="icon-btn"
              onClick={() => rendererRef.current?.setZoom(rendererRef.current.getZoom() * 1.25)}
              aria-label="Zoom in"
            >
              <Icon name="plus" size={18} />
            </button>
            <button class={`icon-btn${snapping.value ? ' on' : ''}`} aria-pressed={snapping.value} onClick={() => (snapping.value = !snapping.value)} aria-label="Snapping" title="Snap to edges and centers (hold Alt to bypass)">
              <Icon name="magnet" size={18} />
            </button>
            <span class="slide-pill" aria-live="polite">
              Slide {cur + 1}/{count}
            </span>
          </div>
          <div
            class="stage"
            ref={hostRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFiles([...(e.dataTransfer?.files ?? [])]);
            }}
          />
          {importing ? <div class="busy-pill" role="status">Importing photos...</div> : null}
          {drawTool ? <DrawBar tool={drawTool} onChange={setDrawTool} onDone={() => setDrawTool(null)} /> : null}
          {editingText && rendererRef.current && hostRef.current ? (
            <TextEditOverlay
              key={editingText}
              editor={editor}
              renderer={rendererRef.current}
              host={hostRef.current}
              layerId={editingText}
              onDone={() => setEditingText(null)}
            />
          ) : null}
        </main>

        <aside class={`panel${panelOpen ? ' open' : ''}`} aria-label="Properties">
          <div class="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                class={tab === t.id ? 'on' : ''}
                onClick={() => {
                  if (tab === t.id && panelOpen) setPanelOpen(false);
                  else {
                    setTab(t.id);
                    setPanelOpen(true);
                  }
                }}
              >
                <Icon name={t.icon} size={18} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div class="panel-body" role="tabpanel">
            {tab === 'edit' ? <Inspector editor={editor} /> : null}
            {tab === 'layers' ? <LayerPanel session={session} /> : null}
            {tab === 'slides' ? <SlidesPanel session={session} onFocusSlide={focusSlide} /> : null}
            {tab === 'canvas' ? <CanvasPanel session={session} /> : null}
          </div>
        </aside>
      </div>

      <nav class="toolbar" aria-label="Add">
        {tools.map((t) => (
          <button key={t.id} class={`tool${t.id === 'draw' && drawTool ? ' on' : ''}`} aria-pressed={t.id === 'draw' ? !!drawTool : undefined} onClick={t.run} aria-haspopup={t.id === 'shape' ? 'menu' : undefined} aria-expanded={t.id === 'shape' ? shapeMenu : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
        {shapeMenu ? (
          <div class="menu" role="menu" onMouseLeave={() => setShapeMenu(false)}>
            <button
              role="menuitem"
              onClick={() => {
                addShape(editor, addAt(), 'rect');
                setShapeMenu(false);
              }}
            >
              Rectangle
            </button>
            <button
              role="menuitem"
              onClick={() => {
                addShape(editor, addAt(), 'ellipse');
                setShapeMenu(false);
              }}
            >
              Ellipse
            </button>
          </div>
        ) : null}
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="photo-input"
          onChange={(e) => {
            const files = [...(e.currentTarget.files ?? [])];
            e.currentTarget.value = '';
            void handleFiles(files);
          }}
        />
      </nav>

      {modal === 'export' ? <ExportDialog session={session} onClose={() => setModal(null)} /> : null}
      {modal === 'preview' ? <Preview session={session} onClose={() => setModal(null)} /> : null}
      {modal === 'share' ? <ShareTemplateDialog session={session} onClose={() => setModal(null)} /> : null}
      {modal === 'grid' ? <GridDialog session={session} onClose={() => setModal(null)} /> : null}
      {modal === 'sticker' ? <StickerPicker session={session} onClose={() => setModal(null)} /> : null}
    </div>
  );
}


import { useRef, useState } from 'preact/hooks';
import { gapAt, reorderTarget } from '../core/reorder';
import {
  addSlideAt,
  deleteLayer,
  duplicateLayers,
  layerCountOnSlide,
  moveInStack,
  moveSlide,
  patchLayer,
  removeSlide,
  setCanvasBackground,
  setCanvasSettings,
} from '../app/actions';
import type { Session } from '../app/session';
import { toast } from '../app/services';
import { slideHeightPx } from '../core/geometry';
import { ASPECTS, MAX_CUSTOM_HEIGHT, MAX_SLIDES, MIN_CUSTOM_HEIGHT, MIN_SLIDES } from '../core/schema';
import type { Aspect } from '../core/types';
import { getLayerDefinition } from '../layers';
import { ASPECT_LABELS } from './aspects';
import { confirmAction } from './Dialog';
import { FillField, SliderField, SelectField, ToggleField } from './Fields';
import { Icon } from './Icon';
import { showSafeArea, showSeams, snapping } from './viewSettings';

export function LayerPanel({ session }: { session: Session }) {
  const { editor } = session;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; gap: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const mids = useRef<number[]>([]);
  const layers = editor.project.value.layers;
  const selection = editor.selection.value;
  const rows = [...layers].reverse(); // front-most first, like most editors
  if (!layers.length) return <p class="panel-pad muted">No layers yet. Add a photo, text or shape from the toolbar.</p>;

  // Pointer-driven drag (mouse + touch): the handle captures the pointer, the
  // drop gap comes from the rows' vertical midpoints, one reorder op on release.
  const startDrag = (e: PointerEvent, id: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const items = [...(listRef.current?.children ?? [])] as HTMLElement[];
    mids.current = items.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    setDrag({ id, gap: gapAt(e.clientY, mids.current) });
  };
  const moveDrag = (e: PointerEvent) => {
    if (!drag) return;
    const gap = gapAt(e.clientY, mids.current);
    if (gap !== drag.gap) setDrag({ ...drag, gap });
  };
  const endDrag = (cancel: boolean) => {
    if (!drag) return;
    const from = layers.findIndex((l) => l.id === drag.id);
    const to = cancel ? null : reorderTarget(layers.length, from, drag.gap);
    if (to !== null) editor.dispatch({ op: 'reorder', id: drag.id, toIndex: to });
    setDrag(null);
  };
  return (
    <ul class={`layer-list${drag ? ' dragging' : ''}`} aria-label="Layers" ref={listRef}>
      {rows.map((l, row) => {
        const def = getLayerDefinition(l.type);
        const on = selection.includes(l.id);
        const dropCls = drag && drag.gap === row ? ' drop-before' : drag && row === rows.length - 1 && drag.gap === rows.length ? ' drop-after' : '';
        return (
          <li key={l.id} class={`layer-row${on ? ' on' : ''}${l.hidden ? ' dim' : ''}${drag?.id === l.id ? ' lifted' : ''}${dropCls}`}>
            <button
              class="drag-handle"
              aria-label={`Drag to reorder ${l.name}`}
              title="Drag to reorder"
              onPointerDown={(e) => startDrag(e, l.id)}
              onPointerMove={moveDrag}
              onPointerUp={() => endDrag(false)}
              onPointerCancel={() => endDrag(true)}
            >
              <Icon name="grip" size={16} />
            </button>
            <button
              class="layer-main"
              aria-pressed={on}
              onClick={(e) => editor.select(e.shiftKey || e.ctrlKey || e.metaKey ? (on ? selection.filter((s) => s !== l.id) : [...selection, l.id]) : [l.id])}
              onDblClick={() => setRenaming(l.id)}
            >
              <Icon name={def.icon ?? 'frame'} size={16} />
              {renaming === l.id ? (
                <input
                  class="name-input"
                  value={l.name}
                  autofocus
                  onClick={(e) => e.stopPropagation()}
                  onInput={(e) => patchLayer(editor, l.id, { name: e.currentTarget.value }, `name:${l.id}`)}
                  onBlur={() => setRenaming(null)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && setRenaming(null)}
                />
              ) : (
                <span class="layer-name">{l.name || def.label}</span>
              )}
            </button>
            <div class="layer-actions">
              <button class="icon-btn" aria-label={`Rename ${l.name}`} title="Rename" onClick={() => setRenaming(l.id)}>
                <Icon name="edit" size={16} />
              </button>
              <button class="icon-btn" aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} aria-pressed={l.locked} title={l.locked ? 'Unlock' : 'Lock'} onClick={() => patchLayer(editor, l.id, { locked: !l.locked })}>
                <Icon name={l.locked ? 'lock' : 'unlock'} size={16} />
              </button>
              <button class="icon-btn" aria-label={l.hidden ? `Show ${l.name}` : `Hide ${l.name}`} aria-pressed={l.hidden} title={l.hidden ? 'Show' : 'Hide'} onClick={() => patchLayer(editor, l.id, { hidden: !l.hidden })}>
                <Icon name={l.hidden ? 'eyeoff' : 'eye'} size={16} />
              </button>
              <button class="icon-btn" aria-label={`Bring ${l.name} forward`} title="Bring forward" onClick={() => moveInStack(editor, l.id, 1)}>
                <Icon name="up" size={16} />
              </button>
              <button class="icon-btn" aria-label={`Send ${l.name} backward`} title="Send backward" onClick={() => moveInStack(editor, l.id, -1)}>
                <Icon name="down" size={16} />
              </button>
              <button class="icon-btn" aria-label={`Duplicate ${l.name}`} title="Duplicate" onClick={() => duplicateLayers(editor, [l.id])}>
                <Icon name="copy" size={16} />
              </button>
              <button class="icon-btn" aria-label={`Delete ${l.name}`} title="Delete" onClick={() => deleteLayer(editor, l.id)}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SlidesPanel({ session, onFocusSlide }: { session: Session; onFocusSlide: (i: number) => void }) {
  const { editor } = session;
  const p = editor.project.value;
  const count = p.canvas.slideCount;
  const cur = Math.min(session.currentSlide.value, count - 1);
  const onSlide = layerCountOnSlide(p, cur);

  const choose = (i: number) => {
    session.currentSlide.value = i;
    onFocusSlide(i);
  };
  return (
    <div class="panel-pad">
      <div class="slide-chips" role="tablist" aria-label="Slides">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} role="tab" aria-selected={i === cur} class={`chip${i === cur ? ' on' : ''}`} onClick={() => choose(i)}>
            {i + 1}
          </button>
        ))}
      </div>
      <p class="muted small">
        Slide {cur + 1} of {count} · {onSlide} layer{onSlide === 1 ? '' : 's'} centered on it
      </p>
      <div class="btn-grid">
        <button
          disabled={count >= MAX_SLIDES}
          onClick={() => {
            addSlideAt(editor, cur);
            choose(cur);
          }}
        >
          <Icon name="plus" size={16} /> Add before
        </button>
        <button
          disabled={count >= MAX_SLIDES}
          onClick={() => {
            addSlideAt(editor, cur + 1);
            choose(cur + 1);
          }}
        >
          <Icon name="plus" size={16} /> Add after
        </button>
        <button
          disabled={cur === 0}
          onClick={() => {
            moveSlide(editor, cur, -1);
            choose(cur - 1);
          }}
        >
          <Icon name="left" size={16} /> Move left
        </button>
        <button
          disabled={cur >= count - 1}
          onClick={() => {
            moveSlide(editor, cur, 1);
            choose(cur + 1);
          }}
        >
          <Icon name="right" size={16} /> Move right
        </button>
        <button
          class="danger wide-btn"
          disabled={count <= MIN_SLIDES}
          onClick={async () => {
            if (onSlide > 0 && !(await confirmAction(`Remove slide ${cur + 1} and its ${onSlide} layer${onSlide === 1 ? '' : 's'}? You can undo this.`, { confirmLabel: 'Remove', danger: true }))) return;
            if (removeSlide(editor, cur)) {
              choose(Math.min(cur, count - 2));
              toast(`Slide ${cur + 1} removed`);
            }
          }}
        >
          <Icon name="trash" size={16} /> Remove slide
        </button>
      </div>
      <p class="muted small">Moving a slide shifts every layer on it (and its neighbour) by one slide width.</p>
    </div>
  );
}

export function CanvasPanel({ session }: { session: Session }) {
  const { editor } = session;
  const c = editor.project.value.canvas;
  const height = slideHeightPx(c);
  return (
    <div class="panel-pad">
      <section class="insp-section">
        <h3>Slides</h3>
        <SelectField
          label="Ratio"
          value={c.aspect}
          options={ASPECTS.map((a) => ({ value: a, label: `${ASPECT_LABELS[a].name} - ${ASPECT_LABELS[a].hint}` }))}
          onChange={(a) => setCanvasSettings(editor, { aspect: a as Aspect })}
        />
        {c.aspect === 'custom' ? (
          <SliderField
            label="Slide height"
            value={c.customHeightPx}
            min={MIN_CUSTOM_HEIGHT}
            max={MAX_CUSTOM_HEIGHT}
            step={1}
            unit="px"
            onChange={(v) => setCanvasSettings(editor, { customHeightPx: Math.round(v) })}
          />
        ) : null}
        <div class="field row">
          <span>Slide count</span>
          <div class="stepper">
            <button class="icon-btn" aria-label="Fewer slides" disabled={c.slideCount <= MIN_SLIDES} onClick={() => setCanvasSettings(editor, { slideCount: c.slideCount - 1 })}>
              <Icon name="minus" size={16} />
            </button>
            <output aria-live="polite">{c.slideCount}</output>
            <button class="icon-btn" aria-label="More slides" disabled={c.slideCount >= MAX_SLIDES} onClick={() => setCanvasSettings(editor, { slideCount: c.slideCount + 1 })}>
              <Icon name="plus" size={16} />
            </button>
          </div>
        </div>
        <p class="muted small">
          Each slide exports at {c.slideWidthPx} x {height} px; the whole canvas is {c.slideWidthPx * c.slideCount} x {height} px. Reducing the count never deletes layers; it just crops the canvas.
        </p>
      </section>
      <section class="insp-section">
        <h3>Background</h3>
        <FillField label="Fill" value={c.background} onChange={(f) => setCanvasBackground(editor, f)} />
      </section>
      <section class="insp-section">
        <h3>View</h3>
        <ToggleField label="Slide seams" value={showSeams.value} onChange={(v) => (showSeams.value = v)} />
        <ToggleField label="Safe area" value={showSafeArea.value} onChange={(v) => (showSafeArea.value = v)} />
        <ToggleField label="Snap while dragging" value={snapping.value} onChange={(v) => (snapping.value = v)} />
        <p class="muted small">Guides are only for editing and never appear in exports. Hold Alt while dragging to skip snapping.</p>
      </section>
    </div>
  );
}

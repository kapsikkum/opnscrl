import { useState } from 'preact/hooks';
import { addGrid } from '../app/actions';
import { errorMessage, toast } from '../app/services';
import type { Session } from '../app/session';
import { gridArea, gridArgsCells, type GridArgs } from '../core/grid';
import { GRID_LAYOUTS, type GridLayout } from '../core/gridLayouts';
import { Dialog } from './Dialog';
import { SliderField } from './Fields';

const GROUPS: { id: GridLayout['group']; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'feature', label: 'Feature' },
  { id: 'mosaic', label: 'Mosaic' },
  { id: 'panorama', label: 'Across slides' },
];

/** Layout icon drawn in the target area's aspect ratio (fitted into a 40x40 box). */
function LayoutThumb({ layout, aspect }: { layout: GridLayout; aspect: number }) {
  const w = aspect >= 1 ? 36 : 36 * aspect;
  const h = aspect >= 1 ? 36 / aspect : 36;
  const ox = (40 - w) / 2;
  const oy = (40 - h) / 2;
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      {layout.cells.map(({ box: [x0, y0, x1, y1] }, i) => (
        <rect key={i} x={ox + x0 * w + 0.5} y={oy + y0 * h + 0.5} width={Math.max(0.5, (x1 - x0) * w - 1)} height={Math.max(0.5, (y1 - y0) * h - 1)} rx={0.6} />
      ))}
    </svg>
  );
}

export function GridDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [layout, setLayout] = useState<string | null>('quad');
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [gutter, setGutter] = useState(8);
  const [padding, setPadding] = useState(0);
  const [radius, setRadius] = useState(0);
  const [scope, setScope] = useState<'slide' | 'canvas'>('slide');
  const project = session.editor.project.peek();
  const slide = Math.min(session.currentSlide.peek(), project.canvas.slideCount - 1);
  const args: GridArgs = {
    rows,
    cols,
    gutter,
    padding,
    cornerRadius: radius,
    area: scope === 'slide' ? { slide } : 'canvas',
    ...(layout ? { layout } : {}),
  };

  let cells: ReturnType<typeof gridArgsCells> = [];
  let problem: string | null = null;
  try {
    cells = gridArgsCells(project, args);
  } catch (e) {
    problem = errorMessage(e);
  }
  const area = gridArea(project, args.area);

  function pick(l: GridLayout) {
    setLayout(l.id);
    if (l.group === 'panorama' && project.canvas.slideCount > 1) setScope('canvas');
  }

  function create() {
    try {
      const ids = addGrid(session.editor, args);
      toast(`Added ${ids.length} frames. Add photos to fill them.`, 'success');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <Dialog
      title="Grid layout"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button class="primary" disabled={!!problem} onClick={create}>
            Add grid
          </button>
        </>
      }
    >
      {GROUPS.map((g) => (
        <div class="layout-group" key={g.id}>
          <h4>{g.label}</h4>
          <div class="layout-picker" role="radiogroup" aria-label={`${g.label} layouts`}>
            {GRID_LAYOUTS.filter((l) => l.group === g.id).map((l) => (
              <button key={l.id} role="radio" aria-checked={layout === l.id} class={`layout-chip${layout === l.id ? ' on' : ''}`} title={l.label} aria-label={l.label} onClick={() => pick(l)}>
                <LayoutThumb layout={l} aspect={area.width / area.height} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div class="field">
        <span>Custom grid</span>
        <div class="seg">
          <button class={layout === null ? 'on' : ''} aria-pressed={layout === null} onClick={() => setLayout(null)}>
            {cols} x {rows}
          </button>
        </div>
      </div>
      {layout === null && (
        <div class="grid2">
          <SliderField label="Columns" value={cols} min={1} max={6} step={1} onChange={(v) => setCols(Math.round(v))} />
          <SliderField label="Rows" value={rows} min={1} max={6} step={1} onChange={(v) => setRows(Math.round(v))} />
        </div>
      )}
      <SliderField label="Gutter" value={gutter} min={0} max={120} step={1} unit="px" onChange={setGutter} />
      <SliderField label="Padding" value={padding} min={0} max={240} step={1} unit="px" onChange={setPadding} />
      <SliderField label="Corners" value={radius} min={0} max={120} step={1} unit="px" onChange={setRadius} />
      <div class="field">
        <span>Where</span>
        <div class="seg" role="radiogroup" aria-label="Grid area">
          <button role="radio" aria-checked={scope === 'slide'} class={scope === 'slide' ? 'on' : ''} onClick={() => setScope('slide')}>
            Slide {slide + 1}
          </button>
          <button role="radio" aria-checked={scope === 'canvas'} class={scope === 'canvas' ? 'on' : ''} onClick={() => setScope('canvas')}>
            Whole canvas
          </button>
        </div>
      </div>
      {problem ? (
        <p class="error">{problem}</p>
      ) : (
        <svg class="grid-preview" viewBox={`0 0 ${area.width} ${area.height}`} role="img" aria-label="Grid preview">
          <rect width={area.width} height={area.height} x={0} y={0} fill="var(--surface-2)" />
          {cells.map((c, i) => (
            <rect key={i} x={c.x - area.x} y={c.y - area.y} width={c.width} height={c.height} rx={Math.min(radius, c.width / 2, c.height / 2)} fill="var(--accent-soft)" stroke="var(--accent)" stroke-width={Math.max(2, area.width / 300)} />
          ))}
        </svg>
      )}
    </Dialog>
  );
}

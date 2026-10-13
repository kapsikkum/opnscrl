import { useState } from 'preact/hooks';
import { addGrid } from '../app/actions';
import { errorMessage, toast } from '../app/services';
import type { Session } from '../app/session';
import { gridCells, gridArea } from '../core/grid';
import { Dialog } from './Dialog';
import { SliderField } from './Fields';

const PRESETS: [number, number][] = [
  [1, 2],
  [2, 1],
  [2, 2],
  [1, 3],
  [3, 1],
  [3, 3],
  [2, 3],
  [3, 2],
];

export function GridDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [gutter, setGutter] = useState(24);
  const [padding, setPadding] = useState(48);
  const [scope, setScope] = useState<'slide' | 'canvas'>('slide');
  const project = session.editor.project.peek();
  const slide = Math.min(session.currentSlide.peek(), project.canvas.slideCount - 1);
  const args = { rows, cols, gutter, padding, area: scope === 'slide' ? { slide } : ('canvas' as const) };

  let cells: ReturnType<typeof gridCells> = [];
  let problem: string | null = null;
  try {
    cells = gridCells(gridArea(project, args.area), args);
  } catch (e) {
    problem = errorMessage(e);
  }
  const area = gridArea(project, args.area);

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
      <div class="chips" aria-label="Presets">
        {PRESETS.map(([r, c]) => (
          <button key={`${r}x${c}`} class={`chip${r === rows && c === cols ? ' on' : ''}`} onClick={() => (setRows(r), setCols(c))}>
            {c} x {r}
          </button>
        ))}
      </div>
      <div class="grid2">
        <SliderField label="Columns" value={cols} min={1} max={6} step={1} onChange={(v) => setCols(Math.round(v))} />
        <SliderField label="Rows" value={rows} min={1} max={6} step={1} onChange={(v) => setRows(Math.round(v))} />
      </div>
      <SliderField label="Gutter" value={gutter} min={0} max={120} step={1} unit="px" onChange={setGutter} />
      <SliderField label="Padding" value={padding} min={0} max={240} step={1} unit="px" onChange={setPadding} />
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
          {cells.map((c) => (
            <rect x={c.x - area.x} y={c.y - area.y} width={c.width} height={c.height} rx={16} fill="var(--accent-soft)" stroke="var(--accent)" stroke-width={Math.max(2, area.width / 300)} />
          ))}
        </svg>
      )}
    </Dialog>
  );
}

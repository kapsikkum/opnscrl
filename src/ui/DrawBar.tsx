import type { DrawTool } from '../render';
import { Icon } from './Icon';

const SWATCHES = ['#111111', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#2f7cf6', '#af52de', '#ff2d78'];

/** Floating controls while draw mode is on. */
export function DrawBar({ tool, onChange, onDone }: { tool: DrawTool; onChange: (t: DrawTool) => void; onDone: () => void }) {
  const set = (patch: Partial<DrawTool>) => onChange({ ...tool, ...patch });
  return (
    <div class="drawbar" role="toolbar" aria-label="Drawing">
      <div class="seg small">
        <button class={tool.mode === 'pen' ? 'on' : ''} aria-pressed={tool.mode === 'pen'} onClick={() => set({ mode: 'pen' })} title="Pen">
          <Icon name="pen" size={16} /> Pen
        </button>
        <button class={tool.mode === 'eraser' ? 'on' : ''} aria-pressed={tool.mode === 'eraser'} onClick={() => set({ mode: 'eraser' })} title="Eraser (removes whole strokes)">
          <Icon name="eraser" size={16} /> Eraser
        </button>
      </div>
      {tool.mode === 'pen' ? (
        <>
          <div class="swatches" role="radiogroup" aria-label="Pen color">
            {SWATCHES.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={tool.color === c}
                aria-label={c}
                class={`swatch${tool.color === c ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => set({ color: c })}
              />
            ))}
            <input type="color" value={tool.color} onInput={(e) => set({ color: e.currentTarget.value })} aria-label="Custom pen color" />
          </div>
          <label class="drawbar-slider">
            <span>Size</span>
            <input type="range" min={2} max={120} step={1} value={tool.width} onInput={(e) => set({ width: Number(e.currentTarget.value) })} />
          </label>
          <label class="drawbar-slider">
            <span>Opacity</span>
            <input type="range" min={0.1} max={1} step={0.05} value={tool.opacity} onInput={(e) => set({ opacity: Number(e.currentTarget.value) })} />
          </label>
        </>
      ) : (
        <label class="drawbar-slider">
          <span>Eraser size</span>
          <input type="range" min={6} max={160} step={1} value={tool.eraserRadius} onInput={(e) => set({ eraserRadius: Number(e.currentTarget.value) })} />
        </label>
      )}
      <button class="primary" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

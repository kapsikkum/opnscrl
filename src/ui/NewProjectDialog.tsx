import { useState } from 'preact/hooks';
import { DEFAULT_CUSTOM_HEIGHT } from '../core/geometry';
import { ASPECTS, MAX_CUSTOM_HEIGHT, MAX_SLIDES, MIN_CUSTOM_HEIGHT } from '../core/schema';
import type { Aspect } from '../core/types';
import { createBlankProject } from '../app/session';
import { errorMessage, toast } from '../app/services';
import { ASPECT_LABELS, aspectRatio } from './aspects';
import { Dialog } from './Dialog';
import { showEditor } from './nav';

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [aspect, setAspect] = useState<Aspect>('4:5');
  const [slides, setSlides] = useState(1);
  const [customH, setCustomH] = useState(DEFAULT_CUSTOM_HEIGHT);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await createBlankProject({
        name: name.trim() || 'Untitled carousel',
        aspect,
        slideCount: slides,
        customHeightPx: customH,
      });
      onClose();
      showEditor();
    } catch (e) {
      toast(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button class="primary" disabled={busy} onClick={create}>
            Create
          </button>
        </>
      }
    >
      <label class="field">
        <span>Name</span>
        <input type="text" value={name} placeholder="Untitled carousel" maxLength={80} onInput={(e) => setName(e.currentTarget.value)} />
      </label>

      <div class="field">
        <span>Slide ratio</span>
        <div class="aspect-grid" role="radiogroup" aria-label="Slide ratio">
          {ASPECTS.map((a) => {
            const r = aspectRatio(a, customH);
            return (
              <button
                key={a}
                role="radio"
                aria-checked={aspect === a}
                class={`aspect-chip${aspect === a ? ' on' : ''}`}
                onClick={() => setAspect(a)}
              >
                <span class="swatch" style={{ aspectRatio: String(r), width: r >= 1 ? '34px' : `${Math.round(34 * r)}px` }} />
                <b>{ASPECT_LABELS[a].name}</b>
                <small>{ASPECT_LABELS[a].hint}</small>
              </button>
            );
          })}
        </div>
      </div>

      {aspect === 'custom' ? (
        <label class="field">
          <span>
            Slide height <output>{customH} px</output> <small>(width is 1080 px)</small>
          </span>
          <input
            type="range"
            min={MIN_CUSTOM_HEIGHT}
            max={MAX_CUSTOM_HEIGHT}
            step={1}
            value={customH}
            onInput={(e) => setCustomH(Number(e.currentTarget.value))}
          />
        </label>
      ) : null}

      <label class="field">
        <span>
          Slides <output>{slides}</output>
        </span>
        <input type="range" min={1} max={MAX_SLIDES} step={1} value={slides} onInput={(e) => setSlides(Number(e.currentTarget.value))} />
      </label>
    </Dialog>
  );
}

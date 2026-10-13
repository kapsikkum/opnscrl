import { useRef, useState } from 'preact/hooks';
import { ensureProjectFonts } from '../app/fonts';
import { assetResolver, errorMessage, toast } from '../app/services';
import { slicePlan } from '../core/geometry';
import { canShareFiles, downloadSlices, downloadZip, shareSlices, type ImageFormat } from '../export';
import { exportSlides } from '../render';
import type { Session } from '../app/session';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

type Action = 'zip' | 'files' | 'share';

export function ExportDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState(0.92);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const cache = useRef<{ key: string; blobs: Blob[] } | null>(null);

  const project = session.editor.project.value;
  const plan = slicePlan(project.canvas, scale);
  const first = plan[0]!;
  const emptyFrames = project.layers.filter((l) => l.type === 'frame' && !l.props.assetId && !l.hidden).length;
  const shareProbe = typeof File !== 'undefined' && canShareFiles([new File([''], 'x.png', { type: 'image/png' })]);

  async function render(): Promise<Blob[]> {
    const p = session.editor.project.peek();
    const key = `${p.updatedAt}:${p.id}:${format}:${format === 'jpeg' ? quality : ''}:${scale}`;
    if (cache.current?.key === key) return cache.current.blobs;
    await ensureProjectFonts(p);
    const blobs = await exportSlides(p, assetResolver, {
      format,
      quality,
      scale,
      onProgress: (d, t) => setBusy(`Rendering slide ${d} of ${t}...`),
    });
    cache.current = { key, blobs };
    return blobs;
  }

  async function run(action: Action) {
    setBusy('Rendering...');
    try {
      const blobs = await render();
      const p = session.editor.project.peek();
      const opts = { baseName: p.name, format };
      if (action === 'zip') await downloadZip(blobs, opts);
      else if (action === 'files') await downloadSlices(blobs, opts);
      else {
        const r = await shareSlices(blobs, { ...opts, title: p.name });
        if (r === 'unsupported') {
          toast('Sharing files is not supported here; downloading a ZIP instead.');
          await downloadZip(blobs, opts);
        }
      }
      if (action !== 'share') toast(`Exported ${blobs.length} slide${blobs.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      console.error(e);
      toast(`Export failed: ${errorMessage(e)}`, 'error', 7000);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog title="Export" onClose={onClose}>
      <div class="field">
        <span>Format</span>
        <div class="seg" role="radiogroup" aria-label="Format">
          <button role="radio" aria-checked={format === 'png'} class={format === 'png' ? 'on' : ''} onClick={() => setFormat('png')}>
            PNG
          </button>
          <button role="radio" aria-checked={format === 'jpeg'} class={format === 'jpeg' ? 'on' : ''} onClick={() => setFormat('jpeg')}>
            JPEG
          </button>
        </div>
      </div>
      {format === 'jpeg' ? (
        <label class="field">
          <span>
            Quality <output>{Math.round(quality * 100)}%</output>
          </span>
          <input type="range" min={0.5} max={1} step={0.01} value={quality} onInput={(e) => setQuality(Number(e.currentTarget.value))} />
        </label>
      ) : null}
      <div class="field">
        <span>Size</span>
        <div class="seg" role="radiogroup" aria-label="Size">
          {[1, 2].map((s) => (
            <button key={s} role="radio" aria-checked={scale === s} class={scale === s ? 'on' : ''} onClick={() => setScale(s)}>
              {s === 1 ? 'Standard' : 'Double'}
            </button>
          ))}
        </div>
      </div>
      <p class="muted">
        {plan.length} slide{plan.length === 1 ? '' : 's'}, each {first.outWidth} x {first.outHeight} px. Cut seamlessly from one canvas, so photos line up when swiped.
      </p>
      {emptyFrames ? (
        <p class="warn" role="alert">
          {emptyFrames} empty frame{emptyFrames === 1 ? '' : 's'} will export as blank space. Add photos to fill {emptyFrames === 1 ? 'it' : 'them'}, or delete the frame.
        </p>
      ) : null}
      <div class="btn-stack">
        <button class="primary" disabled={!!busy} onClick={() => run('zip')}>
          <Icon name="download" size={18} /> Download ZIP
        </button>
        <button disabled={!!busy} onClick={() => run('files')}>
          <Icon name="download" size={18} /> Download individual files
        </button>
        {shareProbe ? (
          <button disabled={!!busy} onClick={() => run('share')}>
            <Icon name="share" size={18} /> Share...
          </button>
        ) : null}
      </div>
      {busy ? (
        <p class="muted" role="status">
          {busy}
        </p>
      ) : null}
    </Dialog>
  );
}

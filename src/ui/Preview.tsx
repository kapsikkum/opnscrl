import { useEffect, useRef, useState } from 'preact/hooks';
import { ensureProjectFonts } from '../app/fonts';
import { assetResolver, errorMessage } from '../app/services';
import type { Session } from '../app/session';
import { slideHeightPx } from '../core/geometry';
import { exportSlides } from '../render';
import { Icon } from './Icon';

/**
 * Swipeable carousel of the actual exported slices, framed like a social feed
 * post (generic avatar + counter; no third-party branding).
 */
export function Preview({ session, onClose }: { session: Session; onClose: () => void }) {
  const [urls, setUrls] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; t: number; w: number } | null>(null);
  const project = session.editor.project.peek();
  const ratio = project.canvas.slideWidthPx / slideHeightPx(project.canvas);

  useEffect(() => {
    let live = true;
    const made: string[] = [];
    (async () => {
      try {
        await ensureProjectFonts(project);
        const blobs = await exportSlides(project, assetResolver, { format: 'jpeg', quality: 0.9, scale: 0.75 });
        for (const b of blobs) made.push(URL.createObjectURL(b));
        if (live) setUrls([...made]);
      } catch (e) {
        if (live) setError(errorMessage(e));
      }
    })();
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const count = urls?.length ?? project.canvas.slideCount;
  const go = (i: number) => setIndex(Math.max(0, Math.min(count - 1, i)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(count - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  function onDown(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, t: performance.now(), w: el.clientWidth };
  }
  function onMove(e: PointerEvent) {
    const s = start.current;
    if (!s) return;
    let dx = e.clientX - s.x;
    // rubber-band at the ends
    if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) dx *= 0.35;
    setDrag(dx);
  }
  function onUp(e: PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const v = dx / Math.max(1, performance.now() - s.t);
    if (dx < -s.w * 0.2 || v < -0.5) go(index + 1);
    else if (dx > s.w * 0.2 || v > 0.5) go(index - 1);
    setDrag(0);
  }

  return (
    <div class="preview" role="dialog" aria-modal="true" aria-label="Preview">
      <div class="preview-bar">
        <button class="icon-btn light" onClick={onClose} aria-label="Close preview">
          <Icon name="close" />
        </button>
        <span class="preview-title">Preview</span>
      </div>
      <div class="post" style={`--post-ratio:${ratio}`}>
        <div class="post-head">
          <span class="avatar" />
          <b>your.name</b>
        </div>
        <div class="post-media" style={{ aspectRatio: String(ratio) }}>
          {error ? (
            <p class="preview-msg">Couldn't render the preview: {error}</p>
          ) : !urls ? (
            <p class="preview-msg" role="status">
              Rendering slides...
            </p>
          ) : (
            <>
              <div
                class="track"
                style={{ transform: `translateX(calc(${-index * 100}% + ${drag}px))`, transition: drag ? 'none' : undefined }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                {urls.map((u, i) => (
                  <img key={i} src={u} alt={`Slide ${i + 1}`} draggable={false} />
                ))}
              </div>
              <span class="counter">
                {index + 1}/{count}
              </span>
              {index > 0 ? (
                <button class="nav prev" onClick={() => go(index - 1)} aria-label="Previous slide">
                  <Icon name="left" />
                </button>
              ) : null}
              {index < count - 1 ? (
                <button class="nav next" onClick={() => go(index + 1)} aria-label="Next slide">
                  <Icon name="right" />
                </button>
              ) : null}
            </>
          )}
        </div>
        <div class="dots" role="tablist" aria-label="Slides">
          {Array.from({ length: count }, (_, i) => (
            <button key={i} role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}`} class={`dot${i === index ? ' on' : ''}`} onClick={() => go(i)} />
          ))}
        </div>
      </div>
    </div>
  );
}

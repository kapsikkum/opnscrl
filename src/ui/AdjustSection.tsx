import { useEffect, useState } from 'preact/hooks';
import { patchLayer } from '../app/actions';
import { assetResolver } from '../app/services';
import { effectiveAdjust, isNeutral, neutralAdjust, PRESETS } from '../core/adjust';
import { ADJUST_KEYS, ONE_SIDED_ADJUST } from '../core/schema';
import type { Adjust, AdjustKey, FrameLayer, ImageLayer } from '../core/types';
import { renderAdjusted } from '../layers/shared/adjustImage';
import type { Editor } from '../state/editor';
import { SliderField } from './Fields';

const LABELS: Record<AdjustKey, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  exposure: 'Exposure',
  temperature: 'Temperature',
  tint: 'Tint',
  vibrance: 'Vibrance',
  highlights: 'Highlights',
  shadows: 'Shadows',
  sharpen: 'Sharpen',
  blur: 'Blur',
  grain: 'Grain',
  vignette: 'Vignette',
};

const THUMB = 96;

/** Small preview of the photo under each preset (computed once per photo). */
function usePresetThumbs(assetId: string | null): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    setThumbs({});
    if (!assetId) return;
    let alive = true;
    void assetResolver(assetId).then((src) => {
      if (!alive) return;
      const out: Record<string, string> = {};
      out[''] = renderAdjusted(src, neutralAdjust(), THUMB).toDataURL('image/jpeg', 0.8);
      for (const p of PRESETS) out[p.id] = renderAdjusted(src, effectiveAdjust(neutralAdjust(), p.id), THUMB).toDataURL('image/jpeg', 0.8);
      setThumbs(out);
    });
    return () => {
      alive = false;
    };
  }, [assetId]);
  return thumbs;
}

export function AdjustSection({ layer, editor }: { layer: ImageLayer | FrameLayer; editor: Editor }) {
  const p = layer.props;
  const thumbs = usePresetThumbs(p.assetId || null);
  const set = (patch: { adjust?: Adjust; preset?: string | null }, key: string) =>
    patchLayer(editor, layer.id, { props: patch } as never, `adjust:${layer.id}:${key}`);
  const touched = !isNeutral(p.adjust) || !!p.preset;

  return (
    <section class="insp-section">
      <h3>Adjust</h3>
      <div class="preset-row" role="radiogroup" aria-label="Look">
        {[{ id: '', label: 'Original' }, ...PRESETS].map((pr) => {
          const on = (p.preset ?? '') === pr.id;
          return (
            <button
              key={pr.id}
              role="radio"
              aria-checked={on}
              class={`preset-chip${on ? ' on' : ''}`}
              onClick={() => set({ preset: pr.id || null }, 'preset')}
            >
              {thumbs[pr.id] ? <img src={thumbs[pr.id]} alt="" /> : <span class="preset-ph" />}
              <span>{pr.label}</span>
            </button>
          );
        })}
      </div>
      {ADJUST_KEYS.map((k) => (
        <SliderField
          key={k}
          label={LABELS[k]}
          value={p.adjust[k]}
          min={(ONE_SIDED_ADJUST as readonly string[]).includes(k) ? 0 : -100}
          max={100}
          step={1}
          onChange={(v) => set({ adjust: { ...p.adjust, [k]: Math.round(v) } }, k)}
        />
      ))}
      <div class="btn-row">
        <button disabled={!touched} onClick={() => patchLayer(editor, layer.id, { props: { adjust: neutralAdjust(), preset: null } } as never)}>
          Reset adjustments
        </button>
      </div>
    </section>
  );
}

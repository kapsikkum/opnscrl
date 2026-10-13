/**
 * Generic form controls driven by LayerDefinition.inspector specs.
 * Values are plain JSON; every control reports changes with `onChange(value)`
 * and the caller decides how to turn that into a command.
 */
import { useState } from 'preact/hooks';
import { FONTS, findFont, loadFont } from '../app/fonts';
import type { Fill } from '../core/types';
import type { InspectorFieldSpec } from '../layers/types';

type Json = unknown;

export function toHex(color: string): string {
  const c = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (m) return `#${m[1]!}${m[1]!}${m[2]!}${m[2]!}${m[3]!}${m[3]!}`.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  if (rgb) return '#' + [rgb[1]!, rgb[2]!, rgb[3]!].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
  return '#000000';
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div class="field row">
      <span>{label}</span>
      <div class="color-row">
        <input type="color" value={toHex(value)} onInput={(e) => onChange(e.currentTarget.value)} aria-label={`${label} picker`} />
        <input
          type="text"
          class="color-text"
          value={value}
          spellcheck={false}
          onChange={(e) => e.currentTarget.value.trim() && onChange(e.currentTarget.value.trim())}
          aria-label={`${label} value`}
        />
      </div>
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => (Number.isFinite(n) ? n : value);
  return (
    <div class="field">
      <span>
        {label}
        <input
          class="num"
          type="number"
          value={Math.round(value * 1000) / 1000}
          step={step}
          onChange={(e) => onChange(clamp(Number(e.currentTarget.value)))}
          aria-label={`${label} value`}
        />
        {unit ? <small>{unit}</small> : null}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
        aria-label={label}
      />
    </div>
  );
}

export function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label class="field row">
      <span>{label}</span>
      <input
        class="num"
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        onChange={(e) => Number.isFinite(e.currentTarget.valueAsNumber) && onChange(e.currentTarget.valueAsNumber)}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: readonly { value: string | number; label: string }[];
  onChange: (v: string | number) => void;
}) {
  return (
    <label class="field row">
      <span>{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.currentTarget.value);
          if (hit) onChange(hit.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="field row toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={value} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function FontField({ label, value, onChange }: { label: string; value: string; onChange: (stack: string) => void }) {
  const current = findFont(value);
  const [loading, setLoading] = useState(false);
  const cats: Record<string, string> = { sans: 'Sans serif', serif: 'Serif', display: 'Display', handwriting: 'Handwriting', mono: 'Monospace' };
  return (
    <label class="field row">
      <span>{label}</span>
      <select
        value={current?.family ?? '__custom'}
        aria-busy={loading}
        onChange={async (e) => {
          const font = FONTS.find((f) => f.family === e.currentTarget.value);
          if (!font) return;
          setLoading(true);
          await loadFont(font.stack); // load first so the text is measured with the real font
          setLoading(false);
          onChange(font.stack);
        }}
      >
        {!current ? <option value="__custom">{value.split(',')[0]} (not loaded)</option> : null}
        {Object.entries(cats).map(([cat, name]) => (
          <optgroup label={name} key={cat}>
            {FONTS.filter((f) => f.category === cat).map((f) => (
              <option value={f.family} key={f.family}>
                {f.family}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

type Radius = number | [number, number, number, number];

export function RadiusField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: Radius;
  max: number;
  onChange: (v: Radius) => void;
}) {
  const perCorner = Array.isArray(value);
  const uniform = Array.isArray(value) ? Math.max(...value) : value;
  const corners = Array.isArray(value) ? value : ([value, value, value, value] as [number, number, number, number]);
  const names = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
  return (
    <div class="field">
      <SliderField
        label={label}
        value={uniform}
        min={0}
        max={max}
        step={1}
        unit="px"
        onChange={(v) => onChange(perCorner ? ([v, v, v, v] as Radius) : v)}
      />
      <label class="field row toggle">
        <span>Per-corner radii</span>
        <input
          type="checkbox"
          role="switch"
          checked={perCorner}
          onChange={(e) => onChange(e.currentTarget.checked ? ([...corners] as Radius) : Math.max(...corners))}
        />
      </label>
      {perCorner ? (
        <div class="corner-grid">
          {corners.map((c, i) => (
            <label key={i} class="corner">
              <small>{names[i]}</small>
              <input
                class="num"
                type="number"
                min={0}
                value={Math.round(c)}
                onChange={(e) => {
                  const next = [...corners] as [number, number, number, number];
                  next[i] = Math.max(0, e.currentTarget.valueAsNumber || 0);
                  onChange(next);
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FillField({ label, value, onChange }: { label: string; value: Fill; onChange: (v: Fill) => void }) {
  const isGradient = value.kind === 'linear-gradient';
  return (
    <div class="field fill-field">
      <SelectField
        label={label}
        value={value.kind}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'linear-gradient', label: 'Gradient' },
        ]}
        onChange={(k) => {
          if (k === value.kind) return;
          if (k === 'solid') {
            onChange({ kind: 'solid', color: value.kind === 'solid' ? value.color : value.stops[0]!.color });
          } else {
            const c = value.kind === 'solid' ? value.color : '#ffffff';
            onChange({ kind: 'linear-gradient', angle: 135, stops: [{ offset: 0, color: c }, { offset: 1, color: c === '#ffffff' ? '#5b3bff' : '#ffffff' }] });
          }
        }}
      />
      {value.kind === 'solid' ? (
        <ColorField label="Color" value={value.color} onChange={(color) => onChange({ kind: 'solid', color })} />
      ) : null}
      {isGradient && value.kind === 'linear-gradient' ? (
        <>
          <SliderField label="Angle" value={value.angle} min={0} max={360} step={1} unit="deg" onChange={(angle) => onChange({ ...value, angle })} />
          {value.stops.map((s, i) => (
            <div class="stop" key={i}>
              <input
                type="color"
                value={toHex(s.color)}
                aria-label={`Stop ${i + 1} color`}
                onInput={(e) => onChange({ ...value, stops: value.stops.map((x, j) => (j === i ? { ...x, color: e.currentTarget.value } : x)) })}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={s.offset}
                aria-label={`Stop ${i + 1} position`}
                onInput={(e) => onChange({ ...value, stops: value.stops.map((x, j) => (j === i ? { ...x, offset: Number(e.currentTarget.value) } : x)) })}
              />
              <button
                class="icon-btn"
                disabled={value.stops.length <= 2}
                aria-label={`Remove stop ${i + 1}`}
                onClick={() => onChange({ ...value, stops: value.stops.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          {value.stops.length < 5 ? (
            <button
              class="small"
              onClick={() => onChange({ ...value, stops: [...value.stops, { offset: 1, color: value.stops[value.stops.length - 1]!.color }] })}
            >
              Add color stop
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const asNumber = (v: Json, fallback = 0): number => (typeof v === 'number' ? v : fallback);

/** Render one inspector spec. `values` is the object that owns `spec.key`. */
export function SpecField({
  spec,
  values,
  onChange,
}: {
  spec: InspectorFieldSpec;
  values: Record<string, Json>;
  onChange: (key: string, value: Json) => void;
}) {
  if (spec.showWhen && values[spec.showWhen.key] !== spec.showWhen.value) return null;
  const v = values[spec.key];
  const set = (x: Json) => onChange(spec.key, x);
  switch (spec.kind) {
    case 'number':
      return <NumberField label={spec.label} value={asNumber(v)} step={spec.step} onChange={set} />;
    case 'slider':
      return <SliderField label={spec.label} value={asNumber(v)} min={spec.min ?? 0} max={spec.max ?? 100} step={spec.step ?? 1} unit={spec.unit} onChange={set} />;
    case 'color':
      return <ColorField label={spec.label} value={String(v ?? '#000000')} onChange={set} />;
    case 'text':
      return (
        <label class="field row">
          <span>{spec.label}</span>
          <input type="text" value={String(v ?? '')} onInput={(e) => set(e.currentTarget.value)} />
        </label>
      );
    case 'textarea':
      return (
        <label class="field">
          <span>{spec.label}</span>
          <textarea rows={3} value={String(v ?? '')} onInput={(e) => set(e.currentTarget.value)} data-field={spec.key} />
        </label>
      );
    case 'select':
      return <SelectField label={spec.label} value={v as string | number} options={spec.options ?? []} onChange={set} />;
    case 'toggle':
      return <ToggleField label={spec.label} value={!!v} onChange={set} />;
    case 'fill':
      return <FillField label={spec.label} value={v as Fill} onChange={set} />;
    case 'font':
      return <FontField label={spec.label} value={String(v ?? '')} onChange={set} />;
    case 'radius':
      return <RadiusField label={spec.label} value={v as Radius} max={spec.max ?? 600} onChange={set} />;
    case 'group': {
      const on = v !== null && v !== undefined;
      const obj = (on ? v : {}) as Record<string, Json>;
      return (
        <div class="group">
          <label class="field row toggle">
            <span>{spec.label}</span>
            <input
              type="checkbox"
              role="switch"
              checked={on}
              aria-label={spec.label}
              onChange={(e) => set(e.currentTarget.checked ? JSON.parse(JSON.stringify(spec.initial ?? {})) : null)}
            />
          </label>
          {on
            ? (spec.fields ?? []).map((f) => (
                <SpecField key={f.key} spec={f} values={obj} onChange={(k, x) => set({ ...obj, [k]: x })} />
              ))
            : null}
        </div>
      );
    }
  }
}

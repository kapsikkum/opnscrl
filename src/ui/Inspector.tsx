import { useRef } from 'preact/hooks';
import { clearPhoto, deleteSelected, duplicateSelected, patchLayer, replacePhoto } from '../app/actions';
import { errorMessage, toast } from '../app/services';
import type { Layer } from '../core/types';
import { getLayerDefinition } from '../layers';
import type { Editor } from '../state/editor';
import { NumberField, SliderField, SpecField } from './Fields';
import { Icon } from './Icon';

function BaseFields({ layer, editor }: { layer: Layer; editor: Editor }) {
  const set = (key: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity', value: number) =>
    patchLayer(editor, layer.id, { [key]: value }, `base:${layer.id}:${key}`);
  const isText = layer.type === 'text';
  return (
    <section class="insp-section">
      <h3>Position & size</h3>
      <div class="grid2">
        <NumberField label="X" value={layer.x} onChange={(v) => set('x', v)} />
        <NumberField label="Y" value={layer.y} onChange={(v) => set('y', v)} />
        <NumberField label="Width" value={layer.width} onChange={(v) => set('width', Math.max(1, v))} />
        {isText ? null : <NumberField label="Height" value={layer.height} onChange={(v) => set('height', Math.max(1, v))} />}
      </div>
      <SliderField label="Rotation" value={layer.rotation} min={-180} max={180} step={1} unit="deg" onChange={(v) => set('rotation', v)} />
      <SliderField label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} onChange={(v) => set('opacity', v)} />
    </section>
  );
}

function PhotoControls({ layer, editor }: { layer: Layer; editor: Editor }) {
  const input = useRef<HTMLInputElement>(null);
  if (layer.type !== 'frame' && layer.type !== 'image') return null;
  const hasPhoto = !!layer.props.assetId;
  async function onFile(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      await replacePhoto(editor, layer.id, file);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }
  return (
    <section class="insp-section">
      <h3>Photo</h3>
      <div class="btn-row">
        <button onClick={() => input.current?.click()}>
          <Icon name="photo" size={18} /> {hasPhoto ? 'Replace photo' : 'Choose photo'}
        </button>
        {layer.type === 'frame' && hasPhoto ? <button onClick={() => clearPhoto(editor, layer.id)}>Remove photo</button> : null}
        <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
    </section>
  );
}

export function Inspector({ editor }: { editor: Editor }) {
  const selected = editor.selectedLayers.value;
  if (selected.length === 0) {
    return (
      <div class="panel-pad">
        <p class="muted">Nothing selected. Tap a layer on the canvas or in the Layers tab, or add something from the toolbar.</p>
        <p class="muted small">Tip: drag a layer across the dashed seams to make it span slides. Hold Alt while dragging to turn snapping off.</p>
      </div>
    );
  }
  if (selected.length > 1) {
    return (
      <div class="panel-pad">
        <p>
          <b>{selected.length} layers selected</b>
        </p>
        <div class="btn-row">
          <button onClick={() => duplicateSelected(editor)}>
            <Icon name="copy" size={18} /> Duplicate
          </button>
          <button class="danger" onClick={() => deleteSelected(editor)}>
            <Icon name="trash" size={18} /> Delete
          </button>
        </div>
        <p class="muted small">Drag to move them together. Select a single layer to edit its properties.</p>
      </div>
    );
  }
  const layer = selected[0]!;
  const def = getLayerDefinition(layer.type);
  const props = layer.props as unknown as Record<string, unknown>;
  const setProp = (key: string, value: unknown) =>
    patchLayer(editor, layer.id, { props: { [key]: value } } as never, `prop:${layer.id}:${key}`);
  return (
    <div class="panel-pad" key={layer.id}>
      <div class="insp-head">
        <span class="type-badge">
          <Icon name={def.icon ?? 'frame'} size={16} /> {def.label}
        </span>
        <input
          type="text"
          class="name-input"
          value={layer.name}
          aria-label="Layer name"
          onInput={(e) => patchLayer(editor, layer.id, { name: e.currentTarget.value }, `name:${layer.id}`)}
        />
      </div>
      <div class="btn-row">
        <button class="icon-btn" aria-label={layer.locked ? 'Unlock' : 'Lock'} title={layer.locked ? 'Unlock' : 'Lock'} onClick={() => patchLayer(editor, layer.id, { locked: !layer.locked })}>
          <Icon name={layer.locked ? 'lock' : 'unlock'} size={18} />
        </button>
        <button class="icon-btn" aria-label={layer.hidden ? 'Show' : 'Hide'} title={layer.hidden ? 'Show' : 'Hide'} onClick={() => patchLayer(editor, layer.id, { hidden: !layer.hidden })}>
          <Icon name={layer.hidden ? 'eyeoff' : 'eye'} size={18} />
        </button>
        <button class="icon-btn" aria-label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => duplicateSelected(editor)}>
          <Icon name="copy" size={18} />
        </button>
        <button class="icon-btn danger" aria-label="Delete" title="Delete" onClick={() => deleteSelected(editor)}>
          <Icon name="trash" size={18} />
        </button>
      </div>
      <PhotoControls layer={layer} editor={editor} />
      {def.inspector?.length ? (
        <section class="insp-section">
          <h3>{def.label}</h3>
          {def.inspector.map((spec) => (
            <SpecField key={spec.key} spec={spec} values={props} onChange={setProp} />
          ))}
        </section>
      ) : null}
      <BaseFields layer={layer} editor={editor} />
    </div>
  );
}

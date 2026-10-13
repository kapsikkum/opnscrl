import { useState } from 'preact/hooks';
import { errorMessage, toast } from '../app/services';
import { createProjectFromTemplate, saveToMyTemplates } from '../app/templatesApp';
import type { Template } from '../templates';
import { Dialog } from './Dialog';
import { showEditor } from './nav';
import { TemplatePreview } from './TemplatePreview';

/** Preview a template and create a project from it. Used by the browser, file import and `#t=` links. */
export function TemplateUseDialog({
  template,
  title = 'Use template',
  offerSave = false,
  onClose,
}: {
  template: Template;
  title?: string;
  /** Show "Save to My templates" (for imported templates). */
  offerSave?: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [busy, setBusy] = useState(false);
  const photos = Object.keys(template.assets ?? {}).length;

  async function create() {
    setBusy(true);
    try {
      await createProjectFromTemplate(template, name.trim() || template.name);
      onClose();
      showEditor();
    } catch (e) {
      toast(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  async function save() {
    try {
      await saveToMyTemplates(template);
      toast('Saved to My templates', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          {offerSave ? <button onClick={save}>Save to My templates</button> : null}
          <button onClick={onClose}>Cancel</button>
          <button class="primary" disabled={busy} onClick={create}>
            Create project
          </button>
        </>
      }
    >
      <div class="tpl-use">
        <div class="tpl-use-preview">
          <TemplatePreview canvas={template.canvas} layers={template.layers} />
        </div>
        <div class="tpl-use-info">
          <label class="field">
            <span>Project name</span>
            <input type="text" value={name} maxLength={80} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          {template.description ? <p class="muted">{template.description}</p> : null}
          <p class="muted">
            {template.canvas.slideCount} slide{template.canvas.slideCount === 1 ? '' : 's'} · {template.canvas.aspect === 'custom' ? `${template.canvas.customHeightPx}px tall` : template.canvas.aspect}
            {photos ? ` · includes ${photos} photo${photos === 1 ? '' : 's'}` : ' · photo slots are empty'}
          </p>
          {template.tags.length ? (
            <p class="tags">
              {template.tags.map((t) => (
                <span class="tag">{t}</span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

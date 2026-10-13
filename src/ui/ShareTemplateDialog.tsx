import { useEffect, useState } from 'preact/hooks';
import { errorMessage, toast } from '../app/services';
import type { Session } from '../app/session';
import { buildTemplate, saveToMyTemplates } from '../app/templatesApp';
import { projectAssetIds } from '../storage';
import { SHARE_LINK_WARN_LENGTH, encodeShareLink, encodeTemplateFile, templateFileName, type ShareLink, type Template } from '../templates';
import { downloadBlob } from '../export';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

export function ShareTemplateDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const project = session.editor.project.peek();
  const hasPhotos = projectAssetIds(project).size > 0;
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState('');
  const [tagText, setTagText] = useState('');
  const [includePhotos, setIncludePhotos] = useState(false);
  const [template, setTemplate] = useState<Template | null>(null);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tags = tagText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);

  useEffect(() => {
    let live = true;
    setBusy(true);
    const handle = setTimeout(async () => {
      try {
        const t = await buildTemplate(project, { name: name.trim() || project.name, description: description.trim() || undefined, tags, includeAssets: includePhotos });
        if (!live) return;
        setTemplate(t);
        setLink(encodeShareLink(t));
        setError(null);
      } catch (e) {
        if (live) setError(errorMessage(e));
      } finally {
        if (live) setBusy(false);
      }
    }, 150);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [name, description, tagText, includePhotos]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast('Link copied', 'success');
    } catch {
      toast('Could not copy automatically. Select the link and copy it by hand.', 'error');
    }
  }

  function download() {
    if (!template) return;
    downloadBlob(new Blob([encodeTemplateFile(template)], { type: 'application/json' }), templateFileName(template));
  }

  async function save() {
    if (!template) return;
    try {
      await saveToMyTemplates(template);
      toast('Saved to My templates', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  return (
    <Dialog title="Share template" onClose={onClose} wide>
      <p class="muted">
        A template keeps your layout, text and styling. {includePhotos ? 'Your photos are embedded, so the file can get large.' : 'Photos become empty frames, so nothing personal is shared.'}
      </p>
      <label class="field">
        <span>Template name</span>
        <input type="text" value={name} maxLength={80} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>Description (optional)</span>
        <input type="text" value={description} maxLength={200} onInput={(e) => setDescription(e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>Tags (comma separated)</span>
        <input type="text" value={tagText} placeholder="travel, minimal" onInput={(e) => setTagText(e.currentTarget.value)} />
      </label>
      <label class="field row toggle">
        <span>Include photos</span>
        <input type="checkbox" role="switch" checked={includePhotos} disabled={!hasPhotos} onChange={(e) => setIncludePhotos(e.currentTarget.checked)} />
      </label>
      {!hasPhotos ? <p class="muted small">This project has no photos yet.</p> : null}

      {error ? <p class="error" role="alert">{error}</p> : null}

      <div class="field">
        <span>Share link</span>
        <div class="link-row">
          <input type="text" readOnly value={link?.url ?? (busy ? 'Building link...' : '')} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
          <button class="primary" disabled={!link} onClick={copy}>
            <Icon name="link" size={18} /> Copy
          </button>
        </div>
        {link ? (
          <p class={link.tooLong ? 'warn' : 'muted small'} role={link.tooLong ? 'alert' : undefined}>
            {link.tooLong
              ? `This link is ${link.length.toLocaleString()} characters long (over ${SHARE_LINK_WARN_LENGTH.toLocaleString()}). Many apps cut off long links, so download the file and share that instead.`
              : `${link.length.toLocaleString()} characters. Anyone with the link can import it; nothing is uploaded anywhere.`}
          </p>
        ) : null}
      </div>
      <div class="btn-row">
        <button disabled={!template} onClick={download}>
          <Icon name="download" size={18} /> Download .opnscrl.json
        </button>
        <button disabled={!template} onClick={save}>
          Save to My templates
        </button>
      </div>
    </Dialog>
  );
}

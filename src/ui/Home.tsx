import { useEffect, useRef, useState } from 'preact/hooks';
import { ensureThumbnail } from '../app/thumbnails';
import { errorMessage, toast } from '../app/services';
import { readTemplateFile, templateSources } from '../app/templatesApp';
import { deleteProject, duplicateProject, listProjects, loadProject, deleteTemplate, type ProjectSummary } from '../storage';
import { collectTags, type Template, type TemplateListing, type TemplateSource } from '../templates';
import { ASPECT_LABELS, timeAgo } from './aspects';
import { confirmAction } from './Dialog';
import { Icon, Logo } from './Icon';
import { openAndShow } from './nav';
import { NewProjectDialog } from './NewProjectDialog';
import { TemplatePreview } from './TemplatePreview';
import { TemplateUseDialog } from './TemplateUseDialog';

function ProjectCard({
  p,
  thumb,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  p: ProjectSummary;
  thumb?: string;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <article class="card project-card">
      <button class="card-main" onClick={onOpen} aria-label={`Open ${p.name}`}>
        <div class="thumb">{thumb ? <img src={thumb} alt="" /> : <span class="thumb-empty">{p.slideCount} slide{p.slideCount === 1 ? '' : 's'}</span>}</div>
        <div class="card-text">
          <b class="card-title">{p.name}</b>
          <small>
            {p.slideCount} slide{p.slideCount === 1 ? '' : 's'} · {ASPECT_LABELS[p.aspect].name} · {timeAgo(p.updatedAt)}
          </small>
        </div>
      </button>
      <div class="card-actions">
        <button class="icon-btn" onClick={onDuplicate} aria-label={`Duplicate ${p.name}`} title="Duplicate">
          <Icon name="copy" size={18} />
        </button>
        <button class="icon-btn" onClick={onDelete} aria-label={`Delete ${p.name}`} title="Delete">
          <Icon name="trash" size={18} />
        </button>
      </div>
    </article>
  );
}

function TemplateCard({
  source,
  listing,
  onPick,
  onDelete,
}: {
  source: TemplateSource;
  listing: TemplateListing;
  onPick: (t: Template) => void;
  onDelete?: () => void;
}) {
  const [tpl, setTpl] = useState<Template | null>(null);
  useEffect(() => {
    let live = true;
    void source.get(listing.id).then((t) => live && setTpl(t));
    return () => {
      live = false;
    };
  }, [source, listing.id]);
  return (
    <article class="card template-card">
      <button class="card-main" disabled={!tpl} onClick={() => tpl && onPick(tpl)} aria-label={`Use template ${listing.name}`}>
        <div class="thumb">
          {listing.thumbnailUrl ? <img src={listing.thumbnailUrl} alt="" /> : tpl ? <TemplatePreview canvas={tpl.canvas} layers={tpl.layers} /> : null}
        </div>
        <div class="card-text">
          <b class="card-title">{listing.name}</b>
          <small>
            {listing.slideCount} slide{listing.slideCount === 1 ? '' : 's'} · {ASPECT_LABELS[listing.aspect].name}
          </small>
        </div>
      </button>
      {onDelete ? (
        <div class="card-actions">
          <button class="icon-btn" onClick={onDelete} aria-label={`Delete template ${listing.name}`} title="Delete">
            <Icon name="trash" size={18} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [listings, setListings] = useState<Record<string, TemplateListing[]>>({});
  const [sourceId, setSourceId] = useState(templateSources[0]!.id);
  const [tag, setTag] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [picked, setPicked] = useState<{ template: Template; imported: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  async function refreshProjects() {
    const list = await listProjects();
    setProjects(list);
    // thumbnails: cached blobs, rendered lazily for projects that have none yet
    for (const s of list) {
      void (async () => {
        try {
          const project = await loadProject(s.id);
          if (!project) return;
          const blob = await ensureThumbnail(project);
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          setThumbs((t) => ({ ...t, [s.id]: url }));
        } catch {
          /* no thumbnail: the card shows a placeholder */
        }
      })();
    }
  }

  async function refreshTemplates() {
    const next: Record<string, TemplateListing[]> = {};
    for (const src of templateSources) {
      try {
        next[src.id] = await src.list();
      } catch {
        next[src.id] = [];
      }
    }
    setListings(next);
  }

  useEffect(() => {
    void refreshProjects();
    void refreshTemplates();
    return () => urls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const source = templateSources.find((s) => s.id === sourceId) ?? templateSources[0]!;
  const sourceListings = listings[source.id] ?? [];
  const tags = collectTags(sourceListings);
  const shown = tag ? sourceListings.filter((l) => l.tags.includes(tag)) : sourceListings;

  async function onDelete(p: ProjectSummary) {
    if (!(await confirmAction(`Delete "${p.name}"? This can't be undone.`, { confirmLabel: 'Delete', danger: true }))) return;
    await deleteProject(p.id);
    await refreshProjects();
  }
  async function onDuplicate(p: ProjectSummary) {
    await duplicateProject(p.id);
    await refreshProjects();
  }
  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      setPicked({ template: await readTemplateFile(file), imported: true });
    } catch (err) {
      toast(`Can't import that file: ${errorMessage(err)}`, 'error', 6000);
    }
  }

  return (
    <div class="home">
      <header class="home-head">
        <div class="brand">
          <Logo size={30} />
          <h1>opnscrl</h1>
        </div>
        <p class="tagline">Seamless carousels, made on your device.</p>
        <div class="home-actions">
          <button class="primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={18} /> New project
          </button>
          <button onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={18} /> Import template
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onFile} data-testid="template-file" />
        </div>
      </header>

      <main class="home-main">
        <section aria-labelledby="h-projects">
          <h2 id="h-projects">Your projects</h2>
          {projects === null ? (
            <p class="muted">Loading...</p>
          ) : projects.length === 0 ? (
            <div class="empty">
              <p>No projects yet. Start blank, or pick a template below.</p>
              <button class="primary" onClick={() => setShowNew(true)}>
                New project
              </button>
            </div>
          ) : (
            <div class="grid">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  thumb={thumbs[p.id]}
                  onOpen={() => void openAndShow(p.id)}
                  onDuplicate={() => void onDuplicate(p)}
                  onDelete={() => void onDelete(p)}
                />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="h-templates">
          <div class="section-head">
            <h2 id="h-templates">Templates</h2>
            <div class="seg" role="tablist" aria-label="Template source">
              {templateSources.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={s.id === source.id}
                  class={s.id === source.id ? 'on' : ''}
                  onClick={() => {
                    setSourceId(s.id);
                    setTag(null);
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          {tags.length ? (
            <div class="chips" aria-label="Filter by tag">
              <button class={`chip${tag === null ? ' on' : ''}`} onClick={() => setTag(null)}>
                All
              </button>
              {tags.map((t) => (
                <button key={t} class={`chip${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                  {t}
                </button>
              ))}
            </div>
          ) : null}
          {shown.length === 0 ? (
            <p class="muted">
              {source.writable ? 'Templates you save from the editor (Share template > Save to My templates) appear here.' : 'No templates match.'}
            </p>
          ) : (
            <div class="grid">
              {shown.map((l) => (
                <TemplateCard
                  key={`${source.id}:${l.id}`}
                  source={source}
                  listing={l}
                  onPick={(template) => setPicked({ template, imported: false })}
                  onDelete={
                    source.writable
                      ? async () => {
                          if (!(await confirmAction(`Delete template "${l.name}"?`, { confirmLabel: 'Delete', danger: true }))) return;
                          await deleteTemplate(l.id);
                          await refreshTemplates();
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer class="home-foot">Free and open source. No accounts, no tracking. Your photos never leave this device.</footer>

      {showNew ? <NewProjectDialog onClose={() => setShowNew(false)} /> : null}
      {picked ? (
        <TemplateUseDialog
          template={picked.template}
          title={picked.imported ? 'Import template' : 'Use template'}
          offerSave={picked.imported}
          onClose={() => {
            setPicked(null);
            void refreshTemplates();
          }}
        />
      ) : null}
    </div>
  );
}

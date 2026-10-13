import { useEffect, useState } from 'preact/hooks';
import { dismissToast, errorMessage, toast, toasts } from '../app/services';
import { currentSession, lastProjectId, rememberLastProject } from '../app/session';
import { templateFromLocation } from '../app/templatesApp';
import { gcAssets } from '../storage';
import type { Template } from '../templates';
import { ConfirmHost } from './Dialog';
import { Editor } from './Editor';
import { Home } from './Home';
import { initNavigation, openAndShow, view } from './nav';
import { TemplateUseDialog } from './TemplateUseDialog';

function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'} onClick={() => dismissToast(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Pull a `#t=...` template out of the URL, clearing the hash so a reload doesn't re-prompt. */
function takeTemplateFromHash(): Template | null {
  if (!location.hash.includes('t=')) return null;
  try {
    const t = templateFromLocation();
    return t;
  } catch (e) {
    toast(`That template link couldn't be opened: ${errorMessage(e)}`, 'error', 7000);
    return null;
  } finally {
    history.replaceState(history.state, '', location.pathname + location.search);
  }
}

export function App() {
  const [ready, setReady] = useState(false);
  const [incoming, setIncoming] = useState<Template | null>(null);

  useEffect(() => {
    initNavigation();
    void navigator.storage?.persist?.().catch(() => {});
    const onHash = () => {
      const t = takeTemplateFromHash();
      if (t) setIncoming(t);
    };
    window.addEventListener('hashchange', onHash);
    (async () => {
      const t = takeTemplateFromHash();
      if (t) setIncoming(t);
      try {
        await gcAssets(); // sweep photos left behind by undone imports
      } catch {
        /* storage unavailable: the app still works for the session */
      }
      const last = lastProjectId();
      if (!t && last) {
        const ok = await openAndShow(last);
        if (!ok) rememberLastProject(null);
      }
      setReady(true);
    })();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const s = currentSession.value;
  return (
    <>
      {!ready ? (
        <div class="splash" role="status">
          Loading...
        </div>
      ) : view.value === 'editor' && s ? (
        <Editor key={s.projectId} session={s} />
      ) : (
        <Home />
      )}
      {incoming ? (
        <TemplateUseDialog template={incoming} title="Import shared template" offerSave onClose={() => setIncoming(null)} />
      ) : null}
      <ConfirmHost />
      <Toasts />
    </>
  );
}

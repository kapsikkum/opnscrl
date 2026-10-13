import { useEffect, useLayoutEffect, useReducer, useRef } from 'preact/hooks';
import type { Editor } from '../state/editor';
import type { Renderer } from '../render';

/**
 * On-canvas text editing: a transparent textarea laid exactly over a text
 * layer (font, size, color, alignment, rotation and zoom), while the Konva
 * text is hidden. Commits as one undoable update on blur or Ctrl/Cmd+Enter;
 * Escape cancels.
 */
export function TextEditOverlay({
  editor,
  renderer,
  host,
  layerId,
  onDone,
}: {
  editor: Editor;
  renderer: Renderer;
  host: HTMLElement;
  layerId: string;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [, bump] = useReducer((n: number, _: void) => n + 1, 0);
  const rerender = () => bump();
  const layer = editor.project.value.layers.find((l) => l.id === layerId);
  const original = useRef(layer?.type === 'text' ? layer.props.text : '');
  const finished = useRef(false);

  useEffect(() => {
    renderer.setEditingText(layerId);
    const off = renderer.onViewportChange(rerender);
    const onResize = () => rerender();
    window.addEventListener('resize', onResize);
    const el = ref.current;
    if (el) {
      el.focus();
      el.select();
    }
    return () => {
      off();
      window.removeEventListener('resize', onResize);
      renderer.setEditingText(null);
    };
  }, [layerId]);

  // grow with the content
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  });

  if (!layer || layer.type !== 'text') {
    queueMicrotask(onDone);
    return null;
  }
  const box = renderer.getLayerScreenBox(layerId);
  if (!box) return null;
  const hostRect = host.getBoundingClientRect();
  const p = layer.props;
  const s = box.scale;

  function finish(commit: boolean) {
    if (finished.current) return;
    finished.current = true;
    const value = ref.current?.value ?? '';
    if (commit && value.trim() && value !== original.current) {
      editor.dispatch({ op: 'updateLayer', id: layerId, patch: { props: { text: value } } });
      editor.history.breakCoalescing();
    }
    onDone();
  }

  return (
    <textarea
      ref={ref}
      class="text-edit-overlay"
      aria-label="Edit text"
      spellcheck={false}
      defaultValue={p.text}
      onInput={() => rerender()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          finish(true);
        }
      }}
      style={{
        left: `${hostRect.left + box.left}px`,
        top: `${hostRect.top + box.top}px`,
        width: `${layer.width * s}px`,
        transform: `rotate(${box.rotation}deg)`,
        fontFamily: p.fontFamily,
        fontSize: `${p.fontSize * s}px`,
        fontWeight: p.fontWeight,
        color: p.color,
        textAlign: p.align,
        lineHeight: p.lineHeight,
        letterSpacing: `${p.letterSpacing * s}px`,
        opacity: layer.opacity,
      }}
    />
  );
}

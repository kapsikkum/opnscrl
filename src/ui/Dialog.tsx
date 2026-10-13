import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon';

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, []);
  return (
    <div class="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header class="dialog-head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div class="dialog-body">{children}</div>
        {footer ? <footer class="dialog-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

// ---- promise-based confirm (window.confirm is blocking and unstyled) ----
interface ConfirmState {
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}
const confirmState = signal<ConfirmState | null>(null);

export function confirmAction(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.value = { message, confirmLabel: opts.confirmLabel ?? 'OK', danger: opts.danger ?? false, resolve };
  });
}

export function ConfirmHost() {
  const s = confirmState.value;
  if (!s) return null;
  const done = (ok: boolean) => {
    confirmState.value = null;
    s.resolve(ok);
  };
  return (
    <Dialog
      title="Please confirm"
      onClose={() => done(false)}
      footer={
        <>
          <button onClick={() => done(false)}>Cancel</button>
          <button class={s.danger ? 'danger' : 'primary'} onClick={() => done(true)} autofocus>
            {s.confirmLabel}
          </button>
        </>
      }
    >
      <p>{s.message}</p>
    </Dialog>
  );
}

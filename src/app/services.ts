/** App-wide singletons: the asset resolver, toasts and a few DOM helpers. */
import { signal } from '@preact/signals';
import { createAssetResolver } from '../storage';

/** Loads photos from IndexedDB for the renderer and the exporter. */
export const assetResolver = createAssetResolver();

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

export const toasts = signal<Toast[]>([]);
let toastId = 0;

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3800): void {
  const t: Toast = { id: ++toastId, kind, text };
  toasts.value = [...toasts.value, t];
  setTimeout(() => dismissToast(t.id), ms);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Blob -> data URL. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(blob);
  });
}

/** data URL -> Blob (only used for already-validated image data URLs). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'application/octet-stream';
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function readFileText(file: Blob): Promise<string> {
  return file.text();
}

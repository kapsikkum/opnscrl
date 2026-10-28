import { describe, expect, it, vi } from 'vitest';
import { albumFor, saveSlicesToGallery, type GalleryProgress, type InvokeFn, type SliceItem } from '../src/export/native';

const item = (n: number): SliceItem => ({ blob: new Blob([new Uint8Array([n])], { type: 'image/png' }), fileName: `trip-0${n}.png` });

interface Fake {
  invoke: InvokeFn;
  saved: string[];
  calls: string[];
}

/** Fake shell: `failNames` fail the first `failTimes` attempts. */
function fakeShell(opts: { permission?: string; request?: string; failNames?: string[]; failTimes?: number } = {}): Fake {
  const saved: string[] = [];
  const calls: string[] = [];
  const attempts = new Map<string, number>();
  const invoke: InvokeFn = async (cmd, args, options) => {
    calls.push(cmd);
    if (cmd === 'gallery_permission_status') return opts.permission ?? 'granted';
    if (cmd === 'gallery_request_permission') return opts.request ?? 'granted';
    expect(cmd).toBe('save_image_to_gallery');
    expect(args).toBeInstanceOf(Uint8Array);
    const name = decodeURIComponent(options!.headers!['x-filename']!);
    const n = (attempts.get(name) ?? 0) + 1;
    attempts.set(name, n);
    if (opts.failNames?.includes(name) && n <= (opts.failTimes ?? 1)) throw 'disk full';
    saved.push(`${decodeURIComponent(options!.headers!['x-album']!)}/${name}:${options!.headers!['x-mime']}`);
    return { ok: true };
  };
  return { invoke, saved, calls };
}

describe('saveSlicesToGallery', () => {
  it('saves sequentially with progress and the header contract', async () => {
    const shell = fakeShell();
    const progress: GalleryProgress[] = [];
    const r = await saveSlicesToGallery({ items: [item(1), item(2), item(3)], total: 3, album: 'my trip', invoke: shell.invoke, onProgress: (p) => progress.push(p) });
    expect(r.status).toBe('done');
    expect(r.saved).toBe(3);
    expect(shell.saved).toEqual(['my trip/trip-01.png:image/png', 'my trip/trip-02.png:image/png', 'my trip/trip-03.png:image/png']);
    expect(progress.at(-1)).toEqual({ done: 3, failed: 0, total: 3 });
  });

  it('pulls items lazily, one at a time', async () => {
    const shell = fakeShell();
    let pulled = 0;
    async function* gen() {
      for (let i = 1; i <= 3; i++) {
        pulled++;
        expect(shell.saved.length).toBe(i - 1); // previous one is already sent
        yield item(i);
      }
    }
    await saveSlicesToGallery({ items: gen(), total: 3, invoke: shell.invoke });
    expect(pulled).toBe(3);
  });

  it('denied permission stops before any save', async () => {
    const shell = fakeShell({ permission: 'prompt', request: 'denied' });
    const r = await saveSlicesToGallery({ items: [item(1)], total: 1, invoke: shell.invoke });
    expect(r.status).toBe('permission-denied');
    expect(shell.calls).toEqual(['gallery_permission_status', 'gallery_request_permission']);
  });

  it('records failures without throwing and retries only those', async () => {
    const shell = fakeShell({ failNames: ['trip-02.png'] });
    const progress: GalleryProgress[] = [];
    const r = await saveSlicesToGallery({ items: [item(1), item(2), item(3)], total: 3, invoke: shell.invoke, onProgress: (p) => progress.push(p) });
    expect(r.saved).toBe(2);
    expect(r.failedItems.map((f) => f.fileName)).toEqual(['trip-02.png']);
    expect(r.failedItems[0]!.error).toBe('disk full');
    expect(progress.at(-1)).toEqual({ done: 2, failed: 1, total: 3 });

    const r2 = await r.retryFailed();
    expect(r2.saved).toBe(3);
    expect(r2.failedItems).toHaveLength(0);
    expect(shell.saved.filter((s) => s.includes('trip-02'))).toHaveLength(1);
    expect(shell.saved.filter((s) => s.includes('trip-01'))).toHaveLength(1); // not resent
    expect(progress.at(-1)).toEqual({ done: 3, failed: 0, total: 3 });
  });

  it('keeps an item failed when the retry fails too', async () => {
    const shell = fakeShell({ failNames: ['trip-01.png'], failTimes: 2 });
    const r = await saveSlicesToGallery({ items: [item(1)], total: 1, invoke: shell.invoke });
    const r2 = await r.retryFailed();
    expect(r2.failedItems).toHaveLength(1);
    expect((await r2.retryFailed()).failedItems).toHaveLength(0);
  });

  it('cancel stops before the next image and closes the generator', async () => {
    const shell = fakeShell();
    const ctrl = new AbortController();
    let closed = false;
    async function* gen() {
      try {
        for (let i = 1; i <= 5; i++) yield item(i);
      } finally {
        closed = true;
      }
    }
    const r = await saveSlicesToGallery({
      items: gen(),
      total: 5,
      invoke: shell.invoke,
      signal: ctrl.signal,
      onProgress: (p) => p.done === 2 && ctrl.abort(),
    });
    expect(r.status).toBe('cancelled');
    expect(r.saved).toBe(2);
    expect(closed).toBe(true);
  });

  it('uses image/jpeg for .jpg files', async () => {
    const invoke = vi.fn<InvokeFn>(async (cmd) => (cmd === 'gallery_permission_status' ? 'granted' : { ok: true }));
    await saveSlicesToGallery({ items: [{ blob: new Blob(['x']), fileName: 'a-01.jpg' }], total: 1, invoke });
    expect(invoke.mock.calls.at(-1)![2]!.headers!['x-mime']).toBe('image/jpeg');
  });
});

describe('albumFor', () => {
  it('slugifies the project name, defaulting to opnscrl', () => {
    expect(albumFor('My Trip!')).toBe('my-trip');
    expect(albumFor('   ')).toBe('opnscrl');
  });
});

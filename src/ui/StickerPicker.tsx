import { useEffect, useRef, useState } from 'preact/hooks';
import { errorMessage, toast } from '../app/services';
import type { Session } from '../app/session';
import { addBuiltinSticker, addEmoji, addLibraryStickerLayer, uploadStickers } from '../app/stickers';
import { BUILTIN_STICKERS, stickerDataUrl } from '../layers/sticker/builtin';
import { getAsset, listLibraryStickers, removeLibrarySticker, type StickerRecord } from '../storage';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

type Tab = 'builtin' | 'mine' | 'emoji';

const EMOJI = (
  '😀 😂 🥹 😍 🥰 😎 🤩 🥳 😭 😴 🤯 🫶 👍 👏 🙌 🙏 💪 👀 ✌️ 🤞 ' +
  '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💫 ✨ 🔥 🌈 ☀️ 🌙 ⭐ 🌸 🌻 🌿 🍀 ' +
  '🌊 🏔️ 🏝️ 🌅 🌃 🗺️ ✈️ 🚗 🚲 📍 🎉 🎂 🎁 🎈 🎶 📸 🎬 🎨 📚 ☕ ' +
  '🍕 🍔 🍣 🍓 🍑 🥑 🍦 🍷 🥂 🐶 🐱 🐻 🐼 🦋 🐚 ⚡ 💯 ✅ ❌ ➡️'
).split(' ');

export function StickerPicker({ session, onClose }: { session: Session; onClose: () => void }) {
  const { editor } = session;
  const [tab, setTab] = useState<Tab>('builtin');
  const [mine, setMine] = useState<(StickerRecord & { url: string })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const slide = () => session.currentSlide.peek();

  async function loadMine() {
    const recs = await listLibraryStickers();
    const withUrls = await Promise.all(
      recs.map(async (r) => {
        const blob = await getAsset(r.assetId);
        return { ...r, url: blob ? URL.createObjectURL(blob) : '' };
      }),
    );
    setMine((prev) => {
      prev?.forEach((m) => m.url && URL.revokeObjectURL(m.url));
      return withUrls.filter((m) => m.url);
    });
  }
  useEffect(() => {
    if (tab === 'mine' && !mine) void loadMine();
  }, [tab]);
  useEffect(() => () => mine?.forEach((m) => m.url && URL.revokeObjectURL(m.url)), [mine]);

  const done = () => onClose();

  async function onUpload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const r = await uploadStickers(files);
      for (const f of r.failed.slice(0, 3)) toast(`${f.name}: ${f.reason}`, 'error', 6000);
      if (r.added.length) toast(`Added ${r.added.length} sticker${r.added.length === 1 ? '' : 's'} to My stickers`, 'success');
      await loadMine();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Stickers" onClose={onClose} wide>
      <div class="seg" role="tablist" aria-label="Sticker source">
        {(
          [
            ['builtin', 'Built-in'],
            ['mine', 'My stickers'],
            ['emoji', 'Emoji'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'builtin' ? (
        <div class="sticker-grid">
          {BUILTIN_STICKERS.map((s) => (
            <button
              key={s.id}
              class="sticker-cell"
              title={s.label}
              aria-label={`Add ${s.label} sticker`}
              onClick={() => {
                addBuiltinSticker(editor, slide(), s.id);
                done();
              }}
            >
              <img src={stickerDataUrl(s, undefined, 128)} alt="" />
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'mine' ? (
        <>
          <div class="btn-row">
            <button onClick={() => input.current?.click()} disabled={busy}>
              <Icon name="plus" size={16} /> {busy ? 'Adding...' : 'Upload PNG or SVG'}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/gif,.svg"
              multiple
              hidden
              data-testid="sticker-input"
              onChange={(e) => {
                const files = [...(e.currentTarget.files ?? [])];
                e.currentTarget.value = '';
                void onUpload(files);
              }}
            />
          </div>
          {mine === null ? (
            <p class="muted">Loading...</p>
          ) : mine.length === 0 ? (
            <p class="muted">No stickers yet. Upload transparent PNGs or SVGs; they stay here for every project on this device.</p>
          ) : (
            <div class="sticker-grid">
              {mine.map((m) => (
                <div key={m.assetId} class="sticker-cell-wrap">
                  <button
                    class="sticker-cell"
                    aria-label="Add sticker"
                    onClick={() => {
                      addLibraryStickerLayer(editor, slide(), m);
                      done();
                    }}
                  >
                    <img src={m.url} alt="" />
                  </button>
                  <button
                    class="icon-btn sticker-remove"
                    aria-label="Remove from My stickers"
                    title="Remove from My stickers"
                    onClick={async () => {
                      await removeLibrarySticker(m.assetId);
                      await loadMine();
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === 'emoji' ? (
        <div class="emoji-grid">
          {EMOJI.map((e) => (
            <button
              key={e}
              class="emoji-cell"
              aria-label={`Add ${e}`}
              onClick={() => {
                addEmoji(editor, slide(), e);
                done();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}
    </Dialog>
  );
}

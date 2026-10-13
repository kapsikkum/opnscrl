/**
 * Built-in stickers: small original vector drawings (opnscrl's own, MIT like
 * the rest of the code). Every sticker is drawn in `currentColor` on a
 * 100x100 viewBox (some are wider), so a single tint color recolors it.
 */
export interface BuiltinSticker {
  id: string;
  label: string;
  /** Default color when the layer has no tint. */
  color: string;
  /** viewBox width/height (height is always 100). */
  w: number;
  /** Inner SVG markup using currentColor. */
  body: string;
}

const S = (id: string, label: string, color: string, body: string, w = 100): BuiltinSticker => ({ id, label, color, w, body });

export const BUILTIN_STICKERS: readonly BuiltinSticker[] = [
  S('heart', 'Heart', '#ff3b6b', '<path fill="currentColor" d="M50 88C20 66 6 50 6 32 6 18 17 8 30 8c9 0 16 5 20 12 4-7 11-12 20-12 13 0 24 10 24 24 0 18-14 34-44 56z"/>'),
  S('heart-outline', 'Heart outline', '#ff3b6b', '<path fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" d="M50 84C22 64 10 49 10 33c0-12 9-21 20-21 9 0 16 6 20 13 4-7 11-13 20-13 11 0 20 9 20 21 0 16-12 31-40 51z"/>'),
  S('star', 'Star', '#ffc21a', '<path fill="currentColor" d="M50 5l13 28 30 3-23 20 7 30-27-16-27 16 7-30L7 36l30-3z"/>'),
  S('sparkle', 'Sparkle', '#ffd84d', '<path fill="currentColor" d="M50 2c3 26 10 38 46 48-36 10-43 22-46 48C47 72 40 60 4 50 40 40 47 28 50 2z"/>'),
  S('sparkles', 'Sparkles', '#ffd84d', '<path fill="currentColor" d="M38 10c2 20 8 28 34 36-26 8-32 16-34 36-2-20-8-28-34-36 26-8 32-16 34-36zM78 52c1 11 4 15 18 19-14 4-17 8-18 19-1-11-4-15-18-19 14-4 17-8 18-19zM80 4c1 8 3 10 12 13-9 3-11 5-12 13-1-8-3-10-12-13 9-3 11-5 12-13z"/>'),
  S('burst', 'Burst', '#ff6a2b', '<path fill="currentColor" d="M50 0l9 20 20-11-3 23 22 3-17 15 17 15-22 3 3 23-20-11-9 20-9-20-20 11 3-23-22-3 17-15L1 35l22-3-3-23 20 11z"/>'),
  S('circle', 'Circle', '#2f7cf6', '<circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="7"/>'),
  S('scribble-circle', 'Scribble circle', '#ff3b30', '<path fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" d="M62 12C30 4 6 24 8 50s28 42 54 38 34-26 30-46S68 6 44 10C24 14 14 30 18 46"/>', 100),
  S('arrow-right', 'Arrow', '#111111', '<path fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M10 50h76M62 24l26 26-26 26"/>'),
  S('arrow-curve', 'Curved arrow', '#111111', '<path fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M12 80C18 38 44 18 84 22M66 8l18 14-16 16"/>'),
  S('arrow-loop', 'Loop arrow', '#111111', '<path fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M8 70c20 4 34-6 36-22 2-14-12-18-18-8-8 14 14 30 40 24 14-3 22-10 26-18M84 34l6 12-13 4"/>', 100),
  S('underline', 'Swoosh underline', '#ff3b6b', '<path fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" d="M6 60c30-14 60-14 92-6 26 6 50 6 86-6"/>', 190),
  S('bubble', 'Speech bubble', '#ffffff', '<path fill="currentColor" stroke="#111" stroke-width="4" stroke-linejoin="round" d="M14 14h72a8 8 0 018 8v42a8 8 0 01-8 8H44L24 90l4-18H14a8 8 0 01-8-8V22a8 8 0 018-8z"/>'),
  S('thought', 'Thought bubble', '#ffffff', '<g fill="currentColor" stroke="#111" stroke-width="4"><path d="M30 64c-14 0-22-10-20-20 2-9 10-13 16-12 2-12 14-20 26-16 8-8 24-6 28 6 12 0 18 10 16 20-2 11-12 16-22 14-6 8-18 10-26 4-6 4-12 4-18 4z"/><circle cx="22" cy="78" r="6"/><circle cx="12" cy="92" r="4"/></g>'),
  S('tape', 'Tape', '#f3d58a', '<path fill="currentColor" opacity="0.85" d="M4 30l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6v40l-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6z"/>', 112),
  S('label', 'Label', '#111111', '<path fill="currentColor" d="M6 24h120l16 26-16 26H6a6 6 0 01-6-6V30a6 6 0 016-6z"/><circle cx="122" cy="50" r="5" fill="#fff"/>', 148),
  S('badge', 'Badge', '#2f7cf6', '<path fill="currentColor" d="M50 2l11 9 14-2 5 13 13 5-2 14 9 11-9 11 2 14-13 5-5 13-14-2-11 9-11-9-14 2-5-13-13-5 2-14-9-11 9-11-2-14 13-5 5-13 14 2z"/>'),
  S('check', 'Check', '#18b26b', '<path fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" d="M14 54l24 24 48-54"/>'),
  S('cross', 'Cross', '#ff3b30', '<path fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" d="M18 18l64 64M82 18L18 82"/>'),
  S('smile', 'Smile', '#ffc21a', '<circle cx="50" cy="50" r="44" fill="currentColor"/><circle cx="35" cy="40" r="6" fill="#111"/><circle cx="65" cy="40" r="6" fill="#111"/><path fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" d="M30 60c10 14 30 14 40 0"/>'),
  S('sun', 'Sun', '#ffb21a', '<circle cx="50" cy="50" r="20" fill="currentColor"/><g stroke="currentColor" stroke-width="7" stroke-linecap="round"><path d="M50 6v12M50 82v12M6 50h12M82 50h12M19 19l8 8M73 73l8 8M19 81l8-8M73 27l8-8"/></g>'),
  S('moon', 'Moon', '#c9b8ff', '<path fill="currentColor" d="M62 6A44 44 0 1094 64 36 36 0 0162 6z"/>'),
  S('flower', 'Flower', '#ff8fb8', '<g fill="currentColor"><circle cx="50" cy="24" r="18"/><circle cx="76" cy="44" r="18"/><circle cx="66" cy="74" r="18"/><circle cx="34" cy="74" r="18"/><circle cx="24" cy="44" r="18"/></g><circle cx="50" cy="52" r="13" fill="#ffd84d"/>'),
  S('bolt', 'Lightning', '#ffd21a', '<path fill="currentColor" d="M58 2L14 58h28l-8 40 44-58H50z"/>'),
  S('crown', 'Crown', '#ffc21a', '<path fill="currentColor" d="M8 78l-4-50 26 22 20-34 20 34 26-22-4 50z"/><rect x="8" y="82" width="84" height="10" rx="3" fill="currentColor"/>'),
  S('music', 'Music note', '#111111', '<path fill="currentColor" d="M38 12l46-10v62a14 12 0 11-8-11V22L46 28v48a14 12 0 11-8-11z"/>'),
  S('pin', 'Location pin', '#ff3b30', '<path fill="currentColor" d="M50 96S16 60 16 38a34 34 0 0168 0c0 22-34 58-34 58z"/><circle cx="50" cy="38" r="12" fill="#fff"/>'),
  S('exclaim', 'Exclamation', '#ff3b30', '<rect x="40" y="6" width="20" height="62" rx="10" fill="currentColor"/><circle cx="50" cy="86" r="10" fill="currentColor"/>'),
];

const byId = new Map(BUILTIN_STICKERS.map((s) => [s.id, s]));

export function getBuiltinSticker(id: string | null | undefined): BuiltinSticker | undefined {
  return id ? byId.get(id) : undefined;
}

/** Standalone SVG document for a sticker in the given color. */
export function stickerSvg(s: BuiltinSticker, color: string = s.color, px = 512): string {
  const h = px;
  const w = Math.round((px * s.w) / 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${s.w} 100" style="color:${color}">${s.body.replace(/currentColor/g, color)}</svg>`;
}

export function stickerDataUrl(s: BuiltinSticker, color?: string, px?: number): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stickerSvg(s, color, px))}`;
}

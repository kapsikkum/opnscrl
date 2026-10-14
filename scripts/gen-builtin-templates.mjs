// Generates src/templates/builtin/*.json (the built-in starter templates).
// All designs here are original. Run: node scripts/gen-builtin-templates.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates', 'builtin');
mkdirSync(OUT, { recursive: true });

const SCHEMA_VERSION = 4;
const SW = 1080;
const HEIGHTS = { '4:5': 1350, '1:1': 1080, '9:16': 1920 };
const CREATED = Date.UTC(2026, 0, 1);

const font = {
  inter: 'Inter, system-ui, sans-serif',
  playfair: "'Playfair Display', Georgia, serif",
  bebas: "'Bebas Neue', Impact, sans-serif",
  caveat: "Caveat, 'Comic Sans MS', cursive",
  space: "'Space Grotesk', system-ui, sans-serif",
  mono: "'Space Mono', ui-monospace, monospace",
  anton: "Anton, Impact, sans-serif",
  dmserif: "'DM Serif Display', Georgia, serif",
};

const ADJUST_KEYS = ['brightness', 'contrast', 'saturation', 'exposure', 'temperature', 'tint', 'vibrance', 'highlights', 'shadows', 'sharpen', 'blur', 'grain', 'vignette'];
const neutralAdjust = () => Object.fromEntries(ADJUST_KEYS.map((k) => [k, 0]));

/** Text background box (pill / label). */
const pill = (color, o = {}) => ({ color, opacity: 1, paddingX: 28, paddingY: 12, radius: 999, ...o });

const solid = (color) => ({ kind: 'solid', color });
const grad = (angle, ...stops) => ({
  kind: 'linear-gradient',
  angle,
  stops: stops.map((color, i) => ({ offset: stops.length === 1 ? 0 : i / (stops.length - 1), color })),
});

function make({ id, name, description, tags, slides, aspect, bg = solid('#ffffff'), custom }) {
  const H = custom ?? HEIGHTS[aspect];
  let n = 0;
  const layers = [];
  const base = (type, o, props) => ({
    id: `${id}-${++n}`,
    type,
    x: Math.round(o.x * 100) / 100,
    y: Math.round(o.y * 100) / 100,
    width: o.w,
    height: o.h,
    rotation: o.rot ?? 0,
    opacity: o.opacity ?? 1,
    locked: o.locked ?? false,
    hidden: false,
    name: o.name ?? type,
    props,
  });
  const api = {
    W: slides * SW,
    H,
    background(fill, name = 'Background') {
      layers.push(base('background', { x: 0, y: 0, w: slides * SW, h: H, locked: true, name }, { fill }));
    },
    frame(o, p = {}) {
      layers.push(
        base('frame', { name: 'Photo', ...o }, {
          cornerRadius: 24,
          assetId: null,
          fit: 'cover',
          placeholderLabel: 'Drop photo',
          border: null,
          shadow: null,
          adjust: neutralAdjust(),
          preset: null,
          ...p,
        }),
      );
    },
    /** Photo frames for unit-square layout cells ([x0, y0, x1, y1]) inside an area. */
    layout(area, boxes, { gutter = 24, padding = 48, name = 'Photo', ...p } = {}) {
      const iw = area.w - 2 * padding;
      const ih = area.h - 2 * padding;
      const half = gutter / 2;
      const pull = (v, start) => (v <= 1e-6 || v >= 1 - 1e-6 ? 0 : start ? half : -half);
      boxes.forEach(([x0, y0, x1, y1], i) => {
        const l = Math.round(area.x + padding + x0 * iw + pull(x0, true));
        const r = Math.round(area.x + padding + x1 * iw + pull(x1, false));
        const t = Math.round(area.y + padding + y0 * ih + pull(y0, true));
        const b = Math.round(area.y + padding + y1 * ih + pull(y1, false));
        api.frame({ x: l, y: t, w: r - l, h: b - t, name: `${name} ${i + 1}` }, p);
      });
    },
    sticker(o, builtinId, p = {}) {
      layers.push(base('sticker', { name: 'Sticker', h: o.w, ...o }, { builtinId, assetId: null, tint: null, flipX: false, flipY: false, ...p }));
    },
    /** Freehand strokes given in canvas px; stored normalized to the layer box. */
    drawing(o, strokes) {
      const norm = (pts) => pts.map((v, i) => Math.round((i % 2 ? (v - o.y) / o.h : (v - o.x) / o.w) * 10000) / 10000);
      layers.push(base('drawing', { name: 'Drawing', ...o }, { strokes: strokes.map(({ points, color = '#111111', width = 8, opacity = 1 }) => ({ points: norm(points), color, width, opacity })) }));
    },
    shape(o, p = {}) {
      layers.push(
        base('shape', { name: 'Shape', ...o }, {
          kind: 'rect',
          fill: solid('#111111'),
          stroke: '#111111',
          strokeWidth: 0,
          cornerRadius: 0,
          ...p,
        }),
      );
    },
    text(o, p = {}) {
      layers.push(
        base('text', { name: 'Text', h: Math.round((p.fontSize ?? 96) * (p.lineHeight ?? 1.1)), ...o }, {
          text: 'Text',
          fontFamily: font.inter,
          fontSize: 96,
          fontWeight: 700,
          color: '#111111',
          align: 'left',
          lineHeight: 1.1,
          letterSpacing: 0,
          stroke: null,
          shadow: null,
          background: null,
          ...p,
        }),
      );
    },
    line(o, p = {}) {
      layers.push(
        base('line', { name: 'Line', h: 40, ...o }, {
          start: { x: 0, y: 0.5 },
          end: { x: 1, y: 0.5 },
          color: '#111111',
          width: 6,
          dash: 'solid',
          startCap: 'none',
          endCap: 'none',
          ...p,
        }),
      );
    },
    layers,
  };
  return {
    api,
    done() {
      return {
        schemaVersion: SCHEMA_VERSION,
        id,
        name,
        description,
        tags,
        canvas: { slideCount: slides, aspect, customHeightPx: 1350, slideWidthPx: SW, background: bg },
        layers,
        createdAt: CREATED,
      };
    },
  };
}

const save = (t) => writeFileSync(join(OUT, `${t.id}.json`), JSON.stringify(t, null, 2) + '\n');

/** Position of a child (offset from the group's center, unrotated) after rotating the group about its center. */
function rot(cx, cy, ox, oy, deg) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + ox * Math.cos(a) - oy * Math.sin(a), y: cy + ox * Math.sin(a) + oy * Math.cos(a) };
}

// 1 ---------------------------------------------------------------- panorama
{
  const t = make({
    id: 'triple-panorama',
    name: 'Triple panorama',
    description: 'One wide photo that runs across three slides, with a swipe cue underneath.',
    tags: ['panorama', 'minimal'],
    slides: 3,
    aspect: '4:5',
    bg: solid('#f4f1ea'),
  });
  const a = t.api;
  a.frame({ x: 60, y: 200, w: a.W - 120, h: 900, name: 'Panorama photo' }, { cornerRadius: 28, placeholderLabel: 'Drop a wide photo', shadow: { color: '#000000', blur: 50, offsetX: 0, offsetY: 18, opacity: 0.25 } });
  a.text({ x: 60, y: 70, w: 1500, name: 'Title' }, { text: 'One picture, three slides', fontFamily: font.playfair, fontSize: 70, fontWeight: 700 });
  a.line({ x: 60, y: 1190, w: a.W - 120, name: 'Swipe cue' }, { width: 4, dash: 'dashed', startCap: 'circle', endCap: 'arrow', color: '#2b2b2b' });
  a.text({ x: 60, y: 1250, w: 600, name: 'Caption' }, { text: 'swipe', fontFamily: font.mono, fontSize: 34, fontWeight: 400, letterSpacing: 6 });
  save(t.done());
}

// 2 --------------------------------------------------------------- 2x2 grid
{
  const t = make({
    id: 'grid-2x2',
    name: '2x2 grid',
    description: 'Four square-ish photos in a tidy grid on a dark background.',
    tags: ['grid', 'dark'],
    slides: 1,
    aspect: '1:1',
    bg: solid('#121214'),
  });
  const a = t.api;
  const pad = 40;
  const gut = 20;
  const cell = (SW - 2 * pad - gut) / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      a.frame({ x: pad + c * (cell + gut), y: pad + r * (cell + gut), w: cell, h: cell, name: `Photo ${r * 2 + c + 1}` }, { cornerRadius: 22 });
    }
  }
  save(t.done());
}

// 3 -------------------------------------------------------------- polaroids
{
  const t = make({
    id: 'polaroid-row',
    name: 'Polaroid row',
    description: 'Four tilted instant-print cards scattered across three slides, overlapping the seams.',
    tags: ['collage', 'polaroid'],
    slides: 3,
    aspect: '4:5',
    bg: solid('#e9dfcf'),
  });
  const a = t.api;
  const cards = [
    { cx: 600, cy: 640, deg: -6, label: 'summer' },
    { cx: 1400, cy: 700, deg: 4, label: 'golden hour' },
    { cx: 2050, cy: 610, deg: -3, label: 'good light' },
    { cx: 2720, cy: 690, deg: 5, label: 'the end' },
  ];
  const cw = 640;
  const ch = 800;
  cards.forEach((c, i) => {
    const card = rot(c.cx, c.cy, -cw / 2, -ch / 2, c.deg);
    a.shape({ x: card.x, y: card.y, w: cw, h: ch, rot: c.deg, name: `Card ${i + 1}` }, { fill: solid('#fdfcf8'), stroke: '#d8cebd', strokeWidth: 2, cornerRadius: 6 });
    const ph = rot(c.cx, c.cy, -cw / 2 + 34, -ch / 2 + 34, c.deg);
    a.frame({ x: ph.x, y: ph.y, w: cw - 68, h: cw - 68, rot: c.deg, name: `Photo ${i + 1}` }, { cornerRadius: 2 });
    const cap = rot(c.cx, c.cy, -cw / 2 + 34, ch / 2 - 130, c.deg);
    a.text({ x: cap.x, y: cap.y, w: cw - 68, rot: c.deg, name: `Caption ${i + 1}` }, { text: c.label, fontFamily: font.caveat, fontSize: 84, fontWeight: 500, align: 'center', color: '#3a342b' });
  });
  save(t.done());
}

// 4 ----------------------------------------------------------- quote + photo
{
  const t = make({
    id: 'quote-photo',
    name: 'Quote + photo',
    description: 'A bold quote on the first slide, a full photo on the second.',
    tags: ['quote', 'text'],
    slides: 2,
    aspect: '4:5',
    bg: solid('#1d2740'),
  });
  const a = t.api;
  a.text({ x: 90, y: 90, w: 400, name: 'Quote mark' }, { text: '“', fontFamily: font.dmserif, fontSize: 420, fontWeight: 400, color: '#ffb454', lineHeight: 0.9 });
  a.text({ x: 90, y: 470, w: 900, h: 520, name: 'Quote' }, { text: 'Make the thing you wish already existed.', fontFamily: font.playfair, fontSize: 104, fontWeight: 700, color: '#fff7e8', lineHeight: 1.15 });
  a.shape({ x: 90, y: 1130, w: 120, h: 6, name: 'Rule' }, { fill: solid('#ffb454') });
  a.text({ x: 90, y: 1170, w: 800, name: 'Attribution' }, { text: 'YOUR NAME', fontFamily: font.space, fontSize: 38, fontWeight: 500, color: '#c9d2e8', letterSpacing: 8 });
  a.frame({ x: SW + 60, y: 60, w: SW - 120, h: a.H - 120, name: 'Photo' }, { cornerRadius: 36 });
  save(t.done());
}

// 5 ------------------------------------------------------------ five slides
{
  const t = make({
    id: 'story-5',
    name: 'Five-slide story',
    description: 'A dotted path with an arrow that connects five chapters, one photo each.',
    tags: ['story', 'timeline'],
    slides: 5,
    aspect: '4:5',
    bg: solid('#fff6e6'),
  });
  const a = t.api;
  a.line({ x: 60, y: 1100, w: a.W - 120, name: 'Path' }, { width: 8, dash: 'dotted', startCap: 'circle', endCap: 'arrow', color: '#e4572e' });
  const titles = ['Morning', 'On the way', 'Midday', 'Golden hour', 'Night'];
  for (let i = 0; i < 5; i++) {
    const x = i * SW;
    a.text({ x: x + 150, y: 90, w: 400, name: `Number ${i + 1}` }, { text: String(i + 1).padStart(2, '0'), fontFamily: font.bebas, fontSize: 150, fontWeight: 400, color: '#e4572e' });
    a.frame({ x: x + 150, y: i % 2 ? 330 : 250, w: 780, h: 760 - (i % 2 ? 80 : 0), name: `Photo ${i + 1}` }, { cornerRadius: 20 });
    a.text({ x: x + 150, y: 1170, w: 780, name: `Caption ${i + 1}` }, { text: titles[i], fontFamily: font.playfair, fontSize: 64, fontWeight: 700, color: '#2d2a26' });
  }
  save(t.done());
}

// 6 ----------------------------------------------------------- minimal border
{
  const t = make({
    id: 'minimal-border',
    name: 'Minimal border',
    description: 'A thin keyline on every slide around one wide photo, with page numbers.',
    tags: ['minimal', 'border'],
    slides: 3,
    aspect: '4:5',
    bg: solid('#fafaf7'),
  });
  const a = t.api;
  a.frame({ x: 120, y: 260, w: a.W - 240, h: 830, name: 'Wide photo' }, { cornerRadius: 0 });
  for (let i = 0; i < 3; i++) {
    const x = i * SW;
    a.shape({ x: x + 36, y: 36, w: SW - 72, h: a.H - 72, name: `Keyline ${i + 1}` }, { fill: solid('rgba(0,0,0,0)'), stroke: '#151515', strokeWidth: 3 });
    a.text({ x: x + 90, y: 1190, w: 600, name: `Page ${i + 1}` }, { text: `0${i + 1} / 03`, fontFamily: font.mono, fontSize: 32, fontWeight: 400, letterSpacing: 4 });
  }
  a.text({ x: 120, y: 110, w: 1200, name: 'Title' }, { text: 'Untitled, no. 7', fontFamily: font.playfair, fontSize: 64, fontWeight: 400, color: '#151515' });
  save(t.done());
}

// 7 --------------------------------------------------------- gradient gallery
{
  const t = make({
    id: 'gradient-gallery',
    name: 'Gradient gallery',
    description: 'Four leaf-shaped photos floating on a sunset gradient.',
    tags: ['gradient', 'colorful'],
    slides: 4,
    aspect: '1:1',
    bg: solid('#ff7a59'),
  });
  const a = t.api;
  a.background(grad(100, '#ff9a6a', '#ff4f8b', '#5b3bff'), 'Sunset');
  for (let i = 0; i < 4; i++) {
    const x = i * SW;
    a.frame(
      { x: x + 150, y: 150, w: 780, h: 780, name: `Photo ${i + 1}` },
      { cornerRadius: i % 2 ? [24, 280, 24, 280] : [280, 24, 280, 24], border: { width: 10, color: '#ffffff' }, shadow: { color: '#2b0a4a', blur: 60, offsetX: 0, offsetY: 24, opacity: 0.4 } },
    );
  }
  a.text({ x: 150, y: 970, w: 700, name: 'Hint' }, { text: 'swipe', fontFamily: font.space, fontSize: 34, fontWeight: 500, color: '#ffffff', letterSpacing: 8 });
  save(t.done());
}

// 8 -------------------------------------------------------------- tall story
{
  const t = make({
    id: 'tall-story',
    name: 'Tall story 9:16',
    description: 'Full-height slides with a wide framed photo and a big condensed headline.',
    tags: ['story', 'headline'],
    slides: 3,
    aspect: '9:16',
    bg: solid('#0e1116'),
  });
  const a = t.api;
  a.background(grad(180, '#10141c', '#2a1f3d'), 'Night');
  a.text({ x: 80, y: 130, w: 1700, name: 'Headline' }, { text: 'THE LONG WAY ROUND', fontFamily: font.anton, fontSize: 210, fontWeight: 400, color: '#ffffff', lineHeight: 1 });
  a.frame({ x: 70, y: 520, w: a.W - 140, h: 1000, name: 'Wide photo' }, { cornerRadius: 0, border: { width: 14, color: '#ffffff' } });
  a.line({ x: 70, y: 1640, w: a.W - 140, name: 'Arrow' }, { width: 6, color: '#ffffff', endCap: 'arrow', dash: 'solid' });
  a.text({ x: 70, y: 1710, w: 900, name: 'Subtitle' }, { text: 'swipe to follow the road', fontFamily: font.space, fontSize: 44, fontWeight: 400, color: '#cdd3e0' });
  save(t.done());
}

// ================================================================ pack 2

/** Smooth wavy stroke points across [x0, x1] around y. */
function wave(x0, x1, y, amp, period, step = 40) {
  const pts = [];
  for (let x = x0; x <= x1; x += step) pts.push(x, y + Math.sin(((x - x0) / period) * Math.PI * 2) * amp);
  return pts;
}
/** Loose hand-drawn ellipse points. */
function loop(cx, cy, rx, ry, turns = 1.08, n = 48) {
  const pts = [];
  for (let i = 0; i <= n * turns; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const wob = 1 + Math.sin(i * 0.7) * 0.03;
    pts.push(cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob);
  }
  return pts;
}
const slideArea = (i, H) => ({ x: i * SW, y: 0, w: SW, h: H });
const T3 = 1 / 3;

// 9 ----------------------------------------------------------- travel journal
{
  const t = make({ id: 'travel-journal', name: 'Travel journal', description: 'Taped photos on kraft paper with handwritten notes and a location pill.', tags: ['travel', 'collage', 'handwritten'], slides: 3, aspect: '4:5', bg: solid('#d9c3a0') });
  const a = t.api;
  const film = { preset: 'film', cornerRadius: 4, border: { width: 18, color: '#fbf8f1' }, shadow: { color: '#3b2a12', blur: 30, offsetX: 0, offsetY: 12, opacity: 0.3 } };
  const shots = [
    { x: 110, y: 300, w: 620, h: 720, rot: -4 },
    { x: 1250, y: 170, w: 700, h: 520, rot: 3 },
    { x: 1500, y: 760, w: 560, h: 420, rot: -2 },
    { x: 2320, y: 260, w: 640, h: 820, rot: 2 },
  ];
  shots.forEach((s, i) => {
    a.frame({ ...s, name: `Photo ${i + 1}` }, film);
    a.sticker({ x: s.x + s.w / 2 - 110, y: s.y - 110, w: 220, h: 196, rot: -s.rot * 3, name: `Tape ${i + 1}` }, 'tape', { tint: '#f3e3b5' });
  });
  a.text({ x: 110, y: 70, w: 1500, name: 'Title' }, { text: 'Somewhere new', fontFamily: font.caveat, fontSize: 120, fontWeight: 700, color: '#3a2c1a' });
  a.sticker({ x: 110, y: 1100, w: 64, h: 64, name: 'Pin' }, 'pin', { tint: '#b5361c' });
  a.text({ x: 200, y: 1104, w: 520, name: 'Location', h: 56 }, { text: 'Lisbon, Portugal', fontFamily: font.space, fontSize: 40, fontWeight: 600, color: '#ffffff', background: pill('#3a2c1a', { opacity: 0.9 }) });
  a.text({ x: 1130, y: 840, w: 340, name: 'Note', h: 140 }, { text: 'best coffee\nof the trip', fontFamily: font.caveat, fontSize: 64, fontWeight: 500, color: '#3a2c1a', lineHeight: 1 });
  a.sticker({ x: 1340, y: 990, w: 150, h: 150, rot: 0, name: 'Arrow' }, 'arrow-curve', { tint: '#3a2c1a' });
  a.text({ x: 2320, y: 1160, w: 640, name: 'Sign-off' }, { text: 'until next time', fontFamily: font.caveat, fontSize: 80, fontWeight: 500, color: '#3a2c1a', align: 'center' });
  save(t.done());
}

// 10 ------------------------------------------------------------------ party
{
  const t = make({ id: 'party-confetti', name: 'Party confetti', description: 'A loud gradient celebration with sparkles, stars and a big boxed headline.', tags: ['party', 'colorful', 'stickers'], slides: 2, aspect: '1:1', bg: solid('#ff5fa2') });
  const a = t.api;
  a.background(grad(135, '#ffd34d', '#ff5fa2', '#7b5cff'), 'Confetti gradient');
  a.text({ x: 110, y: 120, w: 520, name: 'Headline', h: 280 }, { text: "IT'S A\nPARTY", fontFamily: font.anton, fontSize: 130, fontWeight: 400, color: '#ffffff', lineHeight: 1.05, background: pill('#1b1340', { radius: 28, paddingX: 34, paddingY: 18 }) });
  a.frame({ x: 620, y: 300, w: 1000, h: 640, rot: 4, name: 'Big photo' }, { cornerRadius: 40, preset: 'punch', border: { width: 14, color: '#ffffff' } });
  a.frame({ x: 110, y: 540, w: 400, h: 420, rot: -6, name: 'Small photo' }, { cornerRadius: 200, border: { width: 12, color: '#ffffff' } });
  a.frame({ x: 1690, y: 120, w: 300, h: 380, rot: 6, name: 'Corner photo' }, { cornerRadius: 30, border: { width: 12, color: '#ffffff' } });
  const pop = [['sparkles', 860, 90, 180, '#ffffff'], ['star', 1500, 110, 120, '#ffe14d'], ['burst', 1880, 600, 160, '#ffe14d'], ['sparkle', 470, 450, 90, '#ffffff'], ['heart', 1560, 860, 100, '#ff3b6b'], ['star', 520, 930, 80, '#ffffff']];
  pop.forEach(([id, x, y, w, tint], i) => a.sticker({ x, y, w, h: w, rot: (i % 3) * 12 - 12, name: `Confetti ${i + 1}` }, id, { tint }));
  a.text({ x: 1240, y: 970, w: 760, name: 'Date', h: 56 }, { text: 'SAT 14 · 8PM', fontFamily: font.space, fontSize: 42, fontWeight: 700, color: '#1b1340', align: 'right', background: pill('#ffffff') });
  save(t.done());
}

// 11 ------------------------------------------------------------------ recipe
{
  const t = make({ id: 'recipe-card', name: 'Recipe card', description: 'Hero dish, an ingredients list, and three steps with photos.', tags: ['food', 'text', 'grid'], slides: 3, aspect: '4:5', bg: solid('#fff8ef') });
  const a = t.api;
  a.frame({ x: 0, y: 0, w: SW, h: 900, name: 'Hero dish' }, { cornerRadius: 0, preset: 'warm' });
  a.text({ x: 80, y: 960, w: 920, name: 'Dish name' }, { text: 'Lemon herb pasta', fontFamily: font.dmserif, fontSize: 100, fontWeight: 400, color: '#2c2a26' });
  a.text({ x: 100, y: 1130, w: 200, name: 'Time', h: 40 }, { text: '25 MIN', fontFamily: font.space, fontSize: 32, fontWeight: 700, color: '#ffffff', background: pill('#5d8a4e', { paddingX: 22, paddingY: 10 }) });
  a.text({ x: 330, y: 1130, w: 260, name: 'Serves', h: 40 }, { text: 'SERVES 2', fontFamily: font.space, fontSize: 32, fontWeight: 700, color: '#3f6534', background: pill('#dde9d4', { paddingX: 22, paddingY: 10 }) });
  a.text({ x: SW + 80, y: 90, w: 920, name: 'Ingredients title' }, { text: 'You need', fontFamily: font.dmserif, fontSize: 90, fontWeight: 400, color: '#2c2a26' });
  a.drawing({ x: SW + 80, y: 195, w: 420, h: 50, name: 'Underline' }, [{ points: wave(SW + 86, SW + 494, 220, 8, 140, 12), color: '#5d8a4e', width: 9 }]);
  a.text({ x: SW + 80, y: 290, w: 920, h: 640, name: 'Ingredients' }, { text: '200 g spaghetti\n1 lemon, zest and juice\n2 cloves garlic\nbig handful of herbs\nolive oil, salt, pepper\nparmesan to finish', fontFamily: font.inter, fontSize: 52, fontWeight: 400, color: '#2c2a26', lineHeight: 1.7 });
  a.frame({ x: SW + 80, y: 1000, w: 920, h: 270, name: 'Ingredients photo' }, { cornerRadius: 24 });
  a.layout({ x: 2 * SW, y: 0, w: SW, h: 1180 }, [[0, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]], { gutter: 20, padding: 60, cornerRadius: 24, name: 'Step photo' });
  a.text({ x: 2 * SW + 60, y: 1200, w: 960, name: 'Steps' }, { text: 'Boil · Toss · Finish with herbs', fontFamily: font.space, fontSize: 46, fontWeight: 600, color: '#2c2a26', align: 'center' });
  [['1', 100, 100], ['2', 100, 640], ['3', 590, 640]].forEach(([n, x, y]) => a.text({ x: 2 * SW + x, y, w: 60, name: `Step ${n}`, h: 52 }, { text: n, fontFamily: font.space, fontSize: 44, fontWeight: 700, color: '#ffffff', align: 'center', background: pill('#5d8a4e', { paddingX: 20, paddingY: 10 }) }));
  save(t.done());
}

// 12 ------------------------------------------------------------ before/after
{
  const t = make({ id: 'before-after', name: 'Before / after', description: 'Two slides side by side with labels and an arrow across the seam.', tags: ['comparison', 'minimal'], slides: 2, aspect: '4:5', bg: solid('#f2f2f0') });
  const a = t.api;
  a.frame({ x: 60, y: 60, w: SW - 90, h: 1230, name: 'Before' }, { cornerRadius: 28, preset: 'fade' });
  a.frame({ x: SW + 30, y: 60, w: SW - 90, h: 1230, name: 'After' }, { cornerRadius: 28 });
  a.text({ x: 120, y: 1180, w: 400, name: 'Before label', h: 48 }, { text: 'BEFORE', fontFamily: font.space, fontSize: 40, fontWeight: 700, color: '#111111', background: pill('#ffffff', { opacity: 0.92 }) });
  a.text({ x: 2 * SW - 520, y: 1180, w: 400, name: 'After label', h: 48 }, { text: 'AFTER', fontFamily: font.space, fontSize: 40, fontWeight: 700, color: '#ffffff', align: 'right', background: pill('#111111', { opacity: 0.92 }) });
  a.shape({ x: SW - 80, y: 595, w: 160, h: 160, name: 'Arrow badge' }, { kind: 'ellipse', fill: solid('#ffffff') });
  a.sticker({ x: SW - 50, y: 625, w: 100, h: 100, name: 'Arrow' }, 'arrow-right', { tint: '#111111' });
  save(t.done());
}

// 13 ------------------------------------------------------------- mood board
{
  const t = make({ id: 'mood-board', name: 'Mood board', description: 'Three square slides of tight mosaics: pinwheel, brick and offset columns.', tags: ['grid', 'mosaic', 'minimal'], slides: 3, aspect: '1:1', bg: solid('#ffffff') });
  const a = t.api;
  const opts = { gutter: 12, padding: 12, cornerRadius: 6 };
  a.layout(slideArea(0, 1080), [[0, 0, 2 * T3, T3], [2 * T3, 0, 1, 2 * T3], [T3, 2 * T3, 1, 1], [0, T3, T3, 1], [T3, T3, 2 * T3, 2 * T3]], { ...opts, name: 'Pinwheel' });
  a.layout(slideArea(1, 1080), [[0, 0, 0.5, T3], [0.5, 0, 1, T3], [0, T3, 1, 2 * T3], [0, 2 * T3, 0.5, 1], [0.5, 2 * T3, 1, 1]], { ...opts, name: 'Brick' });
  a.layout(slideArea(2, 1080), [[0, 0, T3, 0.6], [0, 0.6, T3, 1], [T3, 0, 2 * T3, 0.4], [T3, 0.4, 2 * T3, 1], [2 * T3, 0, 1, 0.6], [2 * T3, 0.6, 1, 1]], { ...opts, name: 'Columns' });
  a.text({ x: SW + 340, y: 500, w: 400, name: 'Word', h: 80 }, { text: 'mood', fontFamily: font.playfair, fontSize: 64, fontWeight: 700, color: '#111111', align: 'center', background: pill('#ffffff', { paddingX: 40, paddingY: 14 }) });
  save(t.done());
}

// 14 ---------------------------------------------------------- product launch
{
  const t = make({ id: 'product-launch', name: 'Product launch', description: 'A dark, high-contrast reveal with a "new" badge and a feature split.', tags: ['dark', 'headline', 'business'], slides: 3, aspect: '4:5', bg: solid('#0b0b0f') });
  const a = t.api;
  a.text({ x: 100, y: 130, w: 600, name: 'Kicker', h: 40 }, { text: 'INTRODUCING', fontFamily: font.space, fontSize: 36, fontWeight: 700, color: '#0b0b0f', letterSpacing: 6, background: pill('#c6ff3d', { radius: 10, paddingX: 18, paddingY: 10 }) });
  a.text({ x: 80, y: 220, w: 1800, name: 'Product name', h: 260 }, { text: 'THE NEW ONE', fontFamily: font.anton, fontSize: 240, fontWeight: 400, color: '#ffffff', lineHeight: 1 });
  a.frame({ x: 80, y: 540, w: 2 * SW - 160, h: 700, name: 'Hero shot' }, { cornerRadius: 32, preset: 'punch' });
  a.sticker({ x: 2 * SW - 330, y: 420, w: 230, h: 230, rot: 12, name: 'Badge' }, 'badge', { tint: '#c6ff3d' });
  a.text({ x: 2 * SW - 300, y: 500, w: 170, rot: 12, name: 'Badge text', h: 62 }, { text: 'NEW', fontFamily: font.anton, fontSize: 56, fontWeight: 400, color: '#0b0b0f', align: 'center' });
  a.layout({ x: 2 * SW, y: 0, w: SW, h: 1220 }, [[0, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]], { gutter: 20, padding: 80, cornerRadius: 24, name: 'Feature' });
  a.text({ x: 2 * SW + 80, y: 1220, w: 920, name: 'Call to action', h: 60 }, { text: 'Available now →', fontFamily: font.space, fontSize: 48, fontWeight: 600, color: '#c6ff3d', align: 'right' });
  save(t.done());
}

// 15 ------------------------------------------------------------- film strip
{
  const t = make({ id: 'film-strip', name: 'Film strip', description: 'A continuous strip of film frames with sprocket holes running across four slides.', tags: ['panorama', 'film', 'dark'], slides: 4, aspect: '4:5', bg: solid('#1a1a1a') });
  const a = t.api;
  a.shape({ x: 0, y: 260, w: a.W, h: 830, name: 'Strip', locked: true }, { fill: solid('#050505') });
  // sprocket holes as two dashed lines: one layer each instead of ~100 shapes
  a.line({ x: 0, y: 285, w: a.W, h: 40, name: 'Sprockets top', locked: true }, { color: '#2e2e2e', width: 30, dash: 'dashed' });
  a.line({ x: 0, y: 1025, w: a.W, h: 40, name: 'Sprockets bottom', locked: true }, { color: '#2e2e2e', width: 30, dash: 'dashed' });
  const n = 6;
  const fw = Math.round((a.W - 40 * (n + 1)) / n);
  for (let i = 0; i < n; i++) a.frame({ x: 40 + i * (fw + 40), y: 350, w: fw, h: 650, name: `Frame ${i + 1}` }, { cornerRadius: 4, preset: 'film' });
  a.text({ x: 80, y: 130, w: 1000, name: 'Roll label', h: 70 }, { text: 'ROLL 01', fontFamily: font.mono, fontSize: 56, fontWeight: 700, color: '#f2b134', letterSpacing: 8 });
  a.text({ x: a.W - 1080, y: 1160, w: 1000, name: 'Stock', h: 50 }, { text: '400 · 36 EXP', fontFamily: font.mono, fontSize: 40, fontWeight: 400, color: '#f2b134', align: 'right', letterSpacing: 6 });
  save(t.done());
}

// 16 ------------------------------------------------------------ photo dump
{
  const t = make({ id: 'weekend-dump', name: 'Weekend dump', description: 'Lots of photos across two slides with a hand-drawn scribble title.', tags: ['grid', 'casual', 'handwritten'], slides: 2, aspect: '4:5', bg: solid('#fefefe') });
  const a = t.api;
  const G = 0.618;
  a.layout({ x: 0, y: 220, w: SW, h: 1130 }, [[0, 0, G, 1], [G, 0, 1, 0.5], [G, 0.5, 1, 1]], { gutter: 16, padding: 40, cornerRadius: 14, name: 'Left' });
  a.layout(slideArea(1, 1350), [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, T3, 1], [T3, 0.5, 2 * T3, 1], [2 * T3, 0.5, 1, 1]], { gutter: 16, padding: 40, cornerRadius: 14, name: 'Right' });
  a.text({ x: 50, y: 60, w: 1000, name: 'Title', h: 120 }, { text: 'weekend dump', fontFamily: font.caveat, fontSize: 108, fontWeight: 700, color: '#111111' });
  a.drawing({ x: 50, y: 165, w: 640, h: 50, name: 'Scribble' }, [{ points: wave(56, 680, 190, 10, 90, 10), color: '#ff5a36', width: 10 }]);
  a.sticker({ x: 860, y: 60, w: 130, h: 130, rot: 14, name: 'Sun' }, 'sun', { tint: '#ffb703' });
  save(t.done());
}

// 17 ----------------------------------------------------------- noir portrait
{
  const t = make({ id: 'noir-portrait', name: 'Noir portrait', description: 'Black-and-white portraits with a serif title and generous margins.', tags: ['portrait', 'mono', 'minimal'], slides: 3, aspect: '4:5', bg: solid('#0d0d0d') });
  const a = t.api;
  const noir = { preset: 'noir', cornerRadius: 0 };
  a.frame({ x: 120, y: 120, w: 840, h: 950, name: 'Portrait 1' }, noir);
  a.text({ x: 120, y: 1120, w: 840, name: 'Title', h: 80 }, { text: 'A study in shadow', fontFamily: font.playfair, fontSize: 68, fontWeight: 400, color: '#f2f2f2', align: 'center' });
  a.layout({ x: SW, y: 0, w: SW, h: 1230 }, [[0, 0, 0.5, 1], [0.5, 0, 1, 1]], { gutter: 24, padding: 120, ...noir, name: 'Pair' });
  a.frame({ x: 2 * SW + 120, y: 120, w: 840, h: 990, name: 'Portrait 4' }, noir);
  ['I', 'II', 'III'].forEach((n, i) => a.text({ x: i * SW + 120, y: 1250, w: 840, name: `Folio ${i + 1}`, h: 44 }, { text: n, fontFamily: font.playfair, fontSize: 36, fontWeight: 400, color: '#8a8a8a', align: 'center' }));
  save(t.done());
}

// 18 -------------------------------------------------------------- annotated
{
  const t = make({ id: 'annotated', name: 'Annotated', description: 'Photos with marker circles, arrows and handwritten callouts.', tags: ['handwritten', 'drawing', 'fun'], slides: 2, aspect: '4:5', bg: solid('#fffdf5') });
  const a = t.api;
  a.frame({ x: 90, y: 200, w: 900, h: 900, rot: -2, name: 'Photo 1' }, { cornerRadius: 12 });
  a.frame({ x: SW + 90, y: 250, w: 900, h: 700, rot: 2, name: 'Photo 2' }, { cornerRadius: 12 });
  a.text({ x: 90, y: 60, w: 900, name: 'Title', h: 120 }, { text: 'look closer', fontFamily: font.caveat, fontSize: 110, fontWeight: 700, color: '#1d3557' });
  a.drawing({ x: 0, y: 0, w: 2 * SW, h: 1350, name: 'Marker' }, [
    { points: loop(700, 520, 170, 130), color: '#e63946', width: 10 },
    { points: [600, 1190, 640, 1120, 660, 1000, 680, 690], color: '#e63946', width: 10 },
    { points: [650, 730, 680, 690, 715, 728], color: '#e63946', width: 10 },
    { points: loop(SW + 380, 640, 210, 120, 1.1), color: '#1d3557', width: 8 },
  ]);
  a.text({ x: 160, y: 1180, w: 420, name: 'Callout 1', h: 90 }, { text: 'this bit!', fontFamily: font.caveat, fontSize: 84, fontWeight: 700, color: '#e63946', align: 'right' });
  a.text({ x: SW + 150, y: 1010, w: 860, name: 'Callout 2', h: 160 }, { text: 'and the way the light hits here', fontFamily: font.caveat, fontSize: 72, fontWeight: 500, color: '#1d3557' });
  a.sticker({ x: 2 * SW - 230, y: 70, w: 140, h: 140, rot: -8, name: 'Exclaim' }, 'exclaim', { tint: '#e63946' });
  save(t.done());
}

// 19 ------------------------------------------------------------------ event
{
  const t = make({ id: 'event-poster', name: 'Event poster', description: 'A single bold slide: photo, big date, place and a burst callout.', tags: ['event', 'poster', 'headline'], slides: 1, aspect: '4:5', bg: solid('#ff4d2e') });
  const a = t.api;
  a.frame({ x: 70, y: 70, w: 940, h: 760, name: 'Photo' }, { cornerRadius: 0, preset: 'punch' });
  a.text({ x: 70, y: 850, w: 700, name: 'Date', h: 220 }, { text: '21.06', fontFamily: font.anton, fontSize: 230, fontWeight: 400, color: '#fff3e6', lineHeight: 0.95 });
  a.text({ x: 70, y: 1100, w: 940, name: 'Event', h: 70 }, { text: 'LIVE IN THE PARK', fontFamily: font.space, fontSize: 56, fontWeight: 700, color: '#1a0f0a', letterSpacing: 2 });
  a.text({ x: 90, y: 1210, w: 700, name: 'Place', h: 46 }, { text: 'Doors 6pm · free entry', fontFamily: font.space, fontSize: 38, fontWeight: 500, color: '#1a0f0a', background: pill('#fff3e6', { paddingX: 20, paddingY: 8 }) });
  a.sticker({ x: 760, y: 720, w: 260, h: 260, rot: 10, name: 'Burst' }, 'burst', { tint: '#ffe14d' });
  a.text({ x: 790, y: 812, w: 200, rot: 10, name: 'Burst text', h: 72 }, { text: 'FREE', fontFamily: font.anton, fontSize: 64, fontWeight: 400, color: '#1a0f0a', align: 'center' });
  save(t.done());
}

// 20 ----------------------------------------------------------- pastel hearts
{
  const t = make({ id: 'pastel-hearts', name: 'Pastel hearts', description: 'Soft pastel slides with rounded 2x2 grids and little hearts.', tags: ['grid', 'pastel', 'cute'], slides: 2, aspect: '4:5', bg: solid('#fde2e4') });
  const a = t.api;
  ['#fde2e4', '#e2ece9'].forEach((c, i) => a.shape({ x: i * SW, y: 0, w: SW, h: 1350, name: `Tint ${i + 1}`, locked: true }, { fill: solid(c) }));
  for (let i = 0; i < 2; i++) a.layout({ x: i * SW, y: 180, w: SW, h: 1170 }, [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]], { gutter: 24, padding: 60, cornerRadius: 48, preset: 'dream', name: `Slide ${i + 1} photo` });
  a.text({ x: 60, y: 60, w: 2 * SW - 120, name: 'Title', h: 110 }, { text: 'little things i love', fontFamily: font.caveat, fontSize: 96, fontWeight: 700, color: '#9d4e63', align: 'center' });
  [[495, 715, -12], [SW + 495, 715, 10], [960, 200, 14], [SW + 30, 200, -10]].forEach(([x, y, r], i) => a.sticker({ x, y, w: 90, h: 90, rot: r, name: `Heart ${i + 1}` }, i % 2 ? 'heart-outline' : 'heart', { tint: '#ff6f91' }));
  save(t.done());
}

// 21 --------------------------------------------------------- hero over seams
{
  const t = make({ id: 'hero-seams', name: 'Hero across seams', description: 'One hero photo spanning three slides above a row of four, so the swipe reveals it.', tags: ['panorama', 'grid'], slides: 3, aspect: '4:5', bg: solid('#f7f4ee') });
  const a = t.api;
  a.layout({ x: 0, y: 0, w: a.W, h: 1350 }, [[0.08, 0.14, 0.92, 0.7], [0, 0.7, 0.25, 1], [0.25, 0.7, 0.5, 1], [0.5, 0.7, 0.75, 1], [0.75, 0.7, 1, 1]], { gutter: 24, padding: 60, cornerRadius: 22, name: 'Photo' });
  a.text({ x: 300, y: 70, w: 2000, name: 'Title', h: 100 }, { text: 'Everything in one swipe', fontFamily: font.dmserif, fontSize: 84, fontWeight: 400, color: '#1f1d1a' });
  a.sticker({ x: 2 * SW + 800, y: 40, w: 160, h: 160, name: 'Arrow' }, 'arrow-loop', { tint: '#1f1d1a' });
  save(t.done());
}

// 22 --------------------------------------------------------------- listicle
{
  const t = make({ id: 'tips-list', name: 'Tips list', description: 'A cover plus three numbered tips, each with a photo and a short line.', tags: ['text', 'business', 'list'], slides: 4, aspect: '4:5', bg: solid('#eef1ff') });
  const a = t.api;
  a.text({ x: 90, y: 340, w: 900, name: 'Cover title', h: 520 }, { text: '3 small habits that changed my mornings', fontFamily: font.space, fontSize: 104, fontWeight: 700, color: '#1e1b4b', lineHeight: 1.1 });
  a.text({ x: 120, y: 1000, w: 400, name: 'Swipe', h: 48 }, { text: 'swipe →', fontFamily: font.space, fontSize: 40, fontWeight: 600, color: '#ffffff', background: pill('#4f46e5') });
  a.sticker({ x: 800, y: 120, w: 180, h: 180, rot: 8, name: 'Sparkle' }, 'sparkles', { tint: '#4f46e5' });
  ['Water before coffee', 'Ten minutes outside', 'Write one line'].forEach((tip, i) => {
    const x = (i + 1) * SW;
    a.text({ x: x + 116, y: 110, w: 80, name: `Number ${i + 1}`, h: 80 }, { text: String(i + 1), fontFamily: font.space, fontSize: 72, fontWeight: 700, color: '#ffffff', align: 'center', background: pill('#4f46e5', { paddingX: 26, paddingY: 12 }) });
    a.frame({ x: x + 90, y: 260, w: 900, h: 820, name: `Tip photo ${i + 1}` }, { cornerRadius: 36 });
    a.text({ x: x + 90, y: 1130, w: 900, name: `Tip ${i + 1}`, h: 120 }, { text: tip, fontFamily: font.space, fontSize: 72, fontWeight: 700, color: '#1e1b4b' });
  });
  save(t.done());
}

console.log('wrote built-in templates to', OUT);

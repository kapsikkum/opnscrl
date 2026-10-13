// Generates src/templates/builtin/*.json (the built-in starter templates).
// All designs here are original. Run: node scripts/gen-builtin-templates.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates', 'builtin');
mkdirSync(OUT, { recursive: true });

const SCHEMA_VERSION = 2;
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
          ...p,
        }),
      );
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

console.log('wrote built-in templates to', OUT);

import type { JSX } from 'preact';

/** Simple stroke icons, original geometric drawings on a 24x24 grid. */
const PATHS: Record<string, JSX.Element> = {
  back: <path d="M15 5l-7 7 7 7" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" />,
  redo: <path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeoff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.8 9.8 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.7M6.5 7.6A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004.3-1" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 017.5-2" />
    </>
  ),
  up: <path d="M6 14l6-6 6 6" />,
  sticker: (
    <>
      <path d="M14 3H7a4 4 0 00-4 4v10a4 4 0 004 4h6l8-8V7a4 4 0 00-4-4h-3z" />
      <path d="M13 21v-4a4 4 0 014-4h4" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" />
      <path d="M14 7l3 3" />
    </>
  ),
  eraser: (
    <>
      <path d="M8 20h12M5 15l9-9a2 2 0 012.8 0l3.2 3.2a2 2 0 010 2.8L13 19H9l-4-4z" />
      <path d="M9.5 10.5l5 5" />
    </>
  ),
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </g>
  ),
  down: <path d="M6 10l6 6 6-6" />,
  left: <path d="M14 6l-6 6 6 6" />,
  right: <path d="M10 6l6 6-6 6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-9 8" />
    </>
  ),
  type: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  shape: (
    <>
      <rect x="3" y="11" width="10" height="10" rx="1.5" />
      <circle cx="16" cy="8" r="5" />
    </>
  ),
  line: (
    <>
      <path d="M4 19L20 5" />
      <path d="M14 5h6v6" />
    </>
  ),
  frame: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="3 2.5" />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  paint: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 15l5-4 4 3 4-5 5 4" />
    </>
  ),
  play: <path d="M7 4l13 8-13 8z" />,
  export: <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5" />,
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  slide: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" />
    </>
  ),
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9l5-5 5 5M5 20h14" />,
  link: (
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </>
  ),
  magnet: <path d="M6 4v8a6 6 0 0012 0V4M6 8h4M14 8h4" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  sliders: <path d="M5 4v16M12 4v16M19 4v16M3 9h4M10 15h4M17 8h4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  home: <path d="M4 11l8-7 8 7v9H4z" />,
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.frame}
    </svg>
  );
}

/** The opnscrl mark: three adjacent slides sharing one continuous gradient. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="opn-logo" gradientUnits="userSpaceOnUse" x1="8" y1="0" x2="56" y2="0">
          <stop offset="0" stop-color="#ff9a6a" />
          <stop offset="0.5" stop-color="#ff4f8b" />
          <stop offset="1" stop-color="#5b3bff" />
        </linearGradient>
      </defs>
      <rect x="8" y="12" width="14" height="40" rx="4" fill="url(#opn-logo)" />
      <rect x="25" y="12" width="14" height="40" rx="4" fill="url(#opn-logo)" />
      <rect x="42" y="12" width="14" height="40" rx="4" fill="url(#opn-logo)" />
    </svg>
  );
}

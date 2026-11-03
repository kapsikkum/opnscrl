import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import './ui/ui.css';
import { isNativeApp } from './export/native';
import { App } from './ui/App';

const native = isNativeApp();
if (native) {
  document.documentElement.classList.add('native-app');
  // The app has its own zoom; stop the web view zooming on double tap or pinch.
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}

// Android: MainActivity exposes the system-bar/cutout insets (CSS px) so the app can draw edge to edge.
// It also pushes them itself; this pull covers reloads.
const insets = (window as unknown as { OpnInsets?: { get(): string } }).OpnInsets;
if (insets) {
  try {
    const [t, r, b, l] = JSON.parse(insets.get()) as number[];
    const st = document.documentElement.style;
    st.setProperty('--sat', `${t}px`);
    st.setProperty('--sar', `${r}px`);
    st.setProperty('--sab', `${b}px`);
    st.setProperty('--sal', `${l}px`);
  } catch {
    /* fall back to env() */
  }
}

render(<App />, document.getElementById('app')!);

// Offline app shell. autoUpdate: a new version installs in the background and applies on the next load.
// Not inside the Tauri app: its assets are bundled, and a service worker would only add a stale cache.
if (!native) registerSW({ immediate: true });

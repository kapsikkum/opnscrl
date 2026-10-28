import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import './ui/ui.css';
import { isNativeApp } from './export/native';
import { App } from './ui/App';

const native = isNativeApp();
if (native) document.documentElement.classList.add('native-app');

render(<App />, document.getElementById('app')!);

// Offline app shell. autoUpdate: a new version installs in the background and applies on the next load.
// Not inside the Tauri app: its assets are bundled, and a service worker would only add a stale cache.
if (!native) registerSW({ immediate: true });

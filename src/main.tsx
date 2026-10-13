import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import './ui/ui.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);

// Offline app shell. autoUpdate: a new version installs in the background and applies on the next load.
registerSW({ immediate: true });

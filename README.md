# opnscrl

Make seamless multi-slide Instagram carousels. Free, open source, no account, works offline. It runs in the browser and can be installed as a PWA.

## Features

- Design across any number of slides on one continuous canvas; export sliced, pixel-exact images (PNG/JPEG, ZIP or individual files)
- Text, shapes, lines, photos and photo frames, with snapping guides, grids, layers and undo/redo
- Built-in templates; photos fill selected empty frames, otherwise they are added as free layers
- Everything stays on your device (projects stored locally in the browser)
- Offline-capable and installable

## Template sharing

Export a template as a file and import it elsewhere, or share a link: the template is encoded in the URL fragment (`#t=...`), so nothing is uploaded to a server.

## Development

```bash
npm install
npm run dev       # dev server
npm test          # unit tests
npm run build     # typecheck + production build into dist/
npm run preview   # serve the production build
```

## Deployment

The build is fully static (`base: './'`), so `dist/` can be hosted on any static host or sub-path (GitHub Pages, Netlify, S3, ...).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT, see [LICENSE](LICENSE).

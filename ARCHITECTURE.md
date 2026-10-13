# opnscrl architecture

opnscrl makes seamless multi-slide Instagram carousels: one wide panorama canvas that is cut into N slides.
Stack: Vite + TypeScript (strict), Preact + `@preact/signals`, Konva, zod, idb, lz-string, vite-plugin-pwa, vitest. Free and open source: no accounts, no analytics, no network calls except optional Google Fonts.

## Layering

Lower modules never import higher ones.

```
core  <  layers  <  render  <  export / state / templates / storage  <  app  <  ui
```

| Module | Depends on | Responsibility |
| --- | --- | --- |
| `src/core/` | zod only; no DOM, no Konva | Document model (zod schemas + inferred types), geometry / slice math, commands + `History` (undo/redo), schema version + migrations, serialization, id generation |
| `src/layers/` | core, Konva | One folder per layer type. Each exports a `LayerDefinition`; `registry.ts` registers them and offers `createLayer`, `renderLayer`, `updateLayerNode` |
| `src/render/` | core, layers | Konva adapter. `createRenderer` (live editor scene), `Reconciler` (model -> nodes by layer id), guides overlay, `exportSlides` (offscreen export) |
| `src/export/` | nothing app-specific | Blob helpers: `zipSlices` (jszip), `downloadBlob`/`downloadSlices`/`downloadZip`, `shareSlices` (Web Share API with `canShare({files})`) |
| `src/state/` | core, signals | `createEditor(project)`: `project`, `selection`, `canUndo`, `canRedo` signals + `dispatch/undo/redo/select` |
| `src/templates/` | core, lz-string | Template format (zod), `projectToTemplate` / `templateToProject`, file + share-link codecs, `TemplateSource` (built-in + local). No DOM, no storage |
| `src/storage/` | core, templates (types), idb | IndexedDB stores, asset blobs + decode cache (`resolveAsset`), debounced autosave, photo import (decode / downscale), asset GC |
| `src/app/` | everything below | Glue between services and UI: open session (editor + autosave + thumbnails), user actions that build core ops, fonts, template workflows, toasts |
| `src/ui/` | app, render | Preact components, plain CSS (`ui.css`, custom properties, light/dark) |
| `src/main.tsx` | ui | Mounts `<App/>`, registers the service worker |

The UI never mutates the model: every edit is an `Op` sent through `Editor.dispatch` (History, undo/redo, coalescing).

## Phase-2 modules

### Model additions (schema v2)

* `canvas.aspect` adds `16:9`, `2:3`, `4:3`, `1.91:1`, `custom`; `canvas.customHeightPx` (565..1920) is the slide height for `custom` (width stays 1080). `slideHeightPx` / `canvasSize` take it into account.
* `line` layer: `props { start, end, color, width, dash: solid|dashed|dotted, startCap, endCap: none|arrow|circle|diamond }`. `start`/`end` are **normalized to the layer box** (0..1), so the Transformer scales and rotates lines like any layer.
* `cornerRadius` is `number | [tl, tr, br, bl]` for image, frame and rect shapes (`resolveCornerRadii` clamps like CSS).
* image/frame `border { width, color } | null` (drawn inside the box) and `shadow { color, blur, offsetX, offsetY, opacity } | null` (drawn as a sibling of the clipped content, so rounded clips never cut it).
* `core/grid.ts`: `gridCells`, `gridLayers`, `gridOps`, `applyGrid(project, { rows, cols, gutter, padding, area })`; `area` is `'canvas'`, `{ slide }` or a rect. Dispatch `{ op: 'batch', ops: gridOps(...) }` for one undo step.
* `core/slides.ts`: `insertSlideOps`, `removeSlideOps`, `moveSlideOps` return ops that shift layers by whole slide widths (a layer belongs to the slide holding its bounding-box center; backgrounds are resized by `setCanvas(fitBackgrounds)`).
* New op `rename`. Migration `migrations[1]` (v1 -> v2) adds `customHeightPx: 1350` and `border/shadow: null` to image/frame props.

### Model additions (schema v3)

- **Photo adjustments** on image/frame layers: `adjust` (13 sliders, all neutral at 0)
  and `preset` (a named look from `core/adjust.ts` `PRESETS`, folded under the
  sliders by `effectiveAdjust`). The per-pixel math (`applyAdjust`) is pure and
  tested; `layers/shared/adjustImage.ts` runs it on a downscaled copy (1600 px)
  while editing, debounced, and at full resolution for export, caching results
  per photo + look. The image slot draws the adjusted canvas in place of the photo.
- **`sticker` layer**: a built-in vector sticker (`layers/sticker/builtin.ts`,
  original SVGs drawn in `currentColor`, recolored by `tint`) or an uploaded
  PNG/SVG asset, fitted (contain) in its box. Uploaded stickers live in the
  IndexedDB `stickers` store ("My stickers", DB version 2) and are never
  garbage-collected; templates always embed them (they are design, not photos).
  Emoji are plain text layers.
- **`drawing` layer**: freehand strokes with points normalized to the layer box
  (`core/drawing.ts` converts, simplifies and hit-tests). The renderer's draw
  tool (`setDrawTool`) pauses selection/dragging and emits `stroke` / `erase`
  paths in canvas px; `app/drawing.ts` turns each into one undoable op. Only
  the strokes are clickable, so a canvas-wide drawing never blocks layers below.

### Snapping (`render/snap.ts`)

Dragging and resizing both snap (resize snaps only the edges the active anchor moves; corners keep the aspect ratio). While resizing, the renderer bakes the transformer's scale into width/height every frame and re-renders through the layer definition, so content never stretches.


Pure math: `collectSnapTargets(canvas, otherRects)` (slide edges + centers, canvas edges, other layers' edges + centers) and `snapRect(rect, targets, threshold)` -> `{ dx, dy, guides }`. The renderer calls it while dragging (threshold = 8 screen px / zoom), draws pink guide lines in its UI layer, and skips it while Alt is held or after `setSnapping(false)`. Other renderer additions: `zoomToRect`, `zoomToSlide`, `refreshText` (re-measure after web fonts load), an `activate` event (double click), one-pointer pan on empty space. `exportSlides` accepts `only: number[]` (used for thumbnails).

### Templates (`templates/`)

```ts
interface Template {
  schemaVersion: number;        // = core SCHEMA_VERSION (core migrations are applied on decode)
  id: string; name: string; description?: string; tags: string[];
  canvas: CanvasSettings; layers: Layer[];
  assets?: Record<assetId, { mime, w, h, dataUrl }>;  // only with "include photos"
  createdAt: number;
}
```

* `projectToTemplate(project, { includeAssets, assetDataUrls })`: image layers become empty `frame` layers (named "Photo n", so file names never leak), frame assets are cleared, `assets` is omitted. With `includeAssets` photos stay and are embedded as base64 raster data URLs (SVG data URLs are rejected on decode).
* `templateToProject(template, { name, onAsset })`: fresh project, layer and asset ids; `onAsset(newId, asset)` lets the caller store embedded photos.
* **File**: `encodeTemplateFile` / `decodeTemplateFile`, extension `.opnscrl.json`, pretty JSON. Decoding = JSON parse -> core migrations -> zod validation (`TemplateParseError` for anything malformed: future versions, duplicate ids, dangling asset references, non-image data URLs, project files).
* **Share link**: `encodeShareLink(template, base?)` = `<base>#t=<lz-string compressToEncodedURIComponent(compact JSON)>`; returns `{ url, length, tooLong }` (`tooLong` above `SHARE_LINK_WARN_LENGTH` = 8000 chars; the UI then suggests the file). `decodeShareLink(urlOrHash)` returns `null` when there is no `t=` and throws `TemplateParseError` when the payload is damaged. Nothing is uploaded: the template lives in the URL fragment. On startup the app reads `#t=`, clears the hash and offers to create a project.
* **Sources**: `TemplateSource { id, name, writable?, list(): Promise<TemplateListing[]>, get(id): Promise<Template | null> }`. `builtinSource` serves 8 original starters (JSON in `templates/builtin/`, generated by `scripts/gen-builtin-templates.mjs`); `createLocalSource(store)` serves the user's templates (the IndexedDB `templateStore` is injected from `storage/`). **A future online gallery is just another `TemplateSource`**: `list()` fetches an index of `TemplateListing`s (optionally with `thumbnailUrl`), `get(id)` downloads one `.opnscrl.json` and passes it through `validateTemplate`; register it in `templateSources` in `app/templatesApp.ts`.

### Storage (`storage/`)

IndexedDB `opnscrl` v1: `projects`, `templates`, `assets` (Blob by assetId) and `thumbnails` (`{ blob, updatedAt }`, a scaled slide-1 export). `saveProject` validates, `loadProject` runs migrations. `deleteProject` removes the thumbnail and garbage-collects assets no remaining project references (`gcAssets` also sweeps the whole store at startup). `createAssetResolver()` is the renderer's `resolveAsset` (decodes to `ImageBitmap`, caches promises). `prepareImage` decodes (EXIF applied by the browser) and downsizes originals above 4096 px. `createAutosave` debounces (800 ms), serializes writes and flushes on `visibilitychange` / `pagehide`.

### UI and PWA

Screens: Home (projects, templates, import) and Editor (canvas, panel tabs Edit / Layers / Slides / Canvas, bottom toolbar; a collapsible bottom sheet on phones, a side panel from 900 px), plus Preview, Export, Share-template and Grid dialogs. The inspector is generated from `LayerDefinition.inspector` specs (`number | slider | color | text | textarea | select | toggle | fill | font | radius | group`, `showWhen`). Fonts: a curated Google Fonts list in `app/fonts.ts`, loaded on demand (only listed families are ever requested); `fontsVersion` triggers `renderer.refreshText()`. `?debug` in the URL exposes `window.__opnscrl = { session, editor, renderer }` for manual testing. PWA: `vite-plugin-pwa` (autoUpdate, precached app shell, Google Fonts `StaleWhileRevalidate` runtime caching); icons come from `scripts/gen-icons.mjs`.

## Document model (`core`)

`Project { id, name, schemaVersion, canvas, layers, assets, createdAt, updatedAt }`

* `canvas`: `{ slideCount (1-20), aspect (4:5, 1:1, 9:16, 3:4, 16:9, 2:3, 4:3, 1.91:1, custom), customHeightPx, slideWidthPx (default 1080), background: Fill }`.
* Coordinates are **export pixels of the full panorama**. Panorama width = `slideCount * slideWidthPx`; height comes from the aspect (4:5 at 1080 wide = 1350). Slide `i` covers `x in [i*slideWidthPx, (i+1)*slideWidthPx)`.
* `layers` is the z-order, back to front (array order).
* A layer is `{ id, type, x, y, width, height, rotation, opacity, locked, hidden, name, props }`. `x,y` is the top-left of the unrotated box and rotation (degrees, clockwise) is about that corner, matching Konva.
* `assets` holds metadata only (`{ mime, w, h }`); blobs live elsewhere and layers reference them by `assetId`.
* Zod schemas in `core/schema.ts` are the single source of truth; types in `core/types.ts` are inferred (`Layer`, `LayerOf<'text'>`, `PropsOf<'shape'>`, `LayerPatch`, ...). Layer *props* schemas live in core, not in `layers/`, so a whole document can be validated without importing upward.

### Commands, history

Commands are pure: `(project, args) -> { project, inverse }` (`addLayer`, `removeLayer`, `updateLayer`, `reorder`, `duplicate`, `setCanvas`, `addAsset`, `removeAsset`, `batch`). Each is also a plain data `Op` (`{ op: 'updateLayer', id, patch }`), which is what `History` stores, replays on redo and merges.

`History.do(op, { coalesceKey })` merges consecutive ops with the same key inside `coalesceMs` (default 1000 ms) into one undo step; consecutive `updateLayer`s of one layer fold into a single patch. `updateLayer` patches are shallow-merged into `props`. Updates are immutable with structural sharing, so unchanged layers keep their object identity - the renderer relies on that for cheap change detection.

`setCanvas` keeps layers where they are; pass `fitBackgrounds: true` to also resize background layers that exactly covered the old canvas.

### Schema versions

`SCHEMA_VERSION = 2`. `migrations[n]` upgrades a raw JSON document from version `n` to `n + 1`. `parseProject` = JSON parse -> `migrateDocument` -> zod validation (throws `ProjectParseError`). To change the schema: bump `SCHEMA_VERSION`, add `migrations[oldVersion]`, add a test (see `tests/migrations.test.ts`).

## Render (`render`)

```ts
const r = createRenderer(div, { resolveAsset });   // resolveAsset: (assetId) => Promise<HTMLImageElement | ImageBitmap>
r.setProject(project);          // reconciles by layer id; unchanged layers are skipped
r.setSelection(ids);
r.on('select', ids => ...);
r.on('transform-end', ({ kind, changes }) => ...);  // changes: { id, patch: LayerPatch }[]
r.zoomToFit();  r.setGuides({ seams, safeArea });  r.destroy();
```

* The renderer **never mutates the model**. `transform-end` carries patches for `updateLayer`; if the host does not call `setProject` afterwards the nodes snap back to the model on the next microtask.
* Scene: an art layer (panorama background + shadow), a content layer (clipped to the panorama, holds one Konva `Group` per layer, `id` = layer id), and a UI layer (slide-seam guides, optional safe area, Transformer). The stage transform is the viewport; content is always in model pixels.
* Guides live only in the UI layer, and `exportSlides` builds its own scene, so guides cannot reach exports.
* `exportSlides(project, resolveAsset, { format, quality, scale, onProgress })` returns one `Blob` per slide. It uses one offscreen stage the size of a single slide and moves it across the panorama (pixel-identical to rendering the full canvas and cropping, but safe for 20 slides on iOS canvas limits). It waits for fonts and for all tracked asset loads, and fails loudly if an asset cannot be resolved. Empty frame placeholders are editor-only.
* Slice geometry (`slicePlan`) is pure and unit-tested in core.

## Layer-plugin contract

```ts
interface LayerDefinition<T extends LayerType> {
  type: T;
  label: string;
  icon?: string;
  schema: z.ZodType<PropsOf<T>>;          // validates layer.props
  defaults(): PropsOf<T>;                 // fresh object each call
  base?: Partial<non-props layer fields>; // default size, locked, ...
  render(layer: LayerOf<T>, ctx): Konva.Group;
  update?(node: Konva.Group, layer: LayerOf<T>, ctx): boolean | void;
  inspector?: readonly InspectorFieldSpec[]; // drives the UI inspector
}
interface LayerRenderContext {
  mode: 'edit' | 'export';
  resolveAsset(assetId): Promise<HTMLImageElement | ImageBitmap>;
  track(work: Promise<unknown>): void;   // register async work the exporter must await
}
```

Rules:

1. `render` returns a `Konva.Group` whose `id()` is the layer id. Build it with `createLayerGroup(layer)` and call `applyBase(group, layer)` (position, rotation, opacity, visibility, size, `scale = 1`) in both `render` and `update`. The group has a transparent hit rect matching the layer box, so selection and the Transformer work for any content.
2. `update` mutates the existing node in place. Omit it (or return `false`) and the reconciler re-renders just that layer and swaps the node. Always reset to a state derived only from `layer`; the Transformer leaves non-1 scales on nodes.
3. Layers must not read project state or storage. Images come only from `ctx.resolveAsset`; wrap async loads with `ctx.track(...)` and guard against stale results (see `layers/shared/imageSlot.ts`).
4. Anything editor-only (placeholders, hints) must check `ctx.mode === 'edit'`.
5. Layers never mutate the model.

Shared helpers: `layers/shared/base.ts` (group, base props, rounded clip), `fill.ts` (solid/gradient `Fill` -> Konva), `imageSlot.ts` (async image in a box with cover/contain, crop, flip, rounded clip, placeholder).

## Adding a new layer type

1. **Schema (core):** in `core/schema.ts` add `xyzPropsSchema` and `xyzLayerSchema = z.object({ ...layerBase, type: z.literal('xyz'), props: xyzPropsSchema })`, and add it to the `layerSchema` discriminated union. Types (`LayerOf<'xyz'>`, ...) follow automatically; add `XyzProps` / `XyzLayer` aliases in `core/types.ts` if you want them.
2. **Definition:** create `src/layers/xyz/index.ts` exporting a `LayerDefinition<'xyz'>` (`type`, `label`, `schema: xyzPropsSchema`, `defaults`, `base`, `render`, optionally `update`).
3. **Register:** add `xyz: xyzLayer` to `layerRegistry` in `src/layers/registry.ts`. The `Registry` mapped type makes the compiler fail until every `LayerType` has a definition.
4. **Test:** `tests/serialization.test.ts` already checks every registered type (defaults validate, `createLayer` output validates, documents round-trip). Add render/reconcile cases to `tests/reconcile.test.ts` if the node logic is non-trivial.
5. If persisted documents change shape, bump `SCHEMA_VERSION` and add a migration (a new layer type alone is backward compatible, so no bump is needed).

## Testing

`npm test` runs vitest in Node. Core, history, migrations, serialization, slice math, the layer registry and the Reconciler (Konva nodes without a canvas) are covered. Storage is tested against `fake-indexeddb`. Rendering to pixels (text measurement, `toBlob`, snapping while dragging, the PWA shell) needs a real browser and is checked by driving headless Edge over the DevTools protocol (`?debug` hook).

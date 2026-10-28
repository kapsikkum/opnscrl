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

## Mobile apps

opnscrl also ships as an Android and iOS app: the same web app in a [Tauri v2](https://tauri.app) shell (`src-tauri/`). The shell exists for one reason: **saving exports straight to the photo gallery**. Browsers can only download files, which is slow and clumsy for hundreds of pictures; the app writes each image into the gallery (album `opnscrl` by default) one at a time, with flat memory use.

### Download

Get the files from the [latest release](../../releases/latest):

- Android: `opnscrl-<version>-android-arm64.apk` (most phones) or `...-android-x86_64.apk` (emulators, some Chromebooks). Allow installs from this source when Android asks.
- iOS: `opnscrl-<version>-ios-unsigned.ipa`. It is **unsigned**: sideload it with a tool that signs it with your own Apple ID (AltStore, Sideloadly, TrollStore). Apps signed with a free Apple ID expire after 7 days and must be re-signed.

### Gallery saving

- Android 10+ saves to `Pictures/<album>` through MediaStore and asks for no permission. Android 7 to 9 ask for storage access once.
- iOS asks for add-only access to the photo library (the app never reads your photos) and puts the pictures in an album (default `opnscrl`).
- Native commands (see `src-tauri/src/gallery.rs`): `save_image_to_gallery` (raw image bytes as the body, `x-album`, `x-filename` and `x-mime` headers), `gallery_permission_status` and `gallery_request_permission`.

### Building

Prerequisites: Node 22+, Rust (stable) with the mobile targets, and `npm install`.

```bash
# Android: JDK 21, Android SDK (platform 37) and NDK 27.2.12479018 (ANDROID_HOME and NDK_HOME set)
rustup target add aarch64-linux-android x86_64-linux-android
npx tauri android build --apk --split-per-abi --target aarch64 --target x86_64
# -> src-tauri/gen/android/app/build/outputs/apk/{arm64,x86_64}/...
npm run android:dev   # run on a device or emulator with live reload

# iOS: macOS with Xcode
rustup target add aarch64-apple-ios
npx tauri ios init        # once; src-tauri/gen/apple is not committed
npm run ios:dev           # or: npx tauri ios build
```

Building Android on Windows needs symlink rights (Developer Mode); CI builds on Linux. Releases, version bumps and signing are described in [RELEASING.md](RELEASING.md).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT, see [LICENSE](LICENSE).

# Releasing opnscrl

The web app is deployed by `pages.yml` on every push to `main`. The mobile apps are released by `v*` tags:
`.github/workflows/android.yml` and `ios.yml` build on the tag and attach the files below to the GitHub
release of that tag (the two workflows share one release and never create it at the same moment).

| File | From |
|---|---|
| `opnscrl-<version>-android-arm64.apk` | android.yml |
| `opnscrl-<version>-android-x86_64.apk` | android.yml |
| `opnscrl-<version>-ios-unsigned.ipa` | ios.yml |
| `SHA256SUMS-android.txt`, `SHA256SUMS-ios.txt` | android.yml, ios.yml |

Without the signing secrets the Android files are debug-signed and named `...-android-arm64-debug.apk`.

## Cutting a release

```bash
node scripts/set-version.mjs 0.2.0     # package.json + src-tauri/Cargo.toml (+ Cargo.lock)
git commit -am "release 0.2.0"
git tag v0.2.0
git push && git push origin v0.2.0
```

`node scripts/check-version.mjs vX.Y.Z` compares the tag with `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json` (which reads `package.json`); both workflows run it first and fail on a mismatch.

The Android `versionCode` is derived from the version (`major * 1000000 + minor * 1000 + patch`, then
`* 10 + ABI digit`: arm 1, arm64 2, x86 3, x86_64 4), so every release and every APK is a distinct version.
Keep minor and patch below 1000.

## Android signing

The Android workflow builds release-signed APKs when these repository secrets exist, and falls back to
debug-signed APKs when they do not. The keystore is created once and must be kept safe: losing it means
installed apps cannot be updated in place.

```bash
keytool -genkeypair -v -keystore opnscrl-release.keystore -alias opnscrl -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 opnscrl-release.keystore > keystore.b64   # macOS: base64 -i opnscrl-release.keystore
```

Add four secrets under Settings > Secrets and variables > Actions:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `opnscrl` (the `-alias` above) |
| `ANDROID_KEY_PASSWORD` | the key password |

Never commit the keystore or `keystore.b64` (`*.keystore` and `*.jks` are gitignored).

For a local signed build, put `storeFile`, `storePassword`, `keyAlias` and `keyPassword` in
`src-tauri/gen/android/keystore.properties` (gitignored), or set the `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` environment variables,
then run `npx tauri android build --apk --split-per-abi --target aarch64 --target x86_64`.

## iOS

The IPA is unsigned and needs no Apple account or secrets. Users sideload it with a tool that signs it for
their own device (AltStore, Sideloadly, TrollStore). The Xcode project (`src-tauri/gen/apple`) is not
committed; the workflow generates it with `tauri ios init`.

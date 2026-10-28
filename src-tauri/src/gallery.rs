//! Saving pictures to the phone's photo gallery: a thin bridge to the native savers (the Kotlin
//! `GalleryPlugin` on Android, the Swift `GalleryPlugin` in `plugins/ios-gallery` on iOS). Other
//! platforms answer `unsupported`, so the web app falls back to downloads.
//!
//! Contract with the web app (`src/export/native.ts`):
//! - `save_image_to_gallery`: the raw image bytes are the request body; `x-album`, `x-filename`
//!   (both `encodeURIComponent`-encoded) and `x-mime` (`image/png` or `image/jpeg`) are headers.
//!   One image per call. The bytes go to a temp file that is always deleted again, so memory
//!   stays flat however many pictures are saved in a row.
//! - `gallery_permission_status` / `gallery_request_permission`: `"granted"`, `"denied"` or
//!   `"prompt"`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{ipc::InvokeBody, AppHandle, Manager};

#[cfg(target_os = "android")]
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Wry,
};

#[cfg(target_os = "android")]
pub struct Gallery(PluginHandle<Wry>);

#[cfg(target_os = "android")]
pub fn init() -> TauriPlugin<Wry> {
    Builder::new("gallery")
        .setup(|app, api| {
            let handle = api.register_android_plugin("app.opnscrl.mobile", "GalleryPlugin")?;
            app.manage(Gallery(handle));
            Ok(())
        })
        .build()
}

/// Runs a command of the native plugin and returns its result.
#[cfg(target_os = "android")]
fn call(app: &AppHandle, command: &str, payload: Value) -> Result<Value, String> {
    app.state::<Gallery>()
        .0
        .run_mobile_plugin::<Value>(command, payload)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "ios")]
fn call(app: &AppHandle, command: &str, payload: Value) -> Result<Value, String> {
    tauri_plugin_ios_gallery::call(app, command, payload)
}

#[cfg(not(mobile))]
fn call(_app: &AppHandle, _command: &str, _payload: Value) -> Result<Value, String> {
    Err("unsupported".into())
}

/// The folder (inside the app's cache) that holds the images on their way to the gallery.
fn temp_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("gallery");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Removes leftovers of a previous run (the app was killed between writing and deleting).
pub fn clear_temp_files(app: &AppHandle) {
    if let Ok(dir) = app.path().app_cache_dir() {
        let _ = std::fs::remove_dir_all(dir.join("gallery"));
    }
}

/// Deletes the temp file when dropped, whether the save worked, failed or panicked.
struct TempFile(PathBuf);

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Decodes the `encodeURIComponent` form of a header value.
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(byte) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A single path segment that is safe to use as an album or file name: no separators, control
/// characters or leading dots, at most 100 characters. Falls back to `fallback` when nothing is left.
fn sanitize(name: &str, fallback: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned: String = cleaned
        .trim()
        .trim_start_matches('.')
        .chars()
        .take(100)
        .collect();
    if cleaned.trim().is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn header(request: &tauri::ipc::Request<'_>, name: &str) -> Option<String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
}

fn extension_for(mime: &str) -> Option<&'static str> {
    match mime {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        _ => None,
    }
}

#[derive(Deserialize)]
struct Status {
    status: String,
}

fn permission(app: &AppHandle, command: &str) -> Result<String, String> {
    let value = call(app, command, json!({}))?;
    let status: Status = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(match status.status.as_str() {
        "granted" | "prompt" => status.status,
        _ => "denied".into(),
    })
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn write_temp(dir: &Path, ext: &str, bytes: &[u8]) -> Result<TempFile, String> {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = dir.join(format!("save-{}-{n}.{ext}", std::process::id()));
    // Owned before the write, so a failed or partial write is cleaned up too.
    let file = TempFile(path);
    std::fs::write(&file.0, bytes).map_err(|e| e.to_string())?;
    Ok(file)
}

#[tauri::command]
pub async fn save_image_to_gallery(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the image bytes as the request body".into());
    };
    if bytes.is_empty() {
        return Err("empty image".into());
    }
    let mime = header(&request, "x-mime").unwrap_or_else(|| "image/png".into());
    let ext = extension_for(&mime).ok_or_else(|| format!("unsupported image type: {mime}"))?;
    let album = sanitize(&header(&request, "x-album").unwrap_or_default(), "opnscrl");
    let name = sanitize(
        &header(&request, "x-filename").unwrap_or_default(),
        &format!("image.{ext}"),
    );

    let file = write_temp(&temp_dir(&app)?, ext, bytes)?;
    let payload = json!({
        "path": file.0.to_string_lossy(),
        "album": album,
        "name": name,
        "mime": mime,
    });
    // The native saver blocks until the picture is stored, so keep it off the async threads.
    // `file` moves into the closure and is deleted when it ends.
    tauri::async_runtime::spawn_blocking(move || {
        let _file = file;
        call(&app, "saveImage", payload).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn gallery_permission_status(app: AppHandle) -> Result<String, String> {
    permission(&app, "permissionStatus")
}

#[tauri::command]
pub async fn gallery_request_permission(app: AppHandle) -> Result<String, String> {
    permission(&app, "requestPermission")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_uri_components() {
        assert_eq!(percent_decode("My%20album%20%E2%9C%93"), "My album ✓");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("a%zzb"), "a%zzb");
    }

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize("../a/b.png", "x"), "_a_b.png");
        assert_eq!(sanitize("  ", "fallback"), "fallback");
        assert_eq!(sanitize("..", "fallback"), "fallback");
        assert_eq!(sanitize("slide 1.png", "x"), "slide 1.png");
    }

    #[test]
    fn maps_mime_types() {
        assert_eq!(extension_for("image/png"), Some("png"));
        assert_eq!(extension_for("image/jpeg"), Some("jpg"));
        assert_eq!(extension_for("image/gif"), None);
    }
}

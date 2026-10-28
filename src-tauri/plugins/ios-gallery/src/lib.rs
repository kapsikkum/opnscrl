//! iOS only: saves pictures to the photo library with PhotoKit.
//!
//! The Swift side (`ios/Sources/IosGalleryPlugin.swift`) implements three commands, which the
//! app's `gallery.rs` calls through [`call`]:
//! - `saveImage` `{ path, album, name, mime }`: adds the image file to the library (add-only
//!   access) and puts it in the album named `album`, creating the album when it is missing.
//! - `permissionStatus` / `requestPermission`: `{ status: "granted" | "denied" | "prompt" }`.
//!
//! On every other platform this crate is empty; the app only depends on it for iOS.

#[cfg(target_os = "ios")]
mod ios {
    use serde_json::Value;
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        AppHandle, Manager, Wry,
    };

    tauri::ios_plugin_binding!(init_plugin_ios_gallery);

    struct Gallery(PluginHandle<Wry>);

    /// The plugin. Add it with `.plugin(tauri_plugin_ios_gallery::init())`.
    pub fn init() -> TauriPlugin<Wry> {
        Builder::new("ios-gallery")
            .setup(|app, api| {
                let handle = api.register_ios_plugin(init_plugin_ios_gallery)?;
                app.manage(Gallery(handle));
                Ok(())
            })
            .build()
    }

    /// Runs a command of the Swift plugin and waits for its result.
    pub fn call(app: &AppHandle, command: &str, payload: Value) -> Result<Value, String> {
        app.state::<Gallery>()
            .0
            .run_mobile_plugin::<Value>(command, payload)
            .map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "ios")]
pub use ios::{call, init};

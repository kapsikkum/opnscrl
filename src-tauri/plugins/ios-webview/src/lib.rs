//! iOS only: makes the WKWebView behave like the Android one, where the activity resizes the web
//! view for the keyboard (see `MainActivity.kt`).
//!
//! The Swift side (`ios/Sources/IosWebviewPlugin.swift`) stops the web view's own scroll view from
//! scrolling, bouncing or panning, and shrinks the web view to the area above a docked keyboard,
//! animated with the keyboard. The page then lays itself out in that smaller viewport, so the
//! bottom toolbar sits on the keyboard and nothing needs to be scrolled into view.
//!
//! Contract with the web client (kept identical to the Mudrix shell, names included):
//! - Before any page script runs, [`INIT_SCRIPT`] sets `window.__MUDRIX_IOS_NATIVE_KEYBOARD__ = true`
//!   and adds the `ios-native-keyboard` class to `<html>`. The page then fills the web view and
//!   leaves the visual viewport alone.
//! - Whenever the keyboard changes, Swift sets `--ios-keyboard-height` (CSS px) on `<html>`,
//!   toggles the `ios-keyboard-open` class, and dispatches a `mudrix:ios-keyboard` window event
//!   with `{ height }`.
//!
//! On every other platform the plugin registers nothing native and injects nothing; the app only
//! adds it on iOS anyway.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_ios_webview);

/// Runs at document start in the main frame, before the web client's own scripts.
pub const INIT_SCRIPT: &str = "window.__MUDRIX_IOS_NATIVE_KEYBOARD__ = true;\
     if (document.documentElement) document.documentElement.classList.add('ios-native-keyboard');";

/// The plugin. Add it with `.plugin(tauri_plugin_ios_webview::init())`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let builder = Builder::new("ios-webview");
    #[cfg(target_os = "ios")]
    let builder = builder.js_init_script(INIT_SCRIPT);
    builder
        .setup(|_app, api| {
            #[cfg(target_os = "ios")]
            api.register_ios_plugin(init_plugin_ios_webview)?;
            #[cfg(not(target_os = "ios"))]
            let _ = api;
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::INIT_SCRIPT;

    #[test]
    fn init_script_sets_the_contract_flags() {
        assert!(INIT_SCRIPT.contains("window.__MUDRIX_IOS_NATIVE_KEYBOARD__ = true;"));
        assert!(INIT_SCRIPT.contains("classList.add('ios-native-keyboard')"));
    }
}

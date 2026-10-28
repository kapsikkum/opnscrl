//! opnscrl: a Tauri v2 shell around the opnscrl web app for iOS and Android.
//!
//! The web app runs unchanged. The shell adds what a browser cannot do: saving the exported
//! pictures straight into the photo gallery (see `gallery.rs`), one image per call, so hundreds
//! of pictures can be saved without holding them in memory.

mod gallery;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(gallery::init());
    // The Swift gallery saver, and a web view with no scrolling that ends at the keyboard.
    #[cfg(target_os = "ios")]
    let builder = builder
        .plugin(tauri_plugin_ios_gallery::init())
        .plugin(tauri_plugin_ios_webview::init());
    builder
        .setup(|app| {
            gallery::clear_temp_files(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gallery::save_image_to_gallery,
            gallery::gallery_permission_status,
            gallery::gallery_request_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running opnscrl");
}

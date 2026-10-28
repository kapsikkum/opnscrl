// Builds and links the Swift package in `ios/` when the target is iOS (on a macOS host); a no-op for
// every other target.
fn main() {
    tauri_plugin::Builder::new(&[]).ios_path("ios").build();
}

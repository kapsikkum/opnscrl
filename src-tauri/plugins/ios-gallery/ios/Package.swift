// swift-tools-version:5.5

import PackageDescription

// The library name must match the Rust crate name: tauri-plugin's build helper links it by that name.
let package = Package(
  name: "tauri-plugin-ios-gallery",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v13),
  ],
  products: [
    .library(
      name: "tauri-plugin-ios-gallery",
      type: .static,
      targets: ["tauri-plugin-ios-gallery"])
  ],
  dependencies: [
    // Copied here by tauri-plugin's build helper at build time.
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-ios-gallery",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)

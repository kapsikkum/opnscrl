// opnscrl, iOS: saves pictures to the photo library with PhotoKit, one image file per call. See
// src/lib.rs for the commands and src/gallery.rs of the app for the caller.
//
// Access is add-only (NSPhotoLibraryAddUsageDescription): the app never reads the library.

import Photos
import Tauri
import UIKit

struct SaveImageArgs: Decodable {
  let path: String
  let album: String
  let name: String?
  let mime: String?
}

class IosGalleryPlugin: Plugin {
  /// PhotoKit calls are made one at a time, in order, and never on the main thread: saving blocks
  /// until the library has stored the picture.
  private let queue = DispatchQueue(label: "app.opnscrl.gallery", qos: .userInitiated)

  /// Album title -> local identifier of the album, so that hundreds of saves do not each search
  /// the library. Kept in UserDefaults too, so the next launch finds the album it made.
  private let defaultsKey = "opnscrl.gallery.albums"
  private lazy var albumIds: [String: String] =
    (UserDefaults.standard.dictionary(forKey: defaultsKey) as? [String: String]) ?? [:]

  private static func state(_ status: PHAuthorizationStatus) -> String {
    switch status {
    case .authorized, .limited: return "granted"
    case .notDetermined: return "prompt"
    default: return "denied"
    }
  }

  @objc public func permissionStatus(_ invoke: Invoke) throws {
    invoke.resolve(["status": Self.state(PHPhotoLibrary.authorizationStatus(for: .addOnly))])
  }

  @objc public func requestPermission(_ invoke: Invoke) throws {
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
      invoke.resolve(["status": Self.state(status)])
    }
  }

  @objc public func saveImage(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SaveImageArgs.self)
    queue.async {
      do {
        try self.save(args)
        invoke.resolve()
      } catch {
        invoke.reject(error.localizedDescription)
      }
    }
  }

  private func save(_ args: SaveImageArgs) throws {
    // Runs on the serial queue, so asking for permission here (once, when it was never asked)
    // blocks only the saves that are waiting behind it.
    var status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    if status == .notDetermined {
      let done = DispatchSemaphore(value: 0)
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { granted in
        status = granted
        done.signal()
      }
      done.wait()
    }
    guard status == .authorized || status == .limited else {
      throw GalleryError.denied
    }

    let url = URL(fileURLWithPath: args.path)
    guard FileManager.default.fileExists(atPath: args.path) else { throw GalleryError.missingFile }
    let uti = args.mime == "image/jpeg" ? "public.jpeg" : "public.png"

    // Keeps the memory of one picture from piling up over hundreds of saves.
    try autoreleasepool {
      let album = findAlbum(titled: args.album)
      // An album we made earlier whose lookup now fails (add-only access cannot always read albums
      // back): save without an album rather than creating a duplicate on every picture.
      let known = albumIds[args.album] != nil
      try PHPhotoLibrary.shared().performChangesAndWait {
        let options = PHAssetResourceCreationOptions()
        options.shouldMoveFile = false
        options.uniformTypeIdentifier = uti
        if let name = args.name { options.originalFilename = name }
        let request = PHAssetCreationRequest.forAsset()
        request.addResource(with: .photo, fileURL: url, options: options)
        guard let placeholder = request.placeholderForCreatedAsset else { return }

        if let album = album {
          PHAssetCollectionChangeRequest(for: album)?.addAssets([placeholder] as NSArray)
        } else if !known {
          let create = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(
            withTitle: args.album)
          create.addAssets([placeholder] as NSArray)
          self.remember(args.album, create.placeholderForCreatedAssetCollection.localIdentifier)
        }
      }
    }
  }

  /// The album with this title: the remembered one first, then a search by title.
  private func findAlbum(titled title: String) -> PHAssetCollection? {
    if let id = albumIds[title] {
      let byId = PHAssetCollection.fetchAssetCollections(
        withLocalIdentifiers: [id], options: nil)
      if let found = byId.firstObject { return found }
    }
    let options = PHFetchOptions()
    options.predicate = NSPredicate(format: "title = %@", title)
    let byTitle = PHAssetCollection.fetchAssetCollections(
      with: .album, subtype: .albumRegular, options: options)
    if let found = byTitle.firstObject {
      remember(title, found.localIdentifier)
      return found
    }
    return nil
  }

  private func remember(_ title: String, _ id: String) {
    albumIds[title] = id
    UserDefaults.standard.set(albumIds, forKey: defaultsKey)
  }
}

enum GalleryError: LocalizedError {
  case denied
  case missingFile

  var errorDescription: String? {
    switch self {
    case .denied: return "Saving to the photo library is not allowed. Allow it in Settings."
    case .missingFile: return "The image file is missing."
    }
  }
}

@_cdecl("init_plugin_ios_gallery")
public func initPlugin() -> Plugin {
  return IosGalleryPlugin()
}

// opnscrl, iOS: saves pictures to the photo library with PhotoKit, one image file per call. See
// src/lib.rs for the commands and src/gallery.rs of the app for the caller.
//
// Access is add-only (NSPhotoLibraryAddUsageDescription): the app never reads the library.

import Photos
import PhotosUI
import UniformTypeIdentifiers
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

  // MARK: Photos picker

  private var pickerDelegate: PickerDelegate?

  /// The system Photos picker (no library permission needed). Chosen pictures are written to
  /// `args.dir`; HEIC and other formats the web view's pipeline may not decode become JPEG.
  @objc public func pickImages(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(PickImagesArgs.self)
    DispatchQueue.main.async {
      var config = PHPickerConfiguration(photoLibrary: .shared())
      config.filter = .images
      config.selectionLimit = (args.multiple ?? true) ? 0 : 1
      config.preferredAssetRepresentationMode = .current
      let picker = PHPickerViewController(configuration: config)
      let delegate = PickerDelegate(dir: URL(fileURLWithPath: args.dir), queue: self.queue) { result in
        self.pickerDelegate = nil
        switch result {
        case .success(let files): invoke.resolve(["files": files])
        case .failure(let error): invoke.reject(error.localizedDescription)
        }
      }
      self.pickerDelegate = delegate
      picker.delegate = delegate
      guard let host = self.presenter() else {
        self.pickerDelegate = nil
        invoke.reject("No screen to show the picker on.")
        return
      }
      host.present(picker, animated: true)
    }
  }

  private func presenter() -> UIViewController? {
    var top: UIViewController? =
      manager.viewController
      ?? UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first(where: \.isKeyWindow) }
      .first?.rootViewController
    while let next = top?.presentedViewController { top = next }
    return top
  }

  private func save(_ args: SaveImageArgs) throws {
    // Runs on the serial queue, so asking for permission here (once, when it was never asked)
    // blocks only the saves that are waiting behind it.
    var status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    if status == .notDetermined {
      let done = DispatchSemaphore(value: 0)
      let box = StatusBox()
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { granted in
        box.value = granted
        done.signal()
      }
      done.wait()
      status = box.value
    }
    guard status == .authorized || status == .limited else {
      throw GalleryError.denied
    }

    let url = URL(fileURLWithPath: args.path)
    guard FileManager.default.fileExists(atPath: args.path) else { throw GalleryError.missingFile }
    guard (try? url.checkResourceIsReachable()) == true else { throw GalleryError.missingFile }
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

/// Carries the answer of the permission prompt out of its callback (which runs on another thread).
final class StatusBox {
  var value: PHAuthorizationStatus = .notDetermined
}

struct PickImagesArgs: Decodable {
  let dir: String
  let multiple: Bool?
}

/// Receives the picker's choice, copies each picture to a temp file one at a time (so memory stays
/// at one picture) and reports `{ path, name, mime }` for each, in the order chosen.
final class PickerDelegate: NSObject, PHPickerViewControllerDelegate {
  private let dir: URL
  private let queue: DispatchQueue
  private let done: (Result<[[String: String]], Error>) -> Void

  init(
    dir: URL, queue: DispatchQueue, done: @escaping (Result<[[String: String]], Error>) -> Void
  ) {
    self.dir = dir
    self.queue = queue
    self.done = done
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    queue.async {
      var files: [[String: String]] = []
      var failure: Error?
      for result in results {
        // loadFileRepresentation hands over a temporary file that is deleted when the callback returns.
        let sem = DispatchSemaphore(value: 0)
        result.itemProvider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) {
          url, error in
          defer { sem.signal() }
          guard let url = url else {
            failure = failure ?? error
            return
          }
          autoreleasepool {
            if let file = self.copy(url) { files.append(file) }
          }
        }
        sem.wait()
      }
      if files.isEmpty, let failure = failure {
        self.done(.failure(failure))
      } else {
        self.done(.success(files))
      }
    }
  }

  private func copy(_ source: URL) -> [String: String]? {
    let id = UUID().uuidString
    let type = UTType(filenameExtension: source.pathExtension)
    let passThrough: [UTType] = [.png, .jpeg, .gif, .webP]
    do {
      if let type = type, passThrough.contains(where: { type.conforms(to: $0) }) {
        let ext = source.pathExtension.lowercased()
        let target = dir.appendingPathComponent("\(id).\(ext)")
        try FileManager.default.copyItem(at: source, to: target)
        let mime = type.preferredMIMEType ?? "image/\(ext)"
        return ["path": target.path, "name": "photo-\(id.prefix(8)).\(ext)", "mime": mime]
      }
      // HEIC, TIFF, etc.: decode with UIKit (keeps the orientation) and store as JPEG.
      guard let image = UIImage(contentsOfFile: source.path),
        let data = image.jpegData(compressionQuality: 0.92)
      else { return nil }
      let target = dir.appendingPathComponent("\(id).jpg")
      try data.write(to: target)
      return ["path": target.path, "name": "photo-\(id.prefix(8)).jpg", "mime": "image/jpeg"]
    } catch {
      return nil
    }
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

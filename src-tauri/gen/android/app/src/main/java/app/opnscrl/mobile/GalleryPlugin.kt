package app.opnscrl.mobile

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class SaveImageArgs {
  var path: String = ""
  var album: String = "opnscrl"
  var name: String? = null
  var mime: String = "image/png"
}

/**
 * Saves pictures to the gallery (through the Rust `save_image_to_gallery` and `gallery_*`
 * commands). One image file per call, copied by streaming, so memory stays flat.
 *
 * Android 10 (API 29) and up store into `Pictures/<album>` through MediaStore, which needs no
 * permission. Android 7 to 9 (API 24 to 28) write into the public Pictures folder, which needs
 * WRITE_EXTERNAL_STORAGE (declared with maxSdkVersion 28 in the manifest).
 */
@TauriPlugin(
  permissions = [Permission(strings = [Manifest.permission.WRITE_EXTERNAL_STORAGE], alias = "storage")]
)
class GalleryPlugin(private val activity: Activity) : Plugin(activity) {
  private val context get() = activity.applicationContext

  /** Only API 28 and below need the permission; newer versions always "have" it. */
  private fun status(): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return "granted"
    return when (getPermissionState("storage")?.toString()) {
      "granted" -> "granted"
      "denied" -> "denied"
      else -> "prompt"
    }
  }

  private fun statusResult(): JSObject {
    val result = JSObject()
    result.put("status", status())
    return result
  }

  @Command
  fun permissionStatus(invoke: Invoke) {
    invoke.resolve(statusResult())
  }

  @Command
  fun requestPermission(invoke: Invoke) {
    if (status() != "prompt") {
      invoke.resolve(statusResult())
      return
    }
    activity.runOnUiThread { requestPermissionForAlias("storage", invoke, "storageResult") }
  }

  @PermissionCallback
  fun storageResult(invoke: Invoke) {
    invoke.resolve(statusResult())
  }

  @Command
  fun saveImage(invoke: Invoke) {
    val args = invoke.parseArgs(SaveImageArgs::class.java)
    val source = File(args.path)
    if (!source.isFile) {
      invoke.reject("The image file is missing")
      return
    }
    val name = displayName(args.name, args.mime)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        saveWithMediaStore(source, args.album, name, args.mime)
      } else {
        if (status() != "granted") {
          invoke.reject("Saving to the gallery is not allowed. Allow storage access for opnscrl in Settings.")
          return
        }
        saveToPicturesFolder(source, args.album, name, args.mime)
      }
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: e.toString())
    }
  }

  /** The file name with the extension of its type, so the gallery shows it as a picture. */
  private fun displayName(name: String?, mime: String): String {
    val extension = if (mime == "image/jpeg") "jpg" else "png"
    val base = name?.takeIf { it.isNotBlank() } ?: "image"
    val lower = base.lowercase()
    val hasExtension = if (extension == "jpg") {
      lower.endsWith(".jpg") || lower.endsWith(".jpeg")
    } else {
      lower.endsWith(".png")
    }
    return if (hasExtension) base else "$base.$extension"
  }

  /** API 29+: insert a pending row, stream the file into it, then publish it. */
  private fun saveWithMediaStore(source: File, album: String, name: String, mime: String) {
    val resolver = context.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.Images.Media.DISPLAY_NAME, name)
      put(MediaStore.Images.Media.MIME_TYPE, mime)
      put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$album")
      put(MediaStore.Images.Media.IS_PENDING, 1)
    }
    // MediaStore renames the file ("name (1).png") when one with that name is already there.
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("The gallery refused the picture")
    try {
      val output = resolver.openOutputStream(uri, "w")
        ?: throw IllegalStateException("Could not open the picture for writing")
      output.use { out -> source.inputStream().use { it.copyTo(out) } }
      val done = ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }
      resolver.update(uri, done, null, null)
    } catch (e: Exception) {
      // Do not leave a half-written, invisible entry behind.
      try {
        resolver.delete(uri, null, null)
      } catch (_: Exception) {
      }
      throw e
    }
  }

  /** API 24-28: write into Pictures/<album> and tell the media scanner about it. */
  @Suppress("DEPRECATION")
  private fun saveToPicturesFolder(source: File, album: String, name: String, mime: String) {
    val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), album)
    if (!directory.isDirectory && !directory.mkdirs()) {
      throw IllegalStateException("Could not create the album folder")
    }
    val target = uniqueFile(directory, name)
    try {
      source.inputStream().use { input -> target.outputStream().use { input.copyTo(it) } }
    } catch (e: Exception) {
      target.delete()
      throw e
    }
    MediaScannerConnection.scanFile(context, arrayOf(target.absolutePath), arrayOf(mime), null)
  }

  /** `name.png`, or `name (1).png`, `name (2).png`... when it is taken. */
  private fun uniqueFile(directory: File, name: String): File {
    var candidate = File(directory, name)
    val dot = name.lastIndexOf('.')
    val stem = if (dot > 0) name.substring(0, dot) else name
    val extension = if (dot > 0) name.substring(dot) else ""
    var n = 1
    while (candidate.exists()) {
      candidate = File(directory, "$stem ($n)$extension")
      n++
    }
    return candidate
  }
}

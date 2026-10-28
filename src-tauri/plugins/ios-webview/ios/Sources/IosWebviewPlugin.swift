// opnscrl, iOS: keep the WKWebView from scrolling or panning, and resize it to the area above
// the keyboard, the way Android's activity resizes its web view. See src/lib.rs for the contract
// with the web client.

import Tauri
import UIKit
import WebKit

/// Keeps the web view's own scroll view at rest. The page is a fixed, full-size app that scrolls
/// inside its own containers (those are separate scroll views and are not affected), so any offset
/// here is WebKit or UIKit panning the whole page to reveal a focused field.
///
/// WKWebView forwards scroll view delegate calls to its own (internal) delegate first and then to
/// this one, so WebKit's handling is kept. The scroll view holds this object weakly; the plugin
/// keeps it alive.
final class ScrollPinner: NSObject, UIScrollViewDelegate {
  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    // Leave a zoomed page alone (the app's viewport has maximum-scale=1, so it should never be).
    guard !scrollView.isZooming, !scrollView.isZoomBouncing,
      scrollView.zoomScale <= scrollView.minimumZoomScale + 0.001
    else { return }
    if scrollView.contentOffset != .zero {
      scrollView.contentOffset = .zero
    }
  }
}

class IosWebviewPlugin: Plugin {
  private weak var webView: WKWebView?
  private let pinner = ScrollPinner()

  override func load(webview: WKWebView) {
    // Tauri may call this again for the same web view.
    if webView === webview { return }
    webView = webview

    let scrollView = webview.scrollView
    scrollView.isScrollEnabled = false
    scrollView.bounces = false
    scrollView.alwaysBounceVertical = false
    scrollView.alwaysBounceHorizontal = false
    // The page handles the safe area itself (viewport-fit=cover, env(safe-area-inset-*)).
    scrollView.contentInsetAdjustmentBehavior = .never
    scrollView.delegate = pinner
    scrollView.contentOffset = .zero
    hideInputAccessory(of: webview)

    let center = NotificationCenter.default
    center.addObserver(
      self, selector: #selector(keyboardWillChangeFrame(_:)),
      name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
    center.addObserver(
      self, selector: #selector(keyboardWillHide(_:)),
      name: UIResponder.keyboardWillHideNotification, object: nil)
    // After the animation, settle again without animating: covers rotation and split-screen
    // changes where the container's size was not final when the "will" notification arrived.
    center.addObserver(
      self, selector: #selector(keyboardDidChangeFrame(_:)),
      name: UIResponder.keyboardDidChangeFrameNotification, object: nil)
  }

  /// Removes the previous/next/done bar WebKit puts above the keyboard for form fields. The page has
  /// no form to step through, and the bar takes room from the composer. WKWebView has no public switch
  /// for it, so its content view (a private class) is given a subclass whose `inputAccessoryView` is nil.
  private func hideInputAccessory(of webview: WKWebView) {
    guard
      let content = webview.scrollView.subviews.first(where: {
        String(describing: type(of: $0)).hasPrefix("WKContent")
      })
    else { return }
    let original: AnyClass = type(of: content)
    let name = "\(original)_NoInputAccessory"
    var subclass: AnyClass? = NSClassFromString(name)
    if subclass == nil {
      subclass = objc_allocateClassPair(original, name, 0)
      guard let subclass = subclass,
        let method = class_getInstanceMethod(UIResponder.self, #selector(getter: UIResponder.inputAccessoryView))
      else { return }
      let noAccessory: @convention(block) (AnyObject) -> UIView? = { _ in nil }
      class_addMethod(
        subclass, #selector(getter: UIResponder.inputAccessoryView),
        imp_implementationWithBlock(noAccessory), method_getTypeEncoding(method))
      objc_registerClassPair(subclass)
    }
    if let subclass = subclass { object_setClass(content, subclass) }
  }

  @objc private func keyboardWillChangeFrame(_ notification: Notification) {
    update(from: notification, hiding: false, animated: true)
  }

  @objc private func keyboardWillHide(_ notification: Notification) {
    update(from: notification, hiding: true, animated: true)
  }

  @objc private func keyboardDidChangeFrame(_ notification: Notification) {
    update(from: notification, hiding: false, animated: false)
  }

  private func update(from notification: Notification, hiding: Bool, animated: Bool) {
    guard let webview = webView, let container = webview.superview else { return }
    let info = notification.userInfo ?? [:]

    var overlap: CGFloat = 0
    if !hiding, let endFrame = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue {
      // iOS 16.1+ passes the keyboard's screen as the notification object.
      let screen = (notification.object as? UIScreen) ?? container.window?.screen
      overlap = dockedKeyboardHeight(endFrame, screen: screen, in: container)
    }

    let bounds = container.bounds
    let target = CGRect(
      x: bounds.minX, y: bounds.minY, width: bounds.width, height: max(0, bounds.height - overlap))
    if webview.frame != target {
      let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0
      // The keyboard uses a private curve (7) that UIView.AnimationCurve has no case for, so pass
      // it through as animation options, which is what UIKit expects.
      let curve =
        (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? NSNumber)?.uintValue
        ?? UInt(UIView.AnimationCurve.easeInOut.rawValue)
      let resize = {
        webview.frame = target
        webview.layoutIfNeeded()
      }
      if animated && duration > 0 {
        UIView.animate(
          withDuration: duration, delay: 0,
          options: [UIView.AnimationOptions(rawValue: curve << 16), .beginFromCurrentState],
          animations: resize)
      } else {
        resize()
      }
    }
    webview.scrollView.contentOffset = .zero
    publish(overlap, to: webview)
  }

  /// How far a docked keyboard reaches up into `container`. A floating, undocked or split iPad
  /// keyboard does not touch the bottom edge; the page is not resized for it.
  private func dockedKeyboardHeight(
    _ screenFrame: CGRect, screen: UIScreen?, in container: UIView
  ) -> CGFloat {
    guard !screenFrame.isEmpty, let screen = screen else { return 0 }
    let frame = screen.coordinateSpace.convert(screenFrame, to: container)
    let bounds = container.bounds
    guard frame.intersects(bounds), frame.maxY >= bounds.maxY - 1 else { return 0 }
    return min(max(0, bounds.maxY - frame.minY), bounds.height)
  }

  /// Tells the page (see the contract in src/lib.rs).
  private func publish(_ overlap: CGFloat, to webview: WKWebView) {
    let height = Int(overlap.rounded())
    let script = """
      (function (h) {
        var d = document.documentElement;
        if (!d) return;
        d.classList.add('ios-native-keyboard');
        d.classList.toggle('ios-keyboard-open', h > 0);
        d.style.setProperty('--ios-keyboard-height', h + 'px');
        try { window.dispatchEvent(new CustomEvent('mudrix:ios-keyboard', { detail: { height: h } })); } catch (e) {}
      })(\(height));
      """
    webview.evaluateJavaScript(script, completionHandler: nil)
  }
}

@_cdecl("init_plugin_ios_webview")
public func initPlugin() -> Plugin {
  return IosWebviewPlugin()
}

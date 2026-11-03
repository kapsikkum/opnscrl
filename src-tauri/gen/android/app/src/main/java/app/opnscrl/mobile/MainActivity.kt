package app.opnscrl.mobile

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  // Safe-area insets in CSS px: top, right, bottom, left.
  @Volatile private var insetsCss = doubleArrayOf(0.0, 0.0, 0.0, 0.0)
  private var webViewRef: WebView? = null

  private inner class InsetsBridge {
    @JavascriptInterface
    fun get(): String = insetsCss.joinToString(",", "[", "]")
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // The app follows the system light/dark theme; auto picks matching system-bar icon colours.
    applyEdgeToEdge()
    super.onCreate(savedInstanceState)

    window.setBackgroundDrawable(ColorDrawable(0xFF16161A.toInt()))

    // Draw edge to edge: the web view fills the window and the page pads its own bars by the
    // system-bar/cutout insets, which are passed in as CSS variables. Only the keyboard shrinks the view.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
      val d = resources.displayMetrics.density.toDouble()
      insetsCss = doubleArrayOf(
        bars.top / d,
        bars.right / d,
        if (imeVisible) 0.0 else bars.bottom / d,
        bars.left / d,
      )
      view.setPadding(0, 0, 0, if (imeVisible) ime.bottom else 0)
      pushInsets(view)
      WindowInsetsCompat.CONSUMED
    }
  }

  private fun applyEdgeToEdge() {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
    )
  }

  // The activity handles theme changes itself, so refresh the system-bar icon colours here.
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    applyEdgeToEdge()
  }

  override fun onResume() {
    super.onResume()
    pushInsets(findViewById(android.R.id.content))
  }

  private fun findWebView(v: View): WebView? {
    if (v is WebView) return v
    if (v is ViewGroup) for (i in 0 until v.childCount) findWebView(v.getChildAt(i))?.let { return it }
    return null
  }

  // Set the CSS variables now, and again shortly after (the page may still be loading or reloading).
  private fun pushInsets(root: View) {
    val apply = Runnable {
      val wv = webViewRef ?: findWebView(root)?.also {
        webViewRef = it
        it.addJavascriptInterface(InsetsBridge(), "OpnInsets")
      } ?: return@Runnable
      val (t, r, b, l) = insetsCss.toList()
      wv.evaluateJavascript(
        "(function(e){if(!e)return;var s=e.style;s.setProperty('--sat','${t}px');s.setProperty('--sar','${r}px');" +
          "s.setProperty('--sab','${b}px');s.setProperty('--sal','${l}px');})(document.documentElement)",
        null,
      )
    }
    apply.run()
    for (delay in longArrayOf(300, 1000, 2500, 5000)) root.postDelayed(apply, delay)
  }
}

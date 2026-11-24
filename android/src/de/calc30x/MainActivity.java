package de.calc30x;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Hosts the calculator (assets/index.html) in a full-screen WebView. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF111111);
        getWindow().setNavigationBarColor(0xFF111111);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // memory, history and modes survive restarts
        s.setTextZoom(100);           // ignore system font scaling so the keypad fits
        web.setWebViewClient(new WebViewClient());
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.setBackgroundColor(0xFF111111);
        web.setKeepScreenOn(true);    // screen stays on while the calculator is visible (released when left)
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.back&&back()", null);
    }
}

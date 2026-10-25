package com.martinb.shell;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * MartinB app shell: a gold window bar (minimize, full screen, close) above the app's web content.
 * The app itself is untouched: it is served offline from assets/www/, or loaded from its web address.
 */
public class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final int BAR = Color.parseColor("#0B0A08");
    private static final int GOLD = Color.parseColor("#D4AD62");
    private static final int INK = Color.parseColor("#F3EFE6");
    private static final int REQ_FILE = 42;

    private WebView web;
    private ImageButton maxButton;
    private String appName = "MartinB";
    private String home;
    private String appHost;
    private boolean local = true;
    private boolean immersive = false;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        JSONObject cfg = readConfig();
        appName = cfg.optString("name", appName);
        String url = cfg.optString("url", "");
        local = url.isEmpty();
        home = local ? "https://" + ASSET_HOST + "/www/" + cfg.optString("entry", "index.html") : url;
        appHost = Uri.parse(home).getHost();
        immersive = cfg.optBoolean("immersive", false);
        if (cfg.optBoolean("keepScreenOn", false)) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BAR);
        root.addView(buildBar(), new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(44)));

        web = new WebView(this);
        int bg = BAR;
        try { bg = Color.parseColor(cfg.optString("bg", "#0B0A08")); } catch (IllegalArgumentException ignored) { }
        web.setBackgroundColor(bg);
        root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        setupWebView();
        if (state != null) web.restoreState(state);
        else web.loadUrl(home);
        applyImmersive();
    }

    // ---------- The gold window bar ----------

    private View buildBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BAR);
        bar.setPadding(dp(12), 0, dp(2), 0);

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        icon.setContentDescription(null);
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(24), dp(24));
        ilp.rightMargin = dp(10);
        bar.addView(icon, ilp);

        TextView title = new TextView(this);
        title.setText(brandedName(appName));
        title.setTextColor(INK);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD));
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        bar.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        bar.addView(barButton(R.drawable.mb_min, "Réduire", v -> moveTaskToBack(true)));
        maxButton = barButton(immersive ? R.drawable.mb_restore : R.drawable.mb_max, "Plein écran", v -> {
            immersive = !immersive;
            applyImmersive();
        });
        bar.addView(maxButton);
        bar.addView(barButton(R.drawable.mb_close, "Fermer", v -> finishAndRemoveTask()));
        return bar;
    }

    private ImageButton barButton(int drawable, String label, View.OnClickListener onClick) {
        ImageButton b = new ImageButton(this);
        b.setImageResource(drawable);
        b.setContentDescription(label);
        b.setScaleType(ImageView.ScaleType.CENTER);
        TypedValue tv = new TypedValue();
        if (getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true)) b.setBackgroundResource(tv.resourceId);
        else b.setBackgroundColor(Color.TRANSPARENT);
        b.setOnClickListener(onClick);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(46), dp(44)));
        return b;
    }

    /** Descriptor in white, "OS" in gold, like every MartinB logo. */
    private CharSequence brandedName(String name) {
        SpannableString s = new SpannableString(name);
        int i = name.lastIndexOf("OS");
        boolean wordEnd = i > 0 && (i + 2 == name.length() || name.charAt(i + 2) == ' ');
        if (wordEnd) s.setSpan(new ForegroundColorSpan(GOLD), i, i + 2, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    @SuppressWarnings("deprecation")
    private void applyImmersive() {
        View decor = getWindow().getDecorView();
        if (immersive) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
        if (maxButton != null) maxButton.setImageResource(immersive ? R.drawable.mb_restore : R.drawable.mb_max);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && immersive) applyImmersive();
    }

    // ---------- Web content ----------

    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setSupportMultipleWindows(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        if (local) web.addJavascriptInterface(new Bridge(), "MBNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return local ? loader.shouldInterceptRequest(request.getUrl()) : null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ((scheme.equals("http") || scheme.equals("https")) && appHost != null && appHost.equals(u.getHost())) return false;
                openOutside(u);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (local) view.evaluateJavascript(SAVE_PATCH, null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                if (local) web.evaluateJavascript("window.__mbSave&&window.__mbSave(" + JSONObject.quote(url) + "," + JSONObject.quote(name) + ")", null);
            } else {
                openOutside(Uri.parse(url));
            }
        });
    }

    private void openOutside(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Aucune app ne peut ouvrir ce lien.", Toast.LENGTH_SHORT).show();
        }
    }

    /** Lets the app's "save file" buttons (blob or data links with a download name) write into Downloads. */
    private static final String SAVE_PATCH =
            "(function(){if(window.__mbSave)return;" +
            "window.__mbSave=function(href,name){fetch(href).then(function(r){return r.blob()}).then(function(b){" +
            "var fr=new FileReader();fr.onload=function(){MBNative.save(name||'fichier',b.type||'application/octet-stream',String(fr.result).split(',')[1]||'')};fr.readAsDataURL(b)})" +
            ".catch(function(){MBNative.fail()})};" +
            "var orig=HTMLAnchorElement.prototype.click;" +
            "HTMLAnchorElement.prototype.click=function(){var h=this.href||'';" +
            "if(this.hasAttribute('download')&&(h.indexOf('blob:')===0||h.indexOf('data:')===0)){window.__mbSave(h,this.getAttribute('download'));return}" +
            "return orig.apply(this,arguments)};" +
            "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[download]');if(!a)return;var h=a.href||'';" +
            "if(h.indexOf('blob:')===0||h.indexOf('data:')===0){e.preventDefault();window.__mbSave(h,a.getAttribute('download'))}},true)})();";

    private final class Bridge {
        @JavascriptInterface
        public void save(String name, String mime, String base64) {
            String clean = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String where;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, clean);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + appName);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new IllegalStateException("no uri");
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                        if (out == null) throw new IllegalStateException("no stream");
                        out.write(data);
                    }
                    where = "Téléchargements/" + appName;
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new IllegalStateException("no dir");
                    try (FileOutputStream out = new FileOutputStream(new File(dir, clean))) { out.write(data); }
                    where = dir.getAbsolutePath();
                }
                final String msg = "Enregistré : " + clean + " (" + where + ")";
                runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                fail();
            }
        }

        @JavascriptInterface
        public void fail() {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Impossible d'enregistrer ce fichier.", Toast.LENGTH_LONG).show());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ---------- Lifecycle ----------

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) { web.onPause(); web.pauseTimers(); }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) { web.resumeTimers(); web.onResume(); }
        if (immersive) applyImmersive();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    // ---------- Helpers ----------

    private JSONObject readConfig() {
        try (InputStream in = getAssets().open("mb-config.json")) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[4096];
            int n;
            while ((n = in.read(b)) > 0) buf.write(b, 0, n);
            return new JSONObject(new String(buf.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}

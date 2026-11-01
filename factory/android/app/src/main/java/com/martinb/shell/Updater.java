package com.martinb.shell;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Keeps the installed app up to date by itself.
 * At start-up (and when it comes back after 6 hours) it reads update.json from the app's rolling release.
 * When a newer build exists it downloads the APK in the background, then installs it with Android's
 * PackageInstaller: the first time Android asks for one confirmation (and to allow installs from this app);
 * after that, on Android 12 and later, updates install silently when you leave the app. Data is kept.
 */
final class Updater {
    interface Listener { void onReady(String version, boolean silent); }

    static final String TAG = "MBUpdate";
    static final String ACTION_STATUS = "com.martinb.shell.UPDATE_STATUS";
    private static final long SIX_HOURS = 6L * 60 * 60 * 1000;

    private final Context ctx;
    private final String feed;
    private final boolean auto;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean busy;
    private volatile File ready;
    private volatile String readyVersion;
    private volatile boolean installing;

    Updater(Context ctx, String feed, boolean auto, Listener listener) {
        this.ctx = ctx.getApplicationContext();
        this.feed = feed == null ? "" : feed;
        this.auto = auto;
        this.listener = listener;
    }

    boolean hasUpdate() { return ready != null; }

    static int currentBuild(Context c) {
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            return (int) (code - 1000);
        } catch (Exception e) {
            return 0;
        }
    }

    /** Silent install is possible once this app installed itself before (installer of record) and may install apps. */
    boolean canInstallSilently() {
        if (Build.VERSION.SDK_INT < 31) return false;
        try {
            String installer = ctx.getPackageManager().getInstallSourceInfo(ctx.getPackageName()).getInstallingPackageName();
            return ctx.getPackageName().equals(installer) && ctx.getPackageManager().canRequestPackageInstalls();
        } catch (Exception e) {
            return false;
        }
    }

    void checkIfDue(boolean force) {
        if (feed.isEmpty() || busy || ready != null || installing) return;
        SharedPreferences prefs = ctx.getSharedPreferences("mb_update", Context.MODE_PRIVATE);
        long last = prefs.getLong("last_check", 0);
        if (!force && System.currentTimeMillis() - last < SIX_HOURS) return;
        prefs.edit().putLong("last_check", System.currentTimeMillis()).apply();
        busy = true;
        new Thread(this::check, "mb-update").start();
    }

    private void check() {
        try {
            File dir = new File(ctx.getCacheDir(), "updates");
            JSONObject info = new JSONObject(new String(fetch(feed + (feed.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis()), StandardCharsets.UTF_8));
            int latest = info.optInt("build", 0);
            int mine = currentBuild(ctx);
            if (latest <= mine) {
                Log.i(TAG, "up to date (build " + mine + ", latest " + latest + ")");
                deleteDir(dir);
                return;
            }
            String url = info.optString("apk", "");
            if (url.isEmpty()) return;
            Log.i(TAG, "new build " + latest + " found, downloading " + url);
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no cache dir");
            File apk = new File(dir, latest + ".apk");
            if (!apk.exists() || (info.optLong("apkSize", 0) > 0 && apk.length() != info.optLong("apkSize", 0))) {
                File part = new File(dir, latest + ".part");
                download(url, part);
                long want = info.optLong("apkSize", 0);
                if (want > 0 && part.length() != want) throw new IllegalStateException("size " + part.length() + " != " + want);
                if (!part.renameTo(apk)) throw new IllegalStateException("rename failed");
            }
            // Only keep it if it really is this app, signed by the same key, and newer.
            PackageInfo pi = ctx.getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
            if (pi == null || !ctx.getPackageName().equals(pi.packageName)) { apk.delete(); throw new IllegalStateException("not this app"); }
            ready = apk;
            readyVersion = info.optString("version", "1." + latest);
            Log.i(TAG, "downloaded build " + latest + " (" + apk.length() + " bytes)");
            final boolean silent = canInstallSilently();
            main.post(() -> {
                if (listener != null) listener.onReady(readyVersion, silent);
                if (auto) install();
            });
        } catch (Exception e) {
            Log.w(TAG, "check failed: " + e);
        } finally {
            busy = false;
        }
    }

    /** Hands the downloaded APK to Android. The app is replaced (and closed) when the install completes. */
    void install() {
        final File apk = ready;
        if (apk == null || installing) return;
        installing = true;
        new Thread(() -> {
            try {
                PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(ctx.getPackageName());
                params.setSize(apk.length());
                if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                if (Build.VERSION.SDK_INT >= 33) params.setPackageSource(PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE);
                int id = pi.createSession(params);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    try (InputStream in = new FileInputStream(apk); OutputStream out = s.openWrite("update.apk", 0, apk.length())) {
                        byte[] b = new byte[65536];
                        int n;
                        while ((n = in.read(b)) > 0) out.write(b, 0, n);
                        s.fsync(out);
                    }
                    Intent status = new Intent(ACTION_STATUS).setPackage(ctx.getPackageName()).setClass(ctx, UpdateReceiver.class);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    PendingIntent pending = PendingIntent.getBroadcast(ctx, id, status, flags);
                    Log.i(TAG, "installing " + apk.getName() + (canInstallSilently() ? " silently" : " (asks once)"));
                    s.commit(pending.getIntentSender());
                }
            } catch (Exception e) {
                Log.w(TAG, "install failed: " + e);
                installing = false;
            }
        }, "mb-install").start();
    }

    void installFinished(boolean ok) {
        installing = false;
        if (!ok) Log.w(TAG, "install did not complete; will retry later");
    }

    private static byte[] fetch(String url) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            return out.toByteArray();
        } finally {
            c.disconnect();
        }
    }

    private static void download(String url, File to) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(to)) {
            byte[] b = new byte[65536];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
        } finally {
            c.disconnect();
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        // GitHub sends release files through a redirect to its file server; follow it by hand (it may change host).
        String u = url;
        for (int i = 0; i < 6; i++) {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            c.setRequestProperty("User-Agent", "MartinB-app");
            c.setRequestProperty("Cache-Control", "no-cache");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new IllegalStateException("redirect without location");
                u = new URL(new URL(u), loc).toString();
                continue;
            }
            if (code != 200) { c.disconnect(); throw new IllegalStateException("HTTP " + code + " for " + u); }
            return c;
        }
        throw new IllegalStateException("too many redirects");
    }

    private static void deleteDir(File d) {
        File[] files = d.listFiles();
        if (files != null) for (File f : files) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    /** Test hook (emulator only): the factory's update test serves its own update.json from the host computer. */
    static String testFeed(Intent intent) {
        if (intent == null) return null;
        String u = intent.getStringExtra("mbUpdateUrl");
        if (u == null) return null;
        Uri p = Uri.parse(u);
        return "10.0.2.2".equals(p.getHost()) ? u : null;
    }
}

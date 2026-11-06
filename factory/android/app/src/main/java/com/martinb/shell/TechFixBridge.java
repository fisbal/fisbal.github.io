package com.martinb.shell;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.app.admin.DevicePolicyManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.os.StatFs;
import android.os.SystemClock;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * TechFix-only native bridge on Android (window.TechFixAndroid). Attached by MainActivity ONLY when
 * mb-config.json has diagnostics:true (TechFix) and the page is the app's own offline content, so
 * every other MartinB app is unaffected.
 *
 * Two calls, nothing else:
 *   scan()            real readings an Android app may take without extra permissions: battery
 *                     (level, health, temperature, cycles), free storage, RAM, heat status, OS and
 *                     security-patch age, screen lock, encryption, developer options/USB debugging,
 *                     and which apps hold device-admin or accessibility control (spyware signs).
 *   openSettings(key) opens the exact Settings screen for a fix, from the fixed list below.
 *
 * Android does not let an ordinary app change system settings by itself, so on a phone the
 * "Fix it" button takes the user straight to the right screen instead of running the change.
 */
final class TechFixBridge {
    private final Activity activity;

    TechFixBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String scan() {
        JSONObject r = new JSONObject();
        try {
            Context ctx = activity.getApplicationContext();
            ContentResolver cr = ctx.getContentResolver();
            r.put("supported", true);
            r.put("platform", "android");
            r.put("sdk", Build.VERSION.SDK_INT);
            r.put("release", Build.VERSION.RELEASE);
            r.put("model", Build.MODEL);
            r.put("manufacturer", Build.MANUFACTURER);
            if (Build.VERSION.SDK_INT >= 23) r.put("securityPatch", Build.VERSION.SECURITY_PATCH);
            r.put("uptimeMinutes", SystemClock.elapsedRealtime() / 60000L);

            Intent b = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b != null) {
                JSONObject bat = new JSONObject();
                int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                if (level >= 0 && scale > 0) bat.put("level", Math.round(level * 100f / scale));
                bat.put("status", b.getIntExtra(BatteryManager.EXTRA_STATUS, -1));
                bat.put("health", b.getIntExtra(BatteryManager.EXTRA_HEALTH, -1));
                bat.put("plugged", b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0));
                int temp = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
                if (temp != Integer.MIN_VALUE) bat.put("tempC", temp / 10.0);
                int volt = b.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1);
                if (volt > 0) bat.put("voltageMv", volt);
                int cycles = b.getIntExtra("android.os.extra.CYCLE_COUNT", -1);
                if (cycles >= 0) bat.put("cycles", cycles);
                r.put("battery", bat);
            }

            StatFs st = new StatFs(Environment.getDataDirectory().getPath());
            JSONObject sto = new JSONObject();
            sto.put("totalBytes", st.getTotalBytes());
            sto.put("freeBytes", st.getAvailableBytes());
            r.put("storage", sto);

            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                JSONObject mem = new JSONObject();
                mem.put("totalBytes", mi.totalMem);
                mem.put("availBytes", mi.availMem);
                mem.put("low", mi.lowMemory);
                r.put("memory", mem);
            }

            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                r.put("powerSave", pm.isPowerSaveMode());
                if (Build.VERSION.SDK_INT >= 29) r.put("thermalStatus", pm.getCurrentThermalStatus());
            }

            JSONObject sec = new JSONObject();
            KeyguardManager km = (KeyguardManager) ctx.getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && Build.VERSION.SDK_INT >= 23) sec.put("screenLock", km.isDeviceSecure());
            sec.put("developerOptions", Settings.Global.getInt(cr, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1);
            sec.put("usbDebugging", Settings.Global.getInt(cr, Settings.Global.ADB_ENABLED, 0) == 1);
            DevicePolicyManager dpm = (DevicePolicyManager) ctx.getSystemService(Context.DEVICE_POLICY_SERVICE);
            JSONArray admins = new JSONArray();
            if (dpm != null) {
                sec.put("encryption", dpm.getStorageEncryptionStatus());
                List<ComponentName> list = dpm.getActiveAdmins();
                if (list != null) for (ComponentName c : list) admins.put(label(ctx, c.getPackageName()));
            }
            sec.put("deviceAdmins", admins);
            sec.put("accessibility", packagesFrom(ctx, safeSecure(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)));
            sec.put("notificationListeners", packagesFrom(ctx, safeSecure(cr, "enabled_notification_listeners")));
            r.put("security", sec);
        } catch (Exception e) {
            try { r.put("error", String.valueOf(e)); } catch (Exception ignored) { }
        }
        return r.toString();
    }

    @JavascriptInterface
    public boolean openSettings(String key) {
        final String[] actions = actionsFor(key == null ? "" : key);
        final boolean[] opened = { false };
        final Object lock = new Object();
        activity.runOnUiThread(() -> {
            for (String a : actions) {
                if (tryStart(a)) { opened[0] = true; break; }
            }
            if (!opened[0]) opened[0] = tryStart(Settings.ACTION_SETTINGS);
            synchronized (lock) { lock.notifyAll(); }
        });
        synchronized (lock) {
            try { lock.wait(1500); } catch (InterruptedException ignored) { }
        }
        return opened[0];
    }

    private boolean tryStart(String spec) {
        try {
            Intent i;
            if (spec.startsWith("component:")) {
                String[] p = spec.substring(10).split("/", 2);
                i = new Intent().setComponent(new ComponentName(p[0], p[1]));
            } else {
                i = new Intent(spec);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    // Fixed list of Settings screens (first one that exists on this phone wins).
    private static String[] actionsFor(String key) {
        switch (key) {
            case "wifi": return new String[] { Settings.ACTION_WIFI_SETTINGS };
            case "bluetooth": return new String[] { Settings.ACTION_BLUETOOTH_SETTINGS };
            case "mobile-network": return new String[] { "android.settings.NETWORK_OPERATOR_SETTINGS", Settings.ACTION_WIRELESS_SETTINGS };
            case "airplane": return new String[] { Settings.ACTION_AIRPLANE_MODE_SETTINGS };
            case "data-usage": return new String[] { Settings.ACTION_DATA_USAGE_SETTINGS, Settings.ACTION_WIRELESS_SETTINGS };
            case "vpn": return new String[] { "android.settings.VPN_SETTINGS", Settings.ACTION_WIRELESS_SETTINGS };
            case "battery": return new String[] { Intent.ACTION_POWER_USAGE_SUMMARY, Settings.ACTION_BATTERY_SAVER_SETTINGS };
            case "battery-saver": return new String[] { Settings.ACTION_BATTERY_SAVER_SETTINGS };
            case "battery-optimization": return new String[] { Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS };
            case "storage": return new String[] { Settings.ACTION_INTERNAL_STORAGE_SETTINGS, "android.os.storage.action.MANAGE_STORAGE" };
            case "apps": return new String[] { Settings.ACTION_APPLICATION_SETTINGS };
            case "default-apps": return new String[] { Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, Settings.ACTION_APPLICATION_SETTINGS };
            case "overlay": return new String[] { Settings.ACTION_MANAGE_OVERLAY_PERMISSION };
            case "unknown-sources": return new String[] { Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Settings.ACTION_SECURITY_SETTINGS };
            case "accessibility": return new String[] { Settings.ACTION_ACCESSIBILITY_SETTINGS };
            case "notification-access": return new String[] { Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS };
            case "notifications": return new String[] { "android.settings.ALL_APPS_NOTIFICATION_SETTINGS", "android.settings.NOTIFICATION_SETTINGS", Settings.ACTION_APPLICATION_SETTINGS };
            case "device-admin": return new String[] { "android.settings.DEVICE_ADMIN_SETTINGS", Settings.ACTION_SECURITY_SETTINGS };
            case "security": return new String[] { Settings.ACTION_SECURITY_SETTINGS };
            case "privacy": return new String[] { Settings.ACTION_PRIVACY_SETTINGS, Settings.ACTION_SECURITY_SETTINGS };
            case "play-protect": return new String[] { "component:com.google.android.gms/com.google.android.gms.security.settings.VerifyAppsSettingsActivity", Settings.ACTION_SECURITY_SETTINGS };
            case "accounts": return new String[] { Settings.ACTION_SYNC_SETTINGS };
            case "date": return new String[] { Settings.ACTION_DATE_SETTINGS };
            case "system-update": return new String[] { "android.settings.SYSTEM_UPDATE_SETTINGS", Settings.ACTION_DEVICE_INFO_SETTINGS };
            case "about": return new String[] { Settings.ACTION_DEVICE_INFO_SETTINGS };
            case "developer": return new String[] { Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS };
            case "display": return new String[] { Settings.ACTION_DISPLAY_SETTINGS };
            case "sound": return new String[] { Settings.ACTION_SOUND_SETTINGS };
            case "location": return new String[] { Settings.ACTION_LOCATION_SOURCE_SETTINGS };
            case "nfc": return new String[] { Settings.ACTION_NFC_SETTINGS };
            case "usage-access": return new String[] { Settings.ACTION_USAGE_ACCESS_SETTINGS };
            default: return new String[] { Settings.ACTION_SETTINGS };
        }
    }

    private static String safeSecure(ContentResolver cr, String key) {
        try { return Settings.Secure.getString(cr, key); } catch (Exception e) { return null; }
    }

    private static JSONArray packagesFrom(Context ctx, String components) {
        Set<String> pkgs = new LinkedHashSet<>();
        if (components != null) {
            for (String c : components.split(":")) {
                String p = c.trim();
                int slash = p.indexOf('/');
                if (slash > 0) p = p.substring(0, slash);
                if (!p.isEmpty()) pkgs.add(p);
            }
        }
        JSONArray out = new JSONArray();
        for (String p : pkgs) out.put(label(ctx, p));
        return out;
    }

    private static String label(Context ctx, String pkg) {
        try {
            PackageManager pm = ctx.getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            CharSequence l = pm.getApplicationLabel(ai);
            return l + " (" + pkg + ")";
        } catch (Exception e) {
            return pkg;
        }
    }
}

/* ===================== TechFix — "Connect a device" in a browser tab =====================
   Chrome / Edge on Windows, macOS, Linux, ChromeOS or Android: the web page talks to a phone on a
   USB cable through WebUSB (vendor/webadb.js, Tango ADB, MIT). Same operations and the same result
   codes as the desktop app (factory/electron/connect.js), so connect-ui.js renders both alike.
   Only loaded when TechFix runs as a web page; the installed apps use their native bridge. */
"use strict";

const TFWeb = (() => {
// ---- same phone read-out as the desktop app (copied from connect.js) ----
const SCAN_SH = [
  "getprop",
  "echo @@TF:battery", "dumpsys battery",
  "echo @@TF:df", "df -k /data",
  "echo @@TF:mem", "cat /proc/meminfo",
  "echo @@TF:uptime", "cat /proc/uptime",
  "echo @@TF:thermal", "dumpsys thermalservice 2>/dev/null | grep -i 'Thermal Status' | head -1",
  "echo @@TF:lowpower", "settings get global low_power",
  "echo @@TF:acc", "settings get secure enabled_accessibility_services",
  "echo @@TF:nl", "settings get secure enabled_notification_listeners",
  "echo @@TF:admins", "dumpsys device_policy 2>/dev/null | grep -o 'ComponentInfo{[^}]*}' | sort -u",
  "echo @@TF:pkgs", "pm list packages -3 | wc -l",
  "echo @@TF:disk", "dumpsys diskstats",
  "echo @@TF:crashapps", "logcat -d -b crash 2>/dev/null | grep 'Process: ' | sed 's/.*Process: //;s/,.*//' | sort | uniq -c | sort -rn | head -5",
  "echo @@TF:cycles", "cat /sys/class/power_supply/battery/cycle_count 2>/dev/null",
  "echo @@TF:memtop", "dumpsys meminfo 2>/dev/null | grep -m1 -A12 -E 'Total (PSS|RSS) by process'",
  "echo @@TF:end"
].join("; ");

function sections(text) {
  const out = { props: "" };
  let cur = "props";
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^@@TF:(\w+)/.exec(line);
    if (m) { cur = m[1]; out[cur] = ""; continue; }
    out[cur] = (out[cur] || "") + line + "\n";
  }
  return out;
}
const num = (re, s) => { const m = re.exec(s || ""); return m ? Number(m[1]) : null; };
const pkgList = (s) => [...new Set(String(s || "").trim().split(/[:\n]/).map((x) => x.trim().split("/")[0].replace(/^ComponentInfo\{/, "")).filter((x) => x && x !== "null"))];

function parsePhone(text) {
  const s = sections(text);
  const props = {};
  for (const m of String(s.props).matchAll(/^\[([^\]]+)\]: \[([^\]]*)\]/gm)) props[m[1]] = m[2];
  const bat = s.battery || "";
  const plugged = /(AC|USB|Wireless|Dock) powered: true/i.test(bat) ? 1 : 0;
  const t = num(/temperature: (-?\d+)/, bat);
  const battery = { level: num(/level: (\d+)/, bat), tempC: t == null ? null : t / 10, health: num(/health: (\d+)/, bat), plugged, status: num(/status: (\d+)/, bat) };
  const cyc = num(/^(\d+)/m, s.cycles);
  if (cyc != null) battery.cycles = cyc;
  // df -k /data → last line: fs  total  used  avail  use%  mount
  let storage = {};
  const dfl = String(s.df || "").trim().split(/\r?\n/).filter((l) => /\d/.test(l)).pop() || "";
  const nums = dfl.split(/\s+/).filter((x) => /^\d+$/.test(x)).map(Number);
  if (nums.length >= 3) storage = { totalBytes: nums[0] * 1024, freeBytes: nums[2] * 1024 };
  const mt = num(/MemTotal:\s+(\d+)/, s.mem), ma = num(/MemAvailable:\s+(\d+)/, s.mem);
  const memory = mt ? { totalBytes: mt * 1024, availBytes: (ma || 0) * 1024, low: ma != null && ma / mt < 0.08 } : {};
  const disk = s.disk || "";
  const dsz = (k) => num(new RegExp("^" + k + ": (\\d+)", "m"), disk);
  const breakdown = { apps: dsz("App Size"), appData: dsz("App Data Size"), caches: dsz("App Cache Size") ?? dsz("Cache Size"),
                      photos: dsz("Photos Size"), videos: dsz("Videos Size"), audio: dsz("Audio Size"), downloads: dsz("Downloads Size"),
                      system: dsz("System Size"), other: dsz("Other Size") };
  // Biggest memory users (first "Total PSS/RSS by process" list of dumpsys meminfo).
  const memTop = String(s.memtop || "").split(/\r?\n/).map((l) => /^\s*([\d,]+)K: ([\w.:\-]+) \(pid/.exec(l)).filter(Boolean)
    .map((m) => ({ app: m[2], bytes: Number(m[1].replace(/,/g, "")) * 1024 })).filter((x) => !/^(system|surfaceflinger|com\.android\.systemui)$/.test(x.app)).slice(0, 6);
  const crashApps = String(s.crashapps || "").trim().split(/\r?\n/).map((l) => /^\s*(\d+)\s+(\S+)/.exec(l)).filter(Boolean).map((m) => ({ app: m[2], count: Number(m[1]) }));
  return {
    source: "adb",
    manufacturer: props["ro.product.manufacturer"] || "", brand: props["ro.product.brand"] || "", model: props["ro.product.model"] || "",
    device: props["ro.product.device"] || "", release: props["ro.build.version.release"] || "", sdk: Number(props["ro.build.version.sdk"]) || null,
    securityPatch: props["ro.build.version.security_patch"] || "", build: props["ro.build.display.id"] || "",
    bootloaderLocked: props["ro.boot.flash.locked"] === "1" ? true : props["ro.boot.flash.locked"] === "0" ? false : null,
    storage, memory, battery,
    thermalStatus: num(/Thermal Status:\s*(\d+)/i, s.thermal),
    powerSave: String(s.lowpower || "").trim() === "1",
    uptimeMinutes: Math.round((num(/^([\d.]+)/, s.uptime) || 0) / 60),
    apps3p: num(/(\d+)/, s.pkgs),
    breakdown, crashApps, memTop,
    security: {
      // USB debugging is on by definition here — the page reminds the user to turn it off when done.
      usbDebugging: false, developerOptions: false,
      accessibility: pkgList(s.acc), notificationListeners: pkgList(s.nl), deviceAdmins: pkgList(s.admins),
      encryption: props["ro.crypto.state"] === "unencrypted" ? 1 : 3
    }
  };
}


// --------------------------------------------------------------------------
  const PKG_RE = /^[A-Za-z][\w]*(\.[\w]+)+$/;
  const V = (state, code, params, extra) => Object.assign({ state, code, params: params || {} }, extra || {});
  const A = () => window.TFWebAdb;
  const sh = (cmd) => A().shell(cmd);
  const SETTINGS_INTENT = {
    wifi: "android.settings.WIFI_SETTINGS", bluetooth: "android.settings.BLUETOOTH_SETTINGS", battery: "android.intent.action.POWER_USAGE_SUMMARY",
    "battery-saver": "android.settings.BATTERY_SAVER_SETTINGS", storage: "android.settings.INTERNAL_STORAGE_SETTINGS", apps: "android.settings.APPLICATION_SETTINGS",
    accessibility: "android.settings.ACCESSIBILITY_SETTINGS", "notification-access": "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS",
    "device-admin": "android.settings.DEVICE_ADMIN_SETTINGS", security: "android.settings.SECURITY_SETTINGS", "system-update": "android.settings.SYSTEM_UPDATE_SETTINGS",
    about: "android.settings.DEVICE_INFO_SETTINGS", developer: "android.settings.APPLICATION_DEVELOPMENT_SETTINGS", display: "android.settings.DISPLAY_SETTINGS",
    date: "android.settings.DATE_SETTINGS", accounts: "android.settings.SYNC_SETTINGS", settings: "android.settings.SETTINGS"
  };
  let pickedFiles = [];
  const save = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };
  const dataFree = async () => { const l = String(await sh("df -k /data")).trim().split(/\r?\n/).filter((x) => /\d/.test(x)).pop() || ""; const n = l.split(/\s+/).filter((x) => /^\d+$/.test(x)).map(Number); return n.length >= 3 ? n[2] * 1024 : null; };
  const memAvail = async () => { const v = num(/MemAvailable:\s+(\d+)/, await sh("cat /proc/meminfo")); return v == null ? null : v * 1024; };
  const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "h");

  function installCode(msg) {
    const t = String(msg || ""), m = /(INSTALL_[A-Z_]+)/.exec(t), k = m ? m[1] : "";
    if (/UPDATE_INCOMPATIBLE|SIGNATURES|INCONSISTENT_CERTIFICATES/.test(k)) return "inst_signature";
    if (/VERSION_DOWNGRADE/.test(k)) return "inst_downgrade";
    if (/INSUFFICIENT_STORAGE/.test(k)) return "inst_storage";
    if (/USER_RESTRICTED|ABORTED/.test(k)) return "inst_restricted";
    if (/OLDER_SDK/.test(k)) return "inst_older_sdk";
    if (/NO_MATCHING_ABIS/.test(k)) return "inst_abi";
    if (/PARSE|INVALID_APK|NO_CERTIFICATES/.test(k)) return "inst_invalid";
    return "inst_failed";
  }

  const ACTIONS = {
    "trim-caches": async () => {
      const before = await dataFree(); await sh("pm trim-caches 1000000000000000"); const after = await dataFree();
      if (before == null || after == null) return V("ok", "ph_caches_done");
      const freed = Math.max(0, after - before);
      return V(freed > 1048576 ? "fixed" : "ok", freed > 1048576 ? "ph_caches_freed" : "ph_caches_none", { freed, free: after });
    },
    "kill-background": async () => {
      const before = await memAvail(); await sh("am kill-all"); await new Promise((r) => setTimeout(r, 1500)); const after = await memAvail();
      const gained = before != null && after != null ? Math.max(0, after - before) : 0;
      return V(gained > 20 * 1048576 ? "fixed" : "ok", gained > 20 * 1048576 ? "ph_mem_freed" : "ph_mem_none", { freed: gained, avail: after || 0 });
    },
    "screenshot": async () => {
      const bytes = await A().shellBytes("screencap -p");
      if (!bytes || bytes.length < 100 || bytes[0] !== 0x89) return V("failed", "ph_failed");
      save(new Blob([bytes], { type: "image/png" }), `${A().state.model || "Phone"} ${stamp()}.png`);
      return V("fixed", "ph_screenshot_web");
    },
    "crash-log": async () => {
      const text = String(await sh("logcat -d -b crash -b main -b system *:E")).split(/\r?\n/).slice(-4000).join("\n");
      return V(text.trim() ? "fixed" : "ok", text.trim() ? "ph_log_ready" : "ph_log_empty", {}, { text });
    },
    "open-settings": async (args) => {
      const action = SETTINGS_INTENT[String((args && args.key) || "settings")] || SETTINGS_INTENT.settings;
      const out = await sh(`am start -a ${action}`);
      if (/Error|Exception/i.test(out)) await sh(`am start -a ${SETTINGS_INTENT.settings}`);
      return V("opened", "ph_opened_on_phone");
    },
    "install-apk-files": async () => {
      const files = pickedFiles; pickedFiles = [];
      if (!files.length) return V("cancelled", "cancelled");
      const lines = []; let ok = 0;
      for (const f of files.slice(0, 30)) {
        try { await A().install(f); ok++; lines.push({ name: f.name, code: "ph_app_installed_line" }); }
        catch (e) { const msg = String((e && e.message) || e); lines.push({ name: f.name, code: installCode(msg), detail: msg.slice(-200) }); }
      }
      return V(ok === lines.length ? "fixed" : ok ? "partial" : "failed", "ph_apks_done", { ok, n: lines.length }, { lines });
    },
    "push-files": async () => {
      const files = pickedFiles; pickedFiles = [];
      if (!files.length) return V("cancelled", "cancelled");
      const total = files.reduce((a, f) => a + f.size, 0), free = await dataFree();
      if (free != null && free < total + 200 * 1048576) return V("failed", "ph_push_nospace", { size: total, free });
      const lines = []; let ok = 0, done = 0;
      for (const f of files) {
        try { await A().push(f, "/sdcard/Download/" + f.name.replace(/[\\/:*?"<>|]/g, "_")); ok++; done += f.size; }
        catch (e) { lines.push({ name: f.name, code: "ph_push_failed_line", detail: String((e && e.message) || e).slice(-200) }); }
      }
      await sh("am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/ >/dev/null 2>&1; cmd media_provider scan /sdcard/Download >/dev/null 2>&1");
      return V(ok === files.length ? "fixed" : ok ? "partial" : "failed", "ph_push_done", { ok, n: files.length, size: done }, { lines });
    },
    "app-save": async (args) => {
      const pkg = String((args && args.pkg) || ""); if (!PKG_RE.test(pkg)) return V("failed", "ph_unknown");
      const paths = String(await sh("pm path " + pkg)).split(/\r?\n/).map((l) => l.replace(/^package:/, "").trim()).filter((p) => /\.apk$/.test(p));
      if (!paths.length) return V("failed", "app_save_failed", { app: pkg });
      for (const p of paths) { const blob = await A().pull(p); const base = p.split("/").pop(); save(blob, base === "base.apk" ? pkg + ".apk" : pkg + "-" + base); }
      return V("fixed", "app_saved_web", { app: pkg, n: paths.length });
    },
    "app-uninstall": async (args) => {
      const pkg = String((args && args.pkg) || ""); if (!PKG_RE.test(pkg)) return V("failed", "ph_unknown");
      const out = await sh("pm uninstall " + pkg);
      if (/Success/.test(out)) return V("fixed", "app_uninstalled", { app: pkg });
      if (/DEVICE_POLICY_MANAGER/.test(out)) { await sh("am start -a " + SETTINGS_INTENT["device-admin"]); return V("opened", "app_admin_first", { app: pkg }); }
      return V("failed", "app_uninstall_failed", { app: pkg, detail: out.trim().slice(-200) });
    },
    "apps-remove": async (args) => {
      const pkgs = (Array.isArray(args && args.pkgs) ? args.pkgs : []).map(String).filter((p) => PKG_RE.test(p)).slice(0, 80);
      if (!pkgs.length) return V("failed", "ph_unknown");
      const lines = []; let ok = 0, admin = 0;
      for (const pkg of pkgs) {
        const out = await sh("pm uninstall " + pkg);
        if (/Success/.test(out)) { ok++; lines.push({ name: pkg, code: "app_removed_line" }); }
        else if (/DEVICE_POLICY_MANAGER/.test(out)) { admin++; lines.push({ name: pkg, code: "app_admin_line" }); }
        else lines.push({ name: pkg, code: "app_remove_failed_line", detail: out.trim().slice(-120) });
      }
      if (admin) await sh("am start -a " + SETTINGS_INTENT["device-admin"]);
      return V(ok === pkgs.length ? "fixed" : ok ? "partial" : "failed", admin ? "apps_removed_admin" : "apps_removed", { ok, n: pkgs.length }, { lines });
    },
    "app-quiet": async (args) => {
      const pkg = String((args && args.pkg) || ""); if (!PKG_RE.test(pkg)) return V("failed", "ph_unknown");
      await sh(QUIET_SH(pkg));
      const g = await sh("appops get " + pkg + " SYSTEM_ALERT_WINDOW");
      return /deny|ignore|No operations/i.test(g) ? V("fixed", "app_quieted", { app: pkg }) : V("failed", "app_quiet_failed", { app: pkg, detail: g.trim().slice(-160) });
    },
    "protect-on": async () => {
      await sh("settings put global package_verifier_enable 1; settings put global verifier_verify_adb_installs 1");
      const out = await sh("am start -n com.google.android.gms/.security.settings.VerifyAppsSettingsActivity");
      if (/Error|Exception/i.test(out)) await sh("am start -a " + SETTINGS_INTENT.security);
      return V("opened", "protect_opened");
    },
    "app-disable": async (args) => {
      const pkg = String((args && args.pkg) || ""); if (!PKG_RE.test(pkg)) return V("failed", "ph_unknown");
      const out = await sh("pm disable-user --user 0 " + pkg);
      return /disabled/i.test(out) ? V("fixed", "app_disabled", { app: pkg }) : V("failed", "app_toggle_failed", { app: pkg, detail: out.trim().slice(-200) });
    },
    "app-enable": async (args) => {
      const pkg = String((args && args.pkg) || ""); if (!PKG_RE.test(pkg)) return V("failed", "ph_unknown");
      const out = await sh("pm enable --user 0 " + pkg);
      return /enabled/i.test(out) ? V("fixed", "app_enabled", { app: pkg }) : V("failed", "app_toggle_failed", { app: pkg, detail: out.trim().slice(-200) });
    },
    "app-stop": async (args) => {
      const pkg = String((args && args.pkg) || ""); if (!PKG_RE.test(pkg)) return V("failed", "ph_unknown");
      const before = await memAvail(); await sh("am force-stop " + pkg); await new Promise((r) => setTimeout(r, 1200)); const after = await memAvail();
      return V("fixed", "app_stopped", { app: pkg, freed: before != null && after != null ? Math.max(0, after - before) : 0 });
    },
    "app-open": async (args) => {
      const pkg = String((args && args.pkg) || ""); if (!PKG_RE.test(pkg)) return V("failed", "ph_unknown");
      const out = await sh("monkey -p " + pkg + " -c android.intent.category.LAUNCHER 1");
      return /No activities found|aborted/i.test(out) ? V("failed", "app_no_screen", { app: pkg }) : V("opened", "ph_opened_on_phone");
    },
    "play-store": async (args) => {
      const q = String((args && args.q) || "").trim(); if (!q) return V("failed", "ph_unknown");
      const uri = PKG_RE.test(q) ? "market://details?id=" + q : "market://search?q=" + encodeURIComponent(q.replace(/[^\p{L}\p{N} .+\-]/gu, " ").slice(0, 80)).replace(/'/g, "");
      await sh("am start -a android.intent.action.VIEW -d '" + uri + "'");
      return V("opened", "app_store_opened");
    },
    "reboot": async () => { A().reboot().catch(() => {}); return V("started", "ph_rebooting"); },
    "reboot-recovery": async () => { A().reboot("recovery").catch(() => {}); return V("started", "ph_to_recovery"); },
    "reboot-bootloader": async () => { A().reboot("bootloader").catch(() => {}); return V("started", "ph_to_bootloader"); }
  };

  // Same raw read-out as the installed app (factory/electron/connect.js THREAT_SH); techfix/threats.js classifies it.
  const THREAT_SH = [
    "echo @@TF:sdk", "getprop ro.build.version.sdk",
    "echo @@TF:pkgs", "pm list packages -3 -i",
    "echo @@TF:launch", "cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER 2>/dev/null",
    "echo @@TF:overlay", "appops query-op SYSTEM_ALERT_WINDOW allow 2>/dev/null",
    "echo @@TF:acc", "settings get secure enabled_accessibility_services",
    "echo @@TF:nl", "settings get secure enabled_notification_listeners",
    "echo @@TF:admins", "dumpsys device_policy 2>/dev/null | grep -o 'ComponentInfo{[^}]*}' | sort -u",
    "echo @@TF:times", "dumpsys package packages 2>/dev/null | grep -E '^  Package \\[|firstInstallTime='",
    "echo @@TF:verify", "settings get global package_verifier_enable",
    "echo @@TF:end"
  ].join("; ");
  const QUIET_SH = (pkg) => ["appops set " + pkg + " SYSTEM_ALERT_WINDOW deny", "appops set " + pkg + " RUN_ANY_IN_BACKGROUND ignore", "appops set " + pkg + " RUN_IN_BACKGROUND ignore",
    "pm revoke " + pkg + " android.permission.POST_NOTIFICATIONS", "am force-stop " + pkg].map((c) => c + " 2>/dev/null").join("; ");

  async function appList(system) {
    const [all, sys, dis] = await Promise.all([sh("pm list packages -f --show-versioncode"), sh("pm list packages -s"), sh("pm list packages -d")]);
    const set = (t) => new Set(String(t).split(/\r?\n/).map((l) => l.replace(/^package:/, "").trim()).filter(Boolean));
    const sysSet = set(sys), disSet = set(dis), apps = [];
    for (const line of String(all).split(/\r?\n/)) {
      const m = /^package:(.+)=([\w.]+)\s+versionCode:(\d+)/.exec(line.trim());
      if (!m || !PKG_RE.test(m[2])) continue;
      const isSys = sysSet.has(m[2]);
      if (isSys && !system) continue;
      apps.push({ pkg: m[2], code: Number(m[3]), system: isSys, disabled: disSet.has(m[2]) });
    }
    apps.sort((a, b) => a.pkg.localeCompare(b.pkg));
    return { apps };
  }

  async function call(op, p) {
    p = p || {};
    const st = A().state;
    try {
      if (op === "status") {
        // A phone allowed before reconnects by itself (in the background: it may wait for "Allow").
        if (!st.adb && !st.state) A().reconnect().catch(() => {});
        const devices = st.state ? [{ serial: st.serial || "USB", state: st.state, model: st.model }] : [];
        return { supported: true, web: true, adb: true, devices, fastbootDevices: [], usb: [], drives: [], error: st.error || "" };
      }
      if (op === "modeAction" && p.id === "retry-auth") { A().disconnect().then(() => A().reconnect()).catch(() => {}); return V("started", "ph_prompt_again"); }
      if (!st.adb) return op === "phoneScan" || op === "appList" || op === "threatScan" ? { error: "not_connected" } : V("failed", "ph_not_connected");
      if (op === "phoneScan") return parsePhone(await sh(SCAN_SH));
      if (op === "appList") return appList(!!p.system);
      if (op === "threatScan") return { raw: await sh(THREAT_SH) };
      if (op === "catalog") return { error: "web" };
      if (op === "modeAction" && p.id === "retry-auth") { A().disconnect().then(() => A().reconnect()).catch(() => {}); return V("started", "ph_prompt_again"); }
      if (op === "phoneAction") { const fn = ACTIONS[String(p.id)]; return fn ? await fn(p.args || {}) : V("failed", "web_not_here"); }
      return V("failed", "web_not_here");
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/not_connected|disconnected|closed/i.test(msg)) return V("failed", "ph_not_connected");
      return V("failed", "ph_failed", { detail: msg.slice(-200) });
    }
  }

  // Files must be chosen right after the click (browsers only open the file picker then).
  function pick(accept, multiple) {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.multiple = !!multiple; if (accept) inp.accept = accept;
      inp.style.display = "none";
      inp.addEventListener("change", () => { pickedFiles = [...(inp.files || [])]; inp.remove(); resolve(pickedFiles.length); });
      inp.addEventListener("cancel", () => { inp.remove(); resolve(0); });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  return { call, pick, ACTIONS };
})();

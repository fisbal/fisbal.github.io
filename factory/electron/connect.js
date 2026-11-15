// TechFix — "Connect a device".
//
// Lets the Windows/Mac app reach OTHER devices, not only the PC it runs on:
//   • An Android phone or tablet on a USB cable (or Wi-Fi pairing) through Google's official
//     ADB tools: a real health read-out (same shape as the Android app's own scan, so the page
//     reuses the same findings), real repairs with a before/after measure (app caches, memory),
//     photo copy, screenshot, crash log → log analyzer, install TechFix on the phone, and the
//     Recovery / bootloader (Fastboot) restarts.
//   • A phone that is plugged in but not reachable yet: Windows' own device list tells us if it
//     is an iPhone, an Android phone without USB debugging, or a phone whose driver is missing.
//   • Another computer: Quick Assist (remote help), TechFix put on a USB key (installer + APK,
//     which then update themselves), and the Windows recovery-drive tool for a PC that won't start.
//
// Safety: the page only sends an action id from the fixed tables below plus a device serial that
// must match a device ADB itself just listed. No command text ever comes from the page.

const { app, net, shell, dialog } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";
let CFG = {};

function init(cfg) { CFG = cfg || {}; }

// ------------------------------------------------------------------------------------------
// Plumbing
// ------------------------------------------------------------------------------------------
function baseDir() {
  const root = WIN ? (process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"))
                   : path.join(os.homedir(), "Library", "Application Support");
  const d = path.join(root, "TechFix");
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
  return d;
}
const EXE = (n) => n + (WIN ? ".exe" : "");

function run(file, args, opt) {
  opt = opt || {};
  return new Promise((resolve) => {
    execFile(file, args, {
      timeout: opt.timeout || 30000, maxBuffer: 256 * 1024 * 1024, windowsHide: true,
      encoding: opt.binary ? "buffer" : "utf8", cwd: opt.cwd
    }, (err, out, errOut) => {
      resolve({
        code: err ? (typeof err.code === "number" ? err.code : 1) : 0,
        out: out || (opt.binary ? Buffer.alloc(0) : ""),
        err: String(errOut || "") + (err && !errOut ? String(err.message || err) : ""),
        timedOut: !!(err && err.killed)
      });
    });
  });
}

function ps(script, timeoutMs) {
  if (!WIN) return Promise.resolve({ code: 1, out: "", err: "not Windows" });
  const enc = Buffer.from("$ProgressPreference='SilentlyContinue';$ErrorActionPreference='SilentlyContinue';" + script, "utf16le").toString("base64");
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { timeout: timeoutMs || 30000 });
}

function jsonOf(text, fallback) {
  try { const v = JSON.parse(String(text || "").trim() || "null"); return v == null ? fallback : v; } catch (_) { return fallback; }
}

function freeBytes(dir) {
  try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch (_) { return null; }
}

// Streams a download to a file, reporting progress. Returns { ok, bytes, error }.
async function download(url, dest, onProgress, label) {
  try {
    const res = await net.fetch(url, { cache: "no-store" });
    if (!res.ok || !res.body) return { ok: false, error: "HTTP " + res.status };
    const total = Number(res.headers.get("content-length")) || 0;
    const tmp = dest + ".part";
    const out = fs.createWriteStream(tmp);
    const reader = res.body.getReader();
    let done = 0, last = 0;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once("drain", r));
      done += value.length;
      if (onProgress && Date.now() - last > 250) { last = Date.now(); onProgress({ phase: "download", label, done, total }); }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    if (total && done !== total) { try { fs.unlinkSync(tmp); } catch (_) {} return { ok: false, error: "incomplete download" }; }
    try { fs.unlinkSync(dest); } catch (_) {}
    fs.renameSync(tmp, dest);
    if (onProgress) onProgress({ phase: "download", label, done, total: total || done });
    return { ok: true, bytes: done };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// What the app's own release offers (installer, dmg, apk) — the same update.json the updater reads.
async function releaseInfo() {
  const feed = process.env.MB_UPDATE_URL || CFG.update || "";
  if (!feed) return null;
  try {
    const res = await net.fetch(feed + (feed.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch (_) { return null; }
}

// ------------------------------------------------------------------------------------------
// ADB / Fastboot location and install
// ------------------------------------------------------------------------------------------
function adbDirs() {
  const list = [path.join(baseDir(), "platform-tools")];
  for (const v of ["ANDROID_HOME", "ANDROID_SDK_ROOT"]) if (process.env[v]) list.push(path.join(process.env[v], "platform-tools"));
  if (WIN) list.push(path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools"));
  if (MAC) list.push(path.join(os.homedir(), "Library", "Android", "sdk", "platform-tools"), "/opt/homebrew/bin", "/usr/local/bin");
  return list;
}
function findTool(name) {
  for (const d of adbDirs()) {
    const f = path.join(d, EXE(name));
    try { if (fs.statSync(f).isFile()) return f; } catch (_) {}
  }
  return null;
}
const adbPath = () => findTool("adb");
const fastbootPath = () => findTool("fastboot");

async function installAdb(onProgress) {
  const plat = WIN ? "windows" : MAC ? "darwin" : "linux";
  const url = `https://dl.google.com/android/repository/platform-tools-latest-${plat}.zip`;
  const zip = path.join(baseDir(), "platform-tools.zip");
  const dl = await download(url, zip, onProgress, "Android platform-tools");
  if (!dl.ok) return { ok: false, code: "adb_download_failed", error: dl.error };
  onProgress && onProgress({ phase: "extract" });
  const dest = baseDir();
  try { fs.rmSync(path.join(dest, "platform-tools"), { recursive: true, force: true }); } catch (_) {}
  const r = WIN
    ? await ps(`Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force; if(Test-Path '${path.join(dest, "platform-tools", "adb.exe").replace(/'/g, "''")}'){'OK'}`, 120000)
    : await run("/usr/bin/ditto", ["-x", "-k", zip, dest], { timeout: 120000 });
  try { fs.unlinkSync(zip); } catch (_) {}
  const adb = adbPath();
  if (!adb) return { ok: false, code: "adb_extract_failed", error: (r.err || "").slice(-300) };
  if (!WIN) { try { fs.chmodSync(adb, 0o755); const fb = fastbootPath(); if (fb) fs.chmodSync(fb, 0o755); } catch (_) {} }
  await run(adb, ["start-server"], { timeout: 20000 });
  return { ok: true, adb };
}

// ------------------------------------------------------------------------------------------
// Device discovery
// ------------------------------------------------------------------------------------------
const SERIAL_RE = /^[A-Za-z0-9._:\-]{1,80}$/;

async function adbDevices() {
  const adb = adbPath();
  if (!adb) return null;
  const r = await run(adb, ["devices", "-l"], { timeout: 20000 });
  const list = [];
  for (const line of String(r.out).split(/\r?\n/).slice(1)) {
    const p = line.trim().split(/\s+/);
    if (p.length < 2 || !SERIAL_RE.test(p[0])) continue;
    const d = { serial: p[0], state: p[1], wireless: /:\d+$/.test(p[0]) || p[0].includes("._adb-tls-") };
    for (const kv of p.slice(2)) { const i = kv.indexOf(":"); if (i > 0) d[kv.slice(0, i)] = kv.slice(i + 1).replace(/_/g, " "); }
    list.push(d);
  }
  return list;
}

async function fastbootDevices() {
  const fb = fastbootPath();
  if (!fb) return [];
  const r = await run(fb, ["devices"], { timeout: 8000 });
  return String(r.out).split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 2 && SERIAL_RE.test(p[0]))
    .map((p) => ({ serial: p[0], state: "fastboot" }));
}

// Windows' own view of what is plugged in: tells "iPhone", "Android without USB debugging" and
// "driver missing" apart even before ADB can see anything.
async function usbPhones() {
  if (!WIN) return [];
  const r = await ps(`$d = Get-PnpDevice -PresentOnly | Where-Object {
      ($_.InstanceId -match '^(USB|SWD\\\\WPDBUSENUM)') -and (
        $_.Class -in 'WPD','AndroidUsbDeviceClass','Image' -or
        $_.FriendlyName -match 'Android|ADB|Fastboot|Bootloader|Apple|iPhone|iPad|MTP|Galaxy|Pixel|Xiaomi|Redmi|Motorola|moto |OnePlus|Huawei|Oppo|Vivo|Nokia|Sony|LG ' -or
        ($_.Status -eq 'Error' -and $_.InstanceId -match '^USB'))
    } | Select-Object FriendlyName,Status,Class,InstanceId,Problem
    @($d) | ConvertTo-Json -Compress`, 25000);
  const raw = jsonOf(r.out, []);
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const x of arr) {
    if (!x || !x.InstanceId) continue;
    const id = String(x.InstanceId), name = String(x.FriendlyName || ""), cls = String(x.Class || "");
    let kind = "other";
    if (/VID_05AC/i.test(id) || /apple|iphone|ipad/i.test(name)) kind = "apple";
    else if (/fastboot|bootloader/i.test(name)) kind = "fastboot";
    else if (cls === "AndroidUsbDeviceClass" || /\badb\b/i.test(name)) kind = "adb";
    else if (cls === "WPD" || /mtp/i.test(name)) kind = "mtp";
    else if (cls === "Image") kind = "ptp";
    const problem = String(x.Status || "") !== "OK";
    if (kind === "other" && !problem) continue;
    if (kind === "ptp" && !/android|galaxy|pixel|phone|apple|iphone/i.test(name)) continue;
    out.push({ name, kind, problem, status: x.Status || "", cls });
  }
  return out;
}

function removableDrives() {
  if (WIN) {
    return ps(`@(Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } |
      Select-Object @{n='letter';e={[string]$_.DriveLetter}},@{n='label';e={$_.FileSystemLabel}},@{n='size';e={$_.Size}},@{n='free';e={$_.SizeRemaining}},@{n='fs';e={$_.FileSystem}}) | ConvertTo-Json -Compress`, 20000)
      .then((r) => {
        const v = jsonOf(r.out, []);
        return (Array.isArray(v) ? v : [v]).filter((d) => d && /^[A-Z]$/.test(d.letter))
          .map((d) => ({ id: d.letter, root: d.letter + ":\\", label: d.label || "", size: d.size || 0, free: d.free || 0, fs: d.fs || "" }));
      });
  }
  if (MAC) {
    const out = [];
    try {
      for (const n of fs.readdirSync("/Volumes")) {
        const root = path.join("/Volumes", n);
        try { if (fs.realpathSync(root) === "/") continue; const s = fs.statfsSync(root); out.push({ id: n, root, label: n, size: s.blocks * s.bsize, free: s.bavail * s.bsize }); } catch (_) {}
      }
    } catch (_) {}
    return Promise.resolve(out);
  }
  return Promise.resolve([]);
}

async function status() {
  const adb = adbPath();
  if (adb) await run(adb, ["start-server"], { timeout: 20000 });
  const [devices, fastboot, drives] = await Promise.all([adbDevices(), fastbootDevices(), removableDrives()]);
  // Windows' device list is only needed to explain a phone ADB can't see yet.
  const usb = (devices || []).some((d) => d.state === "device") ? [] : await usbPhones();
  return { supported: true, platform: process.platform, adb: !!adb, fastboot: !!fastbootPath(), devices: devices || [], fastbootDevices: fastboot, usb, drives };
}

async function requireDevice(serial, states) {
  if (!SERIAL_RE.test(String(serial || ""))) return null;
  const list = (await adbDevices()) || [];
  const d = list.find((x) => x.serial === serial);
  if (!d || (states && !states.includes(d.state))) return null;
  return d;
}

// ------------------------------------------------------------------------------------------
// Phone health read-out — the same shape as the Android app's TechFixAndroid.scan()
// ------------------------------------------------------------------------------------------
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
    breakdown, crashApps,
    security: {
      // USB debugging is on by definition here — the page reminds the user to turn it off when done.
      usbDebugging: false, developerOptions: false,
      accessibility: pkgList(s.acc), notificationListeners: pkgList(s.nl), deviceAdmins: pkgList(s.admins),
      encryption: props["ro.crypto.state"] === "unencrypted" ? 1 : 3
    }
  };
}

async function phoneScan(serial) {
  const d = await requireDevice(serial, ["device"]);
  if (!d) return { error: "not_connected" };
  const r = await run(adbPath(), ["-s", serial, "shell", SCAN_SH], { timeout: 60000 });
  if (r.code !== 0 && !r.out) return { error: (r.err || "scan failed").slice(-300) };
  return parsePhone(r.out);
}

// ------------------------------------------------------------------------------------------
// Phone actions — each returns a verdict in the same vocabulary as the PC repairs
// ------------------------------------------------------------------------------------------
const SETTINGS_INTENT = {
  wifi: "android.settings.WIFI_SETTINGS", bluetooth: "android.settings.BLUETOOTH_SETTINGS", battery: "android.intent.action.POWER_USAGE_SUMMARY",
  "battery-saver": "android.settings.BATTERY_SAVER_SETTINGS", storage: "android.settings.INTERNAL_STORAGE_SETTINGS", apps: "android.settings.APPLICATION_SETTINGS",
  accessibility: "android.settings.ACCESSIBILITY_SETTINGS", "notification-access": "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS",
  "device-admin": "android.settings.DEVICE_ADMIN_SETTINGS", security: "android.settings.SECURITY_SETTINGS", "system-update": "android.settings.SYSTEM_UPDATE_SETTINGS",
  about: "android.settings.DEVICE_INFO_SETTINGS", developer: "android.settings.APPLICATION_DEVELOPMENT_SETTINGS", display: "android.settings.DISPLAY_SETTINGS",
  date: "android.settings.DATE_SETTINGS", accounts: "android.settings.SYNC_SETTINGS", settings: "android.settings.SETTINGS"
};

const V = (state, code, params, extra) => Object.assign({ state, code, params: params || {} }, extra || {});
const shell1 = (serial, cmd, timeout) => run(adbPath(), ["-s", serial, "shell", cmd], { timeout: timeout || 30000 });

async function dataFree(serial) {
  const r = await shell1(serial, "df -k /data");
  const l = String(r.out).trim().split(/\r?\n/).filter((x) => /\d/.test(x)).pop() || "";
  const n = l.split(/\s+/).filter((x) => /^\d+$/.test(x)).map(Number);
  return n.length >= 3 ? n[2] * 1024 : null;
}
async function memAvail(serial) {
  const r = await shell1(serial, "cat /proc/meminfo");
  const v = num(/MemAvailable:\s+(\d+)/, r.out);
  return v == null ? null : v * 1024;
}
function stamp() { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`; }
const safeName = (s) => String(s || "Phone").replace(/[^\w .-]+/g, "").trim().slice(0, 40) || "Phone";

const PHONE_ACTIONS = {
  "trim-caches": async (serial) => {
    const before = await dataFree(serial);
    const r = await shell1(serial, "pm trim-caches 1000000000000000", 180000);
    const after = await dataFree(serial);
    if (before == null || after == null) return V(r.code === 0 ? "ok" : "failed", r.code === 0 ? "ph_caches_done" : "ph_failed", { detail: (r.err || r.out).slice(-200) });
    const freed = Math.max(0, after - before);
    return V(freed > 1048576 ? "fixed" : "ok", freed > 1048576 ? "ph_caches_freed" : "ph_caches_none", { freed, free: after });
  },
  "kill-background": async (serial) => {
    const before = await memAvail(serial);
    await shell1(serial, "am kill-all");
    await new Promise((r) => setTimeout(r, 1500));
    const after = await memAvail(serial);
    const gained = before != null && after != null ? Math.max(0, after - before) : 0;
    return V(gained > 20 * 1048576 ? "fixed" : "ok", gained > 20 * 1048576 ? "ph_mem_freed" : "ph_mem_none", { freed: gained, avail: after || 0 });
  },
  "screenshot": async (serial, args, ctx) => {
    const r = await run(adbPath(), ["-s", serial, "exec-out", "screencap", "-p"], { timeout: 30000, binary: true });
    if (r.code !== 0 || !r.out || r.out.length < 100 || r.out.readUInt32BE(0) !== 0x89504e47) return V("failed", "ph_failed", { detail: r.err.slice(-200) });
    const dir = path.join(app.getPath("pictures"), "TechFix");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${safeName(ctx.model)} ${stamp()}.png`);
    fs.writeFileSync(file, r.out);
    shell.showItemInFolder(file);
    return V("fixed", "ph_screenshot", { file });
  },
  "copy-photos": async (serial, args, ctx, onProgress) => {
    const count = await shell1(serial, "find /sdcard/DCIM /sdcard/Pictures -type f 2>/dev/null | wc -l; du -sk /sdcard/DCIM /sdcard/Pictures 2>/dev/null");
    const lines = String(count.out).trim().split(/\r?\n/);
    const files = Number((lines[0] || "").trim()) || 0;
    const bytes = lines.slice(1).reduce((a, l) => a + (Number((l.trim().split(/\s+/)[0]) || 0) * 1024), 0);
    if (!files) return V("ok", "ph_photos_none");
    const pick = await dialog.showOpenDialog({ title: "TechFix", defaultPath: app.getPath("pictures"), properties: ["openDirectory", "createDirectory"] });
    if (pick.canceled || !pick.filePaths[0]) return V("cancelled", "cancelled");
    const dest = path.join(pick.filePaths[0], `${safeName(ctx.model)} ${stamp()}`);
    const free = freeBytes(pick.filePaths[0]);
    if (free != null && free < bytes + 512 * 1048576) return V("failed", "ph_photos_nospace", { size: bytes, free });
    fs.mkdirSync(dest, { recursive: true });
    onProgress && onProgress({ phase: "copy", label: "photos", done: 0, total: bytes });
    const timer = setInterval(() => { onProgress && onProgress({ phase: "copy", label: "photos", done: dirSize(dest), total: bytes }); }, 1500);
    let r;
    try { r = await run(adbPath(), ["-s", serial, "pull", "-a", "/sdcard/DCIM", "/sdcard/Pictures", dest], { timeout: 4 * 3600000 }); }
    finally { clearInterval(timer); }
    const got = dirSize(dest);
    shell.openPath(dest);
    if (r.code !== 0 && got < bytes * 0.9) return V("partial", "ph_photos_partial", { copied: got, size: bytes, folder: dest, detail: r.err.slice(-200) });
    return V("fixed", "ph_photos_done", { files, size: got, folder: dest });
  },
  "crash-log": async (serial) => {
    const r = await run(adbPath(), ["-s", serial, "logcat", "-d", "-b", "crash", "-b", "main", "-b", "system", "*:E"], { timeout: 60000 });
    const text = String(r.out || "").split(/\r?\n/).slice(-4000).join("\n");
    return V(text.trim() ? "fixed" : "ok", text.trim() ? "ph_log_ready" : "ph_log_empty", {}, { text });
  },
  "open-settings": async (serial, args) => {
    const action = SETTINGS_INTENT[String((args && args.key) || "settings")] || SETTINGS_INTENT.settings;
    let r = await shell1(serial, `am start -a ${action}`);
    if (/Error|Exception/i.test(r.out + r.err)) r = await shell1(serial, `am start -a ${SETTINGS_INTENT.settings}`);
    return V("opened", "ph_opened_on_phone");
  },
  "install-app": async (serial, args, ctx, onProgress) => {
    const list = await loadCatalog();
    const item = list.find((x) => x.id === String((args && args.app) || ""));
    if (!item) return V("failed", "ph_no_apk");
    const file = path.join(baseDir(), "apks", item.id.replace(/[^\w.-]/g, "") + ".apk");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const dl = await download(item.apk, file, onProgress, item.name + ".apk");
    if (!dl.ok) return V("failed", "ph_download_failed", { detail: dl.error });
    onProgress && onProgress({ phase: "install" });
    if (args && args.replace && item.pkg) await run(adbPath(), ["-s", serial, "uninstall", item.pkg], { timeout: 120000 });
    const r = await adbInstall(serial, file);
    try { fs.unlinkSync(file); } catch (_) {}
    if (r.code === "ok") return V("fixed", "ph_app_installed", { app: item.name, version: item.version || "" });
    return V("failed", r.code, { app: item.name, detail: r.raw }, { canReplace: r.code === "inst_signature" && !!item.pkg });
  },
  "install-apk-files": async (serial, args, ctx, onProgress) => {
    const pick = await dialog.showOpenDialog({ title: "TechFix — APK", defaultPath: app.getPath("downloads"),
      properties: ["openFile", "multiSelections"], filters: [{ name: "Android app (.apk)", extensions: ["apk"] }] });
    if (pick.canceled || !pick.filePaths.length) return V("cancelled", "cancelled");
    const lines = [];
    let ok = 0;
    for (const f of pick.filePaths.slice(0, 30)) {
      onProgress && onProgress({ phase: "install", label: path.basename(f) });
      const r = await adbInstall(serial, f);
      if (r.code === "ok") ok++;
      lines.push({ name: path.basename(f), code: r.code === "ok" ? "ph_app_installed_line" : r.code, detail: r.code === "ok" ? "" : r.raw });
    }
    const n = lines.length;
    return V(ok === n ? "fixed" : ok ? "partial" : "failed", "ph_apks_done", { ok, n }, { lines });
  },
  "push-files": async (serial, args, ctx, onProgress) => {
    const pick = await dialog.showOpenDialog({ title: "TechFix", defaultPath: app.getPath("downloads"), properties: ["openFile", "multiSelections"] });
    if (pick.canceled || !pick.filePaths.length) return V("cancelled", "cancelled");
    const files = pick.filePaths.slice(0, 200);
    const total = files.reduce((a, f) => { try { return a + fs.statSync(f).size; } catch (_) { return a; } }, 0);
    const before = await dataFree(serial);
    if (before != null && before < total + 200 * 1048576) return V("failed", "ph_push_nospace", { size: total, free: before });
    let done = 0, ok = 0;
    const lines = [];
    for (const f of files) {
      onProgress && onProgress({ phase: "copy", label: path.basename(f), done, total });
      const r = await run(adbPath(), ["-s", serial, "push", f, "/sdcard/Download/"], { timeout: 4 * 3600000 });
      let sz = 0; try { sz = fs.statSync(f).size; } catch (_) {}
      done += sz;
      if (r.code === 0) ok++; else lines.push({ name: path.basename(f), code: "ph_push_failed_line", detail: r.err.trim().slice(-200) });
    }
    // Ask Android to index them, so they show in the Files / Gallery apps right away.
    await shell1(serial, "am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/ >/dev/null 2>&1; cmd media_provider scan /sdcard/Download >/dev/null 2>&1", 30000);
    return V(ok === files.length ? "fixed" : ok ? "partial" : "failed", "ph_push_done", { ok, n: files.length, size: done }, { lines });
  },
  "install-techfix": async (serial, args, ctx, onProgress) => {
    const info = await releaseInfo();
    if (!info || !info.apk) return V("failed", "ph_no_apk");
    const apk = path.join(baseDir(), "TechFix.apk");
    const dl = await download(info.apk, apk, onProgress, "TechFix.apk");
    if (!dl.ok) return V("failed", "ph_download_failed", { detail: dl.error });
    onProgress && onProgress({ phase: "install" });
    const r = await run(adbPath(), ["-s", serial, "install", "-r", apk], { timeout: 300000 });
    if (/Success/.test(r.out)) return V("fixed", "ph_techfix_installed", { version: info.version || "" });
    return V("failed", "ph_install_failed", { detail: (r.out + r.err).trim().slice(-240) });
  },
  "reboot": async (serial) => { await run(adbPath(), ["-s", serial, "reboot"], { timeout: 20000 }); return V("started", "ph_rebooting"); },
  "reboot-recovery": async (serial) => { await run(adbPath(), ["-s", serial, "reboot", "recovery"], { timeout: 20000 }); return V("started", "ph_to_recovery"); },
  "reboot-bootloader": async (serial) => { await run(adbPath(), ["-s", serial, "reboot", "bootloader"], { timeout: 20000 }); return V("started", "ph_to_bootloader"); }
};


// Android's install answers, turned into codes the page explains in plain words.
function installCode(out) {
  const t = String(out || "");
  if (/Success/.test(t)) return "ok";
  const m = /(INSTALL_[A-Z_]+)/.exec(t);
  const k = m ? m[1] : "";
  if (/UPDATE_INCOMPATIBLE|SIGNATURES|INCONSISTENT_CERTIFICATES/.test(k)) return "inst_signature";
  if (/VERSION_DOWNGRADE/.test(k)) return "inst_downgrade";
  if (/INSUFFICIENT_STORAGE/.test(k)) return "inst_storage";
  if (/USER_RESTRICTED|ABORTED/.test(k)) return "inst_restricted";
  if (/OLDER_SDK/.test(k)) return "inst_older_sdk";
  if (/NO_MATCHING_ABIS/.test(k)) return "inst_abi";
  if (/PARSE|INVALID_APK|NO_CERTIFICATES/.test(k)) return "inst_invalid";
  return "inst_failed";
}

async function adbInstall(serial, apk, extraArgs) {
  const r = await run(adbPath(), ["-s", serial, "install", "-r", ...(extraArgs || []), apk], { timeout: 600000 });
  return { code: installCode(r.out + "\n" + r.err), raw: (r.out + r.err).trim().split(/\r?\n/).slice(-2).join(" ").slice(-240) };
}

// The MartinB apps catalog: apps.json from the hub + each app's update.json (same files the hub uses).
const HUB = "https://fisbal.github.io/";
const REL = "https://github.com/fisbal/fisbal.github.io/releases/download/";
let CATALOG = { t: 0, list: [] };
async function fetchJson(url) {
  try { const r = await net.fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
async function loadCatalog() {
  if (Date.now() - CATALOG.t < 10 * 60000 && CATALOG.list.length) return CATALOG.list;
  const a = await fetchJson(HUB + "apps.json");
  const apps = (a && (Array.isArray(a) ? a : a.apps)) || [];
  const list = await Promise.all(apps.map(async (x) => {
    const item = { id: String(x.id || ""), name: x.name || x.id, desc: x.desc || "", icon: x.icon ? HUB + String(x.icon).replace(/^\//, "") : "", pkg: x.pkg || "" };
    if (x.factory) {
      const u = await fetchJson(REL + encodeURIComponent(item.id) + "-latest/update.json");
      if (u && u.apk) { item.apk = u.apk; item.version = u.version || ""; item.build = Number(u.build) || 0; item.size = u.apkSize || 0; }
    } else if (typeof x.apk === "string") item.apk = x.apk;
    return item;
  }));
  // Only links into Martin's own GitHub releases are ever downloaded.
  CATALOG = { t: Date.now(), list: list.filter((x) => x.apk && /^https:\/\/github\.com\/fisbal\//.test(x.apk)) };
  return CATALOG.list;
}

async function phoneCatalog(serial) {
  const d = await requireDevice(serial, ["device"]);
  if (!d) return { error: "not_connected" };
  const list = await loadCatalog();
  if (!list.length) return { error: "offline" };
  const r = await shell1(serial, "pm list packages --show-versioncode", 30000);
  const have = {};
  for (const m of String(r.out).matchAll(/package:(\S+)\s+versionCode:(\d+)/g)) have[m[1]] = Number(m[2]);
  return { apps: list.map((x) => {
    const code = x.pkg ? have[x.pkg] : undefined;
    let status = "missing";
    if (code != null) status = x.build && code < 1000 + x.build ? "update" : "installed";
    else if (!x.pkg) status = "unknown";
    return Object.assign({}, x, { installedCode: code == null ? null : code, status });
  }) };
}

function dirSize(dir) {
  let n = 0;
  const walk = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { try { n += fs.statSync(p).size; } catch (_) {} } } };
  walk(dir);
  return n;
}

async function phoneAction(serial, id, args, onProgress) {
  const fn = PHONE_ACTIONS[String(id)];
  if (!fn) return V("failed", "ph_unknown");
  const d = await requireDevice(serial, ["device"]);
  if (!d) return V("failed", "ph_not_connected");
  try { return await fn(serial, args || {}, { model: d.model || d.serial }, onProgress); }
  catch (e) { return V("failed", "ph_failed", { detail: String((e && e.message) || e).slice(-200) }); }
}

// Devices sitting in the bootloader (Fastboot) or Recovery: the only safe thing is a normal restart.
async function modeAction(serial, id) {
  if (!SERIAL_RE.test(String(serial || ""))) return V("failed", "ph_not_connected");
  if (id === "fastboot-reboot") {
    const fb = fastbootPath();
    const list = await fastbootDevices();
    if (!fb || !list.find((x) => x.serial === serial)) return V("failed", "ph_not_connected");
    await run(fb, ["-s", serial, "reboot"], { timeout: 20000 });
    return V("started", "ph_rebooting");
  }
  if (id === "recovery-reboot") {
    const d = await requireDevice(serial, ["recovery", "sideload", "rescue"]);
    if (!d) return V("failed", "ph_not_connected");
    await run(adbPath(), ["-s", serial, "reboot"], { timeout: 20000 });
    return V("started", "ph_rebooting");
  }
  if (id === "retry-auth") {
    // Restarting the ADB server makes the phone show "Allow USB debugging?" again.
    const adb = adbPath();
    if (!adb) return V("failed", "adb_missing");
    await run(adb, ["kill-server"], { timeout: 15000 });
    await run(adb, ["start-server"], { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2500));
    const d = ((await adbDevices()) || []).find((x) => x.serial === serial);
    if (d && d.state === "device") return V("fixed", "ph_authorized");
    return V("started", "ph_prompt_again");
  }
  return V("failed", "ph_unknown");
}

// Android 11+ "Wireless debugging": pair once with the 6-digit code, then connect.
async function wifiPair(args) {
  const adb = adbPath();
  if (!adb) return V("failed", "adb_missing");
  const ip = String((args && args.ip) || "").trim();
  const pport = String((args && args.pairPort) || "").trim(), cport = String((args && args.port) || "").trim();
  const code = String((args && args.code) || "").replace(/\s/g, "");
  const ipOk = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split(".").every((x) => Number(x) <= 255);
  if (!ipOk || !/^\d{2,5}$/.test(cport) || (pport && !/^\d{2,5}$/.test(pport)) || (code && !/^\d{6}$/.test(code))) return V("failed", "wifi_bad_input");
  if (pport && code) {
    const p = await run(adb, ["pair", `${ip}:${pport}`, code], { timeout: 30000 });
    if (!/Successfully paired/i.test(p.out)) return V("failed", "wifi_pair_failed", { detail: (p.out + p.err).trim().slice(-200) });
  }
  const c = await run(adb, ["connect", `${ip}:${cport}`], { timeout: 30000 });
  if (/connected to/i.test(c.out) && !/cannot|failed/i.test(c.out)) return V("fixed", "wifi_connected", { serial: `${ip}:${cport}` });
  return V("failed", "wifi_connect_failed", { detail: (c.out + c.err).trim().slice(-200) });
}

// ------------------------------------------------------------------------------------------
// Another computer
// ------------------------------------------------------------------------------------------
async function pcAction(id, args, onProgress) {
  if (id === "quick-assist") {
    if (WIN) {
      try { await shell.openExternal("ms-quick-assist:"); return V("opened", "pc_quick_assist"); }
      catch (_) { await shell.openExternal("ms-windows-store://pdp/?ProductId=9P7BP5VNWKX5"); return V("opened", "pc_quick_assist_store"); }
    }
    if (MAC) { await shell.openExternal("x-apple.systempreferences:com.apple.Sharing-Settings.extension"); return V("opened", "pc_mac_sharing"); }
    return V("failed", "pc_unsupported");
  }
  if (id === "recovery-drive") {
    if (!WIN) return V("failed", "pc_unsupported");
    const exe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "RecoveryDrive.exe");
    const err = await shell.openPath(exe);
    return err ? V("failed", "pc_failed", { detail: err }) : V("opened", "pc_recovery_drive");
  }
  if (id === "media-tool") {
    await shell.openExternal(WIN ? "https://www.microsoft.com/software-download/windows11" : "https://support.apple.com/102662");
    return V("opened", "pc_media_tool");
  }
  if (id === "key-files") {
    const drives = await removableDrives();
    const drive = drives.find((d) => d.id === String((args && args.drive) || ""));
    if (!drive) return V("failed", "pc_no_drive");
    const pick = await dialog.showOpenDialog({ title: "TechFix", defaultPath: app.getPath("downloads"), properties: ["openFile", "multiSelections"] });
    if (pick.canceled || !pick.filePaths.length) return V("cancelled", "cancelled");
    const files = pick.filePaths.slice(0, 200);
    const total = files.reduce((a, f) => { try { return a + fs.statSync(f).size; } catch (_) { return a; } }, 0);
    const free = freeBytes(drive.root);
    if (free != null && free < total + 1048576) return V("failed", "pc_key_full", { need: total, free });
    let done = 0, ok = 0;
    const lines = [];
    for (const f of files) {
      onProgress && onProgress({ phase: "copy", label: path.basename(f), done, total });
      try {
        // FAT32 keys can't hold a file of 4 GB or more.
        const sz = fs.statSync(f).size;
        if (sz >= 4294967296 && /FAT/i.test(drive.fs || "") && !/exFAT/i.test(drive.fs || "")) { lines.push({ name: path.basename(f), code: "pc_fat32_line" }); continue; }
        await fs.promises.copyFile(f, path.join(drive.root, path.basename(f)));
        done += sz; ok++;
      } catch (e) { lines.push({ name: path.basename(f), code: "pc_copy_failed_line", detail: String(e.message || e).slice(-200) }); }
    }
    shell.openPath(drive.root);
    return V(ok === files.length ? "fixed" : ok ? "partial" : "failed", "pc_key_files_done", { ok, n: files.length, size: done, drive: drive.id }, { lines });
  }
  if (id === "usb-key") {
    const drives = await removableDrives();
    const drive = drives.find((d) => d.id === String((args && args.drive) || ""));
    if (!drive) return V("failed", "pc_no_drive");
    const info = await releaseInfo();
    if (!info) return V("failed", "pc_no_release");
    const want = [];
    if (info.exe) want.push({ url: info.exe, name: "TechFix-Setup.exe", size: info.exeSize || 0 });
    if (info.dmg) want.push({ url: info.dmg, name: "TechFix.dmg", size: info.dmgSize || 0 });
    if (info.apk) want.push({ url: info.apk, name: "TechFix.apk", size: info.apkSize || 0 });
    const need = want.reduce((a, w) => a + w.size, 0) + 4 * 1048576;
    const free = freeBytes(drive.root);
    if (free != null && need && free < need) return V("failed", "pc_key_full", { need, free });
    const dir = path.join(drive.root, "TechFix");
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return V("failed", "pc_key_write", { detail: String(e.message || e) }); }
    let n = 0;
    for (const w of want) {
      const r = await download(w.url, path.join(dir, w.name), onProgress, w.name);
      if (!r.ok) return V(n ? "partial" : "failed", "pc_key_download", { detail: r.error, file: w.name });
      n++;
    }
    const readme = [
      "TechFix " + (info.version || ""), "",
      "FR — Windows : ouvre TechFix-Setup.exe. Mac : ouvre TechFix.dmg. Android : copie TechFix.apk sur le téléphone et ouvre-le.",
      "     Une fois installé, TechFix se met à jour tout seul.",
      "EN — Windows: run TechFix-Setup.exe. Mac: open TechFix.dmg. Android: copy TechFix.apk to the phone and open it.",
      "     Once installed, TechFix keeps itself up to date.",
      "ES — Windows: abre TechFix-Setup.exe. Mac: abre TechFix.dmg. Android: copia TechFix.apk al teléfono y ábrelo.",
      "PT — Windows: abra TechFix-Setup.exe. Mac: abra TechFix.dmg. Android: copie TechFix.apk para o celular e abra.",
      "DE — Windows: TechFix-Setup.exe starten. Mac: TechFix.dmg öffnen. Android: TechFix.apk aufs Handy kopieren und öffnen.", ""
    ].join("\r\n");
    try { fs.writeFileSync(path.join(dir, "LISEZMOI - README.txt"), readme, "utf8"); } catch (_) {}
    shell.openPath(dir);
    return V("fixed", "pc_key_ready", { drive: drive.id, version: info.version || "" });
  }
  return V("failed", "pc_unknown");
}

// ------------------------------------------------------------------------------------------
// Entry point for the IPC channel
// ------------------------------------------------------------------------------------------
async function handle(op, payload, onProgress) {
  payload = payload || {};
  switch (String(op)) {
    case "status": return status();
    case "installAdb": return installAdb(onProgress);
    case "phoneScan": return phoneScan(payload.serial);
    case "catalog": return phoneCatalog(payload.serial);
    case "phoneAction": return phoneAction(payload.serial, payload.id, payload.args, onProgress);
    case "modeAction": return modeAction(payload.serial, payload.id);
    case "wifiPair": return wifiPair(payload);
    case "pcAction": return pcAction(String(payload.id || ""), payload.args, onProgress);
    case "fmtDisks": return require("./format").listDisks();
    case "fmtRun": return require("./format").format(payload, onProgress);
    case "fmtRescue": return require("./format").rescueKey(payload, onProgress, CFG);
    default: return { error: "unknown" };
  }
}

// Stop the ADB background server when TechFix closes, so nothing keeps running after it.
function shutdown() {
  const adb = adbPath();
  if (adb) { try { execFile(adb, ["kill-server"], { windowsHide: true, timeout: 5000 }, () => {}); } catch (_) {} }
}

module.exports = { init, handle, shutdown, _test: { parsePhone, sections, SCAN_SH } };

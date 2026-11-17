/* ===================== TechFix — unwanted & spy apps on a phone =====================
   Classifies the raw read-out of THREAT_SH (factory/electron/connect.js and connect-web.js —
   same text in the installed app and in Chrome). Signals, from the research on adware and
   stalkerware (Echap stalkerware-indicators, Malwarebytes, Trend Micro, HUMAN Satori):
   · a package on Echap's public stalkerware / watchware list            → spy / monitoring app
   · reads the screen (accessibility), notifications, or is a device admin,
     and was NOT installed from a store or has no icon                      → likely spy app
   · hides its icon and/or draws over other apps (pop-ups)                  → adware ("HiddenAds")
   · installed from a file / unknown source, recently, "cleaner/booster"…  → weaker hints
   Nothing here touches the phone: the page shows the verdicts and the person chooses. */
"use strict";

const TFThreats = (() => {
  const PKG = /^[A-Za-z][\w]*(\.[\w]+)+$/;
  const STORES = new Set(["com.android.vending", "com.sec.android.app.samsungapps", "com.huawei.appmarket", "com.xiaomi.market", "com.xiaomi.mipicks",
    "com.amazon.venezia", "com.oppo.market", "com.heytap.market", "com.bbk.appstore", "com.oneplus.market", "org.fdroid.fdroid", "com.aurora.store",
    "com.google.android.feedback", "com.android.packageinstaller.store"]);
  // Big, known publishers: their apps legitimately use accessibility / overlays / admin rights.
  const TRUSTED = /^(com\.google\.|com\.android\.|android$|com\.samsung\.|com\.sec\.|com\.microsoft\.|com\.facebook\.|com\.whatsapp|com\.instagram\.|org\.telegram\.|com\.discord|com\.spotify\.|com\.x8bit\.bitwarden|com\.lastpass\.|com\.agilebits\.|com\.dashlane|com\.martinb\.|com\.motorola\.|com\.oneplus\.|com\.xiaomi\.|com\.miui\.|com\.huawei\.|com\.oppo\.|com\.coloros\.|com\.teslacoilsw\.|com\.amazon\.|com\.zhiliaoapp\.|com\.snapchat\.|com\.netflix\.|com\.adobe\.|com\.dropbox\.|com\.skype\.|com\.lge\.|com\.sonymobile\.|com\.nothing\.|com\.bitdefender\.|com\.avast\.|com\.kaspersky\.|com\.eset\.|org\.malwarebytes\.|com\.symantec\.|com\.wsandroid\.|com\.duckduckgo\.)/;
  const JUNKY = /(clean(er)?|boost(er)?|junk|speed|cool(er|ing)|cpu|battery.?(saver|doctor|master)|antivirus|virus|flash.?light|torch|phone.?master|ram|optimi[sz]|security.?master|fast.?charg)/i;
  const RECENT_DAYS = 21;

  function sections(text) {
    const out = {}; let cur = "head";
    for (const line of String(text || "").split(/\r?\n/)) {
      const m = /^@@TF:(\w+)/.exec(line);
      if (m) { cur = m[1]; out[cur] = ""; continue; }
      out[cur] = (out[cur] || "") + line + "\n";
    }
    return out;
  }
  const pkgsIn = (s) => [...new Set(String(s || "").split(/[\s:,]+/).map((x) => x.replace(/^ComponentInfo\{/, "").split("/")[0].trim()).filter((x) => PKG.test(x)))];

  // Stalkerware list: bundled snapshot (vendor/stalkerware.js), refreshed from GitHub when online.
  let IOC = null;
  function iocIndex(src) {
    const idx = new Map();
    for (const e of (src && src.list) || []) for (const p of e.p || []) idx.set(p, { name: e.n, type: e.t || "stalkerware" });
    return idx;
  }
  function parseYaml(t, type) {
    const out = []; let cur = null, key = null;
    for (const line of String(t).split(/\r?\n/)) {
      let m = /^- name: (.+)$/.exec(line);
      if (m) { cur = { n: m[1].trim(), t: type, p: [] }; out.push(cur); key = null; continue; }
      if (!cur) continue;
      m = /^  (\w+):\s*(.*)$/.exec(line);
      if (m) { key = m[1]; if (key === "type" && m[2]) cur.t = m[2].trim(); continue; }
      m = /^  - (\S+)$/.exec(line);
      if (m && key === "packages" && PKG.test(m[1])) cur.p.push(m[1]);
    }
    return out.filter((x) => x.p.length);
  }
  async function loadIoc() {
    if (IOC) return IOC;
    let src = window.TF_STALKERWARE || { list: [] };
    try {
      const c = JSON.parse(localStorage.getItem("techfix:ioc") || "null");
      if (c && c.list && c.list.length && Date.now() - c.t < 7 * 86400000) src = c;
    } catch (_) {}
    if (!src.t) {
      // Fresh copy (CC-BY 4.0, Echap) — kept a week; the bundled snapshot is the fallback.
      try {
        const base = "https://raw.githubusercontent.com/AssoEchap/stalkerware-indicators/master/";
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
        const [a, b] = await Promise.all([fetch(base + "ioc.yaml", { signal: ctl.signal }), fetch(base + "watchware.yaml", { signal: ctl.signal })]);
        if (a.ok) {
          const list = parseYaml(await a.text(), "stalkerware").concat(b.ok ? parseYaml(await b.text(), "watchware") : []);
          if (list.length > 50) { src = { t: Date.now(), list }; try { localStorage.setItem("techfix:ioc", JSON.stringify(src)); } catch (_) {} }
        }
      } catch (_) {}
    }
    IOC = { idx: iocIndex(src), count: (src.list || []).length, fresh: !!src.t };
    return IOC;
  }

  function analyze(raw, ioc) {
    const s = sections(raw);
    const sdk = Number(String(s.sdk || "").trim()) || null;
    const apps = [];
    for (const line of String(s.pkgs || "").split(/\r?\n/)) {
      const m = /^package:(\S+)(?:\s+installer=(\S+))?/.exec(line.trim());
      if (m && PKG.test(m[1])) apps.push({ pkg: m[1], installer: m[2] && m[2] !== "null" ? m[2] : "" });
    }
    const launchRaw = String(s.launch || "");
    const launchOk = /\/[\w.$]+/.test(launchRaw);           // older Android: no query-activities → don't judge icons
    const launch = new Set(launchOk ? [...launchRaw.matchAll(/([A-Za-z][\w]*(?:\.[\w]+)+)\//g)].map((m) => m[1]) : []);
    const overlayRaw = String(s.overlay || "");
    const overlayOk = !/usage|unknown|error/i.test(overlayRaw);
    const overlay = new Set(overlayOk ? pkgsIn(overlayRaw) : []);
    const acc = new Set(pkgsIn(s.acc)), nl = new Set(pkgsIn(s.nl)), admins = new Set(pkgsIn(s.admins));
    const times = {}; let curPkg = null;
    for (const line of String(s.times || "").split(/\r?\n/)) {
      const p = /Package \[([^\]]+)\]/.exec(line);
      if (p) { curPkg = p[1]; continue; }
      const t = /firstInstallTime=(\d{4}-\d\d-\d\d)/.exec(line);
      if (t && curPkg && !times[curPkg]) times[curPkg] = t[1];
    }
    const idx = (ioc && ioc.idx) || new Map();
    const now = Date.now();
    const out = [];
    for (const a of apps) {
      const r = [];
      const trusted = TRUSTED.test(a.pkg) && STORES.has(a.installer);
      const sideloaded = !STORES.has(a.installer);
      const hidden = launchOk && !launch.has(a.pkg);
      const draws = overlay.has(a.pkg);
      const powers = [acc.has(a.pkg) && "acc", nl.has(a.pkg) && "nl", admins.has(a.pkg) && "admin"].filter(Boolean);
      const inst = times[a.pkg] || "";
      const ageDays = inst ? Math.floor((now - Date.parse(inst + "T00:00:00")) / 86400000) : null;
      const hit = idx.get(a.pkg);
      let level = null, kind = null;
      if (hit) { kind = hit.type === "watchware" ? "monitor" : "spy"; level = hit.type === "watchware" ? "warn" : "danger"; r.push(hit.type === "watchware" ? "r_watchware" : "r_stalkerware"); }
      if (!trusted) {
        for (const p of powers) r.push("r_" + p);
        if (hidden) r.push("r_hidden");
        if (draws) r.push("r_overlay");
        if (sideloaded) r.push(a.installer ? "r_other_source" : "r_sideloaded");
        if (ageDays != null && ageDays <= RECENT_DAYS && (hidden || draws || powers.length)) r.push("r_recent");
        if (JUNKY.test(a.pkg) && (hidden || draws || sideloaded)) r.push("r_junky");
        if (!kind) {
          if (powers.length && (sideloaded || hidden)) { kind = "spy"; level = "danger"; }
          else if (hidden && (draws || sideloaded)) { kind = "adware"; level = "danger"; }
          else if (draws && sideloaded) { kind = "adware"; level = "warn"; }
          else if (hidden) { kind = "suspect"; level = "warn"; }
          else if (powers.length) { kind = "review"; level = "warn"; }
          else if (draws && JUNKY.test(a.pkg)) { kind = "adware"; level = "warn"; }
          else if (draws) { kind = "popups"; level = "info"; }
        }
      }
      if (kind) out.push({ pkg: a.pkg, kind, level, reasons: r, ioc: hit ? hit.name : "", installer: a.installer, installed: inst, ageDays, powers, draws, hidden });
    }
    const rank = { danger: 0, warn: 1, info: 2 };
    out.sort((x, y) => rank[x.level] - rank[y.level] || (x.ageDays ?? 9e9) - (y.ageDays ?? 9e9));
    return {
      sdk, total: apps.length, flagged: out,
      counts: { danger: out.filter((x) => x.level === "danger").length, warn: out.filter((x) => x.level === "warn").length, info: out.filter((x) => x.level === "info").length },
      checks: { icons: launchOk, overlay: overlayOk, iocCount: ioc ? ioc.count : 0, iocFresh: !!(ioc && ioc.fresh) },
      protectOff: String(s.verify || "").trim() === "0"
    };
  }
  return { analyze, loadIoc, _parseYaml: parseYaml };
})();
window.TFThreats = TFThreats;

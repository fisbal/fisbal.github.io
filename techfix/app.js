/* ===================== TechFix — application logic ===================== */
"use strict";

/* ---------- Icon set (simple stroke icons, hand-authored, minimal path data) ---------- */
const ICON = {
  search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  scan:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M3 12h18"/></svg>`,
  wand:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l11-11"/><path d="M17 3l1.3 2.7L21 7l-2.7 1.3L17 11l-1.3-2.7L13 7l2.7-1.3z"/><path d="M4.5 4.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>`,
  book:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  bookmark:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  chevron:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>`,
  copy:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  cpu:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>`,
  wifi:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5a16 16 0 0 1 20 0"/><path d="M5.5 12a11 11 0 0 1 13 0"/><path d="M9 15.5a6 6 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>`,
  battery:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4"/></svg>`,
  disk:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 12h20"/><circle cx="7" cy="16" r="1" fill="currentColor" stroke="none"/></svg>`,
  monitor:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  smartphone:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>`,
  laptop:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>`,
  wrench:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 0 0 5.4-5.4z"/></svg>`,
  alert:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 20h20z"/><path d="M12 9v5M12 17v.01"/></svg>`,
  activity:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9-6-18-3 9H2"/></svg>`,
  clock:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  starOn:`<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 2.5l3 6 6.5 1-4.7 4.6 1.1 6.4L12 17.5l-5.9 3 1.1-6.4L2.5 9.5l6.5-1z"/></svg>`,
  starOff:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l3 6 6.5 1-4.7 4.6 1.1 6.4L12 17.5l-5.9 3 1.1-6.4L2.5 9.5l6.5-1z"/></svg>`,
  refresh:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`,
  empty:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  log:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6M9 9h1"/></svg>`,
  upload:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`,
  pulse:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l2 7 4-14 2 7h8"/></svg>`,
  report:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M8 11h8M8 15h8M8 19h5"/></svg>`
};

const PLAT_META = {
  win:      { label:"Windows / PC", short:"Windows", icon: ICON.monitor },
  android:  { label:"Android",      short:"Android", icon: ICON.smartphone },
  mac:      { label:"macOS",        short:"macOS",   icon: ICON.laptop },
  ios:      { label:"iPhone / iPad",short:"iOS",     icon: ICON.smartphone },
  gen:      { label:"Hardware & Network", short:"Hardware", icon: ICON.wrench }
};

const CATEGORY_DEFS = [
  { key:"boot",    label:"Won't turn on / boot", icon: ICON.activity, tags:["boot","bootloop","post","startup","recovery-mode","kernel-panic","dead-device","hard-disk"] },
  { key:"crash",   label:"Freezes or crashes",   icon: ICON.alert,    tags:["crash","freeze","gpf","bsod","kernel-panic","force-close","uae","beachball","protection-error"] },
  { key:"slow",    label:"Running very slow",     icon: ICON.cpu,      tags:["performance","disk","memory","cpu","thermal","sysmain","tiworker"] },
  { key:"network", label:"No internet / Wi-Fi",   icon: ICON.wifi,     tags:["wifi","network","dns","vpn","sim","cellular","bluetooth","router"] },
  { key:"battery", label:"Battery / charging",    icon: ICON.battery,  tags:["battery","charging","thermal","usb-c"] },
  { key:"storage", label:"Storage full",          icon: ICON.disk,     tags:["storage","disk-space","scoped-storage"] },
  { key:"av",      label:"Sound / display issue", icon: ICON.monitor,  tags:["audio","display","touchscreen","digitizer","driver"] },
  { key:"periph",  label:"Peripheral not working",icon: ICON.wrench,   tags:["keyboard","mouse","printer","webcam","microphone","usb","hardware-failure"] },
  { key:"update",  label:"Update / activation",   icon: ICON.refresh,  tags:["update","activation","ota","feature-update","windows-update"] },
  { key:"other",   label:"Something else",        icon: ICON.search,   tags:[] }
];

/* ---------- Log signature library ----------
   Curated, high-confidence regex → knowledge-base mappings. Each pattern is
   a distinctive string that genuinely appears in the log type it names —
   these are deliberately precise rather than exhaustive, so a match means
   something. Generic severity counting (below) covers everything a
   signature doesn't recognize by name. */
const LOG_SIGNATURES = [
  { id:"win-dos-01", label:"MS-DOS \"Bad command or file name\"", pattern:/bad command or file name/i },
  { id:"win-dos-02", label:"DOS out-of-memory / packed file corrupt", pattern:/packed file is corrupt/i },
  { id:"win-dos-03", label:"DOS \"Invalid drive specification\"", pattern:/invalid drive specification/i },
  { id:"win-95-01",  label:"Windows 9x General Protection Fault", pattern:/general protection fault|performed an illegal operation/i },
  { id:"win-98-03",  label:"Windows 98 Protection Error at boot", pattern:/windows protection error/i },
  { id:"win-xp-01",  label:"Windows Stop 0x7B — INACCESSIBLE_BOOT_DEVICE", pattern:/inaccessible_boot_device|0x0000007b/i },
  { id:"win-xp-03",  label:"RPC service crash / worm-style shutdown", pattern:/rpc server is unavailable|remote procedure call.{0,20}terminated/i },
  { id:"win-10-01",  label:"Windows feature update rollback", pattern:/we couldn'?t complete the updates, undoing changes/i },
  { id:"win-10-03",  label:"CRITICAL_PROCESS_DIED / DPC_WATCHDOG_VIOLATION", pattern:/critical_process_died|dpc_watchdog_violation/i },
  { id:"win-10-06",  label:"\"Your PC ran into a problem\" recovery loop", pattern:/your pc ran into a problem/i },
  { id:"win-11-01",  label:"Windows 11 TPM 2.0 / Secure Boot block", pattern:/this pc can'?t run windows 11|tpm 2\.0/i },
  { id:"win-7-04",   label:"Windows activation flagged \"not genuine\"", pattern:/this copy of windows is not genuine/i },
  { id:"win-7-03",   label:"BSOD referencing a driver (0xA / 0x3B / IRQL)", pattern:/irql_not_less_or_equal|0x0000000a\b|0x0000003b/i },
  { id:"and-early-01", label:"Android \"Process has stopped\" force-close", pattern:/has stopped( unexpectedly)?|force close/i },
  { id:"and-11-01", label:"Google Play Store RPC error", pattern:/rpc:s-\d|df-dferh/i },
  { id:"and-kk-01", label:"Android \"No space left on device\"", pattern:/no space left on device/i },
  { id:"gen-sto-03", label:"Disk full / ENOSPC", pattern:/enospc|no space left on device/i },
  { id:"gen-sto-01", label:"Disk predictive failure / S.M.A.R.T. warning", pattern:/predictive failure|s\.?m\.?a\.?r\.?t\.?[^a-z]{0,10}fail/i },
  { id:"mac-osx-01", label:"macOS kernel panic", pattern:/panic\(cpu \d+ caller|you need to restart your computer/i },
  { id:"macos-2011-02", label:"kernel_task consuming CPU (thermal)", pattern:/kernel_task/i },
  { id:"macos-1013-01", label:"High Sierra root-login bug pattern", pattern:/root.{0,15}no password required|CVE-2017-13872/i },
  { id:"ios-10-01", label:"iOS \"Error 53\"", pattern:/error 53/i },
  { id:"ios-12-01", label:"Group FaceTime eavesdrop bug reference", pattern:/group facetime/i },
];

function normalizeLogLine(line){
  return line
    .replace(/^\s*\[?\d{4}-\d{2}-\d{2}[ t][\d:.,]+\]?\s*/i, "")
    .replace(/^\s*[A-Za-z]{3}\s+\d{1,2}\s+[\d:]+\s*/, "")
    .replace(/0x[0-9a-f]+/gi, "0x…")
    .replace(/\b\d{3,}\b/g, "#")
    .trim();
}

function analyzeLogText(text){
  const allLines = text.split(/\r?\n/);
  const lines = allLines.slice(-5000);
  const truncated = allLines.length > lines.length;

  let fatalCount = 0, errorCount = 0, warnCount = 0;
  const freq = new Map();

  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;
    if(/\b(panic|fatal|critical)\b/i.test(line)) fatalCount++;
    else if(/\b(error|exception|fail(?:ed|ure)?)\b/i.test(line)) errorCount++;
    else if(/\bwarn(?:ing)?\b/i.test(line)) warnCount++;

    const norm = normalizeLogLine(line);
    if(norm.length > 8) freq.set(norm, (freq.get(norm) || 0) + 1);
  }

  const topRepeated = [...freq.entries()].filter(([,c]) => c >= 2).sort((a,b) => b[1]-a[1]).slice(0, 6);

  const matches = [];
  for(const sig of LOG_SIGNATURES){
    let count = 0, example = null;
    for(const raw of lines){
      if(sig.pattern.test(raw)){
        count++;
        if(!example) example = raw.trim().slice(0, 220);
      }
    }
    if(count > 0) matches.push({ ...sig, count, example });
  }
  matches.sort((a,b) => b.count - a.count);

  let fatalExceptions = 0;
  for(const raw of lines){ if(/fatal exception/i.test(raw)) fatalExceptions++; }

  return {
    totalLines: allLines.length,
    analyzedLines: lines.length,
    truncated,
    fatalCount, errorCount, warnCount, fatalExceptions,
    topRepeated,
    matches
  };
}

/* ---------- State ---------- */
const state = {
  view: "scan",
  wizard: { step: 0, platform: null, category: null },
  kbFilterPlat: "all",
  kbFilterSev: "all",
  kbQuery: "",
  openCards: new Set(),
  saved: new Set(),
  scanResults: null,
  scanFindings: [],
  log: { result: null, watching: false, handle: null, timer: null, fileName: null }
};

/* ---------- Persistence (per-viewer convenience only) ---------- */
function loadLocal(){
  try{
    const raw = localStorage.getItem("techfix.saved");
    if(raw) state.saved = new Set(JSON.parse(raw));
  }catch(e){ /* storage unavailable — continue with empty state */ }
}
function persistSaved(){
  try{ localStorage.setItem("techfix.saved", JSON.stringify([...state.saved])); }catch(e){}
}

/* ---------- Hot state (best-effort continuity across republish) ---------- */
function snapshotHot(){
  try{
    window.claude?.hot?.snapshot?.({
      view: state.view,
      kbFilterPlat: state.kbFilterPlat,
      kbFilterSev: state.kbFilterSev,
      kbQuery: state.kbQuery
    });
  }catch(e){}
}

/* ---------- Utilities ---------- */
function el(sel, root=document){ return root.querySelector(sel); }
function els(sel, root=document){ return [...root.querySelectorAll(sel)]; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

let toastTimer = null;
function showToast(msg){
  const t = el("#toast");
  t.querySelector("span").textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove("show"), 2200);
}

function copyToClipboard(text, message){
  const done = ()=> showToast(message || "Copied to clipboard — paste it in the matching shell");
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done){
  try{
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position="fixed"; ta.style.opacity="0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    done();
  }catch(e){ showToast("Couldn't copy — select and copy manually"); }
}

/* ---------- Navigation ---------- */
function setView(view){
  state.view = view;
  els(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  els(".view").forEach(v => v.classList.toggle("active", v.id === "view-"+view));
  window.scrollTo({top:0, behavior:"instant" in window ? "instant":"auto"});
  snapshotHot();
}

/* ---------- Quick Scan (real, browser-observable device signals) ---------- */
function detectPlatformGroup(){
  const ua = navigator.userAgent || "";
  const uaData = navigator.userAgentData;
  if(uaData && uaData.platform){
    const p = uaData.platform.toLowerCase();
    if(p.includes("android")) return "android";
    if(p.includes("windows")) return "win";
    if(p.includes("mac")) return "mac";
  }
  if(/android/i.test(ua)) return "android";
  if(/iphone|ipad|ipod/i.test(ua)) return "ios";
  if(/windows/i.test(ua)) return "win";
  if(/mac os x/i.test(ua) && navigator.maxTouchPoints > 1) return "ios"; // iPadOS reporting as Mac
  if(/mac os x|macintosh/i.test(ua)) return "mac";
  return "gen";
}

async function runScan(){
  const btn = el("#scan-btn");
  if(btn){ btn.disabled = true; btn.querySelector(".btn-label").textContent = "Scanning…"; }

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const r = {
    platformGroup: detectPlatformGroup(),
    ua: navigator.userAgent,
    memory: navigator.deviceMemory || null,
    cores: navigator.hardwareConcurrency || null,
    online: navigator.onLine,
    connType: conn ? conn.effectiveType : null,
    downlink: conn ? conn.downlink : null,
    rtt: conn ? conn.rtt : null,
    saveData: conn ? !!conn.saveData : false,
    touchPoints: navigator.maxTouchPoints || 0,
    screenW: screen.width, screenH: screen.height, dpr: window.devicePixelRatio || 1,
    lang: navigator.language,
    tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || "Unknown",
    cookiesEnabled: navigator.cookieEnabled,
    storageUsage: null, storageQuota: null,
    battery: null
  };

  try{
    if(navigator.storage && navigator.storage.estimate){
      const est = await navigator.storage.estimate();
      r.storageUsage = est.usage || 0;
      r.storageQuota = est.quota || 0;
    }
  }catch(e){}

  try{
    if(navigator.getBattery){
      const b = await navigator.getBattery();
      r.battery = { level: b.level, charging: b.charging };
    }
  }catch(e){}

  await new Promise(res => setTimeout(res, 550)); // let the scan feel deliberate, not instant/fake

  state.scanResults = r;
  state.scanFindings = buildFindings(r);
  renderScan();

  if(btn){ btn.disabled = false; btn.querySelector(".btn-label").textContent = "Re-scan this device"; }
  try{
    localStorage.setItem("techfix.lastScan", JSON.stringify({ t: Date.now() }));
  }catch(e){}
}

function buildFindings(r){
  const f = [];
  const pg = r.platformGroup;

  if(r.online === false){
    f.push({ severity:"critical", title:"This device reports no active network connection", detail:"Browsing, sync, and updates will fail until connectivity returns.", kbId:"gen-net-01" });
  }
  if(r.storageQuota && r.storageUsage){
    const pct = r.storageUsage / r.storageQuota;
    if(pct > 0.9){
      f.push({ severity:"high", title:"Storage is nearly exhausted", detail:`This browser profile is using ${(pct*100).toFixed(0)}% of its available quota — the full device is very likely just as tight, which slows everything down and can block updates.`, kbId: pg==="android" ? "and-kk-01" : (pg==="ios" ? "ios-8-02" : "gen-sto-03") });
    } else if(pct > 0.75){
      f.push({ severity:"medium", title:"Storage is getting tight", detail:`Around ${(pct*100).toFixed(0)}% of available storage quota is in use. Worth clearing caches and large files soon.`, kbId:"gen-sto-03" });
    }
  }
  if(r.connType && ["slow-2g","2g"].includes(r.connType)){
    f.push({ severity:"medium", title:"Constrained network detected", detail:`Effective connection type is reporting as ${r.connType}${r.downlink ? ` (~${r.downlink} Mbps)`:""}. Pages and updates will feel slow until this improves.`, kbId:"gen-net-02" });
  } else if(typeof r.downlink === "number" && r.downlink > 0 && r.downlink < 1){
    f.push({ severity:"low", title:"Low measured bandwidth", detail:`Downlink estimate is ~${r.downlink} Mbps. If this is unexpected for your connection, see the Wi-Fi range and channel guidance.`, kbId:"gen-net-02" });
  }
  if(r.saveData){
    f.push({ severity:"low", title:"Data Saver is active", detail:"The browser/OS has requested reduced data usage — background sync and image quality may be intentionally limited right now.", kbId:null });
  }
  if(typeof r.memory === "number" && r.memory <= 2){
    f.push({ severity:"medium", title:"Low reported device memory", detail:`This device reports ~${r.memory}GB of RAM available to the browser. Heavy multitasking will feel sluggish — closing unused tabs/apps helps most.`, kbId: pg==="mac" ? "macos-1012-01" : (pg==="android" ? "and-lol-01" : null) });
  }
  if(typeof r.cores === "number" && r.cores <= 2){
    f.push({ severity:"low", title:"Limited CPU parallelism", detail:`Only ${r.cores} logical core(s) reported. Expect slower performance under multitasking or background scans.`, kbId:null });
  }
  if(r.battery && r.battery.level <= 0.2 && !r.battery.charging){
    f.push({ severity:"medium", title:"Battery is low and not charging", detail:`Battery at ${Math.round(r.battery.level*100)}%. Connect power soon — low-battery states are also when unexpected shutdowns are most likely on aging batteries.`, kbId: pg==="ios" ? "ios-11-01" : (pg==="android" ? "and-oem-03" : "gen-pow-01") });
  }
  if(r.battery && r.battery.charging === false && r.battery.level < 1 && r.battery.level > 0.2){
    // informational only, not pushed as a finding — normal state
  }

  return f;
}

function fmtBytes(n){
  if(n == null) return "—";
  if(n === 0) return "0 B";
  const units=["B","KB","MB","GB","TB"]; let i=0; let v=n;
  while(v>=1024 && i<units.length-1){ v/=1024; i++; }
  return `${v.toFixed(v<10&&i>0?1:0)} ${units[i]}`;
}

function sevChipClass(pct, invert){ // helper for stat chips based on numeric pressure
  if(pct == null) return "info";
  if(pct > 0.9) return "crit";
  if(pct > 0.7) return "warn";
  return "ok";
}

function renderScan(){
  const r = state.scanResults;
  const wrap = el("#scan-stats");
  const findWrap = el("#scan-findings");
  const summary = el("#scan-summary-pill");

  if(!r){
    wrap.innerHTML = `<div class="stat-note">Run a scan to read live signals from this device — memory, storage, network quality, and battery — and get proactive, matched fixes.</div>`;
    findWrap.innerHTML = "";
    return;
  }

  const storagePct = (r.storageQuota) ? r.storageUsage / r.storageQuota : null;
  const plat = PLAT_META[r.platformGroup] || PLAT_META.gen;

  wrap.innerHTML = `
    <div class="stat-tile">
      <div class="stat-tile-top"><span class="stat-label">Detected platform</span></div>
      <div class="stat-value" style="font-family:var(--font-body); font-size:19px;">${plat.icon} ${esc(plat.short)}</div>
      <div class="stat-note">${r.touchPoints>0 ? "Touch input available" : "No touch input detected"} · ${esc(r.tz)}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile-top"><span class="stat-label">This tab's storage sandbox</span>
        <span class="stat-chip ${storagePct==null?'info':sevChipClass(storagePct)}">${storagePct==null?'N/A':(storagePct>0.9?'critical':storagePct>0.7?'watch':'fine')}</span></div>
      <div class="stat-value">${storagePct==null? '—' : (storagePct*100).toFixed(0)+'%'} <small>used</small></div>
      <div class="stat-bar ${storagePct>0.9?'crit':storagePct>0.7?'warn':''}"><span style="width:${storagePct? Math.min(100,storagePct*100):0}%"></span></div>
      <div class="stat-note">${fmtBytes(r.storageUsage)} of ${fmtBytes(r.storageQuota)} — a browser sandbox limit, NOT your real free disk space</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile-top"><span class="stat-label">Memory &amp; CPU</span></div>
      <div class="stat-value">${r.memory ? r.memory+'GB' : '—'} <small>RAM reported</small></div>
      <div class="stat-note">${r.cores ? r.cores+' logical cores' : 'Core count not exposed by this browser'} — a capability ceiling, not current usage</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile-top"><span class="stat-label">Connection quality (estimate)</span>
        <span class="stat-chip ${r.online===false?'crit':'ok'}">${r.online===false?'offline':'online'}</span></div>
      <div class="stat-value" style="font-size:19px;">${r.connType ? r.connType.toUpperCase()+'-class' : '—'}</div>
      <div class="stat-note">${r.downlink? '~'+r.downlink+' Mbps · ' : ''}${r.rtt? r.rtt+'ms RTT · ' : ''}Chrome's rough quality bucket — not your literal network type (Wi-Fi/Ethernet/cellular all get labeled this way)</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile-top"><span class="stat-label">Battery</span>
        <span class="stat-chip ${r.battery ? (r.battery.level<=0.2 && !r.battery.charging?'crit':(r.battery.charging?'info':'ok')) : 'info'}">${r.battery ? (r.battery.charging?'charging':'on battery') : 'n/a'}</span></div>
      <div class="stat-value">${r.battery ? Math.round(r.battery.level*100)+'%' : '—'}</div>
      <div class="stat-note">${r.battery ? '' : 'Battery Status API not available on this browser/device'}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile-top"><span class="stat-label">Display</span></div>
      <div class="stat-value" style="font-size:19px;">${r.screenW}×${r.screenH}</div>
      <div class="stat-note">${r.dpr}× pixel density · ${esc(r.lang)}</div>
    </div>
  `;

  const crit = state.scanFindings.filter(f=>f.severity==="critical").length;
  const high = state.scanFindings.filter(f=>f.severity==="high").length;
  summary.className = "status-pill always";
  if(crit>0){ summary.innerHTML = `<span class="status-dot crit"></span> ${crit} critical finding${crit>1?'s':''}`; }
  else if(high>0){ summary.innerHTML = `<span class="status-dot warn"></span> ${high} finding${high>1?'s':''} to review`; }
  else if(state.scanFindings.length>0){ summary.innerHTML = `<span class="status-dot warn"></span> ${state.scanFindings.length} minor note${state.scanFindings.length>1?'s':''}`; }
  else { summary.innerHTML = `<span class="status-dot"></span> Scan clean`; }

  if(state.scanFindings.length === 0){
    findWrap.innerHTML = `<div class="empty-good">${ICON.check}<span><strong>Nothing wrong in what a browser can see</strong> — that's a narrow slice (memory ceiling, storage sandbox, rough connection quality, battery). It is not a clean bill of health for the PC itself: real disk health, running processes, driver status, and crash history are invisible to any webpage. If something's actually wrong, describe it in the Diagnose Wizard, run Analyze Log on any error text you have, or use the native TechFix app for a real scan.</span></div>`;
  } else {
    findWrap.innerHTML = `<div class="finding-list">${state.scanFindings.map((f,i)=>`
      <div class="finding" data-kb="${f.kbId||''}" data-idx="${i}">
        <div class="finding-sev ${f.severity}"></div>
        <div class="finding-body">
          <div class="finding-title">${esc(f.title)}</div>
          <div class="finding-meta">${esc(f.detail)}</div>
        </div>
        <div class="finding-arrow">${f.kbId ? ICON.chevron : ""}</div>
      </div>`).join("")}</div>`;
    els(".finding", findWrap).forEach(node=>{
      node.addEventListener("click", ()=>{
        const kbId = node.dataset.kb;
        if(kbId){ openKbEntry(kbId); }
      });
    });
  }
}

/* ---------- Wizard ---------- */
function renderWizard(){
  const { step, platform, category } = state.wizard;
  const progress = el("#wizard-progress");
  progress.innerHTML = [0,1,2].map(i=>`<span class="${i<step?'done':i===step?'current':''}"></span>`).join("");

  const body = el("#wizard-body");

  if(step === 0){
    body.innerHTML = `
      <div class="view-eyebrow">Step 1 of 3</div>
      <div class="view-title" style="font-size:22px;">What are you diagnosing?</div>
      <div class="option-grid" id="wiz-plat-grid">
        ${Object.entries(PLAT_META).map(([key,m])=>`
          <button class="option-card" data-plat="${key}">
            ${m.icon}
            <div class="option-card-title">${esc(m.label)}</div>
            <div class="option-card-sub">${KB.filter(k=>k.platform===key).length} documented issues</div>
          </button>`).join("")}
      </div>`;
    els("#wiz-plat-grid .option-card").forEach(c=>{
      c.addEventListener("click", ()=>{
        state.wizard.platform = c.dataset.plat;
        state.wizard.step = 1;
        renderWizard();
      });
    });
  } else if(step === 1){
    body.innerHTML = `
      <div class="view-eyebrow">Step 2 of 3 · ${esc(PLAT_META[platform].label)}</div>
      <div class="view-title" style="font-size:22px;">What's happening?</div>
      <div class="option-grid" id="wiz-cat-grid">
        ${CATEGORY_DEFS.map(c=>`
          <button class="option-card" data-cat="${c.key}">
            ${c.icon}
            <div class="option-card-title">${esc(c.label)}</div>
          </button>`).join("")}
      </div>`;
    els("#wiz-cat-grid .option-card").forEach(c=>{
      c.addEventListener("click", ()=>{
        state.wizard.category = c.dataset.cat;
        state.wizard.step = 2;
        renderWizard();
      });
    });
  } else {
    const cat = CATEGORY_DEFS.find(c=>c.key===category);
    let matches = KB.filter(k=>k.platform===platform);
    if(cat.tags.length){
      matches = matches.filter(k => k.tags.some(t=>cat.tags.includes(t)));
    }
    body.innerHTML = `
      <div class="view-eyebrow">Step 3 of 3 · ${esc(PLAT_META[platform].label)} · ${esc(cat.label)}</div>
      <div class="view-title" style="font-size:22px;">${matches.length} likely match${matches.length===1?'':'es'}</div>
      <div class="view-sub" style="margin-bottom:18px;">Ranked from most to least common. Expand any entry for causes, step-by-step fixes, and one-click copyable commands.</div>
      <div class="kb-list" id="wiz-results"></div>
    `;
    renderKbList(matches, el("#wiz-results"));
  }

  el("#wiz-back").style.visibility = step===0 ? "hidden" : "visible";
  el("#wiz-restart").style.display = step===2 ? "inline-flex" : "none";
}

function wizardBack(){
  if(state.wizard.step===0) return;
  state.wizard.step -= 1;
  renderWizard();
}
function wizardRestart(){
  state.wizard = { step:0, platform:null, category:null };
  renderWizard();
}

/* ---------- Knowledge base ---------- */
function scoreEntry(entry, q){
  if(!q) return 1;
  q = q.toLowerCase();
  const hay = [entry.title, entry.era, ...(entry.symptoms||[]), ...(entry.causes||[]), ...(entry.tags||[])].join(" ").toLowerCase();
  if(entry.title.toLowerCase().includes(q)) return 3;
  if(hay.includes(q)) return 2;
  const words = q.split(/\s+/).filter(Boolean);
  if(words.length && words.every(w=>hay.includes(w))) return 1.5;
  return 0;
}

function currentKbMatches(){
  let list = KB.slice();
  if(state.kbFilterPlat !== "all") list = list.filter(k=>k.platform===state.kbFilterPlat);
  if(state.kbFilterSev !== "all") list = list.filter(k=>k.severity===state.kbFilterSev);
  const q = state.kbQuery.trim();
  if(q){
    list = list.map(k=>({k, s:scoreEntry(k,q)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).map(x=>x.k);
  }
  return list;
}

function renderKbFilters(){
  const platWrap = el("#kb-plat-filters");
  platWrap.innerHTML = [["all","All platforms"], ...Object.entries(PLAT_META).map(([k,m])=>[k,m.short])]
    .map(([key,label])=>`<button class="chip ${state.kbFilterPlat===key?'active':''}" data-plat="${key}">${esc(label)}</button>`).join("");
  els("#kb-plat-filters .chip").forEach(c=>c.addEventListener("click", ()=>{
    state.kbFilterPlat = c.dataset.plat; renderKbFilters(); renderKbResults(); snapshotHot();
  }));

  const sevWrap = el("#kb-sev-filters");
  const sevs = [["all","All severities"],["critical","Critical"],["high","High"],["medium","Medium"],["low","Low"]];
  sevWrap.innerHTML = sevs.map(([key,label])=>`<button class="chip ${state.kbFilterSev===key?'active':''}" data-sev="${key}">${esc(label)}</button>`).join("");
  els("#kb-sev-filters .chip").forEach(c=>c.addEventListener("click", ()=>{
    state.kbFilterSev = c.dataset.sev; renderKbFilters(); renderKbResults(); snapshotHot();
  }));
}

function renderKbList(list, target){
  if(list.length === 0){
    target.innerHTML = `<div class="no-results">${ICON.empty}<div>No matching issues in the knowledge base yet.<br>Try a broader search term, or use the Diagnose Wizard.</div></div>`;
    return;
  }
  target.innerHTML = list.map(entry => kbCardHtml(entry)).join("");
  els(".kb-card", target).forEach(card => wireKbCard(card, list));
}

function kbCardHtml(entry){
  const isSaved = state.saved.has(entry.id);
  const plat = PLAT_META[entry.platform];
  return `
  <div class="kb-card ${state.openCards.has(entry.id)?'open':''}" data-id="${entry.id}">
    <div class="kb-card-head">
      <div class="plat-badge">${plat.icon}</div>
      <div class="kb-card-titles">
        <div class="kb-card-title">${esc(entry.title)}</div>
        <div class="kb-card-meta">${esc(entry.era)} · ${esc(plat.short)}</div>
      </div>
      <span class="sev-tag ${entry.severity}">${entry.severity}</span>
      <button class="btn sm ghost star-btn" title="${isSaved?'Remove from saved':'Save this fix'}" data-star="${entry.id}">${isSaved?ICON.starOn:ICON.starOff}</button>
      <span class="kb-card-chevron">${ICON.chevron}</span>
    </div>
    <div class="kb-card-body">
      <div class="kb-block">
        <div class="kb-block-label">Symptoms</div>
        <ul>${entry.symptoms.map(s=>`<li>${esc(s)}</li>`).join("")}</ul>
      </div>
      <div class="kb-block">
        <div class="kb-block-label">Likely causes</div>
        <ul>${entry.causes.map(s=>`<li>${esc(s)}</li>`).join("")}</ul>
      </div>
      <div class="kb-block fixes">
        <div class="kb-block-label">Fix — step by step</div>
        <ol>${entry.fixes.map(s=>`<li>${esc(s)}</li>`).join("")}</ol>
      </div>
      ${entry.actions && entry.actions.length ? `<div class="action-row">${entry.actions.map((a,i)=>`
        <button class="btn sm action-btn" data-id="${entry.id}" data-i="${i}">${ICON.copy} ${esc(a.label)}</button>`).join("")}</div>` : ""}
      <div class="tag-row">${entry.tags.map(t=>`<span class="tag-pill">${esc(t)}</span>`).join("")}</div>
    </div>
  </div>`;
}

function wireKbCard(card, list){
  const id = card.dataset.id;
  const entry = list.find(e=>e.id===id) || KB.find(e=>e.id===id);

  el(".kb-card-head", card).addEventListener("click", (e)=>{
    if(e.target.closest(".star-btn")) return;
    const open = card.classList.toggle("open");
    if(open) state.openCards.add(id); else state.openCards.delete(id);
  });

  const starBtn = el(".star-btn", card);
  starBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    if(state.saved.has(id)){ state.saved.delete(id); } else { state.saved.add(id); }
    persistSaved();
    starBtn.innerHTML = state.saved.has(id) ? ICON.starOn : ICON.starOff;
    starBtn.title = state.saved.has(id) ? "Remove from saved" : "Save this fix";
    updateNavCounts();
    if(state.view === "saved") renderSaved();
  });

  els(".action-btn", card).forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const action = entry.actions[Number(btn.dataset.i)];
      if(action.type === "copy"){
        copyToClipboard(action.value);
      } else if(action.type === "link"){
        window.open(action.value, "_blank", "noopener");
      } else {
        showToast(action.value);
      }
    });
  });
}

function renderKbResults(){
  const list = currentKbMatches();
  el("#kb-result-count").textContent = `${list.length} issue${list.length===1?'':'s'} in the knowledge base`;
  renderKbList(list, el("#kb-list"));
}

function openKbEntry(id){
  setView("kb");
  state.kbFilterPlat = "all"; state.kbFilterSev = "all"; state.kbQuery = "";
  el("#kb-search-input").value = "";
  state.openCards.add(id);
  renderKbFilters();
  renderKbResults();
  requestAnimationFrame(()=>{
    const card = document.querySelector(`.kb-card[data-id="${id}"]`);
    if(card) card.scrollIntoView({behavior:"smooth", block:"center"});
  });
}

/* ---------- Saved ---------- */
function renderSaved(){
  const list = KB.filter(k=>state.saved.has(k.id));
  el("#saved-count").textContent = list.length ? `${list.length} saved fix${list.length===1?'':'es'}` : "";
  if(list.length===0){
    el("#saved-list").innerHTML = `<div class="no-results">${ICON.bookmark}<div>Nothing saved yet. Star any fix in the Knowledge Base or Wizard results to keep it here for later.</div></div>`;
  } else {
    renderKbList(list, el("#saved-list"));
  }
}

/* ---------- Log Analysis ---------- */
function fmtTime(d){
  return d.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

function setLogStatus(text, cls){
  const s = el("#log-status");
  s.textContent = text || "";
  s.className = "log-status" + (cls ? " " + cls : "");
}

function runLogAnalysis(){
  const text = el("#log-textarea").value;
  if(!text.trim()){
    state.log.result = null;
    renderLogResults();
    return;
  }
  state.log.result = analyzeLogText(text);
  renderLogResults();
}

function renderLogResults(){
  const wrap = el("#log-results");
  const r = state.log.result;
  if(!r){
    wrap.innerHTML = "";
    return;
  }

  const sevRows = [
    { label:"Fatal / Critical / Panic", count:r.fatalCount, cls:"crit" },
    { label:"Error / Exception / Failed", count:r.errorCount, cls:"warn" },
    { label:"Warning", count:r.warnCount, cls:"info" }
  ];

  let html = `<div class="stat-grid">`;
  html += `
    <div class="stat-tile">
      <div class="stat-tile-top"><span class="stat-label">Lines analyzed</span></div>
      <div class="stat-value">${r.analyzedLines.toLocaleString()}</div>
      <div class="stat-note">${r.truncated ? `of ${r.totalLines.toLocaleString()} total — showing the most recent 5,000` : "entire log"}</div>
    </div>`;
  sevRows.forEach(row=>{
    html += `
    <div class="stat-tile">
      <div class="stat-tile-top"><span class="stat-label">${esc(row.label)}</span>
        <span class="stat-chip ${row.count>0?row.cls:'ok'}">${row.count>0?'found':'none'}</span></div>
      <div class="stat-value">${row.count.toLocaleString()}</div>
    </div>`;
  });
  html += `</div>`;

  html += `<div class="panel">
    <div class="panel-head"><div class="panel-title">${ICON.pulse}Matched knowledge-base signatures</div></div>`;
  if(r.matches.length === 0){
    html += `<div class="empty-good">${ICON.check}<span>No known error signatures recognized in this text. That doesn't mean nothing's wrong — try the Diagnose Wizard, or search the Knowledge Base for specific error text.</span></div>`;
  } else {
    html += `<div class="finding-list">${r.matches.map((m,i)=>`
      <div class="finding" data-kb="${m.id}" data-idx="${i}">
        <div class="finding-sev ${m.count>3?'high':'medium'}"></div>
        <div class="finding-body">
          <div class="finding-title">${esc(m.label)}</div>
          <div class="finding-meta">Matched ${m.count} line${m.count===1?'':'s'} ${m.example ? `· e.g. <code>${esc(m.example)}</code>` : ""}</div>
        </div>
        <div class="finding-arrow">${ICON.chevron}</div>
      </div>`).join("")}</div>`;
  }
  if(r.fatalExceptions > 0){
    html += `<div class="finding" style="margin-top:10px; cursor:default;">
      <div class="finding-sev medium"></div>
      <div class="finding-body">
        <div class="finding-title">${r.fatalExceptions} Android "FATAL EXCEPTION" crash trace${r.fatalExceptions===1?'':'s'} found</div>
        <div class="finding-meta">Generic app crash traces — not tied to one specific knowledge-base entry. Use the Diagnose Wizard → Android → Freezes or crashes for the closest matching guidance.</div>
      </div>
    </div>`;
  }
  html += `</div>`;

  if(r.topRepeated.length){
    html += `<div class="panel">
      <div class="panel-head"><div class="panel-title">${ICON.activity}Most repeated messages</div></div>
      <div class="finding-list">${r.topRepeated.map(([line,count])=>`
        <div class="finding" style="cursor:default;">
          <div class="finding-sev low"></div>
          <div class="finding-body">
            <div class="finding-title" style="font-family:var(--font-mono); font-size:12.5px; font-weight:500;">${esc(line)}</div>
            <div class="finding-meta">Repeated ${count} times</div>
          </div>
        </div>`).join("")}</div>
    </div>`;
  }

  wrap.innerHTML = html;
  els(".finding[data-kb]", wrap).forEach(node=>{
    node.addEventListener("click", ()=>{
      const kbId = node.dataset.kb;
      if(kbId) openKbEntry(kbId);
    });
  });
}

async function pickAndWatchLogFile(){
  if(!window.showOpenFilePicker){
    showToast("Live file watching isn't supported in this browser — try Chrome or Edge on desktop");
    return;
  }
  let handle;
  try{
    [handle] = await window.showOpenFilePicker({
      types: [{ description:"Log files", accept: { "text/plain": [".txt",".log",".csv",".json"] } }],
      excludeAcceptAllOption: false,
      multiple: false
    });
  }catch(e){
    return; // user cancelled, or the picker was blocked in this context
  }

  stopWatchingLog();
  state.log.handle = handle;
  state.log.watching = true;
  state.log.fileName = handle.name;
  el("#log-watch-btn").querySelector("span:last-child").textContent = "Stop watching";

  let lastModified = 0;
  const poll = async ()=>{
    try{
      const file = await handle.getFile();
      if(file.lastModified !== lastModified){
        lastModified = file.lastModified;
        const text = await file.text();
        el("#log-textarea").value = text;
        state.log.result = analyzeLogText(text);
        renderLogResults();
      }
      setLogStatus(`Live — watching ${handle.name} · last checked ${fmtTime(new Date())}`, "live");
    }catch(e){
      setLogStatus(`Lost access to ${handle.name} — pick the file again to resume watching.`, "warn");
      stopWatchingLog();
    }
  };
  poll();
  state.log.timer = setInterval(poll, 3000);
}

function stopWatchingLog(){
  if(state.log.timer) clearInterval(state.log.timer);
  state.log.timer = null;
  state.log.watching = false;
  state.log.handle = null;
  const btn = el("#log-watch-btn");
  if(btn) btn.querySelector("span:last-child").textContent = "Watch this file live";
  if(!state.log.result) setLogStatus("");
}

function loadLogFile(file){
  state.log.fileName = file.name;
  const reader = new FileReader();
  reader.onload = ()=>{
    el("#log-textarea").value = String(reader.result || "");
    runLogAnalysis();
  };
  reader.onerror = ()=> showToast("Couldn't read that file");
  reader.readAsText(file);
}

function wireLogView(){
  const dropzone = el("#log-dropzone");
  const fileInput = el("#log-file-input");

  el("#log-file-btn").addEventListener("click", ()=> fileInput.click());
  fileInput.addEventListener("change", ()=>{
    if(fileInput.files[0]) loadLogFile(fileInput.files[0]);
    fileInput.value = "";
  });

  ["dragover","dragenter"].forEach(evt => dropzone.addEventListener(evt, (e)=>{
    e.preventDefault(); dropzone.classList.add("drag");
  }));
  ["dragleave","dragend"].forEach(evt => dropzone.addEventListener(evt, ()=> dropzone.classList.remove("drag")));
  dropzone.addEventListener("drop", (e)=>{
    e.preventDefault();
    dropzone.classList.remove("drag");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if(file) loadLogFile(file);
  });

  el("#log-analyze-btn").addEventListener("click", ()=>{
    if(!state.log.watching) runLogAnalysis();
  });

  el("#log-clear-btn").addEventListener("click", ()=>{
    el("#log-textarea").value = "";
    state.log.result = null;
    stopWatchingLog();
    setLogStatus("");
    renderLogResults();
  });

  const watchBtn = el("#log-watch-btn");
  if(window.showOpenFilePicker){
    watchBtn.style.display = "inline-flex";
    watchBtn.addEventListener("click", ()=>{
      if(state.log.watching){ stopWatchingLog(); setLogStatus(""); }
      else{ pickAndWatchLogFile(); }
    });
  }
}

/* ---------- Diagnostic report (for pasting to an AI assistant) ---------- */
function buildDiagnosticReport(){
  const lines = [];
  const now = new Date();
  const r = state.scanResults;
  const log = state.log.result;

  lines.push("TECHFIX DIAGNOSTIC REPORT");
  lines.push(`Generated ${now.toLocaleString()}`);
  if(r){
    const plat = PLAT_META[r.platformGroup] || PLAT_META.gen;
    lines.push(`Detected platform: ${plat.label}`);
  }
  lines.push("");

  if(r){
    lines.push("── LIVE DEVICE SCAN (browser-level signals only — see caveat below) ──");
    const storagePct = (r.storageQuota) ? r.storageUsage / r.storageQuota : null;
    lines.push(`Browser storage sandbox: ${storagePct==null ? "not available" : (storagePct*100).toFixed(0)+"% of "+fmtBytes(r.storageQuota)+" in use"} (this is NOT real disk free space — it's a per-tab quota Chrome grants this page)`);
    lines.push(`Memory ceiling: ${r.memory ? r.memory+"GB reported" : "not exposed by this browser"}${r.cores ? ", "+r.cores+" logical cores" : ""} (device capability, not current load)`);
    lines.push(`Connection quality estimate: ${r.online===false ? "OFFLINE" : "online"}${r.connType ? " · "+r.connType.toUpperCase()+"-class" : ""}${r.downlink ? " · ~"+r.downlink+"Mbps" : ""}${r.rtt ? " · "+r.rtt+"ms RTT" : ""} (a rough Chrome heuristic — NOT the literal network type; this labels Wi-Fi/Ethernet with cellular-sounding names too)`);
    lines.push(`Battery: ${r.battery ? Math.round(r.battery.level*100)+"% · "+(r.battery.charging?"charging":"on battery") : "not available"}`);
    lines.push(`Display: ${r.screenW}×${r.screenH} @ ${r.dpr}x`);
    lines.push("");
    if(state.scanFindings.length === 0){
      lines.push("Findings: none of the (narrow) signals a browser can read looked abnormal. This is NOT a clean bill of health — real disk health, running processes, driver/service status, and crash history are invisible to a webpage and were not checked.");
    } else {
      lines.push(`Findings (${state.scanFindings.length}):`);
      state.scanFindings.forEach(f=>{
        lines.push(`  [${f.severity.toUpperCase()}] ${f.title} — ${f.detail}`);
      });
    }
    lines.push("");
  } else {
    lines.push("── LIVE DEVICE SCAN ──");
    lines.push("No scan has been run yet (open the Live Scan tab to run one).");
    lines.push("");
  }

  if(log){
    lines.push("── LOG ANALYSIS ──");
    lines.push(`Lines analyzed: ${log.analyzedLines}${log.truncated ? ` (of ${log.totalLines} total, most recent 5,000 shown)` : ""}`);
    lines.push(`Severity counts: ${log.fatalCount} fatal/critical · ${log.errorCount} error · ${log.warnCount} warning`);
    lines.push("");
    if(log.matches.length === 0){
      lines.push("Matched knowledge-base signatures: none recognized.");
    } else {
      lines.push(`Matched knowledge-base signatures (${log.matches.length}):`);
      log.matches.forEach(m=>{
        lines.push(`  - ${m.label} — ${m.count} line(s)${m.example ? `, e.g. "${m.example}"` : ""}`);
      });
    }
    if(log.fatalExceptions > 0){
      lines.push(`  - ${log.fatalExceptions} generic Android "FATAL EXCEPTION" crash trace(s) (not tied to a specific KB entry)`);
    }
    if(log.topRepeated.length){
      lines.push("");
      lines.push("Most repeated messages:");
      log.topRepeated.forEach(([line,count])=> lines.push(`  - "${line}" × ${count}`));
    }
    lines.push("");
  }

  lines.push("── FOR THE AI READING THIS ──");
  lines.push("This report was generated by TechFix, a browser-based diagnostic tool, from signals available to a web page (not deep OS access). Please help interpret these findings and suggest next steps, and ask me what I was doing when the problem started if that would help.");

  return lines.join("\n");
}

function copyDiagnosticReport(){
  if(!state.scanResults && !state.log.result){
    showToast("Run a scan or analyze a log first, then copy the report");
    return;
  }
  copyToClipboard(buildDiagnosticReport(), "Diagnostic report copied — paste it into your chat with Claude");
}

/* ---------- Global search (header) ---------- */
function wireGlobalSearch(){
  const input = el("#global-search-input");
  input.addEventListener("input", ()=>{
    const q = input.value;
    if(q.trim().length){
      state.kbQuery = q;
      setView("kb");
      el("#kb-search-input").value = q;
      renderKbFilters();
      renderKbResults();
    }
  });
  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){ input.value=""; input.blur(); }
  });
  document.addEventListener("keydown", (e)=>{
    if((e.key === "/" ) && document.activeElement.tagName !== "INPUT"){
      e.preventDefault(); input.focus();
    }
  });
}

/* ---------- Static icon hydration & nav counts ---------- */
function hydrateStaticIcons(){
  els(".ico[data-icon]").forEach(span=>{
    const name = span.dataset.icon;
    if(ICON[name]) span.innerHTML = ICON[name];
  });
}
function updateNavCounts(){
  el("#nav-kb-count").textContent = KB.length;
  el("#nav-saved-count").textContent = state.saved.size || "";
}

/* ---------- Boot ---------- */
function boot(initial){
  loadLocal();
  hydrateStaticIcons();
  updateNavCounts();

  els(".nav-item").forEach(btn=>{
    btn.addEventListener("click", ()=> setView(btn.dataset.view));
  });

  el("#scan-btn").addEventListener("click", runScan);
  el("#scan-copy-report-btn").addEventListener("click", copyDiagnosticReport);
  el("#log-copy-report-btn").addEventListener("click", copyDiagnosticReport);

  el("#wiz-back").addEventListener("click", wizardBack);
  el("#wiz-restart").addEventListener("click", wizardRestart);

  el("#kb-search-input").addEventListener("input", (e)=>{
    state.kbQuery = e.target.value; renderKbResults(); snapshotHot();
  });

  wireLogView();
  wireGlobalSearch();
  renderKbFilters();
  renderKbResults();
  renderWizard();
  renderSaved();
  renderScan();

  const startView = (initial && initial.view) || "scan";
  setView(startView);

  // Run an initial scan automatically so the dashboard opens in a live, populated state.
  runScan();
}

if (window.claude?.hot?.ready) {
  window.claude.hot.ready((data)=> boot(data));
} else {
  boot(window.claude?.hot?.data ?? {});
}

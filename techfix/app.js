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

/* ---------- Offline "closest known issue" matching ----------
   LOG_SIGNATURES above are exact, hand-picked regexes — precise but only ever
   as wide as the list TechFix's authors thought to write. Martin asked for
   TechFix to lean on its knowledge base (now ~180 entries, 1980-present,
   PCs and phones) to recognize problems that AREN'T an exact signature match
   too — i.e. "AI-style" detection of new/unlisted problems, done with zero
   network access: pure token-overlap scoring against the KB's own text,
   entirely in this tab. It is explicitly NOT a confirmed diagnosis — every
   caller must present it as "closest known issue", never as a match. */
const STOPWORDS = new Set(["the","a","an","and","or","to","of","in","on","at","for","with","is","was","were","are","be",
  "this","that","it","its","as","by","from","has","have","had","not","no","but","if","then","than","so","can","could",
  "will","would","should","may","might","after","before","during","while","when","your","you","i","we","our","their",
  "device","phone","computer","pc","mac","android","ios","windows","error","failed","failure","issue","problem"]);

function tokenize(text){
  return String(text||"").toLowerCase().replace(/0x[0-9a-f]+/gi,"").split(/[^a-z0-9]+/i)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

let _kbTokenIndex = null;
function kbTokenIndex(){
  if(_kbTokenIndex) return _kbTokenIndex;
  _kbTokenIndex = KB.map(entry => ({
    entry,
    title: new Set(tokenize(entry.title)),
    body: new Set(tokenize([entry.title, ...(entry.symptoms||[]), ...(entry.causes||[])].join(" "))),
    tags: new Set((entry.tags||[]).map(t=>t.toLowerCase()))
  }));
  return _kbTokenIndex;
}

// Weighted overlap: a hit on a KB entry's title or tags counts far more than
// a hit buried in its symptom/cause prose, since titles/tags are the terms
// an author chose to name the issue by.
function fuzzyKbMatches(text, { max = 3, minScore = 3 } = {}){
  const qTokens = new Set(tokenize(text));
  if(qTokens.size === 0) return [];
  const scored = [];
  for(const row of kbTokenIndex()){
    let score = 0;
    for(const t of qTokens){
      if(row.title.has(t)) score += 3;
      else if(row.tags.has(t)) score += 2;
      else if(row.body.has(t)) score += 1;
    }
    if(score >= minScore) scored.push({ entry: row.entry, score });
  }
  scored.sort((a,b)=> b.score - a.score);
  return scored.slice(0, max);
}

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

  // Closest-known-issue pass (offline, no network): only for repeated lines that
  // read as an actual error/failure and weren't already pinned to an exact
  // LOG_SIGNATURES match — this is where an unlisted problem gets a best-effort
  // pointer into the KB instead of silently producing nothing.
  const matchedIds = new Set(matches.map(m=>m.id));
  const errorish = /\b(error|exception|fail|failed|failure|crash|panic|fatal|denied|timeout|timed out|cannot|can't|unable|not responding|not found|refused)\b/i;
  const fuzzySuggestions = [];
  const seenFuzzyIds = new Set();
  for(const [line, count] of topRepeated){
    if(!errorish.test(line)) continue;
    if([...LOG_SIGNATURES].some(sig => matchedIds.has(sig.id) && sig.pattern.test(line))) continue;
    for(const { entry, score } of fuzzyKbMatches(line, { max: 1 })){
      if(seenFuzzyIds.has(entry.id)) continue;
      seenFuzzyIds.add(entry.id);
      fuzzySuggestions.push({ id: entry.id, title: entry.title, fromLine: line, count, score });
      if(fuzzySuggestions.length >= 5) break;
    }
    if(fuzzySuggestions.length >= 5) break;
  }

  return {
    totalLines: allLines.length,
    analyzedLines: lines.length,
    truncated,
    fatalCount, errorCount, warnCount, fatalExceptions,
    topRepeated,
    matches,
    fuzzySuggestions
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
  log: { result: null, watching: false, handle: null, timer: null, fileName: null },
  native: { result: null, fixes: [] }
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

/* ---------- Cockpit instruments (gauges + annunciator lights) ----------
   A bridge/cockpit-style readout for the same honest numbers the tiles already
   show — nothing here is a new data source, just a nicer instrument for a
   real percentage TechFix already has (storage used, battery level, real
   memory/disk usage from a native scan). Categorical values (platform,
   display res) stay as plain text — a dial implies a measurable quantity,
   and forcing one on a category would be the same kind of dishonest reading
   the September pass removed from the plain tiles. */
function polarToXY(cx, cy, r, deg){
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function arcPath(cx, cy, r, startDeg, endDeg){
  const [x1,y1] = polarToXY(cx,cy,r,startDeg);
  const [x2,y2] = polarToXY(cx,cy,r,endDeg);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
function gaugeTier(pct, dangerAbove){
  if(pct == null) return "info";
  if(pct > dangerAbove) return "crit";
  if(pct > dangerAbove - 0.2) return "warn";
  return "ok";
}
function gaugeSVG({ pct, tier, valueLabel, unitLabel }){
  const cx = 60, cy = 62, r = 44, START = 125, SWEEP = 290;
  const p = pct == null ? 0 : Math.max(0, Math.min(1, pct));
  const valDeg = START + SWEEP * p;
  const color = tier === "crit" ? "var(--crit)" : tier === "warn" ? "var(--warn)" : tier === "info" ? "var(--border-soft)" : "var(--gold-2)";
  let ticks = "";
  const TICKS = 10;
  for(let i=0;i<=TICKS;i++){
    const d = START + (SWEEP*i/TICKS);
    const [x1,y1] = polarToXY(cx,cy,r+6,d);
    const [x2,y2] = polarToXY(cx,cy,r+11,d);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--border-soft)" stroke-width="1.4"/>`;
  }
  return `<svg viewBox="0 0 120 124" class="gauge-svg" aria-hidden="true">
    <path d="${arcPath(cx,cy,r,START,START+SWEEP)}" fill="none" stroke="var(--surface-3)" stroke-width="9" stroke-linecap="round"/>
    ${pct != null ? `<path d="${arcPath(cx,cy,r,START,valDeg)}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>` : ""}
    ${ticks}
    <circle cx="${cx}" cy="${cy}" r="${r-15}" fill="var(--surface-2)" stroke="var(--border-soft)" stroke-width="1"/>
    <text x="${cx}" y="${cy-1}" text-anchor="middle" class="gauge-value">${esc(valueLabel)}</text>
    <text x="${cx}" y="${cy+15}" text-anchor="middle" class="gauge-unit">${esc(unitLabel||"")}</text>
  </svg>`;
}
function annunciatorRow(counts){
  // counts: {crit, high, medium, low} — lights up like a warning-light strip, dark when zero.
  const defs = [
    { key:"crit", cls:"crit", label:"CRIT" },
    { key:"high", cls:"warn", label:"WARN" },
    { key:"ok", cls:"ok", label:"OK" }
  ];
  const crit = (counts.crit||0) + (counts.high||0);
  const warn = (counts.medium||0) + (counts.low||0);
  const clean = crit===0 && warn===0;
  return `<div class="annunciator-row">
    <div class="annunciator ${crit>0?'on':''}"><span class="lamp crit"></span>CRIT${crit>0?` · ${crit}`:''}</div>
    <div class="annunciator ${warn>0 && crit===0?'on':''}"><span class="lamp warn"></span>WARN${warn>0?` · ${warn}`:''}</div>
    <div class="annunciator ${clean?'on':''}"><span class="lamp ok"></span>CLEAR</div>
  </div>`;
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
    <div class="stat-tile has-gauge">
      <div class="stat-tile-top"><span class="stat-label">This tab's storage sandbox</span>
        <span class="stat-chip ${storagePct==null?'info':sevChipClass(storagePct)}">${storagePct==null?'N/A':(storagePct>0.9?'critical':storagePct>0.7?'watch':'fine')}</span></div>
      ${gaugeSVG({ pct: storagePct, tier: gaugeTier(storagePct, 0.9), valueLabel: storagePct==null?'—':(storagePct*100).toFixed(0)+'%', unitLabel:'USED' })}
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
    <div class="stat-tile has-gauge">
      <div class="stat-tile-top"><span class="stat-label">Battery</span>
        <span class="stat-chip ${r.battery ? (r.battery.level<=0.2 && !r.battery.charging?'crit':(r.battery.charging?'info':'ok')) : 'info'}">${r.battery ? (r.battery.charging?'charging':'on battery') : 'n/a'}</span></div>
      ${gaugeSVG({ pct: r.battery ? r.battery.level : null, tier: r.battery ? (r.battery.level<=0.2 && !r.battery.charging ? 'crit' : (r.battery.charging ? 'info' : 'ok')) : 'info', valueLabel: r.battery ? Math.round(r.battery.level*100)+'%' : '—', unitLabel: r.battery ? (r.battery.charging?'CHARGING':'ON BATTERY') : 'N/A' })}
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
  const medium = state.scanFindings.filter(f=>f.severity==="medium").length;
  const low = state.scanFindings.filter(f=>f.severity==="low").length;
  summary.className = "status-pill always";
  if(crit>0){ summary.innerHTML = `<span class="status-dot crit"></span> ${crit} critical finding${crit>1?'s':''}`; }
  else if(high>0){ summary.innerHTML = `<span class="status-dot warn"></span> ${high} finding${high>1?'s':''} to review`; }
  else if(state.scanFindings.length>0){ summary.innerHTML = `<span class="status-dot warn"></span> ${state.scanFindings.length} minor note${state.scanFindings.length>1?'s':''}`; }
  else { summary.innerHTML = `<span class="status-dot"></span> Scan clean`; }
  const annunciators = el("#scan-annunciators");
  if(annunciators) annunciators.innerHTML = annunciatorRow({ crit, high, medium, low });

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

/* ---------- Native diagnostics (installed Windows app only) ----------
   window.techfixNative only exists inside the factory-built Electron app,
   and only for this one app id (see diagnostics-preload.js). On the web,
   on Android, and in every other MartinB app it's simply undefined, so
   all of this is inert there — the panel stays hidden and nothing here runs. */
const SEV_RANK = { critical:0, high:1, medium:2, low:3 };
// Long (10 min to hours) or PC-restarting repairs: offered per finding, never chained by "Diagnose deeply & resolve".
const DEEP_RESOLVE_MANUAL = new Set(["sfc-scan","dism-restore","chkdsk-scan","component-cleanup","defender-full","defender-offline","defender-quick","remove-threats"]);

function renderNativeResults(){
  const wrap = el("#native-results");
  const res = state.native.result;
  if(!res){
    wrap.innerHTML = `<div class="stat-note">Run a native scan to read real disk, memory, driver, and event-log state from Windows.</div>`;
    return;
  }
  if(!res.supported){
    wrap.innerHTML = `<div class="stat-note">${esc(res.message || "Native diagnostics aren't available on this platform yet.")}</div>`;
    return;
  }
  if(res.error){
    wrap.innerHTML = `<div class="stat-note">Scan failed: ${esc(res.error)}</div>`;
    return;
  }

  const sys = res.system || {};
  const memPct = res.memory && res.memory.totalKB ? Math.round((1 - res.memory.freeKB/res.memory.totalKB)*100) : null;
  const sysLine = `${esc(sys.caption||"Windows")} (build ${esc(sys.build||"?")}) · ${res.admin ? "Administrator" : "standard user"} · RAM ${memPct==null?'—':memPct+'%'} in use`;

  const findings = (res.findings||[]).slice().sort((a,b)=>(SEV_RANK[a.severity]??9)-(SEV_RANK[b.severity]??9));
  const primaryDisk = (res.disks||[])[0];
  const diskPct = primaryDisk && primaryDisk.sizeBytes ? (1 - primaryDisk.freeBytes/primaryDisk.sizeBytes) : null;
  const sevCounts = {
    crit: findings.filter(f=>f.severity==="critical").length, high: findings.filter(f=>f.severity==="high").length,
    medium: findings.filter(f=>f.severity==="medium").length, low: findings.filter(f=>f.severity==="low").length
  };
  const cockpitRow = `<div class="cockpit-row">
    <div class="gauge-card">${gaugeSVG({ pct: memPct==null?null:memPct/100, tier: gaugeTier(memPct==null?null:memPct/100, 0.9), valueLabel: memPct==null?'—':memPct+'%', unitLabel:'MEMORY' })}<div class="gauge-label">Memory</div></div>
    <div class="gauge-card">${gaugeSVG({ pct: diskPct, tier: gaugeTier(diskPct, 0.9), valueLabel: diskPct==null?'—':Math.round(diskPct*100)+'%', unitLabel: primaryDisk ? primaryDisk.id+' USED' : 'DISK' })}<div class="gauge-label">${esc(primaryDisk ? primaryDisk.id : "Disk")}</div></div>
    <div class="gauge-card" style="justify-content:center; min-height:98px;">${annunciatorRow(sevCounts)}<div class="gauge-label" style="margin-top:10px;">Status</div></div>
  </div>`;

  if(findings.length === 0){
    wrap.innerHTML = `${cockpitRow}<div class="stat-note" style="margin-bottom:10px;">${esc(sysLine)}</div>
      <div class="empty-good">${ICON.check}<span><strong>Nothing found</strong> — disk health, driver errors, the event log, pending reboot, and network all checked clean just now.</span></div>`;
    return;
  }

  wrap.innerHTML = `${cockpitRow}<div class="stat-note" style="margin-bottom:10px;">${esc(sysLine)}</div>
    <div class="finding-list">${findings.map((f,i)=>{
      const kb = f.kbId ? KB.find(k=>k.id===f.kbId) : null;
      // No exact KB id on this finding (e.g. a generic native-scan detail) — offline
      // token-overlap search against the whole KB for a "closest known issue" instead
      // of just showing bare text with nothing to follow up on.
      const fuzzy = (!kb && f.detail) ? fuzzyKbMatches(f.detail, { max: 1 })[0] : null;
      const title = kb ? kb.title : f.detail;
      const linkTarget = kb ? kb.id : (fuzzy ? fuzzy.entry.id : null);
      return `
      <div class="finding" data-idx="${i}">
        <div class="finding-sev ${f.severity}"></div>
        <div class="finding-body">
          <div class="finding-title">${esc(title)}</div>
          <div class="finding-meta">${esc(f.detail)}</div>
          ${fuzzy ? `<div class="finding-meta" style="margin-top:4px;">Closest known issue (pattern match, not confirmed): <strong>${esc(fuzzy.entry.title)}</strong></div>` : ""}
          ${f.safeFixId || f.riskyFixId ? `<div class="finding-meta" style="margin-top:6px;" data-fix-row="${i}"></div>` : ""}
        </div>
        ${linkTarget ? `<div class="finding-arrow" data-kb="${linkTarget}">${ICON.chevron}</div>` : ""}
      </div>`;
    }).join("")}</div>`;

  els(".finding .finding-arrow", wrap).forEach(node=>{
    node.addEventListener("click", ()=> openKbEntry(node.dataset.kb));
  });

  findings.forEach((f,i)=>{
    if(!f.safeFixId && !f.riskyFixId) return;
    const row = wrap.querySelector(`[data-fix-row="${i}"]`);
    if(!row) return;
    if(f.safeFixId){
      const btn = document.createElement("button");
      btn.className = "btn sm primary";
      btn.innerHTML = `${ICON.wrench}<span>Fix now</span>`;
      btn.addEventListener("click", (e)=>{ e.stopPropagation(); runNativeFix(f.safeFixId, btn); });
      row.appendChild(btn);
    }
    if(f.riskyFixId){
      const entry = state.native.fixes.find(x=>x.id===f.riskyFixId);
      const btn = document.createElement("button");
      btn.className = "btn sm ghost";
      btn.style.marginLeft = f.safeFixId ? "8px" : "0";
      btn.innerHTML = `${ICON.wrench}<span>${entry ? entry.label : "Fix…"}</span>`;
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        const cmd = entry ? entry.cmd : f.riskyFixId;
        if(confirm(`Run this now?\n\n${cmd}\n\nThis changes real system state on this PC.`)){
          runNativeFix(f.riskyFixId, btn);
        }
      });
      row.appendChild(btn);
    }
  });
}

async function runNativeFix(fixId, btn){
  if(btn){ btn.disabled = true; }
  try{
    const result = await window.techfixNative.fix(fixId);
    showToast(result.ok ? `Done — ${result.message}` : `Could not apply fix: ${result.message}`);
    await runNativeScan(true);
  }catch(e){
    showToast("Fix failed: " + (e && e.message ? e.message : e));
    if(btn){ btn.disabled = false; }
  }
}

async function runNativeScan(silent){
  if(!window.techfixNative) return;
  const btn = el("#native-scan-btn");
  if(btn && !silent){ btn.disabled = true; btn.querySelector("span:last-child").textContent = "Scanning…"; }
  try{
    const [result, fixes] = await Promise.all([window.techfixNative.scan(), window.techfixNative.listFixes()]);
    state.native.result = result;
    state.native.fixes = fixes || [];
  }catch(e){
    state.native.result = { supported:true, error: String(e && e.message ? e.message : e) };
  }
  renderNativeResults();
  if(btn){ btn.disabled = false; btn.querySelector("span:last-child").textContent = "Run native scan"; }
}

function renderResolveLog(){
  const wrap = el("#native-resolve-log");
  if(!wrap) return;
  const log = state.native.resolveLog;
  if(!log || !log.length){ wrap.innerHTML = ""; return; }
  wrap.innerHTML = `<div class="panel" style="margin-top:12px;">
    <div class="panel-title" style="font-size:13px;">${ICON.activity} Resolution log</div>
    <div style="font-family:var(--font-mono); font-size:12px; color:var(--text-dim); line-height:1.6; margin-top:6px;">
      ${log.map(l=>esc(l)).join("<br>")}
    </div>
  </div>`;
}

// One upfront, specific consent, then TechFix keeps scanning and fixing on its own —
// exactly what Martin asked for: go deep, not surface-level, and when a real fix is
// available, apply it with the best knowledge TechFix has, repeating until either the
// device comes up clean or nothing more is fixable, rather than stopping at one suggestion.
async function runDeepResolve(){
  if(!window.techfixNative) return;
  const resolveBtn = el("#native-resolve-btn");
  if(!state.native.fixes.length){
    try{ state.native.fixes = await window.techfixNative.listFixes(); }catch(e){}
  }
  // Repairs that take a long time (or restart the PC) are never chained automatically — they stay
  // available as their own buttons on each finding, where you start them knowingly.
  const autoOk = (id)=> !!id && !id.startsWith("open-") && !DEEP_RESOLVE_MANUAL.has(id) && !(state.native.fixes.find(x=>x.id===id)||{}).manualOnly;
  const safeList = state.native.fixes.filter(f=>f.tier==="safe" && autoOk(f.id)).map(f=>f.label);
  const riskyList = state.native.fixes.filter(f=>f.tier==="risky" && autoOk(f.id)).map(f=>`${f.label} — exact command: ${f.cmd}`);
  const consent = [
    "TechFix will scan this PC for real problems, then keep fixing and re-scanning on its own — up to 5 passes — until either it's clean or nothing more is fixable by the actions below. It will only ever use these, and only when a matching problem is actually found:",
    "",
    "Always, no further asking:",
    ...safeList.map(s=>"  - "+s),
    "",
    "Only if needed — you're approving all of these right now, once, instead of one at a time:",
    ...riskyList.map(s=>"  - "+s),
    "",
    "Proceed?"
  ].join("\n");
  if(!confirm(consent)) return;

  if(resolveBtn){ resolveBtn.disabled = true; resolveBtn.querySelector("span:last-child").textContent = "Resolving…"; }
  const log = [];
  let lastActionableCount = -1;
  let pass = 0;
  const MAX_PASSES = 5;

  for(; pass < MAX_PASSES; pass++){
    let result;
    try{ result = await window.techfixNative.scan(); }
    catch(e){ log.push(`✗ Scan failed: ${e && e.message ? e.message : e}`); break; }
    state.native.result = result;
    renderNativeResults();
    if(!result.supported || result.error) break;

    const pick = (f)=> autoOk(f.safeFixId) ? f.safeFixId : (autoOk(f.riskyFixId) ? f.riskyFixId : null);
    const actionable = (result.findings||[]).filter(f=>pick(f));
    if(actionable.length === 0) break;
    if(pass > 0 && actionable.length === lastActionableCount) break; // no progress since last pass — stop rather than spin
    lastActionableCount = actionable.length;

    const tried = new Set();
    for(const f of actionable){
      const fixId = pick(f);
      if(tried.has(fixId)) continue; // the same repair can answer several findings — run it once per pass
      tried.add(fixId);
      try{
        const r = await window.techfixNative.fix(fixId);
        log.push(`${r.ok ? "✓" : "✗"} [pass ${pass+1}] ${r.message}`);
      }catch(e){
        log.push(`✗ [pass ${pass+1}] ${fixId} failed: ${e && e.message ? e.message : e}`);
      }
    }
    renderResolveLog();
  }

  try{ state.native.result = await window.techfixNative.scan(); }catch(e){}
  state.native.resolveLog = log;
  renderNativeResults();
  renderResolveLog();

  if(resolveBtn){ resolveBtn.disabled = false; resolveBtn.querySelector("span:last-child").textContent = "Diagnose deeply & resolve"; }

  const remaining = (state.native.result && state.native.result.findings || []).length;
  showToast(remaining === 0
    ? `Clean — resolved everything it could across ${pass+1} pass${pass>0?'es':''}.`
    : `${log.filter(l=>l.startsWith("✓")).length} fix(es) applied across ${pass+1} pass${pass>0?'es':''} — ${remaining} finding(s) remain that need a part, a repair shop, or your own call. See the findings above.`);
}

function initNativeDiagnostics(){
  if(!window.techfixNative) return; // web / Android / every other MartinB app: nothing to do
  const panel = el("#native-panel");
  if(!panel) return;
  panel.hidden = false;
  el("#native-scan-btn").addEventListener("click", ()=> runNativeScan(false));
  el("#native-resolve-btn").addEventListener("click", runDeepResolve);
  renderNativeResults();
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

  if(r.fuzzySuggestions && r.fuzzySuggestions.length){
    html += `<div class="panel">
      <div class="panel-head"><div class="panel-title">${ICON.wand}Closest known issues (pattern match, not a confirmed signature)</div></div>
      <p style="font-size:12px; color:var(--text-dim); margin:0 0 12px;">These aren't exact knowledge-base matches like above — TechFix compared the repeated error text against every entry's title/symptoms/tags, offline, and these came closest. Worth a look, not a diagnosis.</p>
      <div class="finding-list">${r.fuzzySuggestions.map(s=>`
        <div class="finding" data-kb="${s.id}">
          <div class="finding-sev low"></div>
          <div class="finding-body">
            <div class="finding-title">${esc(s.title)}</div>
            <div class="finding-meta">From the repeated line <code>${esc(s.fromLine.slice(0,120))}</code></div>
          </div>
          <div class="finding-arrow">${ICON.chevron}</div>
        </div>`).join("")}</div>
    </div>`;
  }

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
    if(log.fuzzySuggestions && log.fuzzySuggestions.length){
      lines.push("");
      lines.push("Closest known issues (offline pattern match against the knowledge base — NOT a confirmed signature match):");
      log.fuzzySuggestions.forEach(s=> lines.push(`  - ${s.title} — from repeated line "${s.fromLine}"`));
    }
    if(log.topRepeated.length){
      lines.push("");
      lines.push("Most repeated messages:");
      log.topRepeated.forEach(([line,count])=> lines.push(`  - "${line}" × ${count}`));
    }
    lines.push("");
  }

  if(state.native.result && state.native.result.supported && !state.native.result.error){
    const nr = state.native.result;
    lines.push("── NATIVE WINDOWS SCAN (real OS state, not browser-limited) ──");
    const sys = nr.system || {};
    lines.push(`${sys.caption || "Windows"} build ${sys.build || "?"} — ${nr.admin ? "Administrator" : "standard user"}`);
    if(!nr.findings || nr.findings.length === 0){
      lines.push("Findings: none — disk health, Device Manager driver errors, the System event log, pending reboot, and network all checked clean.");
    } else {
      lines.push(`Findings (${nr.findings.length}):`);
      nr.findings.forEach(f=>{
        const kb = f.kbId ? KB.find(k=>k.id===f.kbId) : null;
        lines.push(`  [${f.severity.toUpperCase()}] ${kb ? kb.title : f.detail} — ${f.detail}`);
      });
    }
    lines.push("");
  }

  lines.push("── FOR THE AI READING THIS ──");
  lines.push(state.native.result && state.native.result.supported
    ? "This report combines TechFix's browser-level signals with a native Windows scan (real disk health, Device Manager, event log) from the installed app. Please help interpret these findings and suggest next steps, and ask me what I was doing when the problem started if that would help."
    : "This report was generated by TechFix, a browser-based diagnostic tool, from signals available to a web page (not deep OS access). Please help interpret these findings and suggest next steps, and ask me what I was doing when the problem started if that would help.");

  return lines.join("\n");
}

function copyDiagnosticReport(){
  if(!state.scanResults && !state.log.result && !state.native.result){
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
  initNativeDiagnostics();
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

/* ===================== TechFix — "Fix it" =====================
   One button on every solution that does the repair for you where the platform allows it:
   - Windows app: runs the linked native repairs (ids from the fixed table in diagnostics.js —
     the page never sends a command). Safe ones run straight away; ones that change system
     settings show their exact command with a tick box first. Then TechFix re-checks the PC.
   - Android app: Android doesn't let an app change system settings by itself, so the button
     opens the exact Settings screen to fix, with the steps alongside.
   - Web page: explains that the installed app is needed and links to it.
   Loaded before app.js; only uses app.js helpers at call time. */
"use strict";

const TF_INSTALL_URL = "https://github.com/fisbal/fisbal.github.io/releases/tag/techfix-latest";
const T = (s, p) => (typeof t === "function" ? t(s, p) : String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? p[k] : m)));

// Knowledge-base entry → what TechFix can do about it itself.
const KB_FIX = {
  "gen-sto-03": { win:["clear-windows-temp","empty-recycle-bin","component-cleanup","open-storage"], android:["storage","apps"] },
  "gen-sto-06": { win:["open-storage","component-cleanup"] },
  "win-10-02": { win:["open-startup-apps","clear-temp","chkdsk-scan"] },
  "win-vista-02": { win:["open-startup-apps","clear-temp"] },
  "win-11-04": { win:["open-startup-apps","clear-temp","open-power"] },
  "win-7-01": { win:["restart-wuauserv","reset-windows-update","open-windows-update"] },
  "win-10-01": { win:["clear-windows-temp","reset-windows-update","open-windows-update"] },
  "win-10-07": { win:["reset-windows-update","dism-restore","open-windows-update"] },
  "win-10-08": { win:["restart-wuauserv","reset-windows-update"] },
  "win-10-05": { win:["restart-wuauserv","reset-windows-update"] },
  "win-10-12": { win:["open-windows-update"] },
  "win-10-04": { win:["flush-dns","winsock-reset","release-renew-ip","open-network"] },
  "gen-net-01": { win:["flush-dns","release-renew-ip","winsock-reset","open-network"], android:["wifi","airplane"] },
  "gen-net-02": { win:["open-network"], android:["wifi"] },
  "gen-net-05": { win:["open-network"], android:["wifi"] },
  "gen-net-03": { win:["flush-dns","open-network"], android:["vpn"] },
  "gen-net-07": { win:["flush-dns","open-network"], android:["vpn"] },
  "gen-net-04": { win:["restart-bluetooth","open-bluetooth","open-device-manager"], android:["bluetooth"] },
  "win-11-05": { win:["restart-bluetooth","open-device-manager","open-network"] },
  "gen-hw-03": { win:["restart-spooler"] },
  "win-10-09": { win:["open-windows-update","restart-spooler"] },
  "gen-hw-04": { win:["restart-audio","open-sound","open-device-manager"], android:["apps","privacy"] },
  "win-vista-03": { win:["restart-audio","open-sound","open-device-manager"] },
  "win-vista-04": { win:["open-device-manager","open-windows-update"] },
  "win-7-03": { win:["open-memory-test","sfc-scan","open-windows-update"] },
  "win-10-03": { win:["sfc-scan","dism-restore","open-device-manager"] },
  "win-10-11": { win:["open-windows-update","open-device-manager"] },
  "win-7-02": { win:["restart-explorer","sfc-scan"] },
  "win-8-03": { win:["restart-explorer","sfc-scan"] },
  "win-11-02": { win:["restart-explorer"] },
  "win-11-03": { win:["restart-explorer","sfc-scan"] },
  "win-11-07": { win:["restart-explorer"] },
  "win-11-10": { win:["restart-explorer","sfc-scan"] },
  "win-8-02": { win:["reset-store-cache"] },
  "win-8-04": { win:["reset-store-cache"] },
  "win-7-04": { win:["open-activation"] },
  "win-7-06": { win:["open-activation"] },
  "win-11-09": { win:["open-device-encryption"] },
  "win-xp-05": { win:["firewall-on"] },
  "win-xp-03": { win:["defender-update","defender-quick","firewall-on"] },
  "win-xp-06": { win:["defender-update","defender-quick"] },
  "gen-pow-01": { win:["open-power"], android:["battery"] },
  "gen-pow-03": { win:["open-power"], android:["battery"] },
  "gen-pow-04": { win:["open-power","open-memory-test"] },
  "sec-01": { win:["cfa-on","defender-offline"] },
  "sec-02": { win:["pua-on","defender-quick","open-apps"] },
  "sec-03": { win:["defender-quick","open-apps"] },
  "sec-04": { win:["defender-update","defender-full","open-task-scheduler"] },
  "sec-05": { win:["reset-proxy","reset-hosts","defender-quick"] },
  "sec-06": { win:["defender-rtp-on","defender-update","open-windows-security"] },
  "sec-07": { android:["overlay","device-admin","play-protect","apps"] },
  "sec-08": { android:["device-admin","accessibility","notification-access","play-protect","accounts"] },
  "sec-09": { win:["defender-quick"], android:["accounts","security"] },
  "sec-10": { win:["smb1-off","rdp-off","firewall-on"] },
  "sec-11": { win:["open-startup-apps","open-task-scheduler","defender-offline"] },
  "and-lol-01": { android:["battery","battery-optimization"] },
  "and-oreo-01": { android:["battery-optimization","battery"] },
  "and-pie-01": { android:["battery-optimization"] },
  "and-mar-01": { android:["battery-optimization","notifications"] },
  "and-mar-02": { android:["battery-optimization","notifications"] },
  "and-14-01": { android:["battery"] },
  "and-oem-07": { android:["battery"] },
  "and-oem-03": { android:["battery"] },
  "and-oem-10": { android:["battery"] },
  "and-kk-01": { android:["storage","apps"] },
  "and-oem-09": { android:["storage","apps"] },
  "and-early-01": { android:["storage","apps"] },
  "and-13-01": { android:["notifications"] },
  "and-13-02": { android:["notifications"] },
  "and-early-02": { android:["wifi"] },
  "and-oem-01": { android:["mobile-network","airplane"] },
  "and-oem-06": { android:["mobile-network","airplane"] },
  "and-11-01": { android:["date","accounts","apps"] },
  "and-oem-04": { android:["accounts","date"] },
  "and-10-01": { android:["apps"] },
  "and-10-02": { android:["apps"] },
  "and-11-02": { android:["apps"] },
  "and-oem-11": { android:["bluetooth"] },
  "and-nou-01": { android:["system-update"] },
  "and-nou-02": { android:["system-update"] }
};

const ANDROID_SETTINGS_LABEL = {
  "wifi":"Wi-Fi settings", "bluetooth":"Bluetooth settings", "mobile-network":"Mobile network settings", "airplane":"Airplane mode",
  "data-usage":"Data usage", "vpn":"VPN settings", "battery":"Battery settings", "battery-saver":"Battery saver",
  "battery-optimization":"Battery optimization (per app)", "storage":"Storage settings", "apps":"Apps", "default-apps":"Default apps",
  "overlay":"Display over other apps", "unknown-sources":"Install unknown apps", "accessibility":"Accessibility",
  "notification-access":"Notification access", "notifications":"Notifications", "device-admin":"Device admin apps",
  "security":"Security & screen lock", "privacy":"Privacy", "play-protect":"Google Play Protect", "accounts":"Accounts & sync",
  "date":"Date & time", "system-update":"System update", "about":"About phone", "developer":"Developer options",
  "display":"Display", "sound":"Sound", "location":"Location", "nfc":"NFC", "usage-access":"Usage access"
};

const tfHasWin = () => !!window.techfixNative;
const tfHasAndroid = () => !!window.TechFixAndroid;
const tfEsc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const TF_ICON_WRENCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 0 0 5.4-5.4z"/></svg>`;
const TF_ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const TF_ICON_NEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;

/* ---------- Sheet (in-app dialog) ---------- */
function openSheet({ title, html, actions, onMount }){
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "sheet-backdrop";
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head"><div class="sheet-title">${title}</div><button class="btn sm ghost sheet-x" aria-label="${tfEsc(T("Close"))}">${TF_ICON_CLOSE}</button></div>
      <div class="sheet-body">${html}</div>
      <div class="sheet-actions">${(actions||[]).map(a => `<button class="btn ${a.primary ? "primary" : "ghost"}" data-act="${tfEsc(a.id)}">${a.icon || ""}<span>${tfEsc(a.label)}</span></button>`).join("")}</div>
    </div>`;
    const close = (v) => { back.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if(e.key === "Escape") close(null); };
    back.addEventListener("click", (e) => { if(e.target === back) close(null); });
    back.querySelector(".sheet-x").addEventListener("click", () => close(null));
    back.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => close(b.dataset.act)));
    document.addEventListener("keydown", onKey);
    document.body.appendChild(back);
    if(onMount) onMount(back, close);
  });
}

/* ---------- Windows: run linked repairs ---------- */
let _tfFixes = [];
async function tfEnsureFixes(){
  if(!tfHasWin()) return [];
  if(!_tfFixes.length){ try{ _tfFixes = (await window.techfixNative.listFixes()) || []; }catch(e){ _tfFixes = []; } }
  return _tfFixes;
}
const tfFixById = (id) => _tfFixes.find(f => f.id === id) || null;

async function runFixPlan(ids, title){
  if(!tfHasWin()) return showInstallSheet();
  await tfEnsureFixes();
  const items = [...new Set(ids)].map(tfFixById).filter(Boolean);
  if(!items.length){ if(typeof showToast === "function") showToast(T("No automatic fix available for this one — follow the steps shown.")); return; }
  const html = `<p class="sheet-p">${tfEsc(T("TechFix will do this for you on this PC, in this order:"))}</p>
    <div class="fix-plan">${items.map(f => `
      <label class="fix-row ${f.tier}">
        <input type="checkbox" data-fix="${tfEsc(f.id)}" ${f.manualOnly ? "" : "checked"} ${f.tier === "safe" ? "disabled" : ""}>
        <span class="fix-row-text"><span class="fix-row-label">${tfEsc(T(f.label))}</span>
          ${f.tier === "safe" ? `<span class="fix-row-tag ok">${tfEsc(T("safe — runs straight away"))}</span>`
            : `<span class="fix-row-tag warn">${tfEsc(T("changes system settings — exact command:"))}</span><code>${tfEsc(f.cmd)}</code>`}
          ${f.manualOnly ? `<span class="fix-row-tag crit">${tfEsc(T("restarts the PC — tick only if you're ready"))}</span>` : ""}
        </span>
      </label>`).join("")}</div>
    <p class="sheet-note">${tfEsc(T("Windows may show an administrator prompt (UAC) for some steps — answer Yes to let TechFix make the change."))}</p>`;
  let chosen = [];
  const res = await openSheet({
    title: `${TF_ICON_WRENCH} ${tfEsc(title || T("Fix it"))}`, html,
    actions: [{ id:"cancel", label:T("Cancel") }, { id:"go", label:T("Fix it now"), primary:true, icon:TF_ICON_WRENCH }],
    onMount: (root) => root.querySelector('[data-act="go"]').addEventListener("click", () => {
      chosen = [...root.querySelectorAll("[data-fix]")].filter(c => c.checked).map(c => c.dataset.fix);
    }, true)
  });
  if(res !== "go" || !chosen.length) return;
  return executeFixes(chosen, title);
}

async function executeFixes(ids, title){
  let root = null;
  const html = `<div class="fix-progress">${ids.map(id => `<div class="fix-step" data-step="${tfEsc(id)}"><span class="mark wait">•</span><span>${tfEsc(T((tfFixById(id) || {}).label || id))}</span></div>`).join("")}</div><p class="sheet-note" id="fix-status"></p>`;
  const closed = openSheet({ title: `${TF_ICON_WRENCH} ${tfEsc(title || T("Fix it"))}`, html, actions: [{ id:"ok", label:T("Close"), primary:true }], onMount: (r) => { root = r; } });
  const results = [];
  for(const id of ids){
    const row = root && root.querySelector(`[data-step="${CSS.escape(id)}"]`);
    if(row){ row.classList.add("running"); row.querySelector(".mark").textContent = "…"; }
    let r;
    try{ r = await window.techfixNative.fix(id); }catch(e){ r = { ok:false, message:String(e && e.message || e) }; }
    results.push({ id, ...r });
    if(row){
      row.classList.remove("running");
      row.classList.add(r.ok ? "ok" : "bad");
      row.querySelector(".mark").textContent = r.ok ? "✓" : "✗";
      if(!r.ok) row.insertAdjacentHTML("beforeend", ` <small>${tfEsc(r.message === "cancelled" ? T("cancelled at the administrator prompt") : r.message)}</small>`);
    }
  }
  const status = root && root.querySelector("#fix-status");
  if(status) status.textContent = T("Re-checking this PC…");
  try{
    if(typeof runNativeScan === "function") await runNativeScan(true);
    if(typeof runSecurityScan === "function" && window.__tfSecurityRan) await runSecurityScan(true);
  }catch(e){}
  if(status) status.textContent = T("Done — the results are re-checked.");
  await closed;
  return results;
}

/* ---------- Android: open the exact Settings screen ---------- */
function openAndroidFix(keys, steps){
  const html = `<p class="sheet-p">${tfEsc(T("Android doesn't let an app change system settings by itself. Tap a button to jump straight to the right screen:"))}</p>
    <div class="fix-plan">${keys.map(k => `<button class="btn android-open" data-open="${tfEsc(k)}">${TF_ICON_NEXT}<span>${tfEsc(T(ANDROID_SETTINGS_LABEL[k] || k))}</span></button>`).join("")}</div>
    ${steps && steps.length ? `<div class="kb-block fixes" style="margin-top:12px;"><div class="kb-block-label">${tfEsc(T("Then follow these steps"))}</div><ol>${steps.map(s => `<li>${tfEsc(s)}</li>`).join("")}</ol></div>` : ""}`;
  return openSheet({
    title: `${TF_ICON_WRENCH} ${tfEsc(T("Fix it"))}`, html, actions: [{ id:"ok", label:T("Close"), primary:true }],
    onMount: (root) => root.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
      let ok = false;
      try{ ok = window.TechFixAndroid.openSettings(b.dataset.open); }catch(e){}
      if(!ok && typeof showToast === "function") showToast(T("This phone doesn't have that screen — opening Settings instead."));
    }))
  });
}

/* ---------- Web: explain + install link ---------- */
function showInstallSheet(){
  return openSheet({
    title: `${TF_ICON_WRENCH} ${tfEsc(T("Fix it"))}`,
    html: `<p class="sheet-p">${tfEsc(T("A web page isn't allowed to change your device. Install the free TechFix app and this button does the fix for you:"))}</p>
      <ul class="sheet-list"><li>${tfEsc(T("Windows: runs the repair itself (asks first for anything that changes system settings)."))}</li>
      <li>${tfEsc(T("Android: reads the phone's real state and opens the exact settings screen to fix."))}</li></ul>`,
    actions: [{ id:"cancel", label:T("Close") }, { id:"install", label:T("Get the TechFix app"), primary:true }]
  }).then(v => { if(v === "install") window.open(TF_INSTALL_URL, "_blank", "noopener"); });
}

/* ---------- Entry points used by app.js ---------- */
function entryHasFix(entry){
  const map = KB_FIX[entry.id];
  if(!map) return false;
  if(tfHasWin()) return !!(map.win && map.win.length);
  if(tfHasAndroid()) return !!(map.android && map.android.length);
  return !!((map.win && map.win.length) || (map.android && map.android.length));
}

function fixItForEntry(entry, localized){
  const map = KB_FIX[entry.id] || {};
  const title = (localized && localized.title) || entry.title;
  const steps = (localized && localized.fixes) || entry.fixes;
  if(tfHasWin() && map.win && map.win.length) return runFixPlan(map.win, title);
  if(tfHasAndroid() && map.android && map.android.length) return openAndroidFix(map.android, steps);
  return showInstallSheet();
}

// For a native finding: its own safe + risky repair, in one sheet.
function fixItForFinding(f, title){
  if(f.androidKey) return openAndroidFix([f.androidKey]);
  return runFixPlan([f.safeFixId, f.riskyFixId].filter(Boolean), title);
}

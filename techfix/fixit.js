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
  "gen-net-04": { win:["restart-bluetooth","open-bluetooth","rescan-devices","open-device-manager"], android:["bluetooth"] },
  "win-11-05": { win:["restart-bluetooth","open-device-manager","open-network"] },
  "gen-hw-03": { win:["restart-spooler"] },
  "win-10-09": { win:["open-windows-update","restart-spooler"] },
  "gen-hw-04": { win:["restart-audio","open-sound","rescan-devices","open-device-manager"], android:["apps","privacy"] },
  "win-vista-03": { win:["restart-audio","open-sound","rescan-devices","open-device-manager"] },
  "win-vista-04": { win:["rescan-devices","open-windows-update","rescan-devices","open-device-manager"] },
  "win-7-03": { win:["open-memory-test","sfc-scan","open-windows-update"] },
  "win-10-03": { win:["dism-restore","sfc-scan","rescan-devices"] },
  "win-10-11": { win:["open-windows-update","rescan-devices","open-device-manager"] },
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
        <input type="checkbox" data-fix="${tfEsc(f.id)}" ${f.manualOnly || f.kind === "open" ? "" : "checked"} ${f.tier === "safe" && f.kind !== "open" ? "disabled" : ""}>
        <span class="fix-row-text"><span class="fix-row-label">${tfEsc(T(f.label))}</span>
          ${f.kind === "open" ? `<span class="fix-row-tag">${tfEsc(T("opens a Windows screen — you finish the change there"))}</span>`
            : f.tier === "safe" ? `<span class="fix-row-tag ok">${tfEsc(T("safe — runs straight away"))}</span>`
            : `<span class="fix-row-tag warn">${tfEsc(T("changes system settings — exact command:"))}</span><code>${tfEsc(f.cmd)}</code>`}
          ${f.manualOnly ? `<span class="fix-row-tag crit">${tfEsc(T("restarts the PC — tick only if you're ready"))}</span>` : ""}
        </span>
      </label>`).join("")}</div>
    <p class="sheet-note">${tfEsc(T("Each step is measured before and after, so you see what really changed. Windows asks once for administrator permission (UAC) — answer Yes."))}</p>`;
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

/* ---------- Results: what really happened ---------- */
const TF_STATE = {
  fixed:    { label: "Fixed",          cls: "ok",   mark: "✓" },
  ok:       { label: "Nothing wrong",  cls: "ok",   mark: "✓" },
  reboot:   { label: "Restart needed", cls: "warn", mark: "↻" },
  partial:  { label: "Partly fixed",   cls: "warn", mark: "!" },
  failed:   { label: "Not fixed",      cls: "bad",  mark: "✗" },
  opened:   { label: "Opened",         cls: "info", mark: "↗" },
  started:  { label: "Started",        cls: "info", mark: "▶" },
  cancelled:{ label: "Cancelled",      cls: "bad",  mark: "–" }
};
// One sentence per verdict code (repair.js), translated in strings.js.
const TF_RESULT = {
  opened: "Opened — finish the change on that screen",
  svc_running: "{name} is running", svc_not_running: "Still not running: {name}", svc_started: "Started: {name}",
  already_set: "Already in the safe setting — nothing to change", setting_changed: "Setting changed and confirmed",
  setting_blocked: "Windows refused the change (a policy or another security app is blocking it)",
  nothing_to_clean: "Nothing to clean", nothing_freed: "Files in use — nothing could be deleted ({left} left)", freed: "Freed {size} ({left} left)",
  dns_ok: "Name lookups (DNS) work", dns_still_failing: "DNS still fails after flushing",
  net_ok: "Connected — internet and DNS work (IP {ip})", net_dns_broken: "Internet works but DNS doesn't",
  net_no_dhcp: "No address from the router (DHCP) — the network adapter or the router is the problem",
  net_isp: "Your router ({gw}) answers but the internet doesn't — the modem or the provider is down",
  net_no_router: "The router ({gw}) doesn't answer — check Wi-Fi or the cable, then restart the router",
  net_reset_reboot: "Network stack reset — restart the PC to finish", cmd_failed: "The command failed (code {code})",
  explorer_restarted: "Explorer restarted and running", explorer_down: "Explorer didn't come back — press Ctrl+Shift+Esc, File > Run new task, explorer.exe",
  dism_failed: "DISM failed (error {code})", dism_ok: "Windows image repaired — now run the system-file check again",
  dism_ok_reboot: "Windows image repaired — restart, then run the system-file check again",
  dism_no_source: "DISM couldn't find clean copies of the files ({code}) — it needs a Windows installation image",
  dism_no_download: "DISM couldn't download the repair files ({code}) — check the internet connection",
  sfc_unrepaired: "{n} damaged system file(s) could NOT be repaired", sfc_repaired: "{n} damaged system file(s) repaired — restart to finish",
  sfc_pending: "A previous repair is waiting for a restart — restart, then run it again", sfc_clean: "No damaged system files found",
  sfc_could_not_run: "The system-file check couldn't run", no_verdict: "No clear result — see the details",
  disk_clean: "No file-system errors found", disk_fixed: "File-system errors found and fixed",
  disk_needs_offline: "Errors found that can only be fixed during a restart", chkdsk_scheduled: "Disk repair will run at the next restart",
  devices_ok: "No device in error", devices_fixed: "{n} device(s) working again",
  devices_some: "{fixed} device(s) fixed, {n} still in error: {names}", devices_left: "{n} device(s) still in error: {names} — they need a new driver",
  printer_still_offline: "Print queue cleared ({jobs} stuck job(s)), but {n} printer(s) still offline — check power, cable or Wi-Fi",
  spooler_fixed: "Print queue cleared ({jobs} stuck job(s)) and spooler running",
  wu_reset: "Windows Update caches rebuilt, services running", wu_reset_locked: "Couldn't rename the update cache (in use) — restart the PC and try again",
  wu_reset_services: "Caches rebuilt, but not running: {name}", store_reset: "Store cache reset",
  defs_updated: "Definitions updated to {ver}", defs_current: "Definitions already up to date ({ver})", defs_update_failed: "Update failed: {msg}",
  scan_not_run: "The scan didn't run: {msg}", scan_found: "{n} threat(s) found: {names}", scan_clean: "No threats found",
  no_threats: "No active threats to remove", threats_left: "{n} threat(s) still active: {names}", threats_removed: "{n} threat(s) removed",
  scan_started: "Full scan running in the background", offline_scan_started: "The PC is restarting into the Defender Offline scan",
  rtp_on: "Real-time protection is on", other_av: "{name} is protecting this PC (Defender stays off on purpose)",
  rtp_blocked: "Windows refused — Tamper Protection or a policy keeps it off", firewall_on: "Firewall on for all networks",
  proxy_removed: "Proxy removed and confirmed", hosts_restored: "{n} suspicious line(s) removed — backup: {backup}",
  cancelled: "Cancelled at the administrator prompt", no_result: "No result came back (timed out or interrupted)", not_windows: "Only available on Windows"
};
const tfResultText = (r) => T(TF_RESULT[r.code] || TF_RESULT.no_verdict, r.params || {});

function tfRenderResult(row, r){
  const st = TF_STATE[r.state] || TF_STATE.failed;
  row.classList.remove("running");
  row.classList.add(st.cls);
  row.querySelector(".mark").textContent = st.mark;
  const out = r.out && r.state !== "opened" ? `<details class="fix-raw"><summary>${tfEsc(T("Details"))}</summary><pre>${tfEsc(r.out)}</pre></details>` : "";
  row.querySelector(".fix-step-body").insertAdjacentHTML("beforeend",
    `<div class="fix-verdict"><span class="fix-badge ${st.cls}">${tfEsc(T(st.label))}</span> <span>${tfEsc(tfResultText(r))}</span></div>${out}`);
}

async function executeFixes(ids, title){
  let root = null, closeSheet = null;
  const html = `<div class="fix-progress">${ids.map(id => `<div class="fix-step" data-step="${tfEsc(id)}"><span class="mark wait">•</span><div class="fix-step-body"><span class="fix-step-label">${tfEsc(T((tfFixById(id) || {}).label || id))}</span></div></div>`).join("")}</div>
    <p class="sheet-note" id="fix-status">${tfEsc(T("Working… some repairs take several minutes. Keep TechFix open."))}</p><div id="fix-next"></div>`;
  const closed = openSheet({ title: `${TF_ICON_WRENCH} ${tfEsc(title || T("Fix it"))}`, html, actions: [{ id:"ok", label:T("Close"), primary:true }], onMount: (r, c) => { root = r; closeSheet = c; } });
  const rowOf = (id) => root && root.querySelector(`[data-step="${CSS.escape(id)}"]`);
  let results = [];
  if(typeof window.techfixNative.fixPlan === "function"){
    const shown = new Set();
    const off = window.techfixNative.onFixProgress ? window.techfixNative.onFixProgress((ev) => {
      const row = rowOf(ev.id); if(!row) return;
      if(ev.phase === "start"){ row.classList.add("running"); row.querySelector(".mark").textContent = "…"; }
      if(ev.phase === "done" && ev.result && !shown.has(ev.id)){ shown.add(ev.id); tfRenderResult(row, ev.result); }
    }) : null;
    try{ results = await window.techfixNative.fixPlan(ids) || []; }catch(e){ results = ids.map(id => ({ id, state:"failed", code:"no_result" })); }
    if(off) off();
    results.forEach(r => { const row = rowOf(r.id); if(row && !shown.has(r.id)){ shown.add(r.id); tfRenderResult(row, r); } });
  } else {
    // Older app without the session engine: one call per step.
    for(const id of ids){
      const row = rowOf(id); if(row){ row.classList.add("running"); row.querySelector(".mark").textContent = "…"; }
      let r; try{ r = await window.techfixNative.fix(id); }catch(e){ r = { ok:false, message:String(e && e.message || e) }; }
      r = r.state ? r : { id, state: r.ok ? "fixed" : (r.message === "cancelled" ? "cancelled" : "failed"), code: r.ok ? "no_verdict" : (r.message === "cancelled" ? "cancelled" : "no_result") };
      results.push(r); if(row) tfRenderResult(row, r);
    }
  }
  const count = (st) => results.filter(r => st.includes(r.state)).length;
  const status = root && root.querySelector("#fix-status");
  if(status){
    const parts = [];
    const fixed = count(["fixed"]), fine = count(["ok"]), reboot = count(["reboot"]), bad = count(["failed","partial","cancelled"]);
    if(fixed) parts.push(T("{n} fixed", { n: fixed }));
    if(fine) parts.push(T("{n} had nothing wrong", { n: fine }));
    if(reboot) parts.push(T("{n} finish after a restart", { n: reboot }));
    if(bad) parts.push(T("{n} need more work", { n: bad }));
    status.textContent = (parts.join(" · ") || T("Done")) + " — " + T("Re-checking this PC…");
  }
  // Honest follow-up: when a repair says "this needs something stronger", offer exactly that.
  // Never re-suggest a repair that just ran — except SFC again right after a DISM that hasn't run yet
  // (Microsoft's order: DISM repairs the image, then SFC repairs files from it).
  const ran = new Set(ids);
  let next = [...new Set(results.flatMap(r => (r.next || [])))];
  next = next.filter(id => !ran.has(id) || (id === "sfc-scan" && next.includes("dism-restore") && !ran.has("dism-restore")));
  next.sort((a, b) => (a === "dism-restore" ? -1 : b === "dism-restore" ? 1 : 0));
  if(next.length && root){
    await tfEnsureFixes();
    const labels = next.map(id => T((tfFixById(id) || {}).label || id));
    root.querySelector("#fix-next").innerHTML = `<div class="fix-next"><div class="fix-next-label">${tfEsc(T("Recommended next step"))}</div><ul>${labels.map(l => `<li>${tfEsc(l)}</li>`).join("")}</ul><button class="btn primary sm" id="fix-next-go">${TF_ICON_WRENCH}<span>${tfEsc(T("Continue the repair"))}</span></button></div>`;
    root.querySelector("#fix-next-go").addEventListener("click", () => { if(closeSheet) closeSheet("next"); runFixPlan(next, title); });
  }
  try{
    if(typeof runNativeScan === "function") await runNativeScan(true);
    if(typeof runSecurityScan === "function" && window.__tfSecurityRan) await runSecurityScan(true);
  }catch(e){}
  if(status) status.textContent = status.textContent.replace(" — " + T("Re-checking this PC…"), " — " + T("results re-checked."));
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

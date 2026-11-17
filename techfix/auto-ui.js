/* ===================== TechFix — Automatic mode panel =====================
   Installed Windows app only (window.techfixNative.auto, factory/electron/auto.js).
   Levels: off · notify · auto (safe repairs on its own) · maintain (nightly maintenance task, one
   admin approval) + "keep watching in the background". Shows what TechFix did on its own. */
"use strict";

const AUTO = { st: null, busy: false, off: null };
const autoHas = () => !!(window.techfixNative && typeof window.techfixNative.auto === "function");
const AUTO_LEVELS = [
  ["off", "Off", "TechFix only works when you open it and click."],
  ["notify", "Warn me", "TechFix re-checks this PC on its own every few hours and notifies you when something important appears — one click opens the diagnosis and its repair plan."],
  ["auto", "Fix safe things on its own", "Same, and it also applies the repairs that are safe and need no administrator rights (temporary files, DNS cache) without asking. Anything bigger still waits for your OK."],
  ["maintain", "Deep maintenance (administrator)", "After one administrator approval, Windows runs TechFix's maintenance every night and after sign-in: virus definitions, Windows temp files, stopped core services, component cleanup when space is short, page file back to automatic, adware blocked and quarantined. Removed again with one approval."]
];
const AUTO_DONE = { "defender-update":"virus definitions updated", "windows-temp":"Windows temp files cleaned", "component-cleanup":"component store cleaned", "pagefile-auto":"page file set back to automatic", "pua-on":"unwanted-app blocking turned on", "pua-removed":"adware quarantined" };

async function autoLoad(){
  if(!autoHas()) return;
  try{ AUTO.st = await window.techfixNative.auto("get"); }catch(e){ AUTO.st = null; }
  try{ await window.techfixNative.auto("set", { lang: (typeof TF_LANG !== "undefined" ? TF_LANG : "en") }); }catch(e){}
  renderAutoPanel();
}

function autoTime(t){
  try{ return new Date(t).toLocaleString(typeof tfLocale === "function" ? tfLocale() : undefined, { dateStyle:"medium", timeStyle:"short" }); }catch(e){ return new Date(t).toLocaleString(); }
}

function renderAutoPanel(){
  const box = el("#auto-panel");
  if(!box) return;
  const st = AUTO.st;
  if(!autoHas() || !st || st.supported === false){ box.innerHTML = ""; return; }
  const hist = (st.history || []).filter(h => h.kind === "fixed" || (h.kind === "check" && (h.found || []).length) || h.kind === "maintenance-on" || h.kind === "maintenance-off").slice(0, 8);
  const maint = (st.maintenance || []).filter(m => (m.done || []).length).slice(0, 5);
  box.innerHTML = `<div class="panel auto-card">
    <div class="panel-head"><div class="panel-title">${ICON.activity}${esc(T("Automatic mode"))}</div>
      <button class="btn sm ghost" id="auto-check"${st.running ? " disabled" : ""}>${ICON.refresh}<span>${esc(st.running ? T("Checking…") : T("Check now"))}</span></button></div>
    <p class="stat-note" style="margin:0 0 10px;">${esc(T("TechFix is installed on this PC, so it can watch and repair on its own. Choose how far it may go:"))}</p>
    <div class="auto-levels">${AUTO_LEVELS.map(([id, name, note]) => `<label class="auto-level${st.mode === id ? " on" : ""}">
      <input type="radio" name="auto-level" value="${id}"${st.mode === id ? " checked" : ""}${AUTO.busy ? " disabled" : ""}>
      <span class="auto-level-body"><span class="auto-level-name">${esc(T(name))}</span><span class="auto-level-note">${esc(T(note))}</span></span></label>`).join("")}</div>
    <label class="fmt-check" style="margin-top:10px;"><input type="checkbox" id="auto-bg"${st.background ? " checked" : ""}${st.mode === "off" ? " disabled" : ""}>
      <span>${esc(T("Keep watching in the background — TechFix starts with Windows, hidden next to the clock, and closing the window keeps it there"))}</span></label>
    ${AUTO.err ? `<div class="cx-callout warn" style="margin-top:10px;"><div class="finding-meta">${esc(T(AUTO.err === "cancelled" ? "The administrator approval was cancelled — nothing was changed." : "That couldn't be changed."))}</div></div>` : ""}
    ${hist.length || maint.length ? `<div class="auto-hist"><div class="cx-muted" style="margin:12px 0 6px;">${esc(T("What TechFix did on its own"))}</div>
      ${hist.map(h => `<div class="auto-row"><span class="cx-muted">${esc(autoTime(h.t))}</span> <span>${esc(
        h.kind === "fixed" ? T("Fixed: {list}", { list: (h.items || []).map(i => T((tfFixById(i.id) || {}).label || i.id)).join(", ") }) :
        h.kind === "check" ? T("Found {n} important problem(s) — notified you", { n: (h.found || []).length }) :
        h.kind === "maintenance-on" ? T("Deep maintenance turned on") : T("Deep maintenance turned off"))}</span></div>`).join("")}
      ${maint.map(m => `<div class="auto-row"><span class="cx-muted">${esc(autoTime(m.t))}</span> <span>${esc(T("Night maintenance: {list}", { list: (m.done || []).map(d => T(AUTO_DONE[d] || (String(d).startsWith("service:") ? "service restarted: " + String(d).slice(8) : d))).join(", ") }))}</span></div>`).join("")}
    </div>` : ""}
  </div>`;
  box.querySelectorAll('input[name="auto-level"]').forEach(r => r.addEventListener("change", () => autoSet({ mode: r.value })));
  el("#auto-bg").addEventListener("change", (e) => autoSet({ background: e.target.checked }));
  el("#auto-check").addEventListener("click", async () => { AUTO.st.running = true; renderAutoPanel(); await window.techfixNative.auto("check"); autoLoad(); });
}

async function autoSet(patch){
  if(patch.mode === "maintain" && !(await cxConfirm(T("Deep maintenance"), T("Windows will ask once for administrator approval to add TechFix's maintenance task. It runs every night and 15 minutes after sign-in, does only the fixed list of safe tasks shown here, and keeps a log you see in this panel. Choosing another level removes it (one more approval)."), T("Continue")))) { renderAutoPanel(); return; }
  AUTO.busy = true; AUTO.err = null; renderAutoPanel();
  try{ const r = await window.techfixNative.auto("set", patch); if(r && r.error) AUTO.err = r.error; AUTO.st = r || AUTO.st; }
  catch(e){ AUTO.err = "failed"; }
  AUTO.busy = false;
  renderAutoPanel();
}

function initAutoMode(){
  if(!autoHas()) return;
  autoLoad();
  if(window.techfixNative.onAuto) AUTO.off = window.techfixNative.onAuto((kind, d) => {
    if(kind === "state"){ AUTO.st = Object.assign({ supported:true }, d); renderAutoPanel(); }
    // A background check finished, or the user clicked its notification: show its result right away.
    if((kind === "result" || kind === "open") && d && d.result && state && state.native){
      state.native.result = d.result;
      if(typeof renderNativeResults === "function"){ renderNativeResults(); if(typeof renderNativeForecast === "function") renderNativeForecast(); }
      if(kind === "open") setView("scan");
    }
  });
}
document.addEventListener("DOMContentLoaded", () => setTimeout(initAutoMode, 500));
function autoRerender(){ if(AUTO.st) renderAutoPanel(); }

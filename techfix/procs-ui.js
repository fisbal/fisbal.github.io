/* ===================== TechFix — "Close a program" (installed Windows app) =====================
   Lists the signed-in user's programs that use the most memory (factory/electron/procs.js) and
   closes one: first a normal close (like clicking ✕ — it can ask to save), then, only if it's still
   running and the person clicks again, a forced stop. Windows' own processes are never listed. */
"use strict";

const TF_MEM_CODES = new Set(["mem_high", "mem_low_events", "commit_high", "pagefile_high", "pagefile_off", "mem_small"]);
const TF_PROC_TEXT = {
  proc_closed: "{name} closed — {freed} of memory freed.",
  proc_forced: "{name} was force-stopped — {freed} of memory freed.",
  proc_partly: "{name}: some windows closed ({freed} freed), {left} still running — it may be asking to save.",
  proc_still_running: "{name} is still open — it's probably asking whether to save. Answer it, or force it to stop.",
  proc_no_window: "{name} runs in the background without a window, so it can't be asked to close.",
  proc_refused: "Windows refused to stop {name} — it may run as administrator or be protected.",
  proc_not_allowed: "{name} can't be closed from TechFix.",
  proc_no_result: "No answer from Windows about {name}."
};
const tfHasProcs = () => !!(window.techfixNative && typeof window.techfixNative.procs === "function");
const tfProcBtn = (cls) => tfHasProcs() ? `<button class="btn sm ${cls || ""}" data-tf-procs>${TF_ICON_WRENCH}<span>${tfEsc(T("Close a program"))}</span></button>` : "";
const tfMb = (mb) => mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : mb + " MB";

async function tfOpenProcs(){
  if(!tfHasProcs()) return;
  let root = null, changed = false;
  const closed = openSheet({
    title: `${TF_ICON_WRENCH} ${tfEsc(T("Close a program"))}`,
    html: `<p class="sheet-p">${tfEsc(T("Your programs that use the most memory right now. “Close” is the same as clicking ✕: the program can ask you to save. Only if it doesn't close can you force it to stop — then its unsaved work is lost."))}</p>
      <div id="tf-procs"><div class="stat-note">${tfEsc(T("Reading the programs…"))}</div></div>`,
    actions: [{ id:"ok", label:T("Close"), primary:true }],
    onMount: (r) => { root = r; }
  });
  const load = async () => {
    const box = root && root.querySelector("#tf-procs"); if(!box) return;
    let d; try{ d = await window.techfixNative.procs("list"); }catch(e){ d = { error: String(e) }; }
    if(!d || d.error || !d.items){ box.innerHTML = `<div class="stat-note">${tfEsc(T("Couldn't read the running programs."))}</div>`; return; }
    const used = d.totalMB && d.freeMB != null ? d.totalMB - d.freeMB : null;
    box.innerHTML = (used != null ? `<div class="stat-note" style="margin-bottom:8px;">${tfEsc(T("Memory in use: {used} of {total}", { used: tfMb(used), total: tfMb(d.totalMB) }))}</div>` : "") +
      (d.items.length ? d.items.map(p => `<div class="tf-proc" data-name="${tfEsc(p.name)}">
        <div class="tf-proc-body"><div class="tf-proc-name notranslate-tf">${tfEsc(p.title || p.desc || p.name)}${p.n > 1 ? ` <span class="cx-muted">×${p.n}</span>` : ""}</div>
          <div class="cx-muted notranslate-tf" style="font-size:12px;">${tfEsc(p.name)}${p.company ? " · " + tfEsc(p.company) : ""}</div>
          ${p.responding === false ? `<span class="fix-badge bad">${tfEsc(T("Not responding"))}</span>` : ""}
          <div class="tf-proc-verdict"></div></div>
        <div class="tf-proc-mb">${tfEsc(tfMb(p.mb))}</div>
        <div class="tf-proc-btns"><button class="btn sm" data-proc-close>${tfEsc(T("Close"))}</button></div></div>`).join("")
       : `<div class="stat-note">${tfEsc(T("None of your programs is using much memory right now."))}</div>`);
    box.querySelectorAll("[data-proc-close]").forEach(b => b.addEventListener("click", () => act(b.closest("[data-name]"), false)));
  };
  const act = async (row, force) => {
    const name = row.dataset.name, v = row.querySelector(".tf-proc-verdict"), btns = row.querySelector(".tf-proc-btns");
    btns.querySelectorAll("button").forEach(b => b.disabled = true);
    v.innerHTML = `<div class="stat-note">${tfEsc(force ? T("Stopping…") : T("Asking it to close…"))}</div>`;
    let r; try{ r = await window.techfixNative.procs("close", { name, force }); }catch(e){ r = { state:"failed", code:"proc_no_result", params:{ name } }; }
    const st = r.state === "fixed" ? { label: "Closed", cls: "ok" } : r.canForce ? { label: "Still open", cls: "warn" } : (TF_STATE[r.state] || TF_STATE.failed);
    v.innerHTML = `<div class="fix-verdict"><span class="fix-badge ${st.cls}">${tfEsc(T(st.label))}</span> <span>${tfEsc(T(TF_PROC_TEXT[r.code] || r.code, r.params))}</span></div>`;
    if(r.state === "fixed" || r.state === "partial") changed = true;
    if(r.canForce){
      btns.innerHTML = `<button class="btn sm cx-danger" data-proc-force>${tfEsc(T("Force stop"))}</button>`;
      btns.querySelector("[data-proc-force]").addEventListener("click", (e) => {
        const b = e.currentTarget;
        // Second click needed: unsaved work in that program is lost.
        if(!b.dataset.armed){ b.dataset.armed = "1"; b.textContent = T("Sure? Unsaved work is lost"); return; }
        act(row, true);
      });
    } else {
      btns.innerHTML = "";
      if(r.state === "fixed") setTimeout(load, 1500);
    }
  };
  await load();
  await closed;
  // Something was closed: re-check so the memory cards show the new reality.
  if(changed && typeof runNativeScan === "function") runNativeScan(true);
}

// One delegated listener: any "Close a program" button anywhere in the page opens the sheet.
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-tf-procs]");
  if(b){ e.preventDefault(); e.stopPropagation(); tfOpenProcs(); }
}, true);

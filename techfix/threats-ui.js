/* ===================== TechFix — "Unwanted & spy apps" panel (Connect tab) =====================
   Runs on every connected phone, in the installed app and in Chrome (WebUSB). The phone sends raw
   signals (op "threatScan"), techfix/threats.js classifies them, and this panel lets the person
   remove, mute (block ads / pop-ups / background) or keep each app. Nothing is removed without a click. */
"use strict";

Object.assign(CX_RESULT, {
  app_admin_first: "{app} is a device administrator, so Android protects it. The phone now shows “Device admin apps”: switch {app} off there, then tap Uninstall again.",
  apps_removed: "{ok} of {n} apps removed.",
  apps_removed_admin: "{ok} of {n} apps removed. The others are device administrators: the phone shows “Device admin apps” — switch them off there, then remove them again.",
  app_removed_line: "removed",
  app_admin_line: "device administrator — switch it off on the phone first",
  app_remove_failed_line: "Android refused",
  app_quieted: "{app} can no longer show pop-ups, send notifications or run in the background. It stays installed (undo: Settings › Apps › {app}).",
  app_quiet_failed: "Android didn't accept the changes for {app}.",
  protect_opened: "Google Play Protect app scanning is on, and its screen is open on the phone — tap “Scan” there for Google's own check."
});

const TH = { res: {}, busy: {} };
const TH_KIND = {
  spy:     ["Spy app", "danger"],
  monitor: ["Monitoring app", "warn"],
  adware:  ["Adware", "danger"],
  suspect: ["Hidden app", "warn"],
  review:  ["Has special powers", "warn"],
  popups:  ["Can show pop-ups", "info"]
};
const TH_REASON = {
  r_stalkerware: "on the public stalkerware list ({name})",
  r_watchware: "on the public list of monitoring apps ({name})",
  r_acc: "can read and control your screen (accessibility)",
  r_nl: "reads all your notifications and messages",
  r_admin: "is a device administrator (hard to remove)",
  r_hidden: "has no icon — hides from the app drawer",
  r_overlay: "can show pop-ups over other apps",
  r_sideloaded: "installed from a file, not from a store",
  r_other_source: "installed by another app, not by a store",
  r_recent: "installed {days} day(s) ago",
  r_junky: "\"cleaner / booster\"-type app — the usual carriers of ads"
};
function thTrusted(){ try{ return new Set(JSON.parse(localStorage.getItem("techfix:keep-apps") || "[]")); }catch(_){ return new Set(); } }
function thKeep(pkg){ try{ const s = thTrusted(); s.add(pkg); localStorage.setItem("techfix:keep-apps", JSON.stringify([...s])); }catch(_){} }

function thPanelHtml(){
  return `<div class="cx-apps cx-threats" data-cx-threats>
    <div class="cx-apps-head"><span class="finding-title">${esc(T("Unwanted & spy apps"))}</span>
      <span class="cx-muted">${esc(T("Adware slipped in by free games, hidden apps, apps that watch you"))}</span>
      <button class="btn sm ghost" data-th-scan>${ICON.refresh}<span>${esc(T("Check again"))}</span></button></div>
    <div data-th-body><div class="stat-note">${esc(T("Waiting…"))}</div></div></div>`;
}

async function thScan(serial){
  const card = el(`[data-cx-dev="${CSS.escape(serial)}"]`);
  if(!card || TH.busy[serial]) return;
  TH.busy[serial] = true;
  const body = card.querySelector("[data-th-body]");
  if(body) body.innerHTML = `<div class="stat-note">${esc(T("Looking at every app you installed…"))}</div>`;
  try{
    const [raw, ioc] = await Promise.all([cxCall("threatScan", { serial }), TFThreats.loadIoc()]);
    TH.res[serial] = raw && raw.raw ? TFThreats.analyze(raw.raw, ioc) : { error: (raw && raw.error) || "failed" };
  } catch(e){ TH.res[serial] = { error: String(e && e.message || e) }; }
  finally{ TH.busy[serial] = false; }
  thRender(serial);
}

function thRender(serial){
  const card = el(`[data-cx-dev="${CSS.escape(serial)}"]`);
  const body = card && card.querySelector("[data-th-body]");
  const r = TH.res[serial];
  if(!body || !r) return;
  if(r.error){ body.innerHTML = `<div class="stat-note">${esc(T("Couldn't read the app list from the phone."))}</div>`; return; }
  const keep = thTrusted();
  const list = r.flagged.filter(a => !keep.has(a.pkg));
  const main = list.filter(a => a.level !== "info"), pops = list.filter(a => a.level === "info");
  const danger = list.filter(a => a.level === "danger");
  const spy = list.some(a => a.kind === "spy" || a.kind === "monitor");
  const row = (a) => {
    const k = TH_KIND[a.kind] || ["", "info"];
    const why = a.reasons.map(c => T(TH_REASON[c] || c, { name: a.ioc, days: a.ageDays })).join(" · ");
    const quiet = ["adware", "popups", "suspect"].includes(a.kind);
    return `<div class="cx-arow th-row ${k[1]}" data-pkg="${esc(a.pkg)}">
      <div class="cx-arow-body"><div class="cx-app-name notranslate-tf">${esc(cxAppName(a.pkg))} <span class="fix-badge ${k[1] === "danger" ? "bad" : k[1]}">${esc(T(k[0]))}</span></div>
        <div class="cx-muted cx-pkg notranslate-tf">${esc(a.pkg)}${a.installed ? " · " + esc(a.installed) : ""}</div>
        <div class="th-why">${esc(why)}</div></div>
      <div class="cx-arow-btns">
        <button class="btn sm ${k[1] === "danger" ? "primary" : "ghost cx-danger"}" data-th-act="app-uninstall">${esc(T("Uninstall"))}</button>
        ${quiet ? `<button class="btn sm" data-th-act="app-quiet" title="${esc(T("Keeps the app but blocks its pop-ups, notifications and background activity"))}">${esc(T("Block its ads"))}</button>` : ""}
        <button class="btn sm ghost" data-th-act="keep" title="${esc(T("I know this app — stop flagging it"))}">${esc(T("Keep"))}</button>
      </div></div>`;
  };
  const checksNote = [!r.checks.icons && T("this Android version doesn't tell which apps hide their icon"), !r.checks.overlay && T("this Android version doesn't list pop-up permissions")].filter(Boolean);
  body.innerHTML = `
    <div class="th-sum ${danger.length ? "bad" : main.length ? "warn" : "ok"}">${esc(
      danger.length ? T("{d} app(s) to remove and {w} to look at, among the {n} apps installed on this phone.", { d: danger.length, w: main.length - danger.length, n: r.total })
      : main.length ? T("Nothing clearly dangerous, but {w} app(s) worth a look, among {n} installed apps.", { w: main.length, n: r.total })
      : T("No spy app or adware found among the {n} apps installed on this phone.", { n: r.total }))}</div>
    ${spy ? `<div class="cx-callout warn"><div class="finding-meta">${esc(T("A spy app usually means someone had your phone in hand. If you think a person is watching you, removing it can alert them: if you may be in danger, talk to a support service first (stopstalkerware.org lists them), and change your Google account password from another device."))}</div></div>` : ""}
    ${r.protectOff ? `<div class="cx-callout warn"><div class="finding-meta">${esc(T("Google Play Protect app scanning is turned off on this phone."))}</div>
       <button class="btn sm primary" data-th-protect>${esc(T("Turn Play Protect on"))}</button></div>` : ""}
    ${danger.length > 1 ? `<div class="cx-row" style="margin:10px 0;"><button class="btn sm primary" data-th-all>${esc(T("Remove the {n} dangerous apps", { n: danger.length }))}</button></div>` : ""}
    <div class="cx-applist-all">${main.map(row).join("")}</div>
    ${pops.length ? `<details class="th-pops"><summary>${esc(T("{n} other app(s) can show pop-ups over other apps", { n: pops.length }))}</summary>
       <div class="stat-note cx-muted">${esc(T("Normal for chat bubbles, screen recorders or navigation apps; a game or a flashlight has no reason to. If ads pop up out of nowhere, the culprit is in this list."))}</div>
       <div class="cx-applist-all">${pops.map(row).join("")}</div></details>` : ""}
    <div class="stat-note cx-muted" style="margin-top:8px;">${esc(T("Spy-app list: Echap stalkerware-indicators (CC-BY 4.0), {n} known families.", { n: r.checks.iocCount }))}${checksNote.length ? " " + esc(T("Note:")) + " " + esc(checksNote.join("; ")) + "." : ""}</div>`;
  body.querySelectorAll("[data-th-act]").forEach(b => b.addEventListener("click", () => thAct(serial, b.closest("[data-pkg]").dataset.pkg, b.dataset.thAct)));
  const all = body.querySelector("[data-th-all]");
  if(all) all.addEventListener("click", async () => {
    const pk = danger.map(a => a.pkg);
    if(!(await cxConfirm(T("Remove {n} apps?", { n: pk.length }), T("These apps and their data are removed from the phone: {list}", { list: pk.map(cxAppName).join(", ") }), T("Remove them")))) return;
    await cxRun(T("Remove the {n} dangerous apps", { n: pk.length }), "phoneAction", { serial, id: "apps-remove", args: { pkgs: pk } });
    thAfterChange(serial);
  });
  const pr = body.querySelector("[data-th-protect]");
  if(pr) pr.addEventListener("click", async () => { await cxRun(T("Turn Play Protect on"), "phoneAction", { serial, id: "protect-on" }); thScan(serial); });
}

async function thAct(serial, pkg, act){
  if(act === "keep"){ thKeep(pkg); thRender(serial); return; }
  if(act === "app-uninstall"){ await cxAppAct(serial, pkg, "app-uninstall"); thAfterChange(serial); return; }
  if(act === "app-quiet"){ await cxRun(T("Block its ads") + " — " + cxAppName(pkg), "phoneAction", { serial, id: "app-quiet", args: { pkg } }); thAfterChange(serial); }
}
function thAfterChange(serial){
  if(CX.all){ delete CX.all[serial]; delete CX.all[serial + ":s"]; }
  thScan(serial);
}
function thWire(card, serial){
  const b = card.querySelector("[data-th-scan]");
  if(b) b.addEventListener("click", () => thScan(serial));
  if(TH.res[serial]) thRender(serial);
  else setTimeout(() => thScan(serial), 1500); // after the health read-out has started
}

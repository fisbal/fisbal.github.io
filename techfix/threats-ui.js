/* ===================== TechFix — "Unwanted & spy apps" panel =====================
   One panel, two ways to reach the phone:
   · Connect tab  — a phone plugged into the PC app or into Chrome (WebUSB): op "threatScan" over
                    ADB; TechFix can uninstall / mute apps itself (THDRV.usb).
   · On the phone — the TechFix Android app checks its own phone (window.TechFixAndroid.threatScan,
                    factory/android TechFixBridge.java): Android asks "Uninstall?" for each app and
                    pop-ups are switched off on the app's own Settings page (THDRV.local).
   Both send the same raw text, classified by techfix/threats.js. Nothing is removed without a click. */
"use strict";

if (typeof CX_RESULT !== "undefined") Object.assign(CX_RESULT, {
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
function thName(key, pkg){
  const l = TH.res[key] && TH.res[key].labels && TH.res[key].labels[pkg];
  return l || (typeof cxAppName === "function" ? cxAppName(pkg) : pkg);
}
// Waits for the person to answer Android's own dialog on the phone, then carries on.
function thAsk(title, text, next){
  return openSheet({ title: `${TF_ICON_WRENCH} ${esc(title)}`, html: `<p class="sheet-p">${esc(text)}</p>`,
    actions: [{ id:"stop", label:T("Stop") }, { id:"next", label: next || T("Done"), primary:true }] });
}

/* ---------- The two ways to reach the phone ---------- */
const THDRV = {
  usb: (serial) => ({
    key: serial,
    box: () => el(`[data-cx-dev="${CSS.escape(serial)}"] [data-cx-threats]`),
    scan: () => cxCall("threatScan", { serial }),
    uninstall: async (pkg) => { await cxAppAct(serial, pkg, "app-uninstall"); },
    quiet: async (pkg) => { await cxRun(T("Block its ads") + " — " + thName(serial, pkg), "phoneAction", { serial, id: "app-quiet", args: { pkg } }); },
    removeAll: async (pkgs) => { await cxRun(T("Remove the {n} dangerous apps", { n: pkgs.length }), "phoneAction", { serial, id: "apps-remove", args: { pkgs } }); },
    protect: async () => { await cxRun(T("Turn Play Protect on"), "phoneAction", { serial, id: "protect-on" }); },
    changed: () => { if (typeof CX !== "undefined" && CX.all) { delete CX.all[serial]; delete CX.all[serial + ":s"]; } }
  }),
  local: () => ({
    key: "local",
    box: () => el("#android-threats [data-cx-threats]"),
    scan: async () => { try { return { raw: window.TechFixAndroid.threatScan() }; } catch (e) { return { error: String(e) }; } },
    uninstall: async (pkg, item) => {
      const name = thName("local", pkg);
      if (item && item.powers && item.powers.includes("admin")) {
        window.TechFixAndroid.openSettings("device-admin");
        if (await thAsk(T("First: switch off {app}", { app: name }), T("{app} is a device administrator, so Android won't uninstall it yet. On the screen that just opened (Device admin apps), switch {app} off, come back here, then tap Next.", { app: name }), T("Next")) !== "next") return;
      }
      window.TechFixAndroid.uninstall(pkg);
      await thAsk(T("Uninstall {app}?", { app: name }), T("Android is asking on the screen: tap OK / Uninstall to remove {app}, then come back and tap Done.", { app: name }));
    },
    quiet: async (pkg) => {
      const name = thName("local", pkg);
      window.TechFixAndroid.openApp(pkg);
      await thAsk(T("Block {app}'s ads", { app: name }), T("{app}'s settings are open. Turn off “Appear on top” (or “Display over other apps”) and Notifications, and set Battery to Restricted. The app stays, its pop-ups stop. Then come back and tap Done.", { app: name }));
    },
    removeAll: async (pkgs, items) => {
      for (let i = 0; i < pkgs.length; i++) {
        const it = items.find(x => x.pkg === pkgs[i]);
        const name = thName("local", pkgs[i]);
        if (it && it.powers && it.powers.includes("admin")) {
          window.TechFixAndroid.openSettings("device-admin");
          if (await thAsk(T("{i} of {n}: switch off {app}", { i: i + 1, n: pkgs.length, app: name }), T("{app} is a device administrator, so Android won't uninstall it yet. On the screen that just opened (Device admin apps), switch {app} off, come back here, then tap Next.", { app: name }), T("Next")) !== "next") return;
        }
        window.TechFixAndroid.uninstall(pkgs[i]);
        const last = i === pkgs.length - 1;
        if (await thAsk(T("{i} of {n}: uninstall {app}", { i: i + 1, n: pkgs.length, app: name }), T("Android is asking on the screen: tap OK / Uninstall to remove {app}, then come back and tap Next.", { app: name }), last ? T("Done") : T("Next")) !== "next") return;
      }
    },
    protect: async () => {
      window.TechFixAndroid.openSettings("play-protect");
      await thAsk(T("Turn Play Protect on"), T("Play Protect is open: turn on “Scan apps with Play Protect”, tap Scan, then come back and tap Done."));
    },
    changed: () => {}
  })
};

function thPanelHtml(){
  return `<div class="cx-apps cx-threats" data-cx-threats>
    <div class="cx-apps-head"><span class="finding-title">${esc(T("Unwanted & spy apps"))}</span>
      <span class="cx-muted">${esc(T("Adware slipped in by free games, hidden apps, apps that watch you"))}</span>
      <button class="btn sm ghost" data-th-scan>${ICON.refresh}<span>${esc(T("Check again"))}</span></button></div>
    <div data-th-body><div class="stat-note">${esc(T("Waiting…"))}</div></div></div>`;
}

// The panel can be rebuilt while a check runs (language switch, phone list refresh), so the
// result always goes to the panel that is on screen now (drv.box()).
async function thScanWith(drv){
  const box = drv.box();
  if(!box || TH.busy[drv.key]) return;
  TH.busy[drv.key] = true;
  const body = box.querySelector("[data-th-body]");
  if(body) body.innerHTML = `<div class="stat-note">${esc(T("Looking at every app you installed…"))}</div>`;
  try{
    const [raw, ioc] = await Promise.all([drv.scan(), TFThreats.loadIoc()]);
    TH.res[drv.key] = raw && raw.raw && !/@@TF:error/.test(raw.raw) ? TFThreats.analyze(raw.raw, ioc) : { error: (raw && raw.error) || "failed" };
  } catch(e){ TH.res[drv.key] = { error: String(e && e.message || e) }; }
  finally{ TH.busy[drv.key] = false; }
  thRenderWith(drv);
}

function thRenderWith(drv){
  const box = drv.box();
  const body = box && box.querySelector("[data-th-body]");
  const key = drv.key, r = TH.res[key];
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
      <div class="cx-arow-body"><div class="cx-app-name notranslate-tf">${esc(thName(key, a.pkg))} <span class="fix-badge ${k[1] === "danger" ? "bad" : k[1]}">${esc(T(k[0]))}</span></div>
        <div class="cx-muted cx-pkg notranslate-tf">${esc(a.pkg)}${a.installed ? " · " + esc(a.installed) : ""}</div>
        <div class="th-why">${esc(why)}</div></div>
      <div class="cx-arow-btns">
        <button class="btn sm ${k[1] === "danger" ? "primary" : "ghost cx-danger"}" data-th-act="uninstall">${esc(T("Uninstall"))}</button>
        ${quiet ? `<button class="btn sm" data-th-act="quiet" title="${esc(T("Keeps the app but blocks its pop-ups, notifications and background activity"))}">${esc(T("Block its ads"))}</button>` : ""}
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
  const after = () => { drv.changed(); thScanWith(drv); };
  body.querySelectorAll("[data-th-act]").forEach(b => b.addEventListener("click", async () => {
    const pkg = b.closest("[data-pkg]").dataset.pkg, act = b.dataset.thAct;
    if(act === "keep"){ thKeep(pkg); thRenderWith(drv); return; }
    if(act === "uninstall") await drv.uninstall(pkg, list.find(x => x.pkg === pkg));
    if(act === "quiet") await drv.quiet(pkg);
    after();
  }));
  const all = body.querySelector("[data-th-all]");
  if(all) all.addEventListener("click", async () => {
    const pk = danger.map(a => a.pkg);
    if(!(await cxConfirm(T("Remove {n} apps?", { n: pk.length }), T("These apps and their data are removed from the phone: {list}", { list: pk.map(p => thName(key, p)).join(", ") }), T("Remove them")))) return;
    await drv.removeAll(pk, danger);
    after();
  });
  const pr = body.querySelector("[data-th-protect]");
  if(pr) pr.addEventListener("click", async () => { await drv.protect(); thScanWith(drv); });
}

/* ---------- Connect tab (phone on a cable) ---------- */
function thWire(card, serial){
  const box = card.querySelector("[data-cx-threats]");
  if(!box) return;
  const drv = THDRV.usb(serial);
  box.querySelector("[data-th-scan]").addEventListener("click", () => thScanWith(drv));
  if(TH.res[serial]) thRenderWith(drv);
  else if(!TH.busy[serial]) setTimeout(() => thScanWith(drv), 1500); // after the health read-out has started
}

/* ---------- On the phone itself (TechFix Android app) ---------- */
function thLocalInit(){
  if(!window.TechFixAndroid || typeof window.TechFixAndroid.threatScan !== "function") return;
  const host = el("#android-threats");
  if(!host) return;
  host.innerHTML = thPanelHtml();
  const box = host.querySelector("[data-cx-threats]"), drv = THDRV.local();
  box.querySelector("[data-th-scan]").addEventListener("click", () => thScanWith(drv));
  if(TH.res.local) thRenderWith(drv); else if(!TH.busy.local) setTimeout(() => thScanWith(drv), 600);
}
document.addEventListener("DOMContentLoaded", () => setTimeout(thLocalInit, 400));

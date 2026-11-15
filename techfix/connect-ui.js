/* ===================== TechFix — "Connect a device" tab =====================
   Windows/Mac app: window.techfixNative.connect(op, payload) (factory/electron/connect.js).
     • Phone or tablet: Android over USB/Wi-Fi with Google's ADB tools — real health read-out
       (same findings as the Android app), repairs with before/after numbers, photo copy,
       screenshot, crash log → Analyze Log, install TechFix on the phone, Recovery/Fastboot.
       iPhones and phones without USB debugging are recognised and explained.
     • Another computer: Quick Assist, TechFix on a USB key, rescue key / install media.
   Web and Android app: explains what the installed app adds.
   Loaded before app.js; uses app.js / fixit.js / device-ui.js / security-ui.js helpers at call time. */
"use strict";

const CX = { status: null, sig: "", scans: {}, busy: {}, timer: null, polling: false, active: false };
const cxHas = () => !!(window.techfixNative && typeof window.techfixNative.connect === "function");

// One sentence per result code from connect.js.
const CX_RESULT = {
  ph_caches_freed: "Freed {freed} of app caches — {free} now free on the phone.",
  ph_caches_none: "App caches were already small — nothing worth freeing.",
  ph_caches_done: "App caches cleared.",
  ph_mem_freed: "Closed background apps — {freed} of memory freed.",
  ph_mem_none: "Background apps closed — memory was already fine.",
  ph_screenshot: "Screenshot saved in Pictures › TechFix.",
  ph_photos_none: "No photos or videos found on the phone.",
  ph_photos_nospace: "Not enough room in that folder: the photos need {size}, only {free} free. Pick another drive (D: for example).",
  ph_photos_partial: "Copied {copied} of {size} — the copy stopped early. Check the cable and try again.",
  ph_photos_done: "Copied {files} files ({size}) — the folder is open. Nothing was deleted from the phone.",
  ph_log_ready: "Crash log read — TechFix is analyzing it in Analyze Log.",
  ph_log_empty: "The phone's crash log is empty — no recent app crashes recorded.",
  ph_opened_on_phone: "Opened on the phone — finish the change there.",
  ph_no_apk: "Couldn't find the TechFix app for Android online. Check the internet connection.",
  ph_download_failed: "The download failed. Check the internet connection and try again.",
  ph_techfix_installed: "TechFix is installed on the phone — it updates itself from now on.",
  ph_install_failed: "Android refused the install.",
  ph_rebooting: "The phone is restarting.",
  ph_to_recovery: "The phone is restarting into Recovery mode.",
  ph_to_bootloader: "The phone is restarting into the bootloader (Fastboot).",
  ph_not_connected: "The phone isn't connected any more. Plug it back in and allow USB debugging.",
  ph_failed: "That didn't work on this phone.",
  ph_unknown: "Unknown action.",
  adb_missing: "Install the Android tools first.",
  adb_download_failed: "Couldn't download the Android tools. Check the internet connection.",
  adb_extract_failed: "The Android tools downloaded but couldn't be unpacked.",
  wifi_bad_input: "Check the numbers: IP address like 192.168.1.23, ports of 2–5 digits, a 6-digit pairing code.",
  wifi_pair_failed: "Pairing failed — the code changes each time; ask the phone for a new one.",
  wifi_connected: "Connected over Wi-Fi.",
  wifi_connect_failed: "Paired, but couldn't connect. Use the port shown at the top of the Wireless debugging screen.",
  pc_quick_assist: "Quick Assist is open. To get help: “Get help” and type the helper's code. To help someone: “Help someone” and give them your code.",
  pc_quick_assist_store: "Quick Assist isn't installed — the Microsoft Store page is open.",
  pc_mac_sharing: "Sharing settings are open — turn on Screen Sharing.",
  pc_recovery_drive: "Windows' recovery-drive tool is open. Use a USB key of 32 GB or more — it will be erased.",
  pc_media_tool: "The official download page is open.",
  pc_no_drive: "That USB key isn't plugged in any more.",
  pc_no_release: "Couldn't reach the TechFix downloads. Check the internet connection.",
  pc_key_full: "Not enough room on the key: {need} needed, {free} free.",
  pc_key_write: "Couldn't write to the key — it may be locked or read-only.",
  pc_key_download: "The download of {file} failed. Check the internet connection and try again.",
  pc_key_ready: "TechFix is on the key ({drive}:\\TechFix) for Windows, Mac and Android. On the other device, open the file — it then updates itself.",
  pc_unsupported: "Not available on this system.",
  pc_failed: "That didn't open.",
  pc_unknown: "Unknown action.",
  cancelled: "Cancelled."
};
const CX_SIZE_PARAMS = ["freed", "free", "size", "copied", "need", "avail"];

function cxResultText(r){
  const p = Object.assign({}, r.params || {});
  for(const k of CX_SIZE_PARAMS) if(typeof p[k] === "number") p[k] = fmtBytes(p[k]);
  let s = T(CX_RESULT[r.code] || r.code || "", p);
  if(p.detail && (r.state === "failed" || r.state === "partial")) s += " (" + p.detail + ")";
  return s;
}

/* ---------- Native calls ---------- */
async function cxCall(op, payload){
  try{ return await window.techfixNative.connect(op, payload || {}); }
  catch(e){ return { state:"failed", code:"ph_failed", params:{ detail: String(e && e.message || e) } }; }
}

// Runs one action in a sheet: live progress, then the honest verdict.
async function cxRun(title, op, payload, after){
  let root = null, closeFn = null;
  const html = `<div class="fix-progress"><div class="fix-step running" id="cx-step"><span class="mark">…</span>
      <div class="fix-step-body"><span class="fix-step-label">${esc(title)}</span><div class="cx-progress" id="cx-prog"></div></div></div></div>`;
  openSheet({ title: `${TF_ICON_WRENCH} ${esc(title)}`, html, actions: [{ id:"ok", label:T("Close"), primary:true }], onMount: (r, c) => { root = r; closeFn = c; } });
  const off = window.techfixNative.onConnectProgress ? window.techfixNative.onConnectProgress((ev) => {
    const box = root && root.querySelector("#cx-prog"); if(!box) return;
    if(ev.phase === "download" || ev.phase === "copy"){
      const pct = ev.total ? Math.min(100, Math.round(ev.done / ev.total * 100)) : null;
      box.innerHTML = `<div class="cx-bar"><span style="width:${pct == null ? 30 : pct}%"></span></div>
        <div class="stat-note">${esc(T(ev.phase === "copy" ? "Copying…" : "Downloading…"))} <span class="notranslate-tf">${esc(ev.label || "")} · ${fmtBytes(ev.done || 0)}${ev.total ? " / " + fmtBytes(ev.total) : ""}</span></div>`;
    } else if(ev.phase === "extract") box.innerHTML = `<div class="stat-note">${esc(T("Unpacking…"))}</div>`;
    else if(ev.phase === "install") box.innerHTML = `<div class="stat-note">${esc(T("Installing on the phone — watch its screen in case it asks for permission…"))}</div>`;
  }) : null;
  const r = await cxCall(op, payload);
  if(off) off();
  const row = root && root.querySelector("#cx-step");
  if(row){
    const st = TF_STATE[r.state] || TF_STATE.failed;
    row.classList.remove("running"); row.classList.add(st.cls);
    row.querySelector(".mark").textContent = st.mark;
    const prog = row.querySelector("#cx-prog"); if(prog) prog.innerHTML = "";
    row.querySelector(".fix-step-body").insertAdjacentHTML("beforeend",
      `<div class="fix-verdict"><span class="fix-badge ${st.cls}">${esc(T(st.label))}</span> <span>${esc(cxResultText(r))}</span></div>`);
  }
  if(after) after(r, () => { if(closeFn) closeFn(null); });
  return r;
}

async function cxConfirm(title, text, go){
  const v = await openSheet({ title: `${TF_ICON_WRENCH} ${esc(title)}`, html: `<p class="sheet-p">${esc(text)}</p>`,
    actions: [{ id:"no", label:T("Cancel") }, { id:"go", label: go || T("Continue"), primary:true }] });
  return v === "go";
}

/* ---------- Status polling (only while this tab is open) ---------- */
async function cxRefresh(force){
  if(!cxHas() || CX.polling) return;
  CX.polling = true;
  try{
    const s = await cxCall("status");
    CX.status = s;
    const sig = JSON.stringify([s.adb, s.devices, s.fastbootDevices, s.usb, (s.drives || []).map(d => d.id)]);
    if(force || sig !== CX.sig){ CX.sig = sig; cxRenderPhones(); cxRenderDrives(); }
  } finally { CX.polling = false; }
}
function connectViewChanged(view){
  CX.active = view === "connect";
  clearInterval(CX.timer); CX.timer = null;
  if(!CX.active) return;
  renderConnectView();
  if(cxHas()){ cxRefresh(true); CX.timer = setInterval(() => { if(!document.hidden) cxRefresh(false); }, 4000); }
}

/* ---------- Layout ---------- */
function renderConnectView(){
  const body = el("#connect-body");
  if(!body) return;
  if(!cxHas()){
    const phone = !!window.TechFixAndroid;
    body.innerHTML = `<div class="panel"><div class="panel-title">${ICON.smartphone}${esc(T("Works in the TechFix app for Windows and Mac"))}</div>
      <p class="stat-note" style="margin:0 0 12px;">${esc(phone
        ? T("You're on the phone: Live Scan already checks this phone. To repair a phone from a computer — or reach another computer — install TechFix on Windows or Mac and plug the phone in with a cable.")
        : T("A web page can't reach a phone or another computer. The installed TechFix app can: it reads an Android phone's health over USB and repairs it, puts TechFix on a USB key, and opens remote help."))}</p>
      ${phone ? "" : `<button class="btn primary" id="cx-get-app">${ICON.upload}<span>${esc(T("Get the app"))}</span></button>`}</div>`;
    const b = el("#cx-get-app"); if(b) b.addEventListener("click", () => showInstallSheet());
    return;
  }
  if(el("#cx-phones")) return; // already built — polling refreshes the parts
  const win = /Windows/i.test(navigator.userAgent);
  body.innerHTML = `
    <div class="panel cx-card">
      <div class="panel-head"><div class="panel-title">${ICON.smartphone}${esc(T("Phone or tablet"))}</div>
        <button class="btn sm ghost" id="cx-refresh">${ICON.refresh}<span>${esc(T("Look again"))}</span></button></div>
      <p class="stat-note" style="margin:0 0 12px;">${esc(T("Plug the phone into this computer with a USB cable. TechFix reads its health and repairs it from here — Android phones and tablets. iPhones are recognised and explained."))}</p>
      <div id="cx-phones"><div class="stat-note">${esc(T("Looking for devices…"))}</div></div>
      <details class="cx-wifi">
        <summary>${ICON.wifi}<span>${esc(T("No cable? Connect over Wi-Fi (Android 11 and newer)"))}</span></summary>
        <ol class="cx-steps">
          <li>${esc(T("Phone and computer on the same Wi-Fi."))}</li>
          <li>${esc(T("On the phone: Settings › Developer options › Wireless debugging › turn it on."))}</li>
          <li>${esc(T("Tap “Pair device with pairing code” and type what it shows here."))}</li>
        </ol>
        <div class="cx-form">
          <label><span>${esc(T("IP address"))}</span><input id="cx-ip" inputmode="decimal" placeholder="192.168.1.23"></label>
          <label><span>${esc(T("Pairing port"))}</span><input id="cx-pport" inputmode="numeric" placeholder="37123"></label>
          <label><span>${esc(T("Pairing code"))}</span><input id="cx-code" inputmode="numeric" placeholder="123456"></label>
          <label><span>${esc(T("Connection port"))}</span><input id="cx-port" inputmode="numeric" placeholder="41567"></label>
        </div>
        <p class="stat-note">${esc(T("The connection port is the one at the top of the Wireless debugging screen (not the pairing one). Already paired before? Leave the pairing fields empty."))}</p>
        <button class="btn primary" id="cx-pair">${ICON.wifi}<span>${esc(T("Connect"))}</span></button>
      </details>
    </div>

    <div class="panel cx-card">
      <div class="panel-title">${ICON.laptop}${esc(T("Another computer"))}</div>
      <div class="cx-tiles">
        <div class="cx-tile">
          <div class="cx-tile-title">${esc(T("Remote help"))}</div>
          <p class="stat-note">${esc(win ? T("Quick Assist, built into Windows: see and control the other PC (or let someone help you) over the internet. Each side opens it; the helper gives a code.") : T("Screen Sharing, built into macOS: let someone see and control this Mac."))}</p>
          <button class="btn primary" data-cx-pc="quick-assist">${ICON.monitor}<span>${esc(win ? T("Open Quick Assist") : T("Open Screen Sharing"))}</span></button>
        </div>
        <div class="cx-tile">
          <div class="cx-tile-title">${esc(T("TechFix on a USB key"))}</div>
          <p class="stat-note">${esc(T("Puts the latest TechFix for Windows, Mac and Android on a USB key. Plug it into the other device and open the file — it then updates itself. Nothing on the key is erased."))}</p>
          <div id="cx-drives"></div>
        </div>
        ${win ? `<div class="cx-tile">
          <div class="cx-tile-title">${esc(T("Rescue key for a PC that won't start"))}</div>
          <p class="stat-note">${esc(T("Make it now, while this PC works: Windows' recovery drive can repair or reinstall Windows on a PC that no longer starts. Needs a 32 GB key that will be erased."))}</p>
          <div class="cx-row"><button class="btn" data-cx-pc="recovery-drive">${ICON.wrench}<span>${esc(T("Create a recovery drive"))}</span></button>
          <button class="btn ghost" data-cx-pc="media-tool">${ICON.upload}<span>${esc(T("Windows install media"))}</span></button></div>
        </div>` : ""}
      </div>
    </div>`;
  el("#cx-refresh").addEventListener("click", () => cxRefresh(true));
  el("#cx-pair").addEventListener("click", async () => {
    const payload = { ip: el("#cx-ip").value.trim(), pairPort: el("#cx-pport").value.trim(), code: el("#cx-code").value.trim(), port: el("#cx-port").value.trim() };
    await cxRun(T("Connect over Wi-Fi"), "wifiPair", payload);
    cxRefresh(true);
  });
  body.querySelectorAll("[data-cx-pc]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.cxPc;
    cxRun(b.textContent.trim(), "pcAction", { id });
  }));
}

/* ---------- Removable drives (USB key) ---------- */
function cxRenderDrives(){
  const box = el("#cx-drives");
  if(!box) return;
  const drives = (CX.status && CX.status.drives) || [];
  if(!drives.length){ box.innerHTML = `<div class="stat-note cx-muted">${esc(T("Plug in a USB key — it shows up here."))}</div>`; return; }
  box.innerHTML = `<div class="cx-row"><select id="cx-drive" class="cx-select">${drives.map(d => `<option value="${esc(d.id)}">${esc((d.root || d.id) + (d.label ? " — " + d.label : ""))} · ${fmtBytes(d.free)} ${esc(T("free"))}</option>`).join("")}</select>
    <button class="btn primary" id="cx-key">${ICON.upload}<span>${esc(T("Put TechFix on this key"))}</span></button></div>`;
  el("#cx-key").addEventListener("click", () => cxRun(T("TechFix on a USB key"), "pcAction", { id:"usb-key", args:{ drive: el("#cx-drive").value } }));
}

/* ---------- Phones ---------- */
const CX_STATE_TEXT = {
  unauthorized: ["Waiting for your OK on the phone", "Unlock the phone: a message asks “Allow USB debugging?”. Tick “Always allow from this computer” and tap Allow."],
  offline: ["Connection stuck", "Unplug the cable and plug it back in. If it keeps happening, try another USB port or cable."],
  recovery: ["In Recovery mode", "The phone is in its repair menu. Restart it normally, or use the menu on the phone with the volume and power buttons."],
  sideload: ["Waiting for an update file (sideload)", "The phone is waiting for a system update file. Restart it normally if you didn't mean to do this."],
  rescue: ["In Rescue mode", "Restart the phone normally."],
  bootloader: ["In the bootloader", "Restart the phone normally."],
  "no permissions": ["No permission to reach the phone", "Unplug and plug the phone back in, then allow it."]
};

function cxDevName(d){ return d.model || d.product || d.device || d.serial; }

function cxRenderPhones(){
  const box = el("#cx-phones");
  if(!box) return;
  const s = CX.status || {};
  const parts = [];
  const ready = (s.devices || []).filter(d => d.state === "device");
  const others = (s.devices || []).filter(d => d.state !== "device");

  if(!s.adb){
    parts.push(`<div class="cx-callout">
      <div class="finding-title">${esc(T("One-time setup: Google's Android tools"))}</div>
      <div class="finding-meta">${esc(T("To talk to an Android phone, TechFix uses ADB — Google's official tool (about 7 MB), stored in TechFix's own folder."))}</div>
      <div class="cx-row"><button class="btn primary" id="cx-install-adb">${ICON.upload}<span>${esc(T("Install the Android tools"))}</span></button></div></div>`);
  }

  for(const d of ready) parts.push(cxPhoneCard(d));
  for(const d of others){
    const t = CX_STATE_TEXT[d.state] || [d.state, ""];
    const canRestart = ["recovery", "sideload", "rescue"].includes(d.state);
    parts.push(`<div class="cx-device"><div class="cx-dev-head"><span class="lamp warn"></span><strong class="notranslate-tf">${esc(cxDevName(d))}</strong><span class="cx-dev-state">${esc(T(t[0]))}</span></div>
      <div class="finding-meta">${esc(T(t[1]))}</div>
      ${canRestart ? `<div class="cx-row"><button class="btn sm" data-cx-mode="recovery-reboot" data-serial="${esc(d.serial)}">${ICON.refresh}<span>${esc(T("Restart normally"))}</span></button></div>` : ""}</div>`);
  }
  for(const d of s.fastbootDevices || []){
    parts.push(`<div class="cx-device"><div class="cx-dev-head"><span class="lamp warn"></span><strong class="notranslate-tf">${esc(d.serial)}</strong><span class="cx-dev-state">${esc(T("In bootloader (Fastboot) mode"))}</span></div>
      <div class="finding-meta">${esc(T("The phone is in its low-level start menu. If you didn't mean to be here, restart it normally."))}</div>
      <div class="cx-row"><button class="btn sm" data-cx-mode="fastboot-reboot" data-serial="${esc(d.serial)}">${ICON.refresh}<span>${esc(T("Restart normally"))}</span></button></div></div>`);
  }

  // Plugged in but not reachable yet — Windows' own device list tells us why.
  if(!ready.length && !others.length){
    const usb = s.usb || [];
    const apple = usb.filter(u => u.kind === "apple");
    const driver = usb.filter(u => u.problem && (u.kind === "adb" || u.kind === "mtp" || u.kind === "fastboot"));
    const noDebug = usb.filter(u => !u.problem && (u.kind === "mtp" || u.kind === "ptp"));
    const otherProblem = usb.filter(u => u.problem && u.kind === "other");
    if(apple.length) parts.push(cxIphoneCard(apple[0]));
    if(driver.length) parts.push(`<div class="cx-callout warn"><div class="finding-title">${esc(T("Phone found, but its driver is missing"))}</div>
      <div class="finding-meta"><span class="notranslate-tf">${esc(driver.map(u => u.name).join(", "))}</span> — ${esc(T("Windows sees it but can't talk to it."))}</div>
      <ol class="cx-steps"><li>${esc(T("Samsung: install the Samsung USB driver. Google Pixel and most others: the Google USB driver."))}</li><li>${esc(T("Then unplug and plug the phone back in."))}</li></ol>
      <div class="cx-row"><button class="btn sm" data-cx-link="https://developer.samsung.com/android-usb-driver">${esc(T("Samsung USB driver"))}</button>
      <button class="btn sm" data-cx-link="https://developer.android.com/studio/run/win-usb">${esc(T("Google USB driver"))}</button>
      <button class="btn sm ghost" data-cx-link="https://developer.android.com/studio/run/oem-usb">${esc(T("Other brands"))}</button></div></div>`);
    if(noDebug.length && !driver.length) parts.push(`<div class="cx-callout"><div class="finding-title">${esc(T("Android phone plugged in — turn on USB debugging"))}</div>
      <div class="finding-meta"><span class="notranslate-tf">${esc(noDebug[0].name)}</span> — ${esc(T("Windows sees its files, but TechFix needs USB debugging to check and repair it."))}</div>
      ${cxDebugSteps()}</div>`);
    if(otherProblem.length) parts.push(`<div class="cx-callout warn"><div class="finding-title">${esc(T("A USB device has a driver problem"))}</div>
      <div class="finding-meta"><span class="notranslate-tf">${esc(otherProblem.map(u => u.name || u.cls).join(", "))}</span></div></div>`);
    if(!apple.length && !driver.length && !noDebug.length && s.adb) parts.push(`<div class="cx-callout"><div class="finding-title">${esc(T("No phone found yet"))}</div>
      <ol class="cx-steps"><li>${esc(T("Plug the phone in and unlock it."))}</li>
      <li>${esc(T("Use a cable that carries data — some cheap cables only charge. Try another USB port."))}</li>
      <li>${esc(T("If the phone asks what the USB connection is for, choose “File transfer”."))}</li></ol>
      ${cxDebugSteps()}</div>`);
  }
  box.innerHTML = parts.join("");

  const ia = el("#cx-install-adb");
  if(ia) ia.addEventListener("click", async () => { await cxRun(T("Install the Android tools"), "installAdb"); cxRefresh(true); });
  box.querySelectorAll("[data-cx-mode]").forEach(b => b.addEventListener("click", async () => { await cxRun(T("Restart normally"), "modeAction", { serial: b.dataset.serial, id: b.dataset.cxMode }); cxRefresh(true); }));
  box.querySelectorAll("[data-cx-link]").forEach(b => b.addEventListener("click", () => window.open(b.dataset.cxLink, "_blank")));
  box.querySelectorAll("[data-cx-kb]").forEach(b => b.addEventListener("click", () => openKbEntry(b.dataset.cxKb)));
  for(const d of ready) cxWirePhone(d);
}

function cxDebugSteps(){
  return `<details class="cx-how"><summary>${esc(T("How to turn on USB debugging"))}</summary><ol class="cx-steps">
    <li>${esc(T("Settings › About phone (Samsung: › Software information)."))}</li>
    <li>${esc(T("Tap “Build number” 7 times until it says you're a developer."))}</li>
    <li>${esc(T("Back to Settings › Developer options (Samsung: at the bottom; Pixel: System › Developer options)."))}</li>
    <li>${esc(T("Turn on “USB debugging”, then tap Allow on the message that appears on the phone."))}</li>
    <li>${esc(T("When you're done with TechFix, turn USB debugging off again."))}</li></ol></details>`;
}

function cxIphoneCard(u){
  const kbIos = (typeof KB !== "undefined" ? KB.find(k => k.id === "ios-1-01") : null);
  return `<div class="cx-callout"><div class="finding-title">${esc(T("iPhone or iPad found"))} <span class="notranslate-tf cx-muted">${esc(u.name)}</span></div>
    <div class="finding-meta">${esc(T("Apple doesn't let other programs read or repair an iPhone over the cable. What works from this computer:"))}</div>
    <ol class="cx-steps">
      <li>${esc(T("Back it up: the Apple Devices app (or iTunes) › your iPhone › Back Up Now."))}</li>
      <li>${esc(T("Stuck on the Apple logo or won't start: put it in recovery mode (volume up, volume down, then hold the side button) and choose Update in Apple Devices — it keeps your data."))}</li>
      <li>${esc(T("“Trust this computer?” on the iPhone: tap Trust, then unplug and plug back in."))}</li>
    </ol>
    <div class="cx-row"><button class="btn sm" data-cx-link="ms-windows-store://pdp/?ProductId=9NP83LWLPZ9K">${esc(T("Apple Devices app"))}</button>
    ${kbIos ? `<button class="btn sm ghost" data-cx-kb="${esc(kbIos.id)}">${ICON.book}<span>${esc(T("iPhone fixes in the knowledge base"))}</span></button>` : ""}</div></div>`;
}

/* ---------- One connected Android phone ---------- */
const CX_TOOLS = [
  { id:"trim-caches", label:"Free app caches", note:"Deletes only temporary files apps can rebuild — no photos, messages or settings." },
  { id:"kill-background", label:"Close background apps", note:"Frees memory; the apps reopen normally when you tap them." },
  { id:"copy-photos", label:"Copy photos to this computer", note:"Copies the camera and Pictures folders. Nothing is deleted from the phone." },
  { id:"crash-log", label:"Read the crash log", note:"Pulls the phone's error log into Analyze Log and matches it against the knowledge base." },
  { id:"screenshot", label:"Take a screenshot", note:"Saves what the phone shows right now — handy to show a problem." },
  { id:"install-techfix", label:"Install TechFix on the phone", note:"Puts the TechFix app on the phone; it then updates itself." },
  { id:"reboot", label:"Restart the phone", note:"" },
  { id:"reboot-recovery", label:"Restart into Recovery", note:"Advanced: the phone's repair menu (wipe cache, factory reset, apply update).", confirm:"The phone restarts into its Recovery menu. Use the volume buttons to move and power to choose. “Reboot system now” brings it back. Don't pick “Wipe data/factory reset” unless you mean it — it erases the phone." },
  { id:"reboot-bootloader", label:"Restart into the bootloader (Fastboot)", note:"Advanced: for flashing firmware.", confirm:"The phone restarts into its bootloader (Fastboot). TechFix shows it here and can restart it normally. Nothing is erased by this step." }
];

function cxPhoneCard(d){
  const scan = CX.scans[d.serial];
  return `<div class="cx-device ready" data-cx-dev="${esc(d.serial)}">
    <div class="cx-dev-head"><span class="lamp"></span><strong class="notranslate-tf">${esc(cxDevName(d))}</strong>
      <span class="cx-dev-state">${esc(d.wireless ? T("Connected over Wi-Fi") : T("Connected by USB"))}</span>
      <button class="btn sm primary" data-cx-scan>${ICON.scan}<span>${esc(scan ? T("Check again") : T("Check this phone"))}</span></button></div>
    <div class="cx-scan">${scan ? cxScanHtml(scan) : ""}</div>
    <div class="cx-tools">${CX_TOOLS.map(t => `<button class="cx-tool" data-cx-tool="${t.id}" title="${esc(T(t.note || t.label))}"><span class="cx-tool-label">${esc(T(t.label))}</span>${t.note ? `<span class="cx-tool-note">${esc(T(t.note))}</span>` : ""}</button>`).join("")}</div>
    <div class="stat-note cx-muted" style="margin-top:8px;">${esc(T("When you're done, turn USB debugging off: Settings › Developer options."))}</div>
  </div>`;
}

function cxScanHtml(d){
  // The phone forecast mixes health and security codes; let the shared list renderer know both.
  if(typeof SEC_FC !== "undefined") for(const k in SEC_FC) if(!SYS_FC[k]) SYS_FC[k] = SEC_FC[k];
  if(d.error) return `<div class="stat-note">${esc(T("Scan failed:"))} ${esc(d.error === "not_connected" ? T("the phone isn't connected any more.") : d.error)}</div>`;
  const st = d.storage || {}, m = d.memory || {}, b = d.battery || {};
  const usedSto = st.totalBytes ? 1 - st.freeBytes / st.totalBytes : null;
  const usedMem = m.totalBytes ? 1 - m.availBytes / m.totalBytes : null;
  const bat = typeof b.level === "number" ? b.level / 100 : null;
  const findings = [...androidDeviceFindings(d), ...androidSecurityFindings(d).map(f => ({ ...f, title: T(SEC_TITLE[f.code] || f.code) }))];
  if(d.crashApps && d.crashApps.length) findings.push({ code:"and_crashes", severity: d.crashApps[0].count >= 3 ? "medium" : "low",
    title: T("Apps crashed recently"), detail: d.crashApps.map(c => `${c.app} ×${c.count}`).join(", "), cxTool:"crash-log" });
  if(d.bootloaderLocked === false) findings.push({ code:"and_unlocked", severity:"medium", title:T("Bootloader is unlocked"),
    detail:T("Fine if you installed a custom system on purpose; otherwise the phone may have been tampered with."), androidKey:"security" });
  const forecast = androidDeviceForecast(d).concat(androidSecurityForecast(androidSecurityFindings(d)));
  const counts = { crit:0, high: findings.filter(f => f.severity === "high").length, medium: findings.filter(f => f.severity === "medium").length, low: findings.filter(f => f.severity === "low").length };
  const bd = d.breakdown || {};
  const bdItems = [["Photos", bd.photos], ["Videos", bd.videos], ["Apps", bd.apps], ["App data", bd.appData], ["App caches", bd.caches], ["Audio", bd.audio], ["Downloads", bd.downloads], ["Other", bd.other]]
    .filter(x => typeof x[1] === "number" && x[1] > 50 * 1048576).sort((a, b2) => b2[1] - a[1]);
  return `<div class="cockpit-row">
      <div class="gauge-card">${gaugeSVG({ pct: usedSto, tier: gaugeTier(usedSto, 0.9), valueLabel: usedSto == null ? "—" : Math.round(usedSto * 100) + "%", unitLabel: T("USED") })}<div class="gauge-label">${esc(T("Storage"))}</div></div>
      <div class="gauge-card">${gaugeSVG({ pct: usedMem, tier: gaugeTier(usedMem, 0.9), valueLabel: usedMem == null ? "—" : Math.round(usedMem * 100) + "%", unitLabel: T("USED") })}<div class="gauge-label">${esc(T("Memory"))}</div></div>
      <div class="gauge-card">${gaugeSVG({ pct: bat, tier: bat == null ? "info" : bat <= 0.15 ? "crit" : bat <= 0.3 ? "warn" : "ok", valueLabel: bat == null ? "—" : b.level + "%", unitLabel: typeof b.tempC === "number" ? b.tempC + " °C" : "" })}<div class="gauge-label">${esc(T("Battery"))}</div></div>
      <div class="gauge-card" style="justify-content:center; min-height:98px;">${annunciatorRow(counts)}<div class="gauge-label" style="margin-top:10px;">${esc(T("Status"))}</div></div>
    </div>
    <div class="stat-note" style="margin-bottom:10px;"><span class="notranslate-tf">${esc([d.manufacturer, d.model].filter(Boolean).join(" "))} · Android ${esc(d.release || "?")}</span>${d.securityPatch ? ` · <span>${esc(T("security patch"))}</span> <span class="notranslate-tf">${esc(d.securityPatch)}</span>` : ""}${st.totalBytes ? ` · <span class="notranslate-tf">${fmtBytes(st.freeBytes)} / ${fmtBytes(st.totalBytes)}</span> <span>${esc(T("free"))}</span>` : ""}${typeof d.apps3p === "number" ? ` · <span>${esc(T("{n} apps installed", { n: d.apps3p }))}</span>` : ""}</div>
    ${bdItems.length ? `<div class="cx-breakdown"><span class="cx-muted">${esc(T("What fills the storage:"))}</span> ${bdItems.map(x => `<span class="cx-chip">${esc(T(x[0]))} <span class="notranslate-tf">${fmtBytes(x[1])}</span></span>`).join("")}</div>` : ""}
    ${findings.length ? `<div class="finding-list">${findings.map((f, i) => `<div class="finding">
        <div class="finding-sev ${f.severity}"></div>
        <div class="finding-body"><div class="finding-title">${esc(f.title)}</div><div class="finding-meta">${esc(f.detail || "")}</div>
          ${f.androidKey || f.cxTool || f.code === "and_storage_low" ? `<div class="finding-fixes">
            ${f.code === "and_storage_low" ? `<button class="btn sm primary" data-cx-ftool="trim-caches">${ICON.wrench}<span>${esc(T("Free app caches"))}</span></button><button class="btn sm" data-cx-ftool="copy-photos"><span>${esc(T("Copy photos to this computer"))}</span></button>` : ""}
            ${f.code === "and_mem_low" ? `<button class="btn sm primary" data-cx-ftool="kill-background">${ICON.wrench}<span>${esc(T("Close background apps"))}</span></button>` : ""}
            ${f.cxTool ? `<button class="btn sm primary" data-cx-ftool="${f.cxTool}">${ICON.wrench}<span>${esc(T("Read the crash log"))}</span></button>` : ""}
            ${f.androidKey ? `<button class="btn sm" data-cx-open="${esc(f.androidKey)}">${TF_ICON_NEXT}<span>${esc(T("Open the setting on the phone"))}</span></button>` : ""}
          </div>` : ""}</div>
        ${f.kbId ? `<div class="finding-arrow" data-kb="${f.kbId}">${ICON.chevron}</div>` : ""}
      </div>`).join("")}</div>`
      : `<div class="empty-good">${ICON.check}<span><strong>${esc(T("This phone looks healthy"))}</strong> — ${esc(T("storage, memory, battery and heat are all fine right now."))}</span></div>`}
    ${forecast.length ? `<div class="panel" style="margin-top:12px;"><div class="panel-head"><div class="panel-title">${ICON.activity}${esc(T("What could go wrong next"))}</div></div>${forecastListHtml(forecast, "cxf")}</div>` : ""}`;
}

async function cxScan(serial){
  const card = el(`[data-cx-dev="${CSS.escape(serial)}"]`);
  if(!card || CX.busy[serial]) return;
  CX.busy[serial] = true;
  const box = card.querySelector(".cx-scan");
  box.innerHTML = `<div class="stat-note">${esc(T("Reading the phone…"))}</div>`;
  try{ CX.scans[serial] = await cxCall("phoneScan", { serial }); }
  finally{ CX.busy[serial] = false; }
  box.innerHTML = cxScanHtml(CX.scans[serial]);
  const btn = card.querySelector("[data-cx-scan] span"); if(btn) btn.textContent = T("Check again");
  cxWireScan(card, serial);
}

async function cxTool(serial, id){
  const t = CX_TOOLS.find(x => x.id === id);
  if(!t) return;
  if(t.confirm && !(await cxConfirm(T(t.label), T(t.confirm)))) return;
  await cxRun(T(t.label), "phoneAction", { serial, id }, (r, closeSheet) => {
    if(id === "crash-log" && r.text){
      closeSheet();
      setView("log");
      el("#log-textarea").value = r.text;
      runLogAnalysis();
      showToast(T("Phone crash log loaded — results below."));
    }
  });
  if(["trim-caches", "kill-background", "install-techfix"].includes(id) && CX.scans[serial]) cxScan(serial);
  if(id.startsWith("reboot")){ delete CX.scans[serial]; setTimeout(() => cxRefresh(true), 3000); }
}

function cxWireScan(card, serial){
  card.querySelectorAll("[data-cx-ftool]").forEach(b => b.addEventListener("click", () => cxTool(serial, b.dataset.cxFtool)));
  card.querySelectorAll("[data-cx-open]").forEach(b => b.addEventListener("click", () => cxRun(T("Open the setting on the phone"), "phoneAction", { serial, id:"open-settings", args:{ key: b.dataset.cxOpen } })));
  card.querySelectorAll(".finding-arrow[data-kb]").forEach(n => n.addEventListener("click", () => openKbEntry(n.dataset.kb)));
  card.querySelectorAll("[data-cxf-kb]").forEach(n => n.addEventListener("click", () => openKbEntry(n.getAttribute("data-cxf-kb"))));
}

function cxWirePhone(d){
  const card = el(`[data-cx-dev="${CSS.escape(d.serial)}"]`);
  if(!card) return;
  card.querySelector("[data-cx-scan]").addEventListener("click", () => cxScan(d.serial));
  card.querySelectorAll("[data-cx-tool]").forEach(b => b.addEventListener("click", () => cxTool(d.serial, b.dataset.cxTool)));
  if(CX.scans[d.serial]) cxWireScan(card, d.serial);
  else cxScan(d.serial); // a newly plugged phone is checked right away
}

// Language switch: rebuild the tab in the new language, keeping the phone read-outs.
function cxRerender(){
  const body = el("#connect-body");
  if(!body || !body.innerHTML) return;
  body.innerHTML = "";
  renderConnectView();
  if(cxHas() && CX.status){ cxRenderPhones(); cxRenderDrives(); }
}

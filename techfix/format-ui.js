/* ===================== TechFix — "Format a drive" tab =====================
   Windows app: window.techfixNative.connect("fmtDisks" | "fmtRun" | "fmtRescue") (factory/electron/format.js).
   Lists only USB keys, SD cards and external drives (never the PC's own disks), formats them in
   FAT32 (any size), exFAT or NTFS with presets for PlayStation, Nintendo, Xbox, retro handhelds,
   cameras…, and builds the bootable TechFix rescue USB.
   Loaded after connect-ui.js (uses cxCall / cxRun / cxConfirm / CX_RESULT). */
"use strict";

const FMT = { disks: null, sig: "", sel: null, preset: "universal", timer: null, busy: false };

const FMT_GROUPS = [
  ["Everyday", ["universal", "bigfiles", "windows", "camera"]],
  ["PlayStation", ["ps5", "ps4", "ps3", "ps2", "psp", "vita"]],
  ["Nintendo", ["switch", "switch2", "3ds", "wii", "wiiu", "ds", "gamecube"]],
  ["Xbox", ["xbox", "xbox360"]],
  ["Other", ["retro", "steamdeck", "custom"]]
];
// name, file systems offered (first = recommended), default cluster, label, tip
const FMT_PRESETS = {
  universal: ["Works everywhere", ["FAT32", "exFAT"], 0, "USB", "TVs, car stereos, consoles, old computers. Limit: one file can't be bigger than 4 GB."],
  bigfiles: ["PC + Mac, big files", ["exFAT", "FAT32", "NTFS"], 0, "USB", "Windows and Mac both read and write it; files can be any size."],
  windows: ["Windows only", ["NTFS", "exFAT"], 0, "Backup", "For a backup drive used only with Windows PCs. A Mac can read it but not write to it."],
  camera: ["Camera, dashcam, drone", ["auto", "FAT32", "exFAT"], 0, "CAMERA", "TechFix follows the SD-card standard: FAT32 up to 32 GB, exFAT above. Then format it once more in the camera itself."],
  ps5: ["PS5", ["exFAT", "FAT32"], 0, "PS5", "Game storage: plug it in and the PS5 offers to format it as extended storage (250 GB or more, USB 3). System update: put PS5UPDATE.PUP in PS5 › UPDATE."],
  ps4: ["PS4", ["exFAT", "FAT32"], 0, "PS4", "Media and saves: FAT32 or exFAT. System update: PS4UPDATE.PUP in PS4 › UPDATE. For game storage the PS4 reformats the drive itself (250 GB or more)."],
  ps3: ["PS3", ["FAT32"], 0, "PS3", "The PS3 only reads FAT32 (files up to 4 GB). Update file: PS3UPDAT.PUP in PS3 › UPDATE."],
  ps2: ["PS2 (Open PS2 Loader)", ["FAT32", "exFAT"], 32768, "PS2", "DVD games (.iso) go in DVD, CD games in CD. FAT32 works with every OPL version; exFAT needs OPL 1.2 or newer."],
  psp: ["PSP", ["FAT32"], 32768, "PSP", "Memory Stick or microSD adapter: games in ISO or PSP › GAME, saves in PSP › SAVEDATA."],
  vita: ["PS Vita (SD2Vita)", ["exFAT"], 0, "VITA", "For an SD2Vita adapter (with StorageMgr). The Vita's own memory cards are formatted by the console."],
  switch: ["Switch", ["FAT32", "exFAT"], 65536, "SWITCH", "FAT32 with 64 KB clusters is the most reliable — exFAT can damage files if the console crashes. The Switch creates its Nintendo folder by itself."],
  switch2: ["Switch 2", ["exFAT"], 0, "SWITCH2", "The Switch 2 only takes microSD Express cards. This clears it in exFAT; the console finishes the setup."],
  "3ds": ["3DS / 2DS", ["FAT32"], 32768, "3DS", "FAT32 with 32 KB clusters, even on cards over 32 GB — that's how the 3DS and 2DS read them."],
  wii: ["Wii", ["FAT32"], 32768, "WII", "Homebrew Channel and USB Loader GX: apps in apps, games in wbfs."],
  wiiu: ["Wii U", ["FAT32"], 32768, "WIIU", "For homebrew (apps in wiiu › apps). For game storage, the Wii U formats the drive itself."],
  ds: ["DS flashcart (R4…)", ["FAT32"], 32768, "DS", "Most R4-type flashcarts only accept cards up to 32 GB."],
  gamecube: ["GameCube (SD2SP2)", ["FAT32"], 32768, "GAMECUBE", "SD2SP2 or SD Gecko with Swiss: games go in games."],
  xbox: ["Xbox Series / One", ["NTFS", "exFAT"], 0, "XBOX", "Media and backups. For game storage, the Xbox formats the drive itself (USB 3, 128 GB or more)."],
  xbox360: ["Xbox 360", ["FAT32"], 32768, "XBOX360", "The Xbox 360 needs FAT32; then Settings › System › Storage › configure the drive."],
  retro: ["Retro handheld", ["FAT32", "exFAT"], 32768, "ROMS", "Anbernic, Miyoo, R36S, RG35XX… Most firmware wants FAT32; games go in roms."],
  steamdeck: ["Steam Deck", ["exFAT"], 0, "DECK", "The Steam Deck reformats the card its own way (Settings › Storage › Format). This only clears it."],
  custom: ["Custom", ["FAT32", "exFAT", "NTFS"], 0, "USB", "Choose everything yourself."]
};
const FMT_CLUSTERS = [0, 4096, 8192, 16384, 32768, 65536, 131072];
const FMT_STEPS = {
  check: "Checking the drive…", clean: "Erasing the partition table…", format: "Formatting…", folders: "Creating the folders…", done: "Finishing…",
  "ventoy-download": "Downloading Ventoy (boot loader)…", ventoy: "Making the key bootable (Ventoy)…", techfix: "Copying TechFix onto the key…",
  hbcd: "Downloading Hiren's BootCD PE (about 3 GB)…"
};
Object.assign(CX_RESULT, {
  fmt_done: "Formatted: {letter}: in {fs} — {size}, label “{label}”.",
  fmt_changed: "The drive changed (unplugged or another one plugged in). Nothing was erased — pick it again.",
  fmt_refused: "TechFix refused: that isn't a USB key, SD card or external drive. Nothing was erased.",
  fmt_readonly: "The drive is write-protected. SD card: slide the little lock switch up. Otherwise the drive may be failing.",
  fmt_partition: "Windows couldn't rewrite the drive's partition table. Close any window using it, unplug and plug it back in, then try again.",
  fmt_cluster_small: "This cluster size is too big for this drive in FAT32 — choose a smaller one (or Default).",
  fmt_cluster_big: "This drive needs bigger clusters in FAT32 — choose a bigger one (or Default).",
  fmt_fat32_2tb: "FAT32 can't hold more than 2 TB — use exFAT for this drive.",
  fmt_bad_request: "Those settings don't go together — check the file system and cluster size.",
  fmt_error: "Formatting failed.",
  fmt_no_result: "Formatting didn't report back. Check the drive in File Explorer.",
  rescue_done: "The TechFix rescue USB is ready on {letter}: — it boots any PC (choose it in the boot menu: F12, F11, F10, F9, F8 or Esc).",
  rescue_too_small: "This key is too small — use one of at least {need}.",
  rescue_hbcd_failed: "Hiren's BootCD PE didn't download — the key still boots; you can add any .iso later.",
  ventoy_offline: "Couldn't reach Ventoy's official download. Check the internet connection.",
  ventoy_download: "The Ventoy download failed. Check the internet connection and try again.",
  ventoy_checksum: "The Ventoy download didn't match its official checksum, so TechFix didn't use it. Try again.",
  ventoy_extract: "Ventoy downloaded but couldn't be unpacked.",
  ventoy_failed: "Ventoy couldn't make the key bootable. Close any window using the key, unplug and plug it back in, then try again."
});
CX_SIZE_PARAMS.push("need");

const fmtHas = () => !!(window.techfixNative && typeof window.techfixNative.connect === "function") && /Windows/i.test(navigator.userAgent);
const fmtClusterLabel = (c) => c ? (c >= 1024 ? (c / 1024) + " KB" : c + " B") : T("Default");
const fmtFsLabel = (f) => f === "auto" ? T("Automatic (SD-card standard)") : f;

function formatViewChanged(view){
  clearInterval(FMT.timer); FMT.timer = null;
  if(view !== "format") return;
  renderFormatView();
  if(fmtHas()){ fmtRefresh(true); FMT.timer = setInterval(() => { if(!document.hidden && !FMT.busy) fmtRefresh(false); }, 5000); }
}

async function fmtRefresh(force){
  if(FMT.loading) return;
  FMT.loading = true;
  try{
    const r = await cxCall("fmtDisks");
    FMT.disks = r;
    const sig = JSON.stringify((r.disks || []).map(d => [d.number, d.uid, d.size, (d.vols || []).map(v => v.letter + v.fs + v.label)]));
    if(force || sig !== FMT.sig){
      FMT.sig = sig;
      if(FMT.sel && !(r.disks || []).some(d => d.uid === FMT.sel.uid && d.number === FMT.sel.number)) FMT.sel = null;
      if(!FMT.sel && (r.disks || []).length === 1) FMT.sel = r.disks[0];
      fmtRenderDisks(); fmtRenderSummary();
    }
  } finally { FMT.loading = false; }
}

function renderFormatView(){
  const body = el("#format-body");
  if(!body) return;
  if(!fmtHas()){
    body.innerHTML = `<div class="panel"><div class="panel-title">${ICON.disk}${esc(T("Works in the TechFix app for Windows"))}</div>
      <p class="stat-note" style="margin:0 0 12px;">${esc(T("Formatting a drive needs the installed TechFix app on a Windows PC."))}</p>
      ${window.TechFixAndroid ? "" : `<button class="btn primary" id="fmt-get-app">${ICON.upload}<span>${esc(T("Get the app"))}</span></button>`}</div>`;
    const b = el("#fmt-get-app"); if(b) b.addEventListener("click", () => showInstallSheet());
    return;
  }
  if(el("#fmt-disks")) return;
  body.innerHTML = `
    <div class="panel cx-card"><div class="panel-head"><div class="panel-title">${ICON.disk}${esc(T("1. Choose the drive"))}</div>
      <button class="btn sm ghost" id="fmt-refresh">${ICON.refresh}<span>${esc(T("Look again"))}</span></button></div>
      <div id="fmt-disks"><div class="stat-note">${esc(T("Looking for drives…"))}</div></div>
      <p class="stat-note cx-muted" style="margin:10px 0 0;">${esc(T("Only USB keys, SD cards and external drives are shown — TechFix never lists or formats the disks inside this PC."))}</p></div>

    <div class="panel cx-card"><div class="panel-title">${ICON.wand}${esc(T("2. What is it for?"))}</div>
      ${FMT_GROUPS.map(([g, ids]) => `<div class="fmt-group"><div class="fmt-group-name">${esc(T(g))}</div><div class="fmt-presets">
        ${ids.map(id => `<button class="fmt-preset" data-fmt-preset="${id}">${esc(T(FMT_PRESETS[id][0]))}</button>`).join("")}</div></div>`).join("")}
    </div>

    <div class="panel cx-card"><div class="panel-title">${ICON.wrench}${esc(T("3. Settings"))}</div>
      <p class="stat-note fmt-tip" id="fmt-tip"></p>
      <div class="cx-form">
        <label><span>${esc(T("File system"))}</span><select class="cx-select" id="fmt-fs"></select></label>
        <label><span>${esc(T("Cluster size"))}</span><select class="cx-select" id="fmt-cluster"></select></label>
        <label><span>${esc(T("Name (label)"))}</span><input id="fmt-label" maxlength="32"></label>
        <label><span>${esc(T("Partition table"))}</span><select class="cx-select" id="fmt-style"><option value="MBR">${esc(T("MBR — works everywhere (recommended)"))}</option><option value="GPT">GPT</option></select></label>
      </div>
      <div id="fmt-summary" class="fmt-summary"></div>
      <div class="cx-row"><button class="btn fmt-danger" id="fmt-go">${ICON.alert}<span>${esc(T("Erase and format"))}</span></button></div>
    </div>

    <div class="panel cx-card"><div class="panel-title">${ICON.shield}${esc(T("TechFix rescue USB (bootable)"))}</div>
      <p class="stat-note" style="margin:0 0 8px;">${esc(T("Turns the chosen key into a USB that boots any PC — even one whose Windows no longer starts — with TechFix on it. It uses Ventoy (free, open source): any .iso you copy onto the key later (Windows, Linux, rescue tools) appears in its boot menu."))}</p>
      <label class="fmt-check"><input type="checkbox" id="fmt-hbcd" checked> <span>${esc(T("Add Hiren's BootCD PE — a free Windows rescue desktop with repair tools (about 3 GB, needs an 8 GB key or more)"))}</span></label>
      <div class="cx-row"><button class="btn fmt-danger" id="fmt-rescue">${ICON.shield}<span>${esc(T("Create the rescue USB"))}</span></button></div>
      <p class="stat-note cx-muted" style="margin:8px 0 0;">${esc(T("To start a PC from it: plug it in, switch the PC on and press the boot-menu key (F12, F11, F10, F9, F8 or Esc depending on the brand), then choose the USB key."))}</p>
    </div>`;
  el("#fmt-refresh").addEventListener("click", () => fmtRefresh(true));
  body.querySelectorAll("[data-fmt-preset]").forEach(b => b.addEventListener("click", () => fmtPick(b.dataset.fmtPreset)));
  ["#fmt-fs", "#fmt-cluster", "#fmt-label", "#fmt-style"].forEach(s => el(s).addEventListener("input", fmtRenderSummary));
  el("#fmt-go").addEventListener("click", fmtGo);
  el("#fmt-rescue").addEventListener("click", fmtRescue);
  fmtPick(FMT.preset);
}

function fmtRenderDisks(){
  const box = el("#fmt-disks");
  if(!box) return;
  const r = FMT.disks || {};
  const disks = r.disks || [];
  if(!disks.length){
    box.innerHTML = `<div class="cx-callout"><div class="finding-title">${esc(T("No USB key, SD card or external drive found"))}</div>
      <div class="finding-meta">${esc(r.readersEmpty ? T("A card reader is empty — insert the card.") : T("Plug one in — it shows up here by itself."))}</div></div>`;
    return;
  }
  box.innerHTML = `<div class="fmt-disks">${disks.map((d, i) => {
    const on = FMT.sel && FMT.sel.uid === d.uid && FMT.sel.number === d.number;
    const vols = (d.vols || []).map(v => `${v.letter}: ${v.label ? "“" + v.label + "” " : ""}${v.fs || "RAW"}`).join(" · ");
    return `<button class="fmt-disk${on ? " on" : ""}" data-fmt-disk="${i}">
      <span class="fmt-radio"></span>
      <span class="fmt-disk-body"><span class="fmt-disk-name notranslate-tf">${esc(d.name || "USB")}</span>
        <span class="cx-muted"><span class="notranslate-tf">${fmtBytes(d.size)} · ${esc(d.bus)}${vols ? " · " + esc(vols) : ""}</span>${d.readOnly ? ` · ${esc(T("write-protected"))}` : ""}</span></span>
    </button>`; }).join("")}</div>`;
  box.querySelectorAll("[data-fmt-disk]").forEach(b => b.addEventListener("click", () => { FMT.sel = disks[Number(b.dataset.fmtDisk)]; fmtRenderDisks(); fmtRenderSummary(); }));
}

function fmtPick(id){
  FMT.preset = id;
  const p = FMT_PRESETS[id];
  document.querySelectorAll("[data-fmt-preset]").forEach(b => b.classList.toggle("on", b.dataset.fmtPreset === id));
  el("#fmt-fs").innerHTML = p[1].map(f => `<option value="${f}">${esc(fmtFsLabel(f))}</option>`).join("");
  el("#fmt-cluster").innerHTML = FMT_CLUSTERS.map(c => `<option value="${c}"${c === p[2] ? " selected" : ""}>${esc(fmtClusterLabel(c))}</option>`).join("");
  el("#fmt-label").value = p[3];
  el("#fmt-style").value = "MBR";
  el("#fmt-tip").textContent = T(p[4]);
  fmtRenderSummary();
}

function fmtSettings(){
  return { fs: el("#fmt-fs").value, cluster: Number(el("#fmt-cluster").value), label: el("#fmt-label").value, style: el("#fmt-style").value };
}

function fmtRenderSummary(){
  const box = el("#fmt-summary");
  if(!box) return;
  const s = fmtSettings(), d = FMT.sel;
  let fsName = s.fs;
  if(fsName === "auto" && d) fsName = d.size <= 32e9 * 1.075 ? "FAT32" : "exFAT";
  const warn = [];
  if(d && fsName === "FAT32" && d.size > 2199023255552) warn.push(T("FAT32 can't hold more than 2 TB — use exFAT for this drive."));
  if(d && fsName === "FAT32" && d.size > 34359738368) warn.push(T("Over 32 GB: Windows can't do FAT32 at this size, TechFix does it with its own formatter."));
  box.innerHTML = d
    ? `<div><strong class="notranslate-tf">${esc(d.name)} · ${fmtBytes(d.size)}</strong> → <span class="notranslate-tf">${esc(fmtFsLabel(fsName))}</span> · ${esc(fmtClusterLabel(s.cluster))} · <span class="notranslate-tf">${esc(s.style)}</span></div>
       <div class="fmt-erase">${ICON.alert}<span>${esc(T("Everything on this drive will be erased."))}</span></div>${warn.map(w => `<div class="stat-note">${esc(w)}</div>`).join("")}`
    : `<div class="stat-note">${esc(T("Choose a drive in step 1."))}</div>`;
  ["#fmt-go", "#fmt-rescue"].forEach(sel => { const b = el(sel); if(b) b.disabled = !d || FMT.busy; });
}

// Type-to-confirm: formatting can't be undone.
async function fmtConfirm(title, d){
  const word = T("ERASE");
  let typed = "";
  const vols = (d.vols || []).map(v => v.letter + ":").join(" ");
  const v = await openSheet({ title: `${ICON.alert} ${esc(title)}`,
    html: `<p class="sheet-p"><strong class="notranslate-tf">${esc(d.name)} · ${fmtBytes(d.size)}${vols ? " · " + esc(vols) : ""}</strong></p>
      <p class="sheet-p">${esc(T("Everything on this drive will be erased, for good. Copy anything you want to keep first."))}</p>
      <p class="sheet-p">${esc(T("Type {word} to confirm:", { word }))}</p><input class="cx-select fmt-confirm" id="fmt-confirm-input" autocomplete="off" style="width:100%">`,
    actions: [{ id:"no", label:T("Cancel") }, { id:"go", label:T("Erase and format"), primary:true }],
    onMount: (root) => {
      const inp = root.querySelector("#fmt-confirm-input"), go = root.querySelector('[data-act="go"]');
      go.disabled = true;
      inp.addEventListener("input", () => { typed = inp.value; go.disabled = typed.trim().toUpperCase() !== word.toUpperCase(); });
      setTimeout(() => inp.focus(), 50);
    } });
  return v === "go" && typed.trim().toUpperCase() === word.toUpperCase();
}

async function fmtGo(){
  const d = FMT.sel;
  if(!d || FMT.busy) return;
  if(!(await fmtConfirm(T("Erase and format"), d))) return;
  FMT.busy = true; fmtRenderSummary();
  try{
    await cxRun(T("Format {name}", { name: d.name }), "fmtRun", Object.assign({ number: d.number, uid: d.uid, size: d.size, preset: FMT.preset }, fmtSettings()));
  } finally { FMT.busy = false; fmtRefresh(true); }
}

async function fmtRescue(){
  const d = FMT.sel;
  if(!d || FMT.busy) return;
  if(!(await fmtConfirm(T("Create the rescue USB"), d))) return;
  FMT.busy = true; fmtRenderSummary();
  try{
    await cxRun(T("TechFix rescue USB (bootable)"), "fmtRescue", { number: d.number, uid: d.uid, size: d.size, hbcd: el("#fmt-hbcd").checked, style: "MBR" });
  } finally { FMT.busy = false; fmtRefresh(true); }
}

function fmtRerender(){
  const body = el("#format-body");
  if(!body || !body.innerHTML) return;
  body.innerHTML = "";
  renderFormatView();
  if(FMT.disks){ fmtRenderDisks(); fmtRenderSummary(); }
}

/* ===================== TechFix — next-failure forecast + Android phone panel =====================
   Forecast: what is most likely to break NEXT on this PC, from the native scan's early-warning
   signs plus TechFix's own trend history (free space over time → "full in about N days").
   Phone panel: real readings from the Android app (TechFixAndroid.scan()) as cockpit gauges,
   with findings and Fix it buttons that open the right Settings screen.
   Loaded before app.js; uses app.js helpers at call time. */
"use strict";

const SYS_FC = {
  fc_disk_fail:["Disk “{name}” may fail","Back up now; replace the drive if errors keep appearing."],
  fc_hardware:["A hardware fault is developing","Run the memory test, update BIOS/chipset drivers, check temperatures."],
  fc_shutdowns:["Sudden shutdowns are likely","Clean dust from the fans, check the charger or power supply, keep the vents clear."],
  fc_bsod:["More blue screens are likely","Update drivers through Windows Update and repair the system files."],
  fc_battery:["The battery will need replacing","It holds {health}% of its original capacity — expect sudden shutdowns on battery."],
  fc_updates:["Windows updates will keep failing","Reset the Windows Update components and free some disk space."],
  fc_instability:["Windows is getting less stable","Repair the Windows image (DISM) and the system files (SFC)."],
  fc_slowdown:["Slowdowns and freezes are likely","Close heavy programs, cut startup apps, add RAM if it happens often."],
  fc_app:["{app} will probably keep crashing","Update or reinstall it."],
  fc_disk_full:["Drive {drive} will be full in about {days} days","Free space now: empty temp files, uninstall apps you don't use."],
  fc_phone_battery:["The phone battery is aging","Expect shorter battery life; avoid heat and charging to 100% overnight."],
  fc_phone_storage:["Phone storage will run out","Clear app caches, move photos to the cloud or a computer."],
  fc_phone_heat:["The phone may throttle or shut down from heat","Remove the case while charging, avoid gaming while charging."]
};
const FC_LV = { imminent:["Imminent","crit"], likely:["Likely","warn"], watch:["Watch","info"] };
const FC_RANK = { imminent:0, likely:1, watch:2 };

/* ---------- Trend history (local to this device only) ---------- */
function tfLoadHistory(){ try{ return JSON.parse(localStorage.getItem("techfix.history") || "[]"); }catch(e){ return []; } }
function tfRecordScan(res){
  if(!res || !res.disks) return;
  try{
    const now = Date.now();
    const h = tfLoadHistory().filter(x => now - x.t < 120 * 86400000);
    const entry = { t: now, disks: res.disks.map(d => ({ id: d.id, freeBytes: d.freeBytes, sizeBytes: d.sizeBytes })) };
    const last = h[h.length - 1];
    if(last && now - last.t < 6 * 3600000) h[h.length - 1] = entry; else h.push(entry);
    localStorage.setItem("techfix.history", JSON.stringify(h.slice(-60)));
  }catch(e){}
}
function tfDiskTrend(){
  const h = tfLoadHistory();
  if(h.length < 2) return [];
  const first = h[0], last = h[h.length - 1];
  const days = (last.t - first.t) / 86400000;
  if(days < 2) return [];
  const out = [];
  for(const d of last.disks || []){
    const old = (first.disks || []).find(x => x.id === d.id);
    if(!old || !d.freeBytes) continue;
    const perDay = (old.freeBytes - d.freeBytes) / days;
    if(perDay <= 0) continue;
    const left = Math.round(d.freeBytes / perDay);
    if(left <= 90) out.push({ code:"fc_disk_full", level: left <= 7 ? "imminent" : left <= 30 ? "likely" : "watch", params:{ drive: d.id, days: left }, kbId:"gen-sto-03", preventFixId: "clear-windows-temp" });
  }
  return out;
}

function forecastListHtml(list, prefix){
  if(!list.length) return `<div class="empty-good">${ICON.check}<span>${esc(T("No early-warning signs right now — nothing points to a next breakdown."))}</span></div>`;
  return `<div class="forecast-list">${list.map((f, i) => {
    const d = SYS_FC[f.code] || [f.code, ""];
    const l = FC_LV[f.level] || FC_LV.watch;
    const canFix = (f.preventFixId && window.techfixNative) || (f.androidKey && window.TechFixAndroid);
    return `<div class="forecast ${l[1]}">
      <div class="forecast-lamp"><span class="lamp ${l[1] === "info" ? "" : l[1]}"></span><span>${esc(T(l[0]))}</span></div>
      <div class="forecast-body"><div class="finding-title">${esc(T(d[0], f.params))}</div><div class="finding-meta">${esc(T("Prevent it:"))} ${esc(T(d[1], f.params))}</div></div>
      ${canFix ? `<button class="btn sm primary" data-${prefix}-prevent="${i}">${ICON.wrench}<span>${esc(T("Prevent now"))}</span></button>` : ""}
      ${f.kbId ? `<button class="btn sm ghost" data-${prefix}-kb="${esc(f.kbId)}" title="${esc(T("Open in the knowledge base"))}">${ICON.book}</button>` : ""}
    </div>`; }).join("")}</div>`;
}
function wireForecastList(wrap, list, prefix){
  wrap.querySelectorAll(`[data-${prefix}-prevent]`).forEach(b => b.addEventListener("click", () => {
    const f = list[Number(b.getAttribute(`data-${prefix}-prevent`))];
    if(f.androidKey) openAndroidFix([f.androidKey]);
    else runFixPlan([f.preventFixId], T((SYS_FC[f.code] || [f.code])[0], f.params));
  }));
  wrap.querySelectorAll(`[data-${prefix}-kb]`).forEach(b => b.addEventListener("click", () => openKbEntry(b.getAttribute(`data-${prefix}-kb`))));
}

// Called by app.js after every native scan.
function renderNativeForecast(){
  const wrap = el("#native-forecast");
  if(!wrap) return;
  const res = state.native && state.native.result;
  if(!res || !res.supported || res.error){ wrap.innerHTML = ""; return; }
  const list = [...(res.forecast || []), ...tfDiskTrend()].sort((a, b) => (FC_RANK[a.level] ?? 9) - (FC_RANK[b.level] ?? 9));
  wrap.innerHTML = `<div class="panel" style="margin-top:12px;">
    <div class="panel-head"><div class="panel-title">${ICON.activity}${esc(T("What could go wrong next"))}</div></div>
    <p class="stat-note" style="margin:0 0 10px;">${esc(T("Early-warning signs, not certainties — ranked by how soon they could hit, each with what prevents it."))}</p>
    ${forecastListHtml(list, "nf")}</div>`;
  wireForecastList(wrap, list, "nf");
}

/* ---------- Android phone panel ---------- */
const BAT_HEALTH = { 2:"good", 3:"overheating", 4:"dead", 5:"over-voltage", 6:"failure", 7:"too cold" };
const THERMAL = ["none","light","moderate","severe","critical","emergency","shutdown"];

function androidDeviceFindings(d){
  const out = [];
  const add = (code, severity, title, detail, androidKey, kbId) => out.push({ code, severity, title, detail, androidKey, kbId });
  const st = d.storage || {};
  if(st.totalBytes){
    const freePct = st.freeBytes / st.totalBytes * 100;
    if(freePct < 10) add("and_storage_low", freePct < 5 ? "high" : "medium", T("Phone storage almost full"), T("Only {pct}% free — apps, photos and updates will start failing.", { pct: freePct.toFixed(1) }), "storage", "and-oem-09");
  }
  const b = d.battery || {};
  if(typeof b.tempC === "number" && b.tempC >= 42) add("and_battery_hot", b.tempC >= 46 ? "high" : "medium", T("Battery is hot"), T("{temp} °C — let the phone cool down, avoid charging while gaming.", { temp: b.tempC }), "battery", "and-14-01");
  if(b.health && b.health !== 2 && BAT_HEALTH[b.health]) add("and_battery_health", "high", T("Battery reports a fault"), T("Android reports the battery as “{status}”.", { status: T(BAT_HEALTH[b.health]) }), "battery", "gen-pow-03");
  if(typeof b.level === "number" && b.level <= 15 && !(b.plugged > 0)) add("and_battery_low", "medium", T("Battery low and not charging"), T("{pct}% left.", { pct: b.level }), "battery-saver", null);
  const m = d.memory || {};
  if(m.low) add("and_mem_low", "medium", T("Memory is low"), T("Android is in low-memory mode — apps will close in the background."), "apps", "and-lol-01");
  if(typeof d.thermalStatus === "number" && d.thermalStatus >= 2) add("and_thermal", d.thermalStatus >= 4 ? "high" : "medium", T("Phone is throttling from heat"), T("Thermal status: {level}.", { level: T(THERMAL[d.thermalStatus] || String(d.thermalStatus)) }), "battery", "and-14-01");
  if(d.powerSave) add("and_power_save", "low", T("Battery saver is on"), T("Background sync and notifications may be delayed."), "battery-saver", "and-pie-01");
  const upDays = Math.floor((d.uptimeMinutes || 0) / 1440);
  if(upDays >= 14) add("and_uptime_long", "low", T("Not restarted for a long time"), T("Last restart {days} days ago — a restart clears many glitches.", { days: upDays }), null, null);
  return out;
}
function androidDeviceForecast(d){
  const out = [];
  const b = d.battery || {};
  if((typeof b.cycles === "number" && b.cycles >= 500) || (b.health && b.health !== 2)) out.push({ code:"fc_phone_battery", level: b.cycles >= 800 ? "likely" : "watch", androidKey:"battery", kbId:"gen-pow-03" });
  const st = d.storage || {};
  if(st.totalBytes && st.freeBytes / st.totalBytes < 0.15) out.push({ code:"fc_phone_storage", level: st.freeBytes / st.totalBytes < 0.07 ? "likely" : "watch", androidKey:"storage", kbId:"and-oem-09" });
  if((typeof b.tempC === "number" && b.tempC >= 42) || (typeof d.thermalStatus === "number" && d.thermalStatus >= 2)) out.push({ code:"fc_phone_heat", level:"watch", androidKey:"battery", kbId:"and-14-01" });
  return out;
}

function renderAndroidPanel(){
  const panel = el("#android-panel");
  if(!panel || !window.TechFixAndroid) return;
  panel.hidden = false;
  const wrap = el("#android-results");
  let d;
  try{ d = JSON.parse(window.TechFixAndroid.scan() || "{}"); }catch(e){ d = { error: String(e) }; }
  state.androidScan = d;
  if(d.error && !d.battery){ wrap.innerHTML = `<div class="stat-note">${esc(T("Scan failed:"))} ${esc(d.error)}</div>`; return; }
  const st = d.storage || {}, m = d.memory || {}, b = d.battery || {};
  const usedSto = st.totalBytes ? 1 - st.freeBytes / st.totalBytes : null;
  const usedMem = m.totalBytes ? 1 - m.availBytes / m.totalBytes : null;
  const bat = typeof b.level === "number" ? b.level / 100 : null;
  const findings = androidDeviceFindings(d);
  const forecast = androidDeviceForecast(d);
  const counts = { crit: findings.filter(f => f.severity === "critical").length, high: findings.filter(f => f.severity === "high").length,
                   medium: findings.filter(f => f.severity === "medium").length, low: findings.filter(f => f.severity === "low").length };
  wrap.innerHTML = `<div class="cockpit-row">
      <div class="gauge-card">${gaugeSVG({ pct: usedSto, tier: gaugeTier(usedSto, 0.9), valueLabel: usedSto == null ? "—" : Math.round(usedSto * 100) + "%", unitLabel: T("USED") })}<div class="gauge-label">${esc(T("Storage"))}</div></div>
      <div class="gauge-card">${gaugeSVG({ pct: usedMem, tier: gaugeTier(usedMem, 0.9), valueLabel: usedMem == null ? "—" : Math.round(usedMem * 100) + "%", unitLabel: T("USED") })}<div class="gauge-label">${esc(T("Memory"))}</div></div>
      <div class="gauge-card">${gaugeSVG({ pct: bat, tier: bat == null ? "info" : bat <= 0.15 ? "crit" : bat <= 0.3 ? "warn" : "ok", valueLabel: bat == null ? "—" : b.level + "%", unitLabel: typeof b.tempC === "number" ? b.tempC + " °C" : "" })}<div class="gauge-label">${esc(T("Battery"))}</div></div>
      <div class="gauge-card" style="justify-content:center; min-height:98px;">${annunciatorRow(counts)}<div class="gauge-label" style="margin-top:10px;">${esc(T("Status"))}</div></div>
    </div>
    <div class="stat-note" style="margin-bottom:10px;">${esc([d.manufacturer, d.model].filter(Boolean).join(" "))} · Android ${esc(d.release || "?")}${d.securityPatch ? " · " + esc(T("security patch")) + " " + esc(d.securityPatch) : ""}${st.totalBytes ? " · " + fmtBytes(st.freeBytes) + " " + esc(T("free of")) + " " + fmtBytes(st.totalBytes) : ""}${typeof b.cycles === "number" ? " · " + b.cycles + " " + esc(T("charge cycles")) : ""}</div>
    ${findings.length ? `<div class="finding-list">${findings.map((f, i) => `<div class="finding">
        <div class="finding-sev ${f.severity}"></div>
        <div class="finding-body"><div class="finding-title">${esc(f.title)}</div><div class="finding-meta">${esc(f.detail)}</div>
          ${f.androidKey ? `<div class="finding-fixes"><button class="btn sm primary fixit-btn" data-and-fix="${i}">${ICON.wrench}<span>${esc(T("Fix it"))}</span></button></div>` : ""}</div>
        ${f.kbId ? `<div class="finding-arrow" data-kb="${f.kbId}">${ICON.chevron}</div>` : ""}
      </div>`).join("")}</div>`
      : `<div class="empty-good">${ICON.check}<span><strong>${esc(T("This phone looks healthy"))}</strong> — ${esc(T("storage, memory, battery and heat are all fine right now."))}</span></div>`}
    <div class="panel" style="margin-top:12px;"><div class="panel-head"><div class="panel-title">${ICON.activity}${esc(T("What could go wrong next"))}</div></div>${forecastListHtml(forecast, "af")}</div>`;
  wrap.querySelectorAll("[data-and-fix]").forEach(btn => btn.addEventListener("click", () => openAndroidFix([findings[Number(btn.dataset.andFix)].androidKey])));
  wrap.querySelectorAll(".finding-arrow[data-kb]").forEach(n => n.addEventListener("click", () => openKbEntry(n.dataset.kb)));
  wireForecastList(wrap, forecast, "af");
}

function initAndroidPanel(){
  if(!window.TechFixAndroid) return;
  const btn = el("#android-scan-btn");
  if(btn) btn.addEventListener("click", renderAndroidPanel);
  renderAndroidPanel();
}

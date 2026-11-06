/* ===================== TechFix — Security tab =====================
   Windows app: window.techfixNative.security() — an audit around Microsoft Defender plus the
   system settings that keep a PC safe. Android app: the security part of TechFixAndroid.scan().
   Web: explains what the installed app adds. Every finding gets a "Fix it" button (fixit.js).
   Loaded before app.js; uses app.js helpers (el, esc, ICON, gaugeSVG, …) at call time. */
"use strict";

// Short titles for security findings (the engine's `detail` gives the specifics).
const SEC_TITLE = {
  threat_active:"Active threats found", no_antivirus:"No working antivirus", defender_policy:"A policy is turning Defender off",
  defender_off:"Antivirus is off", rtp_off:"Real-time protection is off", signatures_old:"Virus definitions are out of date",
  scan_old:"No recent virus scan", tamper_off:"Tamper Protection is off", behavior_off:"Behaviour monitoring is off",
  pua_off:"Unwanted-app blocking is off", cfa_off:"Ransomware protection is off", defender_exclusions:"Antivirus exclusions found",
  recent_detections:"Threats were caught recently", firewall_off:"Firewall is off", uac_off:"User Account Control is off",
  uac_silent:"UAC never asks administrators", smartscreen_off:"SmartScreen is off", wdigest_on:"Passwords kept readable in memory",
  rdp_on:"Remote Desktop is on", smb1_on:"Old SMBv1 file sharing is on", risky_port:"Risky service open to the network",
  guest_on:"Guest account is on", no_password_users:"Accounts without a password", bitlocker_off:"Drive not encrypted",
  secureboot_off:"Secure Boot is off", hosts_hijack:"Hosts file redirects important sites", hosts_custom:"Custom hosts-file entries",
  proxy_set:"A proxy is set", winhttp_proxy:"System-wide proxy is set", startup_suspicious:"Suspicious programs at startup",
  task_suspicious:"Suspicious scheduled tasks", process_suspicious:"Unsigned programs running from Temp/Downloads",
  security_updates_pending:"Security updates waiting", update_stale:"Updates are overdue",
  and_no_lock:"No screen lock", and_dev_options:"Developer options are on", and_usb_debug:"USB debugging is on",
  and_admins:"Apps with device-admin control", and_accessibility:"Apps with accessibility control",
  and_notif_listeners:"Apps that read your notifications", and_patch_old:"Security patch is old", and_not_encrypted:"Storage not encrypted"
};
const SEC_FC = {
  fc_reinfection:["The problem may come back","Run an offline Defender scan and remove the suspicious startup entries and tasks."],
  fc_intrusion:["Remote access risk","Turn off Remote Desktop and SMBv1 if unused, use strong passwords, keep the firewall on."],
  fc_ransomware:["Ransomware exposure","Turn on ransomware protection and keep one backup unplugged from the PC."],
  fc_phishing:["Fake or redirected websites likely","Reset the hosts file and proxy, then scan."],
  fc_unpatched:["Known security holes stay open","Install updates and refresh the virus definitions."],
  fc_account:["Password theft risk","Put a password on every account."],
  fc_phone_patch:["Phone is missing security fixes","Install the system update, or plan a replacement if updates have stopped."],
  fc_phone_spy:["Someone may be monitoring this phone","Review device-admin and accessibility apps you don't recognize."]
};
const SEC_WEIGHT = { critical:25, high:12, medium:6, low:2 };

function secScore(findings){
  let s = 100;
  for(const f of findings) s -= SEC_WEIGHT[f.severity] || 0;
  return Math.max(0, Math.min(100, s));
}

/* ---------- Android phone security (from TechFixAndroid.scan()) ---------- */
function androidSecurityFindings(scan){
  const out = [];
  const sec = (scan && scan.security) || {};
  const add = (code, severity, detail, androidKey) => out.push({ code, severity, detail, androidKey });
  if(sec.screenLock === false) add("and_no_lock", "high", T("Anyone who picks up the phone can open it."), "security");
  if(sec.usbDebugging) add("and_usb_debug", "medium", T("A computer it's plugged into could control the phone."), "developer");
  else if(sec.developerOptions) add("and_dev_options", "low", T("Fine if you use them; otherwise turn them off."), "developer");
  const admins = (sec.deviceAdmins || []).filter(n => !/google|android|samsung|find ?my|work profile/i.test(n));
  if(admins.length) add("and_admins", "medium", admins.join(", "), "device-admin");
  const acc = sec.accessibility || [];
  if(acc.length) add("and_accessibility", "medium", acc.join(", ") + " — " + T("these can read the screen and act for you."), "accessibility");
  const nl = (sec.notificationListeners || []).filter(n => !/google|android|samsung|wear|watch/i.test(n));
  if(nl.length) add("and_notif_listeners", "low", nl.join(", "), "notification-access");
  if(scan && scan.securityPatch){
    const d = new Date(scan.securityPatch + "T00:00:00");
    const months = Math.floor((Date.now() - d.getTime()) / (30.4 * 86400000));
    if(months >= 6) add("and_patch_old", months >= 12 ? "high" : "medium", T("Last security patch {months} months ago.", { months }), "system-update");
  }
  if(sec.encryption === 1) add("and_not_encrypted", "medium", T("Data could be read if the phone is lost."), "security");
  return out;
}
function androidSecurityForecast(findings){
  const has = (c) => findings.some(f => f.code === c);
  const out = [];
  if(has("and_patch_old")) out.push({ code:"fc_phone_patch", level:"likely", androidKey:"system-update" });
  if(has("and_accessibility") || has("and_admins")) out.push({ code:"fc_phone_spy", level:"watch", androidKey:"accessibility" });
  return out;
}

/* ---------- Rendering ---------- */
function secFindingHtml(f, i){
  const kb = f.kbId ? KB.find(k => k.id === f.kbId) : null;
  const fixable = f.safeFixId || f.riskyFixId || f.androidKey;
  return `<div class="finding">
    <div class="finding-sev ${f.severity}"></div>
    <div class="finding-body">
      <div class="finding-title">${esc(T(SEC_TITLE[f.code] || f.detail || f.code))}</div>
      <div class="finding-meta">${esc(f.code && NATIVE_DETAIL[f.code] ? nativeDetail(f) : (f.detail || ""))}</div>
      ${fixable ? `<div class="finding-fixes"><button class="btn sm primary fixit-btn" data-sec-fix="${i}">${ICON.wrench}<span>${esc(T("Fix it"))}</span></button></div>` : ""}
    </div>
    ${kb ? `<div class="finding-arrow" data-kb="${kb.id}">${ICON.chevron}</div>` : ""}
  </div>`;
}
function secForecastHtml(list){
  if(!list || !list.length) return `<div class="empty-good">${ICON.check}<span>${esc(T("No early-warning signs right now."))}</span></div>`;
  const lv = { imminent:["Imminent","crit"], likely:["Likely","warn"], watch:["Watch","info"] };
  return `<div class="forecast-list">${list.map((f, i) => {
    const d = SEC_FC[f.code] || [f.code, ""]; const l = lv[f.level] || lv.watch;
    const canFix = (f.preventFixId && window.techfixNative) || (f.androidKey && window.TechFixAndroid);
    return `<div class="forecast ${l[1]}">
      <div class="forecast-lamp"><span class="lamp ${l[1] === "info" ? "" : l[1]}"></span><span>${esc(T(l[0]))}</span></div>
      <div class="forecast-body"><div class="finding-title">${esc(T(d[0]))}</div><div class="finding-meta">${esc(T("Prevent it:"))} ${esc(T(d[1]))}</div></div>
      ${canFix ? `<button class="btn sm primary" data-sec-prevent="${i}">${ICON.wrench}<span>${esc(T("Prevent now"))}</span></button>` : ""}
    </div>`; }).join("")}</div>`;
}
function secLamps(res){
  const def = res.defender || {};
  const otherAv = (res.avProducts || []).some(p => p.name && !/defender/i.test(p.name));
  const fw = (res.firewall || []);
  const lamps = [
    { label:T("Antivirus"), ok: otherAv || !!(def.service && def.av) },
    { label:T("Real-time"), ok: otherAv ? null : (def.rtp === undefined ? null : !!def.rtp) },
    { label:T("Definitions"), ok: otherAv || typeof def.sigAge !== "number" ? null : def.sigAge <= 3 },
    { label:T("Firewall"), ok: fw.length ? fw.every(p => p.enabled) : null },
    { label:"UAC", ok: res.uacOn !== false },
    { label:T("Encryption"), ok: res.bitlocker === 1 ? true : res.bitlocker === 2 ? false : null },
    { label:"Secure Boot", ok: res.secureBoot === 1 ? true : res.secureBoot === 0 ? false : null }
  ];
  return `<div class="lamp-panel">${lamps.map(l => `<div class="sys-lamp ${l.ok === true ? "ok" : l.ok === false ? "bad" : "unk"}"><span class="lamp"></span>${esc(l.label)}</div>`).join("")}</div>`;
}

function renderSecurityView(){
  const wrap = el("#security-body");
  if(!wrap) return;
  const res = state.securityResult;
  const native = !!window.techfixNative, phone = !!window.TechFixAndroid;

  if(!native && !phone){
    const secKb = KB.filter(k => (k.tags || []).includes("security"));
    wrap.innerHTML = `<div class="panel">
        <div class="panel-title">${ICON.shield}${esc(T("Real protection needs the installed app"))}</div>
        <p class="view-sub" style="margin:6px 0 12px;">${esc(T("A web page can't look at your antivirus, firewall or startup programs. The TechFix app for Windows checks all of that with the Microsoft Defender engine, and fixes what it finds in one click. On Android it checks your screen lock, security patch and the apps that control your phone."))}</p>
        <button class="btn primary" id="sec-install">${ICON.wrench}<span>${esc(T("Get the TechFix app"))}</span></button>
      </div>
      <div class="panel"><div class="panel-title">${ICON.book}${esc(T("Security problems and their fixes"))}</div><div class="kb-list" id="sec-kb"></div></div>`;
    el("#sec-install").addEventListener("click", () => window.open(TF_INSTALL_URL, "_blank", "noopener"));
    renderKbList(secKb, el("#sec-kb"));
    return;
  }

  const head = `<div class="panel" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <div style="font-size:13px; color:var(--text-dim); max-width:60ch;">${esc(native ? T("TechFix checks this PC with the Microsoft Defender engine and the Windows security settings, then fixes what it finds. Nothing leaves this computer.") : T("TechFix checks this phone's security settings and opens the right screen to fix each one. Nothing leaves this phone."))}</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn ghost sm" id="sec-scan-btn">${ICON.refresh}<span>${esc(state.securityBusy ? T("Checking…") : T("Run security check"))}</span></button>
        ${native ? `<button class="btn primary sm" id="sec-av-btn">${ICON.shield}<span>${esc(T("Virus scan now"))}</span></button>` : ""}
      </div></div>`;

  if(!res){ wrap.innerHTML = head + `<div class="stat-note">${esc(state.securityBusy ? T("Checking… this can take up to a minute.") : T("Run a security check to see how well this device is protected."))}</div>`; wireSecurityHead(); return; }
  if(res.error){ wrap.innerHTML = head + `<div class="stat-note">${esc(T("Security check failed:"))} ${esc(res.error)}</div>`; wireSecurityHead(); return; }

  const findings = (res.findings || []).slice().sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
  const score = secScore(findings);
  const tier = score >= 85 ? "ok" : score >= 60 ? "warn" : "crit";
  const counts = { crit: findings.filter(f => f.severity === "critical").length, high: findings.filter(f => f.severity === "high").length,
                   medium: findings.filter(f => f.severity === "medium").length, low: findings.filter(f => f.severity === "low").length };
  const cockpit = `<div class="cockpit-row">
      <div class="gauge-card">${gaugeSVG({ pct: score / 100, tier, valueLabel: String(score), unitLabel: T("SCORE") })}<div class="gauge-label">${esc(T("Protection"))}</div></div>
      <div class="gauge-card" style="justify-content:center; min-height:98px; flex:2;">${native ? secLamps(res) : ""}${annunciatorRow(counts)}<div class="gauge-label" style="margin-top:10px;">${esc(T("Status"))}</div></div>
    </div>
    <div class="stat-note" style="margin:-4px 0 10px;">${esc(T("The score is TechFix's own checklist: 100 minus points for each problem found."))}</div>`;

  const list = findings.length ? `<div class="finding-list">${findings.map(secFindingHtml).join("")}</div>`
    : `<div class="empty-good">${ICON.check}<span><strong>${esc(T("Well protected"))}</strong> — ${esc(T("no security problem found in this check."))}</span></div>`;

  let extra = "";
  if(native){
    const flagged = (res.startup || []).filter(s => (s.flags || []).length);
    const ports = (res.listening || []).slice(0, 15);
    extra = `<details class="panel sec-details"><summary>${esc(T("Details: startup programs, open ports, hosts file"))}</summary>
      <div class="kb-block"><div class="kb-block-label">${esc(T("Startup programs"))} (${(res.startup || []).length})</div>
        <ul>${(res.startup || []).slice(0, 25).map(s => `<li class="notranslate-tf">${(s.flags || []).length ? "⚠️ " : ""}<strong>${esc(s.name)}</strong> <code>${esc(s.cmd || "")}</code> <small>${esc(s.where || "")} · ${esc(s.sig || "")}</small></li>`).join("") || `<li>—</li>`}</ul></div>
      <div class="kb-block"><div class="kb-block-label">${esc(T("Open network ports"))}</div>
        <ul>${ports.map(p => `<li class="notranslate-tf"><code>${p.port}</code> ${esc(p.proc || "?")}</li>`).join("") || `<li>—</li>`}</ul></div>
      <div class="kb-block"><div class="kb-block-label">${esc(T("Hosts file"))}</div>
        <ul>${(res.hosts || []).map(h => `<li><code>${esc(h)}</code></li>`).join("") || `<li>${esc(T("Default (clean)"))}</li>`}</ul></div>
      ${flagged.length ? `<p class="sheet-note">⚠️ = ${esc(T("flagged: runs from a temporary folder, uses a hidden command, or isn't signed"))}</p>` : ""}
    </details>`;
  }

  wrap.innerHTML = head + cockpit +
    `<div class="panel"><div class="panel-head"><div class="panel-title">${ICON.alert}${esc(T("Findings"))}</div></div>${list}</div>` +
    `<div class="panel"><div class="panel-head"><div class="panel-title">${ICON.activity}${esc(T("What could go wrong next"))}</div></div>${secForecastHtml(res.forecast)}</div>` +
    extra + selfProtectionHtml();

  wireSecurityHead();
  wrap.querySelectorAll("[data-sec-fix]").forEach(b => b.addEventListener("click", () => {
    const f = findings[Number(b.dataset.secFix)];
    fixItForFinding(f, T(SEC_TITLE[f.code] || f.detail));
  }));
  wrap.querySelectorAll("[data-sec-prevent]").forEach(b => b.addEventListener("click", () => {
    const f = res.forecast[Number(b.dataset.secPrevent)];
    if(f.androidKey) openAndroidFix([f.androidKey]); else runFixPlan([f.preventFixId], T((SEC_FC[f.code] || [f.code])[0]));
  }));
  wrap.querySelectorAll(".finding-arrow[data-kb]").forEach(n => n.addEventListener("click", () => openKbEntry(n.dataset.kb)));
}

// How TechFix protects itself (shown so the user can see it, not just trust it).
function selfProtectionHtml(){
  const items = [
    T("Runs in an isolated, sandboxed window — the page has no direct access to files or commands."),
    T("Can only run repairs from its own fixed list; the page sends a repair name, never a command."),
    T("Only accepts requests from its own window, nothing else on the PC can trigger a repair."),
    T("Anything that changes system settings shows its exact command and waits for your tick."),
    T("Works offline: no scan result ever leaves the device.")
  ];
  return `<details class="panel sec-details"><summary>${ICON.shield} ${esc(T("How TechFix protects itself"))}</summary><ul class="sheet-list">${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul></details>`;
}

function wireSecurityHead(){
  const s = el("#sec-scan-btn"); if(s) s.addEventListener("click", () => runSecurityScan(false));
  const a = el("#sec-av-btn"); if(a) a.addEventListener("click", () => runFixPlan(["defender-update", "defender-quick"], T("Virus scan now")));
}

async function runSecurityScan(silent){
  if(state.securityBusy) return;
  window.__tfSecurityRan = true;
  state.securityBusy = true;
  if(!silent) renderSecurityView();
  try{
    if(window.techfixNative && window.techfixNative.security){
      state.securityResult = await window.techfixNative.security();
    } else if(window.TechFixAndroid){
      const scan = JSON.parse(window.TechFixAndroid.scan() || "{}");
      const findings = androidSecurityFindings(scan);
      state.securityResult = { supported:true, findings, forecast: androidSecurityForecast(findings) };
    }
  }catch(e){
    state.securityResult = { error: String(e && e.message || e) };
  }
  state.securityBusy = false;
  renderSecurityView();
  if(typeof updateNavCounts === "function") updateNavCounts();
}

/* ===================== TechFix — Remote help ("Aide à distance") =====================
   Someone far away helps with a device that has TechFix installed — without taking over the screen.

   · The person who needs help taps "Ask for help": TechFix shows a one-time code (10 characters,
     ~49 bits). She sends it to the helper (text message).
   · The helper types the code in his own TechFix (any device, anywhere): he sees her device's real
     state (readings, problems, unwanted / spy apps) and sends REQUESTS — open a Settings screen,
     uninstall or mute an app, run a Windows repair. Each request is shown on her device as
     "Martin asks: …" and only happens if she taps Allow. Text messages go both ways.
   · The session ends by itself after 30 minutes, or when either side taps End.

   Transport: a public ntfy relay (https://ntfy.sh — open source, can be self-hosted later; set
   localStorage "techfix:relay" to the other server). Everything is end-to-end encrypted:
   AES-256-GCM with a key derived from the code (PBKDF2-SHA-256, 200 000 rounds); the relay topic is a
   hash of the code too, so the relay only ever sees random-looking bytes.
   Requests carry only a kind + a key from a fixed list: the text she reads ("open Storage") is
   written by HER TechFix, never by the helper, so a request can't pretend to be something else. */
"use strict";

const TFR_ALPHA = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const TFR_MINUTES = 30;
const TFR_CHUNK = 3000;
const TFR_SETTINGS = ["storage", "battery", "battery-saver", "apps", "notifications", "wifi", "bluetooth", "mobile-network", "data-usage", "display",
  "sound", "location", "accessibility", "notification-access", "device-admin", "security", "play-protect", "system-update", "date", "accounts",
  "overlay", "unknown-sources", "default-apps", "privacy", "about"];
const TFR_SETTING_LABEL = {
  storage: "Storage", battery: "Battery", "battery-saver": "Battery saver", apps: "Apps", notifications: "Notifications", wifi: "Wi-Fi",
  bluetooth: "Bluetooth", "mobile-network": "Mobile network", "data-usage": "Data usage", display: "Display", sound: "Sound", location: "Location",
  accessibility: "Accessibility", "notification-access": "Notification access", "device-admin": "Device admin apps", security: "Security",
  "play-protect": "Play Protect", "system-update": "System update", date: "Date & time", accounts: "Accounts", overlay: "Display over other apps",
  "unknown-sources": "Install unknown apps", "default-apps": "Default apps", privacy: "Privacy", about: "About phone"
};
const TFR = { s: null };

/* ---------- crypto + relay ---------- */
const tfrRelay = () => { try{ const r = localStorage.getItem("techfix:relay"); if(r && /^(https:\/\/[\w.-]+|http:\/\/(localhost|127\.0\.0\.1))(:\d+)?\/?$/.test(r)) return r.replace(/\/$/, ""); }catch(_){} return "https://ntfy.sh"; };
const tfrNorm = (c) => String(c || "").toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0").replace(/[^0-9A-Z]/g, "");
function tfrNewCode(){
  const b = crypto.getRandomValues(new Uint8Array(10));
  return [...b].map(x => TFR_ALPHA[x % TFR_ALPHA.length]).join("");
}
const tfrPretty = (c) => c.slice(0, 4) + "-" + c.slice(4, 8) + "-" + c.slice(8);
const b64 = (u8) => { let s = ""; for(let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function tfrDerive(code){
  const enc = new TextEncoder(), norm = tfrNorm(code);
  const base = await crypto.subtle.importKey("raw", enc.encode(norm), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("techfix-remote-v1"), iterations: 200000 }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("techfix-topic|" + norm)));
  return { key, topic: "tfr" + [...h.slice(0, 16)].map(x => x.toString(16).padStart(2, "0")).join("") };
}
async function tfrZip(bytes, inflate){
  if(typeof CompressionStream === "undefined") return null;
  const s = new Blob([bytes]).stream().pipeThrough(inflate ? new DecompressionStream("gzip") : new CompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

class TFRSession {
  constructor(role, code, handlers){
    this.role = role; this.code = tfrNorm(code); this.h = handlers || {};
    this.me = Math.random().toString(36).slice(2, 10);
    this.parts = {}; this.seen = new Set(); this.es = null; this.closed = false;
    this.started = Date.now(); this.peer = null;
  }
  async open(){
    const d = await tfrDerive(this.code);
    this.key = d.key; this.topic = d.topic; this.url = tfrRelay() + "/" + d.topic;
    const since = Math.floor(this.started / 1000) - 120;
    this.es = new EventSource(this.url + "/sse?since=" + since);
    this.es.onmessage = (e) => { try{ const m = JSON.parse(e.data); if(m.event && m.event !== "message") return; if(this.seen.has(m.id)) return; this.seen.add(m.id); this.recv(m.message); }catch(_){} };
    this.es.onerror = () => { if(this.h.status) this.h.status(this.es.readyState === 2 ? "lost" : "retry"); };
    this.es.onopen = () => { if(this.h.status) this.h.status("ok"); };
  }
  async recv(text){
    let m; try{ m = JSON.parse(text); }catch(_){ return; }
    if(!m || m.v !== 1 || m.s === this.me || typeof m.d !== "string") return;
    const box = this.parts[m.k] = this.parts[m.k] || { n: m.n, got: {} };
    box.got[m.i] = m.d;
    if(Object.keys(box.got).length < box.n) return;
    delete this.parts[m.k];
    try{
      const all = unb64(Array.from({ length: box.n }, (_, i) => box.got[i]).join(""));
      let plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12), additionalData: new TextEncoder().encode(this.topic) }, this.key, all.slice(12)));
      if(m.z) plain = await tfrZip(plain, true);
      const msg = JSON.parse(new TextDecoder().decode(plain));
      if(!msg || typeof msg.t !== "string") return;
      if(msg.from && msg.from !== this.role) { this.peer = m.s; if(this.h.msg) this.h.msg(msg); }
    }catch(_){ /* wrong code or damaged message: ignored */ }
  }
  async send(obj){
    if(this.closed) return false;
    const json = new TextEncoder().encode(JSON.stringify(Object.assign({ from: this.role }, obj)));
    const zipped = json.length > 600 ? await tfrZip(json, false).catch(() => null) : null;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(this.topic) }, this.key, zipped || json));
    const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
    const s = b64(all), n = Math.ceil(s.length / TFR_CHUNK), k = Math.random().toString(36).slice(2, 10);
    for(let i = 0; i < n; i++){
      const body = JSON.stringify({ v: 1, s: this.me, k, i, n, z: zipped ? 1 : 0, d: s.slice(i * TFR_CHUNK, (i + 1) * TFR_CHUNK) });
      try{
        const r = await fetch(this.url, { method: "POST", body });
        if(!r.ok){ if(this.h.status) this.h.status(r.status === 429 ? "busy" : "lost"); return false; }
      }catch(_){ if(this.h.status) this.h.status("lost"); return false; }
    }
    return true;
  }
  close(){ this.closed = true; try{ this.es && this.es.close(); }catch(_){} }
}

/* ---------- what this device can do ---------- */
const tfrKind = () => window.TechFixAndroid ? "android" : (window.techfixNative && typeof window.techfixNative.scan === "function") ? "windows" : "web";
async function tfrState(){
  const kind = tfrKind();
  if(kind === "android"){
    let scan = {}; try{ scan = JSON.parse(window.TechFixAndroid.scan() || "{}"); }catch(_){}
    let threats = null;
    if(typeof window.TechFixAndroid.threatScan === "function" && typeof TFThreats !== "undefined"){
      try{
        const r = TFThreats.analyze(window.TechFixAndroid.threatScan(), await TFThreats.loadIoc());
        threats = { total: r.total, protectOff: r.protectOff, flagged: r.flagged.slice(0, 40).map(a => ({ pkg: a.pkg, name: (r.labels || {})[a.pkg] || "", kind: a.kind, level: a.level, reasons: a.reasons, ioc: a.ioc, ageDays: a.ageDays, powers: a.powers })) };
      }catch(_){}
    }
    return { kind, scan, threats, lang: TF_LANG };
  }
  if(kind === "windows"){
    let r = {}; try{ r = await window.techfixNative.scan(); }catch(_){}
    return { kind, lang: TF_LANG, scan: { system: r.system, memory: r.memory, disks: (r.disks || []).slice(0, 4), admin: r.admin,
      findings: (r.findings || []).slice(0, 30), diagnosis: (r.diagnosis || []).slice(0, 6) } };
  }
  return { kind };
}

/* ---------- the person who needs help ---------- */
function tfrAskLabel(a){
  const who = TFR.s && TFR.s.helperName ? TFR.s.helperName : T("Your helper");
  if(a.kind === "settings") return T("{who} asks to open: {screen}", { who, screen: T(TFR_SETTING_LABEL[a.key] || a.key) });
  if(a.kind === "uninstall") return T("{who} asks to uninstall: {app}", { who, app: a.name || a.pkg });
  if(a.kind === "app") return T("{who} asks to open the settings of: {app}", { who, app: a.name || a.pkg });
  if(a.kind === "fix") return T("{who} asks to run on this PC: {list}", { who, list: a.ids.map(id => T((tfFixById(id) || {}).label || id)).join(" · ") });
  if(a.kind === "rescan") return "";
  return "";
}
function tfrValid(a){
  const PKG = /^[A-Za-z][\w]*(\.[\w]+)+$/;
  if(!a || typeof a.kind !== "string") return false;
  if(a.kind === "settings") return TFR_SETTINGS.includes(a.key);
  if(a.kind === "uninstall" || a.kind === "app") return typeof a.pkg === "string" && PKG.test(a.pkg);
  if(a.kind === "fix") return Array.isArray(a.ids) && a.ids.length > 0 && a.ids.length <= 8 && a.ids.every(id => typeof id === "string" && /^[a-z0-9-]{2,40}$/.test(id));
  return a.kind === "rescan";
}
async function tfrStartHelped(){
  const kind = tfrKind();
  if(kind === "web") return openSheet({ title: `${TF_ICON_WRENCH} ${tfEsc(T("Ask for help"))}`, html: `<p class="sheet-p">${tfEsc(T("Remote help needs the TechFix app on this device (Android or Windows), so your helper can see its real state."))}</p>`, actions: [{ id:"ok", label:T("Close"), primary:true }] });
  tfrEnd(true);
  const code = tfrNewCode();
  const s = new TFRSession("helped", code, {});
  TFR.s = s; s.log = []; s.helperName = "";
  s.h.msg = (m) => tfrHelpedMsg(m);
  s.h.status = (st) => { s.net = st; tfrRender(); };
  await s.open();
  s.timer = setInterval(() => { if(Date.now() - s.started > TFR_MINUTES * 60000) tfrEnd(false); else tfrRender(); }, 15000);
  tfrRender();
}
async function tfrHelpedMsg(m){
  const s = TFR.s; if(!s || s.role !== "helped") return;
  if(m.t === "hello"){
    const again = s.joined;
    s.joined = true;
    s.helperName = String(m.name || "").replace(/[<>]/g, "").slice(0, 30);
    if(!again) s.log.push({ who: "sys", text: T("{who} joined. Everything they ask appears here first — nothing happens unless you allow it.", { who: s.helperName || T("Your helper") }) });
    tfrRender();
    s.send({ t: "state", state: await tfrState() });
    return;
  }
  if(m.t === "chat"){ s.log.push({ who: "them", text: String(m.text || "").slice(0, 500) }); tfrRender(); tfrPing(); return; }
  if(m.t === "bye"){ s.log.push({ who: "sys", text: T("The helper ended the session.") }); tfrEnd(false); return; }
  if(m.t === "ask"){
    const a = m.action || {};
    if(!tfrValid(a)) return;
    if(a.kind === "rescan"){ s.send({ t: "state", state: await tfrState() }); return; }
    if(tfrKind() === "windows" && a.kind === "fix") await tfEnsureFixes();
    tfrPing();
    const v = await openSheet({ title: `${TF_ICON_WRENCH} ${tfEsc(T("Remote help request"))}`,
      html: `<p class="sheet-p"><strong>${tfEsc(tfrAskLabel(a))}</strong></p><p class="sheet-note">${tfEsc(T("Only allow it if you're in a session you started with someone you trust."))}</p>`,
      actions: [{ id:"no", label:T("Refuse") }, { id:"yes", label:T("Allow"), primary:true }] });
    if(v !== "yes"){ s.log.push({ who: "sys", text: T("You refused: {what}", { what: tfrAskLabel(a) }) }); tfrRender(); s.send({ t: "result", aid: m.aid, state: "cancelled", code: "refused" }); return; }
    s.log.push({ who: "sys", text: T("You allowed: {what}", { what: tfrAskLabel(a) }) }); tfrRender();
    let res = { state: "failed", code: "no_result" };
    try{
      if(a.kind === "settings") res = { state: window.TechFixAndroid.openSettings(a.key) ? "opened" : "failed", code: "opened" };
      if(a.kind === "uninstall"){
        // A device-admin app (typical of spy apps) must be switched off before Android lets it go.
        let admins = [];
        try{ admins = (JSON.parse(window.TechFixAndroid.scan() || "{}").security || {}).deviceAdmins || []; }catch(_){}
        if(admins.some(x => String(x).indexOf("(" + a.pkg + ")") >= 0 || x === a.pkg)){
          window.TechFixAndroid.openSettings("device-admin");
          const go = await thAsk(T("First: switch off {app}", { app: a.name || a.pkg }), T("{app} is a device administrator, so Android won't uninstall it yet. On the screen that just opened (Device admin apps), switch {app} off, come back here, then tap Next.", { app: a.name || a.pkg }), T("Next"));
          if(go !== "next"){ await s.send({ t: "result", aid: m.aid, state: "cancelled", code: "admin_not_released" }); return; }
        }
        res = { state: window.TechFixAndroid.uninstall(a.pkg) ? "opened" : "failed", code: "uninstall_asked" };
      }
      if(a.kind === "app") res = { state: window.TechFixAndroid.openApp(a.pkg) ? "opened" : "failed", code: "opened" };
      if(a.kind === "fix"){
        const rs = await executeFixes(a.ids, T("Remote help"), null) || [];
        res = { state: rs.every(tfTaskOk) ? "fixed" : rs.some(tfTaskOk) ? "partial" : "failed", code: "fixes_ran", results: rs.map(r => ({ id: r.id, state: r.state, code: r.code, params: r.params })) };
      }
    }catch(e){ res = { state: "failed", code: "no_result" }; }
    await s.send({ t: "result", aid: m.aid, state: res.state, code: res.code, results: res.results });
    // Fresh readings a little later (after an uninstall or a settings change).
    setTimeout(async () => { if(TFR.s === s && !s.closed) s.send({ t: "state", state: await tfrState() }); }, a.kind === "fix" ? 500 : 15000);
  }
}

/* ---------- the helper ---------- */
async function tfrStartHelper(code, name){
  const c = tfrNorm(code);
  if(c.length !== 10) return false;
  tfrEnd(true);
  const s = new TFRSession("helper", c, {});
  TFR.s = s; s.log = []; s.state = null; s.asks = {}; s.myName = String(name || "").slice(0, 30);
  s.h.msg = (m) => tfrHelperMsg(m);
  s.h.status = (st) => { s.net = st; tfrRender(); };
  await s.open();
  s.log.push({ who: "sys", text: T("Connecting… waiting for the other device.") });
  tfrRender();
  // Say hello until the other side answers (it may be opening TechFix right now).
  let tries = 0;
  const hello = async () => { if(TFR.s !== s || s.closed || s.state || tries++ > 8) return; await s.send({ t: "hello", name: s.myName }); setTimeout(hello, 15000); };
  hello();
  return true;
}
function tfrHelperMsg(m){
  const s = TFR.s; if(!s || s.role !== "helper") return;
  if(m.t === "state"){ const first = !s.state; s.state = m.state || {}; if(first) s.log.push({ who: "sys", text: T("Connected — you see the device's real state. Each request is shown to them first.") }); tfrRender(); return; }
  if(m.t === "chat"){ s.log.push({ who: "them", text: String(m.text || "").slice(0, 500) }); tfrRender(); return; }
  if(m.t === "result"){
    const a = s.asks[m.aid];
    const st = TF_STATE[m.state] || TF_STATE.failed;
    const what = a ? a.label : "";
    const extra = m.code === "refused" ? T("refused") : m.code === "admin_not_released" ? T("they didn't switch off its device-admin right") : m.code === "uninstall_asked" ? T("Android asked them to confirm the uninstall") : (m.results || []).map(r => (typeof tfResultText === "function" ? tfResultText(r) : r.code)).join(" · ");
    s.log.push({ who: "sys", text: `${T(st.label)} — ${what}${extra ? " · " + extra : ""}` });
    tfrRender(); return;
  }
  if(m.t === "bye"){ s.log.push({ who: "sys", text: T("They ended the session.") }); tfrEnd(false); }
}
async function tfrAsk(action, label){
  const s = TFR.s; if(!s || s.role !== "helper") return;
  const aid = Math.random().toString(36).slice(2, 9);
  s.asks[aid] = { action, label };
  s.log.push({ who: "me", text: T("Request sent: {what} — waiting for their OK", { what: label }) });
  tfrRender();
  if(!(await s.send({ t: "ask", aid, action }))) { s.log.push({ who: "sys", text: T("Couldn't send — the relay is busy or offline. Try again in a few seconds.") }); tfrRender(); }
}

/* ---------- both sides ---------- */
function tfrEnd(silent){
  const s = TFR.s; if(!s) return;
  if(!s.closed && !silent) s.send({ t: "bye" });
  if(s.timer) clearInterval(s.timer);
  setTimeout(() => s.close(), 800);
  s.closed = true;
  if(silent) TFR.s = null;
  tfrRender();
}
async function tfrChat(text){
  const s = TFR.s; text = String(text || "").trim().slice(0, 500);
  if(!s || s.closed || !text) return;
  s.log.push({ who: "me", text }); tfrRender();
  if(!(await s.send({ t: "chat", text }))) { s.log.push({ who: "sys", text: T("Couldn't send — the relay is busy or offline. Try again in a few seconds.") }); tfrRender(); }
}
function tfrPing(){ try{ if(navigator.vibrate) navigator.vibrate(120); }catch(_){} }

/* ---------- panel ---------- */
function tfrLogHtml(s){
  return `<div class="tfr-log">${(s.log || []).slice(-40).map(l => `<div class="tfr-msg ${l.who}">${tfEsc(l.text)}</div>`).join("")}</div>
    ${s.closed ? "" : `<div class="cx-row tfr-say"><input class="cx-select cx-grow" id="tfr-text" maxlength="500" placeholder="${tfEsc(T("Write a message…"))}"><button class="btn sm primary" id="tfr-send">${tfEsc(T("Send"))}</button></div>`}`;
}
function tfrHelperHtml(s){
  const st = s.state;
  if(!st) return `<div class="stat-note">${tfEsc(T("Waiting for the other device… Ask them to keep TechFix open on the Remote help screen."))}</div>`;
  if(st.kind === "android"){
    const d = st.scan || {}, sto = d.storage || {}, m = d.memory || {}, b = d.battery || {};
    const pct = (a, t) => t ? Math.round((1 - a / t) * 100) + "%" : "—";
    const findings = typeof androidDeviceFindings === "function" ? androidDeviceFindings(d) : [];
    const th = st.threats;
    const thRows = th ? th.flagged.filter(a => a.level !== "info").map(a => `<div class="cx-arow th-row ${(TH_KIND[a.kind] || [])[1] || "info"}">
        <div class="cx-arow-body"><div class="cx-app-name notranslate-tf">${tfEsc(a.name || a.pkg)} <span class="fix-badge ${(TH_KIND[a.kind] || [])[1] === "danger" ? "bad" : "warn"}">${tfEsc(T((TH_KIND[a.kind] || [a.kind])[0]))}</span></div>
          <div class="th-why">${tfEsc(a.reasons.map(c => T(TH_REASON[c] || c, { name: a.ioc, days: a.ageDays })).join(" · "))}</div></div>
        <div class="cx-arow-btns"><button class="btn sm primary" data-tfr-ask="${tfEsc(JSON.stringify({ kind: "uninstall", pkg: a.pkg, name: a.name }))}" data-tfr-label="${tfEsc(T("Uninstall") + " " + (a.name || a.pkg))}">${tfEsc(T("Uninstall"))}</button>
          <button class="btn sm" data-tfr-ask="${tfEsc(JSON.stringify({ kind: "app", pkg: a.pkg, name: a.name }))}" data-tfr-label="${tfEsc(T("Block its ads") + " — " + (a.name || a.pkg))}">${tfEsc(T("Block its ads"))}</button></div></div>`).join("") : "";
    return `<div class="stat-note notranslate-tf" style="margin-bottom:8px;">${tfEsc([d.manufacturer, d.model].filter(Boolean).join(" "))} · Android ${tfEsc(d.release || "?")}${d.securityPatch ? " · " + tfEsc(d.securityPatch) : ""}</div>
      <div class="tfr-gauges"><span>${tfEsc(T("Storage"))} <b>${pct(sto.freeBytes, sto.totalBytes)}</b></span><span>${tfEsc(T("Memory"))} <b>${pct(m.availBytes, m.totalBytes)}</b></span><span>${tfEsc(T("Battery"))} <b>${b.level != null ? b.level + "%" : "—"}</b>${typeof b.tempC === "number" ? " · " + b.tempC + " °C" : ""}</span></div>
      ${findings.length ? `<div class="finding-list">${findings.map(f => `<div class="finding"><div class="finding-sev ${f.severity}"></div><div class="finding-body"><div class="finding-title">${tfEsc(f.title)}</div><div class="finding-meta">${tfEsc(f.detail)}</div>
        ${f.androidKey ? `<div class="finding-fixes"><button class="btn sm primary" data-tfr-ask="${tfEsc(JSON.stringify({ kind: "settings", key: f.androidKey }))}" data-tfr-label="${tfEsc(T("Open") + " " + T(TFR_SETTING_LABEL[f.androidKey] || f.androidKey))}">${TF_ICON_WRENCH}<span>${tfEsc(T("Ask to open {screen}", { screen: T(TFR_SETTING_LABEL[f.androidKey] || f.androidKey) }))}</span></button></div>` : ""}</div></div>`).join("")}</div>`
        : `<div class="empty-good">${ICON.check}<span>${tfEsc(T("Storage, memory, battery and heat look fine."))}</span></div>`}
      ${th ? `<div class="tfr-sub">${tfEsc(T("Unwanted & spy apps"))} — ${tfEsc(thRows ? T("{n} to look at", { n: th.flagged.filter(a => a.level !== "info").length }) : T("none found among {n} apps", { n: th.total }))}</div>${thRows}` : ""}
      <div class="tfr-sub">${tfEsc(T("Open a screen on their phone"))}</div>
      <div class="tfr-keys">${["storage", "battery", "apps", "notifications", "wifi", "bluetooth", "mobile-network", "display", "play-protect", "system-update", "accessibility", "device-admin", "overlay", "accounts"].map(k =>
        `<button class="btn sm ghost" data-tfr-ask="${tfEsc(JSON.stringify({ kind: "settings", key: k }))}" data-tfr-label="${tfEsc(T("Open") + " " + T(TFR_SETTING_LABEL[k]))}">${tfEsc(T(TFR_SETTING_LABEL[k]))}</button>`).join("")}</div>`;
  }
  if(st.kind === "windows"){
    const r = st.scan || {}, sys = r.system || {};
    const fs = (r.findings || []).slice().sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
    const title = (f) => { const kb = f.kbId ? KB.find(k => k.id === f.kbId) : null; return kb ? kbL(kb).title : nativeDetail(f); };
    return `<div class="stat-note notranslate-tf" style="margin-bottom:8px;">${tfEsc(sys.caption || "Windows")} ${tfEsc(sys.build ? "(" + sys.build + ")" : "")}</div>
      ${fs.length ? `<div class="finding-list">${fs.map(f => { const ids = [f.safeFixId, f.riskyFixId].flat().filter(Boolean); return `<div class="finding"><div class="finding-sev ${f.severity}"></div><div class="finding-body"><div class="finding-title">${tfEsc(title(f))}</div><div class="finding-meta">${tfEsc(nativeDetail(f))}</div>
        ${ids.length ? `<div class="finding-fixes"><button class="btn sm primary" data-tfr-ask="${tfEsc(JSON.stringify({ kind: "fix", ids }))}" data-tfr-label="${tfEsc(title(f))}">${TF_ICON_WRENCH}<span>${tfEsc(T("Ask to fix it"))}</span></button></div>` : ""}</div></div>`; }).join("")}</div>`
        : `<div class="empty-good">${ICON.check}<span>${tfEsc(T("Nothing found on that PC."))}</span></div>`}`;
  }
  return `<div class="stat-note">${tfEsc(T("That device doesn't have the TechFix app — only messages work."))}</div>`;
}
function tfrRender(){
  const box = el("#tfr-panel"); if(!box) return;
  // Keep what the person is typing when a message arrives and the panel is redrawn.
  const keep = {}; let focus = null;
  ["tfr-text", "tfr-code", "tfr-name"].forEach(id => { const n = box.querySelector("#" + id); if(n){ keep[id] = n.value; if(document.activeElement === n) focus = id; } });
  const s = TFR.s;
  const live = s && !s.closed;
  const net = s && s.net === "lost" ? `<span class="fix-badge bad">${tfEsc(T("Connection lost — retrying"))}</span>` : s && s.net === "busy" ? `<span class="fix-badge warn">${tfEsc(T("Relay busy — slow down a little"))}</span>` : "";
  let body;
  if(!s){
    body = `<p class="stat-note" style="margin:0 0 10px;">${tfEsc(T("Someone far away can look at this device and guide the repair — or you can help someone else. Nothing happens on a device without its owner tapping Allow, and the screen is never taken over. For them to see your screen too, share it in a Google Meet call."))}</p>
      <div class="tfr-start">
        <div class="tfr-card"><div class="finding-title">${tfEsc(T("I need help"))}</div><div class="stat-note">${tfEsc(T("Get a code and send it to the person who will help you."))}</div>
          <button class="btn primary sm" id="tfr-ask">${tfEsc(T("Ask for help"))}</button></div>
        <div class="tfr-card"><div class="finding-title">${tfEsc(T("I'm helping someone"))}</div>
          <div class="cx-row"><input class="cx-select cx-grow notranslate-tf" id="tfr-code" maxlength="14" placeholder="XXXX-XXXX-XX" autocomplete="off" autocapitalize="characters"></div>
          <div class="cx-row"><input class="cx-select cx-grow" id="tfr-name" maxlength="30" placeholder="${tfEsc(T("Your first name (they'll see it)"))}"></div>
          <button class="btn primary sm" id="tfr-join">${tfEsc(T("Connect"))}</button></div>
      </div>`;
  } else if(s.role === "helped"){
    const left = Math.max(0, TFR_MINUTES - Math.floor((Date.now() - s.started) / 60000));
    body = `${live ? `<div class="tfr-banner">${tfEsc(T("Remote help is on — {n} min left", { n: left }))} ${net}<button class="btn sm" id="tfr-end">${tfEsc(T("End"))}</button></div>
      <div class="tfr-code-show"><div class="stat-note">${tfEsc(T("Send this code to the person who helps you (text message or call):"))}</div><div class="tfr-code notranslate-tf">${tfrPretty(s.code)}</div>
        <button class="btn sm" id="tfr-share">${tfEsc(T("Share the code"))}</button></div>` : `<div class="tfr-banner off">${tfEsc(T("Remote help ended."))} <button class="btn sm" id="tfr-new">${tfEsc(T("Start again"))}</button></div>`}
      ${tfrLogHtml(s)}`;
  } else {
    body = `${live ? `<div class="tfr-banner">${tfEsc(T("Helping — code {code}", { code: tfrPretty(s.code) }))} ${net}<button class="btn sm ghost" id="tfr-refresh">${tfEsc(T("Refresh their state"))}</button><button class="btn sm" id="tfr-end">${tfEsc(T("End"))}</button></div>`
      : `<div class="tfr-banner off">${tfEsc(T("Session ended."))} <button class="btn sm" id="tfr-new">${tfEsc(T("New session"))}</button></div>`}
      ${live ? tfrHelperHtml(s) : ""}
      ${tfrLogHtml(s)}`;
  }
  box.innerHTML = `<div class="panel tfr"><div class="panel-head"><div class="panel-title">${ICON.activity}${tfEsc(T("Remote help"))}</div></div>${body}</div>`;
  const on = (id, fn) => { const n = box.querySelector("#" + id); if(n) n.addEventListener("click", fn); };
  on("tfr-ask", () => tfrStartHelped());
  on("tfr-join", async () => {
    const code = box.querySelector("#tfr-code").value, name = box.querySelector("#tfr-name").value.trim();
    try{ localStorage.setItem("techfix:helper-name", name); }catch(_){}
    if(!(await tfrStartHelper(code, name))) showToast(T("The code has 10 letters and numbers, like K7Q2-M9XR-4T."));
  });
  const nm = box.querySelector("#tfr-name"); if(nm){ try{ nm.value = localStorage.getItem("techfix:helper-name") || ""; }catch(_){} }
  on("tfr-end", () => tfrEnd(false));
  on("tfr-new", () => { TFR.s = null; tfrRender(); });
  on("tfr-refresh", () => tfrAsk({ kind: "rescan" }, T("Refresh their state")));
  on("tfr-share", async () => {
    const text = T("TechFix remote help code: {code}", { code: tfrPretty(s.code) });
    try{ if(navigator.share){ await navigator.share({ text }); return; } }catch(_){}
    try{ await navigator.clipboard.writeText(tfrPretty(s.code)); showToast(T("Code copied")); }catch(_){}
  });
  const send = () => { const i = box.querySelector("#tfr-text"); if(i){ const v = i.value; i.value = ""; tfrChat(v); } };
  on("tfr-send", send);
  const ti = box.querySelector("#tfr-text"); if(ti) ti.addEventListener("keydown", (e) => { if(e.key === "Enter") send(); });
  box.querySelectorAll("[data-tfr-ask]").forEach(b => b.addEventListener("click", () => { try{ tfrAsk(JSON.parse(b.dataset.tfrAsk), b.dataset.tfrLabel); }catch(_){} }));
  const log = box.querySelector(".tfr-log"); if(log) log.scrollTop = log.scrollHeight;
  Object.keys(keep).forEach(id => { const n = box.querySelector("#" + id); if(n && keep[id]) n.value = keep[id]; });
  if(focus){ const n = box.querySelector("#" + focus); if(n) n.focus(); }
}
document.addEventListener("DOMContentLoaded", () => setTimeout(tfrRender, 300));

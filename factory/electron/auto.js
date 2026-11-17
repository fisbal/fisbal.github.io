// TechFix — automatic mode (only in the installed app, where TechFix can really act).
//
// Levels (the user picks one; default off):
//   off       — nothing runs on its own.
//   notify    — TechFix re-checks the PC on its own (3 min after start, then every few hours) and
//               shows a Windows notification when something important appears. One click opens the
//               diagnosis with its "Repair in this order" plan.
//   auto      — same, and it also applies the repairs that are safe AND need no administrator
//               rights (user temp files, DNS cache) without asking. Everything else still waits for you.
//   maintain  — "deep maintenance": after ONE administrator approval, Windows runs a fixed TechFix
//               maintenance task as SYSTEM every night and 15 min after sign-in: virus definitions,
//               Windows temp files, stopped core services, component cleanup when space is short,
//               page file back to automatic if it was turned off. The script lives in a folder only
//               administrators can change, takes no input from the user's files, and writes a log the
//               app reads back. Turning the level down removes the task (one approval).
// Background: optionally TechFix starts with Windows hidden in the tray, so the checks keep running
// with the window closed. Updates still install themselves (the app reopens hidden afterwards).

const { app, Notification, Tray, Menu } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIN = process.platform === "win32";
const AUTO_USER_FIXES = new Set(["clear-temp", "flush-dns"]); // safe + no admin + nothing personal deleted
const TASK = "TechFix Auto Maintenance";
const MAINT_DIR = path.join(process.env.ProgramData || "C:\\ProgramData", "TechFix", "auto");

let D = null;            // { diagnostics, repair, getWin, showWin, send }
let S = null;            // settings
let timer = null, tray = null, running = false, lastResult = null;

const file = () => path.join(app.getPath("userData"), "techfix-auto.json");
const DEFAULTS = { mode: "off", background: false, hours: 6, lang: "en", notified: {}, history: [] };
function load() { try { S = Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(file(), "utf8"))); } catch (_) { S = Object.assign({}, DEFAULTS); } }
function save() { try { fs.writeFileSync(file(), JSON.stringify(S)); } catch (_) {} }
function log(kind, data) { S.history.unshift(Object.assign({ t: Date.now(), kind }, data)); S.history = S.history.slice(0, 40); save(); if (D && D.send) D.send("techfix:auto-state", publicState()); }

// --- notification texts (main process has no page translator) ---
const TXT = {
  en: { found: "TechFix found {n} problem(s) that need you", fixed: "TechFix fixed {n} thing(s) on its own", click: "Click to see the diagnosis and the repair plan.", open: "Open TechFix", check: "Check now", quit: "Quit TechFix" },
  fr: { found: "TechFix a trouvé {n} problème(s) qui demandent ton attention", fixed: "TechFix a réglé {n} chose(s) tout seul", click: "Clique pour voir le diagnostic et le plan de réparation.", open: "Ouvrir TechFix", check: "Vérifier maintenant", quit: "Quitter TechFix" },
  es: { found: "TechFix encontró {n} problema(s) que te necesitan", fixed: "TechFix arregló {n} cosa(s) por su cuenta", click: "Haz clic para ver el diagnóstico y el plan de reparación.", open: "Abrir TechFix", check: "Revisar ahora", quit: "Salir de TechFix" },
  pt: { found: "O TechFix encontrou {n} problema(s) que precisam de você", fixed: "O TechFix resolveu {n} coisa(s) sozinho", click: "Clique para ver o diagnóstico e o plano de reparo.", open: "Abrir o TechFix", check: "Verificar agora", quit: "Sair do TechFix" },
  de: { found: "TechFix hat {n} Problem(e) gefunden, die dich brauchen", fixed: "TechFix hat {n} Sache(n) selbst behoben", click: "Klicke für die Diagnose und den Reparaturplan.", open: "TechFix öffnen", check: "Jetzt prüfen", quit: "TechFix beenden" }
};
const tx = (k, p) => String((TXT[S.lang] || TXT.en)[k] || TXT.en[k]).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? p[x] : m));

function run(file, args, timeout) {
  return new Promise((resolve) => execFile(file, args, { timeout: timeout || 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, out, e) => resolve({ code: err ? 1 : 0, out: String(out || ""), err: String(e || "") })));
}
function ps(script, timeout) {
  const enc = Buffer.from("$ProgressPreference='SilentlyContinue';" + script, "utf16le").toString("base64");
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], timeout);
}

// ------------------------------------------------------------------------------------------
// The check itself
// ------------------------------------------------------------------------------------------
async function checkNow(reason) {
  if (running || !D) return { busy: true };
  running = true;
  if (D.send) D.send("techfix:auto-state", publicState());
  try {
    const res = await D.diagnostics.scan();
    lastResult = res;
    if (!res || !res.supported || res.error) { log("error", { detail: (res && res.error) || "scan failed" }); return { ok: false }; }
    const findings = Array.isArray(res.findings) ? res.findings : [];
    const important = findings.filter((f) => f.severity === "critical" || f.severity === "high");
    // Safe repairs that need nothing from the user (level "auto" and "maintain").
    let fixed = [];
    if (S.mode === "auto" || S.mode === "maintain") {
      const ids = [...new Set(findings.flatMap((f) => [].concat(f.safeFixId || [])).filter((id) => AUTO_USER_FIXES.has(id)))];
      if (ids.length) {
        const out = await D.repair.fixPlan(ids, () => {});
        fixed = (out || []).filter((r) => r.state === "fixed").map((r) => ({ id: r.id, code: r.code, params: r.params || {} }));
        if (fixed.length) log("fixed", { items: fixed });
      }
    }
    // Notify once per problem every 3 days, so it never nags.
    const now = Date.now();
    const fresh = important.filter((f) => !(S.notified[f.code] && now - S.notified[f.code] < 3 * 86400000));
    for (const f of important) S.notified[f.code] = S.notified[f.code] && now - S.notified[f.code] < 3 * 86400000 ? S.notified[f.code] : now;
    save();
    log("check", { reason: reason || "timer", found: important.map((f) => f.code), all: findings.length, diagnosis: (res.diagnosis || []).map((x) => x.code) });
    const winShown = D.getWin() && D.getWin().isVisible() && D.getWin().isFocused();
    if ((fresh.length || fixed.length) && Notification.isSupported() && !winShown && S.mode !== "off") {
      const n = new Notification({
        title: fresh.length ? tx("found", { n: fresh.length }) : tx("fixed", { n: fixed.length }),
        body: tx("click"), icon: path.join(__dirname, "icon.png"), silent: !fresh.length
      });
      n.on("click", () => { D.showWin(); if (D.send) D.send("techfix:auto-open", { result: lastResult }); });
      n.show();
    }
    if (D.send) D.send("techfix:auto-result", { result: res, fixed });
    return { ok: true, found: important.length, fixed: fixed.length };
  } catch (e) {
    log("error", { detail: String((e && e.message) || e).slice(0, 200) });
    return { ok: false };
  } finally {
    running = false;
    if (D.send) D.send("techfix:auto-state", publicState());
  }
}

function schedule() {
  clearTimeout(timer); clearInterval(timer); timer = null;
  if (S.mode === "off") return;
  const every = Math.max(1, Math.min(24, Number(S.hours) || 6)) * 3600000;
  timer = setTimeout(function tick() { checkNow("timer"); timer = setTimeout(tick, every); }, 3 * 60000);
}

// ------------------------------------------------------------------------------------------
// Background (start with Windows, tray)
// ------------------------------------------------------------------------------------------
function applyBackground() {
  if (!WIN && process.platform !== "darwin") return;
  try { app.setLoginItemSettings({ openAtLogin: !!S.background, args: ["--tf-background"] }); } catch (_) {}
  if (S.background && !tray) {
    try {
      tray = new Tray(path.join(__dirname, "icon.png"));
      tray.setToolTip("TechFix");
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: tx("open"), click: () => D.showWin() },
        { label: tx("check"), click: () => checkNow("tray") },
        { type: "separator" },
        { label: tx("quit"), click: () => { module.exports.quitting = true; app.quit(); } }
      ]));
      tray.on("click", () => D.showWin());
    } catch (_) {}
  } else if (!S.background && tray) { tray.destroy(); tray = null; }
}
const startedHidden = () => process.argv.includes("--tf-background") || (() => {
  const f = path.join(app.getPath("userData"), "tf-start-hidden");
  try { const t = Number(fs.readFileSync(f, "utf8")); fs.unlinkSync(f); return Date.now() - t < 15 * 60000; } catch (_) { return false; }
})();
// Before an update installs while TechFix sits in the tray, remember to reopen hidden.
function markHiddenRestart() { try { fs.writeFileSync(path.join(app.getPath("userData"), "tf-start-hidden"), String(Date.now())); } catch (_) {} }

// ------------------------------------------------------------------------------------------
// Deep maintenance (scheduled task as SYSTEM, one admin approval to add or remove)
// ------------------------------------------------------------------------------------------
const MAINT_PS = String.raw`# TechFix Auto Maintenance — runs as SYSTEM. Fixed actions only; no input from user files.
$ErrorActionPreference = 'SilentlyContinue'; $ProgressPreference = 'SilentlyContinue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logf = Join-Path $dir 'log.json'
$done = @()
function FreeGB { [math]::Round((Get-PSDrive ($env:SystemDrive.TrimEnd(':'))).Free / 1GB, 1) }
$free0 = FreeGB
# 1) Virus definitions older than a day
try { $s = Get-MpComputerStatus; if ($s -and $s.AntivirusSignatureAge -ge 1) { Update-MpSignature -ErrorAction Stop; $done += 'defender-update' } } catch { }
# 2) Windows temp files older than 7 days
try { $cut = (Get-Date).AddDays(-7); Get-ChildItem -LiteralPath "$env:SystemRoot\Temp" -Force -Recurse -File | Where-Object { $_.LastWriteTime -lt $cut } | Remove-Item -Force; $done += 'windows-temp' } catch { }
# 3) Core services set to start automatically but stopped
$core = @('Dhcp','Dnscache','EventLog','Winmgmt','BFE','mpssvc','Audiosrv','CryptSvc','LanmanWorkstation','nsi','Schedule','ProfSvc','Power','Spooler')
$stopped = @(Get-CimInstance Win32_Service | Where-Object { $core -contains $_.Name -and $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' })
foreach ($sv in $stopped) { try { Start-Service -Name $sv.Name -ErrorAction Stop; $done += ('service:' + $sv.Name) } catch { } }
# 4) Component store cleanup, at most once a week, only when the system drive is getting full
$stamp = Join-Path $dir 'last-dism.txt'
$last = 0; try { $last = [int64](Get-Content -LiteralPath $stamp) } catch { }
$pct = ((Get-PSDrive ($env:SystemDrive.TrimEnd(':'))).Free / ((Get-PSDrive ($env:SystemDrive.TrimEnd(':'))).Used + (Get-PSDrive ($env:SystemDrive.TrimEnd(':'))).Free)) * 100
if ($pct -lt 15 -and ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - $last) -gt 7 * 86400) {
  dism.exe /Online /Cleanup-Image /StartComponentCleanup /Quiet | Out-Null; $done += 'component-cleanup'
  Set-Content -LiteralPath $stamp -Value ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
}
# 5) Page file turned off and none present: give Windows back control (applies at next restart)
try { $cs = Get-CimInstance Win32_ComputerSystem; if (-not $cs.AutomaticManagedPagefile -and @(Get-CimInstance Win32_PageFileUsage).Count -eq 0) { $cs | Set-CimInstance -Property @{ AutomaticManagedPagefile = $true }; $done += 'pagefile-auto' } } catch { }
# 6) Adware / unwanted apps: keep Defender's blocking on and quarantine what it already detected
try { $s = Get-MpComputerStatus; if ($s -and $s.AMRunningMode -eq 'Normal') {
  if ((Get-MpPreference).PUAProtection -eq 0) { Set-MpPreference -PUAProtection Enabled; $done += 'pua-on' }
  if (@(Get-MpThreat | Where-Object { $_.IsActive -and $_.ThreatName -match '^PUA:|Adware|BrowserModifier|SoftwareBundler' }).Count) { Remove-MpThreat; $done += 'pua-removed' } } } catch { }
$entry = @{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); done = $done; freedGB = [math]::Max(0, (FreeGB) - $free0) }
$old = @(); try { $old = @(Get-Content -Raw -LiteralPath $logf | ConvertFrom-Json) } catch { }
ConvertTo-Json -InputObject @(@($entry) + @($old | Select-Object -First 29)) -Depth 4 -Compress | Set-Content -LiteralPath $logf -Encoding UTF8
`;

async function elevated(script) {
  const tmp = path.join(os.tmpdir(), `tf-auto-${Date.now()}.ps1`);
  fs.writeFileSync(tmp, "\uFEFF" + script, "utf8");
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const r = await ps(`try { $p = Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',${q('"' + tmp + '"')}; 'exit:' + $p.ExitCode } catch { 'cancelled' }`, 120000);
  try { fs.unlinkSync(tmp); } catch (_) {}
  return /cancelled/.test(r.out) ? "cancelled" : "ok";
}

async function installMaintenance() {
  if (!WIN) return "unsupported";
  const scriptB64 = Buffer.from(MAINT_PS, "utf8").toString("base64");
  const r = await elevated(String.raw`$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:ProgramData 'TechFix\auto'
# Start from a fresh folder owned by Administrators, so nothing planted beforehand can be reused.
if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
icacls $dir /setowner '*S-1-5-32-544' | Out-Null
# Only SYSTEM and Administrators may change this folder; users can read the log.
icacls $dir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
$f = Join-Path $dir 'maintenance.ps1'
[IO.File]::WriteAllText($f, [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${scriptB64}')), (New-Object Text.UTF8Encoding $true))
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $f + '"')
$t1 = New-ScheduledTaskTrigger -Daily -At '3:17am'
$t2 = New-ScheduledTaskTrigger -AtLogOn; $t2.Delay = 'PT15M'
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName '${TASK}' -Action $a -Trigger $t1, $t2 -Settings $s -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName '${TASK}'`);
  return r;
}
async function removeMaintenance() {
  if (!WIN) return "unsupported";
  return elevated(String.raw`Unregister-ScheduledTask -TaskName '${TASK}' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:ProgramData 'TechFix\auto') -Recurse -Force -ErrorAction SilentlyContinue`);
}
function maintenanceLog() {
  try { const v = JSON.parse(fs.readFileSync(path.join(MAINT_DIR, "log.json"), "utf8").replace(/^\uFEFF/, "")); return Array.isArray(v) ? v : [v]; } catch (_) { return []; }
}
async function maintenanceInstalled() {
  if (!WIN) return false;
  const r = await ps(`if (Get-ScheduledTask -TaskName '${TASK}' -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`, 30000);
  return /yes/.test(r.out);
}

// ------------------------------------------------------------------------------------------
function publicState() {
  return { mode: S.mode, background: S.background, hours: S.hours, running, history: S.history.slice(0, 15), maintenance: maintenanceLog().slice(0, 10), platform: process.platform };
}

async function setSettings(p) {
  p = p || {};
  if (typeof p.lang === "string" && TXT[p.lang]) S.lang = p.lang;
  if (p.hours != null) S.hours = Math.max(1, Math.min(24, Number(p.hours) || 6));
  if (typeof p.background === "boolean") { S.background = p.background; applyBackground(); }
  if (typeof p.mode === "string" && ["off", "notify", "auto", "maintain"].includes(p.mode) && p.mode !== S.mode) {
    const wasMaint = S.mode === "maintain";
    if (p.mode === "maintain") {
      const r = await installMaintenance();
      if (r !== "ok") { save(); return Object.assign(publicState(), { error: r }); }
      log("maintenance-on", {});
    } else if (wasMaint) {
      const r = await removeMaintenance();
      if (r !== "ok") { save(); return Object.assign(publicState(), { error: r }); }
      log("maintenance-off", {});
    }
    S.mode = p.mode;
    schedule();
  }
  save();
  return publicState();
}

function init(deps) {
  D = deps;
  load();
  applyBackground();
  schedule();
  // Keep the setting honest if the task was removed outside TechFix.
  if (S.mode === "maintain") maintenanceInstalled().then((ok) => { if (!ok) { S.mode = "auto"; save(); } });
}

module.exports = {
  init, checkNow, setSettings, publicState: () => publicState(), lastResult: () => lastResult,
  startedHidden, markHiddenRestart, keepInTray: () => !!(S && S.background), quitting: false
};

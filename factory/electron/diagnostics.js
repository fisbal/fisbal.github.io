// TechFix native diagnostics — real OS state, not a browser sandbox.
//
// Loaded by main.js ONLY when the running app's mb-config.json has
// `diagnostics: true` (set from apps.json's `electron.diagnostics` for this
// one app id, wired in build.py). Every other MartinB app on this shared
// Electron shell never requires this file and is byte-for-byte unaffected.
//
// Windows only for now (process.platform !== "win32" short-circuits every
// export to a clear "not supported on this OS" result instead of guessing).
//
// Fix policy (Martin's choice, 2026-09-14, carried over from the standalone
// PowerShell script): a short curated list with no real downside runs the
// moment the renderer asks for it, no extra confirmation here — the
// renderer (techfix's app.js) is what shows the user the exact command and
// asks first for anything riskier. This module just executes what it's told
// to, after that UI-level confirmation already happened.

const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const os = require("os");
const path = require("path");

const execFileP = promisify(execFile);
const WIN = process.platform === "win32";

function runPS1(scriptText, timeoutMs = 25000) {
  return new Promise((resolve) => {
    if (!WIN) { resolve({ ok: false, out: "", err: "not Windows" }); return; }
    const file = path.join(os.tmpdir(), "techfix-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".ps1");
    fs.writeFile(file, scriptText, "utf8", (werr) => {
      if (werr) { resolve({ ok: false, out: "", err: String(werr.message || werr) }); return; }
      execFileP("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], {
        timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true
      }).then(
        ({ stdout }) => { fs.unlink(file, () => {}); resolve({ ok: true, out: stdout || "", err: "" }); },
        (err) => { fs.unlink(file, () => {}); resolve({ ok: false, out: err.stdout || "", err: String(err.message || err) }); }
      );
    });
  });
}

// One PowerShell round-trip for the whole scan — far cheaper than one per check.
const SCAN_PS = `
$ErrorActionPreference = 'SilentlyContinue'
$r = @{}
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$r.os = @{ caption = $os.Caption; build = $os.BuildNumber; manufacturer = $cs.Manufacturer; model = $cs.Model }
$r.uptimeMinutes = [int]((Get-Date) - $os.LastBootUpTime).TotalMinutes
$r.admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$r.memory = @{ totalKB = $os.TotalVisibleMemorySize; freeKB = $os.FreePhysicalMemory }
$r.disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { @{ id = $_.DeviceID; sizeBytes = $_.Size; freeBytes = $_.FreeSpace } })
$r.problemDevices = @(Get-CimInstance Win32_PNPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 } | ForEach-Object { @{ name = $_.Name; code = $_.ConfigManagerErrorCode } })
try {
  $since = (Get-Date).AddDays(-3)
  $r.recentEvents = @(Get-WinEvent -FilterHashtable @{ LogName='System'; Level=1,2; StartTime=$since } -MaxEvents 20 -ErrorAction Stop | ForEach-Object { @{ id = $_.Id; provider = $_.ProviderName } })
} catch { $r.recentEvents = @() }
$pending = $false
if (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending") { $pending = $true }
if (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired") { $pending = $true }
$r.pendingReboot = $pending
try { $r.startupCount = (Get-CimInstance Win32_StartupCommand | Measure-Object).Count } catch { $r.startupCount = $null }
try { $r.netOnline = Test-Connection -ComputerName "1.1.1.1" -Count 1 -Quiet -ErrorAction Stop } catch { $r.netOnline = $false }
try { $null = Resolve-DnsName "example.com" -ErrorAction Stop; $r.dnsOk = $true } catch { $r.dnsOk = $false }
try {
  $wifi = (netsh wlan show interfaces) 2>$null
  if ($wifi -match "Signal\\s*:\\s*(\\d+)%") { $r.wifiSignal = [int]$Matches[1] } else { $r.wifiSignal = $null }
} catch { $r.wifiSignal = $null }
try {
  $printers = Get-CimInstance Win32_Printer
  $r.offlinePrinters = @($printers | Where-Object { $_.WorkOffline -eq $true -or $_.PrinterStatus -eq 7 } | ForEach-Object { $_.Name })
} catch { $r.offlinePrinters = @() }
try {
  $pd = Get-PhysicalDisk
  $r.diskHealth = @($pd | ForEach-Object { @{ name = $_.FriendlyName; status = $_.HealthStatus } })
} catch { $r.diskHealth = @() }
$r | ConvertTo-Json -Depth 5 -Compress
`;

function buildFindings(d) {
  const findings = [];
  const add = (kbId, severity, detail, safeFixId, riskyFixId) =>
    findings.push({ kbId, severity, detail, safeFixId: safeFixId || null, riskyFixId: riskyFixId || null });

  for (const disk of d.disks || []) {
    if (!disk.sizeBytes) continue;
    const freePct = (disk.freeBytes / disk.sizeBytes) * 100;
    if (freePct < 10) add("gen-sto-03", "high", `${disk.id} has only ${freePct.toFixed(1)}% free space`, "clear-temp", null);
    else if (freePct < 20) add("gen-sto-03", "medium", `${disk.id} has ${freePct.toFixed(1)}% free space`, "clear-temp", null);
  }
  for (const pd of d.diskHealth || []) {
    if (pd.status && pd.status !== "Healthy") add(null, "critical", `Physical disk '${pd.name}' health status: ${pd.status} — back up data now`, null, null);
  }
  if (d.memory && d.memory.totalKB) {
    const usedPct = (1 - d.memory.freeKB / d.memory.totalKB) * 100;
    if (usedPct >= 90) add("win-11-04", "high", `System memory is ${usedPct.toFixed(0)}% in use right now`, null, null);
  }
  if ((d.problemDevices || []).length) {
    add("win-7-03", "high", `${d.problemDevices.length} device(s) reporting a driver error in Device Manager`, null, null);
  }
  const bsodEvents = (d.recentEvents || []).filter((e) => [41, 1001, 6008].includes(e.id));
  if (bsodEvents.length) add("win-7-03", "high", `${bsodEvents.length} unexpected-shutdown/kernel-power event(s) in the last 3 days`, null, null);
  if (d.pendingReboot) add("win-10-01", "low", "A Windows reboot is pending", null, null);
  if (typeof d.startupCount === "number" && d.startupCount > 15) add("win-11-04", "low", `${d.startupCount} startup programs configured`, null, null);
  if (d.netOnline === false) add("gen-net-01", "high", "No route to the internet (1.1.1.1 unreachable)", null, null);
  else if (d.dnsOk === false) add("win-10-04", "medium", "DNS resolution is failing even though the network route is up", "flush-dns", "winsock-reset");
  if (typeof d.wifiSignal === "number" && d.wifiSignal < 40) add("gen-net-01", "low", `Wi-Fi signal strength is weak (${d.wifiSignal}%)`, null, null);
  if ((d.offlinePrinters || []).length) add("gen-hw-03", "low", `${d.offlinePrinters.length} printer(s) showing offline`, "restart-spooler", null);

  return findings;
}

async function scan() {
  if (!WIN) return { supported: false, platform: process.platform, message: "Native diagnostics are implemented for Windows only right now." };
  const { ok, out, err } = await runPS1(SCAN_PS);
  if (!ok) return { supported: true, platform: "win32", error: err || "PowerShell scan failed" };
  let data;
  try { data = JSON.parse(out); } catch (e) { return { supported: true, platform: "win32", error: "Could not parse scan output" }; }
  return {
    supported: true,
    platform: "win32",
    system: data.os,
    uptimeMinutes: data.uptimeMinutes,
    admin: !!data.admin,
    memory: data.memory,
    disks: data.disks,
    findings: buildFindings(data),
    scannedAt: new Date().toISOString()
  };
}

// --- Fixes --------------------------------------------------------------
// "Safe" = runs the instant the renderer asks, no further gate here.
// "Risky" = the renderer must already have shown the user this exact
// command and gotten a yes; this module trusts that and just executes it.

const ELEVATE_ONE = (cmd) =>
  `Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-Command','${cmd.replace(/'/g, "''")}' -Wait`;

const SAFE_FIXES = {
  "flush-dns": { label: "Flush DNS resolver cache", ps: `Clear-DnsClientCache; ipconfig /flushdns | Out-Null; "done"` },
  "restart-explorer": {
    label: "Restart Windows Explorer",
    ps: `Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 800; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }; "done"`
  },
  "clear-temp": {
    label: "Clear this user's temp files",
    ps: `Get-ChildItem $env:TEMP -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; "done"`
  },
  "restart-spooler": { label: "Restart the Print Spooler service", ps: ELEVATE_ONE("Restart-Service Spooler -Force") },
  "restart-wuauserv": { label: "Restart the Windows Update service", ps: ELEVATE_ONE("Restart-Service wuauserv -Force") }
};

const RISKY_FIXES = {
  "sfc-scan": { label: "Run System File Checker (sfc /scannow)", cmd: "sfc /scannow", ps: ELEVATE_ONE("sfc /scannow") },
  "winsock-reset": { label: "Reset Winsock + TCP/IP (needs a reboot to finish)", cmd: "netsh winsock reset ; netsh int ip reset", ps: ELEVATE_ONE("netsh winsock reset; netsh int ip reset") },
  "release-renew-ip": { label: "Release and renew the IP address", cmd: "ipconfig /release ; ipconfig /renew", ps: ELEVATE_ONE("ipconfig /release; ipconfig /renew") },
  "empty-recycle-bin": { label: "Empty the Recycle Bin", cmd: "Clear-RecycleBin -Force", ps: `Clear-RecycleBin -Force -ErrorAction SilentlyContinue; "done"` }
};

function listFixes() {
  const safe = Object.entries(SAFE_FIXES).map(([id, f]) => ({ id, label: f.label, tier: "safe" }));
  const risky = Object.entries(RISKY_FIXES).map(([id, f]) => ({ id, label: f.label, cmd: f.cmd, tier: "risky" }));
  return [...safe, ...risky];
}

async function fix(id) {
  if (!WIN) return { ok: false, message: "Native fixes are implemented for Windows only right now." };
  const entry = SAFE_FIXES[id] || RISKY_FIXES[id];
  if (!entry) return { ok: false, message: "Unknown fix id: " + id };
  const { ok, out, err } = await runPS1(entry.ps);
  if (!ok) return { ok: false, message: err || "The fix command failed" };
  return { ok: true, message: entry.label, raw: out.trim() };
}

module.exports = { scan, fix, listFixes, WIN };

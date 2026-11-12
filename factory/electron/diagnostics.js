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
// Three kinds of reading, each one PowerShell round-trip:
//   scan()      deep system health: disks (S.M.A.R.T.-style reliability counters), crashes,
//               hardware errors (WHEA), drivers, services, updates, battery wear, heat, memory…
//   security()  a security audit around the Microsoft Defender engine plus the checks most
//               antivirus apps don't do: hosts file, proxy hijack, startup/scheduled-task
//               persistence, firewall, UAC, SmartScreen, RDP/SMBv1 exposure, BitLocker, Secure
//               Boot, credential-theft settings, pending security updates.
//   Both also return a "forecast": the problems most likely to come NEXT, from trends and
//   early-warning signs, with what prevents each one.
//
// Findings carry a stable `code` + `params` so the page shows them in the user's language
// (5 languages); `detail` stays as an English fallback.
//
// Fix policy (Martin's choice, 2026-09-14): a short curated list with no real downside runs
// the moment the renderer asks ("safe"); anything riskier ("risky") is only run after the
// renderer has shown the exact command and the user said yes. This module executes what it's
// told to, after that UI-level confirmation already happened — and only ids from the fixed
// tables below, never a command string from the page.

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIN = process.platform === "win32";

function runPS1(scriptText, timeoutMs = 60000) {
  return new Promise((resolve) => {
    if (!WIN) { resolve({ ok: false, out: "", err: "not Windows" }); return; }
    const file = path.join(os.tmpdir(), "techfix-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".ps1");
    // UTF-8 with BOM so Windows PowerShell 5.1 reads non-ASCII text correctly.
    fs.writeFile(file, "﻿" + scriptText, "utf8", (werr) => {
      if (werr) { resolve({ ok: false, out: "", err: String(werr.message || werr) }); return; }
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], {
        timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true
      }, (err, stdout) => {
        fs.unlink(file, () => {});
        if (err) resolve({ ok: false, out: stdout || "", err: String(err.message || err) });
        else resolve({ ok: true, out: stdout || "", err: "" });
      });
    });
  });
}

function parseJsonTail(out) {
  // The scripts print exactly one JSON document as their last output.
  const s = String(out || "").trim();
  const i = s.indexOf("{");
  if (i < 0) return null;
  try { return JSON.parse(s.slice(i)); } catch (e) { return null; }
}

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

// ---------------------------------------------------------------------------------------------
// 1) Deep system scan
// ---------------------------------------------------------------------------------------------
const SCAN_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
function CountEv($log, $prov, $ids, $days) {
  try { return @(Get-WinEvent -FilterHashtable @{ LogName = $log; ProviderName = $prov; Id = $ids; StartTime = (Get-Date).AddDays(-$days) } -MaxEvents 500 -ErrorAction Stop).Count } catch { return 0 }
}
$r = @{}
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$r.os = @{ caption = $os.Caption; build = $os.BuildNumber; manufacturer = $cs.Manufacturer; model = $cs.Model }
$r.uptimeMinutes = [int]((Get-Date) - $os.LastBootUpTime).TotalMinutes
$r.admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$r.memory = @{ totalKB = $os.TotalVisibleMemorySize; freeKB = $os.FreePhysicalMemory }
$r.disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { @{ id = $_.DeviceID; sizeBytes = $_.Size; freeBytes = $_.FreeSpace } })
$r.systemDrive = $env:SystemDrive
$r.problemDevices = @(Get-CimInstance Win32_PNPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.ConfigManagerErrorCode -ne 22 } | Select-Object -First 10 | ForEach-Object { @{ name = $_.Name; code = $_.ConfigManagerErrorCode } })

# Physical disks + reliability counters (wear, temperature, uncorrected errors). Counters need admin.
$r.diskHealth = @(Get-PhysicalDisk | ForEach-Object {
  $c = $null
  try { $c = $_ | Get-StorageReliabilityCounter -ErrorAction Stop } catch { }
  @{ name = $_.FriendlyName; status = [string]$_.HealthStatus; media = [string]$_.MediaType; bus = [string]$_.BusType;
     wear = $c.Wear; temp = $c.Temperature; tempMax = $c.TemperatureMax; readErr = $c.ReadErrorsUncorrected; writeErr = $c.WriteErrorsUncorrected; hours = $c.PowerOnHours }
})

# Event-log evidence (counts only)
$r.ev = @{
  diskErr    = (CountEv 'System' @('disk') @(7, 11, 51, 153) 14)
  ntfsErr    = (CountEv 'System' @('Ntfs', 'Microsoft-Windows-Ntfs') @(55, 130, 137) 14)
  storReset  = (CountEv 'System' @('storahci', 'stornvme', 'iaStorA', 'iaStorAC', 'iaStorAVC') @(129) 14)
  whea       = (CountEv 'System' @('Microsoft-Windows-WHEA-Logger') @(1, 17, 18, 19, 20, 46, 47) 30)
  kernelPower = (CountEv 'System' @('Microsoft-Windows-Kernel-Power') @(41) 30)
  bugcheck   = (CountEv 'System' @('Microsoft-Windows-WER-SystemErrorReporting', 'BugCheck') @(1001) 30)
  unexpected = (CountEv 'System' @('EventLog') @(6008) 30)
  wuFail     = (CountEv 'System' @('Microsoft-Windows-WindowsUpdateClient') @(20) 30)
  tdr        = (CountEv 'System' @('Display') @(4101) 30)
}
try {
  $crash = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -ErrorAction Stop)
  $r.appCrashes = @($crash | ForEach-Object { [string]$_.Properties[0].Value } | Group-Object | Sort-Object Count -Descending | Select-Object -First 3 | ForEach-Object { @{ app = $_.Name; count = $_.Count } })
} catch { $r.appCrashes = @() }
try { $md = @(Get-ChildItem "$env:SystemRoot\Minidump" -Filter *.dmp -ErrorAction Stop); $r.minidumps = $md.Count } catch { $r.minidumps = $null }

# Stability index (Reliability Monitor), 1-10
try { $rel = Get-CimInstance Win32_ReliabilityStabilityMetrics -ErrorAction Stop | Sort-Object TimeGenerated -Descending | Select-Object -First 1; if ($rel) { $r.stability = [math]::Round([double]$rel.SystemStabilityIndex, 1) } } catch { }

$pending = $false
if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") { $pending = $true }
if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") { $pending = $true }
$r.pendingReboot = $pending
try { $r.startupCount = (Get-CimInstance Win32_StartupCommand | Measure-Object).Count } catch { $r.startupCount = $null }
try { $r.netOnline = Test-Connection -ComputerName "1.1.1.1" -Count 1 -Quiet -ErrorAction Stop } catch { $r.netOnline = $false }
try { $null = Resolve-DnsName "example.com" -ErrorAction Stop; $r.dnsOk = $true } catch { $r.dnsOk = $false }
try {
  $wifi = (netsh wlan show interfaces) 2>$null
  if ($wifi -match "(?:Signal|Signal)\s*:\s*(\d+)\s*%") { $r.wifiSignal = [int]$Matches[1] } else { $r.wifiSignal = $null }
} catch { $r.wifiSignal = $null }
try {
  $printers = Get-CimInstance Win32_Printer
  $r.offlinePrinters = @($printers | Where-Object { $_.WorkOffline -eq $true -or $_.PrinterStatus -eq 7 } | ForEach-Object { $_.Name })
} catch { $r.offlinePrinters = @() }

# CPU load (3 quick samples), heat, page file, top memory users
try { $r.cpuLoad = [int]((1..3 | ForEach-Object { (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average; Start-Sleep -Milliseconds 400 }) | Measure-Object -Average).Average } catch { }
try {
  $tz = @(Get-CimInstance -Namespace root\wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | ForEach-Object { [math]::Round($_.CurrentTemperature / 10 - 273.15, 0) } | Where-Object { $_ -gt 20 -and $_ -lt 125 })
  if ($tz.Count) { $r.tempC = ($tz | Measure-Object -Maximum).Maximum }
} catch { }
try { $r.pagefile = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object { @{ current = $_.CurrentUsage; allocated = $_.AllocatedBaseSize; peak = $_.PeakUsage } }) } catch { $r.pagefile = @() }
try { $r.topMem = @(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 | ForEach-Object { @{ name = $_.ProcessName; mb = [int]($_.WorkingSet64 / 1MB) } }) } catch { $r.topMem = @() }

# Battery wear (design vs. full-charge capacity)
try {
  $b = Get-CimInstance Win32_Battery | Select-Object -First 1
  if ($b) {
    $bat = @{ charge = $b.EstimatedChargeRemaining; status = $b.BatteryStatus }
    try { $bat.full = (Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity -ErrorAction Stop | Select-Object -First 1).FullChargedCapacity } catch { }
    try { $bat.design = (Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData -ErrorAction Stop | Select-Object -First 1).DesignedCapacity } catch { }
    try { $bat.cycles = (Get-CimInstance -Namespace root\wmi -ClassName BatteryCycleCount -ErrorAction Stop | Select-Object -First 1).CycleCount } catch { }
    $r.battery = $bat
  }
} catch { }

# Core services that should be running
$core = @('Dhcp', 'Dnscache', 'EventLog', 'Winmgmt', 'BFE', 'mpssvc', 'Audiosrv', 'CryptSvc', 'LanmanWorkstation', 'nsi', 'Schedule', 'ProfSvc', 'Power')
$r.stoppedServices = @(Get-CimInstance Win32_Service | Where-Object { $core -contains $_.Name -and $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' } | ForEach-Object { $_.Name })

# Updates, drivers, activation
try {
  $last = (New-Object -ComObject Microsoft.Update.AutoUpdate).Results.LastInstallationSuccessDate
  if ($last -and $last.Year -gt 2000) { $r.daysSinceUpdate = [int]((Get-Date) - $last).TotalDays }
} catch { }
if ($r.daysSinceUpdate -eq $null) {
  try { $hf = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1; if ($hf) { $r.daysSinceUpdate = [int]((Get-Date) - $hf.InstalledOn).TotalDays } } catch { }
}
try { $r.gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = $_.Name; ageDays = $(if ($_.DriverDate) { [int]((Get-Date) - $_.DriverDate).TotalDays } else { $null }) } }) } catch { $r.gpus = @() }
try {
  $lic = Get-CimInstance SoftwareLicensingProduct -Filter "PartialProductKey IS NOT NULL AND ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f'" -ErrorAction Stop | Select-Object -First 1
  if ($lic) { $r.licenseStatus = [int]$lic.LicenseStatus }
} catch { }

$r | ConvertTo-Json -Depth 6 -Compress
`;

function buildSystemFindings(d) {
  const findings = [];
  const add = (code, severity, params, kbId, safeFixId, riskyFixId, detail) =>
    findings.push({ code, severity, params: params || {}, kbId: kbId || null, safeFixId: safeFixId || null, riskyFixId: riskyFixId || null, detail: detail || code });

  const sysDrive = (d.systemDrive || "C:").toUpperCase();
  for (const disk of arr(d.disks)) {
    if (!disk.sizeBytes) continue;
    const freePct = (disk.freeBytes / disk.sizeBytes) * 100;
    const onSys = String(disk.id || "").toUpperCase() === sysDrive;
    const p = { drive: disk.id, pct: +freePct.toFixed(1) };
    if (freePct < 10) add("disk_low", "high", p, "gen-sto-03", onSys ? ["space-report", "clear-windows-temp"] : "open-storage", onSys ? ["free-update-space", "empty-recycle-bin", "component-cleanup", "clear-dev-caches"] : null, `${disk.id} has only ${freePct.toFixed(1)}% free space`);
    else if (freePct < 20) add("disk_low", "medium", p, "gen-sto-03", onSys ? "clear-temp" : "open-storage", null, `${disk.id} has ${freePct.toFixed(1)}% free space`);
  }
  for (const pd of arr(d.diskHealth)) {
    if (pd.status && pd.status !== "Healthy") add("disk_health", "critical", { name: pd.name, status: pd.status }, "gen-sto-01", null, null, `Physical disk '${pd.name}' health status: ${pd.status} — back up data now`);
    const wear = num(pd.wear);
    if (wear != null && wear >= 70) add("disk_wear", wear >= 90 ? "high" : "medium", { name: pd.name, wear }, "gen-sto-06", null, null, `SSD '${pd.name}' has used ${wear}% of its rated write endurance`);
    const temp = num(pd.temp);
    if (temp != null && temp >= 60) add("disk_hot", temp >= 70 ? "high" : "medium", { name: pd.name, temp }, "gen-sto-06", null, null, `Drive '${pd.name}' is running at ${temp} °C`);
    const errs = (num(pd.readErr) || 0) + (num(pd.writeErr) || 0);
    if (errs > 0) add("disk_uncorrected", "critical", { name: pd.name, count: errs }, "gen-sto-01", null, null, `Drive '${pd.name}' reports ${errs} uncorrectable read/write error(s)`);
  }
  const ev = d.ev || {};
  const diskEv = (ev.diskErr || 0) + (ev.ntfsErr || 0) + (ev.storReset || 0);
  if (diskEv > 0) add("disk_events", diskEv >= 5 ? "high" : "medium", { count: diskEv }, "gen-sto-01", null, "chkdsk-scan", `${diskEv} disk / file-system error event(s) in the last 14 days`);

  if (d.memory && d.memory.totalKB) {
    const usedPct = (1 - d.memory.freeKB / d.memory.totalKB) * 100;
    if (usedPct >= 90) add("mem_high", "high", { pct: Math.round(usedPct) }, "win-11-04", null, null, `System memory is ${usedPct.toFixed(0)}% in use right now`);
    else if (usedPct >= 80) add("mem_high", "low", { pct: Math.round(usedPct) }, "win-11-04", null, null, `System memory is ${usedPct.toFixed(0)}% in use right now`);
  }
  for (const pf of arr(d.pagefile)) {
    if (pf.allocated > 0 && pf.current / pf.allocated >= 0.8) add("pagefile_high", "medium", { pct: Math.round((pf.current / pf.allocated) * 100) }, "win-11-04", null, null, "The page file is almost full");
  }
  if (num(d.cpuLoad) != null && d.cpuLoad >= 85) add("cpu_high", "medium", { pct: d.cpuLoad }, "win-10-05", null, null, `CPU is ${d.cpuLoad}% busy while TechFix measured it`);
  if (num(d.tempC) != null && d.tempC >= 85) add("cpu_hot", d.tempC >= 95 ? "critical" : "high", { temp: d.tempC }, "gen-pow-01", null, null, `System thermal zone at ${d.tempC} °C`);

  const devs = arr(d.problemDevices);
  if (devs.length) add("driver_errors", "high", { count: devs.length, names: devs.slice(0, 3).map((x) => x.name).join(", ") }, "win-vista-04", null, "rescan-devices", `${devs.length} device(s) reporting a driver error in Device Manager`);
  if ((ev.bugcheck || 0) > 0) add("bsod", (ev.bugcheck >= 2 ? "high" : "medium"), { count: ev.bugcheck }, "win-7-03", null, "sfc-scan", `${ev.bugcheck} blue-screen crash(es) in the last 30 days`);
  if ((ev.kernelPower || 0) > 0) add("kernel_power", ev.kernelPower >= 2 ? "high" : "medium", { count: ev.kernelPower }, "gen-pow-04", null, null, `${ev.kernelPower} unexpected power loss / hard reset(s) in the last 30 days`);
  if ((ev.whea || 0) > 0) add("whea", "high", { count: ev.whea }, "gen-pow-04", null, null, `${ev.whea} hardware error report(s) (WHEA) in the last 30 days`);
  if ((ev.tdr || 0) >= 2) add("gpu_tdr", "medium", { count: ev.tdr }, "win-10-11", "open-windows-update", null, `${ev.tdr} display-driver reset(s) in the last 30 days`);
  for (const c of arr(d.appCrashes)) {
    if (c.count >= 3) add("app_crash", "medium", { app: c.app, count: c.count }, null, null, null, `${c.app} crashed ${c.count} times in 7 days`);
  }
  if (num(d.stability) != null && d.stability < 5) add("stability_low", "medium", { index: d.stability }, "win-10-03", null, "dism-restore", `Windows stability index is ${d.stability}/10`);

  const stopped = arr(d.stoppedServices);
  if (stopped.length) add("services_stopped", "high", { names: stopped.join(", ") }, null, "start-core-services", null, `Core Windows service(s) not running: ${stopped.join(", ")}`);

  if (d.pendingReboot) add("pending_reboot", "low", {}, "win-10-01", null, null, "A Windows reboot is pending");
  const upDays = Math.floor((d.uptimeMinutes || 0) / 1440);
  if (upDays >= 14) add("uptime_long", "low", { days: upDays }, "win-11-04", null, null, `The PC hasn't restarted in ${upDays} days`);
  if (typeof d.startupCount === "number" && d.startupCount > 15) add("startup_many", "low", { count: d.startupCount }, "win-11-04", "open-startup-apps", null, `${d.startupCount} startup programs configured`);

  if (d.netOnline === false) add("no_internet", "high", {}, "gen-net-01", "flush-dns", "release-renew-ip", "No route to the internet (1.1.1.1 unreachable)");
  else if (d.dnsOk === false) add("dns_fail", "medium", {}, "win-10-04", "flush-dns", "winsock-reset", "DNS resolution is failing even though the network route is up");
  if (typeof d.wifiSignal === "number" && d.wifiSignal < 40) add("wifi_weak", "low", { pct: d.wifiSignal }, "gen-net-05", null, null, `Wi-Fi signal strength is weak (${d.wifiSignal}%)`);
  if (arr(d.offlinePrinters).length) add("printer_offline", "low", { count: arr(d.offlinePrinters).length }, "gen-hw-03", "restart-spooler", null, `${arr(d.offlinePrinters).length} printer(s) showing offline`);

  const sysDisk = arr(d.disks).find((x) => String(x.id || "").toUpperCase() === sysDrive);
  const sysFull = !!(sysDisk && sysDisk.sizeBytes && sysDisk.freeBytes / sysDisk.sizeBytes < 0.1);
  // Updates can't install on a full system drive — free space first, a reset alone won't help.
  if ((ev.wuFail || 0) >= 2) add("wu_failures", "medium", { count: ev.wuFail }, "win-7-01", sysFull ? "clear-windows-temp" : "restart-wuauserv", sysFull ? ["free-update-space", "reset-windows-update"] : "reset-windows-update", `${ev.wuFail} failed Windows Update installs in 30 days`);
  if (num(d.daysSinceUpdate) != null && d.daysSinceUpdate > 45) add("update_stale", d.daysSinceUpdate > 90 ? "high" : "medium", { days: d.daysSinceUpdate }, "win-10-12", "open-windows-update", null, `No update installed for ${d.daysSinceUpdate} days`);
  for (const g of arr(d.gpus)) {
    if (num(g.ageDays) != null && g.ageDays > 730 && !/basic display|remote|virtual|hyper-v/i.test(g.name || "")) add("gpu_driver_old", "low", { name: g.name, years: Math.floor(g.ageDays / 365) }, "win-10-11", "open-windows-update", null, `Graphics driver for ${g.name} is ${Math.floor(g.ageDays / 365)} years old`);
  }
  if (num(d.licenseStatus) != null && d.licenseStatus !== 1) add("not_activated", "medium", {}, "win-7-04", "open-activation", null, "Windows is not activated");

  const b = d.battery;
  if (b && num(b.full) && num(b.design) && b.design > 0) {
    const health = Math.round((b.full / b.design) * 100);
    if (health <= 60) add("battery_worn", health <= 40 ? "high" : "medium", { health }, "gen-pow-03", null, null, `Battery holds only ${health}% of its original capacity`);
  }
  return findings;
}

// What's REALLY going on: links findings to a root cause and an ordered plan — the reasoning a
// technician (or an AI) would do, built in, so nobody needs outside help to know where to start.
// Each item: { code, level, params, explains:[finding codes it accounts for], plan:[fix ids in order], after }
function buildSystemDiagnosis(d, findings) {
  const out = [];
  const has = (c) => findings.some((f) => f.code === c);
  const codes = (list) => list.filter(has);
  const ev = d.ev || {};
  const sysDrive = (d.systemDrive || "C:").toUpperCase();
  const sys = arr(d.disks).find((x) => String(x.id || "").toUpperCase() === sysDrive);
  const sysFreePct = sys && sys.sizeBytes ? (sys.freeBytes / sys.sizeBytes) * 100 : null;
  const sysFreeGB = sys ? Math.round(sys.freeBytes / 1073741824) : null;

  if (has("disk_health") || has("disk_uncorrected")) {
    out.push({ code: "dx_disk_failing", level: "critical", params: {}, explains: codes(["disk_health", "disk_uncorrected", "disk_events", "bsod", "app_crash", "stability_low"]), plan: [], after: "dx_after_backup" });
  }
  if (sysFreePct != null && sysFreePct < 10) {
    out.push({ code: "dx_disk_full", level: sysFreePct < 5 ? "critical" : "high",
      params: { drive: sysDrive, pct: +sysFreePct.toFixed(1), free: sysFreeGB, need: Math.max(1, 20 - sysFreeGB) },
      explains: codes(["wu_failures", "update_stale", "pagefile_high", "mem_high", "stability_low", "cpu_high"]),
      plan: ["space-report", "clear-windows-temp", "free-update-space", "clear-old-installers", "empty-recycle-bin", "component-cleanup"],
      after: "dx_after_space" });
  } else if (has("wu_failures") || has("update_stale")) {
    out.push({ code: "dx_updates_broken", level: "medium", params: { count: ev.wuFail || 0 }, explains: codes(["wu_failures", "update_stale"]),
      plan: ["restart-wuauserv", "reset-windows-update", "dism-restore", "sfc-scan"], after: "dx_after_updates" });
  }
  if ((ev.whea || 0) > 0) {
    out.push({ code: "dx_hardware", level: "high", params: { count: ev.whea }, explains: codes(["whea", "bsod", "kernel_power", "cpu_hot"]), plan: ["open-memory-test"], after: "dx_after_hardware" });
  } else if (has("bsod") || has("stability_low")) {
    out.push({ code: "dx_system_files", level: "medium", params: {}, explains: codes(["bsod", "stability_low", "app_crash", "driver_errors"]), plan: ["dism-restore", "sfc-scan", "rescan-devices"], after: "dx_after_restart" });
  }
  if (has("kernel_power") && !(ev.whea > 0)) {
    out.push({ code: "dx_power", level: "medium", params: { count: ev.kernelPower }, explains: codes(["kernel_power", "cpu_hot", "battery_worn"]), plan: [], after: "dx_after_power" });
  }
  if (has("driver_errors") && !out.some((x) => x.code === "dx_system_files")) {
    out.push({ code: "dx_drivers", level: "medium", params: {}, explains: codes(["driver_errors", "gpu_tdr", "gpu_driver_old"]), plan: ["rescan-devices", "open-windows-update"], after: "dx_after_drivers" });
  }
  if (has("no_internet") || has("dns_fail")) {
    out.push({ code: "dx_network", level: "high", params: {}, explains: codes(["no_internet", "dns_fail", "wifi_weak"]), plan: ["flush-dns", "release-renew-ip", "winsock-reset"], after: "dx_after_network" });
  }
  if ((has("mem_high") || has("pagefile_high")) && !(sysFreePct != null && sysFreePct < 10)) {
    const top = arr(d.topMem).slice(0, 3).map((x) => `${x.name} (${x.mb} MB)`).join(", ");
    out.push({ code: "dx_memory", level: "medium", params: { top }, explains: codes(["mem_high", "pagefile_high", "startup_many", "cpu_high"]), plan: ["open-startup-apps"], after: "dx_after_memory" });
  }
  return out;
}

// What's likely to go wrong NEXT, from early-warning signs (not a certainty — a ranked heads-up).
function buildSystemForecast(d) {
  const out = [];
  const add = (code, level, params, kbId, preventFixId) => out.push({ code, level, params: params || {}, kbId: kbId || null, preventFixId: preventFixId || null });
  const ev = d.ev || {};
  for (const pd of arr(d.diskHealth)) {
    const errs = (num(pd.readErr) || 0) + (num(pd.writeErr) || 0);
    const diskEv = (ev.diskErr || 0) + (ev.storReset || 0);
    if ((pd.status && pd.status !== "Healthy") || errs > 0) add("fc_disk_fail", "imminent", { name: pd.name }, "gen-sto-01");
    else if (diskEv >= 3 || (num(pd.wear) != null && pd.wear >= 80)) add("fc_disk_fail", "likely", { name: pd.name }, "gen-sto-01");
    else if (diskEv > 0 || (num(pd.wear) != null && pd.wear >= 60) || (num(pd.temp) != null && pd.temp >= 60)) add("fc_disk_fail", "watch", { name: pd.name }, "gen-sto-06");
  }
  if ((ev.whea || 0) > 0) add("fc_hardware", (ev.whea >= 3 ? "likely" : "watch"), { count: ev.whea }, "gen-pow-04");
  if ((ev.kernelPower || 0) >= 2 || (num(d.tempC) != null && d.tempC >= 85)) add("fc_shutdowns", "likely", {}, "gen-pow-04");
  else if ((ev.kernelPower || 0) === 1 || (num(d.tempC) != null && d.tempC >= 75)) add("fc_shutdowns", "watch", {}, "gen-pow-01");
  if ((ev.bugcheck || 0) >= 2 || (ev.tdr || 0) >= 3) add("fc_bsod", "likely", {}, "win-7-03", "sfc-scan");
  else if ((ev.bugcheck || 0) === 1 || arr(d.problemDevices).length) add("fc_bsod", "watch", {}, "win-7-03");
  const b = d.battery;
  if (b && num(b.full) && num(b.design) && b.design > 0) {
    const health = (b.full / b.design) * 100;
    if (health <= 50) add("fc_battery", "likely", { health: Math.round(health) }, "gen-pow-03");
    else if (health <= 70) add("fc_battery", "watch", { health: Math.round(health) }, "gen-pow-03");
  }
  if ((ev.wuFail || 0) >= 3 || (num(d.daysSinceUpdate) != null && d.daysSinceUpdate > 60)) add("fc_updates", "likely", {}, "win-10-07", "reset-windows-update");
  if (num(d.stability) != null && d.stability < 6) add("fc_instability", d.stability < 4 ? "likely" : "watch", { index: d.stability }, "win-10-03", "dism-restore");
  if (d.memory && d.memory.totalKB) {
    const usedPct = (1 - d.memory.freeKB / d.memory.totalKB) * 100;
    if (usedPct >= 85 || arr(d.pagefile).some((p) => p.allocated > 0 && p.current / p.allocated >= 0.8)) add("fc_slowdown", "likely", {}, "win-11-04");
  }
  for (const c of arr(d.appCrashes)) if (c.count >= 3) add("fc_app", "likely", { app: c.app }, null);
  return out;
}

async function scan() {
  if (!WIN) return { supported: false, platform: process.platform, message: "Native diagnostics are implemented for Windows only right now." };
  const { ok, out, err } = await runPS1(SCAN_PS, 120000);
  const data = parseJsonTail(out);
  if (!data) return { supported: true, platform: "win32", error: ok ? "Could not parse scan output" : (err || "PowerShell scan failed") };
  const findings = buildSystemFindings(data);
  return {
    supported: true,
    platform: "win32",
    system: data.os,
    uptimeMinutes: data.uptimeMinutes,
    admin: !!data.admin,
    memory: data.memory,
    disks: arr(data.disks),
    diskHealth: arr(data.diskHealth),
    battery: data.battery || null,
    cpuLoad: num(data.cpuLoad),
    tempC: num(data.tempC),
    stability: num(data.stability),
    topMem: arr(data.topMem),
    events: data.ev || {},
    findings,
    diagnosis: buildSystemDiagnosis(data, findings),
    forecast: buildSystemForecast(data),
    scannedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------------------------
// 2) Security audit
// ---------------------------------------------------------------------------------------------
const SECURITY_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$r = @{}
$r.admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Which antivirus / firewall products Windows Security Center knows about
try { $r.avProducts = @(Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop | ForEach-Object { @{ name = $_.displayName; state = [int]$_.productState } }) } catch { $r.avProducts = @() }
try { $r.fwProducts = @(Get-CimInstance -Namespace root\SecurityCenter2 -ClassName FirewallProduct -ErrorAction Stop | ForEach-Object { @{ name = $_.displayName; state = [int]$_.productState } }) } catch { $r.fwProducts = @() }

# Microsoft Defender engine
try {
  $s = Get-MpComputerStatus -ErrorAction Stop
  $r.defender = @{ service = $s.AMServiceEnabled; av = $s.AntivirusEnabled; rtp = $s.RealTimeProtectionEnabled; behavior = $s.BehaviorMonitorEnabled;
    ioav = $s.IoavProtectionEnabled; tamper = $s.IsTamperProtected; sigAge = $s.AntivirusSignatureAge; sigVersion = $s.AntivirusSignatureVersion;
    quickAge = $s.QuickScanAge; fullAge = $s.FullScanAge; mode = [string]$s.AMRunningMode; engine = $s.AMEngineVersion }
} catch { $r.defender = $null }
try {
  $p = Get-MpPreference -ErrorAction Stop
  $clean = { param($v) @($v | Where-Object { $_ -and ([string]$_) -notmatch '^N/A' }) }
  $r.mp = @{ pua = [int]$p.PUAProtection; cfa = [int]$p.EnableControlledFolderAccess; netProt = [int]$p.EnableNetworkProtection; maps = [int]$p.MAPSReporting;
    exclPath = (& $clean $p.ExclusionPath); exclProc = (& $clean $p.ExclusionProcess); exclExt = (& $clean $p.ExclusionExtension);
    exclHidden = (([string]($p.ExclusionPath)) -match '^N/A') }
} catch { $r.mp = $null }
try {
  $r.threats = @(Get-MpThreat -ErrorAction Stop | Select-Object -First 15 | ForEach-Object { @{ name = $_.ThreatName; sev = [int]$_.SeverityID; active = [bool]$_.IsActive; executed = [bool]$_.DidThreatExecute; res = @($_.Resources | Select-Object -First 2 | ForEach-Object { ([string]$_) -replace '^[a-z]+:_', '' }) } })
} catch { $r.threats = @() }
try { $r.detections30 = @(Get-MpThreatDetection -ErrorAction Stop | Where-Object { $_.InitialDetectionTime -gt (Get-Date).AddDays(-30) }).Count } catch { $r.detections30 = 0 }
try { $pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender' -ErrorAction Stop; $rtpPol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection' -ErrorAction SilentlyContinue
  $r.defenderPolicy = (($pol.DisableAntiSpyware -eq 1) -or ($pol.DisableAntiVirus -eq 1) -or ($rtpPol.DisableRealtimeMonitoring -eq 1)) } catch { $r.defenderPolicy = $false }

# Firewall
try { $r.firewall = @(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object { @{ name = [string]$_.Name; enabled = ([string]$_.Enabled -eq 'True') } }) } catch { $r.firewall = @() }

# UAC, SmartScreen, credential protection
$sys = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
$r.uac = @{ lua = $sys.EnableLUA; prompt = $sys.ConsentPromptBehaviorAdmin; secureDesktop = $sys.PromptOnSecureDesktop }
$ss = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer').SmartScreenEnabled
$ssPol = (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System').EnableSmartScreen
$r.smartScreenOff = (([string]$ss) -eq 'Off') -or ($ssPol -eq 0)
$r.wdigest = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest').UseLogonCredential
$r.lsaPpl = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa').RunAsPPL

# Remote access exposure
$ts = Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server'
$r.rdpEnabled = ($ts.fDenyTSConnections -eq 0)
$r.rdpNla = (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp').UserAuthentication
try { $r.smb1 = [bool](Get-SmbServerConfiguration -ErrorAction Stop).EnableSMB1Protocol } catch { $r.smb1 = $null }
try {
  $listen = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalAddress -notmatch '^(127\.|::1)' })
  $r.listening = @($listen | Group-Object LocalPort | ForEach-Object { $c = $_.Group[0]; $pr = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; @{ port = [int]$_.Name; proc = $(if ($pr) { $pr.ProcessName } else { '?' }); path = $(if ($pr) { $pr.Path } else { $null }) } } | Sort-Object { $_.port } | Select-Object -First 40)
} catch { $r.listening = @() }

# Accounts
try { $g = Get-LocalUser -Name 'Guest' -ErrorAction Stop; $r.guestEnabled = [bool]$g.Enabled } catch { $r.guestEnabled = $null }
try { $r.noPasswordUsers = @(Get-LocalUser -ErrorAction Stop | Where-Object { $_.Enabled -and -not $_.PasswordRequired -and $_.Name -ne 'Guest' } | ForEach-Object { $_.Name }) } catch { $r.noPasswordUsers = @() }
try { $r.adminCount = @(Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop).Count } catch { $r.adminCount = $null }

# Disk encryption + Secure Boot (both readable without admin)
try { $r.bitlocker = (New-Object -ComObject Shell.Application).NameSpace("$env:SystemDrive\").Self.ExtendedProperty('System.Volume.BitLockerProtection') } catch { $r.bitlocker = $null }
try { $r.secureBoot = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' -ErrorAction Stop).UEFISecureBootEnabled } catch { $r.secureBoot = $null }

# Hosts file and proxy hijack
try {
  $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
  $r.hosts = @(Get-Content $hostsPath -ErrorAction Stop | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') } | Where-Object { $_ -notmatch '^(127\.0\.0\.1|::1)\s+localhost\s*$' } | Select-Object -First 200)
} catch { $r.hosts = @() }
$is = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$r.proxy = @{ enabled = ($is.ProxyEnable -eq 1); server = $is.ProxyServer; pac = $is.AutoConfigURL }
try { $wh = (netsh winhttp show proxy) -join ' '; $r.winhttpProxy = -not ($wh -match 'Direct access|Accès direct|Acceso directo|Acesso direto|Direkter Zugriff') } catch { $r.winhttpProxy = $false }
try { $r.dns = @(Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction Stop | ForEach-Object { $_.ServerAddresses } | Where-Object { $_ } | Select-Object -Unique) } catch { $r.dns = @() }

# Persistence: startup entries and non-Microsoft scheduled tasks, scored for red flags
function Sig($p) { if (-not $p -or -not (Test-Path -LiteralPath $p)) { return 'missing' }; try { return [string](Get-AuthenticodeSignature -LiteralPath $p -ErrorAction Stop).Status } catch { return 'unknown' } }
function ExePath($cmd) {
  if (-not $cmd) { return $null }
  $c = [Environment]::ExpandEnvironmentVariables([string]$cmd).Trim()
  if ($c.StartsWith('"')) { $e = $c.IndexOf('"', 1); if ($e -gt 1) { return $c.Substring(1, $e - 1) } }
  if ($c -match '^(.+?\.(exe|com|bat|cmd|vbs|js|ps1|scr|dll))(\s|,|$)') { return $Matches[1] }
  return ($c -split '\s+')[0]
}
$badPath = '\\(Temp|Tmp|Downloads|Public|AppData\\Local\\Temp)\\|\\AppData\\Roaming\\[^\\]+\.(exe|scr|vbs|js)'
$badCmd = '(?i)(-enc(odedcommand)?\s|-w(indowstyle)?\s+hidden|frombase64string|mshta(\.exe)?\s|wscript|cscript|regsvr32.+(/i:|scrobj)|rundll32.+(javascript|url\.dll)|bitsadmin|certutil.+-urlcache|invoke-webrequest|downloadstring|iex\s*\()'
function Score($cmd) {
  $p = ExePath $cmd; $sig = Sig $p; $flags = @()
  if ($p -and ($p -match $badPath)) { $flags += 'path' }
  if ($cmd -match $badCmd) { $flags += 'cmd' }
  if ($sig -eq 'missing') { $flags += 'missing' } elseif ($sig -ne 'Valid') { $flags += 'unsigned' }
  return @{ path = $p; sig = $sig; flags = $flags }
}
$items = @()
foreach ($k in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce')) {
  $props = Get-ItemProperty $k -ErrorAction SilentlyContinue
  if ($props) { $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $sc = Score ([string]$_.Value); $items += @{ name = $_.Name; cmd = ([string]$_.Value).Substring(0, [math]::Min(260, ([string]$_.Value).Length)); where = ($k -replace '^HK(CU|LM):\\Software\\', 'HK$1\'); sig = $sc.sig; flags = $sc.flags } } }
}
foreach ($dir in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup'))) {
  Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
    $target = $_.FullName
    if ($_.Extension -eq '.lnk') { try { $target = (New-Object -ComObject WScript.Shell).CreateShortcut($_.FullName).TargetPath } catch { } }
    $sc = Score $target; $items += @{ name = $_.Name; cmd = $target; where = 'Startup folder'; sig = $sc.sig; flags = $sc.flags }
  }
}
$r.startup = $items
$tasks = @()
try {
  Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskPath -notlike '\Microsoft\*' -and $_.State -ne 'Disabled' } | Select-Object -First 80 | ForEach-Object {
    $t = $_
    foreach ($a in @($t.Actions)) {
      if (-not $a.Execute) { continue }
      $cmd = ([string]$a.Execute + ' ' + [string]$a.Arguments).Trim()
      $sc = Score $cmd
      $tasks += @{ name = $t.TaskName; path = $t.TaskPath; cmd = $cmd.Substring(0, [math]::Min(260, $cmd.Length)); sig = $sc.sig; flags = $sc.flags }
    }
  }
} catch { }
$r.tasks = $tasks
try {
  $r.suspiciousProcs = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -match $badPath) } | Select-Object -First 20 | ForEach-Object {
    @{ name = $_.Name; path = $_.ExecutablePath; sig = (Sig $_.ExecutablePath) } } | Where-Object { $_.sig -ne 'Valid' })
} catch { $r.suspiciousProcs = @() }

# Updates
try {
  $last = (New-Object -ComObject Microsoft.Update.AutoUpdate).Results.LastInstallationSuccessDate
  if ($last -and $last.Year -gt 2000) { $r.daysSinceUpdate = [int]((Get-Date) - $last).TotalDays }
} catch { }
try {
  $job = Start-Job -ScriptBlock {
    $s = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()
    $res = $s.Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
    $sec = 0; foreach ($u in $res.Updates) { foreach ($c in $u.Categories) { if ($c.Name -match 'Security|Critical|Definition') { $sec++; break } } }
    @{ total = $res.Updates.Count; security = $sec }
  }
  if (Wait-Job $job -Timeout 50) { $r.pendingUpdates = Receive-Job $job } else { $r.pendingUpdates = $null }
  Remove-Job $job -Force -ErrorAction SilentlyContinue
} catch { $r.pendingUpdates = $null }

$r | ConvertTo-Json -Depth 6 -Compress
`;

const SENSITIVE_DOMAINS = /(microsoft|windowsupdate|windows\.com|live\.com|office|bing|google|gstatic|youtube|facebook|instagram|apple|icloud|amazon|paypal|bank|desjardins|rbc|td\.com|bmo|scotiabank|cibc|nationale|tangerine|interac|norton|symantec|mcafee|avast|avg|kaspersky|eset|bitdefender|malwarebytes|sophos|trendmicro|f-secure|virustotal|defender)/i;

function buildSecurityFindings(d) {
  const findings = [];
  const add = (code, severity, params, kbId, safeFixId, riskyFixId, detail) =>
    findings.push({ code, severity, params: params || {}, kbId: kbId || null, safeFixId: safeFixId || null, riskyFixId: riskyFixId || null, detail: detail || code });

  const otherAv = arr(d.avProducts).filter((p) => p.name && !/defender/i.test(p.name));
  const def = d.defender;
  const defenderPassive = def && /passive|edr/i.test(def.mode || "");
  if (arr(d.threats).some((t) => t.active)) {
    const active = arr(d.threats).filter((t) => t.active);
    add("threat_active", "critical", { count: active.length, names: active.slice(0, 3).map((t) => t.name).join(", ") }, "sec-11", null, "remove-threats", `${active.length} active threat(s) found by Microsoft Defender`);
  }
  if (!def) {
    if (!otherAv.length) add("no_antivirus", "critical", {}, "sec-06", "open-windows-security", null, "No working antivirus found");
  } else if (otherAv.length && (defenderPassive || !def.rtp)) {
    // Another antivirus is in charge — that's normal; nothing to flag about Defender itself.
  } else {
    if (d.defenderPolicy) add("defender_policy", "high", {}, "sec-06", null, null, "A policy key is disabling Microsoft Defender");
    if (!def.service || !def.av) add("defender_off", "critical", {}, "sec-06", "open-windows-security", null, "Microsoft Defender antivirus is off");
    else if (!def.rtp) add("rtp_off", "high", {}, "sec-06", "defender-rtp-on", null, "Real-time protection is off");
    if (def.av && num(def.sigAge) != null && def.sigAge > 3) add("signatures_old", def.sigAge > 7 ? "high" : "medium", { days: def.sigAge }, "sec-06", "defender-update", null, `Virus definitions are ${def.sigAge} days old`);
    if (def.av && num(def.quickAge) != null && def.quickAge > 14) add("scan_old", "low", { days: def.quickAge }, "sec-06", "defender-quick", "defender-full", `No Defender scan in ${def.quickAge} days`);
    if (def.av && def.tamper === false) add("tamper_off", "medium", {}, "sec-06", "open-windows-security", null, "Tamper Protection is off");
    if (def.av && def.behavior === false) add("behavior_off", "medium", {}, "sec-06", "open-windows-security", null, "Behavior monitoring is off");
    const mp = d.mp || {};
    if (def.av && mp.pua === 0) add("pua_off", "low", {}, "sec-02", null, "pua-on", "Blocking of potentially unwanted apps is off");
    if (def.av && mp.cfa === 0) add("cfa_off", "low", {}, "sec-01", null, "cfa-on", "Ransomware protection (Controlled Folder Access) is off");
    const excl = [...arr(mp.exclPath), ...arr(mp.exclProc), ...arr(mp.exclExt)];
    if (excl.length) {
      const broad = excl.filter((x) => /^[a-z]:\\?$|\\users\\?$|\\temp\\?$|appdata|\\windows\\?$|^\*?\.?(exe|dll|ps1|js|vbs)$/i.test(String(x).trim()));
      add("defender_exclusions", broad.length ? "high" : "low", { count: excl.length, list: excl.slice(0, 4).join(", ") }, "sec-06", null, null, `${excl.length} Defender exclusion(s): ${excl.slice(0, 4).join(", ")}`);
    }
  }
  if ((d.detections30 || 0) > 0 && !arr(d.threats).some((t) => t.active)) add("recent_detections", "low", { count: d.detections30 }, "sec-11", "defender-quick", null, `${d.detections30} threat(s) detected and handled in the last 30 days`);

  const fwOff = arr(d.firewall).filter((p) => !p.enabled).map((p) => p.name);
  const otherFw = arr(d.fwProducts).filter((p) => p.name && !/windows|defender/i.test(p.name));
  if (fwOff.length && !otherFw.length) add("firewall_off", fwOff.some((n) => /public/i.test(n)) ? "high" : "medium", { profiles: fwOff.join(", ") }, "win-xp-05", "firewall-on", null, `Windows Firewall is off for: ${fwOff.join(", ")}`);

  if (d.uac && d.uac.lua === 0) add("uac_off", "high", {}, "win-vista-01", null, "uac-on", "User Account Control is turned off");
  else if (d.uac && d.uac.prompt === 0) add("uac_silent", "medium", {}, "win-vista-01", null, null, "UAC elevates administrators without asking");
  if (d.smartScreenOff) add("smartscreen_off", "medium", {}, "sec-03", "open-windows-security", null, "SmartScreen is off");
  if (d.wdigest === 1) add("wdigest_on", "high", {}, "sec-09", null, "wdigest-off", "WDigest stores passwords in clear text in memory");

  if (d.rdpEnabled) add("rdp_on", d.rdpNla === 0 ? "high" : "medium", { nla: d.rdpNla !== 0 }, "sec-10", null, "rdp-off", "Remote Desktop is enabled");
  if (d.smb1 === true) add("smb1_on", "high", {}, "sec-10", null, "smb1-off", "The obsolete SMBv1 protocol is enabled");
  const riskyPorts = { 23: "Telnet", 21: "FTP", 5900: "VNC", 5800: "VNC", 3389: "RDP" };
  for (const l of arr(d.listening)) {
    if (riskyPorts[l.port] && !(l.port === 3389 && d.rdpEnabled)) add("risky_port", "medium", { port: l.port, service: riskyPorts[l.port], proc: l.proc }, "sec-10", null, null, `${riskyPorts[l.port]} port ${l.port} is listening (${l.proc})`);
  }
  if (d.guestEnabled) add("guest_on", "medium", {}, "sec-10", null, "guest-off", "The Guest account is enabled");
  if (arr(d.noPasswordUsers).length) add("no_password_users", "medium", { names: arr(d.noPasswordUsers).join(", ") }, "sec-09", null, null, `Account(s) without a password: ${arr(d.noPasswordUsers).join(", ")}`);

  if (d.bitlocker === 2) add("bitlocker_off", "low", {}, "win-11-09", "open-device-encryption", null, "The system drive is not encrypted (BitLocker off)");
  if (d.secureBoot === 0) add("secureboot_off", "low", {}, "win-11-01", null, null, "Secure Boot is off");

  const hostsBad = arr(d.hosts).filter((line) => SENSITIVE_DOMAINS.test(line));
  if (hostsBad.length) add("hosts_hijack", "high", { count: hostsBad.length, sample: hostsBad.slice(0, 2).join(" | ") }, "sec-05", null, "reset-hosts", `${hostsBad.length} hosts-file line(s) redirect security/bank/major sites`);
  else if (arr(d.hosts).length > 0) add("hosts_custom", "low", { count: arr(d.hosts).length }, "sec-05", null, null, `${arr(d.hosts).length} custom hosts-file line(s)`);
  if (d.proxy && (d.proxy.enabled || d.proxy.pac)) add("proxy_set", "medium", { server: d.proxy.pac || d.proxy.server || "?" }, "sec-05", null, "reset-proxy", `A proxy is configured: ${d.proxy.pac || d.proxy.server}`);
  if (d.winhttpProxy) add("winhttp_proxy", "low", {}, "sec-05", null, "reset-proxy", "A system-wide WinHTTP proxy is set");

  const susStart = arr(d.startup).filter((s) => arr(s.flags).includes("path") || arr(s.flags).includes("cmd"));
  if (susStart.length) add("startup_suspicious", "high", { count: susStart.length, names: susStart.slice(0, 3).map((s) => s.name).join(", ") }, "sec-11", "open-startup-apps", null, `${susStart.length} suspicious startup entr(y/ies)`);
  const susTasks = arr(d.tasks).filter((s) => arr(s.flags).includes("path") || arr(s.flags).includes("cmd"));
  if (susTasks.length) add("task_suspicious", "high", { count: susTasks.length, names: susTasks.slice(0, 3).map((s) => s.name).join(", ") }, "sec-11", "open-task-scheduler", null, `${susTasks.length} suspicious scheduled task(s)`);
  if (arr(d.suspiciousProcs).length) add("process_suspicious", "high", { count: arr(d.suspiciousProcs).length, names: arr(d.suspiciousProcs).slice(0, 3).map((p) => p.name).join(", ") }, "sec-04", "defender-quick", null, `${arr(d.suspiciousProcs).length} unsigned program(s) running from Temp/Downloads`);

  const pu = d.pendingUpdates;
  if (pu && pu.security > 0) add("security_updates_pending", pu.security >= 3 ? "high" : "medium", { count: pu.security }, "win-10-12", "open-windows-update", null, `${pu.security} security update(s) waiting to install`);
  if (num(d.daysSinceUpdate) != null && d.daysSinceUpdate > 45) add("update_stale", d.daysSinceUpdate > 90 ? "high" : "medium", { days: d.daysSinceUpdate }, "win-10-12", "open-windows-update", null, `No update installed for ${d.daysSinceUpdate} days`);
  return findings;
}

function buildSecurityForecast(d, findings) {
  const out = [];
  const add = (code, level, params, kbId, preventFixId) => out.push({ code, level, params: params || {}, kbId: kbId || null, preventFixId: preventFixId || null });
  const has = (c) => findings.some((f) => f.code === c);
  if (has("threat_active") || has("process_suspicious") || has("task_suspicious") || has("startup_suspicious")) add("fc_reinfection", "likely", {}, "sec-11", "defender-quick");
  if ((has("rdp_on") || has("smb1_on")) && (has("no_password_users") || has("firewall_off"))) add("fc_intrusion", "likely", {}, "sec-10", "firewall-on");
  else if (has("rdp_on") || has("smb1_on") || has("risky_port")) add("fc_intrusion", "watch", {}, "sec-10");
  if (has("cfa_off") && (has("signatures_old") || has("security_updates_pending") || has("rdp_on"))) add("fc_ransomware", "watch", {}, "sec-01", "cfa-on");
  if (has("hosts_hijack") || has("proxy_set")) add("fc_phishing", "likely", {}, "sec-05", "reset-proxy");
  if (has("signatures_old") || has("security_updates_pending") || has("update_stale")) add("fc_unpatched", has("update_stale") ? "likely" : "watch", {}, "win-10-12", "defender-update");
  if (has("wdigest_on") || has("no_password_users")) add("fc_account", "watch", {}, "sec-09");
  return out;
}

async function security() {
  if (!WIN) return { supported: false, platform: process.platform, message: "The security audit is implemented for Windows only right now." };
  const { ok, out, err } = await runPS1(SECURITY_PS, 150000);
  const data = parseJsonTail(out);
  if (!data) return { supported: true, platform: "win32", error: ok ? "Could not parse security output" : (err || "PowerShell security audit failed") };
  const findings = buildSecurityFindings(data);
  return {
    supported: true,
    platform: "win32",
    admin: !!data.admin,
    defender: data.defender || null,
    avProducts: arr(data.avProducts),
    firewall: arr(data.firewall),
    uacOn: !(data.uac && data.uac.lua === 0),
    bitlocker: data.bitlocker,
    secureBoot: data.secureBoot,
    threats: arr(data.threats),
    startup: arr(data.startup),
    tasks: arr(data.tasks).filter((t) => arr(t.flags).length),
    listening: arr(data.listening),
    hosts: arr(data.hosts).slice(0, 30),
    dns: arr(data.dns),
    pendingUpdates: data.pendingUpdates || null,
    findings,
    forecast: buildSecurityForecast(data, findings),
    scannedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------------------------
// 3) Fixes — see repair.js: every step measures the problem before and after, reads the real
//    output + exit code, and runs all admin steps under ONE UAC prompt.
// ---------------------------------------------------------------------------------------------
const repair = require("./repair");

module.exports = { scan, security, fix: repair.fix, fixPlan: repair.fixPlan, listFixes: repair.listFixes, WIN, _test: { buildSystemFindings, buildSystemDiagnosis, buildSystemForecast, buildSecurityFindings, buildSecurityForecast, SCAN_PS, SECURITY_PS, FIXES: repair.FIXES } };

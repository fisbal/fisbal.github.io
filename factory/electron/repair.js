// TechFix repair engine — fixes that report what REALLY happened.
//
// Why this exists (2026-11-11): the first version started each admin repair in a hidden
// elevated window, waited, then printed "done" — the elevated window's output and exit code
// were thrown away, so SFC "✓" showed even when SFC said it could not repair anything.
//
// How it works now:
//   • A repair session is one PowerShell script. Every step is wrapped by TFStep:
//       1. CHECK  — measure the problem first (read-only: free MB, service running?, threats…)
//       2. RUN    — do the repair, capturing its real output + exit code
//       3. CHECK  — measure again
//     and writes one JSON line per step to a progress file the app reads live.
//   • All admin steps run in ONE elevated script → one UAC prompt per session, not per step.
//     Steps that act on the signed-in user (temp files, Explorer, opening Settings…) run
//     un-elevated so they touch the right user.
//   • judge() turns before / after / exit code / output into a verdict the page shows in the
//     user's language: fixed · ok (nothing wrong) · partial · failed · reboot · opened ·
//     started · cancelled — plus a `next` list when the honest answer is "this needs a
//     stronger repair" (e.g. SFC couldn't repair → DISM, then SFC again).
//
// Same safety rule as before: the page only ever sends ids from this fixed table.

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIN = process.platform === "win32";

// ------------------------------------------------------------------------------------------
// PowerShell plumbing
// ------------------------------------------------------------------------------------------
function runPS1(scriptText, timeoutMs) {
  return new Promise((resolve) => {
    if (!WIN) { resolve({ ok: false, out: "", err: "not Windows" }); return; }
    const file = tmpFile("ps1");
    fs.writeFile(file, "﻿" + scriptText, "utf8", (werr) => {
      if (werr) { resolve({ ok: false, out: "", err: String(werr.message || werr) }); return; }
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], {
        timeout: timeoutMs || 120000, maxBuffer: 20 * 1024 * 1024, windowsHide: true
      }, (err, stdout) => {
        fs.unlink(file, () => {});
        if (err) resolve({ ok: false, out: stdout || "", err: String(err.message || err), timedOut: !!err.killed });
        else resolve({ ok: true, out: stdout || "", err: "" });
      });
    });
  });
}
function tmpFile(ext) {
  return path.join(os.tmpdir(), "techfix-" + Date.now() + "-" + Math.random().toString(36).slice(2) + "." + ext);
}
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Shared by both the un-elevated and the elevated script.
const PRELUDE = String.raw`
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
function TFEmit($h) {
  $j = $h | ConvertTo-Json -Compress -Depth 6
  for ($i = 0; $i -lt 20; $i++) { try { [IO.File]::AppendAllText($TF_P, $j + "` + "`" + String.raw`n", [Text.UTF8Encoding]::new($false)); return } catch { Start-Sleep -Milliseconds 100 } }
}
function TFClean($s) {
  if ($null -eq $s) { return '' }
  $s = [string]$s -replace "` + "`" + String.raw`0", ''
  $lines = $s -split "[` + "`" + String.raw`r` + "`" + String.raw`n]+" | Where-Object { $_.Trim() -ne '' -and -not ($_.Length -lt 90 -and $_ -match '\d{1,3}([.,]\d)?\s?%') }
  $s = ($lines -join "` + "`" + String.raw`n").Trim()
  if ($s.Length -gt 2500) { $s = '…' + $s.Substring($s.Length - 2500) }
  return $s
}
function TFStep($id, $check, [scriptblock]$run) {
  TFEmit @{ id = $id; phase = 'start' }
  $before = $null; if ($check) { try { $before = & $check } catch { } }
  $global:LASTEXITCODE = 0; $out = ''; $err = ''; $t0 = Get-Date
  try { $out = (& $run 2>&1 | Out-String -Width 400) } catch { $err = $_.Exception.Message }
  $exit = $global:LASTEXITCODE
  $data = $null
  $m = [regex]::Match([string]$out, '@@TF (\{.*\})')
  if ($m.Success) { try { $data = $m.Groups[1].Value | ConvertFrom-Json } catch { }; $out = ([string]$out).Replace($m.Value, '') }
  $after = $null; if ($check) { try { $after = & $check } catch { } }
  TFEmit @{ id = $id; phase = 'done'; before = $before; after = $after; data = $data; exit = $exit; err = $err; out = (TFClean $out); secs = [int]((Get-Date) - $t0).TotalSeconds }
}
`;

// ------------------------------------------------------------------------------------------
// Re-usable checks (PowerShell expressions that return a hashtable)
// ------------------------------------------------------------------------------------------
const svcCheck = (names) => String.raw`$n = @(${names.map(psq).join(",")}); @{ running = @(Get-Service $n -ErrorAction SilentlyContinue | Where-Object Status -eq 'Running').Count; total = $n.Count; stopped = (@(Get-Service $n -ErrorAction SilentlyContinue | Where-Object Status -ne 'Running' | ForEach-Object Name) -join ', ') }`;
const svcRestart = (names) => String.raw`Restart-Service ${names.map(psq).join(",")} -Force -ErrorAction Stop`;
const regCheck = (key, name) => String.raw`$v = (Get-ItemProperty -LiteralPath ${psq(key)} -Name ${psq(name)} -ErrorAction SilentlyContinue).${name}; @{ v = $(if ($null -eq $v) { $null } else { [int]$v }) }`;
const FREE_SYS = String.raw`@{ freeMB = [math]::Round((Get-PSDrive ($env:SystemDrive.TrimEnd(':'))).Free / 1MB) }`;
const TEMP_MB = String.raw`function TFsz($p) { if (-not (Test-Path -LiteralPath $p)) { return 0 }; [math]::Round(((Get-ChildItem -LiteralPath $p -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum) / 1MB, 1) }`;
const DNS_CHECK = String.raw`@{ ok = [bool](Resolve-DnsName www.microsoft.com -DnsOnly -QuickTimeout -ErrorAction SilentlyContinue) }`;
const NET_CHECK = String.raw`$c = Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
$ip = [string]($c.IPv4Address | Select-Object -First 1).IPAddress; $gw = [string]($c.IPv4DefaultGateway | Select-Object -First 1).NextHop
@{ ip = $ip; gw = $gw; gwOk = $(if ($gw) { [bool](Test-Connection $gw -Count 1 -Quiet -ErrorAction SilentlyContinue) } else { $false }); net = [bool](Test-Connection 1.1.1.1 -Count 2 -Quiet -ErrorAction SilentlyContinue); dns = [bool](Resolve-DnsName www.microsoft.com -DnsOnly -QuickTimeout -ErrorAction SilentlyContinue) }`;
const THREATS = String.raw`$t = @(Get-MpThreat -ErrorAction SilentlyContinue | Where-Object { $_.IsActive -ne $false }); $s = Get-MpComputerStatus -ErrorAction SilentlyContinue
@{ threats = $t.Count; names = (@($t | Select-Object -First 3 | ForEach-Object ThreatName) -join ', '); quick = [string]$s.QuickScanEndTime }`;
const PROBLEM_DEVICES = String.raw`$d = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.ConfigManagerErrorCode -ne 22 -and $_.ConfigManagerErrorCode -ne 45 })
@{ n = $d.Count; names = (@($d | Select-Object -First 4 | ForEach-Object { [string]$_.Name + ' (code ' + $_.ConfigManagerErrorCode + ')' }) -join '; ') }`;
const HOSTS = String.raw`$h = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'; @{ n = @(Get-Content -LiteralPath $h -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*[^#\s]' -and $_ -notmatch '^\s*(127\.0\.0\.1|::1)\s+localhost\s*$' }).Count }`;
const PROXY = String.raw`$i = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
$w = (netsh winhttp show proxy | Out-String)
@{ proxy = [int]$i.ProxyEnable; pac = [string]$i.AutoConfigURL; winhttp = [bool]($w -match '[A-Za-z0-9.-]+:\d{2,5}') }`;
const HOSTS_DEFAULT = '@("# Copyright (c) 1993-2009 Microsoft Corp.","#","# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.","#","# localhost name resolution is handled within DNS itself.","#       127.0.0.1       localhost","#       ::1             localhost")';

// ------------------------------------------------------------------------------------------
// Verdict helpers
// ------------------------------------------------------------------------------------------
const V = (state, code, params, extra) => Object.assign({ state, code, params: params || {} }, extra || {});
const g = (o, k) => (o && o[k] != null ? o[k] : null);
const hex = (n) => (typeof n === "number" ? "0x" + (n >>> 0).toString(16).toUpperCase() : String(n));
const mb = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + " GB" : Math.max(0, Math.round(n)) + " MB");

function judgeServices(r, label) {
  const total = g(r.after, "total");
  if (g(r.after, "running") === total && total) return V(g(r.before, "running") === total ? "ok" : "fixed", "svc_running", { name: label });
  return V("failed", "svc_not_running", { name: g(r.after, "stopped") || label });
}
function judgeSetting(target, rebootAfter) {
  return (r) => {
    const b = g(r.before, "v"), a = g(r.after, "v");
    const eq = (x) => (target === 0 ? !x : x === target);
    if (eq(b)) return V("ok", "already_set");
    if (eq(a)) return V(rebootAfter ? "reboot" : "fixed", "setting_changed");
    return V("failed", "setting_blocked");
  };
}
function judgeFreeSpace(r) {
  const freed = (g(r.after, "freeMB") || 0) - (g(r.before, "freeMB") || 0);
  return freed >= 1 ? V("fixed", "freed_space", { size: mb(freed), free: mb(g(r.after, "freeMB") || 0) }) : V("ok", "nothing_to_clean");
}
function judgeFreed(r, key) {
  const b = g(r.before, key || "mb") || 0, a = g(r.after, key || "mb") || 0;
  if (b < 1 && a < 1) return V("ok", "nothing_to_clean");
  const freed = Math.max(0, b - a);
  if (freed < 1) return V("failed", "nothing_freed", { left: mb(a) });
  return V("fixed", "freed", { size: mb(freed), left: mb(a) });
}

// ------------------------------------------------------------------------------------------
// The fixed table. tier: "safe" runs straight away, "risky" is shown with its command and a
// tick box first. admin: runs in the elevated script. kind "open" = opens a Windows screen
// for the user (said honestly — it's not a repair).
// ------------------------------------------------------------------------------------------
const OPEN = (label, target) => ({ label, tier: "safe", kind: "open", admin: false, run: `Start-Process ${psq(target)}`, judge: () => V("opened", "opened") });

const FIXES = {
  // ---------- network ----------
  "flush-dns": {
    label: "Flush DNS resolver cache", tier: "safe", admin: false,
    check: DNS_CHECK, run: `Clear-DnsClientCache; ipconfig /flushdns | Out-Null`,
    judge: (r) => g(r.after, "ok") ? V(g(r.before, "ok") ? "ok" : "fixed", "dns_ok")
      : V("failed", "dns_still_failing", {}, { next: ["release-renew-ip", "winsock-reset"] })
  },
  "release-renew-ip": {
    label: "Release and renew the IP address", tier: "risky", admin: true, cmd: "ipconfig /release ; ipconfig /renew",
    check: NET_CHECK, run: `ipconfig /release | Out-Null; ipconfig /renew | Out-Null; Start-Sleep -Seconds 3`, timeoutMs: 180000,
    judge: (r) => {
      const a = r.after || {};
      if (a.net && a.dns) return V(r.before && r.before.net && r.before.dns ? "ok" : "fixed", "net_ok", { ip: a.ip || "?" });
      if (a.net && !a.dns) return V("partial", "net_dns_broken", {}, { next: ["flush-dns", "winsock-reset"] });
      if (!a.ip || /^169\.254\./.test(a.ip)) return V("failed", "net_no_dhcp", {}, { next: ["rescan-devices", "winsock-reset"] });
      if (a.gwOk) return V("failed", "net_isp", { gw: a.gw });
      return V("failed", "net_no_router", { gw: a.gw || "?" }, { next: ["winsock-reset"] });
    }
  },
  "winsock-reset": {
    label: "Reset Winsock + TCP/IP (needs a reboot to finish)", tier: "risky", admin: true, cmd: "netsh winsock reset ; netsh int ip reset",
    run: String.raw`netsh winsock reset | Out-Null; $a = $LASTEXITCODE; netsh int ip reset | Out-Null; $b = $LASTEXITCODE; "@@TF " + (@{ a = $a; b = $b } | ConvertTo-Json -Compress)`,
    judge: (r) => (g(r.data, "a") === 0 ? V("reboot", "net_reset_reboot") : V("failed", "cmd_failed", { code: hex(g(r.data, "a")) }))
  },
  // ---------- explorer / temp / disk space ----------
  "restart-explorer": {
    label: "Restart Windows Explorer", tier: "safe", admin: false,
    check: `@{ running = [bool](Get-Process explorer -ErrorAction SilentlyContinue) }`,
    run: `Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 1200; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }; Start-Sleep -Seconds 2`,
    judge: (r) => (g(r.after, "running") ? V("fixed", "explorer_restarted") : V("failed", "explorer_down"))
  },
  "clear-temp": {
    label: "Clear this user's temp files", tier: "safe", admin: false,
    check: TEMP_MB + `; @{ mb = (TFsz $env:TEMP) }`,
    run: `Get-ChildItem -LiteralPath $env:TEMP -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue`,
    judge: (r) => judgeFreed(r)
  },
  "clear-windows-temp": {
    label: "Clear this user's and Windows' temp files", tier: "safe", admin: true,
    check: TEMP_MB + `; @{ mb = (TFsz $env:TEMP) + (TFsz "$env:SystemRoot\\Temp") }`,
    run: `foreach ($p in @($env:TEMP, "$env:SystemRoot\\Temp")) { Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }`,
    judge: (r) => judgeFreed(r)
  },
  "empty-recycle-bin": {
    label: "Empty the Recycle Bin", tier: "risky", admin: false, cmd: "Clear-RecycleBin -Force",
    check: String.raw`$s = (New-Object -ComObject Shell.Application).NameSpace(10); @{ mb = [math]::Round(((@($s.Items()) | ForEach-Object { $_.Size } | Measure-Object -Sum).Sum) / 1MB, 1) }`,
    run: `Clear-RecycleBin -Force -ErrorAction SilentlyContinue`,
    judge: (r) => judgeFreed(r)
  },
  "component-cleanup": {
    label: "Clean up old Windows update files (DISM StartComponentCleanup)", tier: "risky", admin: true,
    cmd: "DISM /Online /Cleanup-Image /StartComponentCleanup", timeoutMs: 60 * 60000,
    check: FREE_SYS, run: `DISM /Online /Cleanup-Image /StartComponentCleanup /NoRestart`,
    judge: (r) => {
      if (r.exit !== 0 && r.exit !== 3010) return V("failed", "dism_failed", { code: hex(r.exit) });
      return judgeFreeSpace(r);
    }
  },
  "free-update-space": {
    label: "Delete Windows Update leftovers and the Delivery Optimization cache", tier: "risky", admin: true, timeoutMs: 20 * 60000,
    cmd: "del SoftwareDistribution.old* catroot2.old* SoftwareDistribution\\Download\\* ; Delete-DeliveryOptimizationCache",
    check: FREE_SYS,
    run: String.raw`Stop-Service wuauserv,bits,dosvc -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2
Get-ChildItem -LiteralPath $env:SystemRoot -Directory -Filter 'SoftwareDistribution.old*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath "$env:SystemRoot\System32" -Directory -Filter 'catroot2.old*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath "$env:SystemRoot\SoftwareDistribution\Download" -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Start-Service dosvc -ErrorAction SilentlyContinue
try { Delete-DeliveryOptimizationCache -Force -ErrorAction Stop } catch { }
Start-Service bits,wuauserv -ErrorAction SilentlyContinue`,
    judge: (r) => judgeFreeSpace(r)
  },
  // ---------- system file / disk repair ----------
  "sfc-scan": {
    label: "Repair Windows system files (sfc /scannow)", tier: "risky", admin: true, cmd: "sfc /scannow", timeoutMs: 60 * 60000,
    run: String.raw`$start = Get-Date
$o = (sfc /scannow | Out-String) -replace "` + "`" + String.raw`0", ''
$code = $LASTEXITCODE
$rep = 0; $bad = 0; $ver = 0; $log = $true
try {
  $fs = [IO.File]::Open("$env:SystemRoot\Logs\CBS\CBS.log", 'Open', 'Read', 'ReadWrite'); $sr = New-Object IO.StreamReader($fs)
  while ($null -ne ($l = $sr.ReadLine())) {
    if ($l -notmatch '\[SR\]') { continue }
    if ($l -match '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})') { if ([datetime]::ParseExact($Matches[1], 'yyyy-MM-dd HH:mm:ss', $null) -lt $start.AddSeconds(-5)) { continue } }
    if ($l -match 'Cannot repair member file') { $bad++ } elseif ($l -match 'Repairing corrupted file') { $rep++ } elseif ($l -match 'Verify complete') { $ver++ }
  }
  $sr.Close()
} catch { $log = $false }
$pending = [bool]($o -match 'pending|en attente|pendiente|pendente|ausstehend')
"@@TF " + (@{ exit = $code; repaired = $rep; unrepaired = $bad; verified = $ver; log = $log; pending = $pending } | ConvertTo-Json -Compress)`,
    judge: (r) => {
      const d = r.data || {}, o = String(r.out || "");
      if (d.unrepaired > 0 || /unable to fix|n'a pas pu|no pudo reparar|não pôde|konnte .* nicht/i.test(o))
        return V("partial", "sfc_unrepaired", { n: d.unrepaired || "?" }, { next: ["dism-restore", "sfc-scan"] });
      if (d.repaired > 0 || /successfully repaired|les a réparés|los reparó|os reparou|erfolgreich repariert/i.test(o))
        return V("reboot", "sfc_repaired", { n: d.repaired || "?" });
      if (d.pending && !d.verified) return V("reboot", "sfc_pending");
      if (d.verified > 0 || /did not find any integrity|aucune violation|no encontró ninguna|não encontrou nenhuma|keine Integritätsverletzungen/i.test(o))
        return V("ok", "sfc_clean");
      if (/could not perform|n'a pas pu effectuer|no pudo realizar|não pôde executar|konnte .* nicht durchführen/i.test(o))
        return V("failed", "sfc_could_not_run", {}, { next: ["dism-restore"] });
      return V("failed", "no_verdict");
    }
  },
  "dism-restore": {
    label: "Repair the Windows image (DISM RestoreHealth, 10–30 min)", tier: "risky", admin: true,
    cmd: "DISM /Online /Cleanup-Image /RestoreHealth", timeoutMs: 90 * 60000,
    run: `DISM /Online /Cleanup-Image /RestoreHealth /NoRestart`,
    judge: (r) => {
      const e = r.exit;
      if (e === 0) return V("fixed", "dism_ok", {}, { next: ["sfc-scan"] });
      if (e === 3010) return V("reboot", "dism_ok_reboot", {}, { next: ["sfc-scan"] });
      const h = hex(e);
      if (h === "0x800F081F" || h === "0x800F0950") return V("failed", "dism_no_source", { code: h });
      if (h === "0x800F0906" || h === "0x800F0907") return V("failed", "dism_no_download", { code: h }, { next: ["release-renew-ip"] });
      return V("failed", "dism_failed", { code: h });
    }
  },
  "chkdsk-scan": {
    label: "Check the system drive for file-system errors (online, no reboot)", tier: "risky", admin: true,
    cmd: "chkdsk C: /scan", timeoutMs: 60 * 60000, run: `chkdsk $env:SystemDrive /scan`,
    judge: (r) => ({ 0: V("ok", "disk_clean"), 1: V("fixed", "disk_fixed"), 2: V("ok", "disk_clean") }[r.exit]
      || V("partial", "disk_needs_offline", {}, { next: ["chkdsk-schedule"] }))
  },
  "chkdsk-schedule": {
    label: "Repair the system drive at the next restart (chkdsk /f)", tier: "risky", admin: true,
    cmd: "fsutil dirty set C:  (chkdsk /f runs at next boot)", run: `fsutil dirty set $env:SystemDrive`,
    judge: (r) => (r.exit === 0 ? V("reboot", "chkdsk_scheduled") : V("failed", "cmd_failed", { code: hex(r.exit) }))
  },
  // ---------- devices ----------
  "rescan-devices": {
    label: "Restart the devices showing an error, then rescan for hardware", tier: "risky", admin: true,
    cmd: "pnputil /restart-device <each device in error> ; pnputil /scan-devices", timeoutMs: 300000,
    check: PROBLEM_DEVICES,
    run: String.raw`$d = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.ConfigManagerErrorCode -ne 22 -and $_.ConfigManagerErrorCode -ne 45 })
foreach ($x in $d) {
  pnputil /restart-device "$($x.PNPDeviceID)" | Out-Null
  if ($LASTEXITCODE -ne 0) { try { Disable-PnpDevice -InstanceId $x.PNPDeviceID -Confirm:$false -ErrorAction Stop; Start-Sleep -Seconds 2; Enable-PnpDevice -InstanceId $x.PNPDeviceID -Confirm:$false -ErrorAction Stop } catch { } }
}
pnputil /scan-devices | Out-Null
Start-Sleep -Seconds 4`,
    judge: (r) => {
      const b = g(r.before, "n") || 0, a = g(r.after, "n") || 0;
      if (!b && !a) return V("ok", "devices_ok");
      if (!a) return V("fixed", "devices_fixed", { n: b });
      if (a < b) return V("partial", "devices_some", { fixed: b - a, n: a, names: g(r.after, "names") }, { next: ["open-windows-update"] });
      return V("failed", "devices_left", { n: a, names: g(r.after, "names") }, { next: ["open-windows-update", "open-device-manager"] });
    }
  },
  // ---------- services ----------
  "restart-spooler": {
    label: "Clear stuck print jobs and restart the Print Spooler", tier: "safe", admin: true,
    check: String.raw`@{ running = ((Get-Service Spooler).Status -eq 'Running'); jobs = @(Get-ChildItem "$env:SystemRoot\System32\spool\PRINTERS" -File -ErrorAction SilentlyContinue).Count; offline = @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.WorkOffline -or $_.PrinterStatus -eq 7 }).Count }`,
    run: String.raw`Stop-Service Spooler -Force -ErrorAction Stop; Start-Sleep -Seconds 1; Get-ChildItem "$env:SystemRoot\System32\spool\PRINTERS" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; Start-Service Spooler -ErrorAction Stop; Start-Sleep -Seconds 2`,
    judge: (r) => {
      if (!g(r.after, "running")) return V("failed", "svc_not_running", { name: "Print Spooler" });
      if (g(r.after, "offline") > 0) return V("partial", "printer_still_offline", { n: g(r.after, "offline"), jobs: g(r.before, "jobs") || 0 });
      return V(g(r.before, "jobs") ? "fixed" : "ok", "spooler_fixed", { jobs: g(r.before, "jobs") || 0 });
    }
  },
  "restart-wuauserv": { label: "Restart the Windows Update service", tier: "safe", admin: true, check: svcCheck(["wuauserv"]), run: svcRestart(["wuauserv"]), judge: (r) => judgeServices(r, "Windows Update") },
  "restart-audio": { label: "Restart the Windows Audio service", tier: "safe", admin: true, check: svcCheck(["Audiosrv", "AudioEndpointBuilder"]), run: svcRestart(["AudioEndpointBuilder", "Audiosrv"]), judge: (r) => judgeServices(r, "Windows Audio") },
  "restart-bluetooth": { label: "Restart the Bluetooth service", tier: "safe", admin: true, check: svcCheck(["bthserv"]), run: svcRestart(["bthserv"]), judge: (r) => judgeServices(r, "Bluetooth") },
  "start-core-services": {
    label: "Start core Windows services that should be running", tier: "safe", admin: true,
    check: String.raw`@{ stopped = (@(Get-CimInstance Win32_Service | Where-Object { @('Dhcp','Dnscache','EventLog','Winmgmt','BFE','mpssvc','Audiosrv','CryptSvc','LanmanWorkstation','nsi','Schedule','ProfSvc','Power') -contains $_.Name -and $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' } | ForEach-Object Name) -join ', ') }`,
    run: String.raw`Get-CimInstance Win32_Service | Where-Object { @('Dhcp','Dnscache','EventLog','Winmgmt','BFE','mpssvc','Audiosrv','CryptSvc','LanmanWorkstation','nsi','Schedule','ProfSvc','Power') -contains $_.Name -and $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' } | ForEach-Object { Start-Service $_.Name -ErrorAction SilentlyContinue }`,
    judge: (r) => {
      const b = g(r.before, "stopped"), a = g(r.after, "stopped");
      if (!b) return V("ok", "svc_running", { name: "core services" });
      return a ? V("failed", "svc_not_running", { name: a }) : V("fixed", "svc_started", { name: b });
    }
  },
  "reset-windows-update": {
    label: "Reset Windows Update components", tier: "risky", admin: true, timeoutMs: 300000,
    cmd: "net stop wuauserv bits cryptsvc ; ren SoftwareDistribution / catroot2 ; net start …",
    check: svcCheck(["wuauserv", "bits", "cryptsvc"]),
    run: String.raw`Stop-Service wuauserv,bits,cryptsvc -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; $s = Get-Date -Format yyyyMMddHHmm
$a = Join-Path $env:SystemRoot 'SoftwareDistribution'; $b = Join-Path $env:SystemRoot 'System32\catroot2'
Get-ChildItem -LiteralPath $env:SystemRoot -Directory -Filter 'SoftwareDistribution.old*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath (Join-Path $env:SystemRoot 'System32') -Directory -Filter 'catroot2.old*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$ra = $false; $rb = $false
try { Rename-Item -LiteralPath $a ('SoftwareDistribution.old' + $s) -ErrorAction Stop; $ra = $true } catch { }
try { Rename-Item -LiteralPath $b ('catroot2.old' + $s) -ErrorAction Stop; $rb = $true } catch { }
Start-Service cryptsvc,bits,wuauserv -ErrorAction SilentlyContinue
"@@TF " + (@{ ra = $ra; rb = $rb } | ConvertTo-Json -Compress)`,
    judge: (r) => {
      const ok = g(r.after, "running") >= 2; // wuauserv is demand-start and may stop again by itself
      if (!g(r.data, "ra")) return V("failed", "wu_reset_locked");
      return ok ? V("fixed", "wu_reset") : V("partial", "wu_reset_services", { name: g(r.after, "stopped") });
    }
  },
  "reset-store-cache": {
    label: "Reset the Microsoft Store cache (wsreset)", tier: "safe", admin: false, timeoutMs: 180000,
    run: `$p = Start-Process wsreset.exe -PassThru; $p.WaitForExit(150000) | Out-Null; $global:LASTEXITCODE = $(if ($p.HasExited) { $p.ExitCode } else { 0 })`,
    judge: (r) => (r.exit === 0 ? V("fixed", "store_reset") : V("failed", "cmd_failed", { code: hex(r.exit) }))
  },
  // ---------- security ----------
  "defender-update": {
    label: "Update Microsoft Defender virus definitions", tier: "safe", admin: true, timeoutMs: 600000,
    check: String.raw`$s = Get-MpComputerStatus; @{ ver = [string]$s.AntivirusSignatureVersion; age = [int]$s.AntivirusSignatureAge }`,
    run: `Update-MpSignature -ErrorAction Stop`,
    judge: (r) => {
      if (g(r.after, "ver") && g(r.after, "ver") !== g(r.before, "ver")) return V("fixed", "defs_updated", { ver: g(r.after, "ver") });
      if (g(r.after, "age") != null && g(r.after, "age") <= 1) return V("ok", "defs_current", { ver: g(r.after, "ver") });
      return V("failed", "defs_update_failed", { msg: (r.err || "").slice(0, 160) });
    }
  },
  "defender-quick": {
    label: "Run a Microsoft Defender quick scan (5–15 min)", tier: "safe", admin: true, timeoutMs: 45 * 60000,
    check: THREATS, run: `Start-MpScan -ScanType QuickScan -ErrorAction Stop`,
    judge: (r) => {
      if (r.err) return V("failed", "scan_not_run", { msg: r.err.slice(0, 160) });
      const n = g(r.after, "threats") || 0;
      return n ? V("partial", "scan_found", { n, names: g(r.after, "names") }, { next: ["remove-threats"] }) : V("ok", "scan_clean");
    }
  },
  "remove-threats": {
    label: "Remove the active threats Defender found", tier: "risky", admin: true, cmd: "Remove-MpThreat", timeoutMs: 600000,
    check: THREATS, run: `Remove-MpThreat -ErrorAction Stop`,
    judge: (r) => {
      const b = g(r.before, "threats") || 0, a = g(r.after, "threats") || 0;
      if (!b) return V("ok", "no_threats");
      return a ? V("partial", "threats_left", { n: a, names: g(r.after, "names") }, { next: ["defender-offline"] }) : V("fixed", "threats_removed", { n: b });
    }
  },
  "defender-full": {
    label: "Start a full Defender scan in the background (can take hours)", tier: "risky", admin: true, cmd: "Start-MpScan -ScanType FullScan -AsJob",
    run: `Start-MpScan -ScanType FullScan -AsJob | Out-Null`, judge: () => V("started", "scan_started")
  },
  "defender-offline": {
    label: "Defender Offline scan — RESTARTS the PC now (~15 min)", tier: "risky", admin: true, cmd: "Start-MpWDOScan", manualOnly: true,
    run: `Start-MpWDOScan -ErrorAction Stop`, judge: (r) => (r.err ? V("failed", "cmd_failed", { code: r.err.slice(0, 80) }) : V("reboot", "offline_scan_started"))
  },
  "defender-rtp-on": {
    label: "Turn Defender real-time protection back on", tier: "safe", admin: true,
    check: String.raw`$o = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct -ErrorAction SilentlyContinue | Where-Object { $_.displayName -notmatch 'Defender' } | Select-Object -First 1
@{ on = [bool](Get-MpComputerStatus).RealTimeProtectionEnabled; other = [string]$o.displayName }`,
    run: `Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction Stop`,
    judge: (r) => {
      if (g(r.after, "on")) return V(g(r.before, "on") ? "ok" : "fixed", "rtp_on");
      if (g(r.after, "other")) return V("ok", "other_av", { name: g(r.after, "other") });
      return V("failed", "rtp_blocked");
    }
  },
  "firewall-on": {
    label: "Turn Windows Firewall on for all network types", tier: "safe", admin: true,
    check: `@{ on = @(Get-NetFirewallProfile | Where-Object Enabled).Count }`,
    run: `Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True -ErrorAction Stop`,
    judge: (r) => (g(r.after, "on") === 3 ? V(g(r.before, "on") === 3 ? "ok" : "fixed", "firewall_on") : V("failed", "setting_blocked"))
  },
  "pua-on": { label: "Block potentially unwanted apps (adware, bundled junk)", tier: "risky", admin: true, cmd: "Set-MpPreference -PUAProtection Enabled", check: `@{ v = [int](Get-MpPreference).PUAProtection }`, run: `Set-MpPreference -PUAProtection Enabled -ErrorAction Stop`, judge: judgeSetting(1) },
  "cfa-on": { label: "Turn on ransomware protection (Controlled Folder Access)", tier: "risky", admin: true, cmd: "Set-MpPreference -EnableControlledFolderAccess Enabled", check: `@{ v = [int](Get-MpPreference).EnableControlledFolderAccess }`, run: `Set-MpPreference -EnableControlledFolderAccess Enabled -ErrorAction Stop`, judge: judgeSetting(1) },
  "uac-on": { label: "Turn User Account Control back on (needs a reboot)", tier: "risky", admin: true, cmd: "Set-ItemProperty HKLM:\\…\\Policies\\System EnableLUA 1", check: regCheck("HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", "EnableLUA"), run: `Set-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name EnableLUA -Value 1 -Type DWord -ErrorAction Stop`, judge: judgeSetting(1, true) },
  "wdigest-off": { label: "Stop WDigest from keeping clear-text passwords", tier: "risky", admin: true, cmd: "Set-ItemProperty HKLM:\\…\\WDigest UseLogonCredential 0", check: regCheck("HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\WDigest", "UseLogonCredential"), run: `Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\WDigest' -Name UseLogonCredential -Value 0 -Type DWord -ErrorAction Stop`, judge: judgeSetting(0) },
  "rdp-off": { label: "Turn off Remote Desktop", tier: "risky", admin: true, cmd: "Set-ItemProperty 'HKLM:\\…\\Terminal Server' fDenyTSConnections 1", check: regCheck("HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server", "fDenyTSConnections"), run: `Set-ItemProperty 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name fDenyTSConnections -Value 1 -Type DWord -ErrorAction Stop`, judge: judgeSetting(1) },
  "smb1-off": { label: "Disable the obsolete SMBv1 protocol", tier: "risky", admin: true, cmd: "Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force", check: `@{ v = [int][bool](Get-SmbServerConfiguration).EnableSMB1Protocol }`, run: `Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force -ErrorAction Stop`, judge: judgeSetting(0) },
  "guest-off": { label: "Disable the Guest account", tier: "risky", admin: true, cmd: "Disable-LocalUser (built-in Guest, SID …-501)", check: String.raw`@{ v = [int][bool](Get-LocalUser | Where-Object { $_.SID -like '*-501' }).Enabled }`, run: String.raw`Get-LocalUser | Where-Object { $_.SID -like '*-501' } | Disable-LocalUser -ErrorAction Stop`, judge: judgeSetting(0) },
  "reset-proxy": {
    label: "Remove the proxy settings (user + system WinHTTP)", tier: "risky", admin: true,
    cmd: "ProxyEnable=0, delete AutoConfigURL ; netsh winhttp reset proxy", check: PROXY,
    run: String.raw`$k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'; Set-ItemProperty $k -Name ProxyEnable -Value 0 -ErrorAction SilentlyContinue; Remove-ItemProperty $k -Name AutoConfigURL -ErrorAction SilentlyContinue; netsh winhttp reset proxy | Out-Null`,
    judge: (r) => {
      const bad = (x) => x && (x.proxy || x.pac || x.winhttp);
      if (!bad(r.before)) return V("ok", "already_set");
      return bad(r.after) ? V("failed", "setting_blocked") : V("fixed", "proxy_removed");
    }
  },
  "reset-hosts": {
    label: "Back up the hosts file, then restore the Windows default", tier: "risky", admin: true,
    cmd: "copy hosts hosts.techfix-backup-<date> ; write default hosts", check: HOSTS,
    run: String.raw`$h = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'; $bk = $h + '.techfix-backup-' + (Get-Date -Format yyyyMMddHHmm); Copy-Item -LiteralPath $h $bk -Force -ErrorAction Stop; Set-Content -LiteralPath $h -Value ` + HOSTS_DEFAULT + String.raw` -Encoding ASCII -Force -ErrorAction Stop; ipconfig /flushdns | Out-Null; "@@TF " + (@{ backup = $bk } | ConvertTo-Json -Compress)`,
    judge: (r) => {
      if (!g(r.before, "n")) return V("ok", "already_set");
      return g(r.after, "n") ? V("failed", "setting_blocked") : V("fixed", "hosts_restored", { n: g(r.before, "n"), backup: g(r.data, "backup") || "" });
    }
  },
  // ---------- screens TechFix can only open (said so) ----------
  "open-windows-security": OPEN("Open Windows Security", "windowsdefender:"),
  "open-windows-update": OPEN("Open Windows Update", "ms-settings:windowsupdate"),
  "open-activation": OPEN("Open Windows activation settings", "ms-settings:activation"),
  "open-device-encryption": OPEN("Open device encryption settings", "ms-settings:deviceencryption"),
  "open-startup-apps": OPEN("Open Startup apps settings", "ms-settings:startupapps"),
  "open-task-scheduler": OPEN("Open Task Scheduler", "taskschd.msc"),
  "open-bluetooth": OPEN("Open Bluetooth settings", "ms-settings:bluetooth"),
  "open-sound": OPEN("Open Sound settings", "ms-settings:sound"),
  "open-network": OPEN("Open Network settings", "ms-settings:network-status"),
  "open-storage": OPEN("Open Storage settings", "ms-settings:storagesense"),
  "open-power": OPEN("Open Power & battery settings", "ms-settings:powersleep"),
  "open-apps": OPEN("Open Installed apps", "ms-settings:appsfeatures"),
  "open-device-manager": OPEN("Open Device Manager", "devmgmt.msc"),
  "open-troubleshoot": OPEN("Open Windows troubleshooters", "ms-settings:troubleshoot"),
  "open-memory-test": OPEN("Schedule the Windows memory test (runs at next restart)", "mdsched.exe")
};

// ------------------------------------------------------------------------------------------
// Building and running a session
// ------------------------------------------------------------------------------------------
function stepScript(id) {
  const f = FIXES[id];
  const check = f.check ? `{ ${f.check} }` : "$null";
  return `TFStep ${psq(id)} ${check} {\n${f.run}\n}\n`;
}
function sessionScript(ids, progressFile) {
  return `$TF_P = ${psq(progressFile)}\n` + PRELUDE + ids.map(stepScript).join("") + `TFEmit @{ phase = 'end' }\n`;
}

function listFixes() {
  return Object.entries(FIXES).map(([id, f]) => ({
    id, label: f.label, tier: f.tier, kind: f.kind || "repair", admin: !!f.admin, cmd: f.cmd || null, manualOnly: !!f.manualOnly
  }));
}

function verdict(id, line) {
  const r = { before: line.before, after: line.after, data: line.data, exit: typeof line.exit === "number" ? line.exit : null, err: line.err || "", out: line.out || "" };
  let v;
  try { v = FIXES[id].judge(r); } catch (e) { v = V("failed", "no_verdict"); }
  const ok = ["fixed", "ok", "reboot", "opened", "started"].includes(v.state);
  return Object.assign({ id, ok, label: FIXES[id].label, secs: line.secs || 0, out: r.out, exit: r.exit, before: r.before, after: r.after }, v);
}

// ids → [{id, ok, state, code, params, next?, out, …}], with live progress through onProgress.
async function fixPlan(rawIds, onProgress) {
  const emit = (e) => { try { onProgress && onProgress(e); } catch (_) {} };
  const ids = [...new Set((rawIds || []).map(String))].filter((id) => Object.prototype.hasOwnProperty.call(FIXES, id));
  if (!WIN) return ids.map((id) => Object.assign({ id, ok: false }, V("failed", "not_windows")));
  if (!ids.length) return [];
  const results = {};
  const prog = tmpFile("jsonl");
  fs.writeFileSync(prog, "");
  let readPos = 0;
  const poll = () => {
    let buf;
    try { buf = fs.readFileSync(prog); } catch (_) { return; }
    if (buf.length <= readPos) return;
    const text = buf.slice(readPos).toString("utf8");
    const lastNl = text.lastIndexOf("\n");
    if (lastNl < 0) return;
    readPos += Buffer.byteLength(text.slice(0, lastNl + 1), "utf8");
    for (const raw of text.slice(0, lastNl).split("\n")) {
      const s = raw.replace(/^﻿/, "").trim();
      if (!s) continue;
      let line; try { line = JSON.parse(s); } catch (_) { continue; }
      if (!line.id || !FIXES[line.id]) continue;
      if (line.phase === "start") emit({ id: line.id, phase: "start" });
      if (line.phase === "done") { results[line.id] = verdict(line.id, line); emit({ id: line.id, phase: "done", result: results[line.id] }); }
    }
  };
  const timer = setInterval(poll, 500);
  const user = ids.filter((id) => !FIXES[id].admin);
  const admin = ids.filter((id) => FIXES[id].admin);
  const budget = (list) => list.reduce((s, id) => s + (FIXES[id].timeoutMs || 120000), 0) + 60000;
  let adminCancelled = false;
  try {
    if (user.length) await runPS1(sessionScript(user, prog), budget(user));
    poll();
    if (admin.length) {
      const script = tmpFile("ps1");
      fs.writeFileSync(script, "﻿" + sessionScript(admin, prog), "utf8");
      const launcher = `try { $p = Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',${psq('"' + script + '"')} -Wait -PassThru -ErrorAction Stop; "exit:" + $p.ExitCode } catch { "cancelled: " + $_.Exception.Message; exit 1 }`;
      const res = await runPS1(launcher, budget(admin));
      if (/cancelled/i.test(res.out || "")) adminCancelled = true;
      fs.unlink(script, () => {});
    }
  } finally {
    clearInterval(timer);
    poll();
    fs.unlink(prog, () => {});
  }
  return ids.map((id) => results[id] || Object.assign({ id, ok: false, label: FIXES[id].label },
    FIXES[id].admin && adminCancelled ? V("cancelled", "cancelled") : V("failed", "no_result")));
}

// Old single-step call kept for older pages.
async function fix(id) {
  const [r] = await fixPlan([id]);
  if (!r) return { ok: false, message: "Unknown fix id: " + id };
  return Object.assign({}, r, { message: r.state === "cancelled" ? "cancelled" : r.code });
}

module.exports = { fixPlan, fix, listFixes, FIXES, _test: { sessionScript, verdict, PRELUDE } };

"use strict";
// ============================================================================================
// TechFix — "Close a program" (Windows). Lists the programs of the signed-in user that use the
// most memory and closes one on request:
//   1) a normal close (the same as clicking ✕ — the program can ask to save its work),
//   2) only if it's still running AND the person confirms: a forced stop (Stop-Process -Force).
// Windows' own processes, security software, shared runtimes and TechFix itself are never
// listed or closed. Only names from the latest list can be closed (no free-form input).
// ============================================================================================
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIN = process.platform === "win32";
// Never offered: Windows itself, security, drivers/runtimes other apps depend on, shells, TechFix.
const PROTECTED = new Set(["idle", "system", "registry", "secure system", "memory compression", "memcompression", "smss", "csrss", "wininit",
  "winlogon", "services", "lsass", "lsaiso", "svchost", "fontdrvhost", "dwm", "explorer", "sihost", "ctfmon", "taskhostw", "runtimebroker",
  "startmenuexperiencehost", "shellexperiencehost", "searchhost", "searchapp", "searchindexer", "textinputhost", "lockapp",
  "applicationframehost", "msmpeng", "nissrv", "mpdefendercoreservice", "securityhealthservice", "securityhealthsystray", "smartscreen",
  "audiodg", "spoolsv", "wmiprvse", "conhost", "dllhost", "wudfhost", "useroobebroker", "msedgewebview2", "vmmem", "vmmemwsl", "vmcompute",
  "powershell", "pwsh", "cmd", "windowsterminal", "openconsole", "techfix", "electron", "widgets", "widgetservice", "phoneexperiencehost",
  "crossdeviceresume", "igfxem", "nvcontainer", "nvdisplay.container", "amdrsserv", "atiesrxx", "rtkauduservice64", "dashost"]);
const NAME_RE = /^[\w .+\-()]{1,80}$/;
let LAST = new Set();

function runPS(script, timeoutMs) {
  return new Promise((resolve) => {
    if (!WIN) return resolve({ ok: false, out: "", err: "not Windows" });
    const file = path.join(os.tmpdir(), "techfix-proc-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".ps1");
    fs.writeFile(file, "﻿" + script, "utf8", (werr) => {
      if (werr) return resolve({ ok: false, out: "", err: String(werr.message || werr) });
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file],
        { timeout: timeoutMs || 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
          fs.unlink(file, () => {});
          resolve({ ok: !err, out: stdout || "", err: err ? String(err.message || err) : "" });
        });
    });
  });
}
const tail = (out) => { const s = String(out || ""), i = s.lastIndexOf("@@TF "); if (i < 0) return null; try { return JSON.parse(s.slice(i + 5).trim()); } catch (_) { return null; } };

const LIST_PS = String.raw`$ErrorActionPreference = 'SilentlyContinue'
$sid = (Get-Process -Id $PID).SessionId
$g = Get-Process | Where-Object { $_.SessionId -eq $sid -and $_.Id -ne $PID } | Group-Object ProcessName
$out = @(foreach ($x in $g) {
  $p = $x.Group | Sort-Object PrivateMemorySize64 -Descending | Select-Object -First 1
  $w = ($x.Group | Where-Object { $_.MainWindowTitle } | Select-Object -First 1).MainWindowTitle
  @{ name = [string]$x.Name; n = $x.Count; mb = [int](($x.Group | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB);
     title = [string]$w; desc = [string]$p.Description; company = [string]$p.Company;
     responding = -not (@($x.Group | Where-Object { $_.MainWindowHandle -ne 0 -and -not $_.Responding }).Count) }
})
$totalMB = [int]((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize / 1KB)
$freeMB = [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB)
"@@TF " + (@{ items = $out; totalMB = $totalMB; freeMB = $freeMB } | ConvertTo-Json -Compress -Depth 4)`;

async function list() {
  if (!WIN) return { supported: false };
  const r = await runPS(LIST_PS, 60000);
  const d = tail(r.out);
  if (!d) return { supported: true, error: r.err || "no data" };
  const items = (Array.isArray(d.items) ? d.items : [d.items]).filter((x) => x && x.name && !PROTECTED.has(String(x.name).toLowerCase()) && NAME_RE.test(x.name))
    .sort((a, b) => b.mb - a.mb).filter((x) => x.mb >= 40).slice(0, 14);
  LAST = new Set(items.map((x) => x.name.toLowerCase()));
  return { supported: true, items, totalMB: d.totalMB, freeMB: d.freeMB };
}

const CLOSE_PS = (name, force) => String.raw`$ErrorActionPreference = 'SilentlyContinue'
$sid = (Get-Process -Id $PID).SessionId
$n = '${name.replace(/'/g, "''")}'
function Mine { @(Get-Process -Name $n | Where-Object { $_.SessionId -eq $sid }) }
$before = Mine; $mb0 = [int](($before | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB)
if (-not $before.Count) { "@@TF " + (@{ was = 0; left = 0; freedMB = 0 } | ConvertTo-Json -Compress); exit }
${force
  ? "$before | Stop-Process -Force -ErrorAction SilentlyContinue"
  : "foreach ($p in $before) { if ($p.MainWindowHandle -ne 0) { [void]$p.CloseMainWindow() } }"}
$deadline = (Get-Date).AddSeconds(${force ? 6 : 10})
do { Start-Sleep -Milliseconds 500; $left = Mine } while ($left.Count -and (Get-Date) -lt $deadline)
$mb1 = [int](($left | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB)
"@@TF " + (@{ was = $before.Count; left = $left.Count; freedMB = [math]::Max(0, $mb0 - $mb1); hadWindow = [bool](@($before | Where-Object { $_.MainWindowHandle -ne 0 }).Count) } | ConvertTo-Json -Compress)`;

// Verdicts in the same vocabulary as the repairs: closed / partly / still running / not allowed.
async function close(name, force) {
  if (!WIN) return { state: "failed", code: "not_windows" };
  name = String(name || "");
  if (!NAME_RE.test(name) || PROTECTED.has(name.toLowerCase()) || !LAST.has(name.toLowerCase())) return { state: "failed", code: "proc_not_allowed", params: { name } };
  const r = await runPS(CLOSE_PS(name, !!force), 30000);
  const d = tail(r.out);
  if (!d) return { state: "failed", code: "proc_no_result", params: { name } };
  const freed = d.freedMB >= 1024 ? (d.freedMB / 1024).toFixed(1) + " GB" : d.freedMB + " MB";
  if (!d.was || !d.left) return { state: "fixed", code: force ? "proc_forced" : "proc_closed", params: { name, freed } };
  if (d.left < d.was) return { state: "partial", code: "proc_partly", params: { name, left: d.left, freed }, canForce: !force };
  // Still running: a program with no window can't be asked nicely; an elevated one can't be stopped from here.
  return { state: "failed", code: force ? "proc_refused" : (d.hadWindow ? "proc_still_running" : "proc_no_window"), params: { name }, canForce: !force };
}

module.exports = { list, close, _test: { LIST_PS, CLOSE_PS, PROTECTED } };

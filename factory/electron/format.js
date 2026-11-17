// TechFix — "Format a drive" + "TechFix rescue USB (bootable)".
//
// Formatting erases everything, so every step is defensive:
//   • Only USB / SD / MMC disks are ever listed or accepted — never the boot or system disk,
//     never a disk holding the Windows drive (C:).
//   • The page sends the disk number AND the disk's unique id + exact size it was shown; the
//     elevated script re-reads the disk and refuses if anything changed (another key plugged in,
//     numbers shuffled…).
//   • All values reach PowerShell through a JSON file, never pasted into the command text.
//   • One UAC prompt; the result comes back as JSON with the real file system, size and letter.
//
// File systems: FAT32 (any size up to 2 TB — Windows' own tools stop at 32 GB, so TechFix carries
// its own FAT32 writer, fat32.cs), exFAT, NTFS. Console / device presets set the right file system,
// cluster size, MBR partition table and starter folders.
//
// The rescue USB uses Ventoy (open source, GPLv3, downloaded from its official GitHub release and
// checked against its published SHA-256) so the key boots any PC; TechFix, its offline page and,
// optionally, Hiren's BootCD PE (a Windows rescue desktop) are put on it.

const { app, net } = require("electron");
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIN = process.platform === "win32";

function workDir() {
  const d = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "TechFix", "work");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function stampName(prefix, ext) { return path.join(workDir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`); }

function run(file, args, opt) {
  opt = opt || {};
  return new Promise((resolve) => {
    execFile(file, args, { timeout: opt.timeout || 60000, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, out, errOut) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: String(out || ""), err: String(errOut || "") });
    });
  });
}
function ps(script, timeoutMs) {
  const enc = Buffer.from("$ProgressPreference='SilentlyContinue';$ErrorActionPreference='SilentlyContinue';" + script, "utf16le").toString("base64");
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { timeout: timeoutMs || 60000 });
}
const jsonOf = (t, d) => { try { const v = JSON.parse(String(t || "").replace(/^﻿/, "").trim() || "null"); return v == null ? d : v; } catch (_) { return d; } };
const V = (state, code, params, extra) => Object.assign({ state, code, params: params || {} }, extra || {});

// ------------------------------------------------------------------------------------------
// Disks
// ------------------------------------------------------------------------------------------
const DISK_PS = `
$sys = $env:SystemDrive.TrimEnd(':')
$out = @()
foreach($d in @(Get-Disk)){
  $parts = @(Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue)
  $vols = @()
  foreach($p in $parts){
    if($p.DriveLetter -and [string]$p.DriveLetter -ne "\`0"){
      $v = Get-Volume -DriveLetter $p.DriveLetter -ErrorAction SilentlyContinue
      $vols += [pscustomobject]@{ letter=[string]$p.DriveLetter; label=[string]$v.FileSystemLabel; fs=[string]$v.FileSystem; size=[int64]$v.Size; free=[int64]$v.SizeRemaining }
    }
  }
  $letters = @($vols | ForEach-Object { $_.letter })
  $out += [pscustomobject]@{ number=[int]$d.Number; name=[string]$d.FriendlyName; bus=[string]$d.BusType; size=[int64]$d.Size;
    style=[string]$d.PartitionStyle; boot=[bool]$d.IsBoot; system=[bool]$d.IsSystem; offline=[bool]$d.IsOffline; readOnly=[bool]$d.IsReadOnly;
    uid=[string]$d.UniqueId; serial=([string]$d.SerialNumber).Trim(); vols=$vols; hasSys=($letters -contains $sys); parts=$parts.Count }
}
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress`;

const OK_BUS = ["USB", "SD", "MMC"];
function eligible(d) { return d && OK_BUS.includes(d.bus) && !d.boot && !d.system && !d.hasSys && d.size > 0; }

async function listDisks() {
  if (!WIN) return { supported: false };
  const r = await ps(DISK_PS, 60000);
  const all = jsonOf(r.out, []);
  const list = (Array.isArray(all) ? all : [all]).filter(Boolean);
  return {
    supported: true,
    disks: list.filter(eligible).map((d) => ({ number: d.number, name: d.name, bus: d.bus, size: d.size, style: d.style, uid: d.uid, readOnly: d.readOnly, vols: d.vols || [] })),
    readersEmpty: list.filter((d) => OK_BUS.includes(d.bus) && !d.size).length,
    hidden: list.filter((d) => !eligible(d)).length
  };
}

// ------------------------------------------------------------------------------------------
// Presets (what the page may ask for). Display text lives in the page; this table decides.
// ------------------------------------------------------------------------------------------
const ALL_FS = ["FAT32", "exFAT", "NTFS"];
const CLUSTERS = [0, 4096, 8192, 16384, 32768, 65536, 131072];
const P = (fsList, cluster, folders) => ({ fs: fsList, cluster: cluster || 0, folders: folders || [] });
const PRESETS = {
  universal: P(["FAT32", "exFAT"]),
  bigfiles: P(["exFAT", "FAT32", "NTFS"]),
  windows: P(["NTFS", "exFAT"]),
  camera: P(["auto", "FAT32", "exFAT"]),
  ps5: P(["exFAT", "FAT32"], 0, ["PS5/UPDATE"]),
  ps4: P(["exFAT", "FAT32"], 0, ["PS4/UPDATE"]),
  ps3: P(["FAT32"], 0, ["PS3/UPDATE", "PS3/SAVEDATA", "PS3/EXPORT/BACKUP"]),
  ps2: P(["FAT32", "exFAT"], 32768, ["CD", "DVD", "ART", "CFG", "CHT", "VMC", "THM", "APPS", "LNG", "POPS"]),
  psp: P(["FAT32"], 32768, ["PSP/GAME", "PSP/SAVEDATA", "ISO", "MUSIC", "PICTURE", "VIDEO"]),
  vita: P(["exFAT"]),
  switch: P(["FAT32", "exFAT"], 65536),
  switch2: P(["exFAT"]),
  "3ds": P(["FAT32"], 32768),
  wii: P(["FAT32"], 32768, ["apps", "wbfs"]),
  wiiu: P(["FAT32"], 32768, ["wiiu/apps"]),
  ds: P(["FAT32"], 32768),
  gamecube: P(["FAT32"], 32768, ["games"]),
  xbox: P(["NTFS", "exFAT"]),
  xbox360: P(["FAT32"], 32768),
  retro: P(["FAT32", "exFAT"], 32768, ["roms"]),
  steamdeck: P(["exFAT"]),
  custom: P(ALL_FS)
};

function cleanLabel(label, fsName) {
  let l = String(label || "").replace(/[^A-Za-z0-9 _\-]/g, "").trim();
  l = l.slice(0, fsName === "NTFS" ? 32 : 11);
  return fsName === "FAT32" ? l.toUpperCase() : l;
}

// ------------------------------------------------------------------------------------------
// Elevated runner: one UAC prompt, progress lines in a file, JSON result in another.
// ------------------------------------------------------------------------------------------
async function runElevated(scriptText, params, onProgress, timeoutMs) {
  const script = stampName("tf-elev", "ps1"), paramFile = stampName("tf-params", "json");
  const progress = stampName("tf-progress", "txt"), result = stampName("tf-result", "json");
  fs.writeFileSync(paramFile, JSON.stringify(Object.assign({}, params, { progressFile: progress, resultFile: result, workDir: workDir() })), "utf8");
  fs.writeFileSync(script, "﻿" + `param([string]$ParamFile)
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
$P = Get-Content -Raw -LiteralPath $ParamFile -Encoding UTF8 | ConvertFrom-Json
function Step([string]$s){ try { [IO.File]::AppendAllText($P.progressFile, $s + [Environment]::NewLine) } catch {} }
function Done($o){ [IO.File]::WriteAllText($P.resultFile, (ConvertTo-Json -InputObject $o -Depth 5 -Compress), [Text.Encoding]::UTF8) }
try {
${scriptText}
} catch { Done @{ ok=$false; code='fmt_error'; detail=[string]$_.Exception.Message } }
`, "utf8");
  let pos = 0;
  const timer = setInterval(() => {
    try {
      const t = fs.readFileSync(progress, "utf8");
      if (t.length < pos) pos = 0;
      for (const line of t.slice(pos).split(/\r?\n/).filter(Boolean)) onProgress && onProgress({ phase: "step", step: line.trim() });
      pos = t.length;
    } catch (_) {}
  }, 500);
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const launcher = `try { $p = Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',${q('"' + script + '"')},'-ParamFile',${q('"' + paramFile + '"')}; 'exit:' + $p.ExitCode } catch { 'cancelled' }`;
  const r = await ps(launcher, timeoutMs || 3 * 3600000);
  clearInterval(timer);
  let res = null;
  try { res = jsonOf(fs.readFileSync(result, "utf8"), null); } catch (_) {}
  for (const f of [script, paramFile, progress, result]) { try { fs.unlinkSync(f); } catch (_) {} }
  if (!res && /cancelled/.test(r.out)) return { ok: false, code: "cancelled" };
  return res || { ok: false, code: "fmt_no_result", detail: (r.out + r.err).trim().slice(-300) };
}

// Shared by format + rescue key: re-check the disk is the one the user picked, and is safe.
const VERIFY_PS = `
Step 'check'
$d = Get-Disk -Number ([int]$P.number) -ErrorAction SilentlyContinue
if(-not $d -or [string]$d.UniqueId -ne [string]$P.uid -or [int64]$d.Size -ne [int64]$P.size){ Done @{ ok=$false; code='fmt_changed' }; exit }
$sys = $env:SystemDrive.TrimEnd(':')
$hasSys = @(Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue | Where-Object { [string]$_.DriveLetter -eq $sys }).Count -gt 0
if($d.IsBoot -or $d.IsSystem -or $hasSys -or (@('USB','SD','MMC') -notcontains [string]$d.BusType)){ Done @{ ok=$false; code='fmt_refused' }; exit }
if($d.IsOffline){ Set-Disk -Number $d.Number -IsOffline $false -ErrorAction SilentlyContinue }
if($d.IsReadOnly){
  Set-Disk -Number $d.Number -IsReadOnly $false -ErrorAction SilentlyContinue
  $d = Get-Disk -Number $d.Number
  if($d.IsReadOnly){ Done @{ ok=$false; code='fmt_readonly' }; exit }
}
`;

const FORMAT_PS = VERIFY_PS + `
$n = [int]$P.number
Step 'clean'
$dp = Join-Path $P.workDir ('dp-' + [guid]::NewGuid().ToString('N') + '.txt')
$id = if($P.style -eq 'MBR'){ if($P.fs -eq 'FAT32'){ ' id=0c' } else { ' id=07' } } else { '' }
$lines = @("select disk $n", 'clean', $(if($P.style -eq 'GPT'){ 'convert gpt' } else { 'convert mbr' }), ('create partition primary' + $id), 'exit')
[IO.File]::WriteAllLines($dp, $lines, [Text.Encoding]::ASCII)
$dpo = (& diskpart.exe /s $dp 2>&1 | Out-String)
$dpc = $LASTEXITCODE
Remove-Item -LiteralPath $dp -Force -ErrorAction SilentlyContinue
if($dpc -ne 0){ Done @{ ok=$false; code='fmt_partition'; detail=($dpo.Trim() -split "\`n" | Select-Object -Last 3) -join ' ' }; exit }
Start-Sleep -Seconds 2
Update-HostStorageCache -ErrorAction SilentlyContinue
$part = Get-Partition -DiskNumber $n | Where-Object { $_.Type -ne 'Reserved' } | Sort-Object Size -Descending | Select-Object -First 1
if(-not $part){ Done @{ ok=$false; code='fmt_partition'; detail='no partition' }; exit }
Step 'format'
$vol = @($part.AccessPaths | Where-Object { $_ -like '\\\\?\\Volume*' })[0]
$big = ($P.fs -eq 'FAT32' -and [int64]$part.Size -gt 32GB)
if($big){
  Add-Type -TypeDefinition ([IO.File]::ReadAllText($P.fat32cs))
  $info = [TFFat32]::FormatVolume($vol.TrimEnd('\\'), [int]$P.cluster, [string]$P.label)
} else {
  $args2 = @{ Partition=$part; FileSystem=$P.fs; Force=$true; Confirm=$false }
  if([string]$P.label){ $args2.NewFileSystemLabel = [string]$P.label }
  if([int]$P.cluster -gt 0){ $args2.AllocationUnitSize = [int]$P.cluster }
  Format-Volume @args2 | Out-Null
}
Start-Sleep -Seconds 1
$part = Get-Partition -DiskNumber $n -PartitionNumber $part.PartitionNumber
if(-not $part.DriveLetter -or [string]$part.DriveLetter -eq "\`0"){
  $part | Add-PartitionAccessPath -AssignDriveLetter -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  $part = Get-Partition -DiskNumber $n -PartitionNumber $part.PartitionNumber
}
$L = [string]$part.DriveLetter
if($big -and [string]$P.label){ try { Set-Volume -DriveLetter $L -NewFileSystemLabel ([string]$P.label) -ErrorAction SilentlyContinue } catch {} }
Step 'folders'
foreach($f in @($P.folders)){ if($f){ New-Item -ItemType Directory -Force -Path ($L + ':\\' + ($f -replace '/','\\')) | Out-Null } }
$v = Get-Volume -DriveLetter $L
Step 'done'
Done @{ ok=$true; letter=$L; fs=[string]$v.FileSystem; size=[int64]$v.Size; free=[int64]$v.SizeRemaining; label=[string]$v.FileSystemLabel; cluster=[int]$v.AllocationUnitSize }
`;

async function findDisk(number, uid, size) {
  const l = await listDisks();
  return ((l && l.disks) || []).find((d) => d.number === number && d.uid === uid && d.size === size) || null;
}

async function format(payload, onProgress) {
  if (!WIN) return V("failed", "pc_unsupported");
  const number = Number(payload.number), uid = String(payload.uid || ""), size = Number(payload.size);
  const preset = PRESETS[String(payload.preset || "")];
  if (!preset || !Number.isInteger(number) || !uid || !size) return V("failed", "fmt_bad_request");
  const disk = await findDisk(number, uid, size);
  if (!disk) return V("failed", "fmt_changed");
  let fsName = String(payload.fs || preset.fs[0]);
  if (!preset.fs.includes(fsName)) return V("failed", "fmt_bad_request");
  if (fsName === "auto") fsName = size <= 32 * 1e9 * 1.075 ? "FAT32" : "exFAT"; // SD standard: SDHC ≤32 GB FAT32, SDXC exFAT
  if (!ALL_FS.includes(fsName)) return V("failed", "fmt_bad_request");
  let cluster = payload.cluster == null || payload.cluster === "" ? preset.cluster : Number(payload.cluster);
  if (!CLUSTERS.includes(cluster)) return V("failed", "fmt_bad_request");
  if (fsName === "FAT32" && cluster > 65536) cluster = 65536;
  if (fsName === "FAT32" && size > 2199023255552) return V("failed", "fmt_fat32_2tb");
  const style = payload.style === "GPT" ? "GPT" : "MBR";
  const label = cleanLabel(payload.label, fsName);
  // Electron reads its own files inside app.asar; PowerShell can't, so hand it a plain copy.
  const fat32cs = path.join(workDir(), "fat32.cs");
  try { fs.writeFileSync(fat32cs, fs.readFileSync(path.join(__dirname, "fat32.cs"), "utf8"), "utf8"); } catch (e) { return V("failed", "fmt_error", { detail: String(e.message || e) }); }
  const r = await runElevated(FORMAT_PS, { number, uid, size, fs: fsName, cluster, style, label, folders: preset.folders, fat32cs }, onProgress, 3 * 3600000);
  if (r.ok) return V("done", "fmt_done", { letter: r.letter, fs: r.fs, size: r.size, free: r.free, label: r.label, cluster: r.cluster }, { letter: r.letter });
  if (r.code === "cancelled") return V("cancelled", "cancelled");
  let code = r.code || "fmt_error";
  if (/TOO_SMALL/.test(r.detail || "")) code = "fmt_cluster_small";
  if (/TOO_MANY/.test(r.detail || "")) code = "fmt_cluster_big";
  if (/TOO_BIG/.test(r.detail || "")) code = "fmt_fat32_2tb";
  return V("failed", code, { detail: r.detail || "" });
}

// ------------------------------------------------------------------------------------------
// TechFix rescue USB (bootable, Ventoy)
// ------------------------------------------------------------------------------------------
async function fetchJson(url) {
  try { const r = await net.fetch(url, { cache: "no-store", headers: { "User-Agent": "TechFix" } }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
async function fetchText(url) {
  try { const r = await net.fetch(url, { cache: "no-store", headers: { "User-Agent": "TechFix" } }); return r.ok ? await r.text() : null; } catch (_) { return null; }
}
async function download(url, dest, onProgress, label) {
  try {
    const res = await net.fetch(url, { cache: "no-store", headers: { "User-Agent": "TechFix" } });
    if (!res.ok || !res.body) return { ok: false, error: "HTTP " + res.status };
    const total = Number(res.headers.get("content-length")) || 0;
    const tmp = dest + ".part";
    const out = fs.createWriteStream(tmp);
    const hash = crypto.createHash("sha256");
    const reader = res.body.getReader();
    let done = 0, last = 0;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      const b = Buffer.from(value);
      hash.update(b);
      if (!out.write(b)) await new Promise((r) => out.once("drain", r));
      done += b.length;
      if (onProgress && Date.now() - last > 300) { last = Date.now(); onProgress({ phase: "download", label, done, total }); }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    if (total && done !== total) { try { fs.unlinkSync(tmp); } catch (_) {} return { ok: false, error: "incomplete download" }; }
    try { fs.unlinkSync(dest); } catch (_) {}
    fs.renameSync(tmp, dest);
    return { ok: true, bytes: done, sha256: hash.digest("hex") };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

async function getVentoy(onProgress) {
  const rel = await fetchJson("https://api.github.com/repos/ventoy/Ventoy/releases/latest");
  if (!rel || !Array.isArray(rel.assets)) return { error: "ventoy_offline" };
  const zip = rel.assets.find((a) => /^ventoy-[\d.]+-windows\.zip$/i.test(a.name));
  const sums = rel.assets.find((a) => /sha256\.txt$/i.test(a.name));
  if (!zip) return { error: "ventoy_offline" };
  const dir = path.join(workDir(), "..", "ventoy");
  fs.mkdirSync(dir, { recursive: true });
  const zipFile = path.join(dir, zip.name);
  const dl = await download(zip.browser_download_url, zipFile, onProgress, "Ventoy " + (rel.tag_name || ""));
  if (!dl.ok) return { error: "ventoy_download", detail: dl.error };
  if (sums) {
    const txt = await fetchText(sums.browser_download_url);
    const line = (txt || "").split(/\r?\n/).find((l) => l.includes(zip.name));
    const want = line ? line.trim().split(/\s+/)[0].toLowerCase() : "";
    if (!want || want !== dl.sha256) { try { fs.unlinkSync(zipFile); } catch (_) {} return { error: "ventoy_checksum" }; }
  }
  const out = path.join(dir, zip.name.replace(/\.zip$/i, ""));
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (_) {}
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  await ps(`Expand-Archive -LiteralPath ${q(zipFile)} -DestinationPath ${q(out)} -Force`, 300000);
  try { fs.unlinkSync(zipFile); } catch (_) {}
  const find = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isFile() && e.name.toLowerCase() === "ventoy2disk.exe") return p;
      if (e.isDirectory() && depth < 3) { const f = find(p, depth + 1); if (f) return f; }
    }
    return null;
  };
  let exe = null;
  try { exe = find(out, 0); } catch (_) {}
  if (!exe) return { error: "ventoy_extract" };
  return { exe, version: rel.tag_name || "" };
}

const VENTOY_PS = VERIFY_PS + `
$n = [int]$P.number
Step 'ventoy'
$dir = Split-Path -Parent $P.exe
foreach($f in 'cli_log.txt','cli_done.txt','cli_percent.txt'){ Remove-Item -LiteralPath (Join-Path $dir $f) -Force -ErrorAction SilentlyContinue }
$a = @('VTOYCLI','/I',"/PhyDrive:$n")
if($P.gpt){ $a += '/GPT' }
if([string]$d.BusType -ne 'USB'){ $a += '/NOUSBCheck' }
$pr = Start-Process -FilePath $P.exe -ArgumentList $a -WorkingDirectory $dir -Wait -PassThru -WindowStyle Hidden
$log = ''; try { $log = [IO.File]::ReadAllText((Join-Path $dir 'cli_log.txt')) } catch {}
$doneTxt = ''; try { $doneTxt = ([IO.File]::ReadAllText((Join-Path $dir 'cli_done.txt'))).Trim() } catch {}
Start-Sleep -Seconds 3
Update-HostStorageCache -ErrorAction SilentlyContinue
$part = Get-Partition -DiskNumber $n -ErrorAction SilentlyContinue | Sort-Object Size -Descending | Select-Object -First 1
$vol = if($part){ Get-Volume -Partition $part -ErrorAction SilentlyContinue } else { $null }
if(-not $vol -or [string]$vol.FileSystemLabel -ne 'Ventoy' -or $log -match 'CLI FAILED' -or $doneTxt -eq '1'){
  $tail = (($log -split "\`n") | Where-Object { $_ -match 'ERROR|FAIL' } | Select-Object -Last 2) -join ' '
  Done @{ ok=$false; code='ventoy_failed'; detail=$tail }; exit
}
if(-not $part.DriveLetter -or [string]$part.DriveLetter -eq "\`0"){
  $part | Add-PartitionAccessPath -AssignDriveLetter -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  $part = Get-Partition -DiskNumber $n -PartitionNumber $part.PartitionNumber
}
Step 'done'
Done @{ ok=$true; letter=[string]$part.DriveLetter }
`;

const HBCD_URL = "https://www.hirensbootcd.org/files/HBCD_PE_x64.iso";

async function copyDir(src, dst) {
  await fs.promises.mkdir(dst, { recursive: true });
  for (const e of await fs.promises.readdir(src, { withFileTypes: true })) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(a, b); else await fs.promises.copyFile(a, b);
  }
}

// Latest Memtest86+ x86-64 ISO from memtest.org, checked against the published SHA-256.
async function addMemtest(root, onProgress) {
  const home = await fetchText("https://memtest.org/");
  const m = /download\/v([\d.]+)\/mt86plus_\1_x86_64\.iso\.zip/.exec(home || "");
  const ver = m ? m[1] : "9.00";
  const base = `https://memtest.org/download/v${ver}/`;
  const zipName = `mt86plus_${ver}_x86_64.iso.zip`;
  const tmp = path.join(workDir(), zipName);
  const dl = await download(base + zipName, tmp, onProgress, "Memtest86+ " + ver);
  if (!dl.ok) return { ok: false, error: dl.error };
  const sums = await fetchText(base + "sha256sum.txt");
  const line = (sums || "").split(/\r?\n/).find((l) => l.includes(zipName));
  if (!line || line.trim().split(/\s+/)[0].toLowerCase() !== dl.sha256) { try { fs.unlinkSync(tmp); } catch (_) {} return { ok: false, error: "checksum" }; }
  const out = path.join(workDir(), "memtest-" + Date.now());
  const q = (x) => "'" + String(x).replace(/'/g, "''") + "'";
  await ps(`Expand-Archive -LiteralPath ${q(tmp)} -DestinationPath ${q(out)} -Force`, 120000);
  try { fs.unlinkSync(tmp); } catch (_) {}
  let iso = null;
  try { iso = fs.readdirSync(out).find((f) => /\.iso$/i.test(f)); } catch (_) {}
  if (!iso) return { ok: false, error: "no iso in zip" };
  try { fs.copyFileSync(path.join(out, iso), path.join(root, `Memtest86plus-${ver}.iso`)); } catch (e) { return { ok: false, error: String(e.message || e) }; }
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (_) {}
  return { ok: true, version: ver };
}

async function rescueKey(payload, onProgress, cfg) {
  if (!WIN) return V("failed", "pc_unsupported");
  const number = Number(payload.number), uid = String(payload.uid || ""), size = Number(payload.size);
  const disk = await findDisk(number, uid, size);
  if (!disk) return V("failed", "fmt_changed");
  const withHbcd = !!payload.hbcd;
  if (size < (withHbcd ? 7.5e9 : 1.5e9)) return V("failed", "rescue_too_small", { need: withHbcd ? 8e9 : 2e9 });
  onProgress && onProgress({ phase: "step", step: "ventoy-download" });
  const v = await getVentoy(onProgress);
  if (v.error) return V("failed", v.error, { detail: v.detail || "" });
  const r = await runElevated(VENTOY_PS, { number, uid, size, exe: v.exe, gpt: payload.style === "GPT" }, onProgress, 3600000);
  if (r.code === "cancelled") return V("cancelled", "cancelled");
  if (!r.ok) return V("failed", r.code || "ventoy_failed", { detail: r.detail || "" });
  const root = r.letter + ":\\";
  const lines = [];
  // TechFix itself: installers (they keep themselves updated) + the offline page for any browser.
  onProgress && onProgress({ phase: "step", step: "techfix" });
  const tf = path.join(root, "TechFix");
  try {
    fs.mkdirSync(tf, { recursive: true });
    const www = app.isPackaged ? path.join(process.resourcesPath, "www") : path.join(__dirname, "www");
    if (fs.existsSync(www)) await copyDir(www, path.join(tf, "TechFix hors-ligne (offline)"));
  } catch (e) { lines.push({ name: "TechFix", code: "pc_copy_failed_line", detail: String(e.message || e) }); }
  const feed = process.env.MB_UPDATE_URL || (cfg && cfg.update) || "";
  const info = feed ? await fetchJson(feed + (feed.includes("?") ? "&" : "?") + "t=" + Date.now()) : null;
  if (info) {
    for (const [url, name] of [[info.exe, "TechFix-Setup.exe"], [info.apk, "TechFix.apk"]]) {
      if (!url) continue;
      const d = await download(url, path.join(tf, name), onProgress, name);
      if (!d.ok) lines.push({ name, code: "pc_copy_failed_line", detail: d.error });
    }
  }
  try {
    fs.writeFileSync(path.join(tf, "LISEZMOI - README.txt"), [
      "CLÉ DE SECOURS TECHFIX / TECHFIX RESCUE USB", "",
      "FR — Pour démarrer un PC sur cette clé : branche-la, allume le PC et appuie sur la touche du menu de démarrage",
      "     (F12, F11, F10, F9, F8 ou Échap selon la marque), puis choisis la clé USB. Le menu Ventoy affiche les systèmes",
      "     de secours présents (fichiers .iso à la racine de la clé). Hiren's BootCD PE ouvre un bureau Windows de secours :",
      "     ouvre ce dossier TechFix et « TechFix hors-ligne (offline) › index.html » dans le navigateur.",
      "     Memtest86+ teste la mémoire (RAM) sans Windows : laisse-le faire au moins 4 passes ; une seule erreur = barrette défectueuse.",
      "     Tu peux ajouter d'autres fichiers .iso (Windows, Linux…) : copie-les simplement à la racine de la clé.",
      "     Sur un PC qui fonctionne : TechFix-Setup.exe installe TechFix (il se met ensuite à jour tout seul).",
      "EN — To boot a PC from this key: plug it in, power on and press the boot-menu key (F12, F11, F10, F9, F8 or Esc",
      "     depending on the brand), then pick the USB key. Ventoy lists the rescue systems (.iso files at the key's root).",
      "     Hiren's BootCD PE opens a Windows rescue desktop: open this TechFix folder and the offline page in the browser.",
      "     Memtest86+ tests the RAM (memory) without Windows: let it run at least 4 passes; any error means a faulty stick.",
      "     Add any other .iso (Windows, Linux…) by copying it to the root of the key.",
      "     On a working PC: TechFix-Setup.exe installs TechFix (it then keeps itself up to date).",
      "", "Ventoy " + (v.version || "") + " — https://www.ventoy.net (GPLv3)", ""
    ].join("\r\n"), "utf8");
  } catch (_) {}
  // Memtest86+ (GPLv2): tests the RAM without Windows — shows up in the Ventoy menu.
  if (payload.memtest !== false) {
    onProgress && onProgress({ phase: "step", step: "memtest" });
    const m = await addMemtest(root, onProgress);
    if (!m.ok) lines.push({ name: "Memtest86+", code: "rescue_memtest_failed", detail: m.error || "" });
  }
  // Optional: Hiren's BootCD PE (free Windows 11 PE rescue desktop, about 3 GB).
  if (withHbcd) {
    onProgress && onProgress({ phase: "step", step: "hbcd" });
    const d = await download(HBCD_URL, path.join(root, "HBCD_PE_x64.iso"), onProgress, "Hiren's BootCD PE");
    if (!d.ok) lines.push({ name: "HBCD_PE_x64.iso", code: "rescue_hbcd_failed", detail: d.error });
  }
  return V(lines.length ? "partial" : "done", "rescue_done", { letter: r.letter, ventoy: v.version || "" }, { lines, letter: r.letter });
}

module.exports = { listDisks, format, rescueKey, PRESETS, _test: { FORMAT_PS, VENTOY_PS, VERIFY_PS, DISK_PS, cleanLabel } };

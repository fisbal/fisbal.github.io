// Keeps an installed MartinB app up to date by itself (Windows and Mac).
// At start-up and every 6 hours it reads update.json from the app's rolling release. When a newer build exists it
// downloads it in the background; the gold bar then shows "Redémarrer pour mettre à jour". The update installs
// when you click that button, or by itself when you close the app. Your data is kept.
//   Windows: the -Setup.exe runs silently (/S) into the same folder, then reopens the app if asked.
//   Mac: the new app from the .dmg replaces this one in place, then reopens if asked.
const { app, net } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const SIX_HOURS = 6 * 60 * 60 * 1000;

class Updater {
  constructor(cfg, onState) {
    this.cfg = cfg;
    this.onState = onState;        // (state) => void, state: { status: "ready", version } | { status: "none" }
    this.feed = process.env.MB_UPDATE_URL || cfg.update || "";
    this.auto = process.env.MB_UPDATE_AUTO === "1";   // test mode: apply as soon as downloaded
    this.dir = path.join(app.getPath("userData"), "updates");
    this.logFile = path.join(app.getPath("userData"), "update.log");
    this.ready = null;             // { file, build, version }
    this.busy = false;
    this.applying = false;
  }

  log(msg) {
    try { fs.appendFileSync(this.logFile, `${new Date().toISOString()} ${msg}\n`); } catch (e) { }
  }

  build() {
    const m = /^\d+\.\d+\.(\d+)/.exec(app.getVersion());
    return m ? parseInt(m[1], 10) : 0;
  }

  start() {
    this.log(`started version ${app.getVersion()} (build ${this.build()}) ${process.platform}`);
    if (!this.feed || !app.isPackaged) return;
    this.cleanup();
    setTimeout(() => this.check(), 8000);
    setInterval(() => this.check(), SIX_HOURS);
  }

  cleanup() {
    // Remove old downloads; keep nothing older than the running build.
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch (e) { }
  }

  bundlePath() {
    return path.resolve(process.execPath, "..", "..", "..");
  }

  // Mac: the app can only replace itself where it may write (Applications, not the read-only .dmg).
  canInstall() {
    if (process.platform !== "darwin") return true;
    try { fs.accessSync(path.dirname(this.bundlePath()), fs.constants.W_OK); return this.bundlePath().endsWith(".app"); }
    catch (e) { return false; }
  }

  async check() {
    if (this.busy || this.ready || this.applying) return;
    if (!this.canInstall()) { this.log("cannot update here (read-only location): " + this.bundlePath()); return; }
    this.busy = true;
    try {
      const res = await net.fetch(this.feed + (this.feed.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("feed " + res.status);
      const info = await res.json();
      const mine = this.build();
      if (!(info.build > mine)) { this.log(`up to date (build ${mine}, latest ${info.build})`); return; }
      const url = process.platform === "darwin" ? info.dmg : info.exe;
      if (!url) throw new Error("no file for " + process.platform);
      this.log(`new build ${info.build} found, downloading ${url}`);
      fs.mkdirSync(this.dir, { recursive: true });
      const file = path.join(this.dir, `${info.build}-` + path.basename(new URL(url).pathname));
      const dl = await net.fetch(url, { cache: "no-store" });
      if (!dl.ok) throw new Error("download " + dl.status);
      const data = Buffer.from(await dl.arrayBuffer());
      if (info.size && data.length !== info.size) throw new Error(`size ${data.length} != ${info.size}`);
      if (data.length < 1024 * 1024) throw new Error("file too small");
      fs.writeFileSync(file, data);
      this.ready = { file, build: info.build, version: info.version || "1.0." + info.build };
      this.log(`downloaded build ${info.build} (${data.length} bytes)`);
      this.onState({ status: "ready", version: this.ready.version });
      if (this.auto) {
        // Test mode applies once; the reopened app must not loop on the test feed.
        const done = path.join(app.getPath("userData"), "update-test-done");
        if (!fs.existsSync(done)) { fs.writeFileSync(done, String(info.build)); if (this.apply(true)) app.quit(); }
      }
    } catch (e) {
      this.log("check failed: " + e.message);
    } finally {
      this.busy = false;
    }
  }

  // Installs the downloaded update. relaunch: reopen the app afterwards. Returns true if the app should now quit.
  apply(relaunch) {
    if (!this.ready || this.applying) return false;
    this.applying = true;
    const { file, build } = this.ready;
    this.log(`applying build ${build} (relaunch=${relaunch})`);
    try {
      if (process.platform === "win32") {
        const args = ["/S"];
        if (relaunch) args.push("--force-run");
        // A small script waits until this app has fully closed, runs the installer silently (up to 3 tries:
        // Windows can stop an installer with a transient error) and notes the result in update.log.
        const ps = (v) => "'" + String(v).replace(/'/g, "''") + "'";
        const script = path.join(os.tmpdir(), `mb-update-${process.pid}.ps1`);
        fs.writeFileSync(script, "\ufeff" + [
          `$log = ${ps(this.logFile)}`,
          `function Note($m) { Add-Content -LiteralPath $log -Value ((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') + ' ' + $m) }`,
          `Note 'windows helper started'`,
          `try { Wait-Process -Id ${process.pid} -Timeout 60 -ErrorAction Stop } catch { }`,
          `Start-Sleep -Seconds 2`,
          `$code = -1`,
          `foreach ($i in 1..3) {`,
          `  $p = Start-Process -FilePath ${ps(file)} -ArgumentList ${args.map(ps).join(",")} -PassThru`,
          `  $p.WaitForExit()`,
          `  $code = $p.ExitCode`,
          `  if ($code -eq 0) { break }`,
          `  Start-Sleep -Seconds 3`,
          `}`,
          `Note ('windows installer finished exit=' + $code)`,
          `Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue`
        ].join("\r\n"), "utf8");
        spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script],
          { detached: true, stdio: "ignore", windowsHide: true }).unref();
      } else if (process.platform === "darwin") {
        const bundle = this.bundlePath();
        if (!bundle.endsWith(".app")) throw new Error("not inside an .app: " + bundle);
        fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
        const script = path.join(os.tmpdir(), `mb-update-${process.pid}.sh`);
        const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
        fs.writeFileSync(script, [
          "#!/bin/bash",
          `LOG=${q(this.logFile)}`,
          `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
          `MNT=$(mktemp -d /tmp/mbupd.XXXXXX)`,
          `hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$MNT" ${q(file)} >/dev/null || { echo "$(date -u +%FT%TZ) mount failed" >>"$LOG"; exit 1; }`,
          `NEW=$(ls -d "$MNT"/*.app | head -1)`,
          `if [ -z "$NEW" ]; then hdiutil detach "$MNT" -quiet; echo "$(date -u +%FT%TZ) no app in dmg" >>"$LOG"; exit 1; fi`,
          `rm -rf ${q(bundle + ".new")}`,
          `ditto "$NEW" ${q(bundle + ".new")} && rm -rf ${q(bundle)} && mv ${q(bundle + ".new")} ${q(bundle)}`,
          `RC=$?`,
          `hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -force -quiet`,
          `xattr -dr com.apple.quarantine ${q(bundle)} 2>/dev/null`,
          `echo "$(date -u +%FT%TZ) mac replace finished rc=$RC" >>"$LOG"`,
          relaunch ? `open ${q(bundle)}` : "true",
          `rm -f "$0"`
        ].join("\n") + "\n", { mode: 0o755 });
        spawn("/bin/bash", [script], { detached: true, stdio: "ignore" }).unref();
      } else {
        throw new Error("unsupported platform");
      }
      return true;
    } catch (e) {
      this.log("apply failed: " + e.message);
      this.applying = false;
      return false;
    }
  }
}

module.exports = { Updater };

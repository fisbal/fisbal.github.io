// MartinB app shell for Windows.
// A 36px gold title bar (minimize / maximize / close, drawn by bar.html) sits above the app, which runs untouched in its own view, offline from resources/www or from its web address.
const { app, BrowserWindow, WebContentsView, Menu, protocol, net, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { Updater } = require("./updater");

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "mb-config.json"), "utf8"));
// Opt-in native bridge (real OS diagnostics + fixes) for the one app that declares it in
// apps.json (`electron.diagnostics`, wired through by build.py). Every other MartinB app
// has no such key in its mb-config.json, so `diagnostics` is undefined/require never runs
// and this shell behaves exactly as before for them — same preload-less, sandboxed view.
const diagnostics = cfg.diagnostics ? require("./diagnostics") : null;
// Same opt-in: "Connect a device" (phones over ADB, TechFix on a USB key, remote help).
const connect = cfg.diagnostics ? require("./connect") : null;
if (connect) connect.init(cfg);
// Same opt-in: automatic mode (background checks, safe auto-repairs, nightly maintenance task).
const auto = cfg.diagnostics && process.platform === "win32" ? require("./auto") : null;
const START_HIDDEN = !!(auto && auto.startedHidden());
const BAR = 36;
const MAC = process.platform === "darwin";
const LOCAL = !cfg.url;
const WWW = app.isPackaged ? path.join(process.resourcesPath, "www") : path.join(__dirname, "www");
const HOME = LOCAL ? "app://local/" + (cfg.entry || "index.html") : cfg.url;
const HOME_ORIGIN = new URL(HOME).origin;

// "app://local/..." behaves like a real website, so storage, fetch() of the app's own files and modules all work.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let view = null;
let updateState = { status: "none" };
const updater = new Updater(cfg, (state) => {
  updateState = state;
  if (win) win.webContents.send("mb-update-state", state);
  // TechFix sitting in the tray: install right away and reopen hidden, so it keeps updating itself.
  if (state.status === "ready" && auto && auto.keepInTray() && win && !win.isVisible()) {
    auto.markHiddenRestart();
    if (updater.apply(true)) { app.isQuitting = true; app.quit(); }
  }
});
function showWin() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function layout() {
  if (!win || !view) return;
  const [w, h] = win.getContentSize();
  const top = win.isFullScreen() ? 0 : BAR;
  view.setBounds({ x: 0, y: top, width: w, height: Math.max(0, h - top) });
}

function isInside(url) {
  try { return new URL(url).origin === HOME_ORIGIN; } catch (e) { return false; }
}

function createWindow() {
  win = new BrowserWindow({
    width: cfg.width || 1280,
    height: cfg.height || 860,
    minWidth: 420,
    minHeight: 360,
    show: false,
    title: cfg.name,
    backgroundColor: "#0B0A08",
    icon: path.join(__dirname, "icon.png"),
    titleBarStyle: "hidden",
    // On a Mac the native red / yellow / green buttons sit inside the gold bar instead of drawn ones.
    ...(MAC ? { trafficLightPosition: { x: 12, y: 11 } } : {}),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, "preload.js") }
  });
  win.loadFile(path.join(__dirname, "bar.html"), { query: { name: cfg.name, platform: process.platform } });

  view = new WebContentsView({
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      // Only this one app's view gets a preload, and it exposes exactly three
      // IPC calls (scan / security / listFixes / fix) — see diagnostics-preload.js.
      ...(diagnostics ? { preload: path.join(__dirname, "diagnostics-preload.js") } : {})
    }
  });
  view.setBackgroundColor(cfg.bg || "#0B0A08");
  win.contentView.addChildView(view);
  layout();

  const wc = view.webContents;
  wc.loadURL(HOME);

  // Links to other sites open in the normal browser; the app itself stays in its window.
  wc.setWindowOpenHandler(({ url }) => {
    if (isInside(url)) { wc.loadURL(url); } else { shell.openExternal(url); }
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!isInside(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  // Full screen: F11, or when the app asks for it (games, video). The bar hides while in full screen.
  wc.on("enter-html-full-screen", () => win.setFullScreen(true));
  wc.on("leave-html-full-screen", () => win.setFullScreen(false));
  wc.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === "Escape" && win.isFullScreen()) { win.setFullScreen(false); }
    if (input.control && input.key.toLowerCase() === "r") { wc.reload(); e.preventDefault(); }
  });
  wc.on("page-title-updated", (e, title) => win.setTitle(cfg.name));

  const sendState = () => { if (win) win.webContents.send("mb-window-state", win.isMaximized() ? "maximized" : "normal"); };
  win.on("resize", layout);
  win.on("maximize", sendState);
  win.on("unmaximize", sendState);
  win.on("enter-full-screen", layout);
  win.on("leave-full-screen", layout);
  win.on("maximize", layout);
  win.on("unmaximize", layout);
  win.once("ready-to-show", () => { if (!START_HIDDEN) win.show(); });
  // Automatic mode with "keep watching in the background": closing hides TechFix to the tray.
  win.on("close", (e) => { if (auto && auto.keepInTray() && !app.isQuitting && !auto.quitting) { e.preventDefault(); win.hide(); } });
  win.webContents.on("did-finish-load", () => win.webContents.send("mb-update-state", updateState));
  win.on("closed", () => { win = null; view = null; });
}

// Title-bar buttons drawn by the bar page itself (used when Windows does not draw its own).
ipcMain.on("mb-window", (e, action) => {
  if (!win || e.sender !== win.webContents) return;
  if (action === "minimize") win.minimize();
  if (action === "maximize") { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
  if (action === "close") win.close();
  // "Redémarrer pour mettre à jour" in the gold bar: install the downloaded version now and reopen.
  if (action === "update" && updater.apply(true)) app.quit();
});

// Native diagnostics bridge — registered only for the app(s) that opted in (see `diagnostics`
// above). Each handler checks the call came from this window's own content view, same pattern
// as the "mb-window" guard above, so nothing else in the app (or another window) could reach it.
if (diagnostics) {
  const fromOurView = (e) => !!view && e.sender === view.webContents;
  ipcMain.handle("techfix:scan", async (e) => {
    if (!fromOurView(e)) return { supported: false, error: "unauthorized" };
    return diagnostics.scan();
  });
  ipcMain.handle("techfix:security", async (e) => {
    if (!fromOurView(e)) return { supported: false, error: "unauthorized" };
    return diagnostics.security();
  });
  ipcMain.handle("techfix:fixes", async (e) => {
    if (!fromOurView(e)) return [];
    return diagnostics.listFixes();
  });
  ipcMain.handle("techfix:fix", async (e, id) => {
    if (!fromOurView(e)) return { ok: false, message: "unauthorized" };
    return diagnostics.fix(String(id || ""));
  });
  // A whole repair session: one UAC prompt, live progress, a real verdict per step.
  ipcMain.handle("techfix:fixPlan", async (e, ids) => {
    if (!fromOurView(e)) return [];
    const list = Array.isArray(ids) ? ids.slice(0, 20).map(String) : [];
    return diagnostics.fixPlan(list, (ev) => { try { if (!e.sender.isDestroyed()) e.sender.send("techfix:fix-progress", ev); } catch (_) {} });
  });
  // "Connect a device": one channel, a fixed set of operations (see connect.js).
  ipcMain.handle("techfix:auto", async (e, op, payload) => {
    if (!fromOurView(e)) return { error: "unauthorized" };
    if (!auto) return { supported: false };
    if (op === "get") return Object.assign({ supported: true }, auto.publicState());
    if (op === "set") return Object.assign({ supported: true }, await auto.setSettings(payload && typeof payload === "object" ? payload : {}));
    if (op === "check") return auto.checkNow("manual");
    if (op === "last") return auto.lastResult();
    return { error: "unknown" };
  });
  // "Close a program": the user's heaviest programs, closed normally or (confirmed) forced.
  ipcMain.handle("techfix:proc", async (e, op, payload) => {
    if (!fromOurView(e)) return { error: "unauthorized" };
    const procs = require("./procs");
    if (op === "list") return procs.list();
    if (op === "close") return procs.close(payload && payload.name, !!(payload && payload.force));
    return { error: "unknown" };
  });
  ipcMain.handle("techfix:connect", async (e, op, payload) => {
    if (!fromOurView(e)) return { error: "unauthorized" };
    const send = (ev) => { try { if (!e.sender.isDestroyed()) e.sender.send("techfix:connect-progress", Object.assign({ op: String(op) }, ev)); } catch (_) {} };
    return connect.handle(String(op || ""), payload && typeof payload === "object" ? payload : {}, send);
  });
}

// Closing the app installs a downloaded update quietly, so the next start is the new version.
app.on("before-quit", () => {
  app.isQuitting = true;
  if (connect) connect.shutdown();
  if (updater.ready && !updater.applying) updater.apply(false);
});

app.on("second-instance", () => {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const u = new URL(request.url);
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(WWW, p));
    if (!file.startsWith(WWW) || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Mac needs a menu for Cmd+Q, copy / paste and the Window menu; Windows has none.
  Menu.setApplicationMenu(MAC ? Menu.buildFromTemplate([
    { label: cfg.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
    { role: "editMenu" },
    { label: "Affichage", submenu: [{ label: "Recharger", accelerator: "Cmd+R", click: () => view && view.webContents.reload() }, { role: "togglefullscreen" }] },
    { role: "windowMenu" }
  ]) : null);
  createWindow();
  updater.start();
  if (auto) auto.init({ diagnostics, repair: require("./repair"), getWin: () => win, showWin,
    send: (ch, d) => { try { if (view && !view.webContents.isDestroyed()) view.webContents.send(ch, d); } catch (_) {} } });
});

app.on("window-all-closed", () => app.quit());

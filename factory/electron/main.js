// MartinB app shell for Windows.
// A 36px gold title bar (real Windows minimize / maximize / close buttons, drawn by Windows in MartinB colours)
// sits above the app, which runs untouched in its own view, offline from resources/www or from its web address.
const { app, BrowserWindow, WebContentsView, Menu, protocol, net, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "mb-config.json"), "utf8"));
const BAR = 36;
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
    titleBarOverlay: { color: "#0B0A08", symbolColor: "#D4AD62", height: BAR },
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, "bar.html"), { query: { name: cfg.name } });

  view = new WebContentsView({
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
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

  win.on("resize", layout);
  win.on("enter-full-screen", layout);
  win.on("leave-full-screen", layout);
  win.on("maximize", layout);
  win.on("unmaximize", layout);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => { win = null; view = null; });
}

app.on("second-instance", () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
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
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => app.quit());

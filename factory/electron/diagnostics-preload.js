// Narrow native bridge for the app's own content view — only attached when
// mb-config.json has diagnostics:true (TechFix today). Exposes exactly
// four calls, nothing else: a real OS scan, a security audit, a list of
// available fixes with their exact commands, and running one fix (by id from
// a fixed table) that the renderer already confirmed.
// No direct Node/fs/child_process access ever reaches the page itself.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("techfixNative", {
  scan: () => ipcRenderer.invoke("techfix:scan"),
  security: () => ipcRenderer.invoke("techfix:security"),
  listFixes: () => ipcRenderer.invoke("techfix:fixes"),
  fix: (id) => ipcRenderer.invoke("techfix:fix", id),
  // Runs several fixes as one session (one UAC prompt) and reports each step as it finishes.
  fixPlan: (ids) => ipcRenderer.invoke("techfix:fixPlan", ids),
  onFixProgress: (cb) => {
    const h = (_e, d) => { try { cb(d); } catch (_) {} };
    ipcRenderer.on("techfix:fix-progress", h);
    return () => ipcRenderer.removeListener("techfix:fix-progress", h);
  },
  // Automatic mode: get / set the level, check now, last background result.
  auto: (op, payload) => ipcRenderer.invoke("techfix:auto", op, payload),
  onAuto: (cb) => {
    const chans = ["techfix:auto-state", "techfix:auto-result", "techfix:auto-open"];
    const hs = chans.map((c) => { const h = (_e, d) => { try { cb(c.replace("techfix:auto-", ""), d); } catch (_) {} }; ipcRenderer.on(c, h); return [c, h]; });
    return () => hs.forEach(([c, h]) => ipcRenderer.removeListener(c, h));
  },
  // "Connect a device": phones over ADB, TechFix on a USB key, remote help. Fixed operations only.
  connect: (op, payload) => ipcRenderer.invoke("techfix:connect", op, payload),
  onConnectProgress: (cb) => {
    const h = (_e, d) => { try { cb(d); } catch (_) {} };
    ipcRenderer.on("techfix:connect-progress", h);
    return () => ipcRenderer.removeListener("techfix:connect-progress", h);
  }
});

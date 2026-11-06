// Narrow native bridge for the app's own content view — only attached when
// mb-config.json has diagnostics:true (TechFix today). Exposes exactly
// three calls, nothing else: a real OS scan, a list of available fixes with
// their exact commands, and running one fix the renderer already confirmed.
// No direct Node/fs/child_process access ever reaches the page itself.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("techfixNative", {
  scan: () => ipcRenderer.invoke("techfix:scan"),
  listFixes: () => ipcRenderer.invoke("techfix:fixes"),
  fix: (id) => ipcRenderer.invoke("techfix:fix", id)
});

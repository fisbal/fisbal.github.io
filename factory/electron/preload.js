// Gives the title bar page its window actions (minimize, maximize, close, install update), nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mbWindow", {
  minimize: () => ipcRenderer.send("mb-window", "minimize"),
  maximize: () => ipcRenderer.send("mb-window", "maximize"),
  close: () => ipcRenderer.send("mb-window", "close"),
  update: () => ipcRenderer.send("mb-window", "update"),
  onUpdate: (fn) => ipcRenderer.on("mb-update-state", (_e, state) => fn(state)),
  onState: (fn) => ipcRenderer.on("mb-window-state", (_e, state) => fn(state))
});

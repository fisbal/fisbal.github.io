// Gives the title bar page three actions on its own window, nothing else.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mbWindow", {
  minimize: () => ipcRenderer.send("mb-window", "minimize"),
  maximize: () => ipcRenderer.send("mb-window", "maximize"),
  close: () => ipcRenderer.send("mb-window", "close"),
  onState: (fn) => ipcRenderer.on("mb-window-state", (_e, state) => fn(state))
});

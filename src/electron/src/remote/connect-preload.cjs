// Preload minimal de la fenêtre de choix « Local / Serveur distant ».
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('geneoappConnect', {
  getState: () => ipcRenderer.invoke('geneoapp:remote:state'),
  test: (values) => ipcRenderer.invoke('geneoapp:remote:test', values),
  connect: (values) => ipcRenderer.invoke('geneoapp:remote:connect', values),
  useLocal: () => ipcRenderer.invoke('geneoapp:remote:local'),
});

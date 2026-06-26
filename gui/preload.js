'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mad', {
  getConfig:    ()     => ipcRenderer.invoke('get-config'),
  selectFolder: (dir)  => ipcRenderer.invoke('select-folder', dir),
  selectFiles:  (dir)  => ipcRenderer.invoke('select-files', dir),
  runTool:      (opts) => ipcRenderer.invoke('run-tool', opts),
  saveDialog:   (opts) => ipcRenderer.invoke('save-dialog', opts),
  writeResult:  (opts) => ipcRenderer.invoke('write-result', opts),
});

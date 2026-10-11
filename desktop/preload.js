'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  searchTikTokUser: (username) => ipcRenderer.invoke('tiktok:search', username),
  connectTikTok: (username) => ipcRenderer.invoke('tiktok:connect', username),
  disconnectTikTok: () => ipcRenderer.invoke('tiktok:disconnect'),
  simulateEvent: (type, payload) => ipcRenderer.invoke('tiktok:simulate', type, payload),

  controlTimer: (action, seconds) => ipcRenderer.invoke('timer:control', action, seconds),
  clearJar: () => ipcRenderer.invoke('jar:clear'),
  openOverlayInBrowser: (name) => ipcRenderer.invoke('overlay:open', name),

  onTikTokStatus: (cb) => {
    const sub = (evt, data) => cb(data);
    ipcRenderer.on('tiktok:status', sub);
    return () => ipcRenderer.removeListener('tiktok:status', sub);
  },
  onTikTokEvent: (cb) => {
    const sub = (evt, data) => cb(data);
    ipcRenderer.on('tiktok:event', sub);
    return () => ipcRenderer.removeListener('tiktok:event', sub);
  },

  // App Updater APIs
  getVersion: () => ipcRenderer.invoke('updater:get-version'),
  checkForUpdates: (feedUrl) => ipcRenderer.invoke('updater:check', feedUrl),
  downloadUpdate: (updateInfo) => ipcRenderer.invoke('updater:download', updateInfo),
  installUpdate: (updateInfo) => ipcRenderer.invoke('updater:install', updateInfo),
  selectLocalUpdateFile: () => ipcRenderer.invoke('updater:select-file'),
  relaunchApp: () => ipcRenderer.invoke('updater:relaunch'),
  onUpdateProgress: (cb) => {
    const sub = (evt, data) => cb(data);
    ipcRenderer.on('updater:progress', sub);
    return () => ipcRenderer.removeListener('updater:progress', sub);
  }
});

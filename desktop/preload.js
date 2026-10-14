'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  onSettingsLoaded: (cb) => {
    const sub = (evt, data) => cb(data);
    ipcRenderer.on('settings:loaded', sub);
    return () => ipcRenderer.removeListener('settings:loaded', sub);
  },

  searchTikTokUser: (username) => ipcRenderer.invoke('tiktok:search', username),
  connectTikTok: (username, options) => ipcRenderer.invoke('tiktok:connect', username, options),
  disconnectTikTok: () => ipcRenderer.invoke('tiktok:disconnect'),
  getTikTokStatus: () => ipcRenderer.invoke('tiktok:status:get'),
  simulateEvent: (type, payload) => ipcRenderer.invoke('tiktok:simulate', type, payload),

  controlTimer: (action, seconds) => ipcRenderer.invoke('timer:control', action, seconds),
  getTimerStatus: () => ipcRenderer.invoke('timer:status:get'),
  clearJar: () => ipcRenderer.invoke('jar:clear'),
  openOverlayInBrowser: (name) => ipcRenderer.invoke('overlay:open', name),

  // Window Management APIs
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  restoreWindow: () => ipcRenderer.invoke('window:restore'),
  isWindowMinimized: () => ipcRenderer.invoke('window:is-minimized'),

  // Sound & Media Management APIs
  listSounds: () => ipcRenderer.invoke('sounds:list'),
  searchSounds: (query) => ipcRenderer.invoke('sounds:search', query),
  downloadSound: (soundUrl, title) => ipcRenderer.invoke('sounds:download', soundUrl, title),
  selectLocalSound: () => ipcRenderer.invoke('sounds:select-local'),
  selectLocalMedia: () => ipcRenderer.invoke('media:select-local'),

  // Rankings APIs
  getRankings: () => ipcRenderer.invoke('rankings:get'),
  resetRankings: (target) => ipcRenderer.invoke('rankings:reset', target),
  simulateViewerLeave: (username) => ipcRenderer.invoke('rankings:leave', username),

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

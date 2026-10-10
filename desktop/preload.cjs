const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('matrixDesktop', Object.freeze({
  isDesktop: true,
  uploadMedia: (input) => ipcRenderer.invoke('matrix:upload-media', input),
  openPlatformLogin: (platform) => ipcRenderer.invoke('matrix:platform-login', platform),
  openAccountSession: async (sessionId, platform) => {
    const result = await ipcRenderer.invoke('matrix:open-account-session', { sessionId, platform });
    if (result?.error) throw new Error(result.error);
  },
  preparePlatformLogin: (platform, sessionId) =>
    ipcRenderer.invoke('matrix:prepare-platform-login', { platform, sessionId }),
  completePlatformLogin: (input) => ipcRenderer.invoke('matrix:complete-platform-login', input),
  checkPlatformSession: (platform, sessionId) =>
    ipcRenderer.invoke('matrix:check-platform-session', { platform, sessionId }),
  createDatabaseBackup: () => ipcRenderer.invoke('matrix:create-database-backup'),
  openDataFolder: () => ipcRenderer.invoke('matrix:open-data-folder'),
  restoreDatabaseBackup: () => ipcRenderer.invoke('matrix:restore-database-backup'),
}));

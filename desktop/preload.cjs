const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('matrixDesktop', Object.freeze({
  isDesktop: true,
  insertDraft: (input) => ipcRenderer.invoke('matrix:insert-draft', input),
  uploadMedia: (input) => ipcRenderer.invoke('matrix:upload-media', input),
  chooseMedia: (mediaType) => ipcRenderer.invoke('matrix:choose-media', { mediaType }),
  importMedia: async (files, mediaType) => {
    try {
      if (!Array.isArray(files) || files.length > 9) throw new Error('请选择一个视频或最多 9 张图片');
      return await ipcRenderer.invoke('matrix:import-media', { mediaType, paths: files.map(file => webUtils.getPathForFile(file)) });
    } catch (error) { return { error: error.message }; }
  },
  syncPublishForm: (input) => ipcRenderer.invoke('matrix:sync-publish-form', input),
  submitPublishBatch: (entries, batchId) => ipcRenderer.invoke('matrix:submit-publish-batch', { entries, batchId }),
  cancelPublishBatch: (batchId, accessToken) => ipcRenderer.invoke('matrix:cancel-publish-batch', { batchId, accessToken }),
  onPublishProgress: listener => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on('matrix:publish-batch-progress', handler);
    return () => ipcRenderer.removeListener('matrix:publish-batch-progress', handler);
  },
  inspectPageAction: (input) => ipcRenderer.invoke('matrix:inspect-page-action', input),
  submitPageAction: (input) => ipcRenderer.invoke('matrix:submit-page-action', input),
  listPageActions: (accessToken) => ipcRenderer.invoke('matrix:list-page-actions', { accessToken }),
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

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('matrixDesktop', Object.freeze({
  isDesktop: true,
  accountOperations: input => ipcRenderer.invoke('matrix:account-operations', input),
  onAccountOperationsHeartbeat: listener => {
    if(typeof listener!=='function')throw new TypeError('Heartbeat listener must be a function');
    const handler=(_event,workspaceId)=>{if(typeof workspaceId==='string'&&workspaceId.length>0&&workspaceId.length<=128)listener(workspaceId);};
    ipcRenderer.on('matrix:account-operations-heartbeat',handler);
    return()=>ipcRenderer.removeListener('matrix:account-operations-heartbeat',handler);
  },
  douyinInbox: input => ipcRenderer.invoke('matrix:douyin-inbox', input),
  douyinEmojiCatalog: () => ipcRenderer.invoke('matrix:douyin-public-emoji'),
  douyinInteractions: input => ipcRenderer.invoke('matrix:douyin-interactions', input),
  readOpenDouyinFollowers: input => ipcRenderer.invoke('matrix:douyin-open-followers',input),
  syncDouyinFollowers: input => ipcRenderer.invoke('matrix:douyin-followers-sync',input),
  douyinInteractionImage: input => ipcRenderer.invoke('matrix:douyin-interaction-image', input),
  inspectAccountHealth: input => ipcRenderer.invoke('matrix:inspect-account-health',input),
  readPublishTrace: input => ipcRenderer.invoke('matrix:read-publish-trace',input),
  resolvePublishReceipt: input => ipcRenderer.invoke('matrix:resolve-publish-receipt',input),
  extraPlatformWorkspaces: input => ipcRenderer.invoke('matrix:extra-workspaces', input),
  openEdgeGuest: input => ipcRenderer.invoke('matrix:edge-open', input),
  controlEdgeGuest: input => ipcRenderer.invoke('matrix:edge-control', input),
  bindEdgeGuest: input => ipcRenderer.invoke('matrix:edge-bind', input),
  openEdgePublishEntry: input => ipcRenderer.invoke('matrix:edge-publish-entry', input),
  onEdgeStatus: listener => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on('matrix:edge-status', handler);
    return () => ipcRenderer.removeListener('matrix:edge-status', handler);
  },
  systemSettings: input => ipcRenderer.invoke('matrix:system-settings', input),
  openRecoveryMailSettings: () => ipcRenderer.invoke('matrix:recovery-mail-settings'),
  onOfficialPageOpen: listener => {
    const handler = (_event, page) => listener(page);
    ipcRenderer.on('matrix:official-page-open', handler);
    return () => ipcRenderer.removeListener('matrix:official-page-open', handler);
  },
  insertDraft: (input) => ipcRenderer.invoke('matrix:insert-draft', input),
  uploadMedia: (input) => ipcRenderer.invoke('matrix:upload-media', input),
  chooseMedia: (mediaType) => ipcRenderer.invoke('matrix:choose-media', { mediaType }),
  extractPublishMedia: input => ipcRenderer.invoke('matrix:extract-publish-media', input),
  rememberPublishMedia: input => ipcRenderer.invoke('matrix:remember-publish-media', input),
  capturePublishFrame: input => ipcRenderer.invoke('matrix:capture-publish-frame', input),
  validatePublishMedia: input => ipcRenderer.invoke('matrix:validate-publish-media', input),
  restorePublishMedia: input => ipcRenderer.invoke('matrix:restore-publish-media', input),
  readPublishStorageStatus: input => ipcRenderer.invoke('matrix:publish-storage-status', input),
  previewPublishMedia: input => ipcRenderer.invoke('matrix:preview-publish-media', input),
  closePublishPreview: previewId => ipcRenderer.invoke('matrix:close-publish-preview', { previewId }),
  importMedia: async (files, mediaType) => {
    try {
      if (!Array.isArray(files) || files.length > 9) throw new Error('请选择一个视频或最多 9 张图片');
      return await ipcRenderer.invoke('matrix:import-media', { mediaType, paths: files.map(file => webUtils.getPathForFile(file)) });
    } catch (error) { return { error: error.message }; }
  },
  syncPublishForm: (input) => ipcRenderer.invoke('matrix:sync-publish-form', input),
  readPublishEvidence: input => ipcRenderer.invoke('matrix:read-publish-evidence', input),
  officialData: (input) => ipcRenderer.invoke('matrix:official-data', input),
  bilibiliInteractions: (input) => ipcRenderer.invoke('matrix:bilibili-interactions', input),
  douyinCommentWorkflow: input => ipcRenderer.invoke('matrix:douyin-comment-workflow', input),
  douyinCommentScan: input => ipcRenderer.invoke('matrix:douyin-comment-scan', input),
  onDouyinWorkflowProgress: listener => { const handler = (_event, progress) => listener(progress); ipcRenderer.on('matrix:douyin-workflow-progress', handler); return () => ipcRenderer.removeListener('matrix:douyin-workflow-progress', handler); },
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
  verifyPublishResult: (input) => ipcRenderer.invoke('matrix:verify-publish-result', input),
  verifyManualPublish: (input) => ipcRenderer.invoke('matrix:verify-manual-publish', input),
  collectPublishReference: (input) => ipcRenderer.invoke('matrix:collect-publish-reference', input),
  oneClickComments: input => ipcRenderer.invoke('matrix:one-click-comments', input),
  publishFollowup: input => ipcRenderer.invoke('matrix:publish-followup', input),
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

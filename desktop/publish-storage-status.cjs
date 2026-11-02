// User-facing, read-only diagnosis of this authenticated user's task references.
// Never search another owner, return media paths, mint handles, or change status.
function registerPublishStorageStatus({ipcMain,getWindow,authenticate,journal,mediaStore,dataDirectory}) {
  ipcMain.handle('matrix:publish-storage-status',async(event,input)=>{
    try {
      if(event.sender.id!==getWindow()?.webContents.id)throw Error('仅允许远效主窗口检查本地任务引用');
      for(const key of ['receiptId','recoveryId'])if(input?.[key]!==undefined&&!/^[a-f0-9-]{36}$/i.test(input[key]))throw Error('本地任务引用标识无效');
      const auth=await authenticate(input?.accessToken);
      const records=journal.list(auth.userId);
      const receipt=input.receiptId?records.find(record=>record.id===input.receiptId&&record.kind==='publish'):undefined;
      let mediaAvailable;
      if(input.recoveryId){try{mediaStore.read(auth.userId,input.recoveryId);mediaAvailable=true;}catch{mediaAvailable=false;}}
      if((await authenticate(input.accessToken)).userId!==auth.userId)throw Error('登录用户已变化，本地检查结果已丢弃');
      return {userId:auth.userId,dataDirectory,ownedReceiptCount:records.length,receiptFound:input.receiptId?!!receipt:undefined,receiptStatus:receipt?.status,mediaReferenceFound:mediaAvailable};
    }catch(error){return {error:error.message};}
  });
}
module.exports={registerPublishStorageStatus};

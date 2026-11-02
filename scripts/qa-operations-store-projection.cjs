// Encrypted disposable store, synthetic content and one account only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {InteractionStore}=require('../desktop/vendor/hengyuan-interactions/src/interaction-store.cjs');
const {projectInteractionSnapshot}=require('../desktop/vendor/hengyuan-interactions/src/snapshot-projection.cjs');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-project-store-')),folder=path.join(base,'data'),key=crypto.randomBytes(32),account=crypto.randomUUID();
let store;
try{
  store=new InteractionStore(folder,{...cipher(key,'qa-disposable'),getAccount:id=>({id,platform:'douyin',name:'synthetic'})});
  const state=store._read(),at=new Date(Date.now()-10000).toISOString();
  state.messages=Array.from({length:5000},(_,i)=>({id:crypto.randomUUID(),accountId:account,platform:'douyin',channel:'dm',externalId:'synthetic-'+i,threadId:'thread-'+(i%60),senderId:'synthetic-peer',senderName:'synthetic',text:'x'.repeat(512),receivedAt:at,isOwn:false,isGroup:false,historical:true,createdAt:at}));
  store._write(state);
  const expected=projectInteractionSnapshot(store.snapshot()),actual=store.snapshotForDisplay();
  assert.deepEqual(actual,expected);assert.equal(actual.totalMessages,5000);assert.equal(actual.messages.length,60);
  assert.equal(Object.hasOwn(actual,'dmSenders'),false);assert.equal(Object.hasOwn(actual,'externalAttempts'),false);
  actual.messages[0].text='mutated';actual.settings.defaultMode='off';
  assert.deepEqual(store.snapshotForDisplay(),expected,'display data must be detached from the validated store');
  const measure=fn=>{const values=[];for(let i=0;i<7;i++){const start=performance.now();fn();values.push(performance.now()-start);}return Math.round(values.sort((a,b)=>a-b)[3]*100)/100;};
  measure(()=>projectInteractionSnapshot(store.snapshot()));measure(()=>store.snapshotForDisplay());
  const oldMedianMs=measure(()=>projectInteractionSnapshot(store.snapshot())),newMedianMs=measure(()=>store.snapshotForDisplay());
  const bytes=fs.readFileSync(store.filePath);assert.ok(!bytes.includes(Buffer.from('synthetic-peer')),'store stays encrypted');
  console.log(JSON.stringify({encryptedStoreProjectionChecks:7,syntheticMessages:5000,syntheticThreads:60,oldMedianMs,newMedianMs,includesValidatedDiskRead:true,fullSnapshotPreserved:true,returnedValuesDetached:true,realProfileOrPlatformTouched:false}));
}finally{
  key.fill(0);assert.equal(path.dirname(fs.realpathSync(base)),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(base).startsWith('yuanxiao-project-store-'));
  if(store&&fs.existsSync(store.filePath))fs.unlinkSync(store.filePath);
  if(fs.existsSync(folder))fs.rmdirSync(folder);
  fs.rmdirSync(base);
}

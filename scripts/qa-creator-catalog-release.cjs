// Synthetic windows and disposable cache only: no platform/profile/sends.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {createCreatorReader}=require('../desktop/douyin-creator-reader.cjs');
const {registerDouyinInteractions}=require('../desktop/douyin-interactions.cjs');
const own='9007199254740993',work='9007199254740100001';
const catalog=more=>({status_code:0,aweme_list:[{aweme_id:work,author:{uid:own},desc:'synthetic'}],has_more:more,max_cursor:more?'20':'0'});
async function main(){
 let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const source={webRequest:{onBeforeRequest(fn){this.before=fn;},onCompleted(fn){this.completed=fn;},onErrorOccurred(fn){this.failed=fn;}}};
 const windows=[],results=[];let currentOwn=own;
 const reader=createCreatorReader({acquireIdentity:async()=>({ownUid:currentOwn,check:async()=>{},verify:async()=>{},close(){}}),createWindow:s=>{
  eq(s,source);const wc=new EventEmitter(),win={webContents:wc,destroyed:false,loads:0,isDestroyed(){return this.destroyed;},destroy(){this.destroyed=true;},async loadURL(url){this.url=url;this.loads++;}};
  wc.id=100+windows.length;wc.getURL=()=>win.url||'about:blank';wc.setAudioMuted=()=>{};wc.setWindowOpenHandler=()=>{};wc.setBackgroundThrottling=()=>{};
  wc.executeJavaScript=async()=>{assert(results.length,'Unexpected page read');const value=results.shift();if(value instanceof Error)throw value;return value;};windows.push(win);return win;
 }});
 const options={accountSession:source,assertCurrent:async()=>{}};
 try{
  let client=await reader.acquire(options);eq(client.releaseCompletedCatalog(),false);
  results.push(catalog(true));await client.readWeb('works',{cursor:'0'});eq(client.releaseCompletedCatalog(),false);client.close();eq(windows[0].destroyed,false);
  client=await reader.acquire(options);eq(windows.length,1);
  results.push(catalog(false));await client.readWeb('works',{cursor:'20'});client.close();eq(windows[0].destroyed,false,'No commit acknowledgement');
  client=await reader.acquire(options);
  results.push({status_code:0,comments:[],has_more:true,cursor:'99'});await client.readWeb('comments',{workId:work,cursor:'0'});
  const detail=windows[1];detail.continuation='synthetic-dom-cursor-99';const detailLoads=detail.loads;
  eq(client.releaseCompletedCatalog(),true);eq(windows[0].destroyed,true);eq(detail.destroyed,false);eq(client.hasOwnedWork(work),true);eq(client.releaseCompletedCatalog(),false);
  let blocked;source.webRequest.before({webContentsId:windows[0].webContents.id,url:'https://creator.douyin.com/web/api/comment/send/',method:'POST'},v=>blocked=v.cancel);eq(blocked,false);
  source.webRequest.before({webContentsId:detail.webContents.id,url:'https://creator.douyin.com/web/api/comment/send/',method:'POST'},v=>blocked=v.cancel);eq(blocked,true);
  client.close();client=await reader.acquire(options);eq(windows.length,2);
  results.push({status_code:0,comments:[],has_more:false,cursor:'100'});await client.readWeb('comments',{workId:work,cursor:'99'});
  eq(detail.loads,detailLoads);eq(detail.continuation,'synthetic-dom-cursor-99');
  results.push(catalog(true));await client.readWeb('works',{cursor:'0'});eq(windows.length,3);eq(client.releaseCompletedCatalog(),false);eq(windows[2].destroyed,false);
  results.push(catalog(false));await client.readWeb('works',{cursor:'20'});
  results.push(Error('synthetic failed refresh'));await assert.rejects(client.readWeb('works',{cursor:'0'}),/synthetic failed/);checks++;
  eq(client.releaseCompletedCatalog(),false);client.close();eq(windows[2].destroyed,false);
  currentOwn='9007199254740995';client=await reader.acquire(options);eq(detail.destroyed,true);eq(windows[2].destroyed,true);eq(client.hasOwnedWork(work),false);client.close();
 }finally{reader.close();eq(windows.every(win=>win.destroyed),true);}

 // Actual handler/cache boundary: release follows durable merge. Failed merge,
 // missing secure cache, incomplete catalog and changed owner never release.
 for(const mode of ['complete','pending','encrypt-failure','no-cache','owner-change','cleanup-failure']){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-catalog-release-'));
  let handler,service,release=0,commits=0,authOwner='synthetic-owner';const wc={};
  const account={id:'00000000-0000-4000-8000-000000000001',connectorSessionId:'00000000-0000-4000-8000-000000000002',nativeAccountKey:'synthetic-key',platform:'douyin'};
  try{
   service=registerDouyinInteractions({ipcMain:{handle(name,fn){if(name==='matrix:douyin-interactions')handler=fn;}},getWindow:()=>({webContents:wc}),authenticate:async()=>({userId:authOwner,account:{...account}}),session:{fromPartition:()=>({})},userData:directory,
    ...(mode==='no-cache'?{}:{safeStorage:{isEncryptionAvailable:()=>true,encryptString:text=>{if(mode==='encrypt-failure')throw Error('synthetic disk protection failure');commits++;return Buffer.from(text);},decryptString:bytes=>bytes.toString()}}),
    transportFactory:async()=>({ownUid:own,source:'https://creator.douyin.com/',close(){},readWeb:async()=>{if(mode==='owner-change')authOwner='different-owner';return catalog(mode==='pending');},releaseCompletedCatalog(){eq(commits>0,true);const files=fs.readdirSync(path.join(directory,'douyin-interactions')).filter(name=>name.endsWith('.bin'));eq(files.length,1);release++;if(mode==='cleanup-failure')throw Error('synthetic cleanup failure');}})
   });
   const result=await handler({sender:wc},{accessToken:'synthetic-token',accountId:account.id,kind:'comments'});
   eq(release,['complete','cleanup-failure'].includes(mode)?1:0);
   eq(!!result.error,['encrypt-failure','owner-change'].includes(mode));
   if(mode==='complete'){eq(result.works[0].platformId,work);eq(typeof result.nextCursor,'string');}
  }finally{service?.close();assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('matrix-catalog-release-'));fs.rmSync(directory,{recursive:true});}
 }
 console.log(JSON.stringify({checks,passed:true,syntheticOnly:true,platformSends:0,realNetworkRequests:0}));return checks;
}
module.exports={main};if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

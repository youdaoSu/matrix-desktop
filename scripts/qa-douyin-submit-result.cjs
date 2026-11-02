// Actual main-process submit handler with isolated callbacks. No platform I/O.
const assert=require('node:assert/strict');
const {registerPageActions}=require('../desktop/page-actions.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 for(const platform of ['douyin','xiaohongshu']){
 const routes=platform==='douyin'?['https://creator.douyin.com/creator-micro/home','https://creator.douyin.com/creator-micro/content/manage','https://creator.douyin.com/creator-micro/content/upload']:['https://creator.xiaohongshu.com/new/home','https://creator.xiaohongshu.com/new/note-manager','https://creator.xiaohongshu.com/publish/publish'];
 const handlers={},rows=[],windows=[];let clicks=0,inspectedHome=0;
 const account={platform,connectorSessionId:'aaaaaaaaaaaaaaaa',nativeAccountKey:'fixture-own-id'},partition={};
 const editor={id:22,hostWebContents:{id:11},session:partition,isDestroyed:()=>false,getURL:()=> routes[2],
 loadURL:()=>{throw Error('Live editor must be preserved');},executeJavaScriptInIsolatedWorld:async(_world,scripts)=>{
 const code=scripts[0].code;
 if(code.includes('function publishValidation'))return{version:1,inspected:true,errors:[]};
 if(code.includes(')("inspect",'))return{pageUrl:editor.getURL(),fields:[{label:'标题',value:'Fixture work'}],candidates:[{index:0,label:'发布'}]};
 if(code.includes(')("submit-checked",')){clicks++;return{clicked:true};}
 if(code.includes('function publishResult'))throw Error('No list read in the live editor');
 if(code.includes(')("result",'))throw Error('页面已切换，请重新检查表单');
 return{status:'unknown'};
 }};
 registerPageActions({ipcMain:{handle:(name,fn)=>handlers[name]=fn},getWindow:()=>({webContents:{id:11}}),dialog:{showMessageBox:async()=>({response:1})},webContents:{fromId:()=>editor},session:{fromPartition:()=>partition},platforms:{[platform]:{domain:platform+'.com',label:platform}},authenticate:async()=>({userId:'fixture-owner',account}),
 inspectPlatformSession:async(actualPlatform,session,guest)=>{assert.equal(actualPlatform,platform);assert.equal(session,partition);if(guest!==editor){assert.equal(guest.getURL(),routes[0]);inspectedHome++;}return{authenticated:true,profile:{nickname:'Fixture',ownIdentity:{key:'fixture-own-id'}}};},journal:{list:()=>rows.slice(-1),write:record=>rows.push(structuredClone(record))},sleep:tick,
 createResultWindow:session=>{assert.equal(session,partition);let address='',closed=false;const win={isDestroyed:()=>closed,destroy:()=>closed=true,webContents:{getURL:()=>address,isDestroyed:()=>closed,setAudioMuted(){},loadURL:async url=>{assert.ok(routes.slice(0,2).includes(url));address=url;},executeJavaScriptInIsolatedWorld:async(_world,scripts)=>{assert.equal(address,routes[1]);assert.ok(scripts[0].code.includes('function publishResult'));return{matched:true,message:'发布成功',evidence:{workId:'1234567890123456789'}};}}};windows.push(win);return win;}
 });
 const event={sender:{id:11}},input={platform,accountId:'fixture-account',sessionId:account.connectorSessionId,webContentsId:22,accessToken:'fixture-token',kind:'publish'};
 const plan=await handlers['matrix:inspect-page-action'](event,input);assert.ok(plan.nonce);
 const result=await handlers['matrix:submit-page-action'](event,{...input,nonce:plan.nonce,index:0});
 assert.equal(result.receipt.status,'confirmed');assert.equal(result.receipt.resultSource,'official_work_list');assert.ok(result.receipt.completedAt);assert.equal(clicks,1);assert.equal(windows.length,2);assert.ok(inspectedHome>=2);assert.ok(windows.every(window=>window.isDestroyed()));assert.equal(rows.at(-1).status,'confirmed');
 }
 console.log(JSON.stringify({platforms:['douyin','xiaohongshu'],mainSubmitChecks:18,oneSubmitPerTask:true,independentOwnerAndResultRead:true,allReadersClosed:true,noRealPlatformActions:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});

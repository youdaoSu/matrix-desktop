// Deadline/cancellation tests use mocks only, never real accounts or media.
const assert=require('node:assert/strict');
const {createOperationBudget}=require('../desktop/operation-budget.cjs');
const {withOfficialDOM,collectComponentRoots}=require('../desktop/official-dom.cjs');
const {registerPersonalAssist}=require('../desktop/personal-assist.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  let checks=0,late;
  assert.deepEqual(collectComponentRoots({nodeName:'DIV',shadowRoots:[{backendNodeId:11,shadowRootType:'closed',children:[{nodeName:'SPAN',shadowRoots:[{backendNodeId:12,shadowRootType:'open'}]}]},{backendNodeId:99,shadowRootType:'user-agent'},{backendNodeId:100,shadowRootType:'unknown'}],contentDocument:{nodeName:'IFRAME',shadowRoots:[{backendNodeId:101,shadowRootType:'closed'}]}}),[11,12]);checks++;
  const budget=createOperationBudget(8);
  await assert.rejects(budget.run(()=>new Promise(resolve=>{late=resolve})),/超时/);checks++;
  late('too late');await tick();assert.throws(()=>budget.check(),/超时/);checks++;
  let performed=false;await assert.rejects(budget.run(()=>{performed=true;return true;}),/超时/);assert.equal(performed,false);checks+=2;
  let attached=false,release,afterTimedOut=0,commandCount=0;
  const guest={debugger:{isAttached:()=>attached,attach:()=>{attached=true;},sendCommand:async method=>{
    commandCount++;
    if(method==='Page.getFrameTree')return{frameTree:{frame:{id:'qa'}}};
    if(method==='Page.createIsolatedWorld')return{executionContextId:1};
    if(method==='DOM.setFileInputFiles')return new Promise(resolve=>{release=resolve});
    return{};
  }}};
  await assert.rejects(withOfficialDOM(guest,'qa-deadline',async({send})=>{await send('DOM.setFileInputFiles',{objectId:'qa-only',files:[]});afterTimedOut++;},{commandTimeoutMs:8}),/DOM.setFileInputFiles/);checks++;
  const before=commandCount;
  await assert.rejects(withOfficialDOM(guest,'qa-deadline',async()=>true),/正在处理/);assert.equal(commandCount,before);checks+=2;
  release({});await tick();assert.equal(afterTimedOut,0);checks++;
  assert.equal(await withOfficialDOM(guest,'qa-deadline',async()=>true),true);checks++;
  let setupRelease,resetCount=0,chooserAttached=false;
  const chooserGuest={debugger:{isAttached:()=>chooserAttached,attach:()=>{chooserAttached=true},sendCommand:async(method,params)=>{
    if(method==='Page.getFrameTree')return{frameTree:{frame:{id:'qa'}}};
    if(method==='Page.createIsolatedWorld')return{executionContextId:1};
    if(method==='Page.setInterceptFileChooserDialog'&&params.enabled)return new Promise(resolve=>{setupRelease=resolve});
    if(method==='Page.setInterceptFileChooserDialog'&&!params.enabled)resetCount++;
    return{};
  }}};
  await assert.rejects(withOfficialDOM(chooserGuest,'qa-reset',async({send,resetFileChooser})=>{try{await send('Page.setInterceptFileChooserDialog',{enabled:true})}finally{await resetFileChooser()}},{commandTimeoutMs:8}),/超时/);checks++;
  assert.equal(resetCount,1);checks++;
  await assert.rejects(withOfficialDOM(chooserGuest,'qa-reset',async()=>true),/正在处理/);checks++;
  setupRelease({});await tick();assert.equal(await withOfficialDOM(chooserGuest,'qa-reset',async()=>true),true);checks++;
  let focusAttached=false,focusRelease,focusCalls=[];
  const focusGuest={debugger:{isAttached:()=>focusAttached,attach:()=>{focusAttached=true},sendCommand:async(method,params)=>{
    if(method==='Emulation.setFocusEmulationEnabled'){focusCalls.push(params.enabled);if(params.enabled)return new Promise(resolve=>{focusRelease=resolve});return{}}
    if(method==='Page.getFrameTree')return{frameTree:{frame:{id:'qa'}}};
    if(method==='Page.createIsolatedWorld')return{executionContextId:1};return{};
  }}};
  await assert.rejects(withOfficialDOM(focusGuest,'qa-focus-cleanup',async()=>{throw Error('Must not run')},{backgroundFocus:true,commandTimeoutMs:8}),/超时/);checks++;
  assert.deepEqual(focusCalls,[true,false]);checks++;
  await assert.rejects(withOfficialDOM(focusGuest,'qa-focus-cleanup',async()=>true),/正在处理/);checks++;
  focusRelease({});await tick();assert.equal(await withOfficialDOM(focusGuest,'qa-focus-cleanup',async()=>true),true);checks++;
  const handlers={},isolated={};let authRelease,transfers=0;
  const page={id:22,hostWebContents:{id:11},session:isolated,isDestroyed:()=>false,getURL:()=> 'https://member.bilibili.com/platform/upload/video/frame'};
  registerPersonalAssist({ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}},dialog:{showOpenDialog:async()=>{transfers++;throw Error('Must not open a file chooser');}},getWindow:()=>({webContents:{id:11}}),webContents:{fromId:()=>page},session:{fromPartition:()=>isolated},platforms:{bilibili:{domain:'bilibili.com'}},inspectPlatformSession:()=>new Promise(resolve=>{authRelease=resolve}),operationBudget:()=>createOperationBudget(8)});
  const input={platform:'bilibili',sessionId:'a'.repeat(16),webContentsId:22,mediaType:'video'};
  const result=await handlers['matrix:upload-media']({sender:{id:11}},input);
  assert.match(result.error,/超时/);assert.equal(result.uploadStarted,false);assert.equal(transfers,0);checks+=3;
  authRelease({authenticated:true});await tick();assert.equal(transfers,0);checks++;
  const again=await handlers['matrix:upload-media']({sender:{id:11}},input);assert.match(again.error,/超时/);assert.equal(transfers,0);checks+=2;
  console.log(JSON.stringify({publishDeadlineAndLateResultChecks:checks,realPlatformActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});

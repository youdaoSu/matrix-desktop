// Real React provider/feed, virtual account clock, synthetic IPC, zero network.
const path=require('node:path'),root=path.resolve(__dirname,'..');
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs'),cache=new Map(),overrides=new Map();
 const stub=(file,exports)=>cache.set(path.join(root,file),{exports});let owner='owner-a',clock=100000,control,checks=0,serial=0,held;
 const account={id:'a',platform:'douyin',nickname:'QA own',connectorSessionId:'session-a',nativeAccountKey:'native-a'},workspace={accounts:[account],jobsLocked:false};
 const rootRow={platformId:'201',platformUserId:'301',author:'QA root author',content:'QA root body',workId:'1001',workTitle:'QA work',replyCount:2};
 const intervals=new Map(),calls=[],oldNow=Date.now,oldSet=window.setInterval,oldClear=window.clearInterval;
 Date.now=()=>clock;window.setInterval=fn=>{const id=++serial;intervals.set(id,fn);return id;};window.clearInterval=id=>intervals.delete(id);
 stub('client/src/api/index.ts',{getUser:()=>({id:owner}),getAuthToken:()=> 'token-'+owner});stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace});stub('client/src/components/workspace/WorkspaceUiState.ts',{useWorkspaceIdentity:()=>owner,useWorkspacePreference:(_key,value)=>React.useState(value),uiText:()=>true,uiPage:()=>true});
 const basic=tag=>({children,size,variant,...props})=>React.createElement(tag,props,children);
 for(const [name,values]of[['avatar',{Avatar:basic('span'),AvatarImage:basic('img'),AvatarFallback:basic('span')}],['button',{Button:basic('button')}],['input',{Input:basic('input')}],['badge',{Badge:basic('span')}]]){stub(`client/src/components/ui/${name}.tsx`,values);overrides.set('@client/src/components/ui/'+name,values);}
 let turn=0,hold=false,replay=true;
 window.matrixDesktop={douyinInteractions:async input=>{
  calls.push({...input});const base={accountId:'a',sessionId:'session-a',platform:'douyin',kind:'comments',works:[{platformId:'1001',title:'QA work'}],progress:{pages:turn+1},complete:false};
  if(input.command==='cache')return{...base,fromCache:true,records:[rootRow]};
  if(input.priorityCommentId){
   if(hold)return new Promise(resolve=>held=()=>resolve({...base,nextCursor:'old-owner-cursor',records:[{...rootRow,content:'OLD OWNER MUST NOT APPEAR'}]}));
   if(replay){replay=false;return{...base,nextCursor:'qa-replayed-next',records:[{...rootRow,repliesReadState:'partial'}]};}
   turn++;return{...base,replyReadPending:turn===1,nextCursor:turn===1?'qa-reply-20':'qa-reply-done',records:turn===1?[{...rootRow,repliesReadState:'partial',repliesReadReason:'QA old cached partial end'},{...rootRow,platformId:'401',parentPlatformId:'201',content:'QA reply one'}]:[{...rootRow,repliesReadState:'complete'},{...rootRow,platformId:'402',parentPlatformId:'201',content:'QA reply two'}]};
  }
  if(!input.cursor)return{...base,nextCursor:'qa-history-60',records:[]};
  return{error:'抖音分页读取失败（阶段：作品更新检查；原因：unknown/unknown）；已有数据保留'};
 }};
 const {DouyinInteractionDataProvider,useDouyinInteractionData}=loadTs('client/src/components/workspace/DouyinInteractionData.tsx',cache,overrides);
 const {DouyinInteractionFeed}=loadTs('client/src/components/workspace/DouyinInteractionFeed.tsx',cache,overrides);
 function View(){control=useDouyinInteractionData('comments');return React.createElement(DouyinInteractionFeed,{kind:'comments',account,commentView:'work',workId:'1001'});}
 const component=createRoot(document.querySelector('#root')),render=()=>component.render(React.createElement(DouyinInteractionDataProvider,{initialKinds:[]},React.createElement(View))),pause=()=>new Promise(resolve=>setTimeout(resolve,10)),eq=(a,b)=>{assert.deepEqual(a,b);checks++;},until=async test=>{for(let i=0;i<160;i++){if(test())return;await pause();}throw Error('Reply priority UI fixture deadline');},tick=async()=>{for(const fn of [...intervals.values()])fn();await pause();},live=()=>calls.filter(input=>!input.command),buttons=()=>[...document.querySelectorAll('button')];
 try{
  render();await until(()=>control);await tick();await until(()=>document.body.textContent.includes('QA root body'));await tick();await until(()=>live().length===1);clock+=5000;await tick();await until(()=>control.entry(account,'comments')?.error);
  eq(control.entry(account,'comments').cursor,'qa-history-60');eq(live().length,2);
  buttons().find(button=>button.textContent.includes('展开回复')).click();await pause();clock+=15001;await tick();await until(()=>control.entry(account,'comments')?.cursor==='qa-replayed-next');eq(control.entry(account,'comments').pendingReply.commentId,'201');clock+=4501;await tick();await until(()=>document.body.textContent.includes('QA reply one'));
  const first=live().find(input=>input.priorityCommentId);eq(first.priorityCommentId,'201');eq(first.priorityWorkId,'1001');eq(first.cursor,'qa-history-60');eq(first.accountId,'a');eq(first.refreshLatest,undefined);eq(first.forceHistory,undefined);eq(control.entry(account,'comments').pendingReply.commentId,'201');
  eq(document.body.textContent.includes('正在优先读取本条评论的回复'),true);clock+=4501;await tick();await until(()=>document.body.textContent.includes('QA reply two'));
  eq(live().filter(input=>input.priorityCommentId).at(-1).cursor,'qa-reply-20');eq(control.entry(account,'comments').pendingReply,undefined);eq(document.body.textContent.includes('QA reply one'),true);eq(document.body.textContent.includes('unknown/unknown'),false);
  const reads=live().filter(input=>input.priorityCommentId).length;buttons().find(button=>button.textContent==='收起回复').click();await pause();buttons().find(button=>button.textContent.includes('展开回复')).click();await pause();eq(live().filter(input=>input.priorityCommentId).length,reads);
  // A fresh owner never receives a prior owner's queued source/result.
  hold=true;owner='owner-b';render();await tick();await until(()=>calls.some(input=>input.accessToken==='token-owner-b'));await tick();control.requestReplies(account,rootRow);clock+=15001;await tick();await until(()=>held);owner='owner-c';render();await pause();held();await tick();await until(()=>calls.some(input=>input.accessToken==='token-owner-c'));eq(document.body.textContent.includes('OLD OWNER MUST NOT APPEAR'),false);eq(calls.some(input=>input.command==='reply'||input.command==='like'),false);
  return{replyPriorityReactChecks:checks,actualProviderAndFeed:true,expansionQueuesExactRoot:true,failedInventoryDoesNotResetHistory:true,replyPaginationResumesAtNextCursor:true,completeRepliesNotReloaded:true,lateOwnerResultsRejected:true,realPlatformRequests:0,businessWrites:0};
 }finally{component.unmount();held?.();Date.now=oldNow;window.setInterval=oldSet;window.clearInterval=oldClear;delete window.matrixDesktop;}
}
module.exports={run};
if(process.type!=='renderer'){
 if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,env,encoding:'utf8',timeout:45000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
 else{const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-reply-priority-ui-')));app.whenReady().then(async()=>{let win;try{win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});const origin='https://reply-priority.fixture.test/';win.webContents.session.webRequest.onBeforeRequest((r,done)=>done({cancel:r.url!==origin}));win.webContents.session.protocol.handle('https',()=>new Response('<div id="root"></div>',{headers:{'content-type':'text/html'}}));await win.loadURL(origin);console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`)));}catch(error){console.error(error);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});}
}

// Loaded by the offline React QA renderer, never by the real app/profile.
async function runSourceUiTests(container) {
  const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),path=require('node:path');
  const {loadTs}=require('./qa-load-typescript.cjs'),cache=new Map(),root=path.resolve(__dirname,'..');
  const stub=(file,exports)=>cache.set(path.join(root,file),{exports});
  let checks=0,owner='qa-source-owner',token='qa-source-token',prepares=0,opens=0,refreshes=0,registered,enabled=false;
  const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const account={id:'qa-source-account',platform:'douyin',nickname:'QA 独立读取账号',connectorSessionId:'qa-source-session'};
  const workspace={registerInteractionSource:(id,session,kind,input)=>{eq(id,account.id);eq(session,account.connectorSessionId);eq(kind,'messages');registered=input;return()=>{if(registered===input)registered=undefined;};}};
  stub('client/src/api/index.ts',{getUser:()=>({id:owner}),getAuthToken:()=>token});
  stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace});
  let prepare=async()=>({sessionId:account.connectorSessionId,partition:'persist:matrix-douyin-'+account.connectorSessionId});
  let open=async()=>({opened:true});
  const desktopBefore=window.matrixDesktop;
  window.matrixDesktop={isDesktop:true,preparePlatformLogin:async(platform,session)=>{eq(platform,'douyin');eq(session,account.connectorSessionId);prepares++;return prepare();},officialData:async input=>{eq(input.command,'open-message-list');eq(input.kind,'messages');eq(input.accountId,account.id);eq(input.sessionId,account.connectorSessionId);eq(input.webContentsId,123);opens++;return open();}};
  const refreshed=()=>refreshes++;window.addEventListener('matrix:interaction-refresh-request',refreshed);
  const {DouyinMessageSource}=loadTs('client/src/components/workspace/DouyinMessageSource.tsx',cache,new Map());
  const host=document.createElement('div');container.append(host);
  const component=createRoot(host),pause=()=>new Promise(r=>setTimeout(r,15));
  const until=async(test,label)=>{for(let i=0;i<150;i++){if(test())return;await pause();}throw Error('Source UI fixture timeout: '+label+' '+document.body.innerText);};
  const render=()=>component.render(React.createElement(DouyinMessageSource,{account,enabled}));
  render();await pause();eq(prepares,0);eq(container.querySelector('webview'),null);
  enabled=true;render();await until(()=>container.querySelector('webview'),'guest prepared');
  const guest=container.querySelector('webview');guest.getWebContentsId=()=>123;guest.setAudioMuted=value=>eq(value,true);
  eq(guest.getAttribute('partition'),'persist:matrix-douyin-'+account.connectorSessionId);eq(guest.getAttribute('src'),'https://creator.douyin.com/creator-micro/data/following/chat');eq(container.querySelector('section').getAttribute('aria-hidden'),'true');
  guest.dispatchEvent(new Event('dom-ready'));await until(()=>refreshes===1&&registered,'bound source registered');eq(opens,0);
  eq(registered().accountId,account.id);eq(registered().webContentsId,123);
  enabled=false;render();await pause();eq(container.querySelector('webview'),guest);eq(prepares,1);eq(opens,0);
  enabled=true;render();await until(()=>refreshes===2,'resume existing source');eq(container.querySelector('webview'),guest);eq(prepares,1);eq(opens,0);
  // Explicitly failed/foreign prepared profiles cannot produce a guest.
  component.render(null);await until(()=>!registered,'source deregistered');prepare=async()=>({sessionId:'qa-other',partition:'persist:matrix-douyin-qa-other'});render();await until(()=>container.textContent.includes('不一致'),'wrong prepared session rejected');eq(container.querySelector('webview'),null);
  component.render(null);await pause();let resolve;prepare=()=>new Promise(r=>resolve=r);render();await until(()=>resolve,'pending prepare');component.render(null);await pause();resolve({sessionId:account.connectorSessionId,partition:'persist:matrix-douyin-'+account.connectorSessionId});await pause();eq(container.querySelector('webview'),null);eq(registered,undefined);
  component.unmount();host.remove();window.matrixDesktop=desktopBefore;window.removeEventListener('matrix:interaction-refresh-request',refreshed);
  return {douyinMessageSourceReactChecks:checks,creatorSummaryOnly:true,noAutomaticPopupOrConversationClick:true,sourceDoesNotStealWorkspace:true,pauseKeepsGuest:true,latePrepareAfterUnmountIgnored:true,realPlatformRequests:0};
}
module.exports={runSourceUiTests};

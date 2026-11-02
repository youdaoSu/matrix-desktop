'use strict';
const {registerScopedRequestPolicy}=require('./douyin-scoped-request-policy.cjs');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
function createOperationsBrowserServices({BrowserWindow,session,getInbox,acquireDouyinIdentity,registerPolicy=registerScopedRequestPolicy}){
 if(typeof BrowserWindow!=='function'||typeof session?.fromPartition!=='function'||typeof getInbox!=='function'||typeof acquireDouyinIdentity!=='function'||typeof registerPolicy!=='function')throw Error('官网互动原生浏览器设置无效');
 function isolated(account){if(!account||!['douyin','xiaohongshu'].includes(account.platform)||!uuid(account.connectorSessionId))throw Error('当前账号缺少已验证的原登录会话');return session.fromPartition(`persist:matrix-${account.platform}-${account.connectorSessionId}`);}
 function createOperationsWindow({account,platform,background}){
  if(platform!==account?.platform)throw Error('官网互动页面平台与当前账号不一致');
  const source=isolated(account),win=new BrowserWindow({show:false,width:1200,height:820,skipTaskbar:background===true,autoHideMenuBar:true,
   webPreferences:{session:source,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:true}});
  try{const release=registerPolicy(source,win.webContents.id,{blocks:request=>!win.isVisible()&&request.resourceType==='media'});win.once('closed',release);win.webContents.setAudioMuted(true);return win;}
  catch(error){win.destroy();throw error;}
 }
 async function resolveOperationsIdentity({account,owner,assertCurrent}){
  if(typeof assertCurrent!=='function'||typeof owner!=='string'||!owner)throw Error('官网互动身份核验上下文无效');
  const accountSession=isolated(account);await assertCurrent();
  if(account.platform==='xiaohongshu'){
   if(typeof account.nativeAccountKey!=='string'||!/^[a-f0-9]{24}$/i.test(account.nativeAccountKey))throw Error('当前小红书绑定尚无可精确核对的本人 UID，请到账号管理核对；不会按昵称猜测');
   await assertCurrent();return account.nativeAccountKey;
  }
  // The bound DY key is a PUBLIC HANDLE, not a numeric UID. Reuse a verified
  // native IM view if available; otherwise acquire the existing bound self
  // reader once. A self-reader refusal is propagated, never retried/bypassed.
  let uid;try{uid=getInbox().operationsView(owner,account.id,JSON.stringify([owner,account.id,account.platform,account.connectorSessionId,account.nativeAccountKey])).ownUid;}catch{/* No active native inbox view; ordinary self-reader admission follows. */}
  if(typeof uid==='string'&&/^[1-9]\d{0,63}$/.test(uid)){await assertCurrent();return uid;}
  let client;
  try{client=await acquireDouyinIdentity({accountSession,publicHandle:account.nativeAccountKey,assertCurrent,independent:true});await assertCurrent();if(typeof client?.ownUid!=='string'||!/^[1-9]\d{0,63}$/.test(client.ownUid))throw Error('官网本人身份未完成核对，页面未打开');return client.ownUid;}
  finally{client?.close();}
 }
 async function resolveOperationsDirectoryIdentity({account,owner,assertCurrent}){
  if(account?.platform!=='douyin'||typeof owner!=='string'||!owner||typeof assertCurrent!=='function')throw Error('粉丝目录归属核验参数无效');
  await assertCurrent();let client;try{
   client=await acquireDouyinIdentity({accountSession:isolated(account),publicHandle:account.nativeAccountKey,assertCurrent,independent:true});await assertCurrent();
   if(typeof client?.ownUid!=='string'||!/^[1-9]\d{0,63}$/.test(client.ownUid)||typeof client.ownProfileUrl!=='string'||!/^https:\/\/www\.douyin\.com\/user\/MS4w[A-Za-z0-9_-]{1,250}$/.test(client.ownProfileUrl))throw Error('官网本人 UID 与公开主页未同时核验，目录未启用');
   return{identity:client.ownUid,profileUrl:client.ownProfileUrl};
  }finally{client?.close();}
 }
 return{createOperationsWindow,resolveOperationsIdentity,resolveOperationsDirectoryIdentity};
}
module.exports={createOperationsBrowserServices};

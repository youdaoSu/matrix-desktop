// Synthetic sessions/windows only. No Electron profile, network or sends.
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createBrowserReader}=require('../desktop/douyin-browser-reader.cjs');
const {createCreatorReader}=require('../desktop/douyin-creator-reader.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const own='9007199254740993',peer='9007199254740995';
const owner=()=>({ok:true,ownUid:own,ownSecUid:'MS4wQaOwn',data:{status_code:0,has_more:true,cursor:'12'}});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function eventually(predicate){for(let n=0;n<40;n++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('Expected synthetic operation to enter');}
function fixture(){
 const cookies=new EventEmitter();cookies.rows=[{domain:'.douyin.com',path:'/',name:'sessionid',value:'synthetic-only'}];cookies.get=async()=>structuredClone(cookies.rows);
 const source={cookies,webRequest:{onBeforeRequest(fn){this.before=fn;},onCompleted(fn){this.complete=fn;},onErrorOccurred(fn){this.failed=fn;}},clearStorageData(){assert.fail('Session must remain intact');}};
 const pages=[],pending=[];let calls=0;
 const createWindow=s=>{eq(s,source);const wc=new EventEmitter(),win={webContents:wc,destroyed:false,transitions:[],isDestroyed(){return this.destroyed;},destroy(){this.destroyed=true;},async loadURL(url){this.url=url;}};
  wc.id=100+pages.length;wc.session=s;wc.getURL=()=>win.url;wc.setAudioMuted=()=>{};wc.setWindowOpenHandler=()=>{};
  wc.setBackgroundThrottling=value=>{if(win.failThrottle){win.failThrottle=false;throw Error('synthetic activity failure');}win.throttled=value;win.transitions.push(value);};
  wc.executeJavaScript=async()=>{calls++;return pending.length?pending.shift().promise:owner();};pages.push(win);return win;
 };
 const reader=createBrowserReader({createWindow,idleMs:100000,timeoutMs:1000});
 const options={accountSession:source,publicHandle:'qa-owner',assertCurrent:async()=>{}};
 return {reader,pages,pending,source,options,createWindow,calls:()=>calls,acquire:extra=>reader.acquire({...options,...extra})};
}
(async()=>{
 // Re-hide idle hidden collectors only; never hide a visible user window or
 // cache a transition whose native operation failed.
 {const {setReaderActive}=require('../desktop/reader-activity.cjs');let hidden=0,visible=false,dead=false,fail=false;const transitions=[];
  const win={isDestroyed:()=>dead,isVisible:()=>visible,hide(){if(fail){fail=false;throw Error('synthetic hide failure');}hidden++;},webContents:{setBackgroundThrottling:v=>transitions.push(v)}};
  setReaderActive(win,true);eq(hidden,0);setReaderActive(win,false);eq(hidden,1);setReaderActive(win,false);eq(hidden,1);
  setReaderActive(win,true);visible=true;setReaderActive(win,false);eq(hidden,1);eq(transitions,[false,true,false,true]);
  setReaderActive(win,true);visible=false;fail=true;assert.throws(()=>setReaderActive(win,false),/synthetic hide failure/);checks++;eq(hidden,1);
  setReaderActive(win,true);eq(transitions.at(-1),false);setReaderActive(win,false);eq(hidden,2);dead=true;setReaderActive(win,true);eq(transitions,[false,true,false,true,false,true,false,true]);
 }
 // Existing ordinary followers leases retain their old active lifetime and DOM.
 {const f=fixture();try{const c=await f.acquire();eq(f.pages[0].throttled,false);await c.verify();eq(f.pages[0].throttled,false);c.close();eq(f.pages[0].throttled,true);const d=await f.acquire();eq(f.pages.length,1);eq(f.pages[0].throttled,false);d.close();}finally{f.reader.close();}}
 // Idle identity pauses, then overlapping reads and their failure paths balance.
 {const f=fixture();try{const c=await f.acquire({suspendIdleIdentity:true}),win=f.pages[0];eq(win.transitions,[false,true]);
  const a=deferred(),b=deferred();f.pending.push(a,b);const pa=c.verify(),pb=c.verify();await eventually(()=>f.calls()===3);eq(win.throttled,false);
  a.resolve(owner());await pa;eq(win.throttled,false);b.resolve(owner());await pb;eq(win.throttled,true);
  const bad=deferred();f.pending.push(bad);const failure=c.verify(),observed=assert.rejects(failure,/synthetic read failure/);await eventually(()=>f.calls()===4);eq(win.throttled,false);bad.reject(Error('synthetic read failure'));await observed;checks++;eq(win.throttled,true);
  win.failThrottle=true;await assert.rejects(c.verify(),/synthetic activity failure/);checks++;eq(win.throttled,true);
  await c.verify();eq(win.throttled,true);const data=await c.readWeb('followers',{cursor:'12'});eq(data.cursor,'12');eq(win.throttled,true);c.close();
  const next=await f.acquire({suspendIdleIdentity:true});eq(f.pages.length,1);eq(f.pages[0],win);eq((await next.readWeb('followers',{cursor:'12'})).cursor,'12');next.close();
 }finally{f.reader.close();eq(f.pages.every(page=>page.destroyed),true);}}
 // Closing a lease cannot suspend an outstanding read; a subsequent regular
 // lease remains active when an older asynchronous read finally completes.
 {const f=fixture();try{const c=await f.acquire({suspendIdleIdentity:true}),a=deferred();f.pending.push(a);const reading=c.verify();await eventually(()=>f.calls()===2);c.close();eq(f.pages[0].throttled,false);
  const d=await f.acquire();eq(f.pages[0].throttled,false);a.resolve(owner());await reading;eq(f.pages[0].throttled,false);d.close();eq(f.pages[0].throttled,true);
 }finally{f.reader.close();}}
 // Shared avatar scopes must not be cut short by identity completion (and vice
 // versa); no new page, session, request channel or cookie copy is introduced.
 for(const avatarFirst of [true,false]){const f=fixture();try{const c=await f.acquire({suspendIdleIdentity:true}),a=deferred(),b=deferred();
  f.pending.push(a);const avatar=f.reader.readPublicAvatar({...f.options,target:{uid:peer,secUid:'MS4wQaPeer'}});await eventually(()=>f.calls()===2);eq(f.pages[0].throttled,false);
  f.pending.push(b);const verifying=c.verify();await eventually(()=>f.calls()===3);
  if(avatarFirst){a.resolve({ok:true,user:{uid:peer}});await avatar;eq(f.pages[0].throttled,false);b.resolve(owner());await verifying;}
  else{b.resolve(owner());await verifying;eq(f.pages[0].throttled,false);a.resolve({ok:true,user:{uid:peer}});await avatar;}
  eq(f.pages[0].throttled,true);eq(f.pages.length,1);c.close();
 }finally{f.reader.close();}}
 // Disposal and changed identities reject; activity cleanup must not revive a
 // destroyed collector or retry via a different account/session.
 {const f=fixture();try{const c=await f.acquire({suspendIdleIdentity:true}),a=deferred();f.pending.push(a);const p=c.verify(),failed=assert.rejects(p,/登录身份已变化/);await eventually(()=>f.calls()===2);f.source.cookies.rows[0].value='changed-synthetic-only';a.resolve(owner());await failed;checks++;eq(f.pages[0].destroyed,true);eq(f.pages.length,1);c.close();}finally{f.reader.close();}}
 {const f=fixture();try{await assert.rejects(f.acquire({suspendIdleIdentity:'true'}),/活动参数无效/);checks++;eq(f.pages.length,0);}finally{f.reader.close();}}
 // Exercise actual creator-to-browser wiring, including repeated owner proofs.
 {const f=fixture();let requested;const creator=createCreatorReader({acquireIdentity:async options=>{requested=options;return f.reader.acquire(options);},createWindow:f.createWindow});try{
  const c=await creator.acquire(f.options);eq(requested.suspendIdleIdentity,true);eq(requested.accountSession,f.source);eq(f.pages[0].throttled,true);eq(f.pages[0].destroyed,false);c.close();eq(f.pages[0].throttled,true);
 }finally{creator.close();f.reader.close();eq(f.pages.every(page=>page.destroyed),true);}}
 console.log(JSON.stringify({checks,passed:true,syntheticOnly:true,realNetworkRequests:0,platformSends:0,sessionStorageClears:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});

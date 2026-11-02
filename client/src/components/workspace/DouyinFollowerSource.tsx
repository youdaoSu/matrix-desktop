import { createElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { createPortal } from 'react-dom';

// One feature-owned normal official guest for the selected bound account.
// Shares its native session, never a publisher/chat guest or copied cookies.
export function DouyinFollowerSource({ account, request = 0, completed = false, blocked = false, selected = true, controlsHost, onFinished, onRunning }: { account: PlatformAccount; request?: number; completed?: boolean; blocked?: boolean; selected?: boolean; controlsHost?: HTMLElement | null; onFinished?():void; onRunning?():void }) {
 const owner=getUser()?.id,token=getAuthToken(),view=useRef<any>(null),alive=useRef(false),stop=useRef(false),cursor=useRef('');
 const [partition,setPartition]=useState(''),[ready,setReady]=useState(false),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[run,setRun]=useState(0);
 const [finished,setFinished]=useState(completed&&!request),[retired,setRetired]=useState(false),[opening,setOpening]=useState(false),finishedRef=useRef(finished);finishedRef.current=finished;
 const [inspectionBusy,setInspectionBusy]=useState(false),[inspectionNote,setInspectionNote]=useState('');const inspectionPending=useRef(false);
 const lastRequest=useRef(request),running=useRef(false),manuallyPaused=useRef(false),flight=useRef<Promise<void>>(Promise.resolve());
 const hasStarted=useRef(false);
 const detachView=useRef<(()=>void)|undefined>(undefined);
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current=true;detachView.current?.();};},[]);
 const current=()=>alive.current&&getUser()?.id===owner&&getAuthToken()===token;
 const attachView=useCallback((guest:any)=>{
  detachView.current?.();detachView.current=undefined;view.current=guest;if(!guest)return;
  const valid=()=>view.current===guest&&alive.current&&getUser()?.id===owner&&getAuthToken()===token;
  const loaded=()=>{if(valid()){guest.setAudioMuted(true);setReady(true);}};
  const failed=(event:{isMainFrame?:boolean;errorCode:number})=>{if(event.isMainFrame!==false&&event.errorCode!==-3&&valid()){stop.current=true;setNote(`官网粉丝页加载失败（${event.errorCode}），原名单保留`);}};
  // Subscribe at the commit-time ref, before a cached guest can emit dom-ready.
  // A passive effect can miss that one-shot event, leaving a ready page stuck.
  guest.addEventListener('dom-ready',loaded);guest.addEventListener('did-fail-load',failed);
  detachView.current=()=>{guest.removeEventListener('dom-ready',loaded);guest.removeEventListener('did-fail-load',failed);};
 },[owner,token]);
 const inspect=async()=>{
  if(running.current||inspectionPending.current||blocked||!ready||!view.current||!token||!window.matrixDesktop?.syncDouyinFollowers)return;
  inspectionPending.current=true;setInspectionBusy(true);setInspectionNote('正在单次检测当前本人粉丝接口，不保存响应正文，不重试或改换请求…');
  const previous=flight.current;let release!:()=>void;flight.current=new Promise<void>(resolve=>{release=resolve;});
  try{
   await previous;if(!current())return;
   const result=await window.matrixDesktop.syncDouyinFollowers({accessToken:token,accountId:account.id,webContentsId:view.current.getWebContentsId(),command:'inspect'});
   if(!current())return;if(result.error)throw Error(result.error);
   if(result.accountId!==account.id||result.sessionId!==account.connectorSessionId||!result.inspection)throw Error('接口检测账号或结果结构不一致，未采用');
   const facts=result.inspection,reason=['未分类','空正文','HTML页面','JSON外形但未通过解析','防劫持前缀，未擅自改写','非文本或编码异常','其他文本'][facts.responseBodyKind]||'未分类';
   setInspectionNote(`接口检测：HTTP ${facts.responseStatus||'未返回'}，${facts.responseBytes} 字节；${facts.responseReadError?['','响应流不可用','超过安全大小','网络或正文读取失败','请求超时'][facts.responseReadError]||'读取失败':facts.responseRosterShape?'收到有效粉丝名单 JSON（不代表全量）':facts.responseJsonValid?result.platformCode!==undefined&&result.platformCode!==0?`平台返回错误码 ${result.platformCode}`:'JSON 可解析，但不是可确认的粉丝名单':reason}。本次只检测，不改写或覆盖现有名单。`);
  }catch(error){if(current())setInspectionNote(error instanceof Error?error.message:'接口响应检测未完成，原名单保留');}
  finally{inspectionPending.current=false;if(current())setInspectionBusy(false);release();}
 };
 useEffect(()=>{
  if(!selected||blocked||partition||completed&&!request&&!run&&!show)return;
  let active=true;const desktop=window.matrixDesktop;
  if(!desktop?.syncDouyinFollowers||!desktop.preparePlatformLogin||!account.connectorSessionId){setNote('自动粉丝同步需要新版桌面端和已绑定账号');return;}
  void desktop.preparePlatformLogin('douyin',account.connectorSessionId).then(result=>{
   if(!active||!current())return;
   const expected=`persist:matrix-douyin-${account.connectorSessionId}`;
   if('error' in result)throw Error(result.error);
   if(result.platform!=='douyin'||result.sessionId!==account.connectorSessionId||result.partition!==expected||result.engine==='webview2')throw Error('粉丝同步页与所属账号会话不一致，未打开');
   setPartition(expected);
  }).catch(error=>{if(active&&current())setNote(error instanceof Error?error.message:'粉丝同步页准备失败');});
  return()=>{active=false;};
 },[partition,owner,token,account.id,account.connectorSessionId,completed,request,blocked,selected,run,show]);
 useEffect(()=>{
  if(lastRequest.current===request)return;lastRequest.current=request;
  manuallyPaused.current=false;
  if(finishedRef.current){setNote('上次官网可访问名单已读至末页，缓存保留；如需重新核验新增成员，请手动重新同步全部粉丝。');return;}
  // Refresh is continuation, never an implicit reset of a live page lease.
  if(running.current)return;
  finishedRef.current=false;setFinished(false);setRetired(false);setRun(value=>value+1);
 },[request]);
 useEffect(()=>{if(!selected)setShow(false);},[selected]);
 useEffect(()=>{
  // Cache hydration may finish after the controller mounted but before the
  // first START. Adopt that completed cache instead of launching a duplicate
  // scan. Never cancel an explicitly requested recheck or an existing lease.
  if(completed&&!request&&!run&&!hasStarted.current&&!cursor.current){finishedRef.current=true;setFinished(true);stop.current=true;}
 },[completed,request,run]);
 useEffect(()=>{
  // A completed run has no resumable page cursor. Drop only its private guest,
  // not the account partition/cookies/cache. Paused/running guests stay alive.
  if(finished&&!show&&!busy&&!opening&&!inspectionBusy&&ready&&partition&&!retired){setRetired(true);setReady(false);}
 },[finished,show,busy,opening,inspectionBusy,ready,partition,retired]);
 useEffect(()=>{
  if(!selected||manuallyPaused.current||!ready||blocked||!window.matrixDesktop?.syncDouyinFollowers||!token||!owner)return;
  const viewingOnly=finishedRef.current;
  if(viewingOnly&&!show)return;
  let active=true,ownsFlight=false;stop.current=false;
  const previous=flight.current;let release!:()=>void;flight.current=new Promise<void>(resolve=>{release=resolve;});
  const desktop=window.matrixDesktop,input={accessToken:token,accountId:account.id,webContentsId:view.current.getWebContentsId()};
  const valid=()=>active&&current()&&!stop.current;
  const notify=()=>{if(current())window.dispatchEvent(new CustomEvent('matrix:followers-cache-updated',{detail:{owner,accountId:account.id,sessionId:account.connectorSessionId,nativeAccountKey:account.nativeAccountKey}}));};
  const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  void (async()=>{
   let lastNotify=0;
   try{
    await previous;if(!valid())return;ownsFlight=true;running.current=true;
    setBusy(!viewingOnly);setOpening(viewingOnly);if(!viewingOnly)setNote('正在准备所属账号的官网本人粉丝名单…');
    let prepared=false;
    for(let attempt=0;attempt<24&&valid();attempt++){
     const result=await desktop.syncDouyinFollowers({...input,command:'prepare'});
     if(!valid())return;
     if(result.error)throw Error(result.error);
     if(result.accountId!==account.id||result.sessionId!==account.connectorSessionId)throw Error('粉丝面板账号已变化，本次结果丢弃');
     if(result.ready){prepared=true;break;}
     if(!result.waiting)throw Error('官网本人粉丝面板未就绪，原名单保留');
     if(!viewingOnly)setNote(result.reason||'等待官网本人粉丝面板加载');await delay(1500);
    }
    if(!valid())return;
    if(!prepared)throw Error('官网本人粉丝面板准备超时，已暂停，原名单保留');
    if(viewingOnly)return;
    let command:'start'|'resume'|'next'=cursor.current?'resume':'start';
    hasStarted.current=true;onRunning?.();
    while(valid()){
     const result=await desktop.syncDouyinFollowers({...input,command,...(cursor.current?{cursor:cursor.current}:{})});
     if(current()&&result.accountId===account.id&&result.sessionId===account.connectorSessionId&&result.cursor)cursor.current=result.cursor;
     if(!valid())return;
     // Keep a returned paused cursor even when an error accompanies it.
     if(result.cursor)cursor.current=result.cursor;
     if(result.error)throw Error(result.error);
     if(result.accountId!==account.id||result.sessionId!==account.connectorSessionId||!result.cursor||!['running','paused','complete'].includes(result.status||''))throw Error('官网粉丝分页状态不一致，已停止');
     setNote(result.complete?`官网可访问名单已读完：本轮 ${result.loaded||0} 位，${result.avatars||0} 位有头像地址；历史缓存保留，不以粉丝指数代替人数。`:result.status==='paused'?result.reason||'已暂停，原名单保留':result.reason||`正在同步本人粉丝：本轮 ${result.loaded||0} 位，${result.avatars||0} 位有头像地址；正在自动分页。`);
     if(result.complete){cursor.current='';finishedRef.current=true;setFinished(true);onFinished?.();}
     // Refusals/verification pauses require an explicit continuation after
     // the official issue is handled, not another retry on every route visit.
     if(result.status==='paused')manuallyPaused.current=true;
     if(Date.now()-lastNotify>=5000||result.status!=='running'){notify();lastNotify=Date.now();}
     if(result.status!=='running')return;
     // Native enforces the floor from the actual scroll; do not add a second
     // whole interval after IPC and durable local saving. Missing timings
     // keep the old conservative delay; zero is a valid elapsed deadline.
     await delay(typeof result.retryAfterMs==='number'&&Number.isFinite(result.retryAfterMs)&&result.retryAfterMs>=0?Math.max(50,Math.min(30000,result.retryAfterMs)):1500);command='next';
    }
   }catch(error){if(active&&current()){manuallyPaused.current=true;setNote(error instanceof Error?error.message:'粉丝自动同步暂停，原名单保留');notify();}}
   finally{
    if(cursor.current&&(!active||stop.current))try{await desktop.syncDouyinFollowers({...input,command:'pause',cursor:cursor.current});notify();}catch{/* Native scope guards retain rows. */}
    if(ownsFlight)running.current=false;
    if(current()){
     setBusy(false);setOpening(false);
     if((!active||stop.current)&&cursor.current)setNote('粉丝同步已暂停，已保存成员和当前面板断点保留');
    }
    release();
   }
  })();
  return()=>{active=false;stop.current=true;};
 },[selected,ready,run,blocked,owner,token,account.id,account.connectorSessionId,account.nativeAccountKey]);
 const controls=<><div className="matrix-interaction-toolbar"><small role="status">{account.nickname} · {note||(completed?'官网可访问名单已读完':'正在准备自动分页同步…')}</small>
   {busy?<Button size="sm" variant="outline" onClick={()=>{manuallyPaused.current=true;stop.current=true;setNote('正在暂停，将保存当前页后停止…');}}>暂停粉丝同步</Button>:<Button size="sm" variant="outline" title={cursor.current?'核验官网状态后，从本账号保留的原断点继续向下读取，不从第一页重来':'从顶部重新核验官网当前可访问名单'} disabled={blocked||inspectionBusy} onClick={()=>{manuallyPaused.current=false;finishedRef.current=false;setFinished(false);setRetired(false);setRun(value=>value+1);}}>{cursor.current?'继续粉丝同步':'重新同步全部粉丝'}</Button>}
   {!busy&&cursor.current&&<Button size="sm" variant="ghost" disabled={blocked||inspectionBusy} onClick={()=>{manuallyPaused.current=false;finishedRef.current=false;setFinished(false);cursor.current='';setRetired(false);setRun(value=>value+1);}}>从顶部重新核验</Button>}
   {ready&&<Button size="sm" variant="ghost" disabled={busy||opening||blocked||inspectionBusy} onClick={()=>void inspect()}>{inspectionBusy?'正在检测接口…':'检测接口响应'}</Button>}
   {(partition||account.connectorSessionId&&window.matrixDesktop?.preparePlatformLogin)&&<Button size="sm" variant="ghost" onClick={()=>{setRetired(false);setShow(true);}}>查看同步所用官网页面</Button>}
  </div>
  {inspectionNote&&<small role="status">{account.nickname} · {inspectionNote}</small>}
  {opening&&<small role="status">{account.nickname} · 正在核验同账号官网页面，仅查看，不重新执行名单同步</small>}</>;
 return <div data-follower-source-account={account.id}>
  {selected&&(controlsHost?createPortal(controls,controlsHost):controlsHost===undefined?controls:null)}
  {partition&&!retired&&<section className={`matrix-message-source-window ${selected&&show?'is-visible':''}`} aria-label={`${account.nickname}粉丝同步所用官网页面`} aria-hidden={!selected||!show}>
   <header><strong>{account.nickname} · 本人粉丝名单</strong><small>自动同步只打开本人粉丝入口并滚动名单，不点击回关、移除或通知；验证需本人完成。</small><Button variant="outline" onClick={()=>setShow(false)}>返回粉丝管理</Button></header>
   {createElement('webview',{ref:attachView,src:'https://www.douyin.com/user/self',partition,style:{flex:1,width:'100%',minHeight:0},'aria-label':'所属账号的官网本人粉丝同步页'})}
  </section>}
 </div>;
}

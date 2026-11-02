import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAuthToken, getUser } from '@/api';
import type { PlatformAccount } from '@shared/api.interface';
import { DouyinFollowerSource } from './DouyinFollowerSource';

const binding=(account:PlatformAccount)=>JSON.stringify([account.id,account.connectorSessionId,account.nativeAccountKey]);
type Entry={key:string;completed:boolean;request:number;started?:boolean};
type Selection={slot:string;key:string;host:HTMLElement};
type Controls={select(slot:string,account:PlatformAccount,host:HTMLElement,completed:boolean):void;detach(slot:string):void;refresh(account:PlatformAccount):void};
const Context=createContext<Controls|null>(null);

// The provider outlives route/account panels. Only toolbar contents use a
// portal: the guest itself never moves between DOM parents or React roots.
export function DouyinFollowerSessions({accounts,blocked=false,children}:{accounts:PlatformAccount[];blocked?:boolean;children:ReactNode}) {
 const identity=JSON.stringify([getUser()?.id,getAuthToken()]);
 return <ScopedSessions key={identity} accounts={accounts} blocked={blocked}>{children}</ScopedSessions>;
}
function ScopedSessions({accounts,blocked,children}:{accounts:PlatformAccount[];blocked:boolean;children:ReactNode}) {
 const [entries,setEntries]=useState<Entry[]>([]),[selection,setSelection]=useState<Selection|null>(null);
 const bound=new Map(accounts.filter(account=>account.platform==='douyin'&&account.connectorSessionId&&account.nativeAccountKey).map(account=>[binding(account),account]));
 const bindings=JSON.stringify([...bound.keys()].sort());
 const boundRef=useRef(bound);boundRef.current=bound;
 useLayoutEffect(()=>{setEntries(current=>current.filter(entry=>boundRef.current.has(entry.key)));setSelection(current=>current&&boundRef.current.has(current.key)?current:null);},[bindings]);
 const select=useCallback((slot:string,account:PlatformAccount,host:HTMLElement,completed:boolean)=>{
  const key=binding(account);if(!boundRef.current.has(key))return;
  setSelection({slot,key,host});
  setEntries(current=>{
   if(current.some(entry=>entry.key===key))return current.map(entry=>entry.key===key&&completed&&!entry.started&&!entry.completed?{...entry,completed:true}:entry);
   // Bound retained unfinished guests; never evict another account's cursor.
   if(!completed&&current.filter(entry=>!entry.completed&&boundRef.current.has(entry.key)).length>=4)return current;
   return [...current,{key,completed,request:0}];
  });
 },[]);
 const detach=useCallback((slot:string)=>{setSelection(current=>current?.slot===slot?null:current);},[]);
 const refresh=useCallback((account:PlatformAccount)=>{const key=binding(account);setEntries(current=>current.map(entry=>entry.key===key?{...entry,request:entry.request+1}:entry));},[]);
 const controls=useMemo(()=>({select,detach,refresh}),[select,detach,refresh]);
 const capacity=selection&&!entries.some(entry=>entry.key===selection.key)&&entries.filter(entry=>!entry.completed&&bound.has(entry.key)).length>=4;
 return <Context.Provider value={controls}>{children}
  {capacity&&<small role="status">已有4个账号保留同步断点；请先完成其中一个账号，未释放原有断点。</small>}
  {entries.filter(entry=>bound.has(entry.key)).map(entry=><DouyinFollowerSource key={entry.key} account={bound.get(entry.key)!} request={entry.request} completed={entry.completed} selected={selection?.key===entry.key} controlsHost={selection?.key===entry.key?selection.host:null} blocked={blocked||entry.completed&&entries.filter(value=>!value.completed&&bound.has(value.key)).length>=4} onRunning={()=>setEntries(current=>current.map(value=>value.key===entry.key?{...value,completed:false,started:true}:value))} onFinished={()=>setEntries(current=>current.map(value=>value.key===entry.key&&!value.completed?{...value,completed:true}:value))}/>) }
 </Context.Provider>;
}

export function DouyinFollowerControls({account,request=0,completed=false}:{account:PlatformAccount;request?:number;completed?:boolean}) {
 const sessions=useContext(Context),slot=useId(),[host,setHost]=useState<HTMLDivElement|null>(null),key=binding(account);
 const previous=useRef({key,request});
 useLayoutEffect(()=>{if(!sessions||!host)return;sessions.select(slot,account,host,completed);return()=>sessions.detach(slot);},[sessions,slot,host,key,completed]);
 useLayoutEffect(()=>{
  const old=previous.current;previous.current={key,request};
  if(sessions&&old.key===key&&old.request!==request)sessions.refresh(account);
 },[sessions,key,request]);
 if(!sessions)return <DouyinFollowerSource account={account} request={request} completed={completed}/>;
 return <div ref={setHost} aria-label="当前账号粉丝同步控制"/>;
}

import {useCallback,useEffect,useRef} from 'react';
import {getAuthToken,getUser} from '@/api';

// Per-component request lease: cancel the superseded work, and never apply a
// late response after logout, owner change, unmount, or a newer refresh.
export function useOwnerRequest(){
  const sequence=useRef(0),active=useRef<AbortController|undefined>(undefined),disposed=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const owner=getUser()?.id,token=getAuthToken();
  useEffect(()=>{disposed.current=false;return()=>{disposed.current=true;sequence.current++;clearTimeout(timer.current);active.current?.abort();};},[owner,token]);
  return useCallback(()=>{
    clearTimeout(timer.current);active.current?.abort();const controller=new AbortController();active.current=controller;
    const id=++sequence.current,requestOwner=getUser()?.id,requestToken=getAuthToken();
    timer.current=setTimeout(()=>controller.abort(),20000);
    return {signal:controller.signal,authorized:Boolean(requestOwner&&requestToken),
      finish:()=>{if(id===sequence.current)clearTimeout(timer.current);},
      current:()=>!disposed.current&&id===sequence.current&&requestOwner===getUser()?.id&&requestToken===getAuthToken()};
  },[]);
}

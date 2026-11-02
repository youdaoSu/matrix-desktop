import { useLayoutEffect, useRef } from 'react';
import { createInboxScrollAnchor } from './inbox-timeline';

export function useInboxScroll(scope:string,enabled:boolean){
  const viewport=useRef<HTMLDivElement>(null),bubbles=useRef<HTMLDivElement>(null),controller=useRef<ReturnType<typeof createInboxScrollAnchor>|undefined>(undefined);
  useLayoutEffect(()=>{
    const host=viewport.current,body=bubbles.current;if(!enabled||!host||!body)return;
    const anchor=createInboxScrollAnchor(host,body);controller.current=anchor;
    host.addEventListener('scroll',anchor.scroll,{passive:true});host.addEventListener('load',anchor.resize,true);
    const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(anchor.resize);observer?.observe(body);observer?.observe(host);anchor.afterRender();
    return()=>{observer?.disconnect();host.removeEventListener('scroll',anchor.scroll);host.removeEventListener('load',anchor.resize,true);if(controller.current===anchor)controller.current=undefined;};
  },[scope,enabled]);
  useLayoutEffect(()=>{controller.current?.afterRender();});
  return {viewport,bubbles,beforePrepend:()=>controller.current?.beforePrepend()};
}

import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { PlatformAccount } from '@shared/api.interface';
import type { DouyinInboxThread } from '@shared/douyin-inbox';
import { sortInboxConversations } from './inbox-timeline';

export type InboxConversation = DouyinInboxThread & { account: PlatformAccount; selection: string };
type Source = { account: PlatformAccount; threads?: readonly DouyinInboxThread[] };
export function createConversationProjection() {
  let previous: { lease: string; sources: Source[]; rows: InboxConversation[] } | undefined;
  return (lease: string, sources: Source[]) => {
    if (previous?.lease === lease && previous.sources.length === sources.length && sources.every((source,index) => source.account === previous!.sources[index].account && source.threads === previous!.sources[index].threads)) return previous.rows;
    const rows = sortInboxConversations(sources.flatMap(({account,threads}) => (threads || []).map(thread => ({...thread,account,selection:account.id+'|'+thread.id}))));
    previous = {lease,sources,rows}; return rows;
  };
}

const ROW_HEIGHT = 96, OVERSCAN = 4;
// Data stays complete; only visible rows (plus overscan) become DOM nodes.
export const InboxConversationList = memo(function InboxConversationList({items,selected,onSelect}:{items:InboxConversation[];selected:string;onSelect(value:string):void}) {
  const host=useRef<HTMLElement>(null),initial=useRef(Math.max(0,items.findIndex(item=>item.selection===selected))*ROW_HEIGHT);
  const [view,setView]=useState({top:initial.current,height:576}),frame=useRef<number|undefined>(undefined),pendingFocus=useRef<string|undefined>(undefined),latestItems=useRef(items);latestItems.current=items;
  const position=useRef({items,top:initial.current});
  const read=()=>{const element=host.current;if(!element)return;position.current={items:latestItems.current,top:element.scrollTop};setView(old=>old.top===element.scrollTop&&old.height===element.clientHeight?old:{top:element.scrollTop,height:element.clientHeight});};
  useLayoutEffect(()=>{
    const element=host.current;if(!element)return;element.scrollTop=initial.current;read();
    const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(()=>read());observer?.observe(element);
    return()=>{observer?.disconnect();if(frame.current!==undefined)cancelAnimationFrame(frame.current);};
  },[]);
  useLayoutEffect(()=>{
    const element=host.current;if(!element)return;const before=position.current;
    if(before.items!==items){
      const oldIndex=Math.floor(before.top/ROW_HEIGHT),anchor=before.items[oldIndex]?.selection,nextIndex=anchor?items.findIndex(item=>item.selection===anchor):-1;
      const target=nextIndex>=0?nextIndex*ROW_HEIGHT+before.top%ROW_HEIGHT:!before.items.length?Math.max(0,items.findIndex(item=>item.selection===selected))*ROW_HEIGHT:before.top;
      element.scrollTop=Math.max(0,Math.min(target,items.length*ROW_HEIGHT-element.clientHeight));
      read();
    }
  },[items]);
  useLayoutEffect(()=>{if(!pendingFocus.current)return;const element=host.current;const target=Array.from(element?.querySelectorAll<HTMLButtonElement>('button[data-conversation-key]')||[]).find(button=>button.dataset.conversationKey===pendingFocus.current);if(target){target.focus({preventScroll:true});pendingFocus.current=undefined;}});
  const maxTop=Math.max(0,items.length*ROW_HEIGHT-view.height),top=Math.min(view.top,maxTop),start=Math.max(0,Math.floor(top/ROW_HEIGHT)-OVERSCAN),end=Math.min(items.length,Math.ceil((top+Math.max(1,view.height))/ROW_HEIGHT)+OVERSCAN);
  return <aside ref={host} className="matrix-inbox-conversation-window" aria-label="抖音本机聊天会话" data-total-conversations={items.length} onScroll={()=>{if(frame.current!==undefined)cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>{frame.current=undefined;read();});}}>
    {!items.length?<p>暂无已接入的聊天会话。通知摘要不计入这里。</p>:<div style={{height:items.length*ROW_HEIGHT,position:'relative'}}>{items.slice(start,end).map((thread,offset)=><button type="button" style={{position:'absolute',top:(start+offset)*ROW_HEIGHT,height:ROW_HEIGHT}} data-conversation-key={thread.selection} aria-pressed={selected===thread.selection} key={thread.selection} onClick={()=>onSelect(thread.selection)} title={`${thread.name}\n${thread.account.nickname} · ${thread.count} 条\n${thread.lastMessage||'暂无可展示文本'}`} onKeyDown={event=>{
      const index=start+offset,target=event.key==='ArrowDown'?index+1:event.key==='ArrowUp'?index-1:event.key==='Home'?0:event.key==='End'?items.length-1:undefined;
      if(target===undefined||!host.current)return;event.preventDefault();const next=Math.max(0,Math.min(items.length-1,target));pendingFocus.current=items[next].selection;
      if(next*ROW_HEIGHT<host.current.scrollTop)host.current.scrollTop=next*ROW_HEIGHT;else if((next+1)*ROW_HEIGHT>host.current.scrollTop+host.current.clientHeight)host.current.scrollTop=(next+1)*ROW_HEIGHT-host.current.clientHeight;
      read();setView(value=>({...value}));
    }}><strong>{thread.name}</strong><small>{thread.account.nickname} · {thread.count} 条{thread.unread===undefined?' · 官方未读未提供':` · 官方未读 ${thread.unread}`}</small><span>{thread.lastMessage||'暂无可展示文本'}</span></button>)}</div>}
  </aside>;
});

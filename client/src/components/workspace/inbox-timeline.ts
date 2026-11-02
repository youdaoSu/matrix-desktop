// Cross-account display order only. Account/thread keys remain distinct for
// authorization, history, drafts and sending.
export function sortInboxConversations<T extends {lastAt?:string;selection:string}>(rows:T[]):T[]{
  const stamp=(value?:string)=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:-Infinity;};
  return rows.map(row=>({row,at:stamp(row.lastAt)})).sort((a,b)=>a.at===b.at?a.row.selection.localeCompare(b.row.selection):a.at>b.at?-1:1).map(item=>item.row);
}
export function createInboxScrollAnchor(viewport:HTMLElement,bubbles:HTMLElement){
  let pinned=true,lastTop=viewport.scrollTop,anchor:HTMLElement|undefined,offset=0;
  const capture=()=>{
    const top=viewport.getBoundingClientRect().top,items=bubbles.children;let low=0,high=items.length;
    while(low<high){const middle=(low+high)>>>1;if(items[middle].getBoundingClientRect().bottom<top)low=middle+1;else high=middle;}
    anchor=items[low] as HTMLElement|undefined;offset=anchor?anchor.getBoundingClientRect().top-top:0;
  };
  const restore=()=>{
    if(pinned)viewport.scrollTop=Math.max(0,viewport.scrollHeight-viewport.clientHeight);
    else if(anchor&&bubbles.contains(anchor))viewport.scrollTop+=anchor.getBoundingClientRect().top-viewport.getBoundingClientRect().top-offset;
    else capture();
    lastTop=viewport.scrollTop;
  };
  return {
    beforePrepend(){pinned=false;capture();},
    afterRender:restore,
    resize:restore,
    scroll(){const top=viewport.scrollTop;if(Math.abs(top-lastTop)<1)return;if(top<lastTop-1)pinned=false;else if(viewport.scrollHeight-top-viewport.clientHeight<=32)pinned=true;lastTop=top;if(!pinned)capture();},
  };
}

// Native-only plans from already owner-validated root/reply projections. No
// request, URL construction, business write, mark-read or caller proof input.
function epoch(next){const value=(next.monitorEpoch||0)+1;if(!Number.isSafeInteger(value)||value>10000)throw Error('评论监控更新轮次达到安全上限，已有缓存保留');next.monitorEpoch=value;return value;}
function queueHeadChanges(next,head,rows,{hasMore=false,findRecord,completeRootIds=new Set()}={}){
 const roots=[],childrenByRoot=new Map();for(const row of rows){if(!row.parentPlatformId)roots.push(row);else{const children=childrenByRoot.get(row.parentPlatformId)||[];children.push(row);childrenByRoot.set(row.parentPlatformId,children);}}const before=new Map((head.rootSummary||[]).map(row=>[row.id,row]));
 let work=next.works.find(item=>item.id===head.id),created=false,newRoot=false;
 const get=(id)=>typeof findRecord==='function'?findRecord(id,head.id):undefined;
 const ensure=()=>{if(!work){work={id:head.id,title:head.title,cursor:'0',rootDone:true,replies:[],seenRoots:[],monitorEpoch:epoch(next),pagesRead:0,completionCounted:head.historyComplete===true};next.works.push(work);created=true;}return work;};
 for(const root of roots){
  const previous=typeof findRecord==='function'?get(root.platformId):before.get(root.platformId),children=childrenByRoot.get(root.platformId)||[];
  if(!previous)newRoot=true;
  const oldCount=previous?.replyCount,changed=root.replyCount!==undefined&&root.replyCount!==oldCount,unknownChild=children.some(child=>typeof findRecord==='function'?!get(child.platformId):!before.get(root.platformId)?.children?.includes(child.platformId));
  // An exact embedded complete list needs no second request. Partial previews
  // are not an end proof; enqueue the real reply source, retaining any cursor
  // that is already in progress instead of restarting it at each live head.
  const embeddedComplete=completeRootIds.has(root.platformId);
  if(embeddedComplete)root.repliesReadState='complete';
  else if(previous&&!changed&&!unknownChild&&['complete','partial'].includes(previous.repliesReadState)){root.repliesReadState=previous.repliesReadState;if(previous.repliesReadReason)root.repliesReadReason=previous.repliesReadReason;}
  if(!embeddedComplete&&(root.replyCount>0&&(changed||!previous)||unknownChild)){
   const target=ensure();if(!target.replies.some(child=>child.id===root.platformId))target.replies.unshift({id:root.platformId,cursor:'0',loaded:0,expected:root.replyCount,livePriority:true,monitorEpoch:epoch(next)});
  }
 }
 if(newRoot&&hasMore){const target=ensure();if(target.rootDone){target.rootDone=false;target.cursor='0';target.seenRoots=[];target.monitorEpoch=epoch(next);target.liveRefresh=true;}else if(target.cursor!=='0')target.rescanRequested=true;}
 head.rootSummary=roots.slice(0,100).map(row=>({id:row.platformId,replyCount:row.replyCount,children:(childrenByRoot.get(row.platformId)||[]).map(child=>child.platformId).slice(0,100)}));
 return {queued:!!work&&(created||work.replies.some(child=>child.livePriority)||work.rescanRequested===true||newRoot&&hasMore),newRoot};
}
function resetForRescan(next,work){work.cursor='0';work.rootDone=false;work.seenRoots=[];work.rescanRequested=false;work.monitorEpoch=epoch(next);work.liveReplyStreak=0;}
function queueWorkRescan(next,head){let work=next.works.find(item=>item.id===head.id);if(!work){work={id:head.id,title:head.title,cursor:'0',rootDone:false,replies:[],seenRoots:[],monitorEpoch:epoch(next),pagesRead:0,completionCounted:head.historyComplete===true,liveRefresh:true};next.works.push(work);}else if(work.rootDone){work.rootDone=false;work.cursor='0';work.seenRoots=[];work.monitorEpoch=epoch(next);work.liveRefresh=true;}else if(work.cursor!=='0')work.rescanRequested=true;return work;}
module.exports={queueHeadChanges,resetForRescan,queueWorkRescan};

// Revision-local read index only. Never changes messages, cursors, unread state,
// encrypted archives or transport cadence. Each engine owns its own index.
const compare=(a,b)=>BigInt(a.index)<BigInt(b.index)?-1:BigInt(a.index)>BigInt(b.index)?1:BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0;
const {isChatMessageType}=require('./douyin-inbox-visibility.cjs');
const {clean,image}=require('./douyin-inbox-codec.cjs');
const validSec=value=>typeof value==='string'&&/^MS4w[A-Za-z0-9_-]{1,256}$/.test(value);
function identityCandidates(senders,people){
  const candidates=new Map();
  const add=(uid,sec)=>{if(!validSec(sec))return;let set=candidates.get(uid);if(!set){set=new Set();candidates.set(uid,set);}set.add(sec);};
  for(const [uid,pairs] of senders)for(const sec of pairs.keys())add(uid,sec);
  for(const [uid,profiles]of people)for(const p of profiles)add(uid,p.secUid);
  return candidates;
}
function resolvedThreads(source,candidates,people){
  return Object.values(source).map(t=>{
    if(t.type!==1||!t.peer)return t;
    const ids=candidates.get(t.peer),sec=validSec(t.peerSecUid)?t.peerSecUid:ids?.size===1?[...ids][0]:undefined;
    if(!sec)return t;
    const profiles=(people.get(t.peer)||[]).filter(p=>p.secUid===sec&&clean(p.name,200).trim());
    const names=new Set(profiles.map(p=>clean(p.name,200))),p=names.size===1?profiles[0]:undefined;
    const fallback=t.nameSource==='fallback'||!t.nameSource&&t.name===`用户 ${t.peer}`;
    if(sec===t.peerSecUid&&(!p||!fallback))return t;
    // Derived from this owner's archive only; never mutates a cached store read.
    return {...t,peerSecUid:sec,...(p&&fallback?{name:clean(p.name,200),nameSource:'profile',avatarUrl:image(p.avatarUrl),profileAt:p.at}: {})};
  });
}
function createMessageIndex(){
  let cached;
  return {
    clear(){cached=undefined;},
    get(state){
      if(cached?.state===state&&cached.revision===state.revision)return cached;
      const sameMessages=!!cached&&cached.messagesSource===state.messages,samePeople=!!cached&&cached.peopleSource===state.people,samePeers=!!cached&&cached.threadsSource===state.threads;
      const all=sameMessages?cached.all:Object.values(state.messages),threads=sameMessages?cached.threads:new Map(),people=samePeople?cached.people:new Map();
      const sendersByUid=sameMessages?cached.sendersByUid:new Map(),senderPairs=sameMessages?cached.senderPairs:[];
      if(!sameMessages){
        const grouped=new Map();
        for(const message of all){
          let rows=grouped.get(message.threadId);if(!rows){rows=[];grouped.set(message.threadId,rows);}rows.push(message);
          let pairs=sendersByUid.get(message.sender);if(!pairs){pairs=new Map();sendersByUid.set(message.sender,pairs);}
          let entry=pairs.get(message.senderSecUid);if(!entry){entry={first:message,threads:new Set()};pairs.set(message.senderSecUid,entry);senderPairs.push(entry);}
          entry.threads.add(message.threadId);
        }
        for(const [threadId,sourceRows]of grouped){
          const previous=cached?.threads.get(threadId);
          // Store revisions replace changed message objects. Unchanged buckets
          // keep their summaries and already sorted history rather than doing
          // Int64 comparisons across every conversation on each incoming page.
          if(previous&&previous.sourceRows.length===sourceRows.length&&sourceRows.every((row,i)=>row===previous.sourceRows[i])){threads.set(threadId,previous);continue;}
          const bucket={sourceRows,rows:sourceRows,last:undefined,lastVisible:undefined,visibleCount:0,hasOutbound:false,sorted:false};
          for(const message of sourceRows){
            if(message.direction==='outbound')bucket.hasOutbound=true;
            if(!bucket.last||compare(bucket.last,message)<0)bucket.last=message;
            if(message.status!==1&&message.status!==2&&isChatMessageType(message.messageType)){bucket.visibleCount++;if(!bucket.lastVisible||compare(bucket.lastVisible,message)<0)bucket.lastVisible=message;}
          }
          threads.set(threadId,bucket);
        }
      }
      if(!samePeople)for(const person of Object.values(state.people||{})){
        let list=people.get(person.uid);if(!list){list=[];people.set(person.uid,list);}list.push(person);
      }
      // Identity candidates depend on message/person records, not thread cursor,
      // unread or revision changes. Retain ambiguity instead of guessing a peer.
      const candidates=sameMessages&&samePeople?cached.identityCandidates:identityCandidates(sendersByUid,people);
      const sameResolved=samePeers&&sameMessages&&samePeople,resolved=sameResolved?cached.resolved:resolvedThreads(state.threads,candidates,people),peers=sameResolved?cached.peers:new Map();
      if(!sameResolved)for(const thread of resolved)if(thread.type===1&&thread.nameSource&&thread.nameSource!=='fallback'&&!peers.has(thread.peer))peers.set(thread.peer,thread);
      cached={state,revision:state.revision,messagesSource:state.messages,peopleSource:state.people,threadsSource:state.threads,all,threads,people,peers,resolved,sendersByUid,senderPairs,identityCandidates:candidates};return cached;
    },
    rows(state,threadId){
      const bucket=this.get(state).threads.get(threadId);if(!bucket)return [];
      if(!bucket.sorted){bucket.rows=[...bucket.sourceRows].sort(compare);bucket.sorted=true;}return bucket.rows;
    },
  };
}
module.exports={createMessageIndex};

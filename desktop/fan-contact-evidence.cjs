'use strict';
// Only scalar evidence leaves the native inbox. Never infer an untouched
// recipient from the last page, text-only messages, or a nickname match.
function fanContactEvidence({state,indexed,ownUid,ready}, fans) {
  if(!Array.isArray(fans)||fans.length>50||fans.some(f=>!/^MS4w[\w-]+$/.test(f?.id)||!/^\d+$/.test(f?.uid)))throw Error('粉丝身份范围无效');
  const peers=new Map(),bySec=new Map(),outgoing=new Set();
  for(const pair of indexed.sendersByUid.get(ownUid)?.values()||[])for(const id of pair.threads)outgoing.add(id);
  for(const t of indexed.resolved)if(t.type===1){const rows=peers.get(t.peer)||[];rows.push(t);peers.set(t.peer,rows);if(t.peerSecUid){const ids=bySec.get(t.peerSecUid)||new Set();ids.add(t.peer);bySec.set(t.peerSecUid,ids);}}
  const complete=ready===true&&state.init?.done===true&&state.strangers?.done===true&&indexed.resolved.every(t=>t.history?.done===true&&(!t.catchup||t.catchup==='0')&&(t.type!==1||/^[1-9]\d*$/.test(t.peer)));
  return {ownerUid:ownUid,revision:state.revision,complete,items:fans.map(f=>{
    const threads=peers.get(f.uid)||[],secPeers=bySec.get(f.id),ambiguous=threads.length>1||threads.some(t=>t.peerSecUid&&t.peerSecUid!==f.id)||!!secPeers&&([...secPeers].some(uid=>uid!==f.uid));
    const sent=threads.some(t=>outgoing.has(t.id)||indexed.threads.get(t.id)?.hasOutbound===true);
    const status=ambiguous?'unknown':sent?'contacted':complete?'eligible':'unknown';
    return {id:f.id,uid:f.uid,status,detail:ambiguous?'会话身份存在冲突，需核对':sent?'此账号已有发出消息的记录':complete?'当前平台可读取历史中未发现发出消息':'私信历史尚未读全或连接未就绪，不能判断从未联系'};
  })};
}
module.exports={fanContactEvidence};

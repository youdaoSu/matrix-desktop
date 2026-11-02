'use strict';

// Select each thread's newest message before sorting. Preserve the original
// stable ordering when timestamps tie, including when the newest occurrence
// is not the first occurrence of that thread.
function normalizeReplyQuery(input) {
  if(input===undefined)return undefined;
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['offset','limit','status','accountId'].includes(k)))throw Error('回复查询条件无效');
  const {offset=0,limit=100,status='all',accountId=''}=input;
  if(!Number.isSafeInteger(offset)||offset<0||offset>50000||!Number.isSafeInteger(limit)||limit<1||limit>300)throw Error('回复分页范围无效');
  if(!['all','pending','queued','sending','sent','failed','unknown','cancelled','skipped'].includes(status))throw Error('回复状态无效');
  if(typeof accountId!=='string'||accountId&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(accountId))throw Error('回复账号编号无效');
  return {offset,limit,status,accountId};
}
function normalizeInboxQuery(input) {
  if(input===undefined)return undefined;
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['offset','limit','accountId'].includes(k)))throw Error('私信会话查询条件无效');
  const {offset,limit,accountId}=normalizeReplyQuery({...input,status:'all'});
  return {offset,limit,accountId};
}
function projectInteractionSnapshot(state,input,inboxInput) {
  const query=normalizeReplyQuery(input),inboxQuery=normalizeInboxQuery(inboxInput);
  const counts={sent:0,pending:0,queued:0,unknown:0,failed:0};
  for(const reply of state.replies)if(Object.hasOwn(counts,reply.status))counts[reply.status]++;
  const latest=new Map(),privateLatest=new Map();
  for(let index=0;index<state.messages.length;index++){
    const message=state.messages[index],key=message.accountId+'/'+(message.channel||'')+'/'+message.threadId,previous=latest.get(key);
    if(!previous||message.receivedAt.localeCompare(previous.message.receivedAt)>0)latest.set(key,{message,index});
    if(inboxQuery&&message.channel==='dm'&&!message.isOwn&&!message.isGroup){const previous=privateLatest.get(key);if(!previous||message.receivedAt.localeCompare(previous.message.receivedAt)>0)privateLatest.set(key,{message,index});}
  }
  const messages=[...latest.values()].sort((a,b)=>b.message.receivedAt.localeCompare(a.message.receivedAt)||a.index-b.index).slice(0,300).map(item=>item.message);
  let inbox={};
  if(inboxQuery){
    const matches=[...privateLatest.values()].filter(item=>!inboxQuery.accountId||item.message.accountId===inboxQuery.accountId).sort((a,b)=>b.message.receivedAt.localeCompare(a.message.receivedAt)||a.index-b.index);
    if(inboxQuery.offset>=matches.length)inboxQuery.offset=matches.length?Math.floor((matches.length-1)/inboxQuery.limit)*inboxQuery.limit:0;
    inbox={inboxMessages:matches.slice(inboxQuery.offset,inboxQuery.offset+inboxQuery.limit).map(item=>item.message),inboxPage:{...inboxQuery,totalConversations:privateLatest.size,matchingConversations:matches.length}};
  }
  if(query){
    const matches=r=>(query.status==='all'||r.status===query.status)&&(!query.accountId||r.accountId===query.accountId);
    let matchingReplies=0,replies=[];
    for(const reply of state.replies)if(matches(reply)){if(matchingReplies>=query.offset&&replies.length<query.limit)replies.push(reply);matchingReplies++;}
    if(query.offset>=matchingReplies){query.offset=matchingReplies?Math.floor((matchingReplies-1)/query.limit)*query.limit:0;let position=0;replies=[];for(const reply of state.replies)if(matches(reply)&&position++>=query.offset){replies.push(reply);if(replies.length===query.limit)break;}}
    const needed=new Set(replies.map(reply=>reply.messageId));
    return {...state,...inbox,messages,replies,replySources:state.messages.filter(m=>needed.has(m.id)),replyPage:{...query,matchingReplies},counts,totalMessages:state.messages.length,totalReplies:state.replies.length};
  }
  const replies=state.replies.slice(0,300),needed=new Set(replies.map(reply=>reply.messageId)),included=new Set(messages.map(message=>message.id));
  for(const message of state.messages)if(needed.has(message.id)&&!included.has(message.id))messages.push(message);
  return {...state,...inbox,messages,replies,counts,totalMessages:state.messages.length,totalReplies:state.replies.length};
}
module.exports={projectInteractionSnapshot,normalizeReplyQuery,normalizeInboxQuery};

'use strict';
// Narrow fresh source proof for comment -> first DM. No page writes, no cached
// response masquerading as fresh, no continuation mutation or alternate route.
const {commentIdentifier}=require('./douyin-comment-identifiers.cjs');
const ownId=value=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value);
const cursor=value=>typeof value==='string'&&/^\d{1,19}$/.test(value);
function checkExpected(row,message){
 if(!row||row.authorIdentityAvailable===false||row.platformUserId!==message.senderId||row.workId!==message.threadId||row.content!==message.text||row.displayTime!==message.receivedAt||row.authorProfileUrl!==message.profileUrl||!/^https:\/\/www\.douyin\.com\/user\/MS4w[A-Za-z0-9_-]{1,250}$/.test(row.authorProfileUrl||''))throw Error('原生评论、作者主页或正文时间与冻结来源不一致，未建立单聊');
}
async function verifyCommentProof({message,cache,client,read,project,assertCurrent}){
 if(typeof cache?.findRecord!=='function'||typeof cache?.findWork!=='function'||[read,project,assertCurrent].some(fn=>typeof fn!=='function'))throw Error('原生评论来源核验服务尚未就绪');
 if(!message||message.channel!=='comment'||message.platform!=='douyin'||message.isOwn||message.isGroup||!ownId(message.threadId)||typeof message.externalId!=='string'||!message.externalId.startsWith(message.threadId+'/'))throw Error('评论转首个单聊必须使用原生作品与评论编号');
 const id=message.externalId.slice(message.threadId.length+1);if(!commentIdentifier(id,true))throw Error('原生评论标识无效');
 const expected=cache.findRecord(id,message.threadId),work=cache.findWork(message.threadId);checkExpected(expected,message);await assertCurrent();
 if(!client||!ownId(client.ownUid)||!work||work.ownerUid!==client.ownUid||typeof client.hasOwnedWork!=='function')throw Error('评论作品缺少当前原账号的本人归属证明');
 // Cold collectors rebuild their NORMAL owned directory, max3 pages. A real
 // HTTP/identity/platform refusal propagates immediately, never falls back.
 if(!client.hasOwnedWork(message.threadId)){
  let at='0';for(let page=0;page<3;page++){
   const data=await read('works',{cursor:at});await assertCurrent();if(!Array.isArray(data?.aweme_list)||data.aweme_list.length>100||data.aweme_list.some(w=>!ownId(w.aweme_id)||w.author?.uid!==client.ownUid)||![true,false,0,1].includes(data.has_more))throw Error('本人作品目录未通过归属校验');
   if(client.hasOwnedWork(message.threadId))break;const next=String(data.max_cursor??'0');if(!data.has_more)break;if(!cursor(next)||next===at)throw Error('本人作品目录分页未前进，未猜测目标作品');at=next;
  }
 }
 if(!client.hasOwnedWork(message.threadId))throw Error('本轮可核验作品目录尚未包含目标作品，未建立单聊');
 const root=expected.parentPlatformId?cache.findRecord(expected.parentPlatformId,message.threadId):expected;if(!root||root.parentPlatformId||!commentIdentifier(root.platformId,true))throw Error('目标回复缺少原生根评论来源');
 const rootCursor=root.pageCursor||'0';if(!cursor(rootCursor))throw Error('原生根评论分页位置无效');const roots=await read('comments',{workId:message.threadId,cursor:rootCursor});await assertCurrent();
 if(!Array.isArray(roots?.comments)||roots.comments.length>100)throw Error('官网当前根评论页面结构未识别');
 const projected=roots.comments.map(raw=>({...project(raw,{id:message.threadId,title:work.title}),pageCursor:rootCursor})),foundRoot=projected.filter(row=>row.platformId===root.platformId&&!row.parentPlatformId);if(foundRoot.length!==1)throw Error('官网当前根评论页未返回原评论，未猜测其他来源');
 let fresh=foundRoot[0];if(expected.parentPlatformId){
  const pageCursor=expected.pageCursor||'0';if(!cursor(pageCursor))throw Error('原生回复分页位置无效');const replies=await read('replies',{workId:message.threadId,commentId:root.platformId,cursor:pageCursor});await assertCurrent();if(!Array.isArray(replies?.comments)||replies.comments.length>100)throw Error('官网当前回复页面结构未识别');const matches=replies.comments.map(raw=>project(raw,{id:message.threadId,title:work.title},root.platformId)).filter(row=>row.platformId===id);if(matches.length!==1)throw Error('官网当前回复页未返回原记录，未猜测其他回复');fresh=matches[0];
 }
 if(fresh.platformId!==id||fresh.platformUserId===client.ownUid)throw Error('官网当前评论标识或作者与原来源不一致');checkExpected(fresh,message);await assertCurrent();
 return{ownUid:client.ownUid,record:fresh};
}
module.exports={verifyCommentProof};

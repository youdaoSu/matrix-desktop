// Read-only owned-account pages. No signing emulation, writes, conversation
// entry, read receipts or caller-supplied URLs/UIDs. Protocol facts are recorded
// in vendor/douyin-im/PROVENANCE.json; runtime implementation is independent.
const { randomUUID, createHash } = require('node:crypto');
const c = require('./douyin-inbox-codec.cjs');
const { createOperationBudget } = require('./operation-budget.cjs');
const { commentIdentifier } = require('./douyin-comment-identifiers.cjs');
const { avatars, commentImages } = require('./douyin-interaction-media.cjs');
const liveCadence=require('./douyin-live-cadence.cjs'),warmHistory=require('./douyin-warm-history.cjs');
const {workOrder}=require('./douyin-work-order.cjs');
const {playbackFields}=require('./work-playback.cjs');
const number = v => (typeof v === 'number' || typeof v === 'string' && /^\d+$/.test(v)) && Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : undefined;
const more = v => { if (![true, false, 0, 1].includes(v)) throw Error('抖音分页结束标记未识别，不会把未返回数据当作已取完'); return !!v; };
const time = v => { const n=number(v),ms=n>0&&n<4102444800?n*1000:n>=946684800000&&n<4102444800000?n:NaN;return Number.isFinite(ms)?new Date(ms).toISOString():undefined; };
function interactionFailure(error, stage) {
  const text=typeof error?.message==='string'?error.message:'';
  // Keep useful long platform/parser diagnostics without exporting secrets,
  // local paths, stack traces, raw records or arbitrary native exceptions.
  if(/[\u4e00-\u9fff]/.test(text)&&!/(?:cookie|token|authorization|password|https?:|[A-Za-z]:[\\/])/i.test(text))return text.slice(0,230)+(text.length>230?'…':'');
  const phases=new Set(['参数校验','账号验证','读取缓存','准备官网采集页','本人身份复核','作品目录分页','作品评论分页','评论回复分页','粉丝名单分页','评论更新检查','作品更新检查','保存互动缓存','生成续传凭据','评论操作']);
  const execution = /Script failed to execute/i.test(text) ? '官网页面脚本执行未完成' : /Execution context was destroyed|Cannot find context/i.test(text) ? '官网页面切换使执行上下文失效' : /Object has been destroyed|webContents.*destroyed/i.test(text) ? '官网采集页面已关闭' : '';
  if(execution)return `抖音分页读取失败（阶段：${phases.has(stage)?stage:'未知'}；原因：${execution}）；已有数据和分页断点保留`;
  const name=['TypeError','RangeError','SyntaxError'].includes(error?.name)?error.name:'unknown';
  const code=['EACCES','EPERM','ENOSPC','EIO','EBUSY','ENOENT'].includes(error?.code)?error.code:'unknown';
  return `抖音分页读取失败（阶段：${phases.has(stage)?stage:'未知'}；原因：${name}/${code}）；已有数据保留，不代表没有记录`;
}
function projectLikeReceipt(row, receipt, desired) {
  if (typeof desired !== 'boolean') throw Error('点赞目标状态无效');
  if (receipt?.state !== 'confirmed') return { receipt };
  if (receipt.liked !== undefined && (typeof receipt.liked !== 'boolean' || receipt.liked !== desired)) return { receipt: { state: 'unknown', message: '官网返回的点赞状态与本次目标不一致，请核对原评论，勿重复提交' } };
  const count = typeof receipt.likeCount === 'number' && Number.isSafeInteger(receipt.likeCount) && receipt.likeCount >= 0 ? receipt.likeCount : undefined;
  // The website may already be in the desired state. Use an exact returned
  // count, never mechanically add/subtract one from a stale or unknown state.
  const estimate=count===undefined&&typeof receipt.likeCountEstimate==='number'&&Number.isSafeInteger(receipt.likeCountEstimate)&&receipt.likeCountEstimate>=0?receipt.likeCountEstimate:undefined;
  return { receipt: { state: 'confirmed', message: c.clean(receipt.message,240) || '官网已确认点赞状态', liked: desired, ...(count !== undefined ? { likeCount: count } : {}),...(estimate!==undefined?{likeCountEstimate:estimate}:{}) }, row: { ...row, liked: desired, ...(count !== undefined ? { likeCount: count } : {}) } };
}
function person(user, allowUnavailable = false) {
  const unavailable = allowUnavailable && user?.identityUnavailable === true && user.uid === '';
  const uid = unavailable ? '' : user?.referenceKind === 'legacy' ? commentIdentifier(user.uid, true) : c.id(user?.uid, false), sec = /^MS4w[A-Za-z0-9_-]{1,256}$/.test(user?.sec_uid || '') ? user.sec_uid : undefined;
  if (!uid && !unavailable) throw Error('抖音评论作者标识无效，未伪造编号');
  const avatarUrls = avatars(user);
  return { platformUserId: uid, author: c.clean(user.remark_name || user.nickname, 200) || '昵称暂未提供', avatarUrl: avatarUrls[0], ...(!avatarUrls.length&&typeof user.avatarReadHint==='string'&&user.avatarReadHint.startsWith('头像资源尚无可用地址；字段结构：')?{avatarReadHint:c.clean(user.avatarReadHint,300)}:{}), ...(avatarUrls.length ? { avatarUrls } : {}), ...(sec ? { authorProfileUrl: 'https://www.douyin.com/user/' + sec } : {}) };
}
function comment(row, work, parent) {
  const id = commentIdentifier(row?.cid, row?.referenceKind === 'legacy');
  if (!id) throw Error('抖音评论标识无效，未伪造编号');
  if (row.aweme_id !== undefined && c.id(row.aweme_id, false) !== work.id || typeof row.text !== 'string') throw Error('抖音评论作品编号或正文不匹配，本页未采用');
  const liked = [true, 1, '1'].includes(row.user_digged) ? true : [false, 0, '0'].includes(row.user_digged) ? false : undefined;
  const images = commentImages(row);
  return { ...person(row.user, true), platformId: id, ...(images.length ? { images } : {}), ...(!images.length&&typeof row.imageReadHint==='string'&&row.imageReadHint.startsWith('评论附件尚无可用地址；已识别资源字段：')?{imageReadHint:c.clean(row.imageReadHint,300)}:{}), ...(row.user?.identityUnavailable ? { authorIdentityAvailable: false } : {}), ...(row.referenceKind === 'legacy' ? { referenceKind: 'legacy' } : {}), content: c.clean(row.text, 16000), workId: work.id, workTitle: work.title, parentPlatformId: parent, displayTime: time(row.create_time), ...(liked !== undefined ? { liked } : {}), ...(number(row.digg_count) !== undefined ? { likeCount: number(row.digg_count) } : {}), ...(number(row.reply_comment_total) !== undefined ? { replyCount: number(row.reply_comment_total) } : {}) };
}
function commentTimeStats(records){let newest;for(const row of Array.isArray(records)?records:[]){if(typeof row?.displayTime!=='string')continue;const seconds=Date.parse(row.displayTime)/1000;if(Number.isSafeInteger(seconds)&&seconds>=946684800&&seconds<=2147483647)newest=newest===undefined?seconds:Math.max(newest,seconds);}return newest===undefined?{}:{newestCommentSeconds:newest};}
function follower(user){
  const content=c.clean(user.signature),displayTime=time(user.follow_time),allowed=new Set(['missing','empty','invalid']);
  const state=field=>allowed.has(user.followerDetailState?.[field])?user.followerDetailState[field]:field==='signature'?Object.hasOwn(user,'signature')?typeof user.signature==='string'?'empty':'invalid':'missing':Object.hasOwn(user,'follow_time')?[0,'0','',null].includes(user.follow_time)?'empty':'invalid':'missing';
  return{...person(user),platformId:c.id(user.uid,false),content,...(displayTime?{displayTime}:{}),followerDetailState:{signature:content?'provided':state('signature'),followTime:displayTime?'provided':state('followTime')}};
}
function initial(kind) { return { kind, cursor: '0', offset: '0', sourceType: '1', workCursor: '0', workEnded: false, works: [], seenWorks: [], worksDone: 0, rootPages: 0, replyPages: 0, followerPages: 0, pages: 0 }; }
async function readPage(client, state, { priorityWorkId, priorityCommentId, refreshLatest = false, previewFirst = false, now = Date.now, findRecord,findWork,onPhase } = {}) {
  const next = structuredClone(state); const works = []; let records = [], total, phase, complete = false, stage;
  if (state.pages >= 10000) throw Error('抖音本轮达到10000页安全上限，已保留断点，尚不能称为全部读取');
  // Expanding a cached thread is a read intent, not caller-supplied ownership
  // proof. Admit it only after both the native cache and this continuation's
  // current-owner catalog prove the exact root/work. Keep existing reply and
  // root cursors; optional new-work checks must not precede this explicit read.
  let requestedReply;
  if(priorityCommentId){
    const root=findRecord?.(priorityCommentId,priorityWorkId);
    if(state.kind!=='comments'||!root||root.parentPlatformId||root.workId!==priorityWorkId||root.platformId!==priorityCommentId)throw Error('目标根评论未通过当前账号作品缓存核验，未读取回复');
    if(root.repliesReadState==='complete'&&!next.works.some(work=>work.id===priorityWorkId&&work.replies.some(child=>child.id===priorityCommentId))){
      const done=next.workEnded&&!next.works.length&&!next.headWorks?.some(work=>work.pendingWarmCheck),monitoring=done&&previewFirst&&typeof client.readLatest==='function';if(monitoring)next.monitoringStarted=true;
      next.pages++;return {records:[root],works:[],phase:'本条回复已有完整分页记录，已复用缓存；其他历史断点保留',complete:done,...(monitoring?{monitoring:true,pollAfterMs:liveCadence.delay(next,now())}:{}),next,progress:{pages:next.pages,worksFound:next.seenWorks.length,worksDone:next.worksDone,rootPages:next.rootPages,replyPages:next.replyPages,followerPages:next.followerPages,worksCatalogComplete:next.workEnded,...(next.catalogReadError?{catalogReadError:next.catalogReadError}:{})}};
    }
    const head=next.headWorks?.find(work=>work.id===priorityWorkId&&work.ownerUid===client.ownUid);
    let work=next.works.find(work=>work.id===priorityWorkId);
    if(head||work){
      if(!work){work={id:head.id,title:head.title,cursor:'0',rootDone:head.historyComplete===true,replies:[],seenRoots:[],pagesRead:0,completionCounted:head.historyComplete===true};next.works.push(work);}
      requestedReply=work.replies.find(child=>child.id===priorityCommentId);
      if(!requestedReply&&root.repliesReadState!=='complete'){
        // After a renderer/native restart the encrypted row is display data,
        // not a fresh root proof in the creator page. Read its exact saved
        // root page once, without moving the historical root cursor. The next
        // admitted turn reads replies only if that normal page contains it.
        if(!work.seenRoots.includes(priorityCommentId)&&!head?.rootSummary?.some(item=>item.id===priorityCommentId)){
          onPhase?.('作品评论分页');
          const data=await client.readWeb('comments',{workId:work.id,cursor:root.pageCursor||'0'});
          if(!Array.isArray(data.comments)||data.comments.length>100)throw Error('目标根评论页面结构未识别，原回复断点保留');more(data.has_more);
          const projected=data.comments.map(row=>({...comment(row,work),pageCursor:root.pageCursor||'0'})),fresh=projected.find(row=>row.platformId===priorityCommentId&&!row.parentPlatformId);
          if(!fresh)throw Error('官网当前根评论页未返回目标评论，原回复和断点保留，未猜测其他评论');
          const epoch=(next.monitorEpoch||0)+1;if(!Number.isSafeInteger(epoch)||epoch>10000)throw Error('评论监控更新轮次达到安全上限，已有缓存保留');next.monitorEpoch=epoch;
          work.replies.unshift({id:priorityCommentId,cursor:'0',loaded:0,expected:fresh.replyCount,livePriority:true,monitorEpoch:epoch});next.pages++;
          return {records:[{...fresh,repliesReadState:undefined,repliesReadReason:undefined}],works:[],phase:'已核验目标根评论，下一页优先读取回复；原历史断点保留',complete:false,next,progress:{pages:next.pages,worksFound:next.seenWorks.length,worksDone:next.worksDone,rootPages:next.rootPages,replyPages:next.replyPages,followerPages:next.followerPages,worksCatalogComplete:next.workEnded,...(next.catalogReadError?{catalogReadError:next.catalogReadError}:{})}};
        }
        const epoch=(next.monitorEpoch||0)+1;if(!Number.isSafeInteger(epoch)||epoch>10000)throw Error('评论监控更新轮次达到安全上限，已有缓存保留');next.monitorEpoch=epoch;
        requestedReply={id:priorityCommentId,cursor:'0',loaded:0,expected:root.replyCount,livePriority:true,monitorEpoch:epoch};work.replies.unshift(requestedReply);
      }
      if(requestedReply){next.works.splice(next.works.indexOf(work),1);next.works.unshift(work);}
    }
  }
  if(refreshLatest&&state.catalogReadError)next.catalogRetryRequested=true;
  const catalogPaused=!!state.catalogReadError&&!state.catalogRetryRequested&&!refreshLatest;
  const appendHomepageOrder=data=>{if(!Array.isArray(data.homepage_order)||data.homepage_order.length>100)return;for(const item of data.homepage_order){if(item.author?.uid!==client.ownUid||!next.seenWorks.includes(item.aweme_id))continue;const existing=works.find(work=>work.platformId===item.aweme_id),saved=findWork?.(item.aweme_id),head=next.headWorks?.find(work=>work.id===item.aweme_id),metadata=workOrder(item);if(metadata.homepageRank!==undefined){const patch={platformId:item.aweme_id,title:existing?.title??saved?.title??head?.title??c.clean(item.desc,1000),...metadata};if(existing)Object.assign(existing,patch);else if(works.length<100)works.push(patch);}}};
  // Catalog progress must not depend on draining any work's comments/replies.
  // Admit at most two catalog pages before a comment slot, using the SAME
  // account lane/floor. Preserve the live/history alternation across catalog
  // slots so neither a large catalog nor changing selections can starve it.
  const freshInventory = !requestedReply && previewFirst && state.kind==='comments' && typeof client.readInventoryHead==='function' && state.pages>0 && (refreshLatest || !state.lastWasInventory&&now()-(state.inventoryAt??now())>=60000);
  const selectionDue=!requestedReply&&previewFirst&&!state.catalogPriorityUsed&&state.kind==='comments'&&typeof client.readLatest==='function'&&liveCadence.choose(state,now(),priorityWorkId)?.preferred===true;
  if(selectionDue)next.catalogPriorityUsed=true;
  const catalogTurn = !requestedReply && !catalogPaused && !freshInventory && !selectionDue && state.kind === 'comments' && !state.workEnded && (!state.works.length || previewFirst && (state.catalogStreak || 0) < 2);
  next.lastWasInventory=false;
  next.catalogStreak = catalogTurn ? (state.catalogStreak || 0) + 1 : 0;
  next.lastWasLive = catalogTurn ? state.lastWasLive : false;
  // Fresh homepage checks have their own clock. They must not rewind the
  // historical root/reply cursors, wait for a huge archive to finish, or mark read.
  const live = previewFirst && typeof client.readLatest === 'function' && state.kind === 'comments';
  const stamp = now();
  const evidence=count=>({ownerUid:client.ownUid,...(count!==undefined&&client.source==='https://creator.douyin.com/'?{commentCount:count,commentCountSource:warmHistory.SOURCE}:{})});
  const completeHistory=()=>next.workEnded&&!next.works.length&&!next.headWorks?.some(work=>work.pendingWarmCheck);
  const progress=()=>({pages:next.pages,worksFound:next.seenWorks.length,worksDone:next.worksDone,rootPages:next.rootPages,replyPages:next.replyPages,followerPages:next.followerPages,...(state.kind==='comments'?{worksCatalogComplete:next.workEnded,...(next.catalogReadError?{catalogReadError:next.catalogReadError}:{})}:{})});
  const monitored=result=>{if(live&&result.complete){next.monitoringStarted=true;return{...result,monitoring:true,pollAfterMs:liveCadence.delay(next,stamp)};}return result;};
  // A changed selection can use the next admitted read for its owner-proven
  // head. Never fabricate an unseen target, rewind history, skip the existing
  // account cadence or let two live reads starve historical pagination.
  const picked=live?liveCadence.choose(state,stamp,priorityWorkId):undefined;
  const preferredHead=picked?.preferred?picked.work:undefined;
  const settled=live&&(state.workEnded||catalogPaused)&&!state.works.length;
  // Reloading catalog page zero destroys the site's in-flight pagination
  // observer. Finish its current continuation before periodic head refreshes.
  const inventoryDue=freshInventory||state.workEnded&&stamp-(state.inventoryAt??stamp)>=60000,headDue=!!picked&&(next.headWorks?.some(work=>work.pendingWarmCheck)||stamp-(state.headAt??stamp)>=(state.monitoringStarted?liveCadence.interval(state.headWorks?.length||0):15000));
  if(!requestedReply&&settled&&!preferredHead&&!inventoryDue&&!headDue)return monitored({records:[],works:[],phase:'本轮历史已同步，等待下一次更新检查',complete:completeHistory(),next,progress:progress()});
  if(previewFirst && state.kind==='followers' && !client.followerUi && !state.lastWasLive && state.pages && stamp-(state.followerHeadAt||stamp)>=15000) {
    onPhase?.('粉丝名单分页');
    const data=await client.readWeb('followers',{cursor:'0',offset:'0',sourceType:'1'});
    if(data.myself_user_id!==undefined&&c.id(data.myself_user_id,false)!==client.ownUid) throw Error('抖音粉丝更新不属于当前本人账号');
    if(!Array.isArray(data.followers)||data.followers.length>100) throw Error('抖音粉丝更新结构未识别，已有名单保留');
    more(data.has_more);
    records=data.followers.map(follower);
    next.seenFollowerIds=[...new Set([...(state.seenFollowerIds||[]),...records.map(row=>row.platformId)])];
    if(number(data.owner_follower_count)===undefined||number(data.owner_follower_count)!==next.followerExpectedCount)next.followerRosterPartial=true;
    if(next.seenFollowerIds.length>50000) throw Error('粉丝名单达到安全容量，旧缓存保留');
    next.followerHeadAt=stamp;next.lastWasLive=true;next.pages++;
    return {records,works:[],phase:'已检查最新粉丝，历史名单断点保留',complete:false,next,progress:{pages:next.pages,worksFound:0,worksDone:0,rootPages:0,replyPages:0,followerPages:next.followerPages}};
  }
  if(!requestedReply && live && !catalogTurn && (selectionDue||freshInventory||settled||!state.lastWasLive&&state.works.length) && (preferredHead || inventoryDue || headDue)) {
    if(inventoryDue) {
      onPhase?.('作品更新检查');
      let data;
      try{data=freshInventory?await client.readInventoryHead({restart:refreshLatest}):await client.readWeb('works',{cursor:'0'});}
      catch(error){
        if(!freshInventory||error?.code!=='OWNED_INVENTORY_HEAD_NOT_READY'||error.message!=='抖音本人主页作品首批尚未就绪，历史和粉丝断点保留')throw error;
        next.inventoryAt=stamp;next.lastWasInventory=true;next.pages++;
        return {records:[],works:[],phase:'本人主页新作品仍在加载；继续同步已核实作品的评论，原断点保留',complete:false,next,progress:progress(),inventoryPending:true};
      }
      if(!Array.isArray(data.aweme_list) || data.aweme_list.length>100) throw Error('抖音作品更新结构无效，旧缓存保留');
      more(data.has_more); next.headWorks ||= [];
      for(const row of data.aweme_list) {
        if(c.id(row.author?.uid,false)!==client.ownUid) throw Error('抖音作品更新作者不属于当前绑定账号');
        const id=c.id(row.aweme_id,false), title=c.clean(row.desc,1000), coverUrl=c.image(row.video?.cover?.url_list?.[0]||row.cover?.url_list?.[0]),commentCount=number(row.metrics?.comment_count);
        if(!next.seenWorks.includes(id)) {
          next.seenWorks.push(id);next.works.unshift({id,title,...(coverUrl?{coverUrl}:{}),cursor:'0',rootDone:false,replies:[],seenRoots:[]});
          next.headWorks.unshift({id,title,commentCount,...evidence(commentCount)});works.push({platformId:id,title,...(coverUrl?{coverUrl}:{}),...workOrder(row,data.aweme_list.indexOf(row)),...playbackFields(row,client.source,client.ownUid,stamp),...evidence(commentCount)});
        }else{const head=next.headWorks.find(work=>work.id===id);const changed=head&&commentCount!==undefined&&(head.commentCount!==undefined&&head.commentCount!==commentCount||head.commentCount===undefined&&head.historyComplete);if(changed)require('./douyin-comment-live.cjs').queueWorkRescan(next,head);works.push({platformId:id,title,...workOrder(row,data.aweme_list.indexOf(row)),...playbackFields(row,client.source,client.ownUid,stamp),...(coverUrl?{coverUrl}:{}),...(changed?{readComplete:false}:{}),...evidence(commentCount)});if(head&&commentCount!==undefined){head.commentCount=commentCount;Object.assign(head,evidence(commentCount));}}
      }
      if(next.seenWorks.length>5000) throw Error('抖音作品更新达到安全容量，旧缓存保留');
      appendHomepageOrder(data);next.inventoryAt=stamp;next.lastWasInventory=true;if(priorityWorkId)next.priorityHeadId=undefined;phase='已检查新作品，继续补齐历史评论';
    } else {
      const work=picked.work,nextHeadIndex=picked.index;
      const currentHead=next.headWorks.find(item=>item.id===work.id);currentHead.headCheckedAt=stamp;currentHead.pendingWarmCheck=false;
      if(preferredHead)next.priorityHeadId=work.id;
      let data;
      try { onPhase?.('评论更新检查');data=await client.readLatest(work.id); }
      catch(e) { if(!['OWNED_WORK_UNAVAILABLE','OWNED_COMMENT_SCHEMA_UNSUPPORTED'].includes(e?.code)) throw e;next.failedWorks=[...new Set([...(next.failedWorks||[]),work.id])];next.headIndex=nextHeadIndex;next.headAt=stamp;next.lastWasLive=true;return monitored({records:[],works:[{platformId:work.id,title:work.title,readComplete:false,readError:e.code==='OWNED_WORK_UNAVAILABLE'?'官网当前作品状态暂不支持查看详情数据，未判定为零评论':e.message.slice(0,160)}],phase:'此作品更新暂不可读取，继续其他作品',complete:completeHistory(),next,progress:progress()}); }
      if(!(Array.isArray(data.comments)||data.comments===null&&[false,0].includes(data.has_more))||(data.comments||[]).length>100) throw Error('抖音评论更新结构无效，历史断点保留');
      more(data.has_more);
      const completeRootIds=new Set();
      for(const row of data.comments||[]) {
        records.push({...comment(row,work),pageCursor:'0'});
        if(Array.isArray(row.reply_comment)) {
          if(row.reply_comment.length>100) throw Error('抖音评论更新回复预览超过容量');
          records.push(...row.reply_comment.map(child=>({...comment(child,work,commentIdentifier(row.cid,row.referenceKind==='legacy')),pageCursor:'0'})));
          if(row.reply_comment_complete===true){const expected=number(row.reply_comment_total),ids=row.reply_comment.map(child=>commentIdentifier(child.cid,child.referenceKind==='legacy'));if(!(expected>0&&ids.length===expected&&new Set(ids).size===expected))throw Error('抖音评论更新内嵌回复结束证明不一致');completeRootIds.add(commentIdentifier(row.cid,row.referenceKind==='legacy'));}
        }
      }
      const projectedHead=next.headWorks.find(item=>item.id===work.id),plan=require('./douyin-comment-live.cjs').queueHeadChanges(next,projectedHead,records,{hasMore:more(data.has_more),findRecord,completeRootIds});
      if(next.failedWorks?.includes(work.id)){require('./douyin-comment-live.cjs').queueWorkRescan(next,projectedHead);next.failedWorks=next.failedWorks.filter(id=>id!==work.id);plan.queued=true;}
      if(plan.queued)works.push({platformId:work.id,title:work.title,readComplete:false});
      else if(work.pendingWarmCheck)works.push({platformId:work.id,title:work.title,readComplete:true,historyCompletedAt:work.historyCompletedAt,...evidence(work.commentCount)});
      next.headIndex=nextHeadIndex;next.headAt=stamp;phase=preferredHead?'已优先检查选中作品，其他作品和历史断点保留':'已检查评论更新，历史分页断点保留';
    }
    next.pages++;next.lastWasLive=true;
    return monitored({records,works,phase,complete:completeHistory(),next,progress:progress()});
  }
  // Only re-order the owner-proven continuation. A renderer selection cannot
  // inject a work, rewind a cursor, or turn cached inventory into fresh proof.
  if (!requestedReply && state.kind === 'comments' && previewFirst && !catalogTurn && next.works.length) {
    const first = next.works.reduce((a, b) => (a.pagesRead || 0) <= (b.pagesRead || 0) ? a : b);
    const selected = next.works.find(w => w.id === priorityWorkId);
    const urgent=next.works.find(work=>work.replies.some(child=>child.livePriority)||work.liveRefresh&&work.cursor==='0');
    const chosenUrgent=urgent&&(next.urgentStreak||0)<2;
    const chosen = chosenUrgent?urgent:selected && (next.priorityStreak || 0) < 3 ? selected : first;
    next.urgentStreak=chosenUrgent?(next.urgentStreak||0)+1:0;
    next.priorityStreak = chosen === selected ? (next.priorityStreak || 0) + 1 : 0;
    next.works.splice(next.works.indexOf(chosen), 1); next.works.unshift(chosen);
  }
  const fetchPage = async (kind, args, generation) => {
    onPhase?.({works:'作品目录分页',comments:'作品评论分页',replies:'评论回复分页',followers:'粉丝名单分页'}[kind]);
    const marker = createHash('sha256').update(JSON.stringify([kind, kind === 'followers' ? { cursor: args.cursor, offset:args.offset, sourceType: args.sourceType } : args,...(generation?[generation]:[])])).digest('hex');
    if ((state.seenPages || []).includes(marker)) throw Error('抖音分页游标出现循环，已有数据和断点保留');
    const data = await client.readWeb(kind, args); next.seenPages ||= []; next.seenPages.push(marker); return data;
  };
  if (state.kind === 'followers') {
    let data;
    try{data=await fetchPage('followers', { cursor: state.cursor, offset: state.offset, sourceType: state.sourceType || '1' });}
    catch(error){
      // Only a typed, unrefused DOM readiness result may continue later. Keep
      // this very same cursor/window; network failures, owner mismatches,
      // challenges and platform refusals still stop without alternate reads.
      if(!client.followerUi||error?.readerCode!=='NOT_READY')throw error;
      const observed=client.diagnosticSnapshot?.()?.stats;
      next.followerIdleReads=observed?.followerStarted===0?Math.min(6,(Number.isSafeInteger(state.followerIdleReads)?state.followerIdleReads:0)+1):0;
      const delay=next.followerIdleReads>=6?60000:next.followerIdleReads>=3?30000:10000;
      return {records:[],works:[],phase:'官网粉丝面板仍在加载成员，稍后继续；原名单和分页断点保留',complete:false,next,progress:progress(),pollAfterMs:delay,followerPending:true};
    }
    next.followerIdleReads=0;
    if (data.myself_user_id !== undefined && c.id(data.myself_user_id, false) !== client.ownUid) throw Error('抖音粉丝数据不属于当前本人账号');
    const users = data.followers === null && [false, 0].includes(data.has_more) && number(data.total) === 0 ? [] : data.followers;
    if (!Array.isArray(users) || users.length > 100) throw Error('抖音粉丝名单结构未识别，未用粉丝总数代替名单');
    records = users.map(follower);
    next.seenFollowerIds = [...new Set([...(state.seenFollowerIds || []), ...records.map(r => r.platformId)])];
    const observedCount=number(data.owner_follower_count),regular=(state.sourceType||'1')==='1';
    if(!state.followerPages){next.followerExpectedCount=observedCount;next.followerRosterPartial=!regular||state.cursor!=='0'||observedCount===undefined;}
    else if(!regular||observedCount===undefined||observedCount!==state.followerExpectedCount)next.followerRosterPartial=true;
    if(regular)next.regularFollowerIds=[...new Set([...(state.regularFollowerIds||[]),...records.map(row=>row.platformId)])];
    if (next.seenFollowerIds.length > 50000) throw Error('粉丝名单达到本轮安全容量，未把未读取成员判定为取消关注');
    const switchToRegular = state.sourceType === '2' && data.rec_has_more === false;
    complete = !more(data.has_more) && !switchToRegular; total = number(data.total); stage = `followers:${state.sourceType || '1'}`;
    if (!complete) {
      // source_type=1 advances max_time with the returned min_time, not max_time.
      const cursor = c.id(data.min_time ?? (switchToRegular ? '0' : undefined)), offset = c.id(data.offset ?? state.offset);
      if (!switchToRegular && (!records.length || cursor === state.cursor && offset === state.offset)) throw Error('抖音粉丝分页游标与偏移量均未前进，已有名单保留');
      next.cursor = cursor; next.offset = offset;
      if (switchToRegular) { next.sourceType = '1'; next.cursor = '0'; next.offset = '0'; }
    }
    next.followerPages++; if(previewFirst)next.followerHeadAt ||= stamp; phase = '分页读取粉丝名单';
  } else if (catalogTurn) {
    let data;
    try{data=await fetchPage('works',{cursor:state.workCursor});}
    catch(error){
      // A successful creator response with a foreign author remains blocked at
      // THIS catalog cursor. Only an exact SAME creator/public owner proof may
      // isolate it; refusals, changed owners and untyped failures still stop all.
      // Previously owner-proven work reads are not an alternate catalog source.
      if(error?.code!=='OWNED_CATALOG_AUTHOR_MISMATCH'||error.message!=='抖音官方作品作者不属于当前绑定账号（归属关系：CREATOR_ID_SAME）'||client.source!=='https://creator.douyin.com/'||!live||!state.headWorks?.some(work=>work.ownerUid===client.ownUid))throw error;
      const retained=structuredClone(state);retained.catalogReadError='作品目录作者归属未通过，已停在原页；已核验作品继续同步';retained.catalogRetryRequested=false;retained.pages++;
      return {records:[],works:[],phase:retained.catalogReadError,complete:false,next:retained,progress:{...progress(),pages:retained.pages,catalogReadError:retained.catalogReadError}};
    }
    delete next.catalogReadError;delete next.catalogRetryRequested;
    if (!Array.isArray(data.aweme_list) || data.aweme_list.length > 100) throw Error('抖音作品分页结构未识别，不能开始按作品读取评论');
    const ended = !more(data.has_more), cursor = c.id(data.max_cursor ?? '0');
    if (!ended && (!data.aweme_list.length || cursor === state.workCursor)) throw Error('抖音作品分页未前进，未当作评论已取完');
    for (const row of data.aweme_list) {
      if (c.id(row.author?.uid, false) !== client.ownUid) throw Error('抖音作品作者不属于当前绑定账号，停止读取');
      const id = c.id(row.aweme_id, false); if (next.seenWorks.includes(id)) continue;
      const title = c.clean(row.desc, 1000), coverUrl = c.image(row.video?.cover?.url_list?.[0] || row.video?.origin_cover?.url_list?.[0] || row.cover?.url_list?.[0]),commentCount=number(row.metrics?.comment_count),fresh={platformId:id,...evidence(commentCount)},cached=live&&!state.forceHistory?findWork?.(id):undefined,warm=live&&warmHistory.canWarmHistory(fresh,cached,{forceHistory:state.forceHistory,now:stamp});
      works.push({ platformId: id, title, ...(coverUrl ? { coverUrl } : {}),...workOrder(row,next.seenWorks.length),...playbackFields(row,client.source,client.ownUid,stamp),...evidence(commentCount),...(warm?{readComplete:false,historyCompletedAt:cached.historyCompletedAt}:{}) });
      next.seenWorks.push(id);if(!warm)next.works.push({ id, title, ...(coverUrl ? { coverUrl } : {}), cursor: '0', rootDone: false, replies: [], seenRoots: [] });
      if(live) { next.headWorks ||= []; next.headWorks.push({id,title,commentCount,...evidence(commentCount),...(warm?{historyComplete:true,historyCompletedAt:cached.historyCompletedAt,pendingWarmCheck:true}:{})});if(warm){next.monitoringStarted=true;next.worksDone++;} }
    }
    appendHomepageOrder(data);
    if (next.seenWorks.length > 5000) throw Error('抖音作品超过本轮5000条安全上限，未声称全量');
    if (!ended && next.seenWorks.length === state.seenWorks.length) throw Error('抖音重复返回已读取作品，当前评论覆盖尚未完整');
    next.workCursor = cursor; next.workEnded = ended; complete = completeHistory();
    if(live) {next.inventoryAt ||= stamp;next.headAt ||= stamp;}
    phase = next.headWorks?.some(work=>work.pendingWarmCheck)?'已复用已核实历史缓存，继续检查更新与缺失分页':'发现本人作品，准备逐一读取评论'; stage = 'works';
  } else {
    const work = next.works[0]; if (!work) throw Error('抖音作品队列为空，当前续传状态无效');
    const liveChild=previewFirst&&(work.liveReplyStreak||0)<2?work.replies.find(child=>child.livePriority):undefined;
    const child = requestedReply || liveChild || (previewFirst && !work.rootDone ? undefined : work.replies[0]), route = child ? 'replies' : 'comments';
    work.liveReplyStreak=liveChild?(work.liveReplyStreak||0)+1:0;
    let data;
    try { data = await fetchPage(route, { workId: work.id, cursor: child?.cursor || work.cursor, ...(child ? { commentId: child.id } : {}) },child?.monitorEpoch||work.monitorEpoch);if(!child&&work.cursor==='0')work.rootScanStarted=true; }
    catch (e) {
      // Only an exact owner-proven disabled-card gate or a typed parser
      // compatibility failure is per-work, with its actual reason retained.
      // Authentication, permissions, HTTP/platform errors and unknown failures
      // still stop this account at its original continuation, never skip them.
      if (!['OWNED_WORK_UNAVAILABLE', 'OWNED_COMMENT_SCHEMA_UNSUPPORTED'].includes(e?.code)) throw e;
      next.failedWorks=[...new Set([...(next.failedWorks||[]),work.id])];next.works.shift();next.pages++;
      works.push({ platformId: work.id, title: work.title, readError: e.code==='OWNED_WORK_UNAVAILABLE' ? '官网当前作品状态暂不支持查看详情数据，未判定为零评论' : e.message.slice(0,160) });
      return monitored({ records, works, phase: '部分作品评论未能读取，继续其他作品', complete: completeHistory(), next, progress: { ...progress(), worksFailed: next.failedWorks.length } });
    }
    if (!(Array.isArray(data.comments) || data.comments === null && [false, 0].includes(data.has_more)) || (data.comments || []).length > 100) throw Error('抖音评论分页结构未识别，已有评论保留');
    const ended = !more(data.has_more), cursor = c.id(data.cursor ?? '0'), raw = data.comments || [];
    if (!ended && (!raw.length || cursor === (child?.cursor || work.cursor))) throw Error('抖音评论分页游标未前进，尚未取完');
    records = raw.map(row => ({ ...comment(row, work, child?.id), pageCursor: child?.cursor || work.cursor }));
    work.pagesRead = (work.pagesRead || 0) + 1;
    if (child) {
      if (!raw.length && number(data.total) > child.loaded) throw Error('抖音子评论提前返回空页，不能判定全部完成');
      child.loaded += raw.length; next.replyPages++;
      if (ended) {const root=findRecord?.(child.id,work.id),expected=Math.max(number(data.total)||0,number(child.expected)||0);if(root){const partial=child.loaded<expected;records.push({...root,repliesReadState:partial?'partial':'complete',repliesReadReason:partial?'官网回复列表已到末页，但返回条数少于声明数量；其余内容尚不能确认，不会显示为仍在后台同步':undefined});}work.replies.splice(work.replies.indexOf(child),1);} else child.cursor = cursor;
    } else {
      next.rootPages++; work.rootDone = ended; work.cursor = cursor;
      for (const row of raw) {
        const id = commentIdentifier(row.cid, row.referenceKind === 'legacy'); if (!id) throw Error('抖音根评论标识无效'); if (work.seenRoots.includes(id)) continue; work.seenRoots.push(id);
        const expected = number(row.reply_comment_total), preview = row.reply_comment;
        const embeddedComplete = row.reply_comment_complete === true && Array.isArray(preview) && expected > 0 && preview.length === expected && new Set(preview.map(r => commentIdentifier(r.cid, r.referenceKind === 'legacy'))).size === expected;
        if (row.reply_comment_complete === true && !embeddedComplete) throw Error('抖音内嵌回复数量与结束证明不一致');
        if (expected > 0 && !embeddedComplete && !work.replies.some(child=>child.id===id)) work.replies.push({ id, cursor: '0', loaded: 0,expected });
        if(embeddedComplete){const root=records.find(row=>row.platformId===id&&!row.parentPlatformId);if(root)root.repliesReadState='complete';}
        // Partial/visible previews still queue a real reply page. Only a
        // complete embedded GET with the exact declared total may finish here.
        if (Array.isArray(row.reply_comment)) { if (row.reply_comment.length > 100) throw Error('抖音单条评论预览过大，已暂停读取'); records.push(...row.reply_comment.map(r => ({ ...comment(r, work, id), pageCursor: '0' }))); }
      }
      if (work.seenRoots.length > 50000 || work.replies.length > 10000) throw Error('此作品评论超过本轮安全容量，已有评论和原断点保留');
    }
    stage = `${route}:${work.id}:${child?.id || ''}${child?.monitorEpoch||work.monitorEpoch?':monitor-'+(child?.monitorEpoch||work.monitorEpoch):''}`; phase = child ? '逐页读取评论回复' : '逐页读取作品评论';
    if (work.rootDone && !work.replies.length) { if(work.rescanRequested){require('./douyin-comment-live.cjs').resetForRescan(next,work);phase='继续补齐监控期间新增的评论';}else{next.works.shift();if(!work.completionCounted)next.worksDone++;const head=next.headWorks?.find(item=>item.id===work.id);if(head){head.historyComplete=true;if(work.rootScanStarted)head.historyCompletedAt=new Date(stamp).toISOString();}works.push({platformId:work.id,title:work.title,readComplete:true,...evidence(head?.commentCount),...(head?.historyCompletedAt?{historyCompletedAt:head.historyCompletedAt}:{})});} }
    complete = completeHistory();
  }
  const signature = records.length ? createHash('sha256').update(records.map(r => `${r.workId || ''}:${r.platformId}`).join('|')).digest('hex') : undefined;
  if (!complete && signature && state.lastStage === stage && state.lastSignature === signature) throw Error('抖音重复返回相同分页，已停止并保留已有结果');
  next.lastStage = stage; next.lastSignature = signature; next.pages++;
  let followerRosterVerified=state.kind==='followers'&&complete&&!next.followerRosterPartial&&number(next.followerExpectedCount)!==undefined&&(next.regularFollowerIds||[]).length===next.followerExpectedCount;
  // Equal totals can hide one follow plus one unfollow mid-scan. A live head
  // observed outside the alleged full roster invalidates reconciliation too.
  if(followerRosterVerified){const regular=new Set(next.regularFollowerIds||[]);followerRosterVerified=(next.seenFollowerIds||[]).every(id=>regular.has(id));}
  if(state.kind==='followers'&&complete&&!followerRosterVerified)phase='平台可访问粉丝分页已到末页，未确认全量；未把缺失成员判为取关';
  return monitored({ records, works, total, phase, complete, ...(state.kind === 'followers' ? {followerRosterVerified,...(followerRosterVerified?{currentFollowerIds:next.regularFollowerIds}:{})} : {}), next, progress: progress() });
}
function independentFollowerScope(scope,events,at=Date.now()){
  if(typeof scope!=='string'||!scope||scope.length>1024||!Array.isArray(events)||events.length>256||!Number.isFinite(at))return false;
  const tag=createHash('sha256').update(scope).digest('hex');
  // This selects a read transport, NEVER supplies authorization. Only a
  // recent, exact native scope's failure BEFORE HTTP qualifies, not a server
  // refusal/challenge, generic timeout, or another account's failure.
  return events.some(e=>e?.scope===tag.slice(0,24)&&e.kind==='followers'&&e.stage==='follower-avatar'&&e.code==='avatar-request-not-started'&&typeof e.at==='string'&&at>=Date.parse(e.at)&&at-Date.parse(e.at)<=24*60*60*1000);
}
function registerDouyinInteractions({ ipcMain, getWindow, authenticate, session, transportFactory, followerAvatarProfileReader, openFollowerReader, safeStorage, userData, interactionImageLoader, diagnostics,onComments=()=>{}, now = Date.now }) {
  if (typeof transportFactory !== 'function') throw Error('抖音网页只读采集器未注册');
  const continuations = new Map(), busy = new Set(), actionQueue = new Set(), nextAllowed = new Map(), caches = new Map();let closed=false;
  const cacheFor = (scope, kind) => {
    if (!safeStorage || !userData) return;
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw Error('本机安全加密不可用，未明文保存互动缓存');
    const key = JSON.stringify([scope, kind]);
    if (!caches.has(key)) {
      if (caches.size >= 16) caches.delete(caches.keys().next().value);
      caches.set(key, require('./douyin-interaction-cache.cjs').createInteractionCache({ directory: require('node:path').join(userData, 'douyin-interactions'), scope: key, protect: text => safeStorage.encryptString(text), unprotect: bytes => safeStorage.decryptString(bytes) }));
    }
    return caches.get(key);
  };
  const independent=scope=>independentFollowerScope(scope,diagnostics?.snapshot?.().events,now());
  const pagination=typeof openFollowerReader==='function'?require('./douyin-follower-pagination.cjs').registerFollowerPagination({ipcMain,getWindow,authenticate,read:openFollowerReader,cacheFor,project:follower,failure:error=>interactionFailure(error,'粉丝名单分页'),diagnostics,now}):undefined;
  const panelBusy=new Set();
  if(typeof openFollowerReader==='function')ipcMain.handle('matrix:douyin-open-followers',async(event,input)=>{
    let key,locked=false,ended=false;const budget=createOperationBudget(25000);
    try{
      const win=getWindow();
      if(closed||!win||win.isDestroyed?.()||event.sender!==win.webContents)throw Error('仅允许远效主窗口读取已打开的粉丝面板');
      if(!input||Object.keys(input).some(k=>!['accessToken','accountId','webContentsId'].includes(k))||typeof input.accessToken!=='string'||!input.accessToken||typeof input.accountId!=='string'||!input.accountId||!Number.isSafeInteger(input.webContentsId)||input.webContentsId<=0||typeof openFollowerReader!=='function')throw Error('官网粉丝面板读取参数无效');
      const auth=await budget.run(()=>authenticate(input.accessToken,input.accountId),'验证官网粉丝账号',8000),account=auth.account;
      if(!account||account.id!==input.accountId||account.platform!=='douyin'||!/^[a-f0-9-]{16,80}$/i.test(account.connectorSessionId||'')||typeof account.nativeAccountKey!=='string'||!account.nativeAccountKey)throw Error('请在账号管理绑定抖音本人账号');
      const scope=JSON.stringify([auth.userId,account.id,account.connectorSessionId,account.nativeAccountKey]);
      key=scope;if(panelBusy.has(key))throw Error('此账号的官网粉丝面板正在读取');panelBusy.add(key);locked=true;
      const guard=async()=>{
        budget.check();if(closed||ended)throw Error('本次官网粉丝面板读取已结束');
        const fresh=await budget.run(()=>authenticate(input.accessToken,input.accountId),'复核官网粉丝账号',8000);
        if(closed||ended||fresh.account?.platform!=='douyin'||JSON.stringify([fresh.userId,fresh.account?.id,fresh.account?.connectorSessionId,fresh.account?.nativeAccountKey])!==scope)throw Error('账号绑定已变化，本次粉丝面板结果丢弃');
      };
      const result=await budget.run(()=>openFollowerReader({account,webContentsId:input.webContentsId,assertCurrent:guard}),'读取已打开官网粉丝面板',12000);
      const records=result.followers.map(follower);
      if(new Set(records.map(row=>row.platformId)).size!==records.length)throw Error('官网粉丝面板成员重复，未保存本次结果');
      await guard();
      const cache=cacheFor(scope,'followers');if(!cache)throw Error('互动缓存不可用，未保存官网粉丝面板');
      const previousPanel=cache.panelSync();
      cache.merge({kind:'followers',records,complete:false,capturedAt:new Date(now()).toISOString(),...(previousPanel?{followerPanelSync:{...previousPanel,status:'paused',reason:'已手动合并当前成员，请重新自动核验官网末页',updatedAt:new Date(now()).toISOString()}}:{})});
      try{diagnostics?.record(scope,{kind:'followers',stage:'open-follower-panel',code:'read-ok',stats:{recordCount:records.length,avatarSources:records.filter(row=>row.avatarUrl).length,complete:false}});}catch{}
      return {accountId:account.id,sessionId:account.connectorSessionId,loaded:records.length,avatars:records.filter(row=>row.avatarUrl).length,complete:false};
    }catch(error){return {error:interactionFailure(error,'粉丝名单分页')};}
    finally{ended=true;if(locked)panelBusy.delete(key);}
  });
  const followerAvatars=require('./douyin-follower-avatar.cjs').createFollowerAvatarLookup({session,profileReader:typeof followerAvatarProfileReader==='function'?input=>followerAvatarProfileReader({...input,independent:independent(input.diagnosticScope)}):undefined,now,onResult:({scope,code,avatarSources})=>{
    if(scope)diagnostics?.record(scope,{kind:'followers',stage:'follower-avatar',code,stats:{avatarSources}});
  }});
  const images=require('./douyin-interaction-image.cjs').registerInteractionImages({ipcMain,getWindow,authenticate,userData,safeStorage,imageLoader:interactionImageLoader,resolveRecord:(scope,kind,recordId,workId)=>cacheFor(scope,kind)?.findRecord(recordId,workId),resolveFollowerAvatar:input=>followerAvatars.read(input),storeFollowerAvatar:(scope,id,row,urls)=>cacheFor(scope,'followers')?.supplementFollowerAvatar(id,row,urls),onFollowerAvatarDisplayed:scope=>diagnostics?.record(scope,{kind:'followers',stage:'follower-avatar-display',code:'read-ok',stats:{avatarSources:1}})});
  const handle = async (event, input, beforeCommit) => {
    let client, scope, readerDiagnostic, acquired = false, queued = false, ended = false, actionReserved = false, readerStage='参数校验'; const budget = createOperationBudget(['like','reply'].includes(input?.command) ? 60000 : 45000);
    try {
      if(closed)throw Error('抖音互动读取已结束');
      const win = getWindow(); if (!win || win.isDestroyed?.() || event.sender !== win.webContents) throw Error('只允许远效主窗口读取抖音互动');
      if (!input || Object.keys(input).some(k => !['accessToken', 'accountId', 'kind', 'cursor', 'command', 'priorityWorkId','priorityCommentId','forceHistory','refreshLatest','refreshFollowers', 'workId', 'commentId', 'liked', 'text', 'requestId'].includes(k)) || !['comments', 'followers'].includes(input.kind) || input.command !== undefined && !['cache','like','reply'].includes(input.command) || input.command === 'cache' && input.cursor !== undefined || input.priorityWorkId !== undefined && (input.kind !== 'comments' || !/^[1-9]\d{0,18}$/.test(input.priorityWorkId))||input.priorityCommentId!==undefined&&(input.kind!=='comments'||input.command!==undefined||!input.priorityWorkId||!commentIdentifier(input.priorityCommentId,true))||input.refreshLatest!==undefined&&(typeof input.refreshLatest!=='boolean'||input.kind!=='comments'||input.command!==undefined)||input.refreshFollowers!==undefined&&(typeof input.refreshFollowers!=='boolean'||input.kind!=='followers'||input.command!==undefined||input.cursor!==undefined)||input.forceHistory!==undefined&&(typeof input.forceHistory!=='boolean'||input.kind!=='comments'||input.command!==undefined||input.cursor!==undefined)) throw Error('不支持的抖音互动操作');
      const action = ['like','reply'].includes(input.command);
      if (!action && ['workId','commentId','liked','text','requestId'].some(k => input[k] !== undefined) || action && (input.kind !== 'comments' || input.cursor !== undefined || input.priorityWorkId !== undefined || !/^[1-9]\d{0,18}$/.test(input.workId || '') || !commentIdentifier(input.commentId,true) || !require('./douyin-inbox-send.cjs').clientId(input.requestId) || input.command === 'like' && (typeof input.liked !== 'boolean' || input.text !== undefined) || input.command === 'reply' && (input.liked !== undefined || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 500 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(input.text)))) throw Error('评论操作参数无效，未提交');
      readerStage='账号验证';const auth = await budget.run(() => authenticate(input.accessToken, input.accountId), '验证互动账号', 8000), account = auth.account;
      if (!account || account.id !== input.accountId || account.platform !== 'douyin' || !/^[a-f0-9-]{16,80}$/i.test(account.connectorSessionId || '') || !account.nativeAccountKey) throw Error('请在账号管理绑定抖音本人账号');
      scope = JSON.stringify([auth.userId, account.id, account.connectorSessionId, account.nativeAccountKey]);
      if (input.command === 'cache') {
        readerStage='读取缓存';
        const saved = cacheFor(scope, input.kind)?.get();
        const fresh = await budget.run(() => authenticate(input.accessToken, input.accountId), '复核互动缓存账号', 8000);
        if (fresh.account?.platform !== 'douyin' || JSON.stringify([fresh.userId, fresh.account?.id, fresh.account?.connectorSessionId, fresh.account?.nativeAccountKey]) !== scope) throw Error('账号绑定已变化，未返回旧互动缓存');
        const storedPanel=input.kind==='followers'?saved?.followerPanelSync:undefined,panel=storedPanel?{...storedPanel,status:storedPanel.status==='complete'?'complete':pagination?.state(scope)?.status||'paused'}:undefined;
        return { accountId: account.id, sessionId: account.connectorSessionId, platform: 'douyin', kind: input.kind, fromCache: true, records: saved?.records || [], works: saved?.works || [], capturedAt: saved?.capturedAt, complete: saved?.complete || false, progress: saved?.progress, ...(panel?{followerPanelSync:panel}:{}),phase:panel?panel.reason||'官网分页进度已保留；可在账号管理继续同步':'本机缓存，后台检查更新' };
      }
      if (actionQueue.has(scope)) throw Error('此抖音账号正在处理评论，请稍候');
      if(input.kind==='followers'&&cacheFor(scope,'followers')?.panelSync())throw Error('此账号已启用官网面板分页，请在账号管理继续或重新开始；已有名单保留');
      if (action) {
        actionQueue.add(scope); queued = true; const until = now() + 23000;
        // User intent gets the next account lane, but never interrupts a read
        // mid-page or bypasses its safety floor. There is still only one POST.
        while (busy.has(scope) || (nextAllowed.get(scope) || 0) > now()) {
          if(closed)throw Error('抖音互动读取已结束，评论操作未提交');
          if (now() >= until) throw Error('当前账号读取尚未结束，评论操作未提交，请稍候');
          await new Promise(resolve => setTimeout(resolve, 250)); budget.check();
        }
        const fresh = await authenticate(input.accessToken, input.accountId);
        if (JSON.stringify([fresh.userId,fresh.account?.id,fresh.account?.connectorSessionId,fresh.account?.nativeAccountKey]) !== scope) throw Error('账号绑定已变化，评论操作未提交');
      }
      if (busy.has(scope)) throw Error('此抖音账号正在读取另一页，请稍候');
      if ((nextAllowed.get(scope) || 0) > now()) throw Error('抖音分页读取过于频繁，请稍后继续，已有结果保留');
      for (const [id, value] of continuations) if (value.expires <= now()) continuations.delete(id);
      const previous = input.cursor === undefined ? undefined : typeof input.cursor === 'string' && continuations.get(input.cursor);
      if (continuations.size >= 128 && !previous) throw Error('本机互动分页会话达到上限，请稍候继续');
      if (input.cursor !== undefined && (!previous || previous.scope !== scope || previous.state.kind !== input.kind)) throw Error('抖音分页凭据不属于当前账号或已过期，请重新读取');
      const state = previous ? previous.state : {...initial(input.kind),forceHistory:input.forceHistory===true}; busy.add(scope); acquired = true;
      const assertCurrent = async () => { budget.check(); if (ended||closed) throw Error('本次抖音读取已结束'); const fresh = await budget.run(() => authenticate(input.accessToken, input.accountId), '复核互动账号', 8000); if (ended || closed || fresh.account?.platform !== 'douyin' || JSON.stringify([fresh.userId, fresh.account?.id, fresh.account?.connectorSessionId, fresh.account?.nativeAccountKey]) !== scope) throw Error('账号绑定已变化，当前页面结果丢弃'); };
      readerStage='准备官网采集页';
      if(input.refreshFollowers===true)diagnostics?.record(scope,{kind:'followers',stage:'prepare',code:'read-ok',stats:{followerRefreshRequested:true}});
      client = await budget.run(async () => { const value = await transportFactory({ kind: input.kind, accountSession: session.fromPartition('persist:matrix-douyin-' + account.connectorSessionId), publicHandle: account.nativeAccountKey, assertCurrent,independent:input.kind==='followers'&&independent(scope),...(input.kind==='followers'?{onDiagnostic:value=>{if(!ended)readerDiagnostic=value;}}:{}),...(input.refreshFollowers===true?{refreshFollowers:true}:{}) }); if (ended) { value.close(); throw Error('本次抖音读取已结束'); } return value; }, '准备官网只读采集页', 25000);
      if(input.refreshFollowers===true){const generation=client.diagnosticSnapshot?.().stats?.followerCollectorGeneration;if(Number.isSafeInteger(generation)&&generation>0&&generation<=2147483647)diagnostics?.record(scope,{kind:'followers',stage:'prepare',code:'collector-recreated',stats:{followerRefreshRequested:true,followerCollectorGeneration:generation}});}
      if (action) {
        readerStage='评论操作';
        const cache = cacheFor(scope, 'comments'), saved = cache?.get();
        const row = saved?.records.find(r => r.workId === input.workId && r.platformId === input.commentId);
        if (!row || !saved.works.some(w => w.platformId === input.workId) || typeof client.actComment !== 'function') throw Error('目标评论尚未通过本人作品缓存核验，未提交');
        const fingerprint = createHash('sha256').update(JSON.stringify([input.command,input.workId,input.commentId,input.text,input.liked])).digest('hex');
        const old = cache.action(input.requestId);
        if (old) { if (old.fingerprint !== fingerprint) throw Error('操作编号已用于其他评论或正文，未提交'); await assertCurrent(); return { accountId: account.id, sessionId: account.connectorSessionId, receipt: old.receipt }; }
        const pending = { state: 'unknown', message: '评论操作结果尚未确认，请先核对，勿重复提交' };
        let reserved = false, receipt;
        const reserve = async () => { await assertCurrent(); if(beforeCommit)await beforeCommit();await assertCurrent();cache.action(input.requestId, { fingerprint, receipt: pending }); reserved = true; actionReserved = true; };
        const root = row.parentPlatformId ? saved.records.find(r => r.workId === row.workId && r.platformId === row.parentPlatformId) : row;
        try { receipt = await budget.run(() => client.actComment({ action: input.command, workId: row.workId, commentId: row.platformId, parentPlatformId: row.parentPlatformId, pageCursor: row.pageCursor || '0', rootCursor: root?.pageCursor || '0', text: input.text, liked: input.liked, nonce: input.requestId }, reserve), '处理目标评论', 20000); await assertCurrent(); }
        catch (e) { if (!reserved) throw e; receipt = pending; }
        if (!['confirmed','failed','unknown'].includes(receipt?.state)) receipt = pending;
        const like = input.command === 'like' ? projectLikeReceipt(row,receipt,input.liked) : undefined;
        if (like) receipt = like.receipt;
        const actionRecords=like?.row?[like.row]:[];
        let created;
        if (receipt.state === 'confirmed' && input.command === 'reply' && commentIdentifier(receipt.commentId,true)) {
          created = { platformId: receipt.commentId, platformUserId: client.ownUid, author: account.nickname || '当前账号', avatarUrl: c.image(account.avatarUrl), content: c.clean(input.text,500), workId: row.workId, workTitle: row.workTitle, parentPlatformId: row.parentPlatformId || row.platformId, ...(!/^\d+$/.test(receipt.commentId) ? { referenceKind: 'legacy' } : {}) };
          const parent = saved.records.find(r => r.workId === row.workId && r.platformId === created.parentPlatformId);
          const exists = saved.records.some(r => r.workId === created.workId && r.platformId === created.platformId);
          actionRecords.push(created,...(parent && !exists && parent.replyCount !== undefined ? [{ ...parent, replyCount: parent.replyCount + 1 }] : []));
        }
        // The reserved unknown receipt is durable before the POST. Final
        // receipt and affected rows then share ONE encrypted atomic commit,
        // rather than encrypting the entire history separately for each.
        cache.merge({records:actionRecords,works:[],complete:saved.complete,action:{id:input.requestId,value:{fingerprint,receipt}}});
        nextAllowed.set(scope, now() + 4000);
        return { accountId: account.id, sessionId: account.connectorSessionId, receipt, ...(created||like?.row ? { records: created?[created]:[like.row] } : {}) };
      }
      if (previous && previous.ownUid !== client.ownUid) throw Error('抖音官方身份已变化，原分页不能移到另一个账号');
      if (previous?.cachedResult) { await assertCurrent(); nextAllowed.set(scope, now() + 4000); return structuredClone(previous.cachedResult); }
      const result = await budget.run(() => readPage(client, state, { previewFirst: true, priorityWorkId: input.priorityWorkId,priorityCommentId:input.priorityCommentId,refreshLatest:input.refreshLatest===true,now,findRecord:(id,workId)=>cacheFor(scope,'comments')?.findRecord(id,workId),findWork:id=>cacheFor(scope,'comments')?.findWork(id),onPhase:phase=>{readerStage=phase;} }), '获取互动分页', 20000);
      const completedReadStage=readerStage;readerStage='本人身份复核';await assertCurrent();
      readerStage='保存互动缓存';
      const observedRecords=result.records;
      if(input.kind==='comments'&&account.nativeAccountKey)for(const work of result.works||[]){
        if(work.ownerUid===client.ownUid&&work.playCountSource==='douyin-creator-play-count-v1')work.playbackAccountKey=account.nativeAccountKey;
      }
      const capturedAt=new Date(now()).toISOString(),cachedPage=result.followerPending?undefined:cacheFor(scope, input.kind)?.merge({ ...result, kind:input.kind, capturedAt });
      if(cachedPage?.records)result.records=cachedPage.records;
      if(cachedPage?.works){
        const saved=new Map(cachedPage.works.map(work=>[work.platformId,work]));
        result.works=(result.works||[]).map(work=>{
          const stored=saved.get(work.platformId);if(!stored)return work;
          const enriched={...work};
          // Only enrich playback. Cached completion flags must not override
          // the current scan's explicit force-history/pagination semantics.
          for(const key of ['playCount','playObservedAt','playCountSource','playbackAccountKey','playbackHistory']){
            if(Object.hasOwn(stored,key))enriched[key]=stored[key];else delete enriched[key];
          }
          return enriched;
        });
      }
      let nextCursor;
      readerStage='生成续传凭据';
      if (!result.complete||input.kind==='comments'&&result.monitoring===true) { nextCursor = randomUUID(); continuations.set(nextCursor, { scope, ownUid: client.ownUid, state: result.next, parent: input.cursor, expires: now() + 30 * 60 * 1000 }); }
      // Commit continuation only after full validation. Failed pages can retry
      // the old cursor. Keep one completed page for idempotent replay if the
      // renderer misses a reply, retiring its predecessor only on advancement.
      if (previous?.parent) continuations.delete(previous.parent);
      if (nextAllowed.size > 256) for (const [key, at] of nextAllowed) if (at <= now()) nextAllowed.delete(key);
      nextAllowed.set(scope, now() + 4000);
      const response = { accountId: account.id, sessionId: account.connectorSessionId, platform: 'douyin', kind: input.kind, source: client.source === 'https://creator.douyin.com/' ? client.source : 'https://www.douyin.com/', capturedAt, records: result.records, works: result.works, currentFollowerIds: result.currentFollowerIds, followerRosterVerified:result.followerRosterVerified,...(input.priorityCommentId?{replyReadPending:!observedRecords.some(row=>row.workId===input.priorityWorkId&&row.platformId===input.priorityCommentId&&!row.parentPlatformId&&['complete','partial'].includes(row.repliesReadState))}:{}),...(result.followerPending===true?{followerPending:true}:{}), total: result.total, complete: result.complete, monitoring:result.monitoring===true,pollAfterMs:result.pollAfterMs,nextCursor, phase: result.phase, progress: result.progress, coverage: '本轮官方会话可访问的分页数据；隐藏、已删除或平台未返回的内容无法保证获取' };
      if(input.kind==='comments'){
       const intakeController=new AbortController();
       try{
        const intake=await createOperationBudget(12000).run(()=>onComments({userId:auth.userId,account,ownUid:client.ownUid,records:observedRecords,signal:intakeController.signal}),'接收本地新评论',12000);
        if(intake?.kind==='operations-intake')response.automationIntake={status:intake.status==='complete'?'complete':'partial',...Object.fromEntries(['received','eligible','confirmed','unconfirmed','unprocessed','skipped'].filter(key=>Number.isSafeInteger(intake[key])&&intake[key]>=0&&intake[key]<=50000).map(key=>[key,intake[key]]))};
       }catch{response.automationIntake={status:'partial'};}
       finally{intakeController.abort();}
       await assertCurrent();
      }
      if (previous) previous.cachedResult = structuredClone(response);
      try{const inventory=completedReadStage==='作品更新检查'?client?.inventoryDiagnostics?.():undefined,readerDiagnostic=input.kind==='followers'?client?.diagnosticSnapshot?.():undefined;diagnostics?.record(scope,{kind:input.kind,stage:completedReadStage,code:result.followerPending?'page-not-ready':result.inventoryPending?'inventory-head-waiting':result.progress?.catalogReadError?'catalog-paused':'read-ok',...(readerDiagnostic?.hint?{hint:readerDiagnostic.hint}:{}),stats:{...readerDiagnostic?.stats,...(input.kind==='comments'?commentTimeStats(result.records):{}),...Object.fromEntries(['inventoryHeadLinks','inventoryHeadCards','inventoryHeadOwned','inventoryHeadForeign','inventoryHeadUnknown','inventoryHeadItemAnchors','inventoryHeadOwnTab','inventoryHeadExpected'].filter(key=>Number.isSafeInteger(inventory?.[key])&&inventory[key]>=0&&inventory[key]<=50000).map(key=>[key,inventory[key]])),...(input.kind==='followers'?{followerRosterVerified:result.followerRosterVerified===true,...(Number.isSafeInteger(result.next?.followerExpectedCount)?{followerRosterExpected:result.next.followerExpectedCount}:{}),followerRosterSeen:Array.isArray(result.next?.regularFollowerIds)?result.next.regularFollowerIds.length:0}:{}),recordCount:result.records?.length||0,workCount:result.works?.length||0,avatarSources:result.records?.filter(row=>row.avatarUrl).length||0,imageSources:result.records?.filter(row=>row.images?.length).length||0,...Object.fromEntries(['worksFound','worksDone','rootPages','replyPages','followerPages'].filter(key=>Number.isSafeInteger(result.progress?.[key])).map(key=>[key,result.progress[key]])),complete:result.complete===true,catalogComplete:result.next?.workEnded===true}});}catch{}
      // Release only after cache, continuation and replay evidence are ready.
      // A failed/unfinished page keeps its exact official pagination window.
      if(input.kind==='comments'&&cachedPage&&result.next?.workEnded===true){try{client.releaseCompletedCatalog?.();}catch{/* Resource cleanup cannot change an already committed result. */}}
      return response;
    } catch (e) {
      if (scope && acquired) nextAllowed.set(scope, now() + 15000);
      if(scope)try{diagnostics?.record(scope,{kind:input.kind,stage:readerStage,code:require('./douyin-sync-diagnostics.cjs').classifySyncFailure(e),...(client?.diagnosticSnapshot?.()||readerDiagnostic)});}catch{}
      if (actionReserved) return { error: '评论操作结果未确认，回执或缓存保存未完成；请核对原评论，勿重复提交' };
      return { error: interactionFailure(e,readerStage) };
    } finally { ended = true; client?.close(); if (acquired) busy.delete(scope); if (queued) actionQueue.delete(scope); }
  };
  ipcMain.handle('matrix:douyin-interactions',handle);
  async function directoryAccess(input){
    if(closed||!input||Object.keys(input).some(k=>!['accessToken','accountId','offset','limit','query','ids'].includes(k))||typeof input.accessToken!=='string'||!input.accessToken||typeof input.accountId!=='string')throw Error('粉丝目录读取参数无效');
    const auth=await authenticate(input.accessToken,input.accountId),account=auth.account;
    if(!account||account.id!==input.accountId||account.platform!=='douyin'||!account.connectorSessionId||!account.nativeAccountKey)throw Error('请选择已绑定的抖音账号');
    const scope=JSON.stringify([auth.userId,account.id,account.connectorSessionId,account.nativeAccountKey]),cache=cacheFor(scope,'followers');if(!cache)throw Error('粉丝目录缓存不可用，未当作空名单');
    const result=cache.directorySlice({offset:input.offset,limit:input.limit,query:input.query,ids:input.ids});
    const fresh=await authenticate(input.accessToken,input.accountId);if(closed||fresh.account?.platform!=='douyin'||JSON.stringify([fresh.userId,fresh.account?.id,fresh.account?.connectorSessionId,fresh.account?.nativeAccountKey])!==scope)throw Error('粉丝目录账号绑定已变化，结果未采用');
    return{accountId:account.id,sessionId:account.connectorSessionId,platform:'douyin',...result};
  }
  async function verifyOperationComment(input){
    let scope,client,reserved=false,acquired=false,ended=false;const budget=createOperationBudget(60000);
    try{
      if(closed||!input||typeof input.accessToken!=='string'||typeof input.accountId!=='string'||!input.message||Object.keys(input).some(k=>!['accessToken','accountId','message'].includes(k)))throw Error('原生评论来源核验参数无效');
      const auth=await budget.run(()=>authenticate(input.accessToken,input.accountId),'核验原生评论账号',8000),a=auth.account;if(a?.platform!=='douyin'||a.id!==input.accountId||!a.connectorSessionId||!a.nativeAccountKey)throw Error('请选择原评论所属的已绑定抖音账号');scope=JSON.stringify([auth.userId,a.id,a.connectorSessionId,a.nativeAccountKey]);
      const guard=async()=>{budget.check();if(ended||closed)throw Error('原生评论核验已结束');const fresh=await budget.run(()=>authenticate(input.accessToken,input.accountId),'复核原生评论账号',8000);if(ended||closed||fresh.account?.platform!=='douyin'||JSON.stringify([fresh.userId,fresh.account?.id,fresh.account?.connectorSessionId,fresh.account?.nativeAccountKey])!==scope)throw Error('原评论账号绑定已变化，未采用来源证明');};
      if(actionQueue.has(scope))throw Error('原账号正在处理其他评论操作，未建立单聊');actionQueue.add(scope);reserved=true;const until=now()+12000;
      while(busy.has(scope)||(nextAllowed.get(scope)||0)>now()){await guard();if(now()>=until)throw Error('原账号当前分页尚未结束，评论转单聊未执行');await new Promise(resolve=>setTimeout(resolve,250));}
      busy.add(scope);acquired=true;client=await budget.run(async()=>{const value=await transportFactory({kind:'comments',accountSession:session.fromPartition('persist:matrix-douyin-'+a.connectorSessionId),publicHandle:a.nativeAccountKey,assertCurrent:guard});if(ended){value?.close();throw Error('本轮原生评论核验已结束');}return value;},'准备原生评论只读来源',25000);
      const read=async(kind,args)=>{while((nextAllowed.get(scope)||0)>now()){await guard();await new Promise(resolve=>setTimeout(resolve,Math.min(250,nextAllowed.get(scope)-now())));}await guard();try{return await budget.run(()=>client.readWeb(kind,args),'重新核对原生评论来源',12000);}finally{nextAllowed.set(scope,now()+4500);}};
      return await require('./account-operations-comment-proof.cjs').verifyCommentProof({message:input.message,cache:cacheFor(scope,'comments'),client,read,project:comment,assertCurrent:guard});
    }finally{ended=true;client?.close();if(acquired){busy.delete(scope);nextAllowed.set(scope,now()+4500);}if(reserved)actionQueue.delete(scope);}
  }
  return {run:(input,beforeCommit)=>handle({sender:getWindow()?.webContents},input,beforeCommit),directoryAccess,verifyOperationComment,close(){closed=true;pagination?.close();followerAvatars.close();images.close();continuations.clear();caches.clear();}};
}
module.exports = { registerDouyinInteractions, readPage, initial, person, comment, projectLikeReceipt, interactionFailure,commentTimeStats,independentFollowerScope };

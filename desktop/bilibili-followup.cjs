// Original state machine for the authorized official web session, not an open
// platform OAuth SDK. Interface facts: bilibili-api-collect/docs/comment/action.md.
// No cookie handling or direct network access; ambiguous writes are never retried.
const id = value => typeof value === 'string' && /^[1-9]\d{0,24}$/.test(value) ? value : Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
function replyId(value) {
  if (!value || typeof value !== 'object') return;
  const string = id(value.rpid_str), number = id(value.rpid);
  if (string && number && string !== number) return;
  return string || number;
}
function matchesReplyIdentity(reply, {oid,mid,text,commentId}) {
  if (!reply || reply.type !== 1 || id(reply.oid) !== oid || String(reply.root_str ?? reply.root) !== '0' || String(reply.parent_str ?? reply.parent) !== '0') return false;
  const authors=[reply.member?.mid,reply.mid].filter(value=>value!==undefined),rootId=replyId(reply);
  if (!authors.length || authors.some(value=>id(value)!==mid) || !rootId || commentId && rootId !== commentId) return false;
  return reply.content?.message === text;
}
function ownsReply(reply, expected) {
  return matchesReplyIdentity(reply,expected)&&(reply.state===undefined||reply.state===0);
}
function verificationIssue(reply,expected) {
  if(!reply||typeof reply!=='object'||Array.isArray(reply))return '官方详情未返回原评论对象';
  // Explain visibility/state separately from identity. This diagnostic does
  // not authorize any write or weaken ownsReply's existing requirements.
  if(matchesReplyIdentity(reply,expected)&&reply.state!==undefined&&reply.state!==0){
    const state=Number.isInteger(reply.state)&&Math.abs(reply.state)<=10000?String(reply.state):'未识别';
    return `官方评论状态 ${state}，尚未确认可以置顶；保留原评论，不会重发`;
  }
  const fields=[];
  if(replyId(reply)!==expected.commentId)fields.push('评论ID');
  if(id(reply.oid)!==expected.oid)fields.push('作品ID');
  if(reply.type!==1)fields.push('评论类型');
  if(String(reply.root_str??reply.root)!=='0'||String(reply.parent_str??reply.parent)!=='0')fields.push('一级评论层级');
  const authors=[reply.member?.mid,reply.mid].filter(value=>value!==undefined);
  if(!authors.length||authors.some(value=>id(value)!==expected.mid))fields.push('作者UID');
  if(reply.content?.message!==expected.text)fields.push('正文');
  return `原评论字段未匹配：${fields.join('、')||'状态'}`;
}
const failure = (code, operation) => {
  const reasons = {'-101':'官方登录已失效，请在账号管理重新登录','-102':'官方提示账号被封停','-111':'官方会话校验未通过，请重新登录','-403':'官方提示没有此操作权限','-509':'官方频率限制，请稍后再处理','12002':'官方评论区已关闭','12003':'官方禁止回复','12006':'官方未找到这条评论','12015':'官方要求本人完成评论验证码','12016':'官方提示评论包含限制内容','12025':'官方提示评论字数超限','12029':'该作品已有置顶评论；未替换或取消其他评论的置顶','12030':'官方不允许置顶非一级评论','12035':'官方提示当前账号被列入评论黑名单','12045':'官方要求购买后才能评论','12051':'官方提示重复评论，需核对原评论，不能直接重发','12052':'官方评论区已关闭'};
  return `${operation}未完成：${reasons[String(code)] || `官方返回错误码 ${Number.isFinite(code)?code:'未知'}`}。`;
};

function createBilibiliFollowup({request,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  return async function execute({workId,nativeAccountKey,text,commentId,operation='start',pin=false}, hooks={}) {
    const mid=id(nativeAccountKey);
    if (!/^BV[0-9A-Za-z]{10}$/.test(workId||'') || !mid || typeof text!=='string' || !text.trim() || text.length>2000 || !['start','verify','pin'].includes(operation) || commentId!==undefined&&!id(commentId)) throw Error('追评缺少准确的作品ID、本人UID或有效文案，未发送');
    const own = await request('GET','/x/web-interface/nav');
    if (own?.code!==0 || own.data?.isLogin!==true || id(own.data.mid)!==mid) throw Error('B站官方登录UID与原发布账号不同或未登录，未发送追评');
    const view = await request('GET','/x/web-interface/view',{bvid:workId});
    if (view?.code!==0 || view.data?.bvid!==workId || id(view.data?.owner?.mid)!==mid || !id(view.data?.aid)) throw Error('尚未确认该BV作品属于原发布账号UID，未发送追评');
    const oid=id(view.data.aid),expected={oid,mid,text};
    let status='unknown',message='',createdId=commentId,verifyFailure='',identityState,detailPinned=false;
    const acknowledged=async value=>{if(hooks.acknowledged)await hooks.acknowledged(value);};
    let verifyRetryable=false;
    const verify=async()=>{
      verifyRetryable=false;
      verifyFailure='';
      identityState=undefined;
      detailPinned=false;
      if(!createdId)return false;
      // Never use the deprecated reply/info endpoint or whole-list text.includes.
      const details=await request('GET','/x/v2/reply/detail',{oid,root:createdId,type:'1',ps:'1',next:'0'});
      if(details?.code===0){
        const target={...expected,commentId:createdId},matches=ownsReply(details.data?.root,target);
        if(matchesReplyIdentity(details.data?.root,target)){
          if(Number.isInteger(details.data.root.state))identityState=details.data.root.state;
          detailPinned=(matches||identityState===17)&&details.data.root.reply_control?.is_up_top===true;
        }
        if(!matches)verifyFailure=`；${verificationIssue(details.data?.root,target)}`;
        return matches;
      }
      if(Number.isInteger(details?.code))verifyFailure=`；评论详情返回 ${details.code}`;
      // Read one authenticated page only when the exact detail is missing.
      // Never scan by body text, override identity mismatches, or continue
      // after authentication errors or rate limits.
      if(![-404,12006].includes(details?.code))return false;
      const page=await request('GET','/x/v2/reply',{type:'1',oid,ps:'20',pn:'1',sort:'0'}),data=page?.data;
      if(page?.code!==0||!data||data.upper?.mid!==undefined&&id(data.upper.mid)!==mid||!Array.isArray(data.replies)||data.replies.length>20)return false;
      const candidates=data.replies.filter(reply=>replyId(reply)===createdId);
      if(candidates.length!==1){verifyRetryable=candidates.length===0;return false;}
      const target={...expected,commentId:createdId},matches=ownsReply(candidates[0],target);
      if(matchesReplyIdentity(candidates[0],target)){
        if(Number.isInteger(candidates[0].state))identityState=candidates[0].state;
        detailPinned=(matches||identityState===17)&&candidates[0].reply_control?.is_up_top===true;
      }
      if(!matches)verifyFailure+=`；${verificationIssue(candidates[0],target)}`;
      return matches;
    };
    if (operation==='start') {
      if(createdId)throw Error('追评已有评论ID，不会再次创建；请只核对或处理置顶');
      await hooks.beforeDispatch?.({operation:'comment',oid,workId,mid});
      const added=await request('POST','/x/v2/reply/add',{type:'1',oid,root:'0',parent:'0',message:text,plat:'1'});
      if(!Number.isInteger(added?.code))return{status:'unknown',message:'追评请求已发出，但官方回执格式无法识别；不要重复发送',oid};
      if(added.code!==0)return{status:added.code===12051?'unknown':'failed',message:failure(added.code,'追评'),oid,officialCode:added.code};
      createdId=replyId(added.data)||replyId(added.data?.reply);
      // Persist the returned ID BEFORE a read-back/pin request can time out.
      await acknowledged({commentId:createdId,oid,workId});
      if(added.data?.need_captcha===true)return{status:'unknown',commentId:createdId,oid,message:'官方要求本人完成评论验证；评论是否生效待核对，不会重复发送'};
      if(createdId&&ownsReply(added.data?.reply,{...expected,commentId:createdId}))status='confirmed';
      else if(createdId&&matchesReplyIdentity(added.data?.reply,{...expected,commentId:createdId})&&added.data.reply.state===17)identityState=17;
      else if(await verify())status='confirmed';
      message=status==='confirmed'?'官方已接收并返回本人一级评论ID':'追评已提交，但尚未取得准确的本人评论结果；不要重复发送';
    } else {
      if(!createdId)return{status:'unknown',oid,message:'上次未取得评论ID，不能按同名文案猜测或重新发送；请核对官方评论'};
      status=await verify()?'confirmed':'unknown';
      message=status==='confirmed'?'官方原评论ID、作者UID、作品ID和正文均已核对':`原评论ID尚未核对通过${verifyFailure}，未重复发送或操作其他评论`;
      if(identityState===17)message='原评论ID、作者UID、作品ID、层级和正文已核对；官方评论状态 17，公开可见性尚未确认；原评论保留，不会重发';
    }
    const result={status,message,commentId:createdId,oid};
    const verifiedPin={status:'confirmed',message:'已从官方置顶标记核对原评论ID、作品ID、作者UID和正文'};
    // The exact root's explicit UP-top flag proves pinning independently of
    // public visibility. Never infer it from admin-top, vote-top or truthy text.
    if(pin&&detailPinned)return{...result,pin:verifiedPin};
    // The saved pin intent also applies to a newly created, freshly verified
    // state-17 root. Use the same owner/slot checks as explicit pin; visibility
    // remains unknown and verification alone never authorizes a write.
    const explicitPendingPin=['start','pin'].includes(operation)&&identityState===17&&!!createdId;
    const inspectPendingPin=operation==='verify'&&identityState===17&&!!commentId;
    if(pin&&status!=='confirmed'&&identityState===17)result.pin={status:'unknown',message:'原评论身份已核对，官方状态17；置顶尚未确认，不会重复发送追评'};
    if (!pin || status!=='confirmed'&&!explicitPendingPin&&!inspectPendingPin)return result;
    const readPin=async()=>{
      try {
        const page=await request('GET','/x/v2/reply',{type:'1',oid,ps:'1',pn:'1',sort:'0'}),data=page?.data;
        if(page?.code!==0||!data||data.upper?.mid!==undefined&&id(data.upper.mid)!==mid)return{state:'unknown'};
        const candidates=[];
        if(data.top&&Object.hasOwn(data.top,'upper'))candidates.push(data.top.upper);
        if(data.upper&&Object.hasOwn(data.upper,'top'))candidates.push(data.upper.top);
        if(!candidates.length)return{state:'unknown'};
        const ids=candidates.map(value=>value===null?null:replyId(value));
        if(ids.some(value=>value===undefined)||ids.some(value=>value!==ids[0]))return{state:'unknown'};
        if(ids[0]===null)return{state:'empty'};
        if(ids[0]!==createdId)return{state:'other'};
        if(!candidates.every(reply=>matchesReplyIdentity(reply,{...expected,commentId:createdId})&&(reply.state===undefined||reply.state===0||reply.state===17)))return{state:'unknown'};
        return{state:'confirmed'};
      }catch{return{state:'unknown'};}
    };
    const before=await readPin();
    if(before.state==='confirmed')return{...result,pin:verifiedPin};
    if(operation==='verify')return{...result,pin:{status:before.state==='other'||before.state==='empty'&&!inspectPendingPin?'failed':'unknown',message:before.state==='empty'?(inspectPendingPin?'官方旧列表未显示原评论，详情尚未返回明确置顶标记；仅核对，未重复操作':'官方当前置顶列表未见原评论；仅核对，未重新置顶'):before.state==='other'?'官方当前置顶为另一条评论；未替换或重发追评':'尚未读到可核验的官方置顶条目；仅核对，未重新置顶'}};
    if(before.state==='other')return{...result,pin:{status:'failed',message:'该作品已有其他置顶评论；未替换或取消它，也未重发追评'}};
    if(before.state!=='empty')return{...result,pin:{status:'unknown',message:'官方置顶状态尚未核对，未发送置顶；原追评无需重发'}};
    // A confirmed start already matched the new root's complete identity in
    // the add response or an exact read-back in this operation. A second
    // detail read can lag that acknowledgement (12006); it must not cancel
    // the requested pin. Unidentified/unsupported roots stop above, the slot
    // must be empty, and beforeDispatch revalidates the account before POST.
    // Existing-comment operations continue to require a fresh exact read.
    const readAfterPin=async()=>{
      const current=await readPin();
      if(current.state==='confirmed'||current.state==='other')return current;
      // A legacy list can lag the actual root. One fresh, exact read only;
      // this never retries the pin POST or creates another comment.
      try{const matched=await verify();if(detailPinned)return{state:'confirmed'};if(matched||identityState===17)return current;}catch{}
      return {state:'unknown'};
    };
    // Pin is independent: a failure here does not undo the successful comment
    // or publication, and must never cause another reply/add request.
    try {
      await hooks.beforeDispatch?.({operation:'pin',oid,workId,mid,commentId:createdId});
      let top=await request('POST','/x/v2/reply/top',{type:'1',oid,rpid:createdId,action:'1'});
      // A newly acknowledged root can be absent from the pin service briefly.
      // Only an explicit -404 rejection allows bounded recovery; a lost reply,
      // permission/captcha/rate rejection or code 0 never permits another POST.
      for(const delay of [3000,7000,15000]){
        if(operation!=='start'||top?.code!==-404)break;
        await sleep(delay);
        const matched=await verify();
        if(detailPinned)return{...result,pin:verifiedPin};
        if(!matched&&identityState!==17){if(verifyRetryable)continue;break;}
        const slot=await readPin();
        if(slot.state==='confirmed')return{...result,pin:verifiedPin};
        if(slot.state==='other')return{...result,pin:{status:'failed',message:'等待原评论就绪期间出现其他置顶评论；未替换或重发追评'}};
        if(slot.state!=='empty')break;
        await hooks.beforeDispatch?.({operation:'pin',oid,workId,mid,commentId:createdId});
        top=await request('POST','/x/v2/reply/top',{type:'1',oid,rpid:createdId,action:'1'});
      }
      let after=await readAfterPin();
      // An accepted POST can precede the official pin flag. Only re-read a
      // verified original with an explicitly empty slot; never retry POST,
      // or continue on auth errors, mismatches or another pinned comment.
      for(const delay of [1000,2000]){
        if(top?.code!==0||after.state!=='empty')break;
        await sleep(delay);after=await readAfterPin();
      }
      if(after.state==='confirmed')return{...result,pin:verifiedPin};
      if(top?.code===0)return{...result,pin:{status:'unknown',message:'官方已接收置顶请求，但置顶条目尚未读回；请只核对结果，不要重复发送追评'}};
      if(top?.code===-404)return{...result,pin:{status:'failed',officialCode:-404,message:'官方置顶返回 -404（无此项）；原评论已核对，但置顶尚未证实。请在原作品官网核验入口；不要重发追评'}};
      if(Number.isInteger(top?.code))return{...result,pin:{status:'failed',message:failure(top.code,'置顶'),officialCode:top.code}};
      return{...result,pin:{status:'unknown',message:'置顶请求已发出，回执无法识别；未重复操作'}};
    }catch{const after=await readAfterPin();return{...result,pin:after.state==='confirmed'?verifiedPin:{status:'unknown',message:'置顶连接中断或超时，结果待核对；追评无需重发'}};}
  };
}
module.exports={createBilibiliFollowup,ownsReply,replyId};

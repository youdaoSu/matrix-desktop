// Explicit maintenance of a recorded comment, never replacement by matching text.
const {ownsReply,replyId}=require('./bilibili-followup.cjs');
const id=value=>typeof value==='string'&&/^[1-9]\d{0,24}$/.test(value)?value:Number.isSafeInteger(value)&&value>0?String(value):undefined;
function createBilibiliFollowupManagement({request}){
  return async function manage({workId,nativeAccountKey,text,commentId,operation,verifyOnly=false},hooks={}){
    if(!['unpin','delete'].includes(operation)||!/^BV[0-9A-Za-z]{10}$/.test(workId||'')||!id(nativeAccountKey)||!id(commentId)||typeof text!=='string'||!text.trim()||text.length>2000)throw Error('评论管理目标不完整，未操作');
    const result=(status,message,extra={})=>({operation,status,message,commentId,...extra});
    const own=await request('GET','/x/web-interface/nav');
    if(own?.code!==0||own.data?.isLogin!==true||id(own.data.mid)!==nativeAccountKey)throw Error('官网本人UID与原追评账号不一致，未操作');
    const view=await request('GET','/x/web-interface/view',{bvid:workId});
    if(view?.code!==0||view.data?.bvid!==workId||id(view.data?.owner?.mid)!==nativeAccountKey||!id(view.data?.aid))throw Error('尚未确认原作品归属，未操作');
    const oid=id(view.data.aid),expected={oid,mid:nativeAccountKey,text,commentId};
    const readPin=async()=>{
      const page=await request('GET','/x/v2/reply',{type:'1',oid,ps:'1',pn:'1',sort:'0'}),data=page?.data,rows=[];
      if(page?.code!==0||!data||data.upper?.mid!==undefined&&id(data.upper.mid)!==nativeAccountKey)return 'unknown';
      if(data.top&&Object.hasOwn(data.top,'upper'))rows.push(data.top.upper);
      if(data.upper&&Object.hasOwn(data.upper,'top'))rows.push(data.upper.top);
      const ids=rows.map(row=>row===null?null:replyId(row));
      if(!ids.length||ids.some(value=>value===undefined||value!==ids[0]))return 'unknown';
      if(ids[0]===null||ids[0]!==commentId)return 'not-target';
      return rows.every(row=>ownsReply(row,expected))?'target':'unknown';
    };
    // Verification is strictly read-only, including after an uncertain write.
    if(verifyOnly&&operation==='unpin')return await readPin()==='not-target'?result('confirmed','官方当前置顶已不是原评论；未操作其他评论'):result('unknown','取消置顶结果尚未确认；未重复操作');
    const detail=await request('GET','/x/v2/reply/detail',{type:'1',oid,root:commentId,ps:'1',next:'0'});
    if(verifyOnly)return result('unknown',detail?.code===0&&ownsReply(detail.data?.root,expected)?'原评论当前仍可见；上次删除回执未确认，未重复删除':'原评论当前未能核对；不能仅凭未找到判定删除成功，未重复删除');
    if(detail?.code!==0||!ownsReply(detail.data?.root,expected))return result('failed','原评论ID、作者、作品或正文未核对通过；可能已删除或变化，未操作任何评论');
    if(operation==='unpin'){
      const before=await readPin();
      if(before==='not-target')return result('confirmed','原评论当前未置顶；未取消其他评论的置顶');
      if(before!=='target')return result('failed','未读到准确的原评论置顶状态，未发送取消请求');
    }
    await hooks.beforeDispatch?.({operation,commentId,oid});
    const response=await request('POST',operation==='delete'?'/x/v2/reply/del':'/x/v2/reply/top',{type:'1',oid,rpid:commentId,...(operation==='unpin'?{action:'0'}:{})});
    // Deletion acknowledgement is authoritative, not an inferred list absence.
    if(operation==='delete'&&(response?.code===0||response?.code===12022))return result('confirmed',response.code===0?'官方已确认删除这条原追评；作品与其他评论保留':'官方确认这条原追评已删除；未创建新评论',{officialCode:response.code});
    if(operation==='unpin'){
      try{if(await readPin()==='not-target')return result('confirmed','已核对原评论不再置顶；评论正文与其他评论保留');}catch{}
    }
    if(Number.isInteger(response?.code)&&response.code!==0)return result('failed',`官方未完成${operation==='delete'?'删除追评':'取消置顶'}，返回错误码 ${response.code}；未自动重试`,{officialCode:response.code});
    return result('unknown','请求已发出，结果尚未确认；请只核对，不要重复操作');
  };
}
module.exports={createBilibiliFollowupManagement};

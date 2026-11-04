'use strict';
const {workReference}=require('./publish-reference.cjs');
function singleSourceRef(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.accountId!=='string'||!value.accountId||value.accountId.length>100)throw Error('请先选择所属账号和作品');
  const field=value.kind==='cached-work'?'workId':value.kind==='receipt'?'receiptId':undefined;
  if(!field||Object.keys(value).some(k=>!['kind','accountId',field].includes(k))||typeof value[field]!=='string'||!value[field]||value[field].length>120)throw Error('作品来源无效');
  if(field==='workId'&&!/^[1-9]\d{9,18}$/.test(value.workId))throw Error('缺少准确的官网作品编号');
  return {kind:value.kind,accountId:value.accountId,[field]:value[field]};
}
async function resolveSingleSource(input,{account,journal,owner,getOwnWork}){
  const ref=singleSourceRef(input),a=await account(ref.accountId);
  if(!a||a.id!==ref.accountId||!a.connectorSessionId||!a.nativeAccountKey)throw Error('所属账号尚未完成绑定');
  if(ref.kind==='cached-work'){
    if(a.platform!=='douyin')throw Error('此平台需从已核实的发布任务选择作品');
    const work=await getOwnWork?.({owner,account:a,workId:ref.workId});
    if(work?.platformId!==ref.workId||work.readError)throw Error('作品尚未在当前账号目录中核实，请先刷新作品');
    return {platform:a.platform,account:a,title:work.title||ref.workId,workId:ref.workId,workUrl:'https://www.douyin.com/video/'+ref.workId};
  }
  const p=journal.find(owner,ref.receiptId),work=workReference(p?.platform,p?.evidence);
  if(!p||p.kind!=='publish'||p.status!=='confirmed'||p.accountId!==a.id||p.platform!==a.platform||!work||!['douyin','xiaohongshu','bilibili'].includes(a.platform)||['processing','rejected'].includes(p.verification?.state))throw Error('原作品尚无可评论的已核实发布回执');
  if(p.nativeAccountKey!==a.nativeAccountKey||p.sessionId!==a.connectorSessionId)throw Error('原作品回执与当前账号绑定不一致');
  return {...work,platform:a.platform,account:a,title:p.summary||work.workId};
}
module.exports={singleSourceRef,resolveSingleSource};

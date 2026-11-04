'use strict';
const {randomUUID,randomInt,createHash}=require('node:crypto');
const clone=value=>JSON.parse(JSON.stringify(value));
const fingerprint=a=>JSON.stringify([a.id,a.platform,a.connectorSessionId,a.nativeAccountKey]);
const keyOf=(platform,workId,identity)=>createHash('sha256').update(JSON.stringify([platform,workId,identity])).digest('hex');
const safeError=error=>{const s=String(error?.message||'');return s.length<400&&/[\u4e00-\u9fff]/.test(s)&&!/(cookie|token|authorization|password|csrf|https?:)/i.test(s)?s:'评论操作未完成，请核对原作品；不会重复提交';};
class CommentQueue {
  constructor({state,save,source,account,execute,now=Date.now,random=randomInt,sleep=ms=>new Promise(r=>setTimeout(r,ms)),intervalMs=10000}){
    this.state=state||{version:1,sets:[],batches:[],ledger:{}};this.save=save;this.source=source;this.account=account;this.execute=execute;this.now=now;this.random=random;this.sleep=sleep;this.intervalMs=intervalMs;this.active=null;this.closed=false;this.tail=Promise.resolve();
    if(this.state.version!==1||!Array.isArray(this.state.sets)||!Array.isArray(this.state.batches)||!this.state.ledger)throw Error('评论队列存档格式异常，原文件保留');
    for(const b of this.state.batches){if(['running','stopping'].includes(b.status))b.status='paused';for(const row of b.rows)if(row.status==='sending'){row.status='unknown';row.detail='软件已退出，本次发送结果待核对，不自动重发';}}
  }
  snapshot(){return clone({sets:this.state.sets,batches:this.state.batches.slice(-50).reverse().map(b=>this.publicBatch(b)),running:!!this.active});}
  async persist(){const snapshot=clone(this.state);const job=this.tail.then(()=>this.save(snapshot));this.tail=job.catch(()=>{});try{await job;}catch(e){this.closed=true;throw Error('评论记录保存失败，已停止发送；请保留软件并核对原评论');}}
  async saveSet(input){
    const name=typeof input?.name==='string'?input.name.trim():'';
    if(!name||name.length>60||!Array.isArray(input.comments)||!input.comments.length||input.comments.length>100||input.comments.some(t=>typeof t!=='string'||!t.trim()||t.trim().length>500))throw Error('评论集需有名称和1～100条正文，每条最多500字');
    const comments=[...new Set(input.comments.map(t=>t.trim()))];let set=this.state.sets.find(s=>s.id===input.id);
    if(input.id&&!set)throw Error('原评论集已不存在');if(!set&&this.state.sets.length>=50)throw Error('最多保存50个评论集');
    if(set)Object.assign(set,{name,comments});else{set={id:randomUUID(),name,comments};this.state.sets.push(set);}await this.persist();return clone(set);
  }
  async removeSet(id){if(!this.state.sets.some(s=>s.id===id))throw Error('评论集不存在');this.state.sets=this.state.sets.filter(s=>s.id!==id);await this.persist();}
  async preview(input){
    if(this.closed)throw Error('评论队列已停止');
    const set=this.state.sets.find(s=>s.id===input.setId);
    if(!set||!Array.isArray(input.accountIds)||input.accountIds.length<1||input.accountIds.length>10||new Set(input.accountIds).size!==input.accountIds.length)throw Error('请选择评论集及1～10个不同的发送账号');
    if(this.state.batches.length>=500)throw Error('评论批次已达本机保存上限，请先导出整理历史记录');
    if(Object.keys(this.state.ledger).length>=20000)throw Error('评论防重复记录已达保护上限，未创建新任务');
    const src=await this.source(input.receiptId);const identities=new Set([src.account.nativeAccountKey]),rows=[];
    let bag=[];
    for(const id of input.accountIds){
      const a=await this.account(id);
      if(a.platform!==src.platform||!a.nativeAccountKey||!a.connectorSessionId||a.id===src.account.id||identities.has(a.nativeAccountKey))throw Error('发送账号须为同平台的不同绑定账号，不能包含作品主号');
      identities.add(a.nativeAccountKey);
      if(!bag.length){bag=[...set.comments];for(let i=bag.length-1;i>0;i--){const j=this.random(i+1);[bag[i],bag[j]]=[bag[j],bag[i]];}}
      const key=keyOf(src.platform,src.workId,a.nativeAccountKey),previous=this.state.ledger[key];
      rows.push({id:randomUUID(),accountId:a.id,accountName:a.nickname||a.id,binding:fingerprint(a),identity:a.nativeAccountKey,text:bag.pop(),key,status:previous?'skipped':'queued',detail:previous?'此账号已对该作品尝试过评论；保留原记录，不重复发送':'等待确认发送'});
    }
    const b={id:randomUUID(),receiptId:input.receiptId,primaryId:src.account.id,primaryBinding:fingerprint(src.account),platform:src.platform,workId:src.workId,workUrl:src.workUrl,title:src.title||src.workId,setName:set.name,createdAt:this.now(),expiresAt:this.now()+10*60000,status:'preview',rows};this.state.batches.push(b);await this.persist();return this.publicBatch(b);
  }
  async previewSingle(input){
    if(this.closed)throw Error('评论队列已停止');
    if(!input||Object.keys(input).some(k=>!['source','text'].includes(k))||typeof input.text!=='string'||!input.text.trim()||input.text.length>500||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(input.text))throw Error('请填写1–500字的本条评论');
    const sourceRef=require('./single-comment-source.cjs').singleSourceRef(input.source);
    if(this.state.batches.length>=500||Object.keys(this.state.ledger).length>=20000)throw Error('评论记录已达本机保存上限');
    const src=await this.source(undefined,sourceRef),a=await this.account(sourceRef.accountId);
    if(fingerprint(a)!==fingerprint(src.account)||!a.nativeAccountKey||!a.connectorSessionId)throw Error('只能以当前作品所属账号发送本条评论');
    const key=keyOf(src.platform,src.workId,a.nativeAccountKey),previous=this.state.ledger[key];
    const row={id:randomUUID(),accountId:a.id,accountName:a.nickname||a.id,binding:fingerprint(a),identity:a.nativeAccountKey,text:input.text.trim(),key,status:previous?'skipped':'queued',detail:previous?'此账号已有本作品的评论提交记录，请核对原评论，不会重复发送':'尚未发送，请核对正文后确认'};
    const b={id:randomUUID(),mode:'single',sourceRef,receiptId:sourceRef.receiptId||'',primaryId:a.id,primaryBinding:fingerprint(a),platform:src.platform,workId:src.workId,workUrl:src.workUrl,title:src.title||src.workId,setName:'单条评论',createdAt:this.now(),expiresAt:this.now()+10*60000,status:'preview',rows:[row]};
    this.state.batches.push(b);await this.persist();return this.publicBatch(b);
  }
  singleBatch(id){const b=this.state.batches.find(b=>b.id===id);if(!b||b.mode!=='single'||b.rows.length!==1||b.rows[0].accountId!==b.primaryId)throw Error('不是当前单账号评论任务');return b;}
  async singleState(sourceRef){
    const ref=require('./single-comment-source.cjs').singleSourceRef(sourceRef),src=await this.source(undefined,ref);
    return {target:{accountId:src.account.id,accountName:src.account.nickname||src.account.id,platform:src.platform,workId:src.workId,title:src.title,workUrl:src.workUrl},running:!!this.active,batches:this.state.batches.filter(b=>b.mode==='single'&&b.primaryBinding===fingerprint(src.account)&&b.platform===src.platform&&b.workId===src.workId).slice(-10).reverse().map(b=>this.publicBatch(b))};
  }
  publicBatch(b){return clone({...b,rows:b.rows.map(({binding,identity,key,...row})=>row),primaryBinding:undefined});}
  async start(id){
    if(this.closed||this.active)throw Error('评论队列已停止或已有批次执行中');
    const b=this.state.batches.find(b=>b.id===id);if(!b||!['preview','paused'].includes(b.status))throw Error('批次状态已变化，请刷新进度');
    if(!b.approvedAt&&b.expiresAt<this.now())throw Error('预览已过期，请重新生成并核对');
    const active={id,stop:false};this.active=active;
    try{await this.verifySource(b);if(this.closed||active.stop)throw Error('本次评论已暂停');b.status='running';b.approvedAt=b.approvedAt||this.now();await this.persist();active.promise=this.run(b,active).catch(e=>{b.status='paused';b.detail=safeError(e);return this.persist();}).catch(()=>{}).finally(()=>{if(this.active===active)this.active=null;});return this.publicBatch(b);}catch(e){this.active=null;throw e;}
  }
  async verifySource(b){const src=await this.source(b.receiptId,b.mode==='single'?b.sourceRef:undefined);if(src.platform!==b.platform||src.workId!==b.workId||src.workUrl!==b.workUrl||fingerprint(src.account)!==b.primaryBinding)throw Error('作品或主号绑定已变化，未继续发送');return src;}
  async run(b,active){
    for(const row of b.rows){
      if(row.status!=='queued')continue;if(active.stop||this.closed)break;
      if(this.state.ledger[row.key]){row.status='skipped';row.detail='该账号已有此作品的评论尝试，未重复发送';await this.persist();continue;}
      const lastAttempt=Math.max(0,...Object.values(this.state.ledger).map(r=>r.at||0));
      const wait=Math.min(this.intervalMs,Math.max(0,lastAttempt+this.intervalMs-this.now()));
      if(wait)await this.sleep(wait);
      if(active.stop||this.closed)break;
      let committed=false;
      try{
        const src=await this.verifySource(b),a=await this.account(row.accountId);
        const assertCurrent=async()=>{if(active.stop||this.closed)throw Error('评论队列已暂停，尚未提交');await this.verifySource(b);if(fingerprint(await this.account(row.accountId))!==row.binding)throw Error('发送账号绑定已变化，尚未提交');};
        if(fingerprint(a)!==row.binding)throw Error('发送账号绑定已变化，未发送');
        const beforeCommit=async()=>{await assertCurrent();if(committed||this.state.ledger[row.key])throw Error('此评论已进入提交，不能重复执行');this.state.ledger[row.key]={batchId:b.id,rowId:row.id,at:this.now()};row.status='sending';row.startedAt=this.now();row.detail='正在提交，等待官方回执';await this.persist();await assertCurrent();committed=true;};
        const result=await this.execute({batch:b,row,account:a,primary:src.account,assertCurrent,beforeCommit});
        if(!committed)throw Error('未完成评论提交核验');
        row.status=result?.status==='confirmed'&&typeof result.commentId==='string'&&result.commentId?'sent':result?.status==='failed'?'failed':'unknown';row.commentId=result?.commentId;row.detail=result?.message||'未取得准确评论回执，请核对原作品';
      }catch(e){row.status=committed||this.state.ledger[row.key]?'unknown':'failed';row.detail=safeError(e);}
      row.completedAt=this.now();await this.persist();
      if(row.status!=='sent'){active.stop=true;break;}
      // Only the queue waits. No concurrent browser pages and no busy loop.
      if(b.rows.some(r=>r.status==='queued')&&!active.stop&&!this.closed)await this.sleep(this.intervalMs);
    }
    if(b.status!=='cancelled')b.status=b.rows.some(r=>r.status==='queued')?'paused':b.rows.some(r=>['failed','unknown'].includes(r.status))?'attention':'completed';b.updatedAt=this.now();await this.persist();
  }
  async pause(id){const b=this.state.batches.find(b=>b.id===id);if(!b)throw Error('批次不存在');if(this.active?.id===id){this.active.stop=true;b.status='stopping';}else if(b.status==='preview')b.status='paused';await this.persist();return this.publicBatch(b);}
  async cancel(id){const b=this.state.batches.find(b=>b.id===id);if(!b)throw Error('批次不存在');if(this.active?.id===id)this.active.stop=true;for(const row of b.rows)if(row.status==='queued'){row.status='cancelled';row.detail='已取消，未发送';}b.status='cancelled';await this.persist();}
  async close(){this.closed=true;if(this.active){this.active.stop=true;await this.active.promise;}await this.tail;}
}
module.exports={CommentQueue,fingerprint,keyOf};

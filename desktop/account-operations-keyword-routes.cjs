'use strict';
// The worker supplies verified NEW comments. Rules never import history and
// never turn a platform failure into another sender's attempt.
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {read,write}=require('./vendor/hengyuan-interactions/src/workspace-data.cjs');
const {outreachDigest}=require('./vendor/hengyuan-interactions/src/outreach.cjs');
const {accountQuota}=require('./account-operations-keyword-quota.cjs');
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,MAX_AGE=600000,MAX_HITS=2000;
const clone=value=>structuredClone(value),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=message=>{throw Error(message);};
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+'不正确');return value.trim();};
const id=value=>{if(typeof value!=='string'||!UUID.test(value))fail('规则或账号编号不正确');return value;};
const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail(label+'超出范围');return value;};
const normalize=value=>value.normalize('NFKC').toLocaleLowerCase('en-US');
const sourceDigest=m=>hash([m.id,m.accountId,m.platform,m.channel,m.externalId,m.threadId,m.senderId,m.text,m.receivedAt,m.profileUrl,m.isOwn,m.isGroup,m.historical]);
function validateRule(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('关键词规则不正确');
 const rule={id:id(input.id),revision:integer(input.revision,1,1000000,'规则版本'),name:text(input.name,80,'规则名称'),primaryAccountId:id(input.primaryAccountId)};
 const unique=(items,limit,convert)=>{if(!Array.isArray(items)||items.length>limit)fail('规则列表数量不正确');const values=items.map(convert);if(new Set(values).size!==values.length)fail('规则列表不能重复');return values;};
 rule.senderAccountIds=unique(input.senderAccountIds,10,id);if(!rule.senderAccountIds.length)fail('至少选择一个发送账号');
 rule.workIds=unique(input.workIds,50,value=>{if(typeof value!=='string'||!/^[1-9]\d{0,18}$/.test(value))fail('作品编号不正确');return value;});
 rule.keywords=unique(input.keywords,20,value=>normalize(text(value,50,'关键词')));if(!rule.keywords.length)fail('至少填写一个关键词');
 if(!['contains','exact'].includes(input.match))fail('关键词匹配方式不正确');rule.match=input.match;
 rule.replyText=text(input.replyText,2000,'私信内容');rule.delaySeconds=integer(input.delaySeconds,15,300,'发送间隔');
 rule.hourlyLimit=integer(input.hourlyLimit,1,20,'每小时上限');rule.dailyLimit=integer(input.dailyLimit,1,100,'24小时上限');
 if(rule.dailyLimit<rule.hourlyLimit)fail('24小时上限不能小于每小时上限');
 if(input.quotaMode!==undefined){
  if(input.quotaMode!=='per-account-success')fail('配额模式不正确');
  rule.quotaMode=input.quotaMode;rule.windowMinutes=integer(input.windowMinutes,1,1440,'配额时段分钟数');
  rule.queueHours=integer(input.queueHours,1,168,'排队保留小时数');
  if(rule.queueHours*60<=rule.windowMinutes)fail('排队保留时间须长于一个配额时段');
  if(!Array.isArray(input.senderLimits)||input.senderLimits.length!==rule.senderAccountIds.length)fail('请设置每个发送账号的额度');
  rule.senderLimits=input.senderLimits.map(row=>({accountId:id(row.accountId),limit:integer(row.limit,1,20,'账号每时段成功上限')}));
  if(new Set(rule.senderLimits.map(r=>r.accountId)).size!==rule.senderAccountIds.length||rule.senderLimits.some(r=>!rule.senderAccountIds.includes(r.accountId)||r.limit>rule.dailyLimit))fail('账号额度与账号池或24小时上限不一致');
 }
 return rule;
}
function validateHit(hit){
 if(!hit||!['queued','dispatching','sent','paused','failed'].includes(hit.status)||!Number.isFinite(Date.parse(hit.createdAt))||!Number.isSafeInteger(hit.ruleRevision)||hit.ruleRevision<1||!/^[a-f0-9]{64}$/.test(hit.sourceDigest)||hit.taskDigest!==undefined&&!/^[a-f0-9]{64}$/.test(hit.taskDigest))fail('关键词命中记录不正确');
 const value={id:id(hit.id),ruleId:id(hit.ruleId),ruleRevision:hit.ruleRevision,messageId:id(hit.messageId),accountId:id(hit.accountId),primaryAccountId:id(hit.primaryAccountId),recipientId:text(hit.recipientId,1000,'接收人'),sourceDigest:hit.sourceDigest,status:hit.status,createdAt:hit.createdAt,dueAt:integer(hit.dueAt,0,Number.MAX_SAFE_INTEGER,'计划时间'),detail:text(hit.detail,500,'记录说明')};
 if(hit.taskId!==undefined){value.taskId=id(hit.taskId);if(!hit.taskDigest)fail('缺少固定任务摘要');value.taskDigest=hit.taskDigest;}
 if(hit.dispatchedAt!==undefined)value.dispatchedAt=integer(hit.dispatchedAt,0,Number.MAX_SAFE_INTEGER,'执行时间');
 if(hit.admittedAt!==undefined){value.admittedAt=integer(hit.admittedAt,0,Number.MAX_SAFE_INTEGER,'入队时间');if(!/^[a-f0-9]{64}$/.test(hit.bindingDigest))fail('缺少入队绑定摘要');value.bindingDigest=hit.bindingDigest;}
 if(hit.resumePending!==undefined){if(typeof hit.resumePending!=='boolean')fail('队列恢复标记不正确');value.resumePending=hit.resumePending;}
 return value;
}
function validateKeywordBusiness(value){
 if(!value||value.version!==1||Object.keys(value).some(k=>!['version','rules','hits'].includes(k))||!Array.isArray(value.rules)||value.rules.length>20||!Array.isArray(value.hits)||value.hits.length>MAX_HITS)fail('关键词业务备份格式或数量不正确');
 const check=(raw,validate)=>{const canonical=validate(raw);if(Object.keys(raw).some(k=>!Object.hasOwn(canonical,k)))fail('关键词业务备份包含未知或执行字段');return canonical;};
 const rules=value.rules.map(r=>check(r,validateRule)),hits=value.hits.map(h=>check(h,validateHit));
 if(new Set(rules.map(r=>r.id)).size!==rules.length||new Set(hits.map(h=>h.id)).size!==hits.length)fail('关键词备份含重复编号');return{version:1,rules,hits};
}
class KeywordRoutes {
 #armed=new Map();#grant=null;#running=null;#closed=false;#monitors=new Map();
 constructor({directory,studio,store,tasks,canSchedule,canUseSender,start,stop,now=Date.now}){
  for(const fn of [canSchedule,canUseSender,start,stop,now])if(typeof fn!=='function')fail('关键词调度组件不完整');
  Object.assign(this,{studio,store,tasks,canSchedule,canUseSender,start,stop,now});this.file=path.join(directory,'keyword-routes.json');
  const saved=read(this.file,true)||{version:1,rules:[],hits:[],cursors:{},detail:'尚未启用关键词自动分配'};
  if(saved.version!==1||!Array.isArray(saved.rules)||saved.rules.length>20||!Array.isArray(saved.hits)||saved.hits.length>MAX_HITS||!saved.cursors||typeof saved.cursors!=='object'||Array.isArray(saved.cursors))fail('关键词规则存档格式不正确，原文件保留');
  const rules=saved.rules.map(validateRule);if(new Set(rules.map(r=>r.id)).size!==rules.length)fail('关键词规则编号重复');
  const cursors={};for(const [key,value]of Object.entries(saved.cursors))cursors[id(key)]=integer(value,0,Number.MAX_SAFE_INTEGER,'分配位置');
  const hits=saved.hits.map(hit=>{
   const value=validateHit(hit);
   if(['queued','dispatching'].includes(value.status)){value.resumePending=value.status==='queued'&&value.admittedAt!==undefined;value.status='paused';value.detail='软件已重启，原分配保留；重新启用后仅恢复未经发送的有效队列';}
   return value;
  });
  if(new Set(hits.map(h=>h.id)).size!==hits.length)fail('关键词命中编号重复');
  this.state={version:1,rules,hits,cursors,detail:'规则未启用；重新启用只处理之后的新评论'};
  if(saved.hits.some(h=>['queued','dispatching'].includes(h.status)))this.commit(this.state);
  const confirmed=new Map(this.tasks.snapshot().filter(t=>t.status==='sent'&&t.claimedAt&&typeof t.receipt==='string'&&/^platform:\S+$/.test(t.receipt)).map(t=>[t.id,t]));
  const recovered=clone(this.state);let updated=false;
  for(const hit of recovered.hits){
   const task=confirmed.get(hit.taskId);
   if(hit.status==='paused'&&task&&outreachDigest(task)===hit.taskDigest){hit.status='sent';hit.detail='已从原平台回执恢复成功统计';updated=true;}
  }
  if(updated)this.commit(recovered);
 }
 commit(value){write(this.file,value);this.state=value;}
 exportBusinessState(){return validateKeywordBusiness({version:1,rules:clone(this.state.rules),hits:clone(this.state.hits)});}
 importPlan(rules){
  if(this.#closed)fail('关键词服务已关闭');const checked=validateKeywordBusiness({version:1,rules,hits:[]}).rules;
  const existing=new Set(this.state.rules.map(r=>r.id)),added=checked.filter(r=>!existing.has(r.id));if(this.state.rules.length+added.length>20)fail('导入后关键词规则超过20条，未修改关键词配置');
  for(const rule of added){const primary=this.studio.getAccount(rule.primaryAccountId);if(primary.role!=='primary'||primary.platform!=='douyin')fail('导入的主号分工未就绪');for(const senderId of rule.senderAccountIds){const a=this.studio.getAccount(senderId);if(a.role!=='member'||a.primaryAccountId!==primary.id||a.platform!==primary.platform)fail('导入的发送账号不属于当前主号');}}
  return{added,skipped:checked.length-added.length};
 }
 importPausedRules(rules){
  const plan=this.importPlan(rules);if(plan.added.length){const next=clone(this.state);next.rules.push(...plan.added);this.commit(next);}
  return{added:plan.added.length,skipped:plan.skipped};
 }
 rule(ruleId){const rule=this.state.rules.find(r=>r.id===ruleId);if(!rule)fail('关键词规则不存在');return rule;}
 bindings(rule){
  const primary=this.studio.getAccount(rule.primaryAccountId);if(primary.role!=='primary'||primary.platform!=='douyin')fail('请选择已绑定的抖音主号');
  const accounts=[primary,...rule.senderAccountIds.map(senderId=>{const a=this.studio.getAccount(senderId);if(a.role!=='member'||a.primaryAccountId!==primary.id||a.platform!=='douyin')fail('发送账号与主号的关联已变化');return a;})];
  const bindings=accounts.map(a=>[a.id,this.tasks.currentBinding(a)]);
  if(new Set(bindings.map(([,b])=>b.identity)).size!==bindings.length)fail('账号池含重复的平台身份');
  return hash(bindings);
 }
 save(input){
  if(this.#closed)fail('关键词服务已关闭');
  const previous=input?.id?this.rule(input.id):null;
  if(previous&&input.revision!==previous.revision)fail('规则已被修改，请刷新后再保存');
  const rule=validateRule({...input,id:previous?.id||randomUUID(),revision:(previous?.revision||0)+1});
  if(!previous&&this.state.rules.length>=20)fail('最多保存20条关键词规则');
  const primary=this.studio.getAccount(rule.primaryAccountId);if(primary.role!=='primary'||primary.platform!=='douyin')fail('请选择抖音主号');
  for(const senderId of rule.senderAccountIds){const a=this.studio.getAccount(senderId);if(a.role!=='member'||a.primaryAccountId!==primary.id||a.platform!==primary.platform)fail('请选择此主号的同平台成员');}
  if(previous)this.pause(previous.id,'规则已修改，旧分配不会自动执行');
  const next=clone(this.state);next.rules=previous?next.rules.map(r=>r.id===rule.id?rule:r):[...next.rules,rule];this.commit(next);return clone(rule);
 }
 arm({id:ruleId,revision,acknowledgeAutomatic,acknowledgeEligibleRelationship}={}){
  if(this.#closed)fail('关键词服务已关闭');const rule=this.rule(ruleId);
  if(revision!==rule.revision||acknowledgeAutomatic!==true||acknowledgeEligibleRelationship!==true)fail('请核对当前规则、自动发送范围和允许的会话关系');
  if(!this.canSchedule())fail('互动已暂停或有任务正在处理，请稍后启用');
  if(rule.senderAccountIds.some(sender=>!this.canUseSender(sender)))fail('请先核对每个发送账号的官网私信连接和首个单聊授权');
  const bindings=this.bindings(rule);this.pause(ruleId,'规则重新启用，旧分配保留供核对');
  const next=clone(this.state);next.detail='规则已启用，仅处理启用后的新评论';this.commit(next);
  this.#armed.set(ruleId,{at:this.now(),activationId:randomUUID(),revision,bindings,ruleDigest:hash(rule)});
  if(rule.quotaMode){
   const restored=clone(this.state);let changed=false;
   for(const hit of restored.hits){
    if(hit.ruleId!==ruleId||hit.ruleRevision!==revision||!hit.resumePending||hit.bindingDigest!==bindings||this.now()-hit.admittedAt>rule.queueHours*3600000)continue;
    try{const task=this.tasks.get(hit.taskId);if(task.status!=='review'||task.claimedAt||this.store.getExternalAttempt(task.id)||outreachDigest(task)!==hit.taskDigest||sourceDigest(this.store.getMessage(hit.messageId))!==hit.sourceDigest)continue;
     Object.assign(hit,{status:'queued',resumePending:false,detail:'已恢复原账号的未发送队列，等待额度与发送前核对'});changed=true;
    }catch{/* Missing or changed source never becomes a new send. */}
   }
   if(changed)this.commit(restored);
  }
  this.#monitors.set(rule.primaryAccountId,{accountId:rule.primaryAccountId,status:'waiting',detail:'规则已启用，等待本轮官网读取回执',updatedAt:new Date(this.now()).toISOString(),lastReadAt:null});
  return this.snapshot();
 }
 pause(ruleId,detail='规则已暂停，未开始的分配保留供核对'){
  const rule=this.rule(ruleId);this.#armed.delete(ruleId);
  if(!this.state.rules.some(r=>r.primaryAccountId===rule.primaryAccountId&&this.#armed.has(r.id))){const previous=this.#monitors.get(rule.primaryAccountId);this.#monitors.set(rule.primaryAccountId,{accountId:rule.primaryAccountId,status:'paused',detail,updatedAt:new Date(this.now()).toISOString(),lastReadAt:previous?.lastReadAt||null});}
  if(this.#grant?.ruleId===ruleId)this.stop();
  const next=clone(this.state);for(const hit of next.hits)if(hit.ruleId===ruleId&&hit.status==='queued'){hit.resumePending=Boolean(rule.quotaMode&&hit.admittedAt!==undefined);hit.status='paused';hit.detail=detail;}
  next.detail=detail;this.commit(next);return this.snapshot();
 }
 pauseAll(detail){for(const ruleId of [...this.#armed.keys()])this.pause(ruleId,detail);}
 remove({id:ruleId,revision}){
  if(this.#closed)fail('关键词服务已关闭');const rule=this.rule(ruleId);if(rule.revision!==revision)fail('规则已变化，请刷新后再删除');
  this.pause(ruleId,'规则已删除，原分配与发送记录保留供核对');const next=clone(this.state);next.rules=next.rules.filter(r=>r.id!==ruleId);delete next.cursors[ruleId];this.commit(next);
  if(!next.rules.some(r=>r.primaryAccountId===rule.primaryAccountId))this.#monitors.delete(rule.primaryAccountId);return this.snapshot();
 }
 monitorPlan(){
  if(this.#closed)return[];const groups=new Map();
  for(const rule of this.state.rules){const armed=this.#armed.get(rule.id);if(!armed)continue;let group=groups.get(rule.primaryAccountId);if(!group){group={accountId:rule.primaryAccountId,versions:[],works:new Set(),all:false};groups.set(rule.primaryAccountId,group);}group.versions.push([rule.id,rule.revision,armed.activationId]);if(!rule.workIds.length)group.all=true;for(const workId of rule.workIds)group.works.add(workId);}
  return[...groups.values()].map(g=>({accountId:g.accountId,generation:hash(g.versions),workIds:g.all?[]:[...g.works].sort()}));
 }
 monitorResult(input){
  const plan=this.monitorPlan().find(p=>p.accountId===input?.accountId&&p.generation===input?.generation);if(!plan)return false;
  if(!['reading','ready','waiting','paused'].includes(input.status)||!Number.isFinite(Date.parse(input.at)))fail('评论监控状态不正确');
  const previous=this.#monitors.get(plan.accountId),detail=text(input.detail,500,'监控说明');
  if(input.status==='paused')for(const rule of this.state.rules.filter(r=>r.primaryAccountId===plan.accountId&&this.#armed.has(r.id)))this.pause(rule.id,detail);
  this.#monitors.set(plan.accountId,{accountId:plan.accountId,status:input.status,detail,updatedAt:input.at,lastReadAt:input.status==='ready'?input.at:previous?.lastReadAt||null});return true;
 }
 active(rule){const armed=this.#armed.get(rule.id);return armed&&armed.revision===rule.revision&&armed.ruleDigest===hash(rule)&&armed.bindings===this.bindings(rule)&&rule.senderAccountIds.every(id=>this.canUseSender(id))?armed:null;}
 hasArmedRules(){return !this.#closed&&this.state.rules.some(rule=>this.#armed.has(rule.id));}
 observe(message){
  if(this.#closed||!message||message.platform!=='douyin'||message.channel!=='comment'||message.historical||message.isOwn||message.isGroup)return null;
  if(!this.hasArmedRules())return null;
  try{if(sourceDigest(this.store.getMessage(message.id))!==sourceDigest(message))return null;}catch{return null;}
  const now=this.now(),received=Date.parse(message.receivedAt);if(!Number.isFinite(received)||received>now||now-received>MAX_AGE)return null;
  for(const rule of this.state.rules){
   const armed=this.#armed.get(rule.id);if(!armed||received<=armed.at||message.accountId!==rule.primaryAccountId||rule.workIds.length&&!rule.workIds.includes(message.threadId))continue;
   const incoming=normalize(message.text);if(!rule.keywords.some(k=>rule.match==='exact'?incoming.trim()===k:incoming.includes(k)))continue;
   if(this.store.hasPrivateTarget({platform:message.platform,senderId:message.senderId}))return null;
   if(this.state.hits.some(h=>h.messageId===message.id||h.recipientId===message.senderId))return null;
   if(this.state.hits.length>=MAX_HITS){this.pauseAll('命中记录已达2000条上限，请先核对并归档');return null;}
   try{if(!this.active(rule))fail('规则账号或绑定已改变');}catch{this.pauseAll('规则账号或绑定已改变，请重新核对');return null;}
   const recent=this.state.hits.filter(h=>h.ruleId===rule.id&&Date.parse(h.createdAt)>now-86400000);
   if(!rule.quotaMode&&(recent.length>=rule.dailyLimit||recent.filter(h=>Date.parse(h.createdAt)>now-3600000).length>=rule.hourlyLimit)){const detail='已达到规则频率上限，原队列保留；未创建更多分配';if(this.state.detail!==detail){const next=clone(this.state);next.detail=detail;this.commit(next);}return null;}
   const cursor=this.state.cursors[rule.id]||0,ordered=rule.senderAccountIds.map((_,i)=>rule.senderAccountIds[(cursor+i)%rule.senderAccountIds.length]);
   const quotas=rule.quotaMode?this.quotas(rule,now):[];
   const available=ordered.find(id=>{const q=quotas.find(q=>q.accountId===id);return q&&q.remaining>q.queued;});
   const accountId=available||ordered.reduce((best,id)=>{const q=quotas.find(q=>q.accountId===id),b=quotas.find(q=>q.accountId===best);return q&&b&&q.queued<b.queued?id:best;},ordered[0]);
   const hit={id:randomUUID(),ruleId:rule.id,ruleRevision:rule.revision,messageId:message.id,primaryAccountId:message.accountId,accountId,recipientId:message.senderId,sourceDigest:sourceDigest(message),status:'paused',createdAt:new Date(now).toISOString(),dueAt:now+rule.delaySeconds*1000,detail:'已固定分配，正在建立任务'};
   if(rule.quotaMode)Object.assign(hit,{admittedAt:now,bindingDigest:armed.bindings});
   const next=clone(this.state);next.hits.unshift(hit);next.cursors[rule.id]=cursor+1;this.commit(next);
   // Persist recipient assignment BEFORE task creation. A crash between the
   // two files leaves an inspectable decision, never an automatic retry.
   try{
    const created=this.tasks.create({primaryAccountId:rule.primaryAccountId,senderAccountIds:[accountId],messageIds:[message.id],channel:'dm',text:rule.replyText});
    if(created.length!==1||created[0].accountId!==accountId||created[0].recipientId!==message.senderId)fail('创建的任务与固定分配不一致');
    this.update(hit.id,{taskId:created[0].id,taskDigest:outreachDigest(created[0]),status:'queued',detail:'已命中关键词，等待发送间隔和原账号就绪'});
   }catch{this.update(hit.id,{status:'failed',detail:'固定分配未能建立，请核对原来源、重复记录或账号权限'});this.pauseAll('分配失败，自动规则已暂停；不会换账号重试');}
   return clone(this.state.hits.find(h=>h.id===hit.id));
  }
  return null;
 }
 update(hitId,patch){const next=clone(this.state),hit=next.hits.find(h=>h.id===hitId);if(!hit)fail('分配记录不存在');Object.assign(hit,patch);this.commit(next);}
 quotas(rule,now=this.now(),exceptId,tasks=new Map(this.tasks.snapshot().map(t=>[t.id,t]))){return rule.senderAccountIds.map(accountId=>accountQuota({rule,accountId,hits:this.state.hits,tasks,now,exceptId}));}
 sourceEligible(hit,rule,armed,received){
  if(!rule.quotaMode)return received>armed.at&&received<=this.now()&&this.now()-received<=MAX_AGE;
  return hit.bindingDigest===armed.bindings&&Number.isSafeInteger(hit.admittedAt)&&received<=hit.admittedAt&&hit.admittedAt-received<=MAX_AGE&&hit.admittedAt<=this.now()&&this.now()-hit.admittedAt<=rule.queueHours*3600000;
 }
 dispatchAllowed(rule,now,exceptId,accountId){
  if(rule.quotaMode)return this.quotas(rule,now,exceptId).some(q=>(!accountId||q.accountId===accountId)&&q.remaining>0);
  // Admission timestamps limit allocations, not delayed delivery. Count
  // durable attempt times as well, including unconfirmed/failed attempts.
  const attempts=this.state.hits.filter(h=>h.id!==exceptId&&h.ruleId===rule.id&&h.dispatchedAt!==undefined&&h.dispatchedAt>now-86400000);
  return attempts.length<rule.dailyLimit&&attempts.filter(h=>h.dispatchedAt>now-3600000).length<rule.hourlyLimit;
 }
 authorized(authority,taskIds){
  try{
   if(this.#closed||!this.#grant||hash(authority)!==hash(this.#grant)||taskIds.length!==1||taskIds[0]!==this.#grant.taskId)return false;
   const hit=this.state.hits.find(h=>h.id===authority.hitId),rule=this.rule(authority.ruleId),armed=this.active(rule);
   if(!hit||!armed||hit.ruleRevision!==rule.revision||hit.status!=='dispatching'||!hit.dispatchedAt||this.now()-hit.dispatchedAt>120000||!this.dispatchAllowed(rule,this.now(),hit.id,hit.accountId))return false;
   const source=this.store.getMessage(hit.messageId),received=Date.parse(source.receivedAt);
   return this.sourceEligible(hit,rule,armed,received)&&!this.store.hasPrivateTarget({platform:source.platform,senderId:source.senderId})&&sourceDigest(source)===hit.sourceDigest&&outreachDigest(this.tasks.get(hit.taskId))===hit.taskDigest;
  }catch{return false;}
 }
 settleUnsentHit(hit){
  let task,expired;
  try{
   const source=this.store.getMessage(hit.messageId),received=Date.parse(source.receivedAt),rule=this.rule(hit.ruleId),armed=this.active(rule);
   if(!armed||hit.status!=='queued'||hit.ruleRevision!==rule.revision||!Number.isFinite(received)||!rule.quotaMode&&received<=armed.at||sourceDigest(source)!==hit.sourceDigest)return false;
   expired=rule.quotaMode?this.now()-hit.admittedAt>rule.queueHours*3600000:this.now()-received>MAX_AGE;
   task=this.tasks.get(hit.taskId);
   if(outreachDigest(task)!==hit.taskDigest||!['review','cancelled'].includes(task.status)||task.claimedAt||this.store.getExternalAttempt(task.id))return false;
   if(!expired&&task.status!=='cancelled')return false;
  }catch{return false;}
  // Local expiry or explicit cancellation before any send attempt. A platform
  // failure or uncertain durable attempt still follows the pause path.
  // Cancel the exact original task first. Both steps are idempotent if the
  // second file write is interrupted; no sender is reassigned or retried.
  this.tasks.cancel(task.id);
  this.update(hit.id,{status:'paused',resumePending:false,detail:expired?(hit.admittedAt!==undefined?'评论已超过排队有效期，已取消未发送任务；继续监控新评论':'评论已超过10分钟有效期，已取消未发送任务；继续监控新评论'):'原任务已取消，未开始发送；继续监控新评论'});
  return true;
 }
 async tick(){
  // No armed rule can dispatch. Avoid policy-file reads and scanning history
  // while idle; enabled rules still run the complete fresh scheduling check.
  if(this.#closed||this.#running||!this.hasArmedRules()||!this.canSchedule())return;
  const lastDispatch=Math.max(0,...this.state.hits.map(h=>h.dispatchedAt||0));
  const checkedRules=new Set();
  const quotaViews=new Map();let quotaTasks;
  for(const hit of [...this.state.hits].reverse()){
   if(hit.status!=='queued'||hit.dueAt>this.now()||!this.#armed.has(hit.ruleId))continue;
   const queueKey=hit.ruleId+'/'+(this.rule(hit.ruleId).quotaMode?hit.accountId:'');
   if(checkedRules.has(queueKey))continue;
   if(this.settleUnsentHit(hit))return;
   const rule=this.rule(hit.ruleId);checkedRules.add(queueKey);
   if(this.now()<lastDispatch+rule.delaySeconds*1000)continue;
   if(rule.quotaMode&&!quotaViews.has(rule.id)){quotaTasks||=new Map(this.tasks.snapshot().map(t=>[t.id,t]));quotaViews.set(rule.id,this.quotas(rule,this.now(),undefined,quotaTasks));}
   const allowed=rule.quotaMode?quotaViews.get(rule.id).some(q=>q.accountId===hit.accountId&&q.remaining>0):this.dispatchAllowed(rule,this.now());
   if(!allowed){
    const detail=rule.quotaMode?'此账号成功额度已用完或有未确认占用，保留队列等待额度恢复':'已达到实际发送的一小时或24小时上限，等待窗口恢复；超时评论会取消';
    if(hit.detail!==detail)this.update(hit.id,{detail});
    continue;
   }
   if(rule.quotaMode){
    try{this.tasks.preflight(hit.taskId);}catch(error){
     const failure=error?.failure;
     if(failure?.outcome==='not-sent'&&failure.stage==='preflight'&&failure.scope==='account'&&['hourly_limit','daily_limit','outside_send_window'].includes(failure.code)){
      const detail='等待全局发送时段或尝试次数保护恢复；未提交，未扣成功额度';
      if(hit.detail!==detail)this.update(hit.id,{detail});continue;
     }
     // Other failures still go through original evidence and pause handling.
    }
   }
   this.#running=this.dispatch(hit);try{await this.#running;}finally{this.#running=null;}return;
  }
 }
 async dispatch(hit){
  try{
   this.update(hit.id,{status:'dispatching',dispatchedAt:this.now(),detail:'核对原评论和固定接收人，等待平台回执'});
   this.#grant={nonce:randomUUID(),hitId:hit.id,taskId:hit.taskId,ruleId:hit.ruleId};
   if(!this.authorized(this.#grant,[hit.taskId]))fail('自动规则或来源已失效');
   await this.start(hit.taskId,clone(this.#grant));
   const task=this.tasks.get(hit.taskId);
   if(task.status!=='sent'||!task.claimedAt||!task.receipt)fail('未取得本次发送成功回执');
   this.update(hit.id,{status:'sent',detail:'平台已确认此固定账号的私信发送'});
  }catch{
   let task;try{task=this.tasks.get(hit.taskId);}catch{}const rule=this.rule(hit.ruleId);
   if(rule.quotaMode&&task?.status==='failed'&&task.failure?.outcome==='not-sent'&&task.failure.scope==='task'){
    this.update(hit.id,{status:'failed',detail:'已确认未发送，不消耗成功额度；原接收人不自动重试，继续处理其他队列'});return;
   }
   this.update(hit.id,{status:'paused',detail:'发送未确认完成，请核对原任务；不会自动重试或换号'});
   this.pauseAll('发送未确认完成，自动规则已暂停，请核对原任务');
  }finally{this.#grant=null;}
 }
 reconcileObservedTask(taskId){
  const task=this.tasks.get(taskId);
  if(task.status!=='sent'||!task.claimedAt||typeof task.receipt!=='string'||!/^platform:\S+$/.test(task.receipt))return false;
  const hit=this.state.hits.find(h=>h.taskId===taskId&&h.status==='paused');
  if(!hit||outreachDigest(task)!==hit.taskDigest)return false;
  this.update(hit.id,{status:'sent',detail:'已自动核对原平台回执，成功额度已更新'});
  return true;
 }
 snapshot(){const now=this.now(),tasks=this.state.rules.some(r=>r.quotaMode)?new Map(this.tasks.snapshot().map(t=>[t.id,t])):undefined;return{rules:this.state.rules.map(rule=>({...clone(rule),...(rule.quotaMode?{quotas:this.quotas(rule,now,undefined,tasks)}:{}),armed:this.#armed.has(rule.id),activatedAt:this.#armed.has(rule.id)?new Date(this.#armed.get(rule.id).at).toISOString():null})),hits:clone(this.state.hits.slice(0,100)),monitors:clone([...this.#monitors.values()]),totalHits:this.state.hits.length,detail:this.state.detail,running:Boolean(this.#running)};}
 close(){this.#closed=true;this.pauseAll('软件已停止自动分配，原任务保留供核对');}
 async idle(){if(this.#running)await this.#running;}
}
module.exports={KeywordRoutes,validateRule,validateKeywordBusiness,sourceDigest};

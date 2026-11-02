'use strict';
// Main-process orchestration of the existing authenticated READ-only pager.
// No endpoint, credential, request method or arbitrary URL comes from a rule.
class KeywordCommentMonitor {
 #running=null;#closed=false;#nextAt=0;#position=0;#pages=new Map();
 constructor({plans,read,report,alive,paused,now=Date.now}){
  for(const fn of [plans,read,report,alive,paused,now])if(typeof fn!=='function')throw Error('评论监控组件不完整');
  Object.assign(this,{plans,read,report,alive,paused,now});
 }
 get available(){return !this.#closed&&this.alive()&&!this.paused();}
 async tick(){
  if(!this.available||this.#running||this.now()<this.#nextAt)return;
  this.#nextAt=this.now()+15000;this.#running=this.run();
  try{await this.#running;}finally{this.#running=null;this.#nextAt=this.now()+15000;}
 }
 async run(){
  const plans=await this.plans();if(!this.available||plans===null)return;
  if(!Array.isArray(plans)||plans.length>100||plans.some(p=>!p||typeof p.accountId!=='string'||!/^[a-f0-9]{64}$/.test(p.generation)||!Array.isArray(p.workIds)||p.workIds.length>1000||p.workIds.some(id=>typeof id!=='string'||!/^[1-9]\d{0,18}$/.test(id))))throw Error('评论监控范围不正确');
  const ids=new Set(plans.map(p=>p.accountId));if(ids.size!==plans.length)throw Error('评论监控账号重复');
  for(const accountId of this.#pages.keys())if(!ids.has(accountId))this.#pages.delete(accountId);
  if(!plans.length)return;
  const plan=plans[this.#position++%plans.length];
  let page=this.#pages.get(plan.accountId);if(!page||page.generation!==plan.generation){page={generation:plan.generation,position:0,cursor:null};this.#pages.set(plan.accountId,page);}
  const notify=(status,detail)=>this.report({accountId:plan.accountId,generation:plan.generation,status,detail,at:new Date(this.now()).toISOString()});
  if(await notify('reading','正在读取原账号官网评论分页')!==true||!this.available)return;
  try{
   const result=await this.read({accountId:plan.accountId,generation:plan.generation,...(page.cursor?{cursor:page.cursor}:{}),...(plan.workIds.length?{priorityWorkId:plan.workIds[page.position%plan.workIds.length]}:{})});
   if(this.#closed||!this.alive())return;
   if(result?.error){
    const message=String(result.error);
    if(['此抖音账号正在读取另一页，请稍候','抖音分页读取过于频繁，请稍后继续，已有结果保留','此抖音账号正在处理评论，请稍候'].some(detail=>message.includes(detail))){await notify('waiting','原账号正在处理其他读取或操作，保留分页位置，稍后继续');return;}
    throw Error('官网读取未完成');
   }
   if(!result||result.accountId!==plan.accountId||result.kind!=='comments'||typeof result.capturedAt!=='string'||!Number.isFinite(Date.parse(result.capturedAt))||result.nextCursor!==undefined&&(typeof result.nextCursor!=='string'||!/^[a-f0-9-]{36}$/i.test(result.nextCursor)))throw Error('官网监控回执不匹配');
   if(result.automationIntake&&result.automationIntake.status!=='complete'){await notify('paused','官网评论已读到，但本地规则接收尚未全部确认；已暂停该主号规则并保留原分页，请核对监控状态');return;}
   page.cursor=result.nextCursor||null;page.position++;
   await notify('ready','已读取一页官网评论；继续保留分页位置，仅处理启用后的新评论');
  }catch{
   if(this.available)await notify('paused','官网评论读取或身份核对未完成，已暂停该主号规则；请核对原账号页面');
  }
 }
 close(){this.#closed=true;this.#pages.clear();}
 async idle(){if(this.#running)await this.#running;}
}
// One plan per account combines ordinary replies with keyword assignments.
// Explicit modes only: the default review mode must not silently start a scan.
class ReplyCommentPlans {
 constructor({store,accounts,keywords}){Object.assign(this,{store,accounts,keywords});this.states=new Map();}
 plans(){
  const {rules,modes}=this.store.monitoringSettings(),combined=new Map(this.keywords.monitorPlan().map(p=>[p.accountId,{...p,keywordGeneration:p.generation}]));
  for(const a of this.accounts.values()){
   if(a.platform!=='douyin')continue;
   const mode=modes.find(m=>m.accountId===a.id&&m.channel==='comment'&&m.mode!=='off');
   const selected=rules.filter(r=>r.enabled&&['douyin','all'].includes(r.platform)&&['comment','all'].includes(r.channel)&&r.trigger==='message'&&(!r.accountIds.length||r.accountIds.includes(a.id)));
   if(!mode||!selected.length)continue;
   const existing=combined.get(a.id),generation=require('node:crypto').createHash('sha256').update(JSON.stringify([a.id,a.binding,mode,selected.map(r=>[r.id,r.revision]),existing?.generation])).digest('hex');
   combined.set(a.id,{accountId:a.id,generation,workIds:[],keywordGeneration:existing?.generation,ordinary:true});
  }
  for(const id of this.states.keys())if(!this.accounts.has(id))this.states.delete(id);
  return [...combined.values()];
 }
 report(input){
  const plan=this.plans().find(p=>p.accountId===input?.accountId&&p.generation===input?.generation);if(!plan)return false;
  if(!['reading','ready','waiting','paused'].includes(input.status)||!Number.isFinite(Date.parse(input.at)))throw Error('评论监控状态不正确');
  if(plan.keywordGeneration)this.keywords.monitorResult({...input,generation:plan.keywordGeneration});
  if(plan.ordinary){
   const previous=this.states.get(plan.accountId);
   this.states.set(plan.accountId,{accountId:plan.accountId,generation:plan.generation,status:input.status,detail:String(input.detail||'').slice(0,500),updatedAt:input.at,lastReadAt:input.status==='ready'?input.at:previous?.lastReadAt||null});
   if(input.status==='paused')this.store.setMode({accountId:plan.accountId,channel:'comment',mode:'off'});
  }
  return true;
 }
 snapshot(){
  const plans=this.plans();
  return [...this.accounts.values()].filter(a=>a.platform==='douyin').map(a=>{
   const active=plans.find(p=>p.accountId===a.id&&p.ordinary),previous=this.states.get(a.id);
   return active?{accountId:a.id,status:'waiting',detail:'已启用评论监控，等待下一页读取',updatedAt:'',lastReadAt:null,...(previous?.generation===active.generation?previous:{})}:previous?.status==='paused'?previous:{accountId:a.id,status:'off',detail:'未启动普通评论监控，请保存规则并选择回复模式',updatedAt:'',lastReadAt:previous?.lastReadAt||null};
  });
 }
}
module.exports={KeywordCommentMonitor,ReplyCommentPlans};

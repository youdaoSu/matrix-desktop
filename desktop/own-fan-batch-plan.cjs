'use strict';
const {randomUUID}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const copy=x=>structuredClone(x);
const active=p=>p&&['running','waiting'].includes(p.status);
function settings(value){
  const integer=(name,min,max)=>{const v=value?.[name];if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('批次人数或时间范围无效');return v;};
  if(value.followOnFailure!==undefined&&typeof value.followOnFailure!=='boolean')throw Error('关注后补发设置无效');
  return {batchSize:integer('batchSize',1,50),intervalSeconds:integer('intervalSeconds',5,3600),batchGapSeconds:integer('batchGapSeconds',5,86400),...(value.followOnFailure!==undefined?{followOnFailure:value.followOnFailure}:{})};
}
// Fixed, explicitly previewed recipients; no timer can expand the approved set.
// Each turn borrows the existing durable outreach queue for one recipient.
class OwnFanBatchPlan {
  constructor({load=()=>null,save,loadRoster,saveRoster,scan,check,createTask,getTask,sendTask,cancelTask,stopTask,recoverTask,recordSent=()=>{},canRun,now=Date.now,mono=()=>performance.now()}){
    Object.assign(this,{save,loadRoster,saveRoster,scan,check,createTask,getTask,sendTask,cancelTask,stopTask,recoverTask,recordSent,canRun,now,mono});
    this.previewValue=null;this.plan=null;this.epoch=0;this.working=null;this.preparing=false;this.due=0;
    const old=load();
    if(old){
      if(old.version===2&&old.plan&&typeof loadRoster==='function'){const roster=loadRoster(old.plan.id);if(roster?.id!==old.plan.id||roster.binding!==old.plan.binding||roster.accountId!==old.plan.accountId)throw Error('粉丝固定名单与原计划不一致，未发送');old.plan.recipients=roster.recipients;}
      if(![1,2].includes(old.version)||!old.plan||!Array.isArray(old.plan.recipients)||old.plan.recipients.length>(old.plan.scanAll===true?50000:500)||!Number.isSafeInteger(old.plan.cursor)||old.plan.cursor<0||old.plan.cursor>old.plan.recipients.length)throw Error('粉丝批次存档无效，原文件保留');
      settings(old.plan);this.plan=copy(old.plan);
      if(old.version===1&&this.saveRoster)this.saveRoster({id:this.plan.id,accountId:this.plan.accountId,binding:this.plan.binding,recipients:this.plan.recipients});
      if(active(this.plan)){this.plan.status='paused';this.plan.detail='软件已重启，进度保留；请继续未处理的粉丝。';this.plan.nextAt=null;this.persist();}
    }
  }
  persist(){
    try{if(this.plan&&this.saveRoster){const {recipients,...state}=this.plan;this.save({version:2,plan:copy(state)});}else this.save({version:1,plan:copy(this.plan)});}
    catch(error){
      ++this.epoch;this.previewValue=null;
      if(this.plan){this.plan.status='paused';this.plan.nextAt=null;this.plan.detail='进度保存失败，已停止发送；请保留原记录后检查存储。';}
      try{this.stopTask();}catch{}
      throw error;
    }
  }
  reconcileObservedTask(taskId){
    const p=this.plan;
    if(!p||p.status!=='paused'||this.working||p.taskId!==taskId)return false;
    const task=this.getTask(taskId),fan=p.recipients[p.cursor];
    if(!fan||task.origin!=='own-fan'||task.accountId!==p.accountId||task.primaryAccountId!==p.accountId||task.recipientId!==fan.id||task.replyText!==p.text||task.status!=='sent'||typeof task.receipt!=='string'||!/^platform:\S+$/.test(task.receipt))return false;
    this.recordSent(p,fan,task);p.sent++;p.cursor++;p.taskId=null;p.nextAt=null;
    if(p.cursor===p.recipients.length)p.status='completed';
    p.detail='原任务已自动核对成功，已更新成功数。后续批次保持当前暂停状态。';
    this.persist();return true;
  }
  snapshot(){
    if(!this.plan)return null;
    const {recipients,binding,...p}=this.plan;
    return {...copy(p),total:recipients.length,remaining:recipients.length-p.cursor,working:!!this.working};
  }
  async preview(input){
    if(this.preparing||this.working||active(this.plan))throw Error('当前粉丝计划仍在运行，请先暂停');
    if(this.plan&&this.plan.cursor<this.plan.recipients.length&&!['cancelled','completed'].includes(this.plan.status))throw Error('请继续或结束原计划后再建立新计划');
    const timing=settings(input);
    if(typeof input.accountId!=='string'||typeof input.text!=='string'||!input.text.trim()||input.text.length>2000||input.text.includes('\0'))throw Error('请选择账号并填写 1 至 2000 字私信');
    if(input.scanAll!==undefined&&typeof input.scanAll!=='boolean')throw Error('全部粉丝核对范围无效');
    if(!Number.isSafeInteger(input.offset)||input.offset<0||input.offset>50000||!Number.isSafeInteger(input.scanLimit)||input.scanLimit<1||input.scanLimit>500||input.scanAll===true&&input.offset!==0)throw Error('每次核对 1 至 500 位缓存粉丝，全部核对须从首位开始');
    const epoch=++this.epoch;this.previewValue=null;this.preparing=true;
    try{
      const result=await this.scan({...input,isCurrent:()=>epoch===this.epoch&&this.preparing});
      if(epoch!==this.epoch)throw Error('核对已取消');
      if(!result?.binding||!Array.isArray(result.recipients)||result.recipients.length>(input.scanAll===true?50000:500)||new Set(result.recipients.map(r=>r.id)).size!==result.recipients.length)throw Error('粉丝名单核对结果无效');
      const value={...timing,scanAll:input.scanAll===true,accountId:input.accountId,text:input.text,binding:result.binding,recipients:copy(result.recipients),scanned:result.scanned,excluded:result.excluded,unknown:result.unknown,nextOffset:result.nextOffset,sourceTotal:result.sourceTotal,sourceComplete:result.sourceComplete===true,token:randomUUID(),expiresAt:this.now()+300000};
      this.previewValue=value;
      const {binding,recipients,...visible}=value;return {...copy(visible),recipientCount:recipients.length,recipients:copy(recipients.slice(0,50))};
    }finally{this.preparing=false;}
  }
  previewPage({token,offset=0,limit=50}={}){
    const p=this.previewValue;if(!p||token!==p.token||this.now()>=p.expiresAt||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('粉丝预览已失效，请重新核对');
    return {token,offset,total:p.recipients.length,items:copy(p.recipients.slice(offset,offset+limit))};
  }
  start({token,acknowledge}={}){
    const p=this.previewValue;
    if(this.working||this.preparing||active(this.plan)||!p||token!==p.token||acknowledge!==true||this.now()>=p.expiresAt)throw Error('请重新核对本次粉丝名单、账号和文案');
    if(!p.recipients.length)throw Error('没有满足未联系条件的粉丝');
    this.previewValue=null;++this.epoch;
    const {token:_,expiresAt,...value}=p;
    const next={...copy(value),id:randomUUID(),status:'running',cursor:0,sent:0,skipped:0,friendRequired:0,followed:0,taskId:null,nextAt:null,createdAt:new Date(this.now()).toISOString(),detail:'已确认本次名单，等待原账号就绪'};
    if(this.saveRoster)this.saveRoster({id:next.id,accountId:next.accountId,binding:next.binding,recipients:next.recipients});
    this.plan=next;
    this.due=this.mono();this.persist();return this.snapshot();
  }
  pause(detail='已暂停，保留未处理位置'){
    ++this.epoch;this.previewValue=null;
    if(this.plan&&!['completed','cancelled'].includes(this.plan.status)){this.plan.status='paused';this.plan.nextAt=null;this.plan.detail=detail;this.stopTask();this.persist();}
    return this.snapshot();
  }
  resume(){
    if(!this.plan||this.plan.status!=='paused'||this.working||this.preparing)throw Error('当前计划不能继续或上一步仍在收尾');
    if(this.plan.taskId){const t=this.getTask(this.plan.taskId);if(t.status!=='review'&&t.status!=='sent'&&!(this.plan.followOnFailure&&t.status==='failed'&&t.failure?.outcome==='not-sent'&&this.recoverTask))throw Error('当前对象有失败或不明结果，请先核对原任务；不会重发');}
    ++this.epoch;this.plan.status='waiting';
    // Continuing never shortens the saved minimum delay after the last send.
    const delay=Math.max(0,(this.plan.notBefore||0)-this.now(),this.due-this.mono());
    this.due=this.mono()+delay;this.plan.nextAt=new Date(this.now()+delay).toISOString();this.plan.detail='从上次未处理位置继续，等待发送间隔';this.persist();return this.snapshot();
  }
  cancel(){
    this.pause('计划已结束，未处理对象不再发送');
    if(this.working)throw Error('正在结束当前操作，请稍后结束计划');
    if(this.plan){if(this.plan.taskId){const t=this.getTask(this.plan.taskId);if(t.status==='review'&&!t.claimedAt)this.cancelTask(t.id);}this.plan.status='cancelled';this.persist();}
    return this.snapshot();
  }
  async tick(){
    if(this.working||this.preparing||!active(this.plan)||this.mono()<this.due||!this.canRun())return;
    const p=this.plan,epoch=this.epoch;
    const current=()=>this.plan===p&&this.epoch===epoch&&active(p);
    const action=async()=>{
      try{
        const fan=p.recipients[p.cursor];if(!fan){p.status='completed';p.nextAt=null;p.detail='本次固定名单已处理完成';this.persist();return;}
        let task=p.taskId?this.getTask(p.taskId):null;
        let terminalSkip=false;
        const assertTask=t=>{if(t.origin!=='own-fan'||t.accountId!==p.accountId||t.primaryAccountId!==p.accountId||t.recipientId!==fan.id||t.replyText!==p.text)throw Error('原任务与本次账号、粉丝或文案不一致，未继续发送');};
        if(task)assertTask(task);
        if(task&&task.status!=='review'&&task.status!=='sent'){
          if(!p.followOnFailure||!this.recoverTask||task.status!=='failed'||task.failure?.outcome!=='not-sent')throw Error('当前发送结果需要核对，未继续下一位');
          const recovered=await this.recoverTask(p,fan,task,()=>current());if(!current())return;
          if(recovered?.state==='friend-required'){p.friendRequired=(p.friendRequired||0)+1;p.skipped++;task=null;terminalSkip=true;}
          else if(recovered?.task){p.taskId=recovered.task.id;p.followed=(p.followed||0)+1;p.status='waiting';p.notBefore=this.now()+p.intervalSeconds*1000;this.due=this.mono()+p.intervalSeconds*1000;p.nextAt=new Date(p.notBefore).toISOString();p.detail='普通关注已确认，等待间隔后核对原粉丝并补发一次';this.persist();return;}
          else throw Error('关注或好友关系尚未取得确定结果，已暂停，不会重复关注或重发');
        }
        if(task?.status==='sent'){
          if(typeof task.receipt!=='string'||!/^platform:\S+$/.test(task.receipt))throw Error('没有可靠的平台回执，未累计成功次数');
        }else if(!terminalSkip){
          const evidence=await this.check(p,fan);
          if(!current())return;
          if(evidence==='contacted'){
            if(task){if(task.claimedAt)throw Error('已尝试的任务需要核对');this.cancelTask(task.id);}p.skipped++;
          }else{
            if(evidence!=='eligible')throw Error('此对象的历史或账号尚未核对完整，已保留当前位置');
            if(!task){task=this.createTask(p,fan);assertTask(task);p.taskId=task.id;this.persist();}
            if(!current())return;
            p.status='running';p.nextAt=null;p.detail=`正在处理第 ${p.cursor+1}/${p.recipients.length} 位粉丝`;this.persist();
            await this.sendTask(task.id);
            task=this.getTask(task.id);assertTask(task);
            if(task.status==='failed'&&task.failure?.outcome==='not-sent'&&p.followOnFailure&&this.recoverTask&&!task.followupOf){
              p.status='waiting';p.notBefore=this.now()+p.intervalSeconds*1000;this.due=this.mono()+p.intervalSeconds*1000;p.nextAt=new Date(p.notBefore).toISOString();p.detail='本条明确未发送，等待间隔后核对普通关注条件';this.persist();return;
            }
            if(task.status!=='sent'||typeof task.receipt!=='string'||!/^platform:\S+$/.test(task.receipt))throw Error('未取得确定发送回执，已暂停；不会重复发送');
          }
        }
        if(task?.status==='sent'){this.recordSent(p,fan,task);p.sent++;}
        p.cursor++;p.taskId=null;
        const delay=(p.cursor%p.batchSize===0?Math.max(p.intervalSeconds,p.batchGapSeconds):p.intervalSeconds)*1000;
        p.notBefore=this.now()+delay;this.due=this.mono()+delay;
        if(current()){
          p.status=p.cursor===p.recipients.length?'completed':'waiting';
          p.nextAt=p.status==='waiting'?new Date(p.notBefore).toISOString():null;
          p.detail=p.status==='completed'?'本次固定名单处理完成':p.cursor%p.batchSize===0?'本批结束，等待后自动读取下一批':'等待逐条发送间隔';
        }
        this.persist();
      }catch(error){if(current())this.pause(String(error?.message||'粉丝计划暂停').slice(0,300));}
    };
    this.working=Promise.resolve().then(action);
    try{await this.working;}finally{this.working=null;}
  }
  idle(){return this.working||Promise.resolve();}
}
module.exports={OwnFanBatchPlan,settings};

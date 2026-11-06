'use strict';
const {randomUUID}=require('node:crypto');
function recoverable(task){
  const f=task?.failure;
  return task?.origin==='own-fan'&&!task.followupOf&&task.status==='failed'&&f?.outcome==='not-sent'&&f.scope==='task'&&
    (f.stage==='preflight'&&!task.claimedAt&&f.code==='task-error'||f.code==='recipient-restricted'&&f.stage==='receipt'&&/^platform-rejection:\S+$/.test(f.evidence||''));
}
class OwnFanWelcomeLedger{
  constructor({load=()=>null,save,now=Date.now}){
    Object.assign(this,{save,now});this.rows=new Map();
    const old=load();if(old){
      if(old.version!==1||!Array.isArray(old.records)||old.records.length>50000)throw Error('粉丝欢迎语排除记录无效，原文件保留');
      for(const row of old.records){
        if(!row||typeof row.key!=='string'||!['follow-claimed','followed','friend-required','sent','unknown'].includes(row.state)||typeof row.fanId!=='string'||typeof row.uid!=='string'||!Number.isFinite(Date.parse(row.at))||this.rows.has(row.key))throw Error('粉丝欢迎语排除记录冲突，未继续');
        const key=JSON.parse(row.key);if(!Array.isArray(key)||key.length!==3||key[0]!=='douyin'||!/^\d+$/.test(key[1])||key[2]!==row.uid||!/^MS4w[\w-]+$/.test(row.fanId)||typeof row.taskId!=='string'||!/^[a-f0-9-]{36}$/.test(row.taskId)||row.state!=='sent'&&(typeof row.claimId!=='string'||!/^[a-f0-9-]{36}$/.test(row.claimId)))throw Error('粉丝欢迎语排除记录的归属或领取凭据无效');
        this.rows.set(row.key,structuredClone(row));
      }
    }
  }
  key(plan,fan){const b=typeof plan.binding==='string'?JSON.parse(plan.binding):plan.binding;if(!/^[1-9]\d{0,63}$/.test(b?.identity||'')||!/^MS4w[\w-]+$/.test(fan.id||'')||!/^\d+$/.test(fan.uid||''))throw Error('粉丝欢迎语本人或接收人身份无效');return JSON.stringify(['douyin',b.identity,fan.uid]);}
  get(plan,fan){const row=this.rows.get(this.key(plan,fan));if(row&&row.fanId!==fan.id)throw Error('粉丝 UID 与主页身份冲突，已停止');return row?structuredClone(row):null;}
  persist(row){
    const old=this.rows.get(row.key);if(old&&['sent','friend-required'].includes(old.state)&&old.state!==row.state)throw Error('粉丝终结排除记录不能撤销');
    if(!old&&this.rows.size>=50000)throw Error('欢迎语排除记录达到容量，未丢弃原记录');
    const next=new Map(this.rows);next.set(row.key,{...row,at:new Date(this.now()).toISOString()});
    this.save({version:1,records:[...next.values()]});this.rows=next;return structuredClone(next.get(row.key));
  }
  claim(plan,fan,task){
    if(!recoverable(task)||plan.followOnFailure!==true||task.accountId!==plan.accountId||task.recipientId!==fan.id)throw Error('当前失败没有明确未发送证据，未关注或补发');
    const old=this.get(plan,fan);if(old){if(old.taskId===task.id&&old.state==='followed')return old;throw Error('此粉丝已有关注尝试或排除记录，不会重复关注');}
    return this.persist({key:this.key(plan,fan),accountId:plan.accountId,fanId:fan.id,uid:fan.uid,taskId:task.id,claimId:randomUUID(),state:'follow-claimed'});
  }
  result(plan,fan,taskId,result){
    const row=this.get(plan,fan);if(!row||row.taskId!==taskId||row.state!=='follow-claimed')throw Error('关注结果与原持久任务不一致');
    const state=result?.state==='followed'&&result.changed===true?'followed':result?.state==='friend-required'?'friend-required':'unknown';
    return this.persist({...row,state});
  }
  sent(plan,fan,task){
    if(task.status!=='sent'||typeof task.receipt!=='string'||!/^platform:\S+$/.test(task.receipt)||task.accountId!==plan.accountId||task.recipientId!==fan.id)throw Error('没有此账号与粉丝的确定发送回执，未记成功');
    const old=this.get(plan,fan);return this.persist({...old,key:this.key(plan,fan),accountId:plan.accountId,fanId:fan.id,uid:fan.uid,taskId:task.id,state:'sent',receipt:task.receipt});
  }
}
module.exports={OwnFanWelcomeLedger,recoverable};

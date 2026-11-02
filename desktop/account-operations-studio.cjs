'use strict';
// Minimal owner-scoped bridge for the imported interaction/outreach managers.
// Account creation, login, publishing and plaintext source backups are absent.
const path=require('node:path');
const {read,write}=require('./vendor/hengyuan-interactions/src/workspace-data.cjs');
const {validateOutreachTask,IMMUTABLE_OUTREACH,ACTIVE_OUTREACH}=require('./vendor/hengyuan-interactions/src/outreach.cjs');
const clone=value=>structuredClone(value),uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=message=>{throw Error(message);};
function string(value,max,required=false){if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)||required&&!value.trim())fail('账号运营字段格式无效');return value;}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('账号运营记录时间无效');return value;}
function validate(value){
 if(!value||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.accounts)||value.accounts.length>1000||!Array.isArray(value.outreach)||value.outreach.length>50000)fail('账号运营分工存档损坏；原文件保留');
 const ids=new Set(),accounts=value.accounts.map(a=>{
  if(!a||!uuid(a.id)||ids.has(a.id)||!['douyin','xiaohongshu'].includes(a.platform)||!['independent','primary','member'].includes(a.role)||(a.role==='member'?!uuid(a.primaryAccountId):a.primaryAccountId!==null))fail('账号运营账号或分工无效');
  ids.add(a.id);return{id:a.id,name:string(a.name,200,true),platform:a.platform,binding:string(a.binding,4000,true),role:a.role,primaryAccountId:a.primaryAccountId,group:string(a.group,100),notes:string(a.notes,5000),createdAt:date(a.createdAt),updatedAt:date(a.updatedAt)};
 });
 for(const a of accounts)if(a.role==='member'){const primary=accounts.find(p=>p.id===a.primaryAccountId);if(!primary||primary.id===a.id||primary.role!=='primary'||primary.platform!==a.platform)fail('协作账号必须关联同平台的有效主账号');}
 const seen=new Set(),outreach=value.outreach.map(task=>{const clean=validateOutreachTask(task);if(seen.has(clean.id)||!ids.has(clean.primaryAccountId)||!ids.has(clean.accountId))fail('协作任务存在重复编号或缺失账号');seen.add(clean.id);return clean;});
 for(const t of outreach)if(ACTIVE_OUTREACH.has(t.status)){const p=accounts.find(a=>a.id===t.primaryAccountId),a=accounts.find(a=>a.id===t.accountId);if(p.role!=='primary'||(['primary-followup','own-fan'].includes(t.origin)?a.id!==p.id:a.role!=='member'||a.primaryAccountId!==p.id)||a.platform!==t.platform||p.platform!==t.platform)fail('活跃协作任务与冻结的账号分工不一致');}
 return{version:1,revision:value.revision,accounts,outreach};
}
class OperationsStudio{
 constructor({directory,now=Date.now}){if(typeof now!=='function')fail('账号运营时钟无效');this.file=path.join(directory,'operations-studio.json');this.now=now;this.live=new Map();this.persisted=read(this.file,true);this.state=validate(this.persisted||{version:1,revision:0,accounts:[],outreach:[]});this.taskIndex=new Map(this.state.outreach.map(t=>[t.id,t]));}
 date(){return new Date(this.now()).toISOString();}
 commit(value){const next=validate({...value,revision:this.state.revision+1});write(this.file,next,{expected:this.persisted});this.state=next;this.persisted=clone(next);this.taskIndex=new Map(next.outreach.map(t=>[t.id,t]));}
 configure(list){
  if(!Array.isArray(list)||list.length>100)fail('绑定账号列表无效');const live=new Map(),next=clone(this.state),at=this.date();
  for(const account of list){if(!account||!uuid(account.id)||live.has(account.id)||!['douyin','xiaohongshu'].includes(account.platform)||typeof account.binding!=='string'||!account.binding)fail('绑定账号列表无效');
   const prior=next.accounts.find(a=>a.id===account.id);if(prior&&(prior.platform!==account.platform||prior.binding!==account.binding))fail('同一运营编号不能更换平台或登录绑定');
   const metadata=prior||{id:account.id,name:account.name,platform:account.platform,binding:account.binding,role:'independent',primaryAccountId:null,group:'',notes:'',createdAt:at,updatedAt:at};
   if(!prior)next.accounts.push(metadata);else if(metadata.name!==account.name){metadata.name=account.name;metadata.updatedAt=at;}
   live.set(account.id,clone(account));
  }
  if(!equal(this.state.accounts,next.accounts))this.commit(next);this.live=live;return this.activeAccounts();
 }
 getAccount(id){const live=this.live.get(id),a=this.state.accounts.find(a=>a.id===id);if(!live||!a||live.binding!==a.binding||live.platform!==a.platform)fail('账号已解绑或身份改变；旧任务不会迁给其他账号');return clone({...a,...live,role:a.role,primaryAccountId:a.primaryAccountId,group:a.group,notes:a.notes});}
 activeAccounts(){return [...this.live.keys()].map(id=>this.getAccount(id));}
 snapshot(){return clone(this.state);}
 outreachSnapshot(){return clone(this.state.outreach);}
 outreachTask(id){const task=this.taskIndex.get(id);if(!task)fail('协作任务不存在');return clone(task);}
 outreachPage(input=300){
  const query=typeof input==='number'?{limit:input}:input;
  if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).some(key=>!['offset','limit','status','accountId'].includes(key)))fail('协作任务分页条件无效');
  const {limit=100,status='all',accountId=''}=query;let {offset=0}=query;
  if(!Number.isInteger(limit)||limit<1||limit>300||!Number.isInteger(offset)||offset<0||offset>50000)fail('协作任务列表容量或位置无效');
  if(!['all','review','sending','sent','unknown','failed','cancelled'].includes(status)||typeof accountId!=='string'||accountId!==''&&(!uuid(accountId)||!this.state.accounts.some(account=>account.id===accountId)))fail('协作任务筛选条件无效');
  const matches=task=>(status==='all'||task.status===status)&&(!accountId||task.accountId===accountId);
  let matchingTasks=0,selected=[];
  for(const task of this.state.outreach)if(matches(task)){if(matchingTasks>=offset&&selected.length<limit)selected.push(task);matchingTasks++;}
  if(offset>=matchingTasks){offset=matchingTasks?Math.floor((matchingTasks-1)/limit)*limit:0;selected=[];let index=0;for(const task of this.state.outreach)if(matches(task)){if(index>=offset&&selected.length<limit)selected.push(task);index++;}}
  return{tasks:clone(selected),totalTasks:this.state.outreach.length,matchingTasks,offset,limit,status,accountId};
 }
 managerView(){return{getAccount:id=>this.getAccount(id),snapshot:()=>({...this.snapshot(),accounts:this.activeAccounts()})};}
 saveTeams(input){
  if(!Array.isArray(input)||!input.length||input.length>100||new Set(input.map(a=>a?.id)).size!==input.length)fail('账号分工修改无效');
  const next=clone(this.state),at=this.date();
  for(const change of input){if(!change||Object.keys(change).some(k=>!['id','role','primaryAccountId','group','notes'].includes(k)))fail('只允许修改已绑定账号的运营分工');this.getAccount(change.id);const a=next.accounts.find(a=>a.id===change.id),role=change.role??a.role,primary=role==='member'?(change.primaryAccountId??a.primaryAccountId):null;
   if((role!==a.role||primary!==a.primaryAccountId)&&next.outreach.some(t=>ACTIVE_OUTREACH.has(t.status)&&[t.accountId,t.primaryAccountId].includes(a.id)))fail('账号仍有待确认、正在发送或未知结果任务；先取消或核对，不能改变分工');
   if(primary!==null)this.getAccount(primary);Object.assign(a,{role,primaryAccountId:primary,group:change.group===undefined?a.group:string(change.group,100),notes:change.notes===undefined?a.notes:string(change.notes,5000),updatedAt:at});
  }
  this.commit(next);return this.activeAccounts();
 }
 mutateOutreach(action){
  if(typeof action!=='function')fail('协作任务修改方法无效');const next=clone(this.state);action(next.outreach);const clean=validate(next);
  const currentById=new Map(clean.outreach.map(task=>[task.id,task]));
  for(const prior of this.state.outreach){const current=currentById.get(prior.id);if(!current||IMMUTABLE_OUTREACH.some(field=>!equal(prior[field],current[field])))fail('协作任务来源、账号、目标和内容不可更换');if(prior.claimedAt&&prior.claimedAt!==current.claimedAt)fail('协作任务领取时间不可更换');const history=prior.preflightHistory||[],updated=current.preflightHistory||[];if(updated.length<history.length||history.some((v,i)=>!equal(v,updated[i])))fail('协作任务恢复历史不可删除或修改');}
  this.commit(clean);
 }
}
module.exports={OperationsStudio};

'use strict';
const path=require('node:path');
const {read,write}=require('./vendor/hengyuan-interactions/src/workspace-data.cjs');
const clone=value=>structuredClone(value),key=target=>JSON.stringify([target.accountId,target.senderId]);
function text(value,max){if(typeof value!=='string'||value.includes('\0')||value.length>max)throw Error('联系人备注或标签格式无效');return value.trim();}
class OperationsContactNotes{
 constructor({directory,studio,store,fans}){Object.assign(this,{studio,store,fans});this.file=path.join(directory,'contact-notes.json');this.persisted=read(this.file,true);this.state=this.persisted||{version:1,records:[]};if(this.state.version!==1||!Array.isArray(this.state.records)||this.state.records.length>100000||new Set(this.state.records.map(key)).size!==this.state.records.length)throw Error('联系人备注存档损坏，原记录保留');}
 target(input){
  const account=this.studio.getAccount(input.accountId);
  if(Boolean(input.messageId)===Boolean(input.fanId))throw Error('请选择唯一的真实来信或目录联系人');
  if(input.messageId){const message=this.store.getMessage(input.messageId);if(message.accountId!==account.id||message.platform!==account.platform||message.isOwn||message.isGroup)throw Error('备注对象与原账号或实际来信不一致');return{accountId:account.id,platform:account.platform,senderId:message.senderId,name:message.senderName||'',...(message.profileUrl?{profileUrl:message.profileUrl}:{})};}
  const {fan}=this.fans.getRecipients({primaryAccountId:input.primaryAccountId,accountId:account.id,fanIds:[input.fanId]})[0];return{accountId:account.id,platform:account.platform,senderId:fan.uid,name:fan.name,profileUrl:fan.profileUrl};
 }
 get(input){const target=this.target(input);return{target,record:clone(this.state.records.find(r=>key(r)===key(target))||null)};}
 save(input){const target=this.target(input),alias=text(input.alias||'',200),notes=text(input.notes||'',5000);if(!Array.isArray(input.tags)||input.tags.length>20)throw Error('联系人标签最多20项');const tags=[...new Set(input.tags.map(v=>text(v,50)))].filter(Boolean),at=new Date().toISOString(),old=this.state.records.find(r=>key(r)===key(target)),record={...target,alias,tags,notes,createdAt:old?.createdAt||at,updatedAt:at},next={version:1,records:[record,...this.state.records.filter(r=>key(r)!==key(target))]};if(next.records.length>100000)throw Error('联系人备注达到本轮安全容量');write(this.file,next,{expected:this.persisted});this.state=next;this.persisted=next;return clone(record);}
 remove(input){const target=this.target(input),next={version:1,records:this.state.records.filter(r=>key(r)!==key(target))};write(this.file,next,{expected:this.persisted});this.state=next;this.persisted=next;return{removed:true,platformRecordChanged:false};}
 list({accountId,query='',offset=0,limit=50}){this.studio.getAccount(accountId);text(query,100);if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('联系人备注分页参数无效');const needle=query.trim().toLocaleLowerCase(),rows=this.state.records.filter(r=>r.accountId===accountId&&(!needle||[r.name,r.alias,r.notes,...r.tags].join('\n').toLocaleLowerCase().includes(needle)));return{total:rows.length,offset,records:clone(rows.slice(offset,offset+limit))};}
}
module.exports={OperationsContactNotes};

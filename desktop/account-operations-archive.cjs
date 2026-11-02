'use strict';
// Business-only transfer. Never restores browser profiles, sessions, keys,
// runnable publishing jobs, send claims, auto modes or incoming event authority.
const path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {read,write}=require('./vendor/hengyuan-interactions/src/workspace-data.cjs');
const {validateOutreachRelations}=require('./vendor/hengyuan-interactions/src/outreach.cjs');
const {validateKeywordBusiness}=require('./account-operations-keyword-routes.cjs');
const MAX=16*1024*1024,clone=value=>structuredClone(value),hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex'),uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const fail=message=>{throw Error(message);};
function inspectTree(value){const queue=[[value,0]];let n=0;while(queue.length){const [v,depth]=queue.pop();if(++n>500000||depth>40)fail('业务备份嵌套或记录数量超过本轮安全容量');if(v&&typeof v==='object')for(const key of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(key)||/^(?:cookies?|password|authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|browserProfiles|encryptionKey|privateKey)$/i.test(key))fail('备份包含不允许迁移的执行属性、登录凭据或密钥字段，未导入');queue.push([v[key],depth+1]);}}}
function fixedUuid(seed){const bytes=Buffer.from(hash(seed).slice(0,32),'hex');bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const s=bytes.toString('hex');return`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
class OperationsArchive{
 constructor({directory,studio,store,keywordRoutes,canImport,now=Date.now}){this.file=path.join(directory,'business-archives.json');Object.assign(this,{studio,store,keywordRoutes,canImport,now});this.persisted=read(this.file,true);this.entries=this.persisted||{version:1,records:[]};if(this.entries.version!==1||!Array.isArray(this.entries.records)||this.entries.records.length>20)fail('业务归档索引损坏，原文件保留');this.inspection=null;this.preview=null;}
 parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX)fail('本轮单份业务备份最多 16 MiB，不会截断导入');let value;try{value=JSON.parse(text);}catch{fail('备份不是有效 JSON，未修改原数据');}inspectTree(value);
  if(!value||Object.keys(value).length!==5||Object.keys(value).some(k=>!['format','version','createdAt','data','sha256'].includes(k)))fail('业务备份字段或格式不正确');
  const {sha256,...body}=value;if(!/^[a-f0-9]{64}$/.test(sha256||'')||hash(body)!==sha256||!(body.format==='hengyuan-business-backup'&&[1,2].includes(body.version)||body.format==='yuanxiao-operations-backup'&&[1,2].includes(body.version)))fail('业务备份格式或摘要不匹配，未导入');
  if(typeof body.createdAt!=='string'||!Number.isFinite(Date.parse(body.createdAt))||!body.data||typeof body.data!=='object'||Array.isArray(body.data))fail('业务备份日期或数据集合无效');
  const expected=body.format==='hengyuan-business-backup'&&body.version===1?['studio.json','interactions.json','contacts.json']:['studio.json','interactions.json','contacts.json','publishing.json',...(body.format==='yuanxiao-operations-backup'?['fan-followup.json',...(body.version===2?['keyword-routes.json']:[])]:[])];
  if(Object.keys(body.data).length!==expected.length||expected.some(k=>!Object.hasOwn(body.data,k)))fail('业务备份文件集合不正确，不读取任何外部路径');
  const oldStudio=body.data['studio.json'];if(!oldStudio||oldStudio.schemaVersion!==1||!Array.isArray(oldStudio.accounts)||oldStudio.accounts.length>1000)fail('备份中的账号列表无效');
  const ids=new Set(),accounts=oldStudio.accounts.map(a=>{if(!a||!uuid(a.id)||ids.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>200||typeof a.platform!=='string'||a.platform.length>100)fail('备份账号编号、平台或名称无效');ids.add(a.id);return{id:a.id,name:a.name,platform:a.platform,role:a.role||'independent',primaryAccountId:a.primaryAccountId||null};});
  const interaction=this.store.validateBusinessState(body.data['interactions.json']);if(interaction.rules.length>1000||interaction.messages.length>100000)fail('备份规则或历史记录超过本轮安全容量');
  const map=new Map(accounts.map(a=>[a.id,a]));for(const m of interaction.messages)if(!map.has(m.accountId)||map.get(m.accountId).platform!==m.platform)fail('历史互动与备份账号的平台关联不正确');for(const rule of interaction.rules)if(rule.accountIds.some(id=>!map.has(id)))fail('备份规则引用了缺失账号');
  validateOutreachRelations({...oldStudio,accounts,outreach:oldStudio.outreach||[]},interaction);
  const contacts=body.data['contacts.json'];if(!contacts||contacts.schemaVersion!==1||!Array.isArray(contacts.contacts)||contacts.contacts.length>100000||contacts.contacts.some(c=>!c||!ids.has(c.accountId)||typeof c.senderId!=='string'||c.senderId.length>1000||!Array.isArray(c.tags)||c.tags.length>20))fail('备份联系人数据无效');
  const publishing=body.data['publishing.json'];if(publishing&&(!Array.isArray(publishing.jobs)||publishing.jobs.length>100000))fail('备份发布历史格式无效');
  const keywordState=body.data['keyword-routes.json']?validateKeywordBusiness(body.data['keyword-routes.json']):{version:1,rules:[],hits:[]};
  return{body:clone(body),sha256,accounts,interaction,keywordState,counts:{accounts:accounts.length,rules:interaction.rules.length,messages:interaction.messages.length,replies:interaction.replies.length,outreach:(oldStudio.outreach||[]).length,contacts:contacts.contacts.length,publishing:publishing?.jobs.length||0,keywordRules:keywordState.rules.length,keywordHits:keywordState.hits.length}};
 }
 inspect(text){const parsed=this.parse(text),id=randomUUID();this.inspection={...parsed,id,at:this.now()};this.preview=null;return{id,accounts:parsed.accounts,counts:parsed.counts,source:parsed.body.format,sha256:parsed.sha256};}
 prepare({inspectionId,mapping}){
  const source=this.inspection;if(!source||source.id!==inspectionId||this.now()-source.at>30*60*1000||this.now()<source.at)fail('备份检查已过期，请重新选择文件');
  if(!Array.isArray(mapping)||mapping.length>100||new Set(mapping.map(m=>m?.from)).size!==mapping.length||new Set(mapping.map(m=>m?.to)).size!==mapping.length)fail('账号映射必须明确且一对一');
  const mapped=new Map(),bindings=[];for(const m of mapping){const old=source.accounts.find(a=>a.id===m.from),current=this.studio.getAccount(m.to);if(!old||old.platform!==current.platform)fail('旧账号与当前绑定账号平台不同，未映射');mapped.set(old.id,current.id);bindings.push({from:old.id,to:current.id,binding:hash(current.binding)});}
  const mappingHash=hash(bindings),rules=[],skipped=[];
  for(const rule of source.interaction.rules){const targets=rule.accountIds.length?rule.accountIds:source.accounts.filter(a=>rule.platform==='all'||a.platform===rule.platform).map(a=>a.id);if(!targets.length||targets.some(id=>!mapped.has(id))){skipped.push({name:rule.name,reason:'适用账号未完整映射，只归档，不扩大规则范围'});continue;}rules.push({...clone(rule),id:fixedUuid([source.sha256,mappingHash,rule.id]),accountIds:targets.map(id=>mapped.get(id)),enabled:false});}
  const currentIds=new Set(this.store.snapshot().rules.map(r=>r.id)),newRules=rules.filter(r=>!currentIds.has(r.id));for(const r of rules)if(currentIds.has(r.id))skipped.push({name:r.name,reason:'相同导入编号已存在，保留当前配置，不重复覆盖'});
  const keywordRules=[];
  for(const rule of source.keywordState.rules){
   if(!this.keywordRoutes||[rule.primaryAccountId,...rule.senderAccountIds].some(id=>!mapped.has(id))){skipped.push({name:rule.name,reason:'关键词主号和发送账号未完整映射，或本机组件未就绪；仅只读归档'});continue;}
   const mappedRule={...clone(rule),id:fixedUuid([source.sha256,mappingHash,'keyword',rule.id]),revision:1,primaryAccountId:mapped.get(rule.primaryAccountId),senderAccountIds:rule.senderAccountIds.map(id=>mapped.get(id))};
   if(rule.senderLimits)mappedRule.senderLimits=rule.senderLimits.map(row=>({...row,accountId:mapped.get(row.accountId)}));
   try{this.keywordRoutes.importPlan([mappedRule]);}catch{skipped.push({name:rule.name,reason:'当前账号分工或关键词容量未满足要求；仅只读归档，请先核对主号与成员设置'});continue;}
   keywordRules.push(mappedRule);
  }
  const keywordPlan=this.keywordRoutes?.importPlan(keywordRules)||{added:[],skipped:0},addedIds=new Set(keywordPlan.added.map(r=>r.id));for(const r of keywordRules)if(!addedIds.has(r.id))skipped.push({name:r.name,reason:'关键词规则已导入，保留当前配置和启停状态，不重复覆盖'});
  const keywordTeamHash=this.keywordTeams(keywordRules),token=randomUUID(),at=this.now();this.preview={token,at,source,bindings,mappingHash,rules,keywordRules,keywordTeamHash};return{token,expiresAt:new Date(at+5*60*1000).toISOString(),counts:source.counts,accounts:bindings.map(m=>({from:source.accounts.find(a=>a.id===m.from).name,to:this.studio.getAccount(m.to).name})),rules:newRules.map(r=>({name:r.name,enabled:false,accountIds:r.accountIds})),keywordRules:keywordPlan.added.map(r=>({name:r.name,primaryAccountId:r.primaryAccountId,senderAccountIds:r.senderAccountIds,armed:false})),skipped,readOnlyHistory:true,unchangedCurrentModes:true};
 }
 keywordTeams(rules){return hash([...new Set(rules.flatMap(r=>[r.primaryAccountId,...r.senderAccountIds]))].sort().map(id=>{const a=this.studio.getAccount(id);return[a.id,a.platform,a.role,a.primaryAccountId];}));}
 confirm({token}){
  const preview=this.preview;this.preview=null;if(!preview||preview.token!==token||this.now()-preview.at>=5*60*1000||this.now()<preview.at)fail('导入确认已过期或已使用，请重新预览');if(!this.canImport())fail('已有互动或发送任务正在处理，未导入');
  for(const m of preview.bindings)if(hash(this.studio.getAccount(m.to).binding)!==m.binding)fail('当前账号绑定已变化，旧导入确认作废');
  if(this.keywordTeams(preview.keywordRules)!==preview.keywordTeamHash)fail('当前主号或成员分工已变化，请重新预览');if(preview.keywordRules.length)this.keywordRoutes.importPlan(preview.keywordRules);
  const old=this.entries.records.find(r=>r.sourceSha256===preview.source.sha256&&r.mappingHash===preview.mappingHash),record={id:old?.id||randomUUID(),sourceSha256:preview.source.sha256,mappingHash:preview.mappingHash,mapping:preview.bindings.map(({from,to})=>({from,to})),counts:preview.source.counts,accounts:preview.source.accounts,body:preview.source.body,status:'prepared',at:new Date(this.now()).toISOString()};
  const records=this.entries.records.filter(r=>r.id!==record.id);if(records.length>=20)fail('业务归档达到20份上限，未删除或覆盖旧归档');records.unshift(record);const prepared={version:1,records};write(this.file,prepared,{expected:this.persisted});this.entries=prepared;this.persisted=clone(prepared);
  // One locked store transaction; deterministic IDs prevent duplicates if the
  // process stops before the completion receipt. No claims/history are merged.
  const result=this.store.importDisabledRules(preview.rules),keywordResult=this.keywordRoutes?.importPausedRules(preview.keywordRules)||{added:0,skipped:0},complete=clone(prepared);complete.records.find(r=>r.id===record.id).status='complete';write(this.file,complete,{expected:this.persisted});this.entries=complete;this.persisted=complete;this.inspection=null;
  return{importId:record.id,...result,keywordRulesAdded:keywordResult.added,keywordRulesSkipped:keywordResult.skipped,historyArchived:preview.source.counts,automaticModesRestored:false,publishingJobsRestored:false,messagesImportedAsNewEvents:false,keywordHitsRestoredAsTasks:false};
 }
 list(){return this.entries.records.map(({body,mappingHash,...entry})=>clone(entry));}
 history({id,kind,offset=0,limit=50}){
  const entry=this.entries.records.find(r=>r.id===id);if(!entry||!['messages','replies','rules','outreach','contacts','publishing','drafts','assets','activity','accounts','contact-marks','keyword-rules','keyword-hits'].includes(kind)||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('归档记录读取参数无效');
  const data=entry.body.data,rows=['keyword-rules','keyword-hits'].includes(kind)?data['keyword-routes.json']?.[kind==='keyword-rules'?'rules':'hits']||[]:['messages','replies','rules'].includes(kind)?data['interactions.json'][kind]:kind==='contacts'?data['contacts.json'].contacts:kind==='contact-marks'?data['fan-followup.json']?.records||[]:kind==='publishing'?data['publishing.json']?.jobs||[]:data['studio.json'][kind]||[];return{kind,total:rows.length,offset,rows:clone(rows.slice(offset,offset+limit)),readOnly:true,platformReverified:false};
 }
 export(){
  const state=this.studio.snapshot(),accounts=state.accounts.map(({binding,...a})=>a),notes=read(path.join(path.dirname(this.file),'contact-notes.json'),true),body={format:'yuanxiao-operations-backup',version:1,createdAt:new Date(this.now()).toISOString(),data:{'studio.json':{schemaVersion:1,accounts,outreach:state.outreach,assets:[],drafts:[],tasks:[],activity:[]},'interactions.json':this.store.exportBusinessState(),'contacts.json':{schemaVersion:1,contacts:(notes?.records||[]).map(r=>({accountId:r.accountId,senderId:r.senderId,name:r.alias||r.name,tags:r.tags,notes:r.notes}))},'publishing.json':{schemaVersion:1,jobs:[]},'fan-followup.json':read(path.join(path.dirname(this.file),'fan-followup.json'),true)||{schemaVersion:1,records:[]}}};
  body.version=2;body.data['keyword-routes.json']=this.keywordRoutes?.exportBusinessState()||{version:1,rules:[],hits:[]};
  inspectTree(body);const text=JSON.stringify({...body,sha256:hash(body)},null,2);if(Buffer.byteLength(text)>MAX)fail('本轮导出业务包超过16 MiB，未截断；请使用完整软件备份');return{filename:'YuanXiao-operations-'+body.createdAt.slice(0,10)+'.json',text,includesBrowserSessions:false,includesNativePublishingJobs:false,includesPriorArchives:false};
 }
 exportOriginal({id}){const entry=this.entries.records.find(r=>r.id===id);if(!entry)fail('归档不存在');return{filename:'YuanXiao-archived-source-'+entry.id+'.json',text:JSON.stringify({...entry.body,sha256:entry.sourceSha256},null,2),includesBrowserSessions:false};}
}
module.exports={OperationsArchive};

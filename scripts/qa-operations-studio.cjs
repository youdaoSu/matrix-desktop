// Isolated encrypted account-team/history fixture. Never touches real profiles.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomBytes,randomUUID}=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-team-')),key=randomBytes(32),stop=configureEncryptedWorkspace({directory:dir,codecFor:name=>cipher(key,'fixture/'+name)});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},bad=(fn,re)=>{assert.throws(fn,re);checks++;};
try{
 const at='2026-10-27T00:00:00.000Z',studio=new OperationsStudio({directory:dir,now:()=>Date.parse(at)}),p={id:randomUUID(),name:'QA 主账号',platform:'douyin',binding:'qa-main'},m={id:randomUUID(),name:'QA 协作账号',platform:'douyin',binding:'qa-member'},x={id:randomUUID(),name:'QA 小红书',platform:'xiaohongshu',binding:'qa-xhs'};
 studio.configure([p,m,x]);eq(studio.activeAccounts().map(a=>a.role),['independent','independent','independent']);eq(studio.snapshot().accounts.length,3);
 bad(()=>studio.configure([p,{...p}]),/列表无效/);bad(()=>studio.configure([{...p,binding:'rebound'}]),/更换平台或登录绑定/);eq(studio.getAccount(m.id).binding,'qa-member');
 studio.saveTeams([{id:p.id,role:'primary'},{id:m.id,role:'member',primaryAccountId:p.id,notes:'PRIVATE_NOTE'}]);eq(studio.getAccount(m.id).primaryAccountId,p.id);
 bad(()=>studio.saveTeams([{id:x.id,role:'member',primaryAccountId:p.id}]),/同平台/);bad(()=>studio.saveTeams([{id:p.id,role:'member',primaryAccountId:p.id}]),/同平台/);bad(()=>studio.saveTeams([{id:p.id,role:'independent'}]),/同平台/);bad(()=>studio.saveTeams([{id:m.id,platform:'xiaohongshu'}]),/只允许修改/);
 eq(studio.getAccount(p.id).role,'primary');eq(fs.readFileSync(studio.file).includes(Buffer.from('PRIVATE_NOTE')),false);eq(fs.readFileSync(studio.file).subarray(0,5).toString(),'YXOP1');
 const binding={platform:'douyin',identity:'100',establishedAt:at},task={id:randomUUID(),primaryAccountId:p.id,accountId:m.id,platform:'douyin',sourceMessageId:randomUUID(),sourceExternalId:'source-comment',sourceChannel:'comment',recipientId:'300',recipientName:'QA 收件人',channel:'dm',replyText:'PRIVATE_REPLY',workUrl:null,primaryBinding:binding,senderBinding:{...binding,identity:'200'},status:'review',createdAt:at,updatedAt:at};
 studio.mutateOutreach(tasks=>tasks.push(task));eq(studio.snapshot().outreach.length,1);bad(()=>studio.saveTeams([{id:m.id,role:'independent'}]),/仍有待确认/);
 bad(()=>studio.mutateOutreach(tasks=>tasks[0].replyText='changed'),/不可更换/);bad(()=>studio.mutateOutreach(tasks=>tasks.splice(0)),/不可更换/);bad(()=>studio.mutateOutreach(tasks=>tasks.push(task)),/重复编号/);eq(studio.snapshot().outreach[0].replyText,'PRIVATE_REPLY');
 const copy=studio.snapshot();copy.accounts[0].name='changed';eq(studio.getAccount(p.id).name,p.name);
 studio.configure([p,x]);eq(studio.snapshot().accounts.length,3);eq(studio.activeAccounts().length,2);eq(studio.managerView().snapshot().accounts.length,2);bad(()=>studio.getAccount(m.id),/解绑或身份改变/);bad(()=>studio.saveTeams([{id:m.id,notes:'change archived'}]),/解绑或身份改变/);
 const restart=new OperationsStudio({directory:dir,now:()=>Date.parse(at)});eq(restart.activeAccounts(),[]);eq(restart.snapshot().outreach[0].status,'review');restart.configure([p,m,x]);eq(restart.getAccount(m.id).role,'member');eq(restart.snapshot().outreach[0].replyText,'PRIVATE_REPLY');
 restart.mutateOutreach(tasks=>Object.assign(tasks[0],{status:'cancelled'}));restart.saveTeams([{id:m.id,role:'independent'}]);eq(restart.getAccount(m.id).role,'independent');
 bad(()=>studio.saveTeams([{id:p.id,notes:'stale instance must not overwrite'}]),/原文件保留/);eq(new OperationsStudio({directory:dir}).snapshot().outreach[0].status,'cancelled');
 const bytes=fs.readFileSync(restart.file),corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;fs.writeFileSync(restart.file,corrupt);bad(()=>new OperationsStudio({directory:dir}),/原文件保留/);bad(()=>restart.saveTeams([{id:p.id,notes:'do not overwrite'}]),/原文件保留/);eq(fs.readFileSync(restart.file),corrupt);
 console.log(JSON.stringify({encryptedStudioChecks:checks,existingNativeBindingsOnly:true,archivedHistoryRetained:true,activeTasksFreezeAccountTeams:true,realPlatformRequests:0,userProfileTouched:false}));
}finally{stop();key.fill(0);assert.equal(path.dirname(dir),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('yuanxiao-team-'));fs.rmSync(dir,{recursive:true,force:true});}

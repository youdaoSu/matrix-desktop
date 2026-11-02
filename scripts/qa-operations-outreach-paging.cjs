// Encrypted local paging fixture. No real accounts, messages or browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {OperationsStudio}=require('../desktop/account-operations-studio.cjs');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const {configureEncryptedWorkspace}=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-outreach-pages-')),key=crypto.randomBytes(32),stop=configureEncryptedWorkspace({directory:base,codecFor:name=>cipher(key,'pages/'+name)});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 const at='2026-10-30T00:00:00.000Z',studio=new OperationsStudio({directory:base,now:()=>Date.parse(at)}),accounts=['primary','member1','member2'].map(name=>({id:crypto.randomUUID(),name,platform:'douyin',binding:'synthetic-'+name}));
 studio.configure(accounts);studio.saveTeams(accounts.map((account,i)=>({id:account.id,role:i?'member':'primary',...(i?{primaryAccountId:accounts[0].id}:{})})));
 const tasks=Array.from({length:651},(_,i)=>({id:crypto.randomUUID(),primaryAccountId:accounts[0].id,accountId:accounts[1+i%2].id,platform:'douyin',sourceMessageId:crypto.randomUUID(),sourceExternalId:'paging-'+i,sourceChannel:'comment',recipientId:String(10000+i),recipientName:'Synthetic '+i,channel:'dm',replyText:'Synthetic pending text '+i,workUrl:null,primaryBinding:{platform:'douyin',identity:'100',establishedAt:at},senderBinding:{platform:'douyin',identity:String(200+i%2),establishedAt:at},status:i%3?'review':'cancelled',createdAt:at,updatedAt:at}));
 studio.mutateOutreach(rows=>rows.push(...tasks));const before=fs.readFileSync(studio.file);
 eq(studio.outreachPage().tasks.length,300);eq(studio.outreachPage(20).tasks.length,20);
 const all=[];for(let offset=0;offset<651;offset+=100){const page=studio.outreachPage({offset,limit:100});eq(page.offset,offset);eq(page.totalTasks,651);eq(page.matchingTasks,651);assert(page.tasks.length<=100);checks++;all.push(...page.tasks.map(task=>task.id));}
 eq(all,tasks.map(task=>task.id));eq(new Set(all).size,651);
 const expected=tasks.filter(task=>task.status==='review'&&task.accountId===accounts[2].id);
 const filtered=studio.outreachPage({status:'review',accountId:accounts[2].id,limit:50,offset:50});eq(filtered.tasks.map(task=>task.id),expected.slice(50,100).map(task=>task.id));eq(filtered.matchingTasks,expected.length);eq(filtered.totalTasks,651);
 const last=studio.outreachPage({offset:50000,limit:100});eq(last.offset,600);eq(last.tasks.map(task=>task.id),tasks.slice(600).map(task=>task.id));
 const empty=studio.outreachPage({status:'sent',offset:600});eq(empty.offset,0);eq(empty.matchingTasks,0);eq(empty.tasks,[]);
 const page=studio.outreachPage({offset:600,limit:100});page.tasks[0].replyText='outside mutation';page.tasks[0].primaryBinding.identity='outside';eq(studio.outreachTask(tasks[600].id).replyText,tasks[600].replyText);eq(studio.outreachTask(tasks[600].id).primaryBinding.identity,'100');
 const originalClone=global.structuredClone,copied=[];try{global.structuredClone=(value,...rest)=>{copied.push(Array.isArray(value)?value.length:'unexpected full state');return originalClone(value,...rest);};studio.outreachPage({offset:100,limit:100});}finally{global.structuredClone=originalClone;}eq(copied,[100]);
 for(const query of [null,[],true,'100',{offset:-1},{offset:50001},{offset:1.5},{offset:'100'},{limit:0},{limit:301},{limit:Infinity},{status:'invalid'},{accountId:null},{accountId:crypto.randomUUID()},{all:true}]){assert.throws(()=>studio.outreachPage(query));checks++;}
 eq(fs.readFileSync(studio.file),before);
 studio.mutateOutreach(rows=>{for(const row of rows)row.status='cancelled';});const gone=studio.outreachPage({status:'review',offset:400,limit:100});eq(gone.offset,0);eq(gone.tasks,[]);eq(gone.matchingTasks,0);
 const reopened=new OperationsStudio({directory:base});eq(reopened.outreachPage({offset:600,limit:100}).tasks.length,51);eq(reopened.outreachPage({offset:600,limit:100}).tasks.every(row=>row.status==='cancelled'),true);
 console.log(JSON.stringify({outreachPagingChecks:checks,syntheticTasks:651,allHistoricalPagesReachable:true,queryDoesNotWrite:true,onlyRequestedPageCloned:true,realPlatformActions:0}));
}finally{stop();key.fill(0);assert.equal(path.dirname(fs.realpathSync(base)),fs.realpathSync(os.tmpdir()));assert(path.basename(base).startsWith('yuanxiao-outreach-pages-'));for(const name of fs.readdirSync(base)){const file=path.join(base,name);assert(fs.lstatSync(file).isFile());fs.unlinkSync(file);}fs.rmdirSync(base);}

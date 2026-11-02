// Unit and real HTTP intake tests; disposable files/in-memory DB only.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{randomUUID,createHash}=require('node:crypto');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
const {loadTs}=require('./qa-load-typescript.cjs');
const {sanitizePublishErrorReport,redactPublishError}=loadTs('shared/publish-error-report.ts');
const root=path.resolve(__dirname,'..'),rows=[],columns=Object.fromEntries(['id','action','operatorId','targetId','createdAt'].map(key=>[key,key]));
const match=(row,expr)=>!expr || (expr.kind==='and'?expr.items.every(item=>match(row,item)):expr.kind==='eq'?row[expr.key]===expr.value:row[expr.key]>expr.value);
const ops={eq:(key,value)=>({kind:'eq',key,value}),gt:(key,value)=>({kind:'gt',key,value}),and:(...items)=>({kind:'and',items}),desc:key=>key,count:()=>({count:true}),sql:(parts,...values)=>({parts,values})};
let serial=Promise.resolve();
const db={execute:async()=>{},transaction:work=>{const next=serial.then(()=>work(db));serial=next.catch(()=>{});return next;},
 select(fields){let selected;const query={from:()=>query,where:expr=>{selected=rows.filter(row=>match(row,expr));return query;},limit:async n=>(selected||rows).slice(0,n).map(row=>fields?.total?{total:(selected||rows).length}:row),orderBy:()=>query,offset:async offset=>(selected||rows).slice(offset),then:resolve=>resolve(fields?.total?[{total:(selected||rows).length}]:(selected||rows))};return query;},
 insert(){return{values:value=>({returning:async()=>{const row={...value,id:randomUUID(),createdAt:new Date()};rows.push(row);return[row];}})};}};
const file=path.join(root,'server/modules/feedback/feedback.service.ts'),mod=new Module(file);mod.paths=Module._nodeModulePaths(path.dirname(file));
const original=mod.require.bind(mod);
mod.require=name=>name==='@lark-apaas/fullstack-nestjs-core'?{DRIZZLE_DATABASE:Symbol()}:name==='@server/database/schema'?{operationLogs:columns}:name==='@shared/publish-error-report'?{sanitizePublishErrorReport}:name==='drizzle-orm'?ops:original(name);
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,esModuleInterop:true}}).outputText,file);
const {FeedbackService}=mod.exports;
async function main(){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-feedback-qa-')),config=path.join(profile,'endpoint.json'),secret='disposable-feedback-signing-secret-not-an-account';
 process.env.MATRIX_FEEDBACK_CONFIG_FILE=config;process.env.JWT_SECRET=secret;
 const userId=randomUUID(),report={schemaVersion:1,reportId:randomUUID(),taskId:randomUUID(),attempt:2,platform:'wechat',version:'2.10.0-rc.67',stage:'failed',executionStage:'filling',submission:'not_submitted',error:'Missing title',updatedAt:new Date().toISOString(),history:[]};
 const service=new FeedbackService(db);let checks=0;
 try{
  const dirty={...report,title:'Never send title',cookie:'Never send cookie',error:'Upload failed C:\\Users\\Private\\secret.mp4; Cookie=session-secret',history:[{at:report.updatedAt,stage:'uploading',message:'https://example.com/?token=private@example.com'}]};
  const sanitized=sanitizePublishErrorReport(dirty);assert.ok(!JSON.stringify(sanitized).includes('Private'));assert.ok(!JSON.stringify(sanitized).includes('session-secret'));assert.ok(!JSON.stringify(sanitized).includes('example.com'));assert.equal(sanitized.title,undefined);assert.equal(sanitized.cookie,undefined);assert.deepEqual(sanitizePublishErrorReport(sanitized),sanitized);checks+=6;
  assert.throws(()=>sanitizePublishErrorReport({...report,taskId:'bad'}));assert.throws(()=>sanitizePublishErrorReport({...report,platform:'custom'}));assert.throws(()=>sanitizePublishErrorReport({...report,history:Array(21).fill({})}));assert.ok(!redactPublishError('Bearer jwt-secret').includes('jwt-secret'));checks+=4;
  const verification=sanitizePublishErrorReport({...report,verification:{state:'not_found',checkedAt:report.updatedAt,message:'Latest lookup failed; Cookie=verification-secret',summary:'private-caption',html:'private-dom'}});
  assert.equal(verification.verification.state,'not_found');assert.equal(verification.verification.checkedAt,report.updatedAt);assert.ok(!JSON.stringify(verification).includes('verification-secret'));assert.ok(!JSON.stringify(verification).includes('private-caption'));assert.ok(!JSON.stringify(verification).includes('private-dom'));assert.deepEqual(sanitizePublishErrorReport(verification),verification);assert.equal(sanitizePublishErrorReport({...report,verification:{checkedAt:'bad',message:'not evidence'}}).verification,undefined);checks+=7;
  const related=sanitizePublishErrorReport({...report,stage:'confirmed',error:'追评或置顶失败，作品成功状态保留',relatedOperations:[{operation:'followup',status:'unknown',message:'连接中断；SESSDATA=qa-secret',commentId:'private-id'},{operation:'pin',status:'failed',message:'没有置顶权限；csrf=qa-csrf-secret'}]});
  assert.equal(related.stage,'confirmed');assert.equal(related.relatedOperations.length,2);assert.equal(related.relatedOperations[0].commentId,undefined);assert.equal(JSON.stringify(related).includes('qa-secret'),false);assert.equal(JSON.stringify(related).includes('qa-csrf-secret'),false);assert.deepEqual(sanitizePublishErrorReport(related),related);checks+=6;
  assert.throws(()=>sanitizePublishErrorReport({...report,relatedOperations:Array(3).fill({})}));assert.throws(()=>sanitizePublishErrorReport({...report,relatedOperations:[{operation:'send-dm',status:'failed',message:'unsupported'}]}));checks+=2;
  let response=await service.submit(userId,report);assert.equal(response.delivery,'local');assert.equal(rows.length,1);
  const duplicate=await Promise.all([service.submit(userId,report),service.submit(userId,report)]);assert.equal(rows.length,1);assert.equal(duplicate[0].id,response.id);checks+=4;
  // Bind an ephemeral loopback intake; then set only the fixture config port.
  const probe=require('node:net').createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  fs.writeFileSync(config,JSON.stringify({port}));await service.onModuleInit();
  const base='http://127.0.0.1:'+port;
  assert.equal((await fetch(base+'/health')).status,200);assert.equal((await fetch(base+'/api/admin/logs')).status,404);assert.equal((await fetch(base+'/reports',{method:'GET'})).status,404);assert.equal((await fetch(base+'/reports',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);checks+=4;
  const sign=value=>require('jsonwebtoken').sign({scope:'publish_error_report',userId,reportId:value.reportId,digest:createHash('sha256').update(JSON.stringify(sanitizePublishErrorReport(value))).digest('hex')},secret,{audience:'matrix-error-intake',expiresIn:60});
  const next={...report,reportId:randomUUID(),error:'缺少标题；请补全后再提交'};
  const send=(value,ticket=sign(value))=>fetch(base+'/reports',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+ticket},body:JSON.stringify(value)});
  response=await send(next);assert.equal(response.status,200);assert.equal((await response.json()).reportId,next.reportId);assert.equal(rows.length,2);checks+=3;
  assert.equal((await send({...next,error:'tampered'},sign(next))).status,400);assert.equal(rows.length,2);checks+=2;
  const privileged=require('jsonwebtoken').sign({userId,role:'admin'},secret);assert.equal((await send(next,privileged)).status,401);checks++;
  // Public relay failure must not be acknowledged as delivered or save twice.
  fs.writeFileSync(config,JSON.stringify({port,url:'http://127.0.0.1:'+port}));await assert.rejects(service.submit(userId,next),/反馈地址无效/);checks++;
  fs.writeFileSync(config,JSON.stringify({port,url:'https://qa-only.cpolar.top'}));
  const originalFetch=global.fetch;try{global.fetch=async()=>{throw Error('offline');};await assert.rejects(service.submit(userId,next),/未确认接收/);assert.equal(rows.length,2);checks+=2;
   global.fetch=async()=>new Response(JSON.stringify({accepted:true,reportId:next.reportId,id:randomUUID(),signature:'0'.repeat(64)}));await assert.rejects(service.submit(userId,next),/未确认接收/);checks++;
   global.fetch=(_url,options)=>originalFetch(base+'/reports',options);const signed=await service.submit(userId,next);assert.equal(signed.delivery,'tunnel');assert.equal(signed.accepted,true);checks+=2;
  }finally{global.fetch=originalFetch;}
  const other=randomUUID();for(let n=0;n<5;n++)await service.store(other,{...report,reportId:randomUUID()});await assert.rejects(service.store(other,{...report,reportId:randomUUID()}),/过于频繁/);checks++;
  console.log(JSON.stringify({feedbackReportChecks:checks,restrictedLoopbackIntake:true,signedPayloadOnly:true,noGeneralAuthTokenAccepted:true,deduplication:true,realUserDataTouched:false,publicTunnelOrRealReportSent:false}));
 }finally{service.onModuleDestroy();delete process.env.MATRIX_FEEDBACK_CONFIG_FILE;delete process.env.JWT_SECRET;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createJournal,registerPageActions}=require('../desktop/page-actions.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-trace-qa-')),journal=createJournal(directory),handlers={};
const base={id:'qa-receipt',ownerId:'owner-a',accountId:'own-account',kind:'publish',platform:'douyin',taskId:'original-task',attemptId:'original-attempt',createdAt:new Date().toISOString(),status:'unknown',message:'Waiting',summary:'QA-body-never-export',accessToken:'QA-secret-never-export',outcomeObservation:{startedAt:new Date().toISOString(),deadlineAt:new Date().toISOString(),checks:26,lastReason:'processing',elapsedMs:26000,password:'QA-observation-secret',lastError:'Cookie: QA-cookie-secret'}};
fs.appendFileSync(path.join(directory,'page-actions.jsonl'),JSON.stringify(base)+'\n');
journal.write({...base,checkpoint:'click_acknowledged',clicked:true,resultSource:'dom_click_ack'});
journal.write({...base,checkpoint:'official_accepted',clicked:true,resultSource:'official_acceptance_notice',acceptedAt:new Date().toISOString()});
journal.write({...base,ownerId:'owner-b',message:'Other owner never export'});
registerPageActions({ipcMain:{handle:(key,handler)=>handlers[key]=handler},getWindow:()=>({webContents:{id:7}}),authenticate:async token=>{if(token!=='qa-only')throw Error('unauthorized');return{userId:'owner-a'};},journal});
(async()=>{
  let checks=0;const input={accessToken:'qa-only',receiptId:base.id},event={sender:{id:7}};
  const trace=await handlers['matrix:read-publish-trace'](event,input);assert.equal(trace.items.length,3);assert.equal(trace.items[0].timeInferred,true);assert.equal(trace.items[1].timeInferred,false);assert.equal(trace.taskId,base.taskId);assert.equal(trace.resultSource,'official_acceptance_notice');assert.equal(trace.status,'unknown');checks+=6;
  const json=JSON.stringify(trace);for(const value of ['QA-secret','QA-body','Other owner','QA-observation-secret','QA-cookie-secret']){assert.equal(json.includes(value),false);checks++;}
  assert.equal(trace.outcomeObservation.checks,26);assert.equal(trace.items[0].outcomeObservation.elapsedMs,26000);checks+=2;
  journal.write({...base,status:'confirmed',resultSource:'official_work_list',evidence:{workId:'BV1s54y1d72u',workUrl:'https://www.bilibili.com/video/BV1s54y1d72u',workReferenceSource:'official_title_link'}});
  const linked=await handlers['matrix:read-publish-trace'](event,input);assert.equal(linked.evidence.workId,'BV1s54y1d72u');assert.equal(linked.items.at(-1).evidence.workUrl,'https://www.bilibili.com/video/BV1s54y1d72u');assert.equal(linked.items[0].evidence,undefined,'Do not backfill a new work reference into older history');assert.equal(linked.evidence.visibility,undefined,'Missing permission evidence is not invented');checks+=4;
  journal.write({...base,status:'confirmed',resultSource:'official_work_list',evidence:{workId:'BV1s54y1d72u',visibility:'仅自己可见',visibilitySource:'same_work_thumbnail_link'},outcomeObservation:{...base.outcomeObservation,workListLoads:4,lastWorkListLoadAt:'2026-10-19T06:00:31.000Z'}});
  const scoped=await handlers['matrix:read-publish-trace'](event,input);assert.equal(scoped.evidence.visibilitySource,'same_work_thumbnail_link');assert.equal(scoped.outcomeObservation.workListLoads,4);assert.equal(scoped.items[0].outcomeObservation.workListLoads,undefined,'Do not invent older reload counts');assert.equal(scoped.items[0].evidence,undefined);checks+=4;
  for(const [caller,request]of [[{sender:{id:8}},input],[event,{...input,accessToken:'bad'}],[event,{...input,receiptId:'other-receipt'}]]){assert.ok((await handlers['matrix:read-publish-trace'](caller,request)).error);checks++;}
  assert.equal(journal.list('owner-a').length,1);assert.equal(journal.list('owner-b').length,1);checks+=2;
  for(let index=0;index<205;index++)journal.write({...base,id:'qa-new-'+index,createdAt:new Date(Date.now()+index+1000).toISOString()});
  assert.equal(journal.list('owner-a').some(row=>row.id===base.id),false);checks++;
  const old=await handlers['matrix:read-publish-trace'](event,input);assert.equal(old.error,undefined);assert.equal(old.receiptId,base.id);assert.equal(old.status,'confirmed');checks+=3;
  const verified=await handlers['matrix:verify-publish-result'](event,input);assert.equal(verified.receipt.status,'confirmed');assert.equal(verified.receipt.ownerId,undefined);checks+=2;
  assert.equal(verified.receipt.accessToken,undefined);assert.equal(journal.list('owner-a')[0].accessToken,undefined);assert.equal(journal.find('owner-a',base.id).accessToken,'QA-secret-never-export');checks+=3;
  const {findOwnedPageAction}=require('../desktop/page-action-lookup.cjs');
  assert.equal(findOwnedPageAction({find:()=>({...base,ownerId:'foreign-owner'})},'owner-a',base.id),undefined);
  assert.equal(findOwnedPageAction({list:()=>[{...base,status:'submitting'}]},'owner-a',base.id).status,'unknown');
  assert.equal(findOwnedPageAction(journal,'owner-a','x'.repeat(121)),undefined);checks+=3;
  console.log(JSON.stringify({publishTraceChecks:checks,durableClickNotPublication:true,legacyEvidenceNotInvented:true,otherOwnersAndCredentialsExcluded:true,actualPosts:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});

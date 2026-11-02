const assert=require('node:assert/strict');
const {registerPublishStorageStatus}=require('../desktop/publish-storage-status.cjs');
const handlers={},reads=[],writes=[];
const receiptId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',recoveryId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
let authCalls=0,changed=false,denied=false,missing=false;
registerPublishStorageStatus({ipcMain:{handle:(name,fn)=>handlers[name]=fn},getWindow:()=>({webContents:{id:11}}),authenticate:async token=>{authCalls++;if(denied||token!=='qa-only')throw Error('unauthorized');return {userId:changed&&authCalls%2===0?'other-owner':'qa-owner'};},journal:{list:owner=>{reads.push(['journal',owner]);return missing?[]:[{id:receiptId,kind:'publish',status:'unknown'}];},write:()=>writes.push('unexpected')},mediaStore:{read:(owner,id)=>{reads.push(['media',owner,id]);if(missing)throw Error('unavailable');return {media:{paths:['private-path-never-returned']}};}},dataDirectory:'qa-disposable-data'});
const invoke=(input={},sender=11)=>handlers['matrix:publish-storage-status']({sender:{id:sender}},{accessToken:'qa-only',receiptId,recoveryId,...input});
(async()=>{
  let checks=0,result=await invoke();
  assert.equal(result.userId,'qa-owner');assert.equal(result.receiptFound,true);assert.equal(result.receiptStatus,'unknown');assert.equal(result.mediaReferenceFound,true);assert.equal(result.ownedReceiptCount,1);assert.ok(reads.every(row=>row[1]==='qa-owner'));assert.ok(!JSON.stringify(result).includes('private-path'));checks+=7;
  missing=true;result=await invoke();assert.equal(result.receiptFound,false);assert.equal(result.mediaReferenceFound,false);assert.equal(result.ownedReceiptCount,0);checks+=3;
  let priorReads=reads.length;result=await invoke({},99);assert.ok(result.error);assert.equal(reads.length,priorReads);checks+=2;
  denied=true;result=await invoke();assert.ok(result.error);assert.equal(reads.length,priorReads);denied=false;checks+=2;
  result=await invoke({recoveryId:'../../secret'});assert.ok(result.error);assert.equal(reads.length,priorReads);checks+=2;
  changed=true;authCalls=0;result=await invoke();assert.ok(result.error);assert.equal(result.userId,undefined);assert.equal(result.dataDirectory,undefined);assert.equal(result.receiptFound,undefined);checks+=4;
  assert.equal(writes.length,0);checks++;
  console.log(JSON.stringify({readOnlyStorageStatusChecks:checks,realProfileRead:false,externalActions:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});

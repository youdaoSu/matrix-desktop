// Disposable packaged profile only; never targets the installed user's server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const base=new URL(process.argv[3]),profile=fs.realpathSync(process.argv[4]);
assert.ok(profile.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&/^matrix-packaged-qa-/.test(path.basename(profile)));
assert.equal(base.hostname,'127.0.0.1');assert.equal(base.port,/^SERVER_PORT=(\d+)$/m.exec(fs.readFileSync(path.join(profile,'.env.local'),'utf8'))?.[1]);
const csrf=/suda-csrf-token=([^;]+)/.exec((await fetch(base.origin+'/app/')).headers.get('set-cookie')||'')?.[1];assert.ok(csrf);
const request=async(method,route,token,body,expected=[200,201])=>{
  const response=await fetch(base.origin+route,{method,headers:{'content-type':'application/json',cookie:'suda-csrf-token='+csrf,'x-suda-csrf-token':csrf,...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.ok(expected.includes(response.status),`${method} ${route}: HTTP ${response.status}`);return(await response.json()).data;
};
const token=(await request('POST','/api/auth/login',null,{username:'demo',password:'user123456'})).token;
const created=[],drafts=[];let checks=0;
try{
  await request('GET','/api/analytics/overview',undefined,undefined,[401]);checks++;
  const before=await request('GET','/api/analytics/overview',token);assert.ok(before.followerCoverage);checks++;
  for(const nickname of ['QA unmeasured','QA measured zero','QA measured seven']){
    const account=await request('POST','/api/platform/accounts/desktop',token,{platform:'douyin',connectorSessionId:randomUUID(),nickname});assert.ok(account.id);created.push(account);
  }
  let data=await request('GET','/api/analytics/overview',token);assert.equal(data.followerCoverage.accountCount,before.followerCoverage.accountCount+3);assert.equal(data.followerCoverage.measuredAccounts,before.followerCoverage.measuredAccounts);checks+=2;
  const zero=created[1],seven=created[2];
  await request('POST',`/api/platform/accounts/${zero.id}/desktop-observation`,token,{sessionId:zero.connectorSessionId,nickname:zero.nickname,nativeAccountKey:'qa-analytics-zero',metrics:{followersCount:0},metricEvidence:{source:'douyin-self-profile',ownerUid:'1234567890123456001'}});
  data=await request('GET','/api/analytics/overview',token);assert.equal(data.followerCoverage.measuredAccounts,before.followerCoverage.measuredAccounts+1);assert.equal(data.followerCoverage.total,(before.followerCoverage.total||0));checks+=2;
  await request('POST',`/api/platform/accounts/${seven.id}/desktop-observation`,token,{sessionId:seven.connectorSessionId,nickname:seven.nickname,nativeAccountKey:'qa-analytics-seven',metrics:{followersCount:7},metricEvidence:{source:'douyin-self-profile',ownerUid:'1234567890123456002'}});
  data=await request('GET','/api/analytics/overview',token);assert.equal(data.followerCoverage.total,(before.followerCoverage.total||0)+7);assert.equal(data.followerCoverage.missingAccounts,before.followerCoverage.missingAccounts+1);assert.ok(data.followerCoverage.latestObservedAt);checks+=3;
  const comparison=await request('GET','/api/analytics/account-comparison',token);
  assert.equal(comparison.find(item=>item.accountId===created[0].id).followers,null);assert.equal(comparison.find(item=>item.accountId===zero.id).followers,0);assert.equal(comparison.find(item=>item.accountId===seven.id).followers,7);assert.ok(comparison.find(item=>item.accountId===seven.id).followersObservedAt);checks+=4;
  const createdDrafts=await request('POST','/api/content/posts',token,{accountIds:[created[0].id],mediaType:'video',title:'QA local draft only',status:'draft'});drafts.push(...createdDrafts.map(item=>item.id));
  const withDraft=await request('GET','/api/analytics/account-comparison',token);assert.equal(withDraft.find(item=>item.accountId===created[0].id).posts,1);assert.equal(withDraft.find(item=>item.accountId===zero.id).posts,0);checks+=2;
  const username='qa_metrics_'+randomUUID().replaceAll('-','');await request('POST','/api/auth/register',undefined,{username,password:'QaMetrics123!',nickname:'QA different owner'});
  const other=(await request('POST','/api/auth/login',undefined,{username,password:'QaMetrics123!'})).token;
  const foreignOverview=await request('GET','/api/analytics/overview',other);assert.equal(foreignOverview.followerCoverage.accountCount,0);assert.equal(foreignOverview.followerCoverage.total,null);assert.deepEqual(await request('GET','/api/analytics/account-comparison',other),[]);checks+=3;
  assert.deepEqual(await request('GET','/api/analytics/follower-trend?days=30',other),[]);assert.deepEqual(await request('GET','/api/analytics/engagement-trend?days=30',other),[]);checks+=2;
  await request('GET','/api/analytics/content-ranking?limit=-9',token);await request('GET','/api/analytics/content-ranking?limit=9999999',token);checks+=2;
  console.log(JSON.stringify({packagedAnalyticsAvailabilityChecks:checks,missingIsNullNotZero:true,measuredZeroRetained:true,partialCoverageExplicit:true,ownerIsolation:true,emptyChartsNotInvented:true,realUserDataTouched:false}));
}finally{
  for(const id of drafts)await request('DELETE','/api/content/posts/'+id,token);
  for(const account of created)await request('DELETE','/api/platform/accounts/'+account.id,token);
}

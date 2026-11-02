// Requires the new disposable packaged profile and its loopback service only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const base=new URL(process.argv[3]),profile=fs.realpathSync(process.argv[4]);
assert.ok(profile.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&/^matrix-packaged-qa-/.test(path.basename(profile)));assert.equal(base.hostname,'127.0.0.1');assert.equal(base.port,/^SERVER_PORT=(\d+)$/m.exec(fs.readFileSync(path.join(profile,'.env.local'),'utf8'))?.[1]);
const csrf=/suda-csrf-token=([^;]+)/.exec((await fetch(base.origin+'/app/')).headers.get('set-cookie')||'')?.[1];assert.ok(csrf);
const request=async(method,route,token,body)=>{const response=await fetch(base.origin+route,{method,headers:{'content-type':'application/json',cookie:'suda-csrf-token='+csrf,'x-suda-csrf-token':csrf,...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:(await response.json()).data};};
const token=(await request('POST','/api/auth/login',null,{username:'demo',password:'user123456'})).data.token;assert.ok(token);let checks=0;
const sessionId=randomUUID(),account=(await request('POST','/api/platform/accounts/desktop',token,{platform:'douyin',connectorSessionId:sessionId,nickname:'QA own original'})).data;assert.ok(account.id);const route='/api/platform/accounts/'+account.id+'/desktop-observation',baseBody={sessionId,nickname:'QA own original',metricEvidence:{source:'douyin-self-profile',ownerUid:'1234567890123456789'}};
try{
  assert.equal((await request('POST',route,null,baseBody)).status,401);checks++;
  assert.equal((await request('POST',route,token,{...baseBody,sessionId:randomUUID()})).status,400);checks++;
  assert.equal((await request('POST',route,token,{...baseBody,nickname:'Unverified rename'})).status,400);checks++;
  let saved=(await request('POST',route,token,{...baseBody,nativeAccountKey:'known-fixture-id',metrics:{followersCount:100}})).data;assert.equal(saved.followersCount,100);assert.equal(saved.followersChange,undefined);assert.ok(saved.metricsObservedAt);assert.equal(saved.bindTime,account.createdAt);assert.ok(saved.lastVerifiedAt);checks+=5;
  saved=(await request('POST',route,token,{...baseBody,nativeAccountKey:'known-fixture-id',metrics:{followingCount:20}})).data;assert.equal(saved.followersCount,100);const before=saved.metricsObservedAt;checks++;
  saved=(await request('POST',route,token,{...baseBody,nativeAccountKey:'known-fixture-id',nickname:'Verified renamed',metrics:{followersCount:105}})).data;assert.equal(saved.followersChange,5);assert.equal(saved.nickname,'Verified renamed');assert.deepEqual(saved.verifiedNicknames,['QA own original','Verified renamed']);assert.ok(saved.metricsObservedAt>=before);checks+=4;
  const renamed={...baseBody,nativeAccountKey:'known-fixture-id',nickname:'Verified renamed'};
  const cached=(await request('POST',route,token,{...renamed,metricEvidence:undefined,metrics:{followersCount:14000}})).data;assert.equal(cached.followersCount,105);assert.equal(cached.metricsObservedAt,saved.metricsObservedAt);assert.ok(cached.metricsError);checks+=3;
  const audit=(await request('GET','/api/analytics/account-data-audit',token)).data;const auditRow=audit.rows.find(row=>row.accountId===account.id);assert.equal(auditRow.followers,105);assert.equal(auditRow.source,'douyin-self-profile');assert.equal(auditRow.included,true);assert.ok(!JSON.stringify(audit).includes('followersOwnerUid'));assert.equal((await request('GET','/api/analytics/account-data-audit',null)).status,401);checks+=5;
  for(const patch of [{metricEvidence:{source:'other'}},{metricEvidence:{source:'douyin-self-profile',ownerUid:'9999999999999999999'}},{metricEvidence:{source:'rendered-own-counter',ownerUid:'123'}},{metricsError:'Cookie SECRET'},{metricsError:'https://private.invalid'}]){assert.equal((await request('POST',route,token,{...renamed,...patch})).status,400);checks++;}
  assert.equal((await request('POST',route,token,{...renamed,nativeAccountKey:'another-fixture-id'})).status,400);checks++;
  assert.equal((await request('POST',route,token,{...renamed,nativeAccountKey:12345})).status,400);checks++;
  const stale=(await request('POST',route,token,{...renamed,nickname:'Stale nickname',observedAt:Date.now()-60000})).data;assert.equal(stale.nickname,'Verified renamed');checks++;
  assert.equal((await request('POST',route,token,{...renamed,observedAt:Date.now()+60000})).status,400);checks++;
  const rebound=(await request('POST','/api/platform/accounts/desktop',token,{platform:'douyin',connectorSessionId:sessionId,nickname:'Verified renamed'})).data;assert.equal(rebound.nativeAccountKey,'known-fixture-id');assert.equal(rebound.followersChange,5);assert.deepEqual(rebound.verifiedNicknames,['QA own original','Verified renamed']);assert.equal(rebound.bindTime,account.createdAt);assert.equal(rebound.createdAt,account.createdAt);assert.equal(rebound.lastVerifiedAt,cached.lastVerifiedAt);checks+=6;
  assert.equal((await request('POST','/api/platform/accounts/desktop',token,{platform:'douyin',connectorSessionId:sessionId,nativeAccountKey:'other-id',nickname:'Verified renamed'})).status,400);checks++;
  for(const value of [-1,1.5,2147483648,1e12,1e13,'100']){assert.equal((await request('POST',route,token,{...renamed,metrics:{followersCount:value}})).status,400);checks++;}
  const creator=(await request('POST',route,token,{...renamed,metrics:{followersCount:106},metricEvidence:{source:'douyin-creator-profile',ownerUid:'1234567890123456789'}})).data;assert.equal(creator.followersCount,106);assert.equal(creator.metricsSource,'douyin-creator-profile');assert.equal(creator.followersChange,undefined);const creatorAudit=(await request('GET','/api/analytics/account-data-audit',token)).data;assert.equal(creatorAudit.rows.find(row=>row.accountId===account.id).source,'douyin-creator-profile');checks+=4;
  const creatorNext=(await request('POST',route,token,{...renamed,observedAt:Date.now(),metrics:{followersCount:107},metricEvidence:{source:'douyin-creator-profile',ownerUid:'1234567890123456789'}})).data;assert.equal(creatorNext.followersChange,1);checks++;
  const user='qa_observation_'+randomUUID().replaceAll('-','');await request('POST','/api/auth/register',null,{username:user,password:'QaObservation123!',nickname:'QA isolated owner'});const other=(await request('POST','/api/auth/login',null,{username:user,password:'QaObservation123!'})).data.token;assert.ok(other);assert.equal((await request('POST',route,other,renamed)).status,404);checks++;
  await request('DELETE','/api/platform/accounts/'+account.id,token);assert.equal((await request('POST',route,token,renamed)).status,404);checks++;
  console.log(JSON.stringify({packagedAccountObservationApiChecks:checks,verifiedRenameOnly:true,unknownMetricsNotZero:true,consecutiveRealSampleDelta:true,unboundNotResurrected:true,realDataTouched:false}));
}finally{await request('DELETE','/api/platform/accounts/'+account.id,token);}

// Pure synthetic admission/owner fixtures. No platform calls or real user data.
const assert=require('node:assert/strict'),{readBoundMetrics}=require('../desktop/douyin-bound-metrics.cjs');let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 let clock=0,tries=0,closed=0,reads=0,valid=true;const options={accountSession:{fixture:true},publicHandle:'QA',assertCurrent:async()=>{if(!valid)throw Error('OWNER_CHANGED');}},timing={now:()=>clock,sleep:async ms=>{clock+=ms;}};
 const client={readMetrics:async()=>{reads++;return{ownUid:'201',metrics:{followersCount:13763},source:'douyin-self-profile'};},close(){closed++;}};
 const result=await readBoundMetrics(options,async input=>{eq(input,options);tries++;if(tries<3)throw Error('此抖音账号正在读取另一页，请稍候');return client;},timing);eq(result.metrics.followersCount,13763);eq(clock,500);eq(tries,3);eq(closed,1);eq(reads,1);
 for(const message of ['HTTP 403','平台码 -999','抖音官方要求安全验证','OWNER_CHANGED','计数结构未识别']){tries=0;await assert.rejects(()=>readBoundMetrics(options,async()=>{tries++;throw Error(message);},timing),error=>error.message===message);checks++;eq(tries,1);}
 clock=0;tries=0;await assert.rejects(()=>readBoundMetrics(options,async()=>{tries++;throw Error('此抖音账号正在读取另一页，请稍候');},timing));checks++;eq(clock,6000);eq(tries,25);
 reads=0;closed=0;valid=true;await assert.rejects(()=>readBoundMetrics(options,async()=>{valid=false;return client;},timing),/OWNER_CHANGED/);checks++;eq(reads,0);eq(closed,1);
 valid=true;closed=0;await assert.rejects(()=>readBoundMetrics(options,async()=>({...client,readMetrics:async()=>{throw Error('COUNTER_SHAPE');}}),timing),/COUNTER_SHAPE/);checks++;eq(closed,1);
 console.log(JSON.stringify({boundMetricsChecks:checks,exactSameBoundReader:true,busyAdmissionWaitBounded:true,noRefusalOrSchemaRetry:true,lateOwnerChangeDiscarded:true,clientAlwaysReleased:true,realUserProfileTouched:false,realPlatformRequests:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});

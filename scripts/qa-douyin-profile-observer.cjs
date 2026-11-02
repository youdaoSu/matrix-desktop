// Pure own-profile response fixtures; no server, real browser profile or platform.
const assert=require('node:assert/strict'),vm=require('node:vm');
const {normalizeCreatorProfile,installProfileObserver,observedProfile,readObservedMetrics,observedIdentity,readObservedIdentity}=require('../desktop/douyin-profile-preload.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const own='9007199254740993',handle='qa-handle',path='/aweme/v1/creator/user/info/';
const profile=count=>({status_code:0,uid:own,user_profile:{unique_id:handle,follower_count:count},privateToken:'DO_NOT_PROJECT'});
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 let fetcher=async()=>new Response(JSON.stringify(profile(13763)),{status:200});const calls=[];
 class Xhr{constructor(){this.listeners=[];this.responseType='';this.responseText='';this.status=200;}open(method,url){this.method=method;this.url=url;}addEventListener(name,fn){if(name==='loadend')this.listeners.push(fn);}send(){calls.push({xhr:true,url:this.url,method:this.method});}finish(raw,status=200){this.responseText=raw;this.status=status;const listeners=this.listeners.splice(0);listeners.forEach(fn=>fn.call(this));}}
 const context={URL,TextDecoder,Reflect,Date,Set,Map,WeakMap,XMLHttpRequest:Xhr,location:{origin:'https://creator.douyin.com',href:'https://creator.douyin.com/creator-micro/home',pathname:'/creator-micro/home'},window:{fetch:(...args)=>{calls.push(args);return fetcher(...args);}}};vm.createContext(context);
 vm.runInContext(`(${installProfileObserver.toString()})(${normalizeCreatorProfile.toString()})`,context);
 return {context,calls,fetch:()=>context.window.fetch(path),read:expected=>copy(vm.runInContext(`(${observedProfile.toString()})(${JSON.stringify(expected||handle)})`,context)),setFetch:fn=>fetcher=fn,state:context.window.__matrixOwnProfileObserved,Xhr};
}
const until=async fn=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(resolve=>setImmediate(resolve));}throw Error('Profile projection fixture timeout');};
(async()=>{
 for(const value of [0,13763,'13763']){const result=normalizeCreatorProfile(profile(value));eq(result.followersCount,Number(value));eq(result.uid,own);eq(JSON.stringify(result).includes('DO_NOT_PROJECT'),false);}
 for(const value of ['1.4万',-1,1.2,2147483648,true,{},'1e4'])eq(normalizeCreatorProfile(profile(value)).code,'COUNTER_SHAPE');for(const value of [null,undefined])eq(normalizeCreatorProfile(profile(value)).counterUnavailable,true);
 for(const uid of [Number(own),'9999999999999999999','01','0',null])eq(normalizeCreatorProfile({...profile(1),uid}).code,'OWNER_SHAPE');
 eq(normalizeCreatorProfile({...profile(1),status_code:5}).code,'STATUS');
 eq(normalizeCreatorProfile({...profile(1),uid:Number(own)}).ownerStage,'OWNER_UID_PRECISION');eq(normalizeCreatorProfile({...profile(1),uid:undefined}).ownerStage,'OWNER_UID_MISSING');eq(normalizeCreatorProfile({...profile(1),user_profile:{follower_count:1}}).handleUnavailable,true);
 eq(normalizeCreatorProfile({...profile(1),status_code:null}).code,'SHAPE');eq(normalizeCreatorProfile(undefined).code,'SHAPE');
 eq(normalizeCreatorProfile({status_code:0,uid:own,user_profile:{unique_id:'',short_id:708240300,follower_count:13763}}).handle,'708240300');
 let f=fixture();eq(f.calls.length,0);const response=await f.fetch();eq((await response.json()).privateToken,'DO_NOT_PROJECT');await until(()=>f.state.pending.size===0);eq(f.read(),{ownUid:own,metrics:{followersCount:13763},source:'douyin-creator-profile'});eq(f.read('other-handle').available,false);eq(f.calls.length,1);
 f.context.location.pathname='/creator-micro/content/manage';eq(f.read().code,'ORIGIN');f.context.location.pathname='/';eq(f.read().metrics.followersCount,13763);
 f=fixture();f.setFetch(async()=>new Response(JSON.stringify({status_code:0,uid:own,user_profile:{follower_count:13763}}),{status:200}));await f.fetch();await until(()=>!f.state.pending.size);eq(f.read().available,false);eq(copy(vm.runInContext(`(${observedProfile.toString()})('qa-handle',true)`,f.context)).metrics.followersCount,13763);f.state.pages.set('/aweme/v1/creator/pc/user/info/',{uid:own,handle:'OTHER_OWNER',followersCount:13763,receivedAt:Date.now()});eq(copy(vm.runInContext(`(${observedProfile.toString()})('qa-handle',true)`,f.context)).code,'OWNER');
 f=fixture();f.setFetch(async()=>new Response('{"status_code":0,"uid":9007199254740993,"user_profile":{"unique_id":"qa-handle","follower_count":13763}}',{status:200}));await f.fetch();await until(()=>!f.state.pending.size);eq(f.read().ownUid,own);
 f=fixture();f.setFetch(async()=>new Response('denied',{status:403}));await f.fetch();await until(()=>!f.state.pending.size);eq(f.read().code,'DENIED');eq(f.read().httpStatus,403);eq(f.calls.length,1);
 f=fixture();f.setFetch(async()=>new Response(JSON.stringify({...profile(999),status_code:5}),{status:200}));await f.fetch();await until(()=>!f.state.pending.size);eq(f.read().code,'DENIED');eq(f.read().platformCode,5);
 f=fixture();f.setFetch(async()=>new Response('not-json',{status:200}));await f.fetch();await until(()=>!f.state.pending.size);eq(f.read().code,'SCHEMA');
 f=fixture();const xhr=new f.Xhr();xhr.open('GET',path);xhr.send();xhr.finish('{"status_code":0,"uid":9007199254740993,"user_profile":{"unique_id":"qa-handle","follower_count":0}}');eq(f.read().metrics.followersCount,0);
 f=fixture();const ignored=new f.Xhr();ignored.open('POST',path);ignored.send();ignored.finish(JSON.stringify(profile(999)));eq(f.read().available,false);eq(f.state.pages.size,0);
 f=fixture();let resolveFirst;f.setFetch(()=>new Promise(resolve=>resolveFirst=resolve));const old=f.fetch();f.setFetch(async()=>new Response(JSON.stringify(profile(20)),{status:200}));await f.fetch();await until(()=>!f.state.pending.size);resolveFirst(new Response(JSON.stringify(profile(10)),{status:200}));await old;await new Promise(resolve=>setImmediate(resolve));eq(f.read().metrics.followersCount,20);
 f.state.pages.set('/aweme/v1/creator/pc/user/info/',{uid:'9007199254740995',handle,followersCount:20,receivedAt:Date.now()});eq(f.read().code,'OWNER');f.state.pages.delete('/aweme/v1/creator/pc/user/info/');for(const sample of f.state.pages.values())sample.receivedAt=Date.now()-31000;eq(f.read().available,false);
 let attempts=0;const guest={isDestroyed:()=>false,executeJavaScript:async()=>{attempts++;return{code:'DENIED',httpStatus:403};}};
 await assert.rejects(()=>readObservedMetrics(guest,handle,async()=>{}),/官方拒绝/);checks++;eq(attempts,1);
 let live=true;guest.executeJavaScript=async()=>{live=false;return{ownUid:own,metrics:{followersCount:999},source:'douyin-creator-profile'};};await assert.rejects(()=>readObservedMetrics(guest,handle,async()=>{if(!live)throw Error('owner changed');}),/owner changed/);checks++;
 const identity=f=>copy(vm.runInContext(`(${observedIdentity.toString()})('qa-handle')`,f.context));
 f=fixture();eq(identity(f),{available:false});await f.fetch();await until(()=>!f.state.pending.size);eq(identity(f),{key:handle,source:'douyin-creator-profile'});
 for(const sample of f.state.pages.values())delete sample.followersCount;eq(identity(f).key,handle);
 f.state.pending.add(path);eq(identity(f).pending,true);f.state.pending.clear();
 f.state.failures.set('other',{code:'HTTP',httpStatus:403});eq(identity(f).available,false);f.state.failures.clear();
 f.state.pages.set('other',{uid:own,handle:'different',receivedAt:Date.now()});eq(identity(f).code,'OWNER');f.state.pages.delete('other');
 f.state.pages.set('other',{uid:'9007199254740995',handle,receivedAt:Date.now()});eq(identity(f).available,false);f.state.pages.delete('other');
 f.context.location.pathname='/creator-micro/content/publish';eq(identity(f).code,'ORIGIN');f.context.location.pathname='/creator-micro/home';
 for(const sample of f.state.pages.values())sample.receivedAt=Date.now()-31000;eq(identity(f).available,false);
 live=true;guest.executeJavaScript=async()=>{live=false;return {key:handle,source:'douyin-creator-profile'};};await assert.rejects(()=>readObservedIdentity(guest,handle,async()=>{if(!live)throw Error('owner changed');}),/owner changed/);checks++;
 console.log(JSON.stringify({profileObserverChecks:checks,normalGetClonesOnly:true,noRequestsConstructed:true,exactOwnerAndIntegerCounter:true,denialNotRetried:true,lateOwnerDiscarded:true,privateFieldsProjected:false,realPlatformRequests:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});

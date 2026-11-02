// Synthetic shared bound session and scoped policy; no actual user cookies.
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createProfileContext,profileBlocked}=require('../desktop/douyin-profile-context.cjs');
const {registerScopedRequestPolicy}=require('../desktop/douyin-scoped-request-policy.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
function fixture(){
 const cookies=new EventEmitter();cookies.rows=[{domain:'.douyin.com',path:'/',name:'sessionid',value:'FIXTURE_ONLY',secure:true,httpOnly:true},{domain:'.other.invalid',path:'/',name:'other',value:'KEEP'}];cookies.get=async()=>structuredClone(cookies.rows);cookies.set=async()=>{throw Error('Cookie copy forbidden');};
 let handler=null;
 const source={cookies,webRequest:{onBeforeRequest(value){handler=value;},onCompleted(){},onErrorOccurred(){}},clearStorageData(){throw Error('Bound storage must never be cleared');}};
 let valid=true;const controller=new AbortController(),prepare=createProfileContext({createSession(){throw Error('Fresh profile session forbidden');}}),run=()=>prepare({sourceSession:source,assertCurrent:async()=>{if(!valid)throw Error('owner changed');},signal:controller.signal});
 return {source,run,controller,invalidate:()=>valid=false,blocked(id,url,method='GET'){let cancel=false;handler?.({webContentsId:id,url,method,resourceType:'xhr'},value=>cancel=value.cancel);return cancel;},handler:()=>handler};
}
(async()=>{
 for(const shell of ['/goofy/douyin_creator_pc/home/index.html','/goofy/douyin_creator_pc/org/home/index.html']) {
  eq(profileBlocked({url:'https://creator.douyin.com'+shell,method:'GET',resourceType:'xhr'}),false);
  eq(profileBlocked({url:'https://creator.douyin.com'+shell,method:'POST',resourceType:'xhr'}),true);
  eq(profileBlocked({url:'https://creator.douyin.com'+shell+'?mark_read=1',method:'GET',resourceType:'xhr'}),true);
  eq(profileBlocked({url:'https://other.invalid'+shell,method:'GET',resourceType:'xhr'}),true);
 }
 for(const path of ['/aweme/v1/creator/user/info/','/aweme/v1/creator/pc/user/info/','/web/api/media/user/info/','/web/api/v2/creator/xigua/user/info','/aweme/v1/web/oversea/judgment/'])eq(profileBlocked({url:'https://creator.douyin.com'+path,method:'GET',resourceType:'xhr'}),false);
 for(const path of ['/aweme/v1/creator/user_message/notice/','/web/api/creator/msg/top','/mark_read','/clear_unread','/aweme/v1/creator/comment/list/','/aweme/v1/web/user/follower/list/'])eq(profileBlocked({url:'https://creator.douyin.com'+path,method:'GET',resourceType:'xhr'}),true);
 eq(profileBlocked({url:'https://creator.douyin.com/aweme/v1/creator/user/info/',method:'POST',resourceType:'xhr'}),true);eq(profileBlocked({url:'https://creator.douyin.com/aweme/v1/creator/user/info/?mark_read=1',method:'GET',resourceType:'xhr'}),true);

 let f=fixture(),context=await f.run();eq(context.session,f.source);eq(f.handler(),null);context.attach({id:1,session:f.source});await context.check();checks++;
 eq(f.blocked(1,'https://creator.douyin.com/notification/read'),true);eq(f.blocked(2,'https://creator.douyin.com/notification/read'),false);
 eq(f.blocked(1,'https://creator.douyin.com/aweme/v1/creator/user/info/'),false);eq(f.blocked(1,'https://creator.douyin.com/aweme/v1/creator/user/info/','POST'),true);
 const sibling=registerScopedRequestPolicy(f.source,2,{blocks:details=>details.url.includes('/sibling-only')});context.close();eq(f.blocked(1,'https://creator.douyin.com/notification/read'),false);eq(f.blocked(2,'https://creator.douyin.com/sibling-only'),true);sibling();eq(f.handler(),null);eq(f.source.cookies.rows[0].value,'FIXTURE_ONLY');eq(f.source.cookies.listenerCount('changed'),0);
 f=fixture();context=await f.run();context.attach({id:3,session:f.source});f.source.cookies.rows[0].value='FIXTURE_CHANGED';await assert.rejects(context.check,/登录已变化/);checks++;eq(f.handler(),null);eq(f.source.cookies.listenerCount('changed'),0);
 f=fixture();context=await f.run();f.invalidate();await assert.rejects(context.check,/owner changed/);checks++;context.close();eq(f.source.cookies.rows[0].value,'FIXTURE_ONLY');
 f=fixture();f.controller.abort();await assert.rejects(f.run,/已结束/);checks++;eq(f.handler(),null);
 f=fixture();context=await f.run();assert.throws(()=>context.attach({id:4,session:{}}),/会话不一致/);checks++;context.attach({id:4,session:f.source});f.controller.abort();eq(f.handler(),null);await assert.rejects(context.check,/已结束/);checks++;eq(f.source.cookies.rows.length,2);
 console.log(JSON.stringify({profileReadContextChecks:checks,exactBoundSessionReused:true,scopedGuardsDoNotAffectSiblingOrForeground:true,noCookieOrStorageCopies:true,noStorageCleared:true,writeAndUnreadRoutesBlocked:true,crossOwnerAndAbortStop:true,realAccountCookiesAccessed:false,realPlatformRequests:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});

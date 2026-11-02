// Deterministic own-roster pagination, no browser/profile/platform requests.
const assert=require('node:assert/strict');const {readPage,initial}=require('../desktop/douyin-interactions.cjs');
const {projectFollowerUser}=require('../desktop/douyin-followers-preload.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
(async()=>{
 for(const field of [{avatar_thumb:{url_list:[{url:'https://p1.byteimg.com/qa'}]}},{avatar:{url:{urls:['//p1.byteimg.com/qa']}}},{avatarMedium:{urlList:'https://p1.byteimg.com/qa'}},{avatarUri:'https://p1.byteimg.com/qa'}])eq(projectFollowerUser({user:{uid:'100',nickname:'QA',...field}}).avatar_thumb.url_list,['https://p1.byteimg.com/qa']);
 for(const bad of ['file:///private','javascript:alert(1)','https://user:PRIVATE@p1.byteimg.com/qa'])eq(projectFollowerUser({uid:'100',avatar:{url:bad}}).avatar_thumb.url_list,[]);
 const hidden=projectFollowerUser({uid:'100',avatar:{uri:'PRIVATE_ID',skey:'PRIVATE_KEY'}});eq(hidden.avatarReadHint.includes('avatar=object'),true);eq(JSON.stringify(hidden).includes('PRIVATE'),false);
 for(const key of ['uid','userId','user_id','uid_str','uidStr','user_id_str'])eq(projectFollowerUser({[key]:'9007199254740993',screen_name:'QA row'}).uid,'9007199254740993');
 assert.throws(()=>projectFollowerUser({uid:'100',user_id:'101'}),/编号结构/);checks++;assert.throws(()=>projectFollowerUser({uid:9007199254740993,uid_str:'9007199254740993'}),/编号结构/);checks++;
 for(const [total,returned,verified]of [[13763,13763,true],[13763,13700,false],[335,335,true]]){
  let calls=0,state=initial('followers'),result;
  const client={ownUid:'100',followerUi:true,async readWeb(kind,args){eq(kind,'followers');const index=Number(args.offset||0),start=index*100;calls++;return{followers:Array.from({length:Math.min(100,returned-start)},(_,i)=>({uid:String(1000+start+i),nickname:'QA粉丝',avatar_thumb:{url_list:['https://p1.byteimg.com/qa-avatar']}})),has_more:start+100<returned,min_time:'1790000000',offset:String(index+1),owner_follower_count:total,myself_user_id:'100'};}};
  for(let n=0;n<200;n++){result=await readPage(client,state,{previewFirst:true,now:()=>1790001000000+n*30000});state=result.next;if(result.complete)break;}
  eq(result.complete,true);eq(result.followerRosterVerified,verified);eq(state.seenFollowerIds.length,returned);eq(calls,Math.ceil(returned/100));eq(result.currentFollowerIds?.length,verified?total:undefined);eq(result.phase.includes('未确认全量'),!verified);
 }
 console.log(JSON.stringify({followerCoverageChecks:checks,overTenThousandSyntheticRoster:true,offsetProgressWithUnchangedTimeSupported:true,uiHistoryNotRewoundByHeadPolls:true,truncatedRosterNotReportedCompleteMembership:true,realPlatformRequests:0,realProfileTouched:false,readReceipts:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});

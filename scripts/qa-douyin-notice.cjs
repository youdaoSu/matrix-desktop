// Synthetic payloads and an in-memory store only. No profiles, network or sends.
const assert=require('node:assert/strict');
const {displayContent,systemShape}=require('../desktop/douyin-inbox-content.cjs');
const {noticeLink}=require('../desktop/douyin-inbox-notice.cjs');
const {createEngine}=require('../desktop/douyin-inbox-engine.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const ownUid='9007199254740993',peer='9007199254740995';
const payload={aweType:100140,tips:'',template:null,active_users:[{uid:ownUid,nickname:'QA群主'}],passive_users:[{uid:peer,nickname:'QA成员'}],locale_resources:[{lang:'en',text:'QA English'},{lang:'zh-Hans',text:'{1}通过{0}的个人主页加入了群聊，新成员无法查看历史消息'}]};
const show=(v=payload,type=1001,status=0,context={ownUid})=>displayContent(JSON.stringify(v),type,status,context);
const expected='QA成员通过QA群主的个人主页加入了群聊，新成员无法查看历史消息';
eq(show().text,expected);eq(show().contentKind,'system');eq(show().contentNote,undefined);
eq(show().mentions.map(m=>show().text.slice(m.start,m.start+m.length)),['QA成员','QA群主']);
for(const awe of [100140,100145,100149,999999])eq(show({...payload,aweType:awe}).text,expected);
for(const awe of [100106,100111,100112,100113,100114]){
 const v={...payload,aweType:awe,locale_resources:[{lang:'zh-Hans',text:'{0}邀请{1}'}]};
 eq(show(v).text,'你邀请QA成员');eq(show(v,1001,0,{ownUid:peer}).text,'QA群主邀请QA成员');
}
eq(show(payload,1001,0,{ownUid:'100'}).text,expected);
eq(show(payload,1001,0,{ownUid,resolveName:id=>id===peer?'QA联系人备注':undefined}).text,expected.replace('QA成员','QA联系人备注'));
eq(show({...payload,active_users:[{nickname:'QA {1} $&'}]}).text,'QA成员通过QA {1} $&的个人主页加入了群聊，新成员无法查看历史消息');
eq(show({...payload,passive_users:[{uid:peer}]}).text.includes(peer),false);
const missing=show({...payload,passive_users:[]});eq(missing.text.includes('（信息未提供）'),true);eq(!!missing.contentNote,true);
eq(show({...payload,locale_resources:[{lang:'zh-Hans',text:'{2} {0}'}]}).text,'（信息未提供） QA群主');
eq(show({...payload,locale_resources:[{lang:'en',text:'DO_NOT_DISPLAY'}]}).text,'系统提示');
eq(show({...payload,locale_resources:Array(33).fill({lang:'zh-Hans',text:'DO_NOT_DISPLAY'})}).text,'系统提示');
eq(show({...payload,locale_resources:[{lang:'zh-Hans',text:{token:'DO_NOT_DISPLAY'}}]}).text,'系统提示');
eq(show({...payload,locale_resources:[{lang:'zh-Hans',text:'A'.repeat(24001)}]}).text,'系统提示');
for(const status of [1,2,3,4]){const r=show(payload,1001,status);eq(r.text.includes('QA群主'),false);eq(r.mentions,undefined);}
eq(show({...payload,aweType:100140,locale_resources:undefined}).text,'系统提示');
eq(show({aweType:100110,passive_users:[{uid:ownUid,nickname:'QA本人'}]}).text,'你已被群主设为管理员');
eq(show({aweType:100115,active_users:[{uid:ownUid,nickname:'QA本人'}]}).text,'你修改了群头像');
eq(show({aweType:100100,active_users:[{uid:ownUid,nickname:'QA本人'}],passive_users:[{uid:peer,nickname:'QA成员'}]}).text,'你邀请了QA成员加入群聊');
eq(show({aweType:100101,active_users:[{uid:peer,nickname:'QA成员'}],passive_users:[{uid:ownUid,nickname:'QA本人'}]}).text,'你通过QA成员分享的口令加入群聊');
eq(show({fallback_tips:'QA兼容提示'},1).text,'QA兼容提示');
eq(show({tips:'{{user}}设置了{{item}}',template:[{key:'user',name:'QA用户'},{key:'item',name:'QA群名'}]},1).text,'QA用户设置了QA群名');
eq(show({tips:'{{user}}',template:[{key:'user',name:'QA{{item}}'}]},1).text,'QA{{item}}');
eq(show({tips:'{{user}}',template:[{key:'user',name:'甲'},{key:'user',name:'乙'}]},1).text,'（信息未提供）');
eq(show({content:JSON.stringify(payload)}).text,expected);
eq(show({text:'QA正文',aweType:100140,locale_resources:payload.locale_resources},7).contentKind,'text');
const link='https://www.douyin.com/user/MS4wQA_user';
const linked=show({...payload,template:[{key:'QA成员',extra:{is_full_text_match:'1'},link}]});
eq(linked.mentions[0].linkUrl,link);
for(const bad of ['javascript:alert(1)','file:///C:/secret','https://evil.test/','aweme://user/1','https://www.douyin.com.evil.test/video/1','https://user:pass@www.douyin.com/video/1','https://www.douyin.com/video/1?mark_read=1','https://www.douyin.com/video/1#action']){
 eq(noticeLink(bad),undefined);eq(show({...payload,template:[{key:'QA成员',extra:{is_full_text_match:1},link:bad}]}).mentions.some(m=>m.linkUrl),false);
}
eq(noticeLink('https://www.douyin.com/video/123'),'https://www.douyin.com/video/123');
const shape=systemShape(JSON.stringify({...payload,token:'QA_SECRET',locale_resources:[{lang:'zh-Hans',text:'QA_PRIVATE_TEXT'}]}));
eq(shape.includes('locale_resources=array'),true);eq(/QA_PRIVATE_TEXT|QA_SECRET/.test(shape),false);
// Existing cached raw content is reprojected without commit, migration or HTTP.
const raw=JSON.stringify(payload),threadId='200',message={id:'300',threadId,shortId:'400',type:2,sender:peer,index:'1',version:'1',messageType:1001,text:'系统提示',rawContent:raw,status:0,at:'2026-10-23T00:00:00Z'};
const state={revision:1,threads:{[threadId]:{id:threadId,shortId:'400',type:2,name:'QA群',history:{done:true},messageRevision:1}},messages:{[threadId+'/300']:message},init:{done:true},strangers:{done:true},frontier:{},people:{}};
const before=JSON.stringify(state);let commits=0,reads=0;
const engine=createEngine({store:{get:()=>state,commit(){commits++;throw Error('Read projection must not commit');}},transport:{ownUid,read(){reads++;throw Error('Read projection must not fetch');},close(){}},assertCurrent:async()=>{}});
eq(engine.messages(threadId).messages[0].text,expected);eq(engine.threads()[0].lastMessage,expected);
eq(engine.messages(threadId).messages[0].rawContent,undefined);eq(engine.status().systemSchemas,[]);
eq(JSON.stringify(state),before);eq(commits,0);eq(reads,0);engine.close();
console.log(JSON.stringify({noticeChecks:checks,localizedGroupTemplates:true,ownIdentityAware:true,safeHighlights:true,cachedReprojectionWithoutWrites:true,realPlatformRequests:0,realSends:0,userArchivesRead:false}));

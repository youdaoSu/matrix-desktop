// Synthetic bodies and fresh temporary encrypted stores only. No user archive,
// website traffic, sending, mark-read or private-message exports.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { displayContent } = require('../desktop/douyin-inbox-content.cjs');
const { createInteractionCache } = require('../desktop/douyin-interaction-cache.cjs');
const { createStore } = require('../desktop/douyin-inbox-store.cjs');
const { createEngine, mergeMessage } = require('../desktop/douyin-inbox-engine.cjs');
let checks = 0; const eq = (a,b) => { assert.deepEqual(a,b); checks++; };
const display = (value,type) => displayContent(JSON.stringify(value),type);
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'matrix-douyin-cache-qa-')), encryptionKey = crypto.randomBytes(32);
const protect = text => { const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv); const bytes=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]); return Buffer.concat([iv,cipher.getAuthTag(),bytes]); };
const unprotect = bytes => { const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'); };
try {
  for(const type of [7,1001]) eq(display({text:'QA 文本'},type).text,'QA 文本');
  for(const [awe,part] of [[100100,'加入群聊'],[100104,'被移出'],[100105,'退出群聊'],[100110,'群管理员'],[100106,'群名已修改'],[100115,'群头像已修改']]) {
    const body=display({aweType:awe,passive_users:[{uid:'99',nickname:'QA成员'}],new_name:'QA群'},1001); eq(body.contentKind,'system');eq(body.text.includes(part),true);eq(body.text.includes('99'),false);
  }
  eq(display({tips:'QA 系统提醒'},1001).text,'QA 系统提醒');
  eq(display({hint_text:'QA官网提示正文'},1001),{text:'QA官网提示正文',contentKind:'system'});
  eq(display({hint_text:'QA简短摘要',tips:'{{1}} 的完整系统提示',template:[{key:1,name:'QA成员'}]},1001).text,'QA成员 的完整系统提示');
  eq(display({aweType:100109,tips:'{{1}} 通过 {{2}} 的个人主页加入群聊',template:[{key:1,name:'QA新成员'},{key:'2',name:'QA群主'}]},1001).text,'QA新成员 通过 QA群主 的个人主页加入群聊');
  eq(display({tips:'{{1}}赞了{{2}}',template:[{key:1,name:'QA $& {{2}}'},{key:2,name:'视频'}]},1001).text,'QA $& {{2}}赞了视频');
  eq(displayContent('QA普通系统提示',1001),{text:'QA普通系统提示',contentKind:'system'});eq(displayContent(JSON.stringify('QA字符串系统提示'),1001).text,'QA字符串系统提示');
  eq(display({tips:'{{1}} 加入群聊',template:[{key:1,uid:'SECRET_ID',skey:'PRIVATE_KEY'}]},1001).text,'（信息未提供） 加入群聊');
  eq(display({tips:'{{1}} 加入群聊',template:[{key:1,name:'甲'},{key:1,name:'乙'}]},1001).text,'（信息未提供） 加入群聊');
  eq(display({tips:'{{1}} 加入群聊',template:[{key:1,name:{private:'PRIVATE_KEY'}}]},1001).text,'（信息未提供） 加入群聊');
  eq(display({tips:'{{1}} 加入群聊',template:Array.from({length:101},()=>({key:1,name:'PRIVATE_KEY'}))},1001).text,'（信息未提供） 加入群聊');
  eq(display({text:'真实正文',tips:'不应覆盖'},1001).text,'真实正文');
  eq(displayContent('{"skey":"PRIVATE_KEY"',1001).text,'系统提示');
  for(const awe of ['100100','100109','100110','100104','100105','100106','100115']) eq(display({aweType:awe,passive_users:[{nickname:'QA成员'}]},1001).contentKind,'system');
  eq(display({awe_type:'100105',activeUsers:[{nickname:'QA离群者'}],passiveUsers:[{nickname:'QA其他人'}]},1001).text,'QA离群者 退出群聊');
  for(const invalid of ['1e5',{},[100109],true,'100109junk']) { const result=display({aweType:invalid},1001);eq(result.contentKind,'system');eq(result.text,'系统提示');eq(result.contentNote.includes('尚未解析'),true); }
  for(const raw of ['Recall Content Hidden',JSON.stringify({text:'Recall Content Hidden',original:'PRIVATE_HIDDEN'}),JSON.stringify({content:'Recall Content Hidden',resource_url:{url_list:['https://p1.byteimg.com/hidden.jpg']}})]) eq(displayContent(raw,1001),{text:'消息已撤回',contentKind:'system'});
  for(const status of [1,2,3,4]) { const result=displayContent(JSON.stringify({text:'PRIVATE_HIDDEN',resource_url:{url_list:['https://p1.byteimg.com/hidden.jpg']}}),27,status);eq(result.contentKind,'system');eq(result.mediaUrl,undefined);eq(JSON.stringify(result).includes('PRIVATE_HIDDEN'),false); }
  eq(display({skey:'PRIVATE_KEY',template:{arbitrary:'PRIVATE_KEY'}},1001).contentKind,'system');
  eq(JSON.stringify(display({skey:'PRIVATE_KEY'},1001)).includes('PRIVATE_KEY'),false);
  for(const [type,kind] of [[27,'image'],[5,'emoji'],[17,'audio'],[30,'video']]) {
    const v={resource_url:{url_list:['https://p1.byteimg.com/qa.jpg']},url:{url_list:['https://p1.byteimg.com/qa.gif']},video:{url_list:['https://p1.byteimg.com/qa.mp4']}};
    eq(display(v,type).contentKind,kind);eq(display(v,type).mediaUrl.startsWith('https://p1.byteimg.com/'),true);
    const encrypted=display({resource_url:{oid:'PRIVATE_OBJECT',skey:'PRIVATE_KEY'}},type);eq(encrypted.mediaUrl,undefined);eq(JSON.stringify(encrypted).includes('PRIVATE_KEY'),false);
  }
  for(const bad of ['javascript:alert(1)','file:///C:/private','https://127.0.0.1/a','https://p1.byteimg.com.evil.test/a','https://user:secret@p1.byteimg.com/a','https://p1.byteimg.com:9999/a','data:image/png;base64,YQ==']) eq(display({resource_url:{url_list:[bad]}},27).mediaUrl,undefined);
  eq(display({itemId:'9007199254740993',content_title:'QA作品'},8).linkUrl,'https://www.douyin.com/video/9007199254740993');
  eq(display({itemId:9007199254740994,content_title:'QA作品'},8).linkUrl,undefined);
  eq(display({title:'QA链接',link_url:'javascript:alert(1)'},26).linkUrl,undefined);
  eq(displayContent('<img src=x onerror=alert(1)>',7).contentKind,'text');
  eq(display({resource_url:{url_list:['https://p1.byteimg.com/a']}},999).contentKind,'unsupported');
  const config={directory,scope:'qa-owner/account/session/native/comments',protect,unprotect};
  const cache=createInteractionCache(config), row={platformId:'101',platformUserId:'102',author:'QA昵称',content:'QA缓存评论',workId:'103'}, work={platformId:'103',title:'QA作品',coverUrl:'https://p1.byteimg.com/a'};
  cache.merge({records:[row],works:[work],complete:false,capturedAt:'QA时间'});const file=fs.readdirSync(directory).find(f=>f.endsWith('.bin')), bytes=fs.readFileSync(path.join(directory,file));eq(bytes.includes(Buffer.from(row.content)),false);
  const reopened=createInteractionCache(config);eq(reopened.get().records,[row]);eq(reopened.get().works,[work]);eq(reopened.get().complete,false);eq(reopened.get().cursor,undefined);
  eq(reopened.findRecord('101','103'),row);eq(reopened.findRecord('101','104'),undefined);const cloned=reopened.findRecord('101','103');cloned.content='QA不应修改缓存';eq(reopened.findRecord('101','103').content,row.content);
  eq(reopened.findWork('103'),work);eq(reopened.findWork('104'),undefined);const workClone=reopened.findWork('103');workClone.title='QA不应修改作品';eq(reopened.findWork('103').title,work.title);
  reopened.merge({records:[],works:[{platformId:'103',title:'QA作品',readComplete:true}],complete:true});eq(reopened.get().records,[row]);eq(reopened.get().works[0].coverUrl,work.coverUrl);
  eq(reopened.findWork('103').readComplete,true);
  reopened.merge({records:[{...row,content:'QA更新'}],works:[],complete:true});eq(reopened.get().records.length,1);eq(reopened.get().records[0].content,'QA更新');eq(reopened.findRecord('101','103').content,'QA更新');
  const other=createInteractionCache({...config,scope:'qa-other/account/session/native/comments'});eq(other.get().records,[]);
  const currentFile=path.join(directory,file), before=fs.readFileSync(currentFile);
  const failing=createInteractionCache({...config,io:{...fs,renameSync(){throw Object.assign(Error('PRIVATE_PATH'),{code:'EACCES'});}}});eq(failing.findRecord('101','103').content,'QA更新');
  assert.throws(()=>failing.merge({records:[{...row,content:'不应覆盖'}],works:[],complete:false}),e=>/缓存保存失败/.test(e.message)&&/replace\/EACCES/.test(e.message)&&!e.message.includes('PRIVATE_PATH'));checks++;eq(fs.readFileSync(currentFile),before);eq(failing.get().records[0].content,'QA更新');eq(failing.findRecord('101','103').content,'QA更新');
  eq(failing.findWork('103').readComplete,true);assert.throws(()=>failing.merge({records:[],works:[{platformId:'103',title:'QA不应替换',readComplete:false}],complete:false}),/缓存保存失败/);checks++;eq(failing.findWork('103').title,work.title);eq(failing.findWork('103').readComplete,true);eq(fs.readFileSync(currentFile),before);
  assert.throws(()=>createInteractionCache({...config,unprotect(){throw Error('PRIVATE_CONTENT');}}),/读取或解密/);checks++;eq(fs.readFileSync(currentFile),before);
  // Idle comment checks retain the last durable content timestamp and must
  // perform zero encryption/filesystem writes, even if progress/time changes.
  {let writes=0;const idleConfig={directory:path.join(directory,'idle'),scope:'qa-idle-comments',protect:text=>{writes++;return protect(text);},unprotect},idle=createInteractionCache(idleConfig);
   const rows=Array.from({length:1000},(_,i)=>({platformId:String(1000+i),workId:'9001',platformUserId:'9002',author:'QA用户',content:'QA缓存评论'+i})),card={platformId:'9001',title:'QA作品',readComplete:true};
   const page={kind:'comments',records:rows,works:[card],complete:true,capturedAt:'2026-10-23T00:00:00Z',progress:{pages:10}};idle.merge(page);eq(writes,1);
   const saved=path.join(idleConfig.directory,fs.readdirSync(idleConfig.directory)[0]),savedBytes=fs.readFileSync(saved);
   for(let n=1;n<=12;n++){const current=idle.merge({...page,records:n%2?[]:rows.slice(0,20),works:n%3?[]:[card],capturedAt:new Date(Date.parse(page.capturedAt)+n*15000).toISOString(),progress:{pages:10+n}});eq(current.records.length,n%2?0:20);if(current.records.length){current.records[0].content='QA不能修改原缓存';eq(idle.findRecord('1000','9001').content,rows[0].content);}}
   eq(writes,1);eq(fs.readFileSync(saved),savedBytes);eq(idle.get().capturedAt,page.capturedAt);eq(idle.get().progress.pages,10);eq(createInteractionCache(idleConfig).get().records,rows);
   for(const patch of [{content:'QA真实新正文'},{liked:false,likeCount:0},{liked:true,likeCount:1},{images:[{urls:['https://p1.byteimg.com/new-comment-picture']}]},{images:undefined},{replyCount:2,repliesReadState:'partial',repliesReadReason:'QA可访问数量有限'},{avatarUrl:'https://p1.byteimg.com/new-avatar'}]){const current=idle.findRecord('1000','9001'),count=writes;idle.merge({...page,records:[{...current,...patch}],works:[]});eq(writes,count+1);eq(idle.findRecord('1000','9001'),{...current,...patch});}
   const changedBefore=writes;idle.merge({...page,records:[],works:[{...card,readError:'QA官网拒绝',readComplete:false}]});eq(writes,changedBefore+1);eq(idle.findWork('9001').readError,'QA官网拒绝');idle.merge({...page,records:[],works:[{...card,readError:undefined}],complete:false});eq(idle.get().complete,false);eq(idle.findWork('9001').readError,undefined);eq(createInteractionCache(idleConfig).get().complete,false);
   const receiptId=crypto.randomUUID(),receiptBefore=writes;idle.action(receiptId,{receipt:{state:'unknown'},fingerprint:'qa'});eq(writes,receiptBefore+1);eq(createInteractionCache(idleConfig).action(receiptId).receipt.state,'unknown');
   const guarded=createInteractionCache({...idleConfig,io:{...fs,writeFileSync(){throw Object.assign(Error('QA must not write'),{code:'ENOSPC'});}}}),prior=fs.readFileSync(saved),old=guarded.findRecord('1000','9001');guarded.merge({kind:'comments',records:[old],works:[],complete:false,capturedAt:'2026-10-24T00:00:00Z'});eq(fs.readFileSync(saved),prior);assert.throws(()=>guarded.merge({kind:'comments',records:[{...old,content:'QA不应推进'}],works:[],complete:false}),/缓存保存失败/);checks++;eq(guarded.findRecord('1000','9001'),old);eq(fs.readFileSync(saved),prior);
   const fanConfig={...idleConfig,directory:path.join(directory,'idle-fans'),scope:'qa-observed-followers'},fans=createInteractionCache(fanConfig),fan={platformId:'8001',platformUserId:'8001',author:'QA粉丝',content:''};const count=writes;fans.merge({kind:'followers',records:[fan],complete:false,capturedAt:page.capturedAt});fans.merge({kind:'followers',records:[fan],complete:false,capturedAt:'2026-10-23T00:00:15Z'});eq(writes,count+2);eq(fans.findRecord('8001').firstObservedAt,page.capturedAt);eq(fans.findRecord('8001').lastObservedAt,'2026-10-23T00:00:15Z');
   // Catalog end is independent of comment completion and must survive a
   // reopen even if its final page contains only already-cached pinned works.
   const catalogConfig={...idleConfig,directory:path.join(directory,'catalog'),scope:'qa-catalog-progress'},catalog=createInteractionCache(catalogConfig);
   catalog.merge({kind:'comments',records:[],works:[card],complete:false,progress:{pages:1,worksCatalogComplete:false}});
   const catalogWrites=writes;catalog.merge({kind:'comments',records:[],works:[card],complete:false,progress:{pages:2,worksCatalogComplete:true}});
   eq(writes,catalogWrites+1);eq(createInteractionCache(catalogConfig).get().progress.worksCatalogComplete,true);eq(catalog.get().complete,false);
   catalog.merge({kind:'comments',records:[],works:[card],complete:false,progress:{pages:3,worksCatalogComplete:true}});eq(writes,catalogWrites+1);
  }
  // A proved durable change serializes only the new snapshot. Same-size edits
  // still use the exact comparison; unchanged pages must never rewrite disk.
  {
   let writes=0,serializations=0;const fastConfig={directory:path.join(directory,'serialization'),scope:'qa-serialization',protect:text=>{writes++;return protect(text);},unprotect},fast=createInteractionCache(fastConfig);
   const page={kind:'followers',records:[{platformId:'991',platformUserId:'991',author:'QA follower',content:''}],works:[],complete:false,capturedAt:'2026-10-26T00:00:00Z'};
   fast.merge(page);const scope=crypto.createHash('sha256').update(fastConfig.scope).digest('hex'),originalStringify=JSON.stringify;
   const observed=fn=>{serializations=0;JSON.stringify=function(value,...args){if(value?.version===1&&value.scope===scope&&Array.isArray(value.records))serializations++;return originalStringify.call(this,value,...args);};try{return fn();}finally{JSON.stringify=originalStringify;}};
   const next={...page,capturedAt:'2026-10-26T00:00:15Z'};observed(()=>fast.merge(next));eq(serializations,1);eq(writes,2);
   const savedFile=path.join(fastConfig.directory,fs.readdirSync(fastConfig.directory)[0]),unchanged=fs.readFileSync(savedFile);observed(()=>fast.merge(next));eq(serializations,2);eq(writes,2);eq(fs.readFileSync(savedFile),unchanged);
   const edited={...next,records:[{...page.records[0],content:'QA updated biography'}]};observed(()=>fast.merge(edited));eq(serializations,2);eq(writes,3);eq(createInteractionCache(fastConfig).findRecord('991').content,'QA updated biography');
   observed(()=>fast.merge({...edited,complete:true}));eq(serializations,1);eq(writes,4);eq(createInteractionCache(fastConfig).get().complete,true);
   observed(()=>fast.merge({...edited,complete:true,records:[{...page.records[0],platformId:'992',platformUserId:'992'}]}));eq(serializations,1);eq(writes,5);eq(createInteractionCache(fastConfig).get().records.length,2);
   const beforeFailure=fs.readFileSync(savedFile),broken=createInteractionCache({...fastConfig,io:{...fs,renameSync(){throw Object.assign(Error('QA failure'),{code:'EIO'});}}}),prior=broken.get();
   assert.throws(()=>observed(()=>broken.merge({...edited,capturedAt:'2026-10-26T00:00:30Z'})),/缓存保存失败/);checks++;eq(serializations,1);eq(broken.get(),prior);eq(fs.readFileSync(savedFile),beforeFailure);
  }
  // Old placeholders are re-projected from the archive without changing disk,
  // refetching history, exposing raw JSON or emitting a business/read request.
  const owner='100',peer='200',threadId='0:1:100:200',store=createStore({...config,scope:['qa-owner','qa-account',owner]});
  store.commit(next=>{next.threads[threadId]={id:threadId,shortId:'300',type:1,name:'QA联系人',peer,history:{done:true,cursor:'0',pages:1}};next.messages[threadId+'/400']={id:'400',threadId,sender:peer,index:'1',version:'1',messageType:1001,text:'[非文本消息 · 类型 1001]',rawContent:JSON.stringify({aweType:100109,passive_users:[{nickname:'QA成员'}]})};});
  const rev=store.get().revision;store.commit(()=>{});eq(store.get().revision,rev);
  const engine=createEngine({transport:{ownUid:owner,close(){}},store,assertCurrent:async()=>{}});
  eq(engine.messages(threadId).messages[0].text,'QA成员 加入群聊');eq(engine.messages(threadId).messages[0].rawContent,undefined);eq(engine.threads()[0].lastMessage,'QA成员 加入群聊');eq(store.get().revision,rev);engine.close();
  store.commit(next=>mergeMessage(next,{...next.messages[threadId+'/400'],version:'2',mediaUrl:'https://p1.byteimg.com/old.jpg',linkUrl:'https://www.douyin.com/video/999',contentNote:'QA旧附件'}));
  const old=store.get().messages[threadId+'/400'];store.commit(next=>mergeMessage(next,{...old,version:'3',mediaUrl:undefined,linkUrl:undefined,contentNote:undefined}));eq(store.get().messages[threadId+'/400'].mediaUrl,undefined);eq(store.get().messages[threadId+'/400'].linkUrl,undefined);
  const refreshed=createEngine({transport:{ownUid:owner,close(){}},store,assertCurrent:async()=>{}});eq(refreshed.messages(threadId).messages[0].mediaUrl,undefined);eq(refreshed.messages(threadId).messages[0].contentNote,undefined);refreshed.close();
  store.commit(next=>mergeMessage(next,{...next.messages[threadId+'/400'],version:'4',status:3,rawContent:JSON.stringify({text:'PRIVATE_RECALLED_BODY'})}));
  const recalled=createEngine({transport:{ownUid:owner,close(){}},store,assertCurrent:async()=>{}});eq(recalled.messages(threadId).messages[0].text,'消息已撤回');eq(recalled.threads()[0].lastMessage,'消息已撤回');eq(JSON.stringify(recalled.messages(threadId)).includes('PRIVATE_RECALLED_BODY'),false);recalled.close();
  console.log(JSON.stringify({checks,syntheticOnly:true,encryptedRestartCache:true,oldArchiveReprojection:true,realPlatformRequests:0,businessSends:0,markReadRequests:0}));
} finally { assert.ok(directory.startsWith(path.join(os.tmpdir(),'matrix-douyin-cache-qa-')));fs.rmSync(directory,{recursive:true}); }

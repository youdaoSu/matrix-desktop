// Bounded technical metadata only. Never stores IDs, handles, message bodies,
// URLs, headers, credentials, exception text or browser state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const kinds=new Set(['comments','followers','profile','messages']);
const stages=new Set(['binding','prepare','identity','catalog','comment-page','reply-page','follower-page','comment-head','inventory-head','cache','continuation','profile-counter','history','push','initialize','unknown']);
const phaseMap=new Map([['参数校验','binding'],['账号验证','binding'],['准备官网采集页','prepare'],['本人身份复核','identity'],['作品目录分页','catalog'],['作品评论分页','comment-page'],['评论回复分页','reply-page'],['粉丝名单分页','follower-page'],['评论更新检查','comment-head'],['作品更新检查','inventory-head'],['保存互动缓存','cache'],['读取缓存','cache'],['生成续传凭据','continuation']]);
const codes=new Set(['catalog-paused','reader-busy','page-not-ready','type-error','range-error','syntax-error','follower-transport','follower-body-shape','follower-status-shape','follower-json-shape','follower-control-shape','follower-list-shape','follower-more-shape','follower-cursor-shape','follower-uid-precision','follower-uid-shape','creator-id-unobserved','creator-id-same','creator-id-different-same-handle','creator-account-different','creator-id-different-handle-unavailable','transport-connected','push-message-saved','push-control-saved','event-archive-read','event-archive-write','owner-uid-missing','owner-uid-precision','owner-uid-format','owner-handle-missing','owner-handle-format','read-ok','unknown','creator-author-mismatch','binding-mismatch','binding-changed','verification-required','login-required','http-denied','platform-denied','timeout','schema','profile-owner-shape','profile-counter-shape','storage','storage-encrypt','store-count-limit','store-byte-limit','unsupported-capacity','protocol-encode','thread-conflict','invalid-id','thread-shape','thread-owner','message-shape','payload-format','message-missing','cursor-file','cursor-shape','cursor-bytes','compression-format','duplicate-header','header-shape','protobuf-wire','transport','collector-released']);
const numberFields=new Set(['recordCount','workCount','avatarSources','imageSources','worksFound','worksDone','rootPages','replyPages','followerPages','selfStarted','selfCompleted','selfFailed','followerStarted','followerCompleted','followerFailed','followerSource0','followerSource1','followerSource2','followerSourceOther','followerObservedPages','followerObservedPending','followerObservedErrors','followerObservedOrder','followerFetchStarted','followerFetchReceived','followerFetchRepairs','followerXhrStarted','followerXhrReceived','followerXhrRepairs','followerDomRoots','followerDomLinks','followerDomRows','followerDomPages','followerDomSeen','followerDomHeadings','followerDomImages','followerDomFrames','followerDomCards','followerDomUidFields','followerXhrAbort','followerXhrError','followerXhrTimeout','followerXhrStatusZero','followerXhrStateErrors']),booleanFields=new Set(['complete','catalogComplete']);
const hints=new Set(['follower-observer','follower-entry-missing','follower-list-missing','follower-scroll-missing','follower-next-pending','follower-get-pending']);
stages.add('follower-avatar');
stages.add('follower-avatar-display');
stages.add('open-follower-panel');
stages.add('follower-auto-prepare');stages.add('follower-auto-page');codes.add('follower-pagination-complete');
stages.add('follower-checkpoint');codes.add('follower-paused');codes.add('follower-resumed');
numberFields.add('followerMemberProofReads');numberFields.add('followerMissingControlReads');
numberFields.add('followerAnchoredNameProofReads');
numberFields.add('followerWholeProbeDeferrals');
numberFields.add('followerLinkedAvatarProofReads');
numberFields.add('followerIdentityCandidateKind');
numberFields.add('followerIdentityFailureMask');
numberFields.add('followerIdentityImageFacts');
numberFields.add('followerOwnCount');numberFields.add('followerMultiPlatformCount');
stages.add('follower-api-inspect');
codes.add('avatar-unavailable');
for(const code of ['avatar-owner-mismatch','avatar-owner-shape','avatar-peer-mismatch'])codes.add(code);
for(const code of ['avatar-network-timeout','avatar-body-network','avatar-fetch-network'])codes.add(code);
for(const code of ['avatar-request-not-started','avatar-request-blocked','avatar-request-aborted','avatar-connection-failed'])codes.add(code);
codes.add('collector-recreated');numberFields.add('followerCollectorGeneration');booleanFields.add('followerRefreshRequested');
for(const field of ['followerPrepareStage','followerInitTypeErrorMask'])numberFields.add(field);
const inventorySelfCodes={PUBLIC_HEAD_PROFILE_HTTP:'inventory-self-http',PUBLIC_HEAD_READ_HTTP:'inventory-self-http',PUBLIC_HEAD_PROFILE_JSON:'inventory-self-json',PUBLIC_HEAD_READ_JSON:'inventory-self-json',PUBLIC_HEAD_API:'inventory-self-api',PUBLIC_HEAD_SHAPE:'inventory-self-shape',PUBLIC_HEAD_OWNER:'inventory-self-owner',PUBLIC_HEAD_NOT_READY:'inventory-self-not-ready',PUBLIC_HEAD_VERIFY:'inventory-self-verify'};
for(const code of Object.values(inventorySelfCodes))codes.add(code);
const inventoryMessages=new Map([
 ['抖音本人主页作品首批尚未就绪，历史和粉丝断点保留','inventory-head-not-ready'],
 ['抖音本人主页新作品页面未能载入，历史和粉丝断点保留','inventory-head-load'],
 ['抖音本人主页新作品归属未通过，旧目录保留','inventory-head-owner'],
 ['本轮新作品检查已结束，原断点保留','inventory-head-ended'],
 ['此抖音账号正在检查新作品，请稍候','inventory-head-busy']
]);
for(const code of inventoryMessages.values())codes.add(code);
codes.add('inventory-head-waiting');
for(const field of ['followerUiReads','followerUiOpened','followerUiDomMode','followerUiResponseMode','followerUiSelfPending','followerUiReaderReady','followerBlocked','followerUnreadBlocked'])numberFields.add(field);
for(const field of ['followerInitialScrolls','followerPanelPropsMask','followerPanelUserListCount'])numberFields.add(field);
for(const field of ['followerDomFooterCount','followerDomFooterStateMask','followerDomPanelChildCount'])numberFields.add(field);
numberFields.add('followerDomRootFastPath');
for(const field of ['followerDomFollowingHeadings','followerDomRemoveControls','followerDomBackFollowControls','followerDomMutualControls','followerDomAllUserLinks'])numberFields.add(field);
booleanFields.add('followerRosterVerified');numberFields.add('followerRosterExpected');numberFields.add('followerRosterSeen');
numberFields.add('followingBlocked');
for(const key of ['followerDomPanels','followerDomPanelOwnProof','followerDomPanelTabMask','followerEntryIdentityMask','pageJsErrors','pageJsTypeErrors','pageJsReferenceErrors','pageJsTypeErrorMask','fanIndexStarted','fanIndexCompleted','fanIndexFailed','fanIndexStatus','newestCommentSeconds'])numberFields.add(key);
for(const key of ['inventoryHeadLinks','inventoryHeadCards','inventoryHeadOwned','inventoryHeadForeign','inventoryHeadUnknown','inventoryHeadItemAnchors','inventoryHeadOwnTab','inventoryHeadExpected'])numberFields.add(key);
const validStats=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,item])=>numberFields.has(key)?Number.isSafeInteger(item)&&item>=0&&item<=2147483647:booleanFields.has(key)&&typeof item==='boolean');
for(const field of ['responseStatus','responseMime','responseEncoding','responseReadError','responseBytes','responseBodyKind'])numberFields.add(field);
for(const field of ['responseJsonValid','responseRosterShape','responseApiAccepted'])booleanFields.add(field);
function classifySyncFailure(error){
 if(Object.hasOwn(inventorySelfCodes,error?.readerCode))return inventorySelfCodes[error.readerCode];
 const text=typeof error==='string'?error:typeof error?.message==='string'?error.message:'';
 if(inventoryMessages.has(text))return inventoryMessages.get(text);
 const push=/^抖音推送处理暂停（阶段=[a-z-]+；原因=([a-z-]+)；/.exec(text)?.[1];if(codes.has(push))return push;
 const relation=/归属关系：(CREATOR_(?:ID_UNOBSERVED|ID_SAME|ID_DIFFERENT_SAME_HANDLE|ACCOUNT_DIFFERENT|ID_DIFFERENT_HANDLE_UNAVAILABLE))/.exec(text)?.[1];if(relation)return relation.toLowerCase().replaceAll('_','-');
 if(/作品作者不属于当前绑定账号|作品作者不属于本轮本人|作品更新作者不属于当前/.test(text))return 'creator-author-mismatch';
 if(/本人ID与绑定账号不一致|抖音号与绑定记录不匹配|身份编号与绑定不一致|本人编号发生变化/.test(text))return 'binding-mismatch';
 if(/绑定.*已变化|账号.*已切换|官方登录已变化|身份已改变/.test(text))return 'binding-changed';
 if(/验证码|安全验证|本人验证|页面验证|官方验证/.test(text))return 'verification-required';
 if(/重新登录|登录失效|请先登录|缺少有效登录/.test(text))return 'login-required';
 if(/HTTP\s*(?:401|403|429)/.test(text))return 'http-denied';
 if(/平台码/.test(text))return 'platform-denied';
 const followerStage=/\b(FOLLOWER_(?:LIST_SHAPE|MORE_SHAPE|CURSOR_SHAPE|UID_PRECISION|UID_SHAPE|BODY_SHAPE|STATUS_SHAPE|JSON_SHAPE|CONTROL_SHAPE|TRANSPORT))\b/.exec(text)?.[1];if(followerStage)return followerStage.toLowerCase().replaceAll('_','-');
 const ownerStage=/\b(OWNER_(?:UID_(?:MISSING|PRECISION|FORMAT)|HANDLE_(?:MISSING|FORMAT)))\b/.exec(text)?.[1];if(ownerStage)return ownerStage.toLowerCase().replaceAll('_','-');
 if(/OWNER_SHAPE/.test(text))return 'profile-owner-shape';if(/COUNTER_SHAPE/.test(text))return 'profile-counter-shape';
 if(/加密失败|encrypt/.test(text))return 'storage-encrypt';
 if(/存档.*(?:写入失败|读取失败|解密失败)|存储|EACCES|ENOSPC/.test(text))return 'storage';
 if(/采集页已释放/.test(text))return 'collector-released';if(/超时/.test(text))return 'timeout';
 if(text==='此抖音账号正在读取另一页，请稍候')return 'reader-busy';if(/抖音官方(?:作品目录|评论)尚未读取完成/.test(text))return 'page-not-ready';
 if(/结构|字段|未识别|编号未/.test(text))return 'schema';if(/网络连接|连接失败/.test(text))return 'transport';
 if(['TypeError','RangeError','SyntaxError'].includes(error?.name))return error.name.replace('Error','-error').toLowerCase();
 return 'unknown';
}
function createSyncDiagnostics({directory,now=Date.now,fileSystem=fs}){
 const file=path.join(directory,'douyin-sync-diagnostics-v1.json');let disabled=false,events=[];
 const valid=value=>value&&typeof value==='object'&&typeof value.at==='string'&&Number.isFinite(Date.parse(value.at))&&/^[a-f0-9]{24}$/.test(value.scope)&&kinds.has(value.kind)&&stages.has(value.stage)&&codes.has(value.code)&&(value.stats===undefined||validStats(value.stats))&&(value.hint===undefined||hints.has(value.hint))&&Object.keys(value).every(key=>['at','scope','kind','stage','code','stats','hint'].includes(key));
 try{if(fileSystem.existsSync(file)){const stat=fileSystem.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>160*1024)throw Error();const saved=JSON.parse(fileSystem.readFileSync(file,'utf8'));if(saved.version!==1||!Array.isArray(saved.events)||saved.events.length>256||!saved.events.every(valid))throw Error();events=saved.events;}}catch{disabled=true;}
 return {record(scope,input){
  if(disabled||typeof scope!=='string'||scope.length>1024||!scope||!kinds.has(input?.kind)||!codes.has(input?.code))return false;
  const stage=stages.has(input.stage)?input.stage:phaseMap.get(input.stage)||'unknown',tag=crypto.createHash('sha256').update(scope).digest('hex').slice(0,24),stamp=now();
  if(!Number.isFinite(stamp)||stamp<0||stamp>8640000000000000||input.stats!==undefined&&!validStats(input.stats)||input.hint!==undefined&&!hints.has(input.hint))return false;
  const last=events.findLast(event=>event.scope===tag&&event.kind===input.kind&&event.stage===stage&&event.code===input.code&&event.hint===input.hint);
  if(last&&stamp>=Date.parse(last.at)&&stamp-Date.parse(last.at)<60000)return true;
  const event={at:new Date(stamp).toISOString(),scope:tag,kind:input.kind,stage,code:input.code,...(input.stats?{stats:{...input.stats}}:{}),...(input.hint?{hint:input.hint}:{})};
  let next=[...events,event].slice(-256);
  // Both limits are rolling retention limits, not a reason to freeze future
  // diagnostics. Encode once and evict only as many oldest entries as needed.
  // This also recovers an already-full valid journal without clearing it.
  const encoded=next.map(value=>JSON.stringify(value)),sizes=encoded.map(value=>Buffer.byteLength(value));
  let first=0,total=Buffer.byteLength('{"version":1,"events":[]}')+encoded.length-1+sizes.reduce((sum,size)=>sum+size,0);
  while(total>160*1024&&first<encoded.length-1){total-=sizes[first]+1;first++;}
  if(total>160*1024)return false;
  next=next.slice(first);
  const bytes=Buffer.from('{"version":1,"events":['+encoded.slice(first).join(',')+']}');
  const temp=path.join(directory,'douyin-sync-diagnostics-'+crypto.randomUUID()+'.tmp');let created=false,fd;
  try{fileSystem.mkdirSync(directory,{recursive:true});fd=fileSystem.openSync(temp,'wx',0o600);created=true;fileSystem.writeFileSync(fd,bytes);fileSystem.closeSync(fd);fd=undefined;fileSystem.renameSync(temp,file);events=next;return true;}catch{return false;}finally{if(fd!==undefined)try{fileSystem.closeSync(fd);}catch{}if(created)try{fileSystem.unlinkSync(temp);}catch{}}
 },snapshot(){return structuredClone({version:1,events,disabled});}};
}
module.exports={createSyncDiagnostics,classifySyncFailure};

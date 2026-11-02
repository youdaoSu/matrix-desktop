const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {registerDouyinInteractions}=require('../desktop/douyin-interactions.cjs');
const {createInteractionCache}=require('../desktop/douyin-interaction-cache.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-open-fans-ipc-qa-')),key=crypto.randomBytes(32);
const protect=text=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),bytes=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]);};
const unprotect=bytes=>{const cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');};
const account={id:'qa-account',platform:'douyin',connectorSessionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',nativeAccountKey:'qa-handle'};
const scope=JSON.stringify(['qa-owner',account.id,account.connectorSessionId,account.nativeAccountKey]);
const options={directory:path.join(directory,'douyin-interactions'),scope:JSON.stringify([scope,'followers']),protect,unprotect};
const initial=createInteractionCache(options),stamp='2026-10-25T01:00:00.000Z',old={platformId:'201',platformUserId:'201',author:'QA member',content:'QA saved signature',displayTime:'2026-10-24T01:00:00.000Z',authorProfileUrl:'https://www.douyin.com/user/MS4wQaMember',followerDetailState:{signature:'provided',followTime:'provided'}};
initial.merge({kind:'followers',records:[old,{...old,platformId:'202',platformUserId:'202',avatarUrl:'https://p3.douyinpic.com/old.webp'}],works:[],complete:true,currentFollowerIds:['201','202'],followerRosterVerified:true,capturedAt:stamp,progress:{pages:12}});
const handlers=new Map(),win={webContents:{}},event={sender:win.webContents},cookies=new EventEmitter();cookies.get=async()=>[];
let owner='qa-owner',authCount=0,reads=0,transportReads=0,mode='normal',release,started;
const raw={uid:'201',nickname:'QA member',sec_uid:'MS4wQaMember',signature:'',followerDetailState:{signature:'missing',followTime:'missing'},avatar_thumb:{url_list:['https://p3.douyinpic.com/new.webp']}};
const native=registerDouyinInteractions({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getWindow:()=>win,authenticate:async()=>{authCount++;return {userId:owner,account:{...account}};},session:{fromPartition:()=>({cookies})},safeStorage:{isEncryptionAvailable:()=>true,encryptString:protect,decryptString:unprotect},userData:directory,transportFactory:async()=>{transportReads++;throw Error('Unexpected hidden collector');},openFollowerReader:async({assertCurrent})=>{reads++;await assertCurrent();if(mode==='hold')await new Promise(resolve=>{release=resolve;started();});if(mode==='owner-change')owner='other-owner';if(mode==='raw-error')throw Error('https://private.invalid/private-token');return {ownerUid:'9007199254740993',followers:mode==='duplicate'?[raw,raw]:mode==='unsafe'?[{...raw,uid:9007199254740992}]:[raw]};}});
const handler=handlers.get('matrix:douyin-open-followers'),input={accountId:account.id,accessToken:'qa-token',webContentsId:7};
const saved=()=>createInteractionCache(options).get();
(async()=>{
  try{
    eq(!!(await handler({sender:{}},input)).error,true);eq(authCount,0);
    for(const extra of [{url:'https://evil.invalid'},{uid:'201'},{webContentsId:0},{webContentsId:'7'},{accessToken:''},{accountId:''}])eq(!!(await handler(event,{...input,...extra})).error,true);
    eq(reads,0);
    const result=await handler(event,input);eq(result,{accountId:account.id,sessionId:account.connectorSessionId,loaded:1,avatars:1,complete:false});eq(transportReads,0);eq(authCount,3);
    const after=saved();eq(after.records.length,2);eq(after.records[0].avatarUrl,'https://p3.douyinpic.com/new.webp');eq(after.records[1].avatarUrl,'https://p3.douyinpic.com/old.webp');eq(after.records[0].content,old.content);eq(after.records[0].displayTime,old.displayTime);eq(after.records[0].followerDetailState,{signature:'cached',followTime:'cached'});eq(after.records[1].membershipCheckedAt,stamp);eq(after.progress,{pages:12});eq(after.complete,false);eq(after.followerRosterVerified,false);
    const fingerprint=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(options.directory,crypto.createHash('sha256').update(options.scope).digest('hex')+'.bin'))).digest('hex');
    const before=fingerprint();mode='owner-change';eq((await handler(event,input)).error.includes('绑定已变化'),true);eq(fingerprint(),before);owner='qa-owner';
    for(const current of ['duplicate','unsafe','raw-error']){mode=current;const failure=await handler(event,input);eq(!!failure.error,true);eq(/private-token|https:/.test(failure.error),false);eq(fingerprint(),before);}
    mode='hold';const ready=new Promise(resolve=>{started=resolve;});const held=handler(event,input);await ready;const beforeReads=reads;
    eq((await handler(event,input)).error.includes('正在读取'),true);eq((await handler(event,input)).error.includes('正在读取'),true);eq(reads,beforeReads);release();eq((await held).error,undefined);
    eq(transportReads,0);mode='normal';eq((await handler(event,input)).loaded,1);
    native.close();eq(!!(await handler(event,input)).error,true);
    console.log(JSON.stringify({openFollowerIpcChecks:checks,encryptedCache:true,scopeGuards:true,noRosterRemoval:true,noHiddenReaderOrPlatformRequests:true,realUserDataTouched:false}));
  }finally{native.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

// Synthetic owned-work proofs only. Never reads a real profile or sends requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {readPage,initial}=require('../desktop/douyin-interactions.cjs'),{createInteractionCache}=require('../desktop/douyin-interaction-cache.cjs');
let checks=0,clock=100000,catalogCalls=0,recovered=false;const reads=[],eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const own='100',row=id=>({aweme_id:id,desc:'QA OWN '+id,author:{uid:own}}),comment=id=>({cid:id,aweme_id:'300',user:{uid:'200',nickname:'QA'},text:'QA COMMENT',create_time:1792713600});
const mismatch=()=>Object.assign(Error('抖音官方作品作者不属于当前绑定账号（归属关系：CREATOR_ID_SAME）'),{code:'OWNED_CATALOG_AUTHOR_MISMATCH'});
const client={ownUid:own,source:'https://creator.douyin.com/',async readWeb(kind,args){reads.push({kind,...args});if(kind==='works'){if(args.cursor==='0')return{aweme_list:[row('300')],has_more:true,max_cursor:'50'};catalogCalls++;if(!recovered)throw mismatch();return{aweme_list:[row('302')],has_more:false,max_cursor:'0'};}return{comments:[comment('400')],has_more:false,cursor:'0'};},async readLatest(workId){eq(workId,'300');return{comments:[comment('401')],has_more:false,cursor:'0'};},async readInventoryHead(){return{aweme_list:[row('301'),row('300')],has_more:true,max_cursor:'50'};}};
const options=()=>({previewFirst:true,now:()=>clock});
(async()=>{
 let page=await readPage(client,initial('comments'),options()),state=page.next;const before=structuredClone(state);
 page=await readPage(client,state,options());eq(state,before);eq(page.complete,false);eq(page.next.workCursor,'50');eq(page.next.workEnded,false);eq(page.progress.catalogReadError.includes('已停在原页'),true);eq(catalogCalls,1);state=page.next;
 clock+=5000;page=await readPage(client,state,options());eq(page.records[0].platformId,'400');eq(page.next.worksDone,1);eq(page.next.workCursor,'50');eq(page.complete,false);eq(typeof page.progress.catalogReadError,'string');eq(catalogCalls,1);state=page.next;
 clock+=20000;page=await readPage(client,state,options());eq(page.records[0].platformId,'401');eq(page.next.workCursor,'50');eq(catalogCalls,1);state=page.next;
 clock+=90000;page=await readPage(client,state,options());eq(page.works.some(work=>work.platformId==='301'),true);eq(page.next.workCursor,'50');eq(catalogCalls,1);state=page.next;
 page=await readPage(client,state,{...options(),refreshLatest:true});eq(page.next.catalogRetryRequested,true);state=page.next;clock+=5000;page=await readPage(client,state,options());eq(catalogCalls,2);eq(page.next.catalogRetryRequested,false);eq(page.next.workCursor,'50');state=page.next;
 recovered=true;page=await readPage(client,state,{...options(),refreshLatest:true});state=page.next;clock+=5000;page=await readPage(client,state,options());eq(catalogCalls,3);eq(page.next.workEnded,true);eq(page.progress.catalogReadError,undefined);eq(page.next.seenWorks.includes('302'),true);
 eq(reads.some(read=>read.workId==='999'),false);
 // First-page failure, missing owner proof, other namespaces and untyped
 // failures still reject without a fallback read or cursor advancement.
 clock=100001;
 for(const [failure,proof,source]of [[mismatch(),false,client.source],[Error('HTTP 403'),true,client.source],[Error('抖音绑定身份已改变'),true,client.source],[mismatch(),true,'https://www.douyin.com/']]){
  const input={...before,headWorks:proof?before.headWorks:[]},snapshot=structuredClone(input);await assert.rejects(()=>readPage({...client,source,readWeb:async()=>{throw failure;}},input,options()));checks++;eq(input,snapshot);
 }
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-catalog-isolation-qa-')),key=crypto.randomBytes(32);
 const protect=text=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(text),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);},unprotect=data=>{const cipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString();};
 try{const config={directory:folder,scope:'QA_ONLY',protect,unprotect},cache=createInteractionCache(config),base={kind:'comments',records:[],works:[],complete:false,progress:{worksCatalogComplete:false}};cache.merge(base);cache.merge({...base,progress:{worksCatalogComplete:false,catalogReadError:'QA CATALOG PAUSED'}});eq(createInteractionCache(config).get().progress.catalogReadError,'QA CATALOG PAUSED');cache.merge(base);eq(createInteractionCache(config).get().progress.catalogReadError,undefined);}finally{assert.equal(path.dirname(folder),fs.realpathSync(os.tmpdir()));assert(path.basename(folder).startsWith('matrix-catalog-isolation-qa-'));fs.rmSync(folder,{recursive:true,force:true});}
 console.log(JSON.stringify({catalogIsolationChecks:checks,badCatalogCursorNotAdvanced:true,noForeignWorkRead:true,knownOwnCommentsAndNewWorkHeadContinue:true,manualRetryOnly:true,ownerAndRefusalGuardsUnchanged:true,warningPersistsAcrossRestart:true,realPlatformRequests:0,realUserProfileTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});

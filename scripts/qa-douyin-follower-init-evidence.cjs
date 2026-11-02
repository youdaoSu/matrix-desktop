// Synthetic public-script addresses and disposable files only, never accounts.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createFollowerInitEvidence}=require('../desktop/douyin-follower-init-evidence.cjs');
const {extractFollowerErrorSites,installFollowerObserver}=require('../desktop/douyin-followers-preload.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-follower-init-evidence-qa-'));
let checks=0,clock=Date.parse('2026-10-24T10:30:00Z');const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const config={directory,version:'2.10.0-rc.187',now:()=>clock,pid:1234},source='https://lf-douyin-pc-web.douyinstatic.com/obj/web/client-entry.1234abcd.js';
const sample={generation:1,phase:'page-startup',category:'type-error',line:1,mask:128,source};
try{
  const error={name:'TypeError',stack:'TypeError: PRIVATE_BODY '+source+':1:22\n    at PRIVATE_FUNCTION ('+source+':1:456)\n    at https://example.invalid/1234abcd.js:1:2\n    at https://lf-douyin-pc-web.douyinstatic.com/api/1234abcd.js:1:3\n    at '+source+':1:456'};
  eq(extractFollowerErrorSites(error),[{source,line:1,column:456,category:'type-error'}]);eq(JSON.stringify(extractFollowerErrorSites(error)).includes('PRIVATE'),false);
  eq(extractFollowerErrorSites({name:'Error',stack:error.stack}),[]);eq(extractFollowerErrorSites({name:'ReferenceError',stack:'PRIVATE_BODY '+source+':1:4'}),[]);
  const vm=require('node:vm'),listeners=new Map(),context={window:{addEventListener:(name,fn)=>listeners.set(name,fn)},location:{origin:'https://www.douyin.com'},URL,Date:{now:()=>clock,parse:Date.parse}};
  vm.runInNewContext(`(${installFollowerObserver.toString()})(()=>{},()=>{},()=>{},{observeTransport:false,captureErrorSites:true},(${extractFollowerErrorSites.toString()}))`,context);
  let cancelled=0;listeners.get('unhandledrejection')({reason:error,preventDefault(){cancelled++;}});eq(context.window.__matrixFollowerObserved.errorSites.length,1);eq(context.window.__matrixFollowerObserved.errorSites[0].phase,'page-startup');eq(cancelled,0);
  context.window.__matrixFollowerObserved.openRequested=true;listeners.get('error')({error,preventDefault(){cancelled++;}});eq(context.window.__matrixFollowerObserved.errorSites.length,2);eq(context.window.__matrixFollowerObserved.errorSites[1].phase,'follower-starting');eq(cancelled,0);
  const kept=context.window.__matrixFollowerObserved.errorSites.length;clock=Date.parse('2026-10-24T13:00:00Z');listeners.get('error')({error:{name:'ReferenceError',stack:error.stack}});eq(context.window.__matrixFollowerObserved.errorSites.length,kept);clock=Date.parse('2026-10-24T10:30:00Z');
  const reader=createFollowerInitEvidence(config),file=path.join(directory,'douyin-follower-init-evidence-rc187.json');
  eq(reader.record({...sample,privateText:'PRIVATE_MESSAGE',uid:'PRIVATE_UID',cookie:'PRIVATE_COOKIE'}),true);eq(reader.snapshot().events.length,1);eq(/PRIVATE/.test(fs.readFileSync(file,'utf8')),false);
  const first=fs.readFileSync(file);eq(reader.record(sample),true);eq(fs.readFileSync(file),first);
  for(const bad of [source+'?cookie=PRIVATE',source+'#PRIVATE','https://example.invalid/1234abcd.js','https://douyinstatic.com.invalid/1234abcd.js','https://lf-douyin-pc-web.douyinstatic.com/api/1234abcd.js','https://lf-douyin-pc-web.douyinstatic.com/unhashed.js','file:///C:/PRIVATE','javascript:PRIVATE'])eq(reader.record({...sample,source:bad}),false);
  for(const bad of [{category:'PRIVATE'},{phase:'PRIVATE'},{line:-1},{line:10000001},{column:-1},{column:100000001},{mask:'PRIVATE'},{generation:0},{generation:'PRIVATE'}])eq(reader.record({...sample,...bad}),false);
  eq(createFollowerInitEvidence({...config,version:'2.10.0-rc.186'}).record(sample),false);
  eq(createFollowerInitEvidence({...config,now:()=>Date.parse('2026-10-24T09:59:59Z')}).record(sample),false);
  eq(createFollowerInitEvidence({...config,now:()=>Date.parse('2026-10-24T13:00:00Z')}).record(sample),false);
  for(let n=2;n<42;n++){clock++;eq(reader.record({...sample,generation:n,phase:'follower-starting'}),true);}
  eq(reader.snapshot().events.length,32);eq(reader.snapshot().events.at(-1).generation,41);eq(fs.statSync(file).size<=32768,true);
  const restored=createFollowerInitEvidence(config);eq(restored.snapshot().events,reader.snapshot().events);
  const before=fs.readFileSync(file),failed=createFollowerInitEvidence({...config,fileSystem:{...fs,renameSync(){throw Object.assign(Error('Synthetic failure'),{code:'EACCES'});}}});eq(failed.record({...sample,generation:42}),false);eq(fs.readFileSync(file),before);eq(fs.readdirSync(directory),['douyin-follower-init-evidence-rc187.json']);
  clock=Date.parse('2026-10-24T13:00:00Z');eq(reader.record({...sample,generation:43}),false);eq(reader.snapshot().enabled,false);eq(fs.readFileSync(file),before);
  clock=Date.parse('2026-10-24T10:30:00Z');fs.writeFileSync(file,'KEEP_INVALID_ORIGINAL');const damaged=createFollowerInitEvidence(config);eq(damaged.snapshot().enabled,false);eq(damaged.record(sample),false);eq(fs.readFileSync(file,'utf8'),'KEEP_INVALID_ORIGINAL');
  console.log(JSON.stringify({followerInitEvidenceChecks:checks,publicHashedScriptSitesOnly:true,noRawErrorOrBusinessContents:true,bounded32EventsAnd32KiB:true,expiresAtBeijing21:true,oldProbesNotEnabled:true,realProfileTouched:false,realPlatformRequests:0}));
}finally{assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('matrix-follower-init-evidence-qa-'));fs.rmSync(directory,{recursive:true,force:true});}

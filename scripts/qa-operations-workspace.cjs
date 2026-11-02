// Offline encrypted manager-control persistence. No platform or user profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {cipher}=require('../desktop/account-operations-crypto.cjs');
const io=require('../desktop/vendor/hengyuan-interactions/src/workspace-data.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yuanxiao-migration-storage-')),key=crypto.randomBytes(32),codec=name=>cipher(key,'qa-owner/'+name);
const file=name=>path.join(directory,name+'.json');let checks=0,release;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=fn=>{assert.throws(fn,/原文件保留/);checks++;};
try{
 reject(()=>io.read(file('interaction-control'),true));release=io.configureEncryptedWorkspace({directory,codecFor:codec});
 eq(io.read(file('interaction-control'),true),null);reject(()=>io.configureEncryptedWorkspace({directory,codecFor:codec}));
 const value={version:1,bindings:{'qa-account':{identity:'100',platform:'douyin'}},channels:{},text:'PRIVATE_BODY',optional:undefined};
 io.write(file('interaction-control'),value);eq(io.read(file('interaction-control')),{version:1,bindings:{'qa-account':{identity:'100',platform:'douyin'}},channels:{},text:'PRIVATE_BODY'});
 const first=fs.readFileSync(file('interaction-control'));eq(first.includes(Buffer.from('PRIVATE_BODY')),false);eq(first.subarray(0,5).toString(),'YXOP1');
 io.write(file('interaction-profiles'),{adapter:'official-page-v1'});const profile=fs.readFileSync(file('interaction-profiles'));
 fs.writeFileSync(file('interaction-control'),profile);reject(()=>io.read(file('interaction-control')));reject(()=>io.write(file('interaction-control'),{version:2}));eq(fs.readFileSync(file('interaction-control')),profile);
 fs.writeFileSync(file('interaction-control'),first);const corrupt=Buffer.from(first);corrupt[corrupt.length-1]^=1;fs.writeFileSync(file('interaction-control'),corrupt);reject(()=>io.read(file('interaction-control')));reject(()=>io.write(file('interaction-control'),{version:2}));eq(fs.readFileSync(file('interaction-control')),corrupt);
 fs.writeFileSync(file('interaction-control'),first);reject(()=>io.write(file('interaction-control'),null));eq(fs.readFileSync(file('interaction-control')),first);
 let getterCalls=0;const getter={};Object.defineProperty(getter,'secret',{get(){getterCalls++;return 'PRIVATE_BODY';},enumerable:true});reject(()=>io.write(file('interaction-control'),getter));eq(getterCalls,0);eq(fs.readFileSync(file('interaction-control')),first);
 const polluted=JSON.parse('{"__proto__":{"polluted":true}}');reject(()=>io.write(file('interaction-control'),polluted));eq({}.polluted,undefined);
 const deep={};let at=deep;for(let i=0;i<34;i++)at=at.next={};reject(()=>io.write(file('interaction-control'),deep));eq(fs.readFileSync(file('interaction-control')),first);
 fs.writeFileSync(file('contacts'),'PRIVATE_BODY');reject(()=>io.read(file('contacts')));reject(()=>io.write(file('contacts'),{contacts:[]}));eq(fs.readFileSync(file('contacts'),'utf8'),'PRIVATE_BODY');
 const sub=path.join(directory,'nested');fs.mkdirSync(sub);reject(()=>io.write(path.join(sub,'control.json'),{version:1}));reject(()=>io.write(path.join(directory,'../escape.json'),{version:1}));reject(()=>io.write(path.join(directory,'wrong.cjs'),{version:1}));
 release();let racing=true;release=io.configureEncryptedWorkspace({directory,codecFor:name=>{const ordinary=codec(name);return{unprotect:ordinary.unprotect,protect(text){const bytes=ordinary.protect(text);if(name==='interaction-control.json'&&racing){racing=false;fs.writeFileSync(file('interaction-control'),ordinary.protect(JSON.stringify({version:9})));}return bytes;}};}});
 reject(()=>io.write(file('interaction-control'),{version:3}));eq(io.read(file('interaction-control')),{version:9});eq(fs.readdirSync(directory).some(name=>name.endsWith('.tmp')),false);
 release();release=io.configureEncryptedWorkspace({directory,codecFor:name=>cipher(crypto.randomBytes(32),'qa-owner/'+name)});reject(()=>io.read(file('interaction-control')));reject(()=>io.write(file('interaction-control'),{version:3}));
 console.log(JSON.stringify({encryptedWorkspaceChecks:checks,ownerAndFileCipherBinding:true,noPlaintextFallback:true,corruptionPreserved:true,concurrentReplacementRefused:true,gettersNeverExecuted:true,installedProfileTouched:false,realPlatformRequests:0}));
}finally{release?.();key.fill(0);assert.equal(path.dirname(directory),fs.realpathSync(os.tmpdir()));assert(path.basename(directory).startsWith('yuanxiao-migration-storage-'));fs.rmSync(directory,{recursive:true,force:true});}

// Large synthetic state only. No installed profile, credentials or networking.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {createStore}=require('../desktop/douyin-inbox-store.cjs'),{createMessageIndex}=require('../desktop/douyin-inbox-index.cjs');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-main-performance-'));let checks=0,writes=0,protects=0,deny='';const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const io={...fs,writeFileSync(...args){if(deny==='write')throw Object.assign(Error('PRIVATE'),{code:'ENOSPC'});writes++;return fs.writeFileSync(...args);},fsyncSync(...args){if(deny==='flush')throw Object.assign(Error('PRIVATE'),{code:'EIO'});return fs.fsyncSync(...args);},renameSync(...args){if(deny==='replace')throw Object.assign(Error('PRIVATE'),{code:'EACCES'});return fs.renameSync(...args);}};
const options={directory:folder,scope:['synthetic','large-performance'],fileSystem:io,protect:s=>{if(deny==='encrypt')throw Error('PRIVATE');protects++;return Buffer.from(s);},unprotect:b=>b.toString()};
try{
 const store=createStore(options),count=42000;
 store.commit(next=>{next.threads.t={id:'t',type:1,history:{cursor:'0',done:true,pages:1}};for(let n=0;n<count;n++)next.messages['t/'+n]={threadId:'t',id:String(n+1),index:String(n),version:'1',text:'x'.repeat(320)};});
 const original=store.get(),index=createMessageIndex(),initial=index.get(original),writeStart=writes,protectStart=protects,idle=[];
 for(let n=0;n<20;n++){const at=performance.now();eq(store.commitEngine(()=>{},['frontier']),original);idle.push(performance.now()-at);}
 eq(writes,writeStart);eq(protects,protectStart);
 const at=performance.now();store.commitEngine(next=>{next.frontier.fixture=[{service:1,name:'qa',value:'1'}];},['frontier']);const changedMs=performance.now()-at;
 eq(store.get().messages,original.messages);assert.equal(store.get().messages,original.messages);checks++;
 eq(index.get(store.get()).all,initial.all);assert.equal(index.get(store.get()).all,initial.all);checks++;
 eq(store.get().revision,original.revision+1);eq(original.frontier,{});eq(writes,writeStart+1);
 const cursorState=store.get();store.commitEngine(next=>{next.frontier.fixture=[{service:1,name:'qa',value:'1'}];},['frontier']);eq(store.get(),cursorState);eq(writes,writeStart+1);
 for(const failure of ['encrypt','write','flush','replace']){
  const before=store.get(),file=path.join(folder,fs.readdirSync(folder).find(name=>name.endsWith('.bin'))),hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');deny=failure;
  assert.throws(()=>store.commitEngine(next=>{next.threads.t.history.pages++;next.messages['t/extra']={threadId:'t',id:'50000',index:'50000'};},['threads','messages']),error=>!error.message.includes('PRIVATE'));checks++;deny='';
  assert.equal(store.get(),before);checks++;eq(before.threads.t.history.pages,1);eq(before.messages['t/extra'],undefined);eq(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);eq(fs.readdirSync(folder).length,1);
 }
 for(const keys of [undefined,['messages','messages'],['__proto__'],['scope']]){assert.throws(()=>store.commitEngine(()=>{},keys));checks++;}
 assert.throws(()=>store.commitEngine(next=>{next.scope='foreign';},['frontier']));checks++;eq(store.get().scope,original.scope);
 store.commitEngine(next=>{next.messages['t/extra']={threadId:'t',id:'50000',index:'50000'};},['messages']);eq(index.get(store.get()).all.length,count+1);eq(index.rows(store.get(),'t').at(-1).id,'50000');
 const reloaded=createStore(options);eq(reloaded.get(),store.get());
 console.log(JSON.stringify({mainArchivePerformanceChecks:checks,syntheticMessages:count,idleMaxBlockingMs:Math.max(...idle),changedBlockingMs:changedMs,unchangedBodyMapReused:true,cursorOnlyIndexReused:true,durableFailureRollback:true,originalFormatRoundtrip:true,realProfileTouched:false,realRequests:0}));
}finally{if(path.dirname(fs.realpathSync(folder))!==fs.realpathSync(os.tmpdir())||!path.basename(folder).startsWith('matrix-main-performance-'))throw Error('Unexpected fixture directory');fs.rmSync(folder,{recursive:true});}

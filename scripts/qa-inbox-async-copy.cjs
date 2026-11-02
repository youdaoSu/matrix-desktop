// Fresh synthetic archives, no user profile or network.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createStore}=require('../desktop/douyin-inbox-store.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-inbox-copy-'));let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function main(){
 try{
  let writes=0;
  const base={scope:['synthetic-copy'],protect:text=>{writes++;return Buffer.from(text);},unprotect:b=>b.toString()};
  const sync=createStore({...base,directory:path.join(root,'sync')}),asyncStore=createStore({...base,directory:path.join(root,'async'),asyncEngine:true});
  const initial=next=>{next.people={};next.threads={a:{history:{cursor:'0'}},b:{history:{cursor:'0'}}};for(let i=0;i<10000;i++)next.messages['t/'+i]={id:String(i),text:'synthetic'};Object.defineProperty(next.messages,'__proto__',{value:{id:'safe'},enumerable:true,writable:true,configurable:true});};
  sync.commit(initial);asyncStore.commit(initial);
  const actions=[
   [next=>{next.messages['t/9999']={id:'9999',text:'new'};},['messages']],
   [next=>{next.threads.a.history.cursor='1';},['threads']],
   [next=>{const a=next.threads.a;delete next.threads.a;next.threads.a=a;},['threads']],
   [next=>{delete next.messages['t/0'];next.messages['appended']={id:'appended'};},['messages']],
   [next=>{next.frontier.test=1;next.people.one={name:'one'};},['frontier','people']],
  ];
  for(const [change,keys]of actions){const old=asyncStore.get(),before=JSON.stringify(old);sync.commitEngine(change,keys);await asyncStore.commitEngineAsync(change,keys);eq(JSON.stringify(old),before);eq(JSON.stringify(asyncStore.get()),JSON.stringify(sync.get()));}
  const old=asyncStore.get(),beforeWrites=writes;await asyncStore.commitEngineAsync(()=>{},['messages','threads','people']);eq(asyncStore.get(),old);assert.equal(asyncStore.get(),old);checks++;eq(writes,beforeWrites);
  eq(Object.getPrototypeOf(asyncStore.get().messages),Object.prototype);eq(Object.hasOwn(asyncStore.get().messages,'__proto__'),true);eq(asyncStore.get().messages.__proto__.id,'safe');
  let guards=0,recipeCalled=false;await assert.rejects(()=>asyncStore.commitEngineAsync(()=>{recipeCalled=true;},['messages'],()=>{if(++guards===3)throw Error('closed');}),/closed/);checks++;eq(recipeCalled,false);eq(asyncStore.get(),old);eq(writes,beforeWrites);
  await assert.rejects(()=>asyncStore.commitEngineAsync(next=>{next.frontier={wrong:true};},['messages']),/超出字段范围/);checks++;eq(asyncStore.get(),old);eq(writes,beforeWrites);
  const reopened=createStore({...base,directory:path.join(root,'async'),asyncEngine:true});eq(JSON.stringify(reopened.get()),JSON.stringify(asyncStore.get()));
  console.log(JSON.stringify({checks,exactSyncSemantics:true,originalNestedStatePreserved:true,prototypeKeySafe:true,cancelBeforeRecipe:true,realData:false}));
 }finally{if(path.dirname(fs.realpathSync(root))!==fs.realpathSync(os.tmpdir())||!path.basename(root).startsWith('matrix-inbox-copy-'))throw Error('Unexpected fixture root');fs.rmSync(root,{recursive:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

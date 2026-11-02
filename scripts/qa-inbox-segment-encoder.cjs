const assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {createStateEncoder}=require('../desktop/douyin-inbox-storage-codec.cjs');
const {decodeArchiveText,LIMIT}=require('../desktop/douyin-inbox-storage-codec.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function main(){
 const encoder=createStateEncoder();
 let state={version:1,scope:'synthetic',threads:{t:{id:'t'}},messages:{},frontier:{v:0},revision:0};
 for(let n=0;n<42000;n++)state.messages['t/'+n]={id:String(n),threadId:'t',text:'synthetic '.repeat(32)};
 let report=await encoder.encode(state);eq(decodeArchiveText(report.text),JSON.stringify(state));eq(report.stats.serializedRecords,42000);report.commit();
 const cold=report.stats;state={...state,frontier:{v:1},revision:1};
 const begin=performance.now();report=await encoder.encode(state);const hotMs=performance.now()-begin;
 eq(decodeArchiveText(report.text),JSON.stringify(state));eq(report.stats.serializedRecords,0);eq(report.stats.reusedRecords,42000);report.commit();
 state={...state,messages:{...state.messages,'t/29':{id:'29',threadId:'t',text:'changed'}}};
 report=await encoder.encode(state);eq(decodeArchiveText(report.text),JSON.stringify(state));eq(report.stats.serializedRecords,256);report.commit();
 delete state.messages;state={...state,messages:{'t/other':{text:'new'},'1':{text:'numeric'},undefined:undefined}};
 report=await encoder.encode(state);eq(report.text,JSON.stringify(state));report.commit();
 const unchanged=await encoder.encode({...state,frontier:{v:2}});eq(unchanged.text,JSON.stringify({...state,frontier:{v:2}}));
 // Never committing a failed disk transaction cannot poison later encoding.
 const aborted=await encoder.encode({...state,messages:{'failed':{text:'must not leak'}}});
 eq((await encoder.encode(state)).text,JSON.stringify(state));eq(aborted.text.includes('must not leak'),true);
 const bounded=createStateEncoder({maxCacheBytes:200,blockRecords:2});
 for(let i=0;i<3;i++){const result=await bounded.encode({messages:Object.fromEntries(Array.from({length:30},(_,n)=>[String(n),{text:String(n)}]))});assert(result.stats.cacheBytes<=200);checks++;result.commit();}
 const mixed=createStateEncoder({maxCacheBytes:400,blockRecords:1}),people={a:{text:'a'},b:{text:'b'},c:{text:'c'}};
 let mixedResult=await mixed.encode({messages:{},people});mixedResult.commit();
 mixedResult=await mixed.encode({messages:{a:{text:'x'.repeat(100)},b:{text:'y'.repeat(100)}},people});assert(mixedResult.stats.cacheBytes<=400);checks++;eq(decodeArchiveText(mixedResult.text),JSON.stringify({messages:{a:{text:'x'.repeat(100)},b:{text:'y'.repeat(100)}},people}));mixedResult.commit();
 const edited={...state,messages:{...state.messages}};delete edited.messages['1'];edited.messages['appended']={text:'after deletion'};eq((await encoder.encode(edited)).text,JSON.stringify(edited));
 const random={messages:{one:{text:randomBytes(800000).toString('base64')}}};eq((await encoder.encode(random)).text,JSON.stringify(random));
 const partial={messages:{a:undefined,b:{text:'b'},c:undefined,d:{text:'d'},e:undefined}},tiny=createStateEncoder({blockRecords:1});let r=await tiny.encode(partial);eq(r.text,JSON.stringify(partial));r.commit();r=await tiny.encode({...partial,messages:{...partial.messages,a:{text:'a'}}});eq(r.text,JSON.stringify({...partial,messages:{...partial.messages,a:{text:'a'}}}));
 let alive=true;const cancelled=createStateEncoder({compress:async text=>{alive=false;return require('node:zlib').gzipSync(text);}});await assert.rejects(()=>cancelled.encode({messages:{}},()=>{if(!alive)throw Error('closed');}),/closed/);checks++;
 await assert.rejects(()=>encoder.encode({messages:{tooLarge:{text:'x'.repeat(LIMIT)}}}),/decoded limit/);checks++;
 encoder.clear();eq(encoder.stats().cacheBytes,0);
 console.log(JSON.stringify({passed:true,checks,cold,hotMs,realData:false,writes:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

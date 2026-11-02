// Synthetic-only catalog failures/recovery; no network or account access.
const assert=require('node:assert/strict'),{loadTs}=require('./qa-load-typescript.cjs');
(async()=>{
 const saved={window:global.window,localStorage:global.localStorage,fetch:global.fetch,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout,now:Date.now};
 let clock=1700000000000,next=0,catalogCalls=0,networkCalls=0,updates=0;const timers=new Map();let unsubscribeA,unsubscribeB,unsubscribeC;
 try{
  Date.now=()=>clock;global.setTimeout=(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;};global.clearTimeout=id=>timers.delete(id);
  global.localStorage={getItem:()=>null,setItem:()=>{}};global.window={matrixDesktop:{douyinEmojiCatalog:async()=>({entries:++catalogCalls===1?[]:[{name:'星星眼',img:'qa-stars'}]})}};
  global.fetch=async()=>{networkCalls++;throw Error('synthetic offline');};
  const emoji=loadTs('client/src/components/workspace/douyin-inline-emoji.ts');unsubscribeA=emoji.subscribeInlineEmoji(()=>updates++);unsubscribeB=emoji.subscribeInlineEmoji(()=>updates++);
  await Promise.all([emoji.loadInlineEmojiCatalog(),emoji.loadInlineEmojiCatalog()]);assert.equal(catalogCalls,1);assert.equal(networkCalls,1);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,60000);assert.equal(Object.keys(emoji.getInlineEmojiCatalog()).length,0);
  await emoji.loadInlineEmojiCatalog();assert.equal(catalogCalls,1);unsubscribeA();unsubscribeB();assert.equal(timers.size,0);
  unsubscribeC=emoji.subscribeInlineEmoji(()=>updates++);await emoji.loadInlineEmojiCatalog();assert.equal(catalogCalls,1);assert.equal(timers.size,1);
  clock+=60000;const [id,timer]=[...timers][0];timers.delete(id);timer.fn();for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(catalogCalls,2);assert.equal(networkCalls,1);assert.equal(updates,1);assert.match(emoji.getInlineEmojiCatalog()['[星星眼]'],/qa-stars-3x\.png$/);assert.equal(timers.size,0);
  console.log(JSON.stringify({emojiRetryChecks:14,oneSharedRetryTimer:true,boundedCooldown:true,noCredentialsOrRealRequests:true}));
 }finally{unsubscribeA?.();unsubscribeB?.();unsubscribeC?.();Date.now=saved.now;global.window=saved.window;global.localStorage=saved.localStorage;global.fetch=saved.fetch;global.setTimeout=saved.setTimeout;global.clearTimeout=saved.clearTimeout;}
})().catch(error=>{console.error(error);process.exitCode=1;});

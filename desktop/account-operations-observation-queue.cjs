'use strict';
// Bounded intake for already authenticated source events.
// Never retries a failed operation. It is not a platform sending queue.
const {createHash}=require('node:crypto');
class ObservationQueue {
 #items=new Map();#bytes=0;#running=null;#closed=false;#idleWaiters=new Set();
 constructor({process,isCurrent,onFailure=()=>{},processBatch,batchable=()=>false,maxItems=512,maxBytes=4*1024*1024,maxItemBytes=512*1024}){
  if([process,isCurrent,onFailure].some(f=>typeof f!=='function'))throw Error('Invalid observation queue callbacks');
  for(const n of [maxItems,maxBytes,maxItemBytes])if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid observation queue capacity');
  if(maxItems>4096||maxBytes>16*1024*1024||maxItemBytes>maxBytes)throw Error('Observation queue capacity exceeds bound');
  if(processBatch!==undefined&&typeof processBatch!=='function'||typeof batchable!=='function')throw Error('Invalid batch callbacks');
  Object.assign(this,{process,isCurrent,onFailure,processBatch,batchable,maxItems,maxBytes,maxItemBytes});
 }
 #report(reason){try{this.onFailure(reason);}catch{/* Reporting must not break draining. */}}
 #admit(input){
  if(this.#closed)return null;
  let json,bytes,key,value;
  try{json=JSON.stringify(input);bytes=Buffer.byteLength(json,'utf8');if(bytes>this.maxItemBytes){this.#report('item-too-large');return null;}key=createHash('sha256').update(json).digest('hex');if(this.#items.has(key))return this.#items.get(key);value=JSON.parse(json);if(!this.isCurrent(value))return null;}
  catch{this.#report('invalid-event');return null;}
  if(this.#items.size>=this.maxItems||this.#bytes+bytes>this.maxBytes){this.#report('capacity');return null;}
  const item={value,bytes};this.#items.set(key,item);this.#bytes+=bytes;this.#kick();return item;
 }
 enqueue(input){return Boolean(this.#admit(input));}
 enqueueAndWait(input){
  const item=this.#admit(input);if(!item)return Promise.resolve(false);
  // Duplicates share one bounded completion promise, including in-flight rows.
  if(!item.done)item.done=new Promise(resolve=>{item.resolve=resolve;});return item.done;
 }
 waitUntilIdle(signal){
  if(this.#closed||signal?.aborted)return Promise.resolve(false);
  if(!this.#running&&!this.#items.size)return Promise.resolve(true);
  if(this.#idleWaiters.size>=8){this.#report('producer-capacity');return Promise.resolve(false);}
  return new Promise(resolve=>{const finish=ready=>{this.#idleWaiters.delete(finish);signal?.removeEventListener('abort',abort);resolve(ready);},abort=()=>finish(false);this.#idleWaiters.add(finish);signal?.addEventListener('abort',abort,{once:true});});
 }
 #settleIdle(ready){for(const resolve of this.#idleWaiters)resolve(ready);this.#idleWaiters.clear();}
 #kick(){
  if(this.#running||this.#closed||!this.#items.size)return;
  this.#running=Promise.resolve().then(()=>this.#drain()).finally(()=>{this.#running=null;if(!this.#closed&&this.#items.size)this.#kick();else this.#settleIdle(!this.#closed);});
 }
 async #drain(){
  while(!this.#closed&&this.#items.size){
   const first=this.#items.entries().next().value,group=[first],currentItems=new Set();let completed=false;
   try{
    let bytes=first[1].bytes;
    if(this.processBatch&&this.batchable(first[1].value))for(const entry of this.#items){
     if(entry[0]===first[0])continue;
     if(group.length>=16||bytes+entry[1].bytes>256*1024)break;
     // A failed eligibility callback must not discard earlier valid events.
     try{if(!this.batchable(entry[1].value))break;}catch{break;}
     group.push(entry);bytes+=entry[1].bytes;
    }
    const current=[];
    for(const [,item]of group)try{if(this.isCurrent(item.value)){current.push(item.value);currentItems.add(item);}}catch{this.#report('processing-failed');}
    if(!this.#closed){if(current.length>1)await this.processBatch(current);else if(current.length===1)await this.process(current[0]);}
    completed=!this.#closed;
   }
   catch{this.#report('processing-failed');}
   finally{for(const [key,item]of group){let confirmed=false;try{confirmed=completed&&currentItems.has(item)&&this.isCurrent(item.value);}catch{this.#report('processing-failed');}item.resolve?.(confirmed);if(this.#items.get(key)===item){this.#items.delete(key);this.#bytes-=item.bytes;}}}
  }
 }
 get pending(){return this.#items.size;}
 get bufferedBytes(){return this.#bytes;}
 close(){this.#closed=true;for(const item of this.#items.values())item.resolve?.(false);this.#items.clear();this.#bytes=0;this.#settleIdle(false);}
 async idle(){if(this.#running)await this.#running;}
}
module.exports={ObservationQueue};

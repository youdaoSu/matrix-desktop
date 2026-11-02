// Isolated files and synthetic raster bytes; no user profile or platform calls.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createDisplayImageCache,createAsyncDisplayImageCache}=require('../desktop/douyin-display-image-cache.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-image-async-qa-'));
const png=Buffer.from('iVBORw0KGgoAAAANSEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zy8QAAAAASUVORK5CYII=','base64');
const image={dataUrl:'data:image/png;base64,'+png.toString('base64'),bytes:png.length},key=crypto.randomBytes(32),a='a'.repeat(64),b='b'.repeat(64);
const protect=text=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(text,'utf8'),cipher.final(),cipher.getAuthTag()]);};
const unprotect=bytes=>{const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8');};
const config=name=>({directory:path.join(root,name),protect,unprotect});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rejected=async(promise,pattern)=>{await assert.rejects(promise,pattern);checks++;};
module.exports=(async()=>{try{
  const legacy=createDisplayImageCache(config('compat'));legacy.put('owner',a,image);
  const cache=createAsyncDisplayImageCache(config('compat'));
  eq(await cache.getAsync('owner',a),image);eq(await cache.getAsync('other-owner',a),undefined);
  eq(await cache.putAsync('owner',a,image),{stored:true,alreadyStored:true});
  eq(await cache.putAsync('owner',b,image),{stored:true,alreadyStored:false});
  eq(createDisplayImageCache(config('compat')).get('owner',b),image);
  for(const file of fs.readdirSync(config('compat').directory)){eq(fs.readFileSync(path.join(config('compat').directory,file)).includes(Buffer.from('data:image/')),false);}
  const concurrent=createAsyncDisplayImageCache(config('concurrent'));
  const results=await Promise.all(Array.from({length:30},()=>concurrent.putAsync('owner',a,image)));
  eq(results.filter(v=>!v.alreadyStored).length,1);eq(fs.readdirSync(config('concurrent').directory).length,1);
  const limited=createAsyncDisplayImageCache({...config('limited'),maxFiles:1});
  const limits=await Promise.allSettled([limited.putAsync('owner',a,image),limited.putAsync('owner',b,image)]);
  eq(limits.map(v=>v.status),['fulfilled','rejected']);eq(fs.readdirSync(config('limited').directory).length,1);
  const bad=createAsyncDisplayImageCache({...config('compat'),unprotect(){throw Error('synthetic corruption');}});
  const original=fs.readdirSync(config('compat').directory).map(file=>fs.readFileSync(path.join(config('compat').directory,file)).toString('hex'));
  await rejected(bad.putAsync('owner',a,image),/原文件保留/);
  eq(fs.readdirSync(config('compat').directory).map(file=>fs.readFileSync(path.join(config('compat').directory,file)).toString('hex')),original);
  const denied=createAsyncDisplayImageCache({...config('denied'),io:{...fs.promises,rename:async()=>{throw Error('synthetic rename failure');}}});
  await rejected(denied.putAsync('owner',a,image),/保存失败/);eq(fs.readdirSync(config('denied').directory),[]);
  let current=true,synced=false;
  const cancelled=createAsyncDisplayImageCache({...config('cancelled'),io:{...fs.promises,open:async(...args)=>{
    const handle=await fs.promises.open(...args);return {writeFile:handle.writeFile.bind(handle),close:handle.close.bind(handle),sync:async()=>{await handle.sync();synced=true;current=false;}};
  }}});
  await rejected(cancelled.putAsync('owner',a,image,()=>{if(!current)throw Error('binding changed');}),/保存失败/);
  eq(synced,true);eq(fs.readdirSync(config('cancelled').directory),[]);
  let ack=false,ticks=0,syncDone=false;const timer=setInterval(()=>ticks++,2);
  const slow=createAsyncDisplayImageCache({...config('slow'),io:{...fs.promises,open:async(...args)=>{
    const handle=await fs.promises.open(...args);return {writeFile:handle.writeFile.bind(handle),close:handle.close.bind(handle),sync:async()=>{await delay(45);eq(ack,false);await handle.sync();syncDone=true;}};
  }}});
  try{await slow.putAsync('owner',a,image);ack=true;}finally{clearInterval(timer);}
  eq(syncDone,true);assert.ok(ticks>=3,'UI timer must run while disk sync waits');checks++;
  let reads=0;const clear=createAsyncDisplayImageCache({...config('compat'),io:{...fs.promises,open:async(...args)=>{reads++;await delay(5);return fs.promises.open(...args);}}});
  const reading=clear.getAsync('owner',a);clear.clearMemory();await reading;await clear.getAsync('owner',a);eq(reads,2);
  await rejected(cache.getAsync('owner','../bad'),/身份无效/);
  const bounded=createAsyncDisplayImageCache(config('bounded'));
  let release;const gate=new Promise(resolve=>release=resolve);
  const first=bounded.getAsync('owner',a,()=>gate);
  const pending=Array.from({length:127},()=>bounded.getAsync('owner',a));
  await rejected(bounded.getAsync('owner',a),/队列繁忙/);release();await Promise.all([first,...pending]);
  console.log(JSON.stringify({asyncImageCacheChecks:checks,diskWaitTimerTicks:ticks,legacyFormatReadable:true,concurrentWritesSerialized:true,fsyncBeforeAcknowledgement:true,cancelledWriteNotCommitted:true,queueBound:128,networkRequests:0,realUserDataTouched:false}));
}finally{
  assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('matrix-image-async-qa-'));fs.rmSync(root,{recursive:true});
}})();

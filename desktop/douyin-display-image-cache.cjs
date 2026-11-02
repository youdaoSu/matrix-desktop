// Owner-scoped encrypted raster cache. Immutable resource keys; no eviction of
// disk history, credentials, URLs, network calls or renderer-supplied file paths.
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {mime,MAX}=require('./douyin-inbox-media.cjs');
const MAX_FILE=12*1024*1024;
function imageValue(value){
  if(!Number.isSafeInteger(value?.bytes)||value.bytes<=0||value.bytes>MAX||typeof value.dataUrl!=='string'||value.dataUrl.length>Math.ceil(MAX/3)*4+128)throw Error('本机图片数据结构无效，原文件保留');
  const match=/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.dataUrl);if(!match)throw Error('本机图片格式未通过校验，原文件保留');
  const bytes=Buffer.from(match[2],'base64');if(bytes.length!==value.bytes||bytes.toString('base64')!==match[2]||mime(bytes)!==match[1])throw Error('本机图片内容未通过校验，原文件保留');
  return {dataUrl:value.dataUrl,bytes:value.bytes};
}
function createDisplayImageCache({directory,protect,unprotect,io=fs,maxDiskBytes=512*1024*1024,maxFiles=10000,maxMemoryBytes=32*1024*1024,now=Date.now}){
  if(typeof protect!=='function'||typeof unprotect!=='function')throw Error('本机图片加密不可用，未保存明文');
  directory=path.resolve(directory);try{io.mkdirSync(directory,{recursive:true});const folder=io.lstatSync(directory);if(!folder.isDirectory()||folder.isSymbolicLink())throw Error();}catch{throw Error('图片缓存目录不可用或不安全，未读写原有内容');}
  const memory=new Map();let memoryBytes=0,usage;
  const keyFor=(scope,fingerprint)=>{if(typeof scope!=='string'||!scope||scope.length>4096||!/^[a-f0-9]{64}$/.test(fingerprint||''))throw Error('图片缓存身份无效');return createHash('sha256').update(JSON.stringify([scope,fingerprint])).digest('hex');};
  const remember=(key,value)=>{const old=memory.get(key);if(old){memoryBytes-=old.bytes;memory.delete(key);}while(memoryBytes+value.bytes>maxMemoryBytes&&memory.size){const first=memory.keys().next().value;memoryBytes-=memory.get(first).bytes;memory.delete(first);}if(value.bytes<=maxMemoryBytes){memory.set(key,value);memoryBytes+=value.bytes;}};
  const inspect=()=>{let count=0,bytes=0;for(const entry of io.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name),stat=io.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('图片缓存中存在未知目录或链接，未覆盖原文件');count++;bytes+=stat.size;}return{count,bytes};};
  const get=(scope,fingerprint)=>{
    const key=keyFor(scope,fingerprint);if(memory.has(key)){const value=memory.get(key);remember(key,value);return {...value};}
    const file=path.join(directory,key+'.bin');let stat;try{stat=io.lstatSync(file);}catch(error){if(error?.code==='ENOENT')return;throw Error('本机图片缓存状态无法确认，原文件保留');}
    try{if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE)throw Error();const value=JSON.parse(unprotect(io.readFileSync(file)));if(value.version!==1||value.key!==key||value.fingerprint!==fingerprint)throw Error();const attachment=imageValue(value.attachment);remember(key,attachment);return {...attachment};}catch{throw Error('本机图片缓存读取或解密校验失败，原文件保留');}
  };
  return {get,put(scope,fingerprint,raw){
    const attachment=imageValue(raw),key=keyFor(scope,fingerprint),file=path.join(directory,key+'.bin');
    // Never overwrite a corrupt cache or silently replace bytes attached to
    // the same immutable source key. A fresh source fingerprint gets a new file.
    const existing=get(scope,fingerprint);if(existing){if(existing.dataUrl!==attachment.dataUrl)throw Error('图片资源与已有缓存不一致，原文件保留');return {stored:true,alreadyStored:true};}
    const text=JSON.stringify({version:1,key,fingerprint,cachedAt:now(),attachment});let bytes;
    try{bytes=protect(text);if(!Buffer.isBuffer(bytes)||bytes.length>MAX_FILE)throw Error();}catch{throw Error('本机图片加密失败，未保存明文，原文件保留');}
    usage ||= inspect();if(usage.count>=maxFiles||usage.bytes+bytes.length>maxDiskBytes)throw Error('本机图片缓存达到容量上限，已有图片保留');
    if(typeof io.statfsSync==='function'){const disk=io.statfsSync(directory);if(disk.bavail*disk.bsize<bytes.length+64*1024*1024)throw Error('本机空间不足，未写入图片缓存');}
    let fd,created=false;const temporary=path.join(directory,key+'.'+randomUUID()+'.tmp');
    try{fd=io.openSync(temporary,'wx',0o600);created=true;io.writeFileSync(fd,bytes);io.fsyncSync(fd);io.closeSync(fd);fd=undefined;if(io.existsSync(file))throw Error();io.renameSync(temporary,file);usage.count++;usage.bytes+=bytes.length;remember(key,attachment);return {stored:true,alreadyStored:false};}
    catch{throw Error('本机图片缓存保存失败，原有文件保留');}
    finally{if(fd!==undefined)try{io.closeSync(fd);}catch{}if(created&&io.existsSync(temporary))try{io.unlinkSync(temporary);}catch{}}
  },clearMemory(){memory.clear();memoryBytes=0;}};
}
// Async disk path for UI-facing readers. One bounded queue owns capacity checks
// and atomic replacements; native encryption remains synchronous and measured
// separately. The legacy synchronous API is retained for offline compatibility.
function createAsyncDisplayImageCache({directory,protect,unprotect,io=fs.promises,maxDiskBytes=512*1024*1024,maxFiles=10000,maxMemoryBytes=32*1024*1024,now=Date.now}){
  if(typeof protect!=='function'||typeof unprotect!=='function')throw Error('本机图片加密不可用，未保存明文');
  directory=path.resolve(directory);
  let ready,tail=Promise.resolve(),pending=0,usage,memoryBytes=0,generation=0;
  const memory=new Map();
  const keyFor=(scope,fingerprint)=>{if(typeof scope!=='string'||!scope||scope.length>4096||!/^[a-f0-9]{64}$/.test(fingerprint||''))throw Error('图片缓存身份无效');return createHash('sha256').update(JSON.stringify([scope,fingerprint])).digest('hex');};
  const initialize=()=>ready ||= (async()=>{try{await io.mkdir(directory,{recursive:true});const stat=await io.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error();}catch{throw Error('图片缓存目录不可用或不安全，未读写原有内容');}})();
  const enqueue=task=>{if(pending>=128)return Promise.reject(Error('图片缓存队列繁忙，请稍后重试'));pending++;const job=tail.then(task);tail=job.catch(()=>{}).finally(()=>{pending--;});return job;};
  const remember=(key,value,epoch)=>{if(epoch!==generation)return;const old=memory.get(key);if(old){memoryBytes-=old.bytes;memory.delete(key);}while(memoryBytes+value.bytes>maxMemoryBytes&&memory.size){const first=memory.keys().next().value;memoryBytes-=memory.get(first).bytes;memory.delete(first);}if(value.bytes<=maxMemoryBytes){memory.set(key,value);memoryBytes+=value.bytes;}};
  const inspect=async()=>{let count=0,bytes=0;const entries=await io.readdir(directory,{withFileTypes:true});for(let offset=0;offset<entries.length;offset+=4){const stats=await Promise.all(entries.slice(offset,offset+4).map(entry=>io.lstat(path.join(directory,entry.name))));for(const stat of stats){if(!stat.isFile()||stat.isSymbolicLink())throw Error('图片缓存中存在未知目录或链接，未覆盖原文件');count++;bytes+=stat.size;}}return{count,bytes};};
  const read=async(scope,fingerprint,guard,epoch)=>{
    const key=keyFor(scope,fingerprint);await guard();await initialize();
    if(memory.has(key)){const value=memory.get(key);remember(key,value,epoch);return {...value};}
    const file=path.join(directory,key+'.bin');let stat;
    try{stat=await io.lstat(file);}catch(error){if(error?.code==='ENOENT')return;throw Error('本机图片缓存状态无法确认，原文件保留');}
    let attachment;
    try{if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE)throw Error();const handle=await io.open(file,'r');let bytes;try{const actual=await handle.stat();if(!actual.isFile()||actual.size>MAX_FILE)throw Error();bytes=await handle.readFile();}finally{await handle.close();}if(bytes.length>MAX_FILE)throw Error();const value=JSON.parse(unprotect(bytes));if(value.version!==1||value.key!==key||value.fingerprint!==fingerprint)throw Error();attachment=imageValue(value.attachment);}catch{throw Error('本机图片缓存读取或解密校验失败，原文件保留');}
    await guard();remember(key,attachment,epoch);return {...attachment};
  };
  return {
    getAsync(scope,fingerprint,guard=()=>{}){const epoch=generation;return enqueue(()=>read(scope,fingerprint,guard,epoch));},
    putAsync(scope,fingerprint,raw,guard=()=>{}){const epoch=generation;return enqueue(async()=>{
      const attachment=imageValue(raw),key=keyFor(scope,fingerprint),file=path.join(directory,key+'.bin');
      const existing=await read(scope,fingerprint,guard,epoch);if(existing){if(existing.dataUrl!==attachment.dataUrl)throw Error('图片资源与已有缓存不一致，原文件保留');return {stored:true,alreadyStored:true};}
      usage ||= await inspect();await guard();
      const text=JSON.stringify({version:1,key,fingerprint,cachedAt:now(),attachment});let bytes;
      try{bytes=protect(text);if(!Buffer.isBuffer(bytes)||bytes.length>MAX_FILE)throw Error();}catch{throw Error('本机图片加密失败，未保存明文，原文件保留');}
      if(usage.count>=maxFiles||usage.bytes+bytes.length>maxDiskBytes)throw Error('本机图片缓存达到容量上限，已有图片保留');
      if(typeof io.statfs==='function'){const disk=await io.statfs(directory);if(disk.bavail*disk.bsize<bytes.length+64*1024*1024)throw Error('本机空间不足，未写入图片缓存');}
      let handle,created=false;const temporary=path.join(directory,key+'.'+randomUUID()+'.tmp');
      try{await guard();handle=await io.open(temporary,'wx',0o600);created=true;await handle.writeFile(bytes);await handle.sync();await handle.close();handle=undefined;await guard();let exists=false;try{await io.lstat(file);exists=true;}catch(error){if(error?.code!=='ENOENT')throw error;}if(exists)throw Error();await io.rename(temporary,file);created=false;usage.count++;usage.bytes+=bytes.length;remember(key,attachment,epoch);return {stored:true,alreadyStored:false};}
      catch{throw Error('本机图片缓存保存失败，原有文件保留');}
      finally{if(handle)try{await handle.close();}catch{}if(created)try{await io.unlink(temporary);}catch{}}
    });},
    clearMemory(){generation++;memory.clear();memoryBytes=0;}
  };
}
function createSecureDisplayImageCache({directory,safeStorage,...options}){
  let cache,asyncCache;
  const available=()=>{if(!safeStorage?.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('本机图片安全加密不可用，不会保存明文');return cache ||= createDisplayImageCache({...options,directory,protect:value=>safeStorage.encryptString(value),unprotect:bytes=>safeStorage.decryptString(bytes)});};
  const availableAsync=()=>{if(!safeStorage?.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('本机图片安全加密不可用，不会保存明文');return asyncCache ||= createAsyncDisplayImageCache({...options,directory,protect:value=>safeStorage.encryptString(value),unprotect:bytes=>safeStorage.decryptString(bytes)});};
  return {get:(scope,fingerprint)=>available().get(scope,fingerprint),put:(scope,fingerprint,value)=>available().put(scope,fingerprint,value),getAsync:(...args)=>availableAsync().getAsync(...args),putAsync:(...args)=>availableAsync().putAsync(...args),clearMemory:()=>{cache?.clearMemory();asyncCache?.clearMemory();}};
}
module.exports={createDisplayImageCache,createAsyncDisplayImageCache,createSecureDisplayImageCache,imageValue};



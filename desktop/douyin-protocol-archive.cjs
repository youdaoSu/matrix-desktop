// Durable encrypted overflow for unsupported receive events. Original events in
// the chat store remain untouched. Saving an event is NOT a read receipt.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const LIMIT=128*1024*1024,SEGMENT=8*1024*1024,COUNT=512;
function createProtocolArchive({directory,key,protect,unprotect,fileSystem=fs}){
 if(!/^[a-f0-9]{64}$/.test(key))throw Error('推送事件存档范围无效');
 const folder=path.join(directory,'events-'+key),segments=[],hashes=new Set();let loaded=false,total=0;
 const valid=event=>event&&Number.isSafeInteger(event.at)&&event.at>=0&&Number.isSafeInteger(event.cmd)&&/^[a-f0-9]{64}$/.test(event.hash)&&event.normalized===true&&typeof event.frame==='string'&&event.frame.length>0&&event.frame.length<=6*1024*1024&&/^[A-Za-z0-9+/]+={0,2}$/.test(event.frame)&&crypto.createHash('sha256').update(Buffer.from(event.frame,'base64')).digest('hex')===event.hash&&Object.keys(event).every(k=>['at','cmd','hash','frame','normalized'].includes(k));
 const fileAt=index=>path.join(folder,String(index).padStart(3,'0')+'.bin');
 function load(){
  if(loaded)return;
  try{
   if(fileSystem.existsSync(folder)){
    const parent=fileSystem.lstatSync(folder);if(!parent.isDirectory()||parent.isSymbolicLink())throw Error();
    const names=fileSystem.readdirSync(folder).sort();if(names.length>COUNT||names.some((name,i)=>name!==String(i).padStart(3,'0')+'.bin'))throw Error();
    for(let i=0;i<names.length;i++){
     const file=fileAt(i),stat=fileSystem.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>SEGMENT+4096)throw Error();
     total+=stat.size;if(total>LIMIT)throw Error();
     const value=JSON.parse(unprotect(fileSystem.readFileSync(file)));
     if(value.version!==1||value.scope!==key||!Array.isArray(value.events)||!value.events.length||value.events.length>128||!value.events.every(valid))throw Error();
     for(const event of value.events){if(hashes.has(event.hash))throw Error();hashes.add(event.hash);}
     segments.push({...(i===names.length-1?{events:value.events}:{}),bytes:stat.size});
    }
   }
   loaded=true;
  }catch{segments.length=0;hashes.clear();total=0;throw Error('抖音推送事件存档读取或解密失败，原文件保留；未确认推送');}
 }
 return {count:()=>hashes.size,append(event){
  if(!valid(event))throw Error('抖音推送事件结构无效，未确认推送');load();if(hashes.has(event.hash))return false;
  let index=Math.max(0,segments.length-1),old=segments[index],events=[...(old?.events||[]),event];
  const encode=rows=>JSON.stringify({version:1,scope:key,events:rows});
  let plain=encode(events);
  if(old&&(events.length>128||Buffer.byteLength(plain)>SEGMENT)){index++;old=undefined;events=[event];plain=encode(events);}
  if(index>=COUNT||Buffer.byteLength(plain)>SEGMENT)throw Error('抖音推送事件加密存档达到安全容量，未丢弃事件或确认推送');
  let bytes;try{bytes=protect(plain);}catch{throw Error('抖音推送事件存档加密失败，原文件保留；未确认推送');}
  if(!Buffer.isBuffer(bytes)||bytes.length>SEGMENT+4096||total-(old?.bytes||0)+bytes.length>LIMIT)throw Error('抖音推送事件加密存档达到安全容量，未丢弃事件或确认推送');
  const temporary=path.join(folder,crypto.randomUUID()+'.tmp');let fd,created=false;
  try{
   fileSystem.mkdirSync(folder,{recursive:true});fd=fileSystem.openSync(temporary,'wx',0o600);created=true;fileSystem.writeFileSync(fd,bytes);fileSystem.fsyncSync(fd);fileSystem.closeSync(fd);fd=undefined;fileSystem.renameSync(temporary,fileAt(index));
   total=total-(old?.bytes||0)+bytes.length;segments[index]={events,bytes:bytes.length};if(index>0)delete segments[index-1].events;hashes.add(event.hash);return true;
  }catch{throw Error('抖音推送事件存档写入失败，原文件保留；未确认推送');}
  finally{if(fd!==undefined)try{fileSystem.closeSync(fd);}catch{}if(created)try{fileSystem.unlinkSync(temporary);}catch{}}
 }};
}
module.exports={createProtocolArchive};

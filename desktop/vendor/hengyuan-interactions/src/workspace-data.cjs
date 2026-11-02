'use strict';
// Matrix adaptation: the imported managers use only read/write. No upstream
// plaintext store, restore command, login, or publishing implementation runs.
// Every production directory must first receive its owner/file-bound cipher.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const directories=new Map(),MAX=24*1024*1024;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const failed=stage=>Object.assign(Error(`账号运营业务存档${stage}失败；原文件保留，不会明文保存或自动覆盖`),{code:'SECURE_WORKSPACE'});
function directory(value){const stat=fs.lstatSync(value);if(!stat.isDirectory()||stat.isSymbolicLink())throw failed('目录核验');return stat;}
function configureEncryptedWorkspace({directory:folder,codecFor}){
 if(typeof folder!=='string'||!path.isAbsolute(folder)||typeof codecFor!=='function')throw failed('初始化');
 const stat=directory(folder),real=fs.realpathSync(folder);if(directories.has(real))throw failed('重复初始化');
 const entry={real,stat,codecFor};directories.set(real,entry);
 return()=>{if(directories.get(real)===entry)directories.delete(real);};
}
function context(file){
 if(typeof file!=='string'||!path.isAbsolute(file)||!/^([a-z][a-z0-9-]{0,79})\.json$/.test(path.basename(file)))throw failed('路径核验');
 const parent=path.dirname(file),stat=directory(parent),real=fs.realpathSync(parent),entry=directories.get(real);
 if(!entry||!same(stat,entry.stat))throw failed('加密设置核验');
 const name=path.basename(file),codec=entry.codecFor(name);
 if(typeof codec?.protect!=='function'||typeof codec?.unprotect!=='function')throw failed('加密设置核验');
 return{...entry,file:path.join(real,name),codec};
}
function assertDirectory(entry){if(!same(directory(entry.real),entry.stat))throw failed('目录核验');}
function plain(value){
 const pending=[[value,0]];let nodes=0;
 while(pending.length){const [item,depth]=pending.pop();if(++nodes>500000||depth>32)throw failed('结构容量核验');
  if(item===null||item===undefined||typeof item==='string'||typeof item==='boolean')continue;
  if(typeof item==='number'&&Number.isFinite(item))continue;
  if(!item||typeof item!=='object')throw failed('结构核验');
  const prototype=Object.getPrototypeOf(item);if(Array.isArray(item)?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw failed('结构核验');
  for(const name of Object.keys(item)){if(['__proto__','constructor','prototype'].includes(name))throw failed('结构核验');const field=Object.getOwnPropertyDescriptor(item,name);if(!field||field.get||field.set)throw failed('结构核验');pending.push([field.value,depth+1]);}
 }
 return value;
}
function readBytes(entry,optional){
 assertDirectory(entry);let stat;
 try{stat=fs.lstatSync(entry.file);}catch(error){if(optional&&error.code==='ENOENT')return null;throw failed('读取');}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX+4096)throw failed('文件核验');
 let fd;
 try{
  fd=fs.openSync(entry.file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));const opened=fs.fstatSync(fd);if(!same(opened,stat)||opened.size!==stat.size)throw failed('读取核验');
  const bytes=fs.readFileSync(fd);if(bytes.length!==stat.size||!same(fs.fstatSync(fd),stat)||fs.fstatSync(fd).mtimeMs!==opened.mtimeMs)throw failed('读取核验');assertDirectory(entry);
  return bytes;
 }catch{throw failed('读取或解密');}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function load(entry,optional){
 const bytes=readBytes(entry,optional);if(bytes===null)return null;
 try{
  const hash=digest(bytes),text=entry.codec.unprotect(bytes);if(typeof text!=='string'||Buffer.byteLength(text)>MAX)throw failed('解密容量核验');
  return{value:plain(JSON.parse(text)),hash};
 }catch{throw failed('读取或解密');}
}
function read(file,optional=false){return load(context(file),optional)?.value??null;}
function write(file,value,options){
 if(value===null||value===undefined)throw failed('空值写入核验');plain(value);const text=JSON.stringify(value);if(Buffer.byteLength(text)>MAX)throw failed('容量核验');
 const entry=context(file),previous=load(entry,true);
 if(options!==undefined){if(!options||!Object.hasOwn(options,'expected')||Object.keys(options).length!==1)throw failed('写入版本核验');plain(options.expected);if(JSON.stringify(previous?.value??null)!==JSON.stringify(options.expected))throw failed('旧版本写入核验');}
 const bytes=entry.codec.protect(text);if(!Buffer.isBuffer(bytes)||bytes.length>MAX+4096)throw failed('加密容量核验');
 const temporary=path.join(entry.real,'.operations-'+crypto.randomUUID()+'.tmp');let fd,created=false;
 try{
  fd=fs.openSync(temporary,'wx',0o600);created=true;fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;assertDirectory(entry);
  // The previous bytes were authenticated and structurally validated above.
  // Re-read with the same path/handle/size checks; identical encrypted bytes
  // need no second decrypt, decompression, JSON parse or object traversal.
  const current=readBytes(entry,true);if((current===null?undefined:digest(current))!==previous?.hash)throw failed('并发写入核验');
  fs.renameSync(temporary,entry.file);created=false;
 }catch{throw failed('写入');}finally{if(fd!==undefined)fs.closeSync(fd);if(created)try{fs.unlinkSync(temporary);}catch{}}
}
module.exports={read,write,configureEncryptedWorkspace};

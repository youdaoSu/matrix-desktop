// Temporary public static-script evidence only. No requests, bodies, account
// references, query strings, headers, cookie access, page dumps or execution.
const fs=require('node:fs'),path=require('node:path');
function publicScript(value){
  if(typeof value!=='string'||value.length>2048)return;
  try{const u=new URL(value),file=path.posix.basename(u.pathname);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!/(?:^|\.)(?:douyinstatic\.com|douyincdn\.com|bytescm\.com|bytegoofy\.com)$/.test(u.hostname)||/\/(?:api|aweme|passport|im)\//i.test(u.pathname)||!/(?:^|[._-])[a-f0-9]{8,64}(?=[._-]|\.js$)/i.test(file)||!file.endsWith('.js'))return;return u.href;}catch{}
}
function createPublicAssetManifest({directory,version,now=Date.now,fileSystem=fs}){
  const file=path.join(directory,'douyin-public-assets-rc174.json'),assets=new Set();let disabled=false;
  const allowed=()=>version==='2.10.0-rc.174'&&now()>=Date.parse('2026-10-23T16:00:00Z')&&now()<Date.parse('2026-10-24T03:00:00Z');
  if(allowed())try{if(fileSystem.existsSync(file)){const stat=fileSystem.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error();const old=JSON.parse(fileSystem.readFileSync(file,'utf8'));if(Object.keys(old).sort().join(',')!=='assets,purpose,version'||old.version!==1||old.purpose!=='public-static-script-only'||!Array.isArray(old.assets)||old.assets.length>96||old.assets.some(url=>publicScript(url)!==url))throw Error();old.assets.forEach(url=>assets.add(url));}}catch{disabled=true;}
  return {record(value){
    const url=publicScript(value);if(disabled||!allowed()||!url||assets.has(url)||assets.size>=96)return false;
    const next=[...assets,url],bytes=Buffer.from(JSON.stringify({version:1,purpose:'public-static-script-only',assets:next}));if(bytes.length>32768)return false;
    const temp=file+'.tmp';let fd,created=false;
    try{fileSystem.mkdirSync(directory,{recursive:true});const stat=fileSystem.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error();fd=fileSystem.openSync(temp,'wx',0o600);created=true;fileSystem.writeFileSync(fd,bytes);fileSystem.fsyncSync(fd);fileSystem.closeSync(fd);fd=undefined;fileSystem.renameSync(temp,file);assets.add(url);return true;}catch{return false;}finally{if(fd!==undefined)try{fileSystem.closeSync(fd);}catch{}if(created)try{fileSystem.unlinkSync(temp);}catch{}}
  },snapshot:()=>({enabled:allowed()&&!disabled,count:assets.size})};
}
module.exports={publicScript,createPublicAssetManifest};

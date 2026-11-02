// Temporary error-site evidence, limited to this user-authorized iteration.
// Public hashed JS URLs and fixed technical fields only; never exception text,
// names, UIDs, page contents, request bodies, headers, cookies or SDK state.
const fs=require('node:fs'),path=require('node:path');
const {publicScript}=require('./douyin-public-asset-manifest.cjs');
function createFollowerInitEvidence({directory,version,now=Date.now,fileSystem=fs,pid=process.pid}){
  const file=path.join(directory,'douyin-follower-init-evidence-rc187.json'),purpose='public-script-error-site-only';
  const begins=Date.parse('2026-10-24T10:00:00Z'),expires=Date.parse('2026-10-24T13:00:00Z');
  const phases=new Set(['page-startup','follower-starting','follower-active']),categories=new Set(['type-error','reference-error']);
  const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
  const allowed=()=>version==='2.10.0-rc.187'&&now()>=begins&&now()<expires;
  let disabled=false,events=[];
  const valid=e=>e&&typeof e==='object'&&Object.keys(e).sort().join(',')==='at,category,column,generation,line,mask,phase,pid,source'&&typeof e.at==='string'&&Number.isFinite(Date.parse(e.at))&&integer(e.pid,2147483647)&&e.pid>0&&integer(e.generation,50000)&&e.generation>0&&phases.has(e.phase)&&categories.has(e.category)&&integer(e.line,10000000)&&integer(e.column,100000000)&&integer(e.mask,2147483647)&&typeof e.source==='string'&&publicScript(e.source)===e.source;
  if(allowed())try{if(fileSystem.existsSync(file)){const stat=fileSystem.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error();const old=JSON.parse(fileSystem.readFileSync(file,'utf8'));if(Object.keys(old).sort().join(',')!=='events,purpose,version'||old.version!==1||old.purpose!==purpose||!Array.isArray(old.events)||old.events.length>32||!old.events.every(valid))throw Error();events=old.events;}}catch{disabled=true;}
  return {record(input){
    if(disabled||!allowed()||!integer(pid,2147483647)||pid===0)return false;
    const source=publicScript(input?.source),event={at:new Date(now()).toISOString(),pid,generation:input?.generation,phase:input?.phase,category:input?.category,line:input?.line,column:input?.column??0,mask:input?.mask,source};
    if(!valid(event))return false;
    if(events.some(e=>e.pid===pid&&e.generation===event.generation&&e.phase===event.phase&&e.category===event.category&&e.line===event.line&&e.column===event.column&&e.mask===event.mask&&e.source===event.source))return true;
    let next=[...events,event].slice(-32),bytes=Buffer.from(JSON.stringify({version:1,purpose,events:next}));
    while(bytes.length>32768&&next.length>1){next.shift();bytes=Buffer.from(JSON.stringify({version:1,purpose,events:next}));}
    if(bytes.length>32768)return false;
    const temp=file+'.tmp';let fd,created=false;
    try{
      fileSystem.mkdirSync(directory,{recursive:true});const dir=fileSystem.lstatSync(directory);if(!dir.isDirectory()||dir.isSymbolicLink())return false;
      if(fileSystem.existsSync(file)){const stat=fileSystem.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())return false;}
      fd=fileSystem.openSync(temp,'wx',0o600);created=true;fileSystem.writeFileSync(fd,bytes);fileSystem.fsyncSync(fd);fileSystem.closeSync(fd);fd=undefined;fileSystem.renameSync(temp,file);events=next;return true;
    }catch{return false;}finally{if(fd!==undefined)try{fileSystem.closeSync(fd);}catch{}if(created)try{fileSystem.unlinkSync(temp);}catch{}}
  },snapshot:()=>structuredClone({version:1,purpose,enabled:allowed()&&!disabled,disabled,events})};
}
module.exports={createFollowerInitEvidence};

// Temporary local evidence, RC167/168 only until the user's deadline. The same
// three exclusive files bound the total across restarts. No IPC/CDP or input.
const fs=require('node:fs'),path=require('node:path');
function createFollowerLayoutProbe({directory,version,now=Date.now,timeoutMs=1200}){
 const begins=Date.parse('2026-10-23T16:00:00Z'),expires=Date.parse('2026-10-24T03:00:00Z');let attempts=0,saved=0;const reserved=new Set();
 const allowed=()=>['2.10.0-rc.167','2.10.0-rc.168'].includes(version)&&now()>=begins&&now()<expires;
 return {snapshot:()=>({enabled:allowed(),attempts,saved}),async capture({window,accountSession,ownUid,assertCurrent}){
  if(!allowed()||attempts>=6||!/^[1-9]\d{0,18}$/.test(ownUid||'')||typeof assertCurrent!=='function')return {saved:false};
  const valid=()=>!window.isDestroyed()&&!window.isVisible()&&window.webContents.session===accountSession&&window.webContents.getURL()==='https://www.douyin.com/user/self';
  if(!valid())return {saved:false};const target=n=>path.join(directory,'douyin-follower-layout-rc167-'+String(n).padStart(2,'0')+'.png'),slot=[1,2,3].find(n=>!reserved.has(n)&&!fs.existsSync(target(n)));
  if(!slot)return {saved:false};attempts++;reserved.add(slot);const file=target(slot);let timer,cancelled=false,created=false,fd;
  try{
   await assertCurrent();if(!allowed()||!valid())return {saved:false};
   const image=await Promise.race([window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:false}),new Promise(resolve=>{timer=setTimeout(()=>{cancelled=true;resolve(null);},Math.max(5,Math.min(timeoutMs,1200)));})]);
   if(!image||cancelled||image.isEmpty())return {saved:false};await assertCurrent();if(cancelled||!allowed()||!valid())return {saved:false};
   const size=image.getSize(),bytes=image.toPNG();if(!Number.isSafeInteger(size.width)||!Number.isSafeInteger(size.height)||size.width<1||size.height<1||size.width>4096||size.height>4096||bytes.length<24||bytes.length>4*1024*1024||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return {saved:false};
   fs.mkdirSync(directory,{recursive:true});fd=fs.openSync(file,'wx',0o600);created=true;fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;saved++;
   return {saved:true,slot,bytes:bytes.length,width:size.width,height:size.height};
  }catch{return {saved:false};}finally{reserved.delete(slot);clearTimeout(timer);if(fd!==undefined){try{fs.closeSync(fd);}catch{}if(created)try{fs.unlinkSync(file);}catch{}}}
 }};
}
module.exports={createFollowerLayoutProbe};

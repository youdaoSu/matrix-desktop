// Use the SAME bound self-profile reader as comments/followers from the start.
// This is lane admission only, never a retry/fallback after a platform refusal.
async function readBoundMetrics(options,acquire,{now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const deadline=now()+6000;let client;
 try{
  while(true){
   await options.assertCurrent();
   try{client=await acquire(options);break;}
   catch(error){if(error?.message!=='此抖音账号正在读取另一页，请稍候'||now()>=deadline)throw error;await sleep(250);}
  }
  await options.assertCurrent();return await client.readMetrics();
 }finally{client?.close();}
}
module.exports={readBoundMetrics};

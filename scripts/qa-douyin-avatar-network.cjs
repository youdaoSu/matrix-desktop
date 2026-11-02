// Serialized page transport failures are finite metadata, never exception text.
const assert=require('node:assert/strict'),vm=require('node:vm');const {readPublicAvatarProfile}=require('../desktop/douyin-avatar-profile-page.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function run(mode){let timeout,aborted=false,calls=0;class Controller{signal={get aborted(){return aborted;}};abort(){aborted=true;}}
 const context={location:{origin:'https://www.douyin.com',pathname:'/user/self'},AbortController:Controller,URL,URLSearchParams,TextDecoder,setTimeout:fn=>(timeout=fn,1),clearTimeout(){},fetch:async()=>{calls++;if(mode==='timeout')timeout();if(mode!=='body')throw Error('PRIVATE_URL_COOKIE_HEADER');return{status:200,headers:{get:()=>null},body:{getReader:()=>({read:async()=>{throw Error('PRIVATE_BODY');},cancel:async()=>{}})}};}};
 const value=JSON.parse(JSON.stringify(await vm.runInNewContext(`(${readPublicAvatarProfile.toString()})({uid:'123',secUid:'MS4wQA'})`,context)));eq(calls,1);eq(aborted,true);eq(JSON.stringify(value).includes('PRIVATE'),false);return value;
}
(async()=>{eq((await run('fetch')).code,'avatar-fetch-network');eq((await run('timeout')).code,'avatar-network-timeout');eq((await run('body')).code,'avatar-body-network');console.log(JSON.stringify({avatarNetworkChecks:checks,oneRequestNoFallback:true,rawNetworkErrorsNotExposed:true,realRequests:0}));})().catch(error=>{console.error(error);process.exitCode=1;});

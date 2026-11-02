// Synthetic standard fetch responses only. No account files or real network.
const assert=require('node:assert/strict'),vm=require('node:vm');
const {inspectFollowerResponse}=require('../desktop/douyin-follower-response.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function inspect(body,options={}){
 const calls=[],headers={'content-type':options.mime||'application/json','x-never-export':'qa-secret-header',...(options.headers||{})};
 const context={AbortController,TextDecoder,URLSearchParams,setTimeout:options.timeout?fn=>{queueMicrotask(fn);return 1;}:setTimeout,clearTimeout:options.timeout?()=>{}:clearTimeout,location:{origin:options.origin||'https://www.douyin.com',pathname:'/user/self'},fetch:async(url,input)=>{
  calls.push({url,input});if(options.timeout)return new Promise((_resolve,reject)=>input.signal.aborted?reject(Error('QA aborted')):input.signal.addEventListener('abort',()=>reject(Error('QA aborted')),{once:true}));
  if(options.failure)throw Error('QA private network error text');
  if(options.unavailable)return{status:200,headers:new Headers(headers),body:{}};
  return new Response(body,{status:options.status||200,headers});
 }};
 const result=JSON.parse(JSON.stringify(await vm.runInNewContext(`(${inspectFollowerResponse.toString()})(${JSON.stringify({uid:'9007199254740993',secUid:options.secUid||'MS4wQaOwn'})})`,context)));
 eq(JSON.stringify(result).includes('qa-secret-header'),false);eq(JSON.stringify(result).includes('QA private'),false);
 if(calls.length){eq(calls.length,1);eq(calls[0].input.method,'GET');eq(calls[0].input.credentials,'same-origin');eq(calls[0].input.redirect,'error');eq(calls[0].input.headers,undefined);const url=new URL(calls[0].url,'https://www.douyin.com');eq(url.pathname,'/aweme/v1/web/user/follower/list/');eq(url.searchParams.get('user_id'),'9007199254740993');eq(url.searchParams.get('source_type'),'1');}
 return{result,calls};
}
(async()=>{
 const good=JSON.stringify({status_code:0,followers:[{uid:'201',nickname:'QA private fan nickname'}],has_more:0});
 let out=await inspect(good);eq(out.result.facts.responseJsonValid,true);eq(out.result.facts.responseRosterShape,true);eq(out.result.facts.responseApiAccepted,true);eq(out.result.facts.responseBytes,Buffer.byteLength(good));eq(out.result.facts.responseBodyKind,3);
 out=await inspect('\uFEFF'+JSON.stringify({data:{statusCode:'0',followList:[],hasMore:false}}));eq(out.result.facts.responseRosterShape,true);
 out=await inspect(JSON.stringify({status_code:0,followers:null,has_more:false}));eq(out.result.facts.responseRosterShape,true);
 for(const [body,kind]of [[null,1],['',1],['<!doctype html><html>QA private denial</html>',2],['{"broken":',3],['for(;;);{"status_code":0}',4],['\u0000QA private binary',5],['QA private other',6]]){out=await inspect(body,{mime:'text/html',headers:{'content-encoding':'br'}});eq(out.result.facts.responseBodyKind,kind);eq(out.result.facts.responseJsonValid,false);eq(out.result.facts.responseRosterShape,false);eq(out.result.facts.responseMime,2);eq(out.result.facts.responseEncoding,2);}
 out=await inspect(JSON.stringify({status_code:-999}));eq(out.result.platformCode,-999);eq(out.result.facts.responseApiAccepted,false);eq(out.result.facts.responseRosterShape,false);
 out=await inspect('true');eq(out.result.facts.responseJsonValid,true);eq(out.result.facts.responseRosterShape,false);
 for(const status of [403,429,500]){out=await inspect('QA private denial',{status});eq(out.result.facts.responseStatus,status);eq(out.result.facts.responseBytes,0);eq(out.result.facts.responseJsonValid,false);}
 out=await inspect(good,{headers:{'content-length':String(2*1024*1024)}});eq(out.result.facts.responseReadError,2);
 out=await inspect('x'.repeat(1024*1024+100));eq(out.result.facts.responseReadError,2);eq(out.result.facts.responseBytes,1024*1024+1);
 out=await inspect(good,{unavailable:true});eq(out.result.facts.responseReadError,1);
 out=await inspect(good,{failure:true});eq(out.result.facts.responseReadError,3);
 out=await inspect(good,{timeout:true});eq(out.result.facts.responseReadError,4);
 out=await inspect(good,{origin:'https://foreign.invalid'});eq(out.calls.length,0);eq(!!out.result.error,true);
 out=await inspect(good,{secUid:'invalid'});eq(out.calls.length,0);eq(!!out.result.error,true);
 console.log(JSON.stringify({responseInspectionChecks:checks,oneReadNoRetry:true,noCopiedCredentialsOrSignatures:true,bodyAndHeadersNotExported:true,emptyHtmlAndBomDistinguished:true,realPlatformRequests:0,realUserDataTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});

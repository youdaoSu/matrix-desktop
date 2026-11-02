const assert=require('node:assert/strict');
const {createBilibiliFollowupTransport:create}=require('../desktop/bilibili-followup-transport.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const csrf='qa_csrf_01234567890123456789012345',secret='qa_SESSION_01234567890123456789012345';
function fixture(){let cookies=[{name:'SESSDATA',value:secret},{name:'bili_jct',value:csrf}],calls=[],read=async()=>cookies,fetcher=async()=>Response.json({code:0,data:{mid:123}}),assertion=async()=>{};
 const accountSession={cookies:{get:options=>{eq(options,{url:'https://api.bilibili.com/'});return read();}},fetch:async(...args)=>{calls.push(args);return fetcher(...args);}};
 return{build:options=>create({accountSession,workId:'BV1qa0000001',assertCurrent:()=>assertion(),...options}),calls,set cookies(value){cookies=value;},set read(value){read=value;},set fetch(value){fetcher=value;},set assertion(value){assertion=value;}};
}
(async()=>{
 // Keep the bound work ID validation, but send only the cross-origin source
 // origin under Chromium's default policy. Never override that policy.
 let scoped=fixture(),transport=await scoped.build();
 for(const [method,route,data] of [['GET','/x/v2/reply/detail',{type:'1',oid:'123',root:'456',ps:'1',next:'0'}],['POST','/x/v2/reply/add',{type:'1',oid:'123',root:'0',parent:'0',message:'QA',plat:'1'}],['POST','/x/v2/reply/top',{type:'1',oid:'123',rpid:'456',action:'1'}]]){
  await transport.request(method,route,data);eq(scoped.calls.at(-1)[1].headers.Referer,'https://www.bilibili.com/');eq(scoped.calls.at(-1)[1].referrerPolicy,undefined);
 }transport.close();
 for(const workId of [undefined,'','BV1qa0000001/other','https://evil.invalid','BV1qa0000001\r\nX-Test: value']){
  scoped=fixture();scoped.read=()=>{throw Error('Credentials should not be read');};await assert.rejects(scoped.build({workId}),/作品ID/);checks++;eq(scoped.calls.length,0);
 }
 for(const [response,expected] of [
  [()=>new Response('private-response',{status:412,headers:{'content-type':'text/html'}}),/本人登录核验.*HTTP 412.*网页/],
  [()=>new Response('not-json',{headers:{'content-type':'application/json'}}),/本人登录核验.*JSON解析.*HTTP 200/],
  [()=>{throw Error('net::ERR_CONNECTION_RESET');},/本人登录核验.*连接.*ERR_CONNECTION_RESET/]
 ]){
  scoped=fixture();transport=await scoped.build();scoped.fetch=response;
  await assert.rejects(transport.request('GET','/x/web-interface/nav'),error=>{eq(error.message.includes('private-response'),false);return expected.test(error.message);});checks++;transport.close();
 }
 let f=fixture(),client=await f.build();eq(await client.request('GET','/x/web-interface/nav'),{code:0,data:{mid:123}});eq(f.calls[0][0],'https://api.bilibili.com/x/web-interface/nav');eq(f.calls[0][1].headers.Cookie,`SESSDATA=${secret}; bili_jct=${csrf}`);eq(f.calls[0][1].credentials,'omit');eq(f.calls[0][1].redirect,'error');eq(JSON.stringify(client),'{}');
 await client.request('POST','/x/v2/reply/add',{type:'1',oid:'123',root:'0',parent:'0',message:'QA原始文案',plat:'1'});const post=f.calls.at(-1);eq(new URLSearchParams(post[1].body).get('csrf'),csrf);eq(new URLSearchParams(post[1].body).get('message'),'QA原始文案');eq(new URL(post[0]).search,'');eq(post[1].headers.Authorization,undefined);client.close();await assert.rejects(client.request('GET','/x/web-interface/nav'),/已结束/);checks++;
 for(const [method,route,data] of [['GET','https://evil.invalid',{}],['POST','/x/v2/reply/del',{}],['POST','/x/v2/reply/add',{csrf:'renderer-cannot-supply'}],['GET','/x/web-interface/nav',{extra:'unknown'}],['GET','/x/web-interface/view',{bvid:123}]]){f=fixture();client=await f.build();await assert.rejects(client.request(method,route,data),/不支持/);checks++;eq(f.calls.length,0);client.close();}
 f=fixture();client=await f.build();await client.request('POST','/x/v2/reply/del',{type:'1',oid:'123',rpid:'456'});eq(new URLSearchParams(f.calls[0][1].body).get('rpid'),'456');eq(new URLSearchParams(f.calls[0][1].body).get('csrf'),csrf);client.close();
 for(const cookies of [[{name:'SESSDATA',value:secret}],[{name:'SESSDATA',value:secret},{name:'SESSDATA',value:secret},{name:'bili_jct',value:csrf}],[{name:'SESSDATA',value:'bad\r\nheader'},{name:'bili_jct',value:csrf}],[{name:'SESSDATA',value:secret,expirationDate:1},{name:'bili_jct',value:csrf}]]){f=fixture();f.cookies=cookies;await assert.rejects(f.build());checks++;eq(f.calls.length,0);}
 f=fixture();client=await f.build();f.cookies=[{name:'SESSDATA',value:secret+'different'},{name:'bili_jct',value:csrf}];await assert.rejects(client.request('POST','/x/v2/reply/top',{type:'1',oid:'123',rpid:'456',action:'1'}),/会话已变化/);checks++;eq(f.calls.length,0);client.close();
 f=fixture();client=await f.build();let release;f.read=()=>new Promise(resolve=>release=resolve);const held=client.request('GET','/x/web-interface/nav');for(let i=0;i<10&&!release;i++)await new Promise(r=>setImmediate(r));client.close();release([{name:'SESSDATA',value:secret},{name:'bili_jct',value:csrf}]);await assert.rejects(held,/会话已变化/);checks++;eq(f.calls.length,0);
 f=fixture();client=await f.build();f.assertion=async()=>{throw Error('QA current binding changed');};await assert.rejects(client.request('GET','/x/web-interface/nav'),/binding changed/);checks++;eq(f.calls.length,0);client.close();
 for(const response of [()=>new Response('bad cookie='+secret,{headers:{'content-type':'text/html'}}),()=>new Response('bad csrf='+csrf,{status:503,headers:{'content-type':'application/json'}}),()=>new Response('invalid',{headers:{'content-type':'application/json'}}),()=>{throw Error('Cookie: '+secret+' csrf='+csrf);}]){f=fixture();client=await f.build();f.fetch=response;let error;try{await client.request('GET','/x/web-interface/nav');}catch(e){error=e;}assert.ok(error);checks++;eq(error.message.includes(secret)||error.message.includes(csrf),false);eq(f.calls.length,1);client.close();}
 for(const stream of [false,true]){f=fixture();client=await f.build({timeoutMs:10});f.fetch=stream?async()=>new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}}):()=>new Promise(()=>{});await assert.rejects(client.request('GET','/x/web-interface/nav'),/请求超时/);checks++;eq(f.calls.length,1);client.close();}
 f=fixture();client=await f.build();f.fetch=async()=>new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'application/json'}});await assert.rejects(client.request('GET','/x/web-interface/nav'),/结构化结果/);checks++;client.close();
 f=fixture();f.read=()=>new Promise(()=>{});await assert.rejects(f.build({timeoutMs:10}),/本机会话读取超时/);checks++;
 console.log(JSON.stringify({bilibiliFollowupTransportChecks:checks,noArbitraryHostOrRoute:true,cookieAndCsrfStayInMainClosure:true,sessionChangeAndLateClosedReadBlocked:true,headersAndBodyDeadlineBounded:true,noAutomaticRetries:true,realPlatformNetwork:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});

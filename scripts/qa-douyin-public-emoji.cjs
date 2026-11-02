// Public-metadata parser/IPC only. No real network, cookies or account access.
const assert=require('node:assert/strict'),{registerPublicEmoji,normalizePublicEmoji,catalogUrl}=require('../desktop/douyin-public-emoji.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const valid={status_code:0,emoji_list:[{display_name:'[星星眼]',hide:0,emoji_url:{url_list:['https://p3-pc-sign.douyinpic.com/obj/qa?x-signature=public']}},{display_name:'[旧别名]',hide:1,emoji_url:{url_list:['https://p1.byteimg.com/qa']}}]};
(async()=>{
 eq(normalizePublicEmoji(valid).map(x=>x.name),['[星星眼]','[旧别名]']);
 for(const url of ['javascript:alert(1)','https://p1.byteimg.com.evil.test/a','https://user:secret@p1.byteimg.com/a','http://p1.byteimg.com/a','https://p1.byteimg.com:123/a']){assert.throws(()=>normalizePublicEmoji({status_code:0,emoji_list:[{display_name:'[坏]',emoji_url:{url_list:[url]}}]}));checks++;}
 for(const value of [{status_code:5,emoji_list:valid.emoji_list},{status_code:0,emoji_list:null}]){assert.throws(()=>normalizePublicEmoji(value));checks++;}
 let handler,calls=0,clock=0,finish;const window={isDestroyed:()=>false,webContents:{}},options=[];
 registerPublicEmoji({ipcMain:{handle:(name,fn)=>{eq(name,'matrix:douyin-public-emoji');handler=fn;}},getWindow:()=>window,now:()=>clock,fetchImpl:(url,config)=>{calls++;eq(url,catalogUrl);options.push(config);return new Promise(r=>finish=r);}});
 eq(typeof(await handler({sender:{}})).error,'string');eq(calls,0);
 const a=handler({sender:window.webContents}),b=handler({sender:window.webContents});eq(calls,1);finish(Response.json(valid));eq((await a).entries.length,2);eq((await b).entries.length,2);eq(options[0].credentials,'omit');eq(options[0].redirect,'error');eq(options[0].headers,undefined);
 await handler({sender:window.webContents});eq(calls,1);clock=86400001;const next=handler({sender:window.webContents});eq(calls,2);finish(new Response('',{status:403}));eq((await next).entries.length,2);await handler({sender:window.webContents});eq(calls,2);
 let deniedHandler,deniedCalls=0;registerPublicEmoji({ipcMain:{handle:(_name,fn)=>deniedHandler=fn},getWindow:()=>window,now:()=>0,fetchImpl:async()=>{deniedCalls++;return new Response('x'.repeat(2*1024*1024+1));}});eq(typeof(await deniedHandler({sender:window.webContents})).error,'string');await deniedHandler({sender:window.webContents});eq(deniedCalls,1);
 console.log(JSON.stringify({publicEmojiChecks:checks,hiddenPickerAliasesStillRender:true,publicOnlyPinnedUrl:true,noSessionOrCookieAccess:true,concurrentRequestsDeduplicated:true,boundedBodyAndFailureCooldown:true,realRequests:0,realProfileTouched:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});

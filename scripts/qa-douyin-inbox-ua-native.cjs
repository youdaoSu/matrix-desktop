// Real branded Electron UA and Node HTTP validation; synthetic account/network.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{env,windowsHide:true,encoding:'utf8',timeout:25000});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');let report;try{report=JSON.parse((r.stdout||'').trim().split(/\r?\n/).at(-1));}catch{}
 process.exitCode=r.status===0&&report?.localizedBrandReproduced===true&&report?.realNodeHeaderValidation===true&&report?.checks>=30?0:1;
}else{
 const {app,session}=require('electron'),https=require('node:https'),{validateHeaderValue}=require('node:http'),{EventEmitter}=require('node:events'),{Duplex}=require('node:stream');
 let moduleRoot=root;
 if(process.argv[2]){assert.equal(process.argv[2],'--packaged');moduleRoot=process.argv[3];assert.match(process.argv[4]||'',/^[a-f0-9]{64}$/);assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[4]);}
 app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'yx-inbox-ua-')));app.setName('远效');
 app.whenReady().then(async()=>{
  let client,checks=0,requests=0,connectionCalls=0,sockets=0;const originalAgent=https.globalAgent;
  const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
  try{
   const {browserUserAgent,wire,createTransport}=require(path.join(moduleRoot,'desktop/douyin-inbox-transport.cjs'));
   const isolated=session.fromPartition('qa-localized-brand'),raw=isolated.getUserAgent();assert(raw.includes('远效'));checks++;
   assert.throws(()=>validateHeaderValue('User-Agent',raw),e=>e.code==='ERR_INVALID_CHAR');checks++;
   const normalized=browserUserAgent(isolated);validateHeaderValue('User-Agent',normalized);checks++;
   eq(normalized,raw.replace('远效',encodeURIComponent('远效')));eq(browserUserAgent({getUserAgent:()=>normalized}),normalized);
   eq(browserUserAgent({getUserAgent:()=>'QA/1 Chrome/130.0 Windows'}),'QA/1 Chrome/130.0 Windows');
   eq(browserUserAgent({getUserAgent:()=>'QA🚀/1'}),'QA%F0%9F%9A%80/1');
   validateHeaderValue('User-Agent',browserUserAgent({}));checks++;
   for(const bad of ['bad\r\nCookie: secret','bad\u0000secret','\ud800','x'.repeat(4097),42]){assert.throws(()=>browserUserAgent({getUserAgent:()=>bad}),e=>!e.message.includes('secret')&&/浏览器标识/.test(e.message));checks++;}
   // Real Node request construction: the raw branded UA fails before a socket;
   // normalized UA reaches the isolated in-memory socket and cancels normally.
   const agent=new https.Agent();agent.createConnection=()=>{connectionCalls++;return new(require('node:net').Socket)();};https.globalAgent=agent;
   await assert.rejects(wire(new URL('https://127.0.0.1:1/fixture'),{headers:{'User-Agent':raw}}),e=>e.code==='ERR_INVALID_CHAR');checks++;eq(connectionCalls,0);
   const ctrl=new AbortController(),pending=wire(new URL('https://127.0.0.1:1/fixture'),{headers:{'User-Agent':normalized},signal:ctrl.signal});eq(connectionCalls,1);ctrl.abort();
   await assert.rejects(pending,e=>e.name!=='TypeError'&&/网络连接/.test(e.message));checks++;https.globalAgent=originalAgent;agent.destroy();
   const own='9007199254740993',peer='9007199254740995',cookies=new EventEmitter();cookies.get=async()=>[{name:'sessionid',value:'qa-cookie-unchanged',domain:'.douyin.com',path:'/'}];
   const accountSession={cookies,getUserAgent:()=>raw};
   class Socket extends EventEmitter{constructor(url,protocols,options){super();sockets++;for(const [k,v]of Object.entries(options.headers))validateHeaderValue(k,v);eq(options.headers['User-Agent'],normalized);eq(options.headers.Cookie,'sessionid=qa-cookie-unchanged');this.readyState=0;}terminate(){this.readyState=3;this.emit('close');}}
   client=await createTransport({accountSession,publicHandle:'qa-owner',assertCurrent:async()=>{},Socket,network:async(url,options)=>{
    requests++;const target=new URL(url);for(const[k,v]of Object.entries(options.headers))validateHeaderValue(k,v);eq(options.headers.Cookie,'sessionid=qa-cookie-unchanged');
    if(target.hostname==='imdesktop.douyin.com')return Buffer.from('{"status_code":8}');
    eq(options.headers['User-Agent'],normalized);
    if(target.pathname.endsWith('/query/user/'))return Buffer.from(JSON.stringify({status_code:0,user_uid:own,id:'18446744073709551614'}));
    if(target.pathname.endsWith('/im/user/info/'))return Buffer.from(JSON.stringify({status_code:0,data:[{uid:peer,sec_uid:'MS4wQaPeer',nickname:'QA peer'}]}));
    return Buffer.from(JSON.stringify({status_code:0,user:{uid:own,unique_id:'qa-owner',sec_uid:'MS4wQaOwn'}}));
   }});
   eq(client.ownUid,own);eq((await client.people([{uid:peer,secUid:'MS4wQaPeer'}]))[0].name,'QA peer');
   const stop=await client.connect({onFrame:async()=>{},onStatus(){}});eq(sockets,1);stop();eq(requests,4);
   console.log(JSON.stringify({checks,electron:process.versions.electron,localizedBrandReproduced:true,realNodeHeaderValidation:true,requests,realPlatformRequests:0,realSends:0,profile:'fresh-disposable'}));
  }catch(e){console.error(e);process.exitCode=1;}
  finally{https.globalAgent=originalAgent;client?.close();app.quit();}
 });
}

// Actual sandboxed webview, disposable profile and local synthetic HTTPS only.
const path=require('node:path'),root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const r=require('node:child_process').spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:60000});
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);
}else{
  const {app,BrowserWindow,session,webContents}=require('electron'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
  let moduleRoot=root;if(process.argv[2]==='--packaged'){moduleRoot=path.join(root,'release-next/win-unpacked/resources/app.asar');assert.equal(require('node:crypto').createHash('sha256').update(require('original-fs').readFileSync(moduleRoot)).digest('hex'),process.argv[3]);assert(process.argv.slice(4).every(arg=>['--feed','--home'].includes(arg)));}else assert(process.argv.slice(2).every(arg=>['--feed','--home'].includes(arg)));
  app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-open-fans-qa-')));app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    const {createOpenFollowerReader}=require(path.join(moduleRoot,'desktop/douyin-open-followers.cjs'));
    const account={id:'qa-account',platform:'douyin',connectorSessionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',nativeAccountKey:'qa-public-handle'};
    const source=session.fromPartition('persist:matrix-douyin-'+account.connectorSessionId),windows=[];let requests=0,external=0,checks=0;
    const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
    const entryPath=process.argv.includes('--feed')?'/jingxuan':process.argv.includes('--home')?'/':'/user/self';
    const fixture=`<style>section{width:600px;height:300px;overflow:auto}article{height:100px}img{width:40px;height:40px}</style>${entryPath==='/user/self'?'<header><h1>QA owner</h1><span>抖音号：qa-public-handle</span><p>粉丝指数 432</p></header>':''}<section data-e2e="user-fans-container"><div id="rows"></div><button id="more">加载更多</button><div data-e2e="user-fans-footer">没有更多了</div></section><button id="notice">新增粉丝</button><script>
    window.clicks=0;window.scrolls=0;window.calls=0;document.addEventListener('click',()=>window.clicks++);document.addEventListener('scroll',()=>window.scrolls++,true);
    window.fetch=()=>{window.calls++;throw Error('Unexpected fetch')};
    const panel=document.querySelector('section');window.panelProps={isSelf:true,activeTab:1,currentUserInfo:{uid:'9007199254740993',${entryPath==='/user/self'?'':"unique_id:'qa-public-handle'"}},searchVal:'',userList:[]};panel.__reactFiber$qa={memoizedProps:{children:{props:window.panelProps}}};
    for(let i=0;i<6;i++){const user={uid:String(200+i),nickname:'QA member '+i,sec_uid:'MS4wQaMember'+i,signature:'QA biography '+i,create_time:1};const row=document.createElement('article');row.innerHTML='<a href="/user/'+user.sec_uid+'"><img src="https://p3.douyinpic.com/qa-avatar-'+i+'.webp" alt="'+user.nickname+'头像"><span>'+user.nickname+'</span></a><button>回关</button><button>移除</button>';row.__reactFiber$qa={memoizedProps:{user}};document.querySelector('#rows').appendChild(row);}
    panel.scrollTop=100;window.scrolls=0;
    </script>`;
    source.webRequest.onBeforeRequest((d,cb)=>{let url;try{url=new URL(d.url);}catch{}const allowed=url&&(url.origin==='https://www.douyin.com'&&url.pathname===entryPath||url.origin==='https://p3.douyinpic.com'&&/^\/qa-avatar-\d+.webp$/.test(url.pathname));if(!allowed)external++;cb({cancel:!allowed});});
    source.protocol.handle('https',request=>{requests++;return new URL(request.url).hostname==='www.douyin.com'?new Response(fixture,{headers:{'content-type':'text/html;charset=utf-8'}}):new Response(null,{status:204});});
    let win,guest;
    try{
      win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{webviewTag:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});windows.push(win);
      await win.loadURL('data:text/html,<main></main>');
      const attached=new Promise(resolve=>win.webContents.once('did-attach-webview',(_event,value)=>resolve(value)));
      await win.webContents.executeJavaScript(`(()=>{const v=document.createElement('webview');v.setAttribute('partition',${JSON.stringify('persist:matrix-douyin-'+account.connectorSessionId)});v.style='width:900px;height:700px';v.src=${JSON.stringify('https://www.douyin.com'+entryPath+'?from_tab_name=main')};document.querySelector('main').appendChild(v);})()`);
      guest=await attached;await new Promise(resolve=>guest.isLoading()?guest.once('did-finish-load',resolve):resolve());
      eq(guest.getType(),'webview');eq(guest.hostWebContents.id,win.webContents.id);eq(guest.session,source);
      const reader=createOpenFollowerReader({getWindow:()=>win,webContents,session});let guards=0;
      eq(reader.isAlive(guest.id),true);eq(reader.isAlive(win.webContents.id),false);eq(reader.isAlive(2147483647),false);
      const read=()=>reader({account,webContentsId:guest.id,assertCurrent:async()=>{guards++;}});
      await guest.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{window.scrolls=0;resolve();})))');
      const before=requests;const capture=await read();eq(capture.ownerUid,'9007199254740993');eq(capture.followers.length,6);
      const prepareCounts=()=>reader({account,webContentsId:guest.id,pagination:{action:'prepare'},assertCurrent:async()=>{}});
      eq((await prepareCounts()).counterEvidence,{});
      await guest.executeJavaScript('Object.assign(window.panelProps.currentUserInfo,{follower_count:332,mplatform_followers_count:"432"})');
      eq((await prepareCounts()).counterEvidence,{follower_count:332,mplatform_followers_count:432});
      for(const invalid of ['-1','NaN','9007199254740993','2147483648']){
        await guest.executeJavaScript('window.panelProps.currentUserInfo.follower_count='+JSON.stringify(invalid));
        eq((await prepareCounts()).counterEvidence,{mplatform_followers_count:432});
      }
      await guest.executeJavaScript('delete window.panelProps.currentUserInfo.follower_count;delete window.panelProps.currentUserInfo.mplatform_followers_count');
      eq(capture.followers[0].avatar_thumb.url_list,['https://p3.douyinpic.com/qa-avatar-0.webp']);eq(capture.followers[0].signature,'QA biography 0');eq(capture.followers.every(user=>user.follow_time===undefined),true);eq(requests,before);eq(guards,2);
      const state=await guest.executeJavaScript('({clicks,scrolls,calls,top:document.querySelector("section").scrollTop})');eq(state,{clicks:0,scrolls:0,calls:0,top:100});
      for(const [script,pattern,undo]of [
        ['window.panelProps.activeTab=0','关注列表','window.panelProps.activeTab=1'],
        ['window.panelProps.isSelf=false','其他账号','window.panelProps.isSelf=true'],
        ['window.panelProps.searchVal="QA"','搜索条件','window.panelProps.searchVal=""'],
        ['window.panelProps.currentUserInfo.uid=9007199254740992','编号结构','window.panelProps.currentUserInfo.uid="9007199254740993"'],
        ...(entryPath==='/user/self'?[['document.querySelector("header span").textContent="抖音号：other-handle"','绑定不一致','document.querySelector("header span").textContent="抖音号：qa-public-handle"']]:[
          ['window.panelProps.currentUserInfo.unique_id="other-handle"','绑定不一致','window.panelProps.currentUserInfo.unique_id="qa-public-handle"'],
          ['delete window.panelProps.currentUserInfo.unique_id','未包含可核验','window.panelProps.currentUserInfo.unique_id="qa-public-handle"'],
          ['window.panelProps.currentUserInfo.uniqueId="other-handle"','绑定不一致','delete window.panelProps.currentUserInfo.uniqueId'],
          ['window.panelProps.currentUserInfo.unique_id="other-handle";window.panelProps.currentUserInfo.short_id="qa-public-handle"','绑定不一致','window.panelProps.currentUserInfo.unique_id="qa-public-handle";delete window.panelProps.currentUserInfo.short_id']
        ]),
        ['document.querySelector("section").insertAdjacentHTML("afterend",document.querySelector("section").outerHTML)','唯一','document.querySelectorAll("section")[1].remove()'],
        ['window.panelProps.searchVal=undefined','搜索条件','window.panelProps.searchVal=""'],
      ]){await guest.executeJavaScript(script);await assert.rejects(read,new RegExp(pattern));checks++;await guest.executeJavaScript(undo);}
      const other=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});windows.push(other);
      await assert.rejects(()=>createOpenFollowerReader({getWindow:()=>other,webContents,session})({account,webContentsId:guest.id,assertCurrent:async()=>{}}),/不属于/);checks++;
      await assert.rejects(()=>reader({account:{...account,connectorSessionId:'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'},webContentsId:guest.id,assertCurrent:async()=>{}}),/不属于/);checks++;
      let last=false;await assert.rejects(()=>reader({account,webContentsId:guest.id,assertCurrent:async()=>{if(last)throw Error('账号绑定已变化');last=true;}}),/绑定已变化/);checks++;
      for(const kind of ['auth-cookie','navigation']){
        let count=0;await assert.rejects(()=>reader({account,webContentsId:guest.id,assertCurrent:async()=>{if(++count===2){if(kind==='auth-cookie')source.cookies.emit('changed',{}, {name:'sessionid'});else guest.emit('did-start-navigation',{},guest.getURL(),false,true);}}}),/页面或登录已变化/);checks++;
      }
      for(const kind of ['auth-cookie','navigation']){
        let count=0;const prepare=()=>reader({account,webContentsId:guest.id,pagination:{action:'prepare'},assertCurrent:async()=>{if(++count===2){if(kind==='auth-cookie')source.cookies.emit('changed',{}, {name:'sessionid'});else guest.emit('did-start-navigation',{},guest.getURL(),false,true);}}});
        if(kind==='auth-cookie'){await assert.rejects(prepare,/登录凭据变化/);checks++;}
        else if(entryPath==='/user/self'){const waiting=await prepare();eq(waiting.waiting,true);eq(waiting.ready,undefined);eq(waiting.ownerUid,undefined);eq(waiting.followers,[]);eq(waiting.reason.includes('重新核验归属'),true);}
        else {await assert.rejects(prepare,/官网页面变化/);checks++;}
      }
      if(entryPath==='/user/self'){
        let count=0;const changed=await reader({account,webContentsId:guest.id,pagination:{action:'prepare'},assertCurrent:async()=>{if(++count===2)await guest.loadURL('https://www.douyin.com/user/self?qa=settled');}});eq(changed.waiting,true);eq(changed.ready,undefined);eq(changed.ownerUid,undefined);
        const reproved=await reader({account,webContentsId:guest.id,pagination:{action:'prepare'},assertCurrent:async()=>{}});eq(reproved.ready,true);eq(reproved.ownerUid,'9007199254740993');eq(reproved.followers,[]);
        count=0;await assert.rejects(()=>reader({account,webContentsId:guest.id,pagination:{action:'prepare'},assertCurrent:async()=>{if(++count===2){source.cookies.emit('changed',{}, {name:'sessionid'});await guest.loadURL('https://www.douyin.com/user/self?qa=auth-changed');}}}),/登录凭据变化/);checks++;
      }
      let count=0;eq((await reader({account,webContentsId:guest.id,assertCurrent:async()=>{if(++count===2){source.cookies.emit('changed',{}, {name:'analytics-only'});guest.emit('did-start-navigation',{},'https://www.douyin.com/frame',false,false);}}})).followers.length,6);
      let release,first=true;const held=reader({account,webContentsId:guest.id,assertCurrent:async()=>{if(first){first=false;await new Promise(resolve=>{release=resolve;});}}});await new Promise(resolve=>setImmediate(resolve));
      await assert.rejects(read,/正在读取/);checks++;release();await held;
      const finalBefore=requests;eq((await read()).followers.length,6);eq(source.cookies.listenerCount('changed'),0);eq(requests,finalBefore);eq(external,0);
      console.log(JSON.stringify({openFollowerChecks:checks,entryPath,actualSandboxedWebview:true,exactOwnIdentityVerified:true,noClicksScrollOrRequests:true,realUserProfileTouched:false,externalPlatformRequests:external}));
    }finally{for(const w of windows)if(!w.isDestroyed())w.destroy();}
  }).then(()=>app.exit(0)).catch(error=>{console.error(error.stack||error);app.exit(1);});
}

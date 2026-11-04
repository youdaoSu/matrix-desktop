// Actual routed CommentsPage, work rail, feed and display preferences in a
// disposable offline Electron renderer. No real profiles or platform requests.
const path=require('node:path'),root=path.resolve(__dirname,'..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();
async function run(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs'),cache=new Map(),overrides=new Map();
 const stub=(file,exports)=>cache.set(path.join(root,file),{exports});let checks=0,owner='qa-owner',route='/engage/comments',search='',mount=0;
 const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const {commentCountsByWork}=loadTs('client/src/components/workspace/comment-counts.ts',cache,overrides);let rowReads=0;
 const large=Array.from({length:50000},(_,index)=>({get workId(){rowReads++;return String(1000+index%1000);}}));const indexedCounts=commentCountsByWork(large);eq(rowReads,50000);eq(indexedCounts.size,1000);eq(indexedCounts.get('1000'),50);eq(commentCountsByWork([{workId:'1000'}]).get('1000'),1);eq(commentCountsByWork([{}]).size,0);
 let accounts=[{id:'a',platform:'douyin',nickname:'QA账号甲',connectorSessionId:'session-a',nativeAccountKey:'native-a'},{id:'b',platform:'douyin',nickname:'QA账号乙',connectorSessionId:'session-b',nativeAccountKey:'native-b'}];
 const entries={a:{works:[{platformId:'1001',title:'QA甲作品一',coverUrl:'https://p1.byteimg.com/qa.jpg',readComplete:true},{platformId:'1002',title:'QA甲作品二',readComplete:true},{platformId:'1003',title:'QA零评论作品',readComplete:true},{platformId:'1004',title:'QA受限作品',readError:'QA没有权限'}],rows:[{platformId:'201',platformUserId:'301',author:'QA评论者一',content:'QA作品一评论',workId:'1001',workTitle:'QA甲作品一'},{platformId:'202',platformUserId:'302',author:'QA评论者二',content:'QA作品二评论',workId:'1002',workTitle:'QA甲作品二'},{platformId:'203',platformUserId:'303',author:'QA回复者',content:'QA作品一回复',parentPlatformId:'201',workId:'1001',workTitle:'QA甲作品一'}],complete:true},b:{works:[{platformId:'2001',title:'QA乙作品',readComplete:true}],rows:[{platformId:'201',platformUserId:'304',author:'QA乙评论者',content:'QA乙作品评论',workId:'2001',workTitle:'QA乙作品'}],complete:true}};
 entries.a.rows[0].liked=false;entries.a.rows[0].likeCount=2;entries.a.rows[0].replyCount=1;
 const requests=[];stub('client/src/api/index.ts',{getUser:()=>({id:owner}),getAuthToken:()=> 'qa-token-'+owner,axiosForBackend:{get:async(url,options)=>{requests.push({url,params:options?.params});return{data:{data:{items:url==='/api/platform/accounts'?accounts:[],total:0}}};}}});
 window.matrixDesktop={douyinInteractions:async input=>{requests.push({url:'qa-native-action',input});return{accountId:'a',sessionId:'session-a',receipt:{state:'confirmed',message:input.command==='reply'?'QA 回复已确认':'QA 点赞操作已确认',commentId:input.command==='reply'?'209':undefined},...(input.command==='reply'?{records:[{platformId:'209',platformUserId:'999',author:'QA本人',content:input.text,workId:'1001',parentPlatformId:'201'}]}:{})};}};
 const workspace={accounts,jobsLocked:false,accountError:'',openAccount:()=>{throw Error('No official navigation expected');}};
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace,platformLabels:{douyin:'抖音',bilibili:'B站',xiaohongshu:'小红书',wechat:'视频号'}});
 stub('client/src/components/workspace/AccountAvatar.tsx',{AccountAvatar:({account})=>React.createElement('span',null,account.nickname)});
 const prioritize=()=>{};
 stub('client/src/components/workspace/DouyinInteractionData.tsx',{useDouyinInteractionData:()=>({activate(){},prioritize,entry:account=>entries[account.id],reading:''}),douyinInteractionKey:account=>account.id,interactionStatus:()=> '获取失败'});
 stub('client/src/components/workspace/OfficialInteractionManager.tsx',{OfficialInteractionManager:()=>null});
 const basic=tag=>({children,size,variant,...props})=>React.createElement(tag,props,children);
 for(const [name,values]of[['avatar',{Avatar:basic('span'),AvatarImage:basic('img'),AvatarFallback:basic('span')}],['button',{Button:basic('button')}],['input',{Input:basic('input')}],['badge',{Badge:basic('span')}]]){stub(`client/src/components/ui/${name}.tsx`,values);overrides.set('@client/src/components/ui/'+name,values);}
 overrides.set('react-router-dom',{Link:({to,children})=>React.createElement('a',{href:to},children),useLocation:()=>({pathname:route,search})});
 const feed=loadTs('client/src/components/workspace/DouyinInteractionFeed.tsx',cache,overrides);
 // Keep the actual mode/ID handoff and actual native feed; unrelated platform
 // transports are covered separately and are not invoked by this fixture.
 stub('client/src/components/workspace/InteractionLiveFeed.tsx',{InteractionLiveFeed:props=>React.createElement(feed.DouyinInteractionFeed,props)});
 const panels=loadTs('client/src/components/workspace/InteractionPanels.tsx',cache,overrides);stub('client/src/components/workspace/InteractionPanels.tsx',{...panels,ReplyTemplatePane:()=>React.createElement('aside',{'aria-label':'话术库'},'QA话术库')});
 const Page=loadTs('client/src/pages/user/CommentsPage.tsx',cache,overrides).default,component=createRoot(document.getElementById('root'));
 const render=()=>component.render(React.createElement(Page,{key:mount}));
 const until=async(fn,label='condition')=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Comment mode fixture timeout: '+label);};
 const body=()=>document.querySelector('.matrix-live-records')?.textContent||'';
 const workRail=()=>document.querySelector('[aria-label="关联作品列表"]');
 const accountButton=id=>[...document.querySelectorAll('[aria-label="互动账号列表"] button')].find(b=>b.textContent.includes(id==='a'?'QA账号甲':'QA账号乙'));
 const chooseWork=id=>workRail().querySelector(`[data-interaction-post-id="${id}"]`).click();
 const select=(label,value)=>{const el=document.querySelector(`[aria-label="${label}"]`);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
 try{
  // Legacy shared dropdown preference must not silently constrain aggregate.
  localStorage.setItem('matrix-ui:v1:qa-owner:interaction.comments.douyin.paged.work',JSON.stringify('1002'));
  render();await until(()=>accountButton('a'));eq(body(),'');eq(document.body.textContent.includes('全部抖音账号'),false);eq(workRail().textContent.includes('请先选择账号'),true);
  accountButton('a').click();await until(()=>workRail().textContent.includes('QA甲作品二'));eq(body(),'');eq(workRail().querySelectorAll('[data-interaction-post-id]').length,4);eq(document.body.textContent.includes('全部作品的评论'),false);
  chooseWork('1001');await until(()=>body().includes('QA作品一评论'));eq(body().includes('QA作品一回复'),false);[...document.querySelectorAll('button')].find(b=>b.textContent.includes('展开回复')).click();await until(()=>body().includes('QA作品一回复'));eq(body().includes('QA作品二评论'),false);eq(body().includes('QA乙作品评论'),false);eq(document.querySelector('[aria-label="当前作品"]').textContent.includes('QA甲作品一'),true);
  // Real transport commits replace row arrays/objects. In-place fixture edits
  // bypass the revision-local projection cache and are not a new snapshot.
  const updateFirst=patch=>{entries.a={...entries.a,rows:entries.a.rows.map((row,index)=>index===0?{...row,...patch}:row)};};
  updateFirst({replyCount:3,repliesReadState:'partial',repliesReadReason:'QA官网仅返回部分回复'});render();await until(()=>body().includes('QA官网仅返回部分回复'));eq(body().includes('其余仍在后台同步'),false);
  updateFirst({repliesReadState:'complete',repliesReadReason:undefined});render();await until(()=>body().includes('本轮可访问回复已到末页'));eq(body().includes('当前筛选显示 1 条'),true);
  updateFirst({repliesReadState:undefined});entries.a={...entries.a,error:'QA读取暂停'};render();await until(()=>body().includes('回复同步已暂停：QA读取暂停'));eq(body().includes('其余仍在后台同步'),false);entries.a={...entries.a,error:undefined};updateFirst({replyCount:1});render();
  const rootItem=document.querySelector('.matrix-comment-thread'),like=()=>rootItem.querySelector('button[aria-pressed]');eq(like().getAttribute('aria-pressed'),'false');like().click();like().click();await until(()=>like().getAttribute('aria-pressed')==='true');eq(requests.filter(r=>r.url==='qa-native-action').length,1);like().click();await until(()=>like().getAttribute('aria-pressed')==='false');eq(requests.filter(r=>r.url==='qa-native-action').length,2);
  [...rootItem.querySelectorAll('button')].find(b=>b.textContent==='回复').click();await until(()=>rootItem.querySelector('textarea'));const reply=rootItem.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reply,'QA inline reply');reply.dispatchEvent(new Event('input',{bubbles:true}));await until(()=>!rootItem.querySelector('[type=submit]').disabled);rootItem.querySelector('[type=submit]').click();await until(()=>body().includes('QA inline reply'));eq(requests.filter(r=>r.url==='qa-native-action').length,3);eq(requests.filter(r=>r.input).every(r=>r.input.accountId==='a'&&r.input.workId==='1001'&&r.input.commentId==='201'),true);
  chooseWork('1002');await until(()=>body().includes('QA作品二评论'));eq(body().includes('QA作品一评论'),false);
  accountButton('b').click();await until(()=>workRail().textContent.includes('QA乙作品'));eq(body(),'');chooseWork('2001');await until(()=>body().includes('QA乙作品评论'));eq(body().includes('QA作品二评论'),false);
  accountButton('a').click();await until(()=>body().includes('QA作品二评论'));eq(workRail().querySelector('[aria-pressed="true"]').getAttribute('data-interaction-post-id'),'1002');
  // Sorting follows the homepage's explicit order before pin/date fallbacks,
  // and never changes which stable work ID is selected.
  entries.a.works[0]={...entries.a.works[0],pinned:true,pinnedOrder:0,publishedAt:'2020-01-01T00:00:00Z',homepageRank:1,homepageOrderAt:'2026-10-23T00:00:00Z'};
  entries.a.works[1]={...entries.a.works[1],pinned:true,pinnedOrder:1,publishedAt:'2021-01-01T00:00:00Z',homepageRank:0,homepageOrderAt:'2026-10-23T00:00:00Z'};
  entries.a.works[2]={...entries.a.works[2],publishedAt:'2026-10-23T00:00:00Z'};entries.a.works[3]={...entries.a.works[3],publishedAt:'2026-10-01T00:00:00Z'};render();await until(()=>workRail().querySelector('[data-interaction-post-id]')?.getAttribute('data-interaction-post-id')==='1002');eq([...workRail().querySelectorAll('[data-interaction-post-id]')].map(node=>node.getAttribute('data-interaction-post-id')),['1002','1001','1003','1004']);eq(workRail().querySelector('[aria-pressed="true"]').getAttribute('data-interaction-post-id'),'1002');eq(body().includes('QA作品二评论'),true);
  // Actual route transitions preserve management selection independently.
  route='/engage/comments-agg';render();await until(()=>document.querySelector('[aria-label="互动账号筛选"]'));eq(workRail(),null);eq(body().includes('QA作品一评论'),true);eq(body().includes('QA作品二评论'),true);eq(document.querySelector('[aria-label="筛选抖音作品评论"]'),null);
  select('互动账号筛选','a');await until(()=>!body().includes('QA乙作品评论'));eq(body().includes('QA作品一评论'),true);eq(body().includes('QA作品二评论'),true);
  route='/engage/comments';render();await until(()=>workRail());eq(body().includes('QA作品二评论'),true);eq(body().includes('QA作品一评论'),false);
  chooseWork('1003');await until(()=>document.body.textContent.includes('该作品暂无可访问的评论'));eq(body(),'');
  chooseWork('1004');await until(()=>document.body.textContent.includes('该作品评论获取失败'));eq(body(),'');
  chooseWork('1001');await until(()=>body().includes('QA作品一评论'));mount++;render();await until(()=>body().includes('QA作品一评论'));eq(body().includes('QA作品二评论'),false);
  route='/engage/comments-agg';mount++;render();await until(()=>document.querySelector('[aria-label="互动账号筛选"]')?.value==='a');eq(body().includes('QA作品二评论'),true);eq(body().includes('QA作品一回复'),false);[...document.querySelectorAll('button')].find(b=>b.textContent.includes('展开回复')).click();await until(()=>body().includes('QA作品一回复'));
  eq(requests.some(r=>r.url==='/api/comments'),false);eq(document.querySelectorAll('webview').length,0);
  // Rebinding the same local account cannot reuse the old selected work key.
  route='/engage/comments';accounts=[{...accounts[0],connectorSessionId:'rebound-session'},...accounts.slice(1)];workspace.accounts=accounts;mount++;render();await until(()=>accountButton('a'));accountButton('a').click();await until(()=>workRail().textContent.includes('QA甲作品一'));eq(body(),'');
  owner='qa-different-owner';mount++;render();await until(()=>accountButton('a'));eq(body(),'');eq(document.querySelector('[aria-pressed="true"]'),null);
  owner='qa-owner';accounts=[{...accounts[0],connectorSessionId:'session-a'},...accounts.slice(1)];workspace.accounts=accounts;
  // A task receipt selects the real platform work; receipt IDs must never be
  // passed to the native comment feed or used to silently select all works.
  const receiptCalls=[];let delayedReceipt;
  window.matrixDesktop.oneClickComments=async input=>{receiptCalls.push(input);assert.equal(input.command,'single-state');if(input.args.source.receiptId==='delayed')await new Promise(r=>delayedReceipt=r);return{result:{target:{accountId:'a',accountName:'QA账号甲',platform:'douyin',workId:'1001',title:'QA原任务作品',workUrl:'https://www.douyin.com/video/1001'},running:false,batches:[]}};};
  search='?commentReceipt=original&commentAccount=a&commentPlatform=douyin';mount++;render();await until(()=>document.body.textContent.includes('已关联原发布任务'));eq(body().includes('QA作品一评论'),true);eq(body().includes('QA作品二评论'),false);eq(workRail().querySelector('[aria-pressed="true"]').getAttribute('data-interaction-post-id'),'1001');eq([...document.querySelectorAll('button')].find(b=>b.textContent==='一键评论').disabled,false);eq(receiptCalls.length,1);
  accountButton('b').click();await until(()=>workRail().textContent.includes('QA乙作品'));eq(document.body.textContent.includes('QA原任务作品'),false);eq(body().includes('QA作品一评论'),false);
  search='?commentReceipt=delayed&commentAccount=a&commentPlatform=douyin';render();await until(()=>delayedReceipt);accountButton('b').click();await until(()=>workRail().textContent.includes('QA乙作品'));delayedReceipt();await new Promise(r=>setTimeout(r,60));eq(document.body.textContent.includes('QA原任务作品'),false);eq(body().includes('QA作品一评论'),false);eq(receiptCalls.every(c=>c.command==='single-state'),true);search='';
  entries.a.works=Array.from({length:101},(_,i)=>({platformId:i===0?'2001':String(10000+i),title:'QA分页监控作品'+i}));entries.a.rows=[{...entries.a.rows[0],workId:'2001'},{...entries.a.rows[1],workId:'2001'}];
  const Monitor=loadTs('client/src/components/workspace/DouyinCommentMonitor.tsx',cache,overrides).DouyinCommentMonitorPanel;component.render(React.createElement(Monitor));await until(()=>document.querySelectorAll('[aria-label="抖音作品评论监控"] article').length===100);
  eq(document.body.textContent.includes('102 个本机缓存作品'),true);eq(document.querySelector('article small').textContent.includes('已缓存 2 条评论'),true);[...document.querySelectorAll('button')].find(button=>button.textContent==='下一页').click();await until(()=>document.querySelectorAll('article').length===2);eq(document.querySelectorAll('article').length,2);eq([...document.querySelectorAll('article small')].some(node=>node.textContent.includes('QA账号乙 · 已缓存 1 条评论')),true);eq([...document.querySelectorAll('button')].find(button=>button.textContent==='下一页').disabled,true);
  return{checks,actualCommentsPage:true,singleWorkAndAggregateSeparated:true,zeroAndRestrictedWorksSelectable:true,routeAndRemountPreferencesPreserved:true,accountAndBindingIsolation:true,realPlatformRequests:0,businessWrites:0};
 }finally{component.unmount();}
}
module.exports={run};
if(process.type==='renderer') module.exports={run};
else if(!process.versions.electron){const{spawnSync}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const r=spawnSync(path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe'),[__filename],{cwd:root,windowsHide:true,env,encoding:'utf8',timeout:45000});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
else{const{app,BrowserWindow}=require('electron'),fs=require('node:fs'),os=require('node:os');app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-comment-mode-ui-')));app.whenReady().then(async()=>{let win;try{win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});const origin='https://comment-mode.fixture.test/';win.webContents.session.webRequest.onBeforeRequest((r,done)=>done({cancel:r.url!==origin}));win.webContents.session.protocol.handle('https',()=>new Response('<div id="root"></div>',{headers:{'content-type':'text/html'}}));await win.loadURL(origin);await win.webContents.insertCSS(fs.readFileSync(path.join(root,'client/src/workspace.css'),'utf8'));console.log(JSON.stringify(await win.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).run()`)));}catch(e){console.error(e);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}});}

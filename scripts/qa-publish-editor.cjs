// Mount the real React editors in a fresh, hidden Electron profile. All account,
// media and queue boundaries are in-memory fixtures: no services or platforms.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('./qa-console-pipe.cjs').guardQaConsolePipes();

async function runEditorTests() {
  const assert = require('node:assert/strict');
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { loadTs } = require('./qa-load-typescript.cjs');
  // data: is intentionally offline/non-secure; production runs on the trusted
  // local app origin. Supply only this missing web primitive in the fixture.
  Object.defineProperty(window.crypto,'randomUUID',{value:require('node:crypto').randomUUID,configurable:true});
  const style=document.createElement('style');
  style.textContent=['client/src/workspace.css','client/src/publish-config.css'].map(file=>require('node:fs').readFileSync(path.join(root,file),'utf8')).join('\n');
  document.head.append(style);
  document.getElementById('root').style.cssText='height:100vh;overflow:auto';
  const cache = new Map(), overrides = new Map();
  const fixture = { token: 'qa-only-token', path: '/publish/create', accounts: [], starts: [], navigations: [], toasts: [], mediaChecks: [], hidden: 0, seeds: new Map(), validate: async () => ({ valid: true }) };
  const stub = (file, exports) => cache.set(path.join(root, file), { exports });
  const toast = Object.fromEntries(['error','success','info'].map(kind => [kind, message => fixture.toasts.push({ kind, message })]));
  overrides.set('sonner', { toast });
  overrides.set('react-router-dom', { useLocation: () => ({ pathname: fixture.path, state: null }), useNavigate: () => (...args) => fixture.navigations.push(args) });
  stub('client/src/api/index.ts', { getAuthToken: () => fixture.token, getUser: () => ({ id: 'qa-disposable-owner' }), axiosForBackend: { get: async url => { assert.equal(url, '/api/content/posts'); return { data: { data: { items: [] } } }; } } });
  stub('client/src/components/workspace/OfficialWorkspace.tsx', { platformLabels: { douyin:'抖音',xiaohongshu:'小红书',wechat:'视频号',bilibili:'B站' }, useOfficialWorkspace: () => ({ hide: () => fixture.hidden++, publisher: () => { throw Error('No official browser is allowed in editor admission QA'); } }), OfficialActionButton: () => null });
  const queue = { running: false, jobs: [], start: requests => fixture.starts.push({ kind:'single', requests }), startMany: groups => fixture.starts.push({ kind:'batch', groups }) };
  stub('client/src/components/workspace/PublishQueue.tsx', { usePublishQueue: () => ({ queue }) });
  stub('client/src/components/workspace/publish-preferences.ts', { loadPublishAccounts: async () => fixture.accounts, readPublishPreferences: () => ({ remember:false,configs:{} }), savePublishPreferences: () => {} });
  // Keep the actual account form, covers, schedule and editor state. Only the
  // external account chooser/avatar/dynamic-official-page boundaries are stubs.
  stub('client/src/components/workspace/PublishAccountPicker.tsx', { PublishAccountPicker: () => null, PublishAccountAvatar: () => null, PublishPlatformIcon: () => null });
  stub('client/src/components/workspace/OfficialOptionPicker.tsx', { dynamicField: () => undefined, OfficialOptionPicker: () => null });
  const draftFile = 'client/src/components/workspace/local-publish-drafts.ts';
  const drafts = loadTs(draftFile, cache, overrides), saved = [];
  stub(draftFile, { ...drafts, draftPreferences: () => ({ auto:false }), saveLocalDraft: draft => saved.push(draft), removeLocalDraft: () => {} });
  const { PublishEditorStateProvider, usePublishEditorValue } = loadTs('client/src/components/workspace/PublishEditorState.tsx', cache, overrides);
  const Single = loadTs('client/src/pages/publish/ContentCreateRealPage.tsx', cache, overrides).default;
  const Batch = loadTs('client/src/pages/publish/BatchDraftPage.tsx', cache, overrides).default;
  const componentRoot = createRoot(document.getElementById('root'));
  let mounted = true, show = true, mountNumber = 0, checks = 0;
  function Seed({ children }) { for (const [key, value] of fixture.seeds) usePublishEditorValue(key, () => value); return children; }
  function render() { componentRoot.render(React.createElement(PublishEditorStateProvider, { key:mountNumber }, show ? React.createElement(Seed, null, React.createElement(fixture.path === '/publish/create' ? Single : Batch)) : null)); }
  const sleep = () => new Promise(resolve => setTimeout(resolve, 15));
  async function until(predicate, description) { for (let n = 0; n < 150; n++) { if (predicate()) return; await sleep(); } throw Error(`Editor fixture timed out: ${description}; fixture page: ${document.body.innerText.slice(0,1000)}; toasts: ${JSON.stringify(fixture.toasts)}`); }
  const findButton = text => [...document.querySelectorAll('button')].find(button => text.test(button.textContent));
  const singleButton = () => findButton(/^一键发布（/);
  const batchButton = () => findButton(/^一键分发$/);
  const errorText = () => document.querySelector('[data-publish-preflight-errors]')?.textContent || '';
  const input = (selector, value) => {
    const node = document.querySelector(selector); assert.ok(node, `Missing input: ${selector}`); assert.equal(node.disabled, false);
    Object.getOwnPropertyDescriptor(node.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles:true }));
  };
  const config = title => ({ title,body:'QA 保留的简介',topics:[],comment:'',options:{} });
  const media = id => ({ id,mediaType:'video',files:[{name:`${id}.mp4`,size:1000}] });
  const account = { id:'qa-account',nickname:'QA 本人',platform:'xiaohongshu',connectorSessionId:'qa-session' };
  async function mount(page, seeds, targets = [account]) {
    show = false; render(); await sleep();
    Object.assign(fixture, { path:page,accounts:targets,starts:[],navigations:[],toasts:[],mediaChecks:[],hidden:0,seeds:new Map(Object.entries(seeds)),validate:async () => ({valid:true}) });
    fixture.token='qa-only-token'; mountNumber++; show=true; render();
    await until(() => (page === '/publish/create' ? singleButton() : batchButton())?.disabled === false, 'editor ready');
  }
  window.matrixDesktop = { validatePublishMedia: async request => { fixture.mediaChecks.push(request); return fixture.validate(request); } };
  try {
    await mount('/publish/create', { 'single:selected':[account.id],'single:common':config(''),'single:media':media('qa-single') });
    singleButton().click(); await until(() => /请填写作品标题/.test(errorText()), 'missing title shown');
    assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);assert.equal(fixture.mediaChecks.length,0);assert.equal(document.querySelector('#publish-content').value,'QA 保留的简介');assert.equal(document.activeElement,document.querySelector('[data-publish-preflight-errors]'));checks+=5;
    await until(() => document.querySelector('#publish-title')?.disabled === false, 'editor unlocks after invalid admission');
    input('#publish-title','QA 合法标题');await until(() => !errorText(), 'title error clears');
    fixture.validate = async () => ({error:'封面1已失效、移动或修改，请重新选择'});
    singleButton().click();await until(() => /封面1已失效/.test(errorText()), 'file error shown');
    assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);assert.equal(document.querySelector('#publish-title').value,'QA 合法标题');assert.equal(fixture.hidden,0);checks+=4;
    let resolveLate;
    fixture.validate = () => new Promise(resolve => { resolveLate=resolve; });
    singleButton().click();await until(() => resolveLate, 'delayed check started');singleButton().click();
    assert.equal(fixture.mediaChecks.length,2,'Disabled/repeated clicks must not start a second check');
    show=false;render();await sleep();resolveLate({valid:true});await sleep();
    assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);checks+=3;
    show=true;render();await until(()=>singleButton()?.disabled===false,'return to editor');
    assert.equal(document.querySelector('#publish-title').value,'QA 合法标题');assert.equal(document.querySelector('#publish-content').value,'QA 保留的简介');assert.match(document.querySelector('.matrix-dropzone').textContent,/qa-single.mp4/);checks+=3;
    await mount('/publish/create', { 'single:selected':[account.id],'single:common':config('QA 通用标题'),'single:configs':{[account.id]:config('')},'single:overrides':{current:new Map([[account.id,new Set(['title'])]])},'single:media':media('qa-override') });
    singleButton().click();await until(() => /QA 本人.*作品标题/.test(errorText()), 'account title override checked');
    assert.equal(fixture.starts.length,0);assert.equal(document.querySelector('#publish-title').value,'QA 通用标题');checks+=2;
    await until(()=>document.querySelector('#account-title')?.disabled===false,'account form unlocks after invalid admission');
    input('#account-title','QA 专属标题');await until(() => !errorText(), 'account correction applied');
    singleButton().click();await until(() => fixture.starts.length===1,'valid single admitted');
    assert.equal(fixture.starts[0].requests[0].config.title,'QA 专属标题');assert.equal(fixture.hidden,1);assert.deepEqual(fixture.navigations,[['/publish/tasks']]);checks+=3;
    const row = (id,title) => ({id,title,content:'QA 批量简介',saved:false,media:media(id)});
    await mount('/publish/batch-video', { 'batch-video:selected':[account.id],'batch-video:rows':[row('qa-first','QA 第一篇'),row('qa-second','')] });
    batchButton().click();await until(() => /第2篇.*作品标题/.test(errorText()), 'batch item error');
    assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);assert.equal(fixture.mediaChecks.length,0);assert.equal(document.querySelector('[aria-label="内容1标题"]').value,'QA 第一篇');checks+=4;
    input('[aria-label="内容2标题"]','QA 第二篇');await until(() => !errorText(),'batch correction');
    fixture.validate = async request => request.selectionId === 'qa-second' ? {error:'原素材已移动或修改，请重新选择'} : {valid:true};
    batchButton().click();await until(() => /第2篇.*原素材已移动或修改/.test(errorText()), 'batch file error');
    assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);assert.equal(fixture.mediaChecks.length,2);checks+=3;
    const ownerResolvers=[];
    fixture.validate = () => new Promise(resolve => { ownerResolvers.push(resolve); });
    batchButton().click();await until(() => fixture.mediaChecks.length===4, 'batch check pending');
    fixture.token='qa-different-user';ownerResolvers.forEach(resolve=>resolve({valid:true}));await until(()=>fixture.toasts.some(item=>/登录用户已变化/.test(item.message)),'owner change stopped');
    assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);checks+=2;
    await mount('/publish/batch-video', { 'batch-video:selected':[account.id],'batch-video:rows':[row('qa-route','QA 路由切换')] });
    fixture.validate = () => new Promise(resolve => { resolveLate=resolve; });resolveLate=undefined;
    batchButton().click();await until(() => resolveLate,'route check pending');
    fixture.path='/publish/batch-image';render();await sleep();resolveLate({valid:true});await sleep();
    assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);assert.equal(batchButton().disabled,false);assert.equal(fixture.toasts.length,0);checks+=4;
    const image = id => ({ id,mediaType:'image',files:[{name:`${id}-1.png`,size:1000},{name:`${id}-2.jpg`,size:1000}] });
    await mount('/publish/create', { 'single:selected':[account.id],'single:common':config('QA 单条图文'),'single:media-type':'image','single:media':image('qa-single-image') });
    singleButton().click();await until(()=>fixture.starts.length===1,'single image admitted');
    assert.deepEqual(fixture.starts[0].requests.map(item=>item.media),[image('qa-single-image')]);checks++;
    await mount('/publish/batch-image', { 'batch-image:selected':[account.id],'batch-image:rows':[row('qa-wrong-video','QA 错误类型')] });
    batchButton().click();await until(()=>/本条应使用图文/.test(errorText()),'reject wrong material before preflight');
    assert.equal(fixture.starts.length,0);assert.equal(fixture.mediaChecks.length,0);checks+=2;
    const imageRows = ['qa-first-image','qa-second-image'].map(id=>({...row(id,id),media:image(id)}));
    await mount('/publish/batch-image', { 'batch-image:selected':[account.id],'batch-image:rows':imageRows });
    batchButton().click();await until(()=>fixture.starts.length===1,'batch image admitted');
    assert.deepEqual(fixture.starts[0].groups.map(group=>group.map(item=>item.media)),imageRows.map(item=>[item.media]));
    assert.deepEqual(fixture.navigations,[['/publish/tasks']]);checks+=2;
    await mount('/publish/create', { 'single:selected':[account.id],'single:common':config('QA 取消后保留'),'single:media':media('qa-cancel') });
    fixture.validate=()=>new Promise(resolve=>{resolveLate=resolve;});resolveLate=undefined;
    singleButton().click();await until(()=>resolveLate && findButton(/^取消检查$/),'cancel control available');
    assert.match(document.querySelector('[data-publish-preflight-status]').textContent,/尚未上传，也未创建发布任务/);
    const scrollArea=document.getElementById('root');scrollArea.scrollTop=scrollArea.scrollHeight;await sleep();
    const status=document.querySelector('[data-publish-preflight-status]');
    assert.equal(getComputedStyle(status).position,'sticky');assert.ok(status.getBoundingClientRect().top>=0 && status.getBoundingClientRect().bottom<window.innerHeight,'Preflight status/cancel must remain visible at the bottom of a long form');checks+=2;
    findButton(/^取消检查$/).click();await until(()=>singleButton().disabled===false,'cancel releases form lock');
    assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);assert.equal(document.querySelector('#publish-title').value,'QA 取消后保留');checks+=4;
    fixture.validate=async()=>({valid:true});singleButton().click();await until(()=>fixture.starts.length===1,'retry after cancelled check');
    resolveLate({valid:true});await sleep();assert.equal(fixture.starts.length,1,'Late cancelled results must not enqueue an extra task');assert.equal(fixture.navigations.length,1);checks+=2;
    await mount('/publish/batch-video', { 'batch-video:selected':[account.id],'batch-video:rows':[row('qa-batch-cancel','QA 批量取消后保留')] });
    fixture.validate=()=>new Promise(resolve=>{resolveLate=resolve;});resolveLate=undefined;
    batchButton().click();await until(()=>resolveLate && findButton(/^取消检查$/),'batch cancel available');
    findButton(/^取消检查$/).click();await until(()=>batchButton().disabled===false,'batch cancellation unlocks editor');
    resolveLate({valid:true});await sleep();assert.equal(fixture.starts.length,0);assert.equal(fixture.navigations.length,0);assert.equal(document.querySelector('[aria-label="内容1标题"]').value,'QA 批量取消后保留');checks+=3;
    await mount('/publish/batch-video', { 'batch-video:selected':[account.id],'batch-video:rows':[row('qa-first','QA 第一篇'),row('qa-second','QA 第二篇')] });
    batchButton().click();await until(() => fixture.starts.length===1,'valid batch admitted');
    assert.equal(fixture.starts[0].groups.length,2);assert.equal(fixture.hidden,1);assert.deepEqual(fixture.navigations,[['/publish/tasks']]);checks+=3;
    // Legacy blank settings render the same defaults that admission sends. The
    // form does not rewrite saved drafts just by rendering; explicit AI choices
    // and settings on other accounts remain untouched.
    const biliAccount={...account,platform:'bilibili'},declarationSelect=()=>document.querySelector('[aria-label="QA 本人-创作声明"]');
    await mount('/publish/create', {'single:selected':[account.id],'single:common':config('QA 默认声明'),'single:media':media('qa-bili-default')},[biliAccount]);
    await until(()=>declarationSelect()?.value==='内容无需标注','visible default on single form');
    assert.match(document.querySelector('.matrix-platform-account-form').textContent,/含 AI、虚构演绎、营销/);checks++;
    singleButton().click();await until(()=>fixture.starts.length===1,'single default declaration admitted');
    assert.equal(fixture.starts[0].requests[0].config.extras.创作声明,'内容无需标注');assert.equal(fixture.starts[0].requests[0].account.platform,'bilibili');checks+=2;
    await mount('/publish/create',{'single:selected':[account.id],'single:common':{...config('QA完整B站简介'),body:'字'.repeat(2000),topics:['独立标签']},'single:media':media('qa-bili-description')},[biliAccount]);
    singleButton().click();await until(()=>fixture.starts.length===1,'Bili real2000description boundary admitted');assert.equal(fixture.starts[0].requests[0].config.body.length,2000);assert.deepEqual(fixture.starts[0].requests[0].config.topics,['独立标签']);checks+=2;
    await mount('/publish/create',{'single:selected':[account.id],'single:common':{...config('QA超限保留'),body:'字'.repeat(2001)},'single:media':media('qa-bili-over-description')},[biliAccount]);
    singleButton().click();await until(()=>/2000/.test(errorText()),'Bili trueoverlimit rejectedbeforetask');assert.equal(fixture.starts.length,0);assert.equal(fixture.mediaChecks.length,0);assert.equal(document.querySelector('#publish-content').value.length,2001);checks+=3;
    const selectValue=(node,value)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('change',{bubbles:true}));};
    await mount('/publish/create',{'single:selected':[account.id],'single:common':config('QA 已选AI声明'),'single:configs':{[account.id]:{...config('QA 已选AI声明'),extras:{创作声明:'含AI生成内容'}}},'single:media':media('qa-bili-ai')},[biliAccount]);
    await until(()=>declarationSelect()?.value==='含AI生成内容','explicit declaration preserved');
    input('#publish-title','QA 编辑标题不覆盖声明');await until(()=>document.querySelector('#publish-title').value==='QA 编辑标题不覆盖声明','title edited');
    singleButton().click();await until(()=>fixture.starts.length===1,'single explicit declaration admitted');
    assert.equal(fixture.starts[0].requests[0].config.extras.创作声明,'含AI生成内容');checks++;
    await mount('/publish/batch-video',{'batch-video:selected':[account.id],'batch-video:rows':[row('qa-bili-batch-one','QA 一'),row('qa-bili-batch-two','QA 二')],'batch-video:configs':{[account.id]:{...config(''),options:{originality:'转载'},extras:{转载来源:'https://example.org/authorized-source'}}}},[biliAccount]);
    await until(()=>declarationSelect()?.value==='内容为转载','repost default on batch form');
    selectValue(document.querySelector('[aria-label="QA 本人-类型"]'),'自制');await until(()=>declarationSelect()?.value==='内容无需标注','implicit default follows changed originality');checks++;
    selectValue(declarationSelect(),'含AI生成内容');await until(()=>declarationSelect()?.value==='含AI生成内容','batch explicit AI choice');
    selectValue(document.querySelector('[aria-label="QA 本人-类型"]'),'转载');await until(()=>document.querySelector('[aria-label="QA 本人-类型"]').value==='转载','batch type changed');
    assert.equal(declarationSelect().value,'含AI生成内容');checks++;
    selectValue(declarationSelect(),'');await until(()=>declarationSelect()?.value==='内容为转载','blank returns to truthful repost default');
    batchButton().click();await until(()=>fixture.starts.length===1,'batch defaults admitted');
    assert.equal(fixture.starts[0].groups.length,2);for(const group of fixture.starts[0].groups)assert.equal(group[0].config.extras.创作声明,'内容为转载');checks+=3;
    // Mount the real optional-cover control. Cancelling native selection keeps
    // Selecting the checkbox after media selection must extract as well. It
    // never replaces an actual manually entered title.
    await mount('/publish/create',{'single:selected':[account.id],'single:common':config(''),'single:media':media('自动.提取标题')});
    const autoToggle=()=>document.querySelector('input[type=checkbox][aria-label="自动提取"]');
    autoToggle().click();await until(()=>document.querySelector('#publish-title').value==='自动.提取标题','extract after file already selected');checks++;
    input('#publish-title','本人编辑标题');await until(()=>document.querySelector('#publish-title').value==='本人编辑标题','manual title');autoToggle().click();await sleep();autoToggle().click();await sleep();assert.equal(document.querySelector('#publish-title').value,'本人编辑标题');checks++;
    // Full native-sidecar result through the actual hook, editor and chip UI.
    let extractCalls=0, extractionResolve;
    window.matrixDesktop.extractPublishMedia=async request=>{extractCalls++;assert.equal(request.selectionId,'qa-sidecars');return {body:'同名文件简介\n#健身 #学习 #健身',notices:['未找到同名封面（.jpg / .jpeg / .png / .webp）']};};
    await mount('/publish/create',{'single:common':{...config(''),body:''},'single:media':media('qa-sidecars'),'single:auto-extract':true});
    await until(()=>document.querySelector('#publish-content').value==='同名文件简介','sidecar description populated');
    assert.equal(document.querySelector('#publish-title').value,'qa-sidecars');assert.equal(document.querySelectorAll('.matrix-topic-input [data-topic]').length || document.querySelectorAll('.matrix-topic-input button').length,2);assert.equal(extractCalls,1);checks+=3;
    assert.match(document.querySelector('[data-publish-extraction-status]').textContent,/未找到同名封面/);checks++;
    document.querySelector('.matrix-auto-extract').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await sleep();assert.equal(document.querySelector('.matrix-auto-extract-popover'),null);checks++;
    autoToggle().dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await sleep();assert.equal(document.querySelector('.matrix-auto-extract-popover'),null);assert.equal(autoToggle().type,'checkbox');checks+=2;
    document.querySelector('[aria-label="自动提取设置"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await until(()=>document.querySelector('[role=dialog][aria-label="自动提取设置"]'),'text-only hover extraction popover');
    assert.equal(document.querySelectorAll('.matrix-auto-extract-popover input[type=checkbox]').length,4);checks++;
    document.querySelector('[aria-label="自动提取设置"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!document.querySelector('.matrix-auto-extract-popover'),'escape closes settings');checks++;
    window.matrixDesktop.extractPublishMedia=()=>new Promise(resolve=>{extractionResolve=resolve;});
    await mount('/publish/create',{'single:common':{...config(''),body:''},'single:media':media('qa-late-sidecar'),'single:auto-extract':true});
    await until(()=>extractionResolve && document.querySelector('[data-publish-extraction-status="reading"]'),'pending extraction');
    input('#publish-content','本人中途编辑');await sleep();extractionResolve({body:'不得覆盖 #旧话题'});await until(()=>document.querySelector('[data-publish-extraction-status="complete"]'),'late extraction finishes');assert.equal(document.querySelector('#publish-content').value,'本人中途编辑');checks++;
    extractionResolve=undefined;
    await mount('/publish/create',{'single:common':{...config(''),body:''},'single:media':media('qa-cancel-sidecar'),'single:auto-extract':true});
    await until(()=>extractionResolve,'cancel extraction pending');autoToggle().click();await sleep();extractionResolve({body:'关闭后不应写入 #旧话题'});await sleep();assert.equal(document.querySelector('#publish-content').value,'');assert.equal(document.querySelector('#publish-title').value,'');checks+=2;
    delete window.matrixDesktop.extractPublishMedia;
    await mount('/publish/create',{'single:selected':[account.id],'single:common':config('标题'.repeat(10)+'字'),'single:media':media('qa-title-21')});
    singleButton().click();await until(()=>fixture.starts.length===1,'21-character title not blocked by local reference');assert.equal(fixture.starts[0].requests[0].config.title.length,21);assert.equal(fixture.navigations.length,1);checks+=2;
    // Common pin intent is retained, but only Bili's account form can execute
    // its adapted pin path. Unsupported platforms must not claim support.
    const pinConfig={...config('QA追评配置'),comment:'QA追评',pinComment:false};
    await mount('/publish/create',{'single:selected':[account.id],'single:common':pinConfig,'single:media':media('qa-comment-controls')});
    const commonPin=()=>document.querySelector('[aria-label="通用追评置顶"]');
    const accountPin=()=>document.querySelector('[aria-label="QA 本人-追评置顶"]');
    assert.equal(commonPin().disabled,false);assert.equal(accountPin().disabled,false);checks+=2;
    commonPin().click();await until(()=>commonPin().checked,'common pin intent retained');
    singleButton().click();await until(()=>fixture.starts.length===1,'unsupported platform retains comment without claiming pin');
    assert.equal(fixture.starts[0].requests[0].config.pinComment,true);assert.equal(fixture.starts[0].requests[0].config.comment,'QA追评');checks+=2;
    await mount('/publish/create',{'single:selected':[account.id],'single:common':pinConfig,'single:media':media('qa-bili-comment-controls')},[biliAccount]);
    await until(()=>accountPin()?.disabled===false,'Bili pin control enabled');accountPin().click();await until(()=>accountPin().checked,'per-account pin override');
    singleButton().click();await until(()=>fixture.starts.length===1,'Bili pin intent admitted');assert.equal(fixture.starts[0].requests[0].config.pinComment,true);checks++;
    // Mount the real optional-cover control. Cancelling native selection keeps
    // automatic mode; clearing custom covers preserves all text and video data.
    const {PublishCovers}=loadTs('client/src/components/workspace/PublishCommonExtras.tsx',cache,overrides);
    let coverConfig={...config('QA 自动封面'),topics:['QA'],covers:[]},coverPicks=0,pickedCover;
    window.matrixDesktop.chooseMedia=async type=>{assert.equal(type,'image');coverPicks++;return pickedCover?{selection:pickedCover}:{};};
    const drawCovers=()=>componentRoot.render(React.createElement(PublishCovers,{config:coverConfig,disabled:false,change:next=>{coverConfig=next;drawCovers();}}));
    drawCovers();await until(()=>document.querySelector('input[type=radio]'),'cover modes');
    const coverRadios=()=>[...document.querySelectorAll('input[type=radio]')];
    assert.equal(coverRadios()[0].checked,true);assert.equal(document.querySelector('.matrix-cover-upload'),null);checks+=2;
    coverRadios()[1].click();await sleep();assert.equal(coverPicks,1);assert.equal(coverRadios()[0].checked,true);checks+=2;
    pickedCover={id:'qa-custom-cover',mediaType:'image',files:[{name:'qa-cover.jpg',size:1}]};
    coverRadios()[1].click();await until(()=>coverRadios()[1].checked,'custom cover chosen');assert.equal(coverConfig.covers[0].id,pickedCover.id);checks++;
    coverRadios()[0].click();await until(()=>coverRadios()[0].checked,'return to automatic cover');
    assert.deepEqual(coverConfig.covers,[]);assert.equal(coverConfig.title,'QA 自动封面');assert.equal(coverConfig.body,'QA 保留的简介');assert.deepEqual(coverConfig.topics,['QA']);assert.equal(document.querySelector('.matrix-cover-upload'),null);checks+=5;
    return {editorInteractionChecks:checks,realReactEditors:true,realAccountForms:true,optionalAutomaticCover:true,invalidAdmissionPreservesContent:true,cancellablePreflightPreservesContent:true,lateOwnerAndRouteResultsBlocked:true,servicesStarted:false,realPlatformActions:false};
  } finally { if (mounted) { componentRoot.unmount(); mounted=false; } style.remove();delete window.matrixDesktop; }
}

if (process.type === 'renderer') module.exports = { runEditorTests };
else if (process.versions.electron) {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const fs = require('node:fs'), os = require('node:os');
  app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'matrix-editor-qa-')));
  app.commandLine.appendSwitch('mute-audio');
  app.whenReady().then(async () => {
    let window;
    const timeout=setTimeout(() => { console.error('Offline editor QA deadline exceeded');app.exit(1); },45000);
    try {
      window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,partition:'qa-editor-disposable'}});
      ipcMain.handle('qa:topic-pointer',(event,point)=>{if(event.sender.id!==window.webContents.id || !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x<0 || point.y<0 || point.x>=1440 || point.y>=1000)throw Error('Pointer outside disposable editor');window.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});return true;});
      window.webContents.setAudioMuted(true);
      window.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.error('QA renderer: '+message);});
      window.webContents.session.webRequest.onBeforeRequest((request,callback) => callback({cancel:!request.url.startsWith('data:')}));
      await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'unsafe-inline\'"><div id=root></div>'));
      const result=await window.webContents.executeJavaScript(`require(${JSON.stringify(__filename)}).runEditorTests()`);
      console.log(JSON.stringify(result));
      const draftResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-draft-editor-ui.cjs'))}).runDraftEditorUiTests()`);
      console.log(JSON.stringify(draftResult));
      const topicResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-publish-topic-ui.cjs'))}).runTopicUiTests()`);
      console.log(JSON.stringify(topicResult));
      const phaseResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-publish-phase-ui.cjs'))}).runPhaseUiTests()`);
      console.log(JSON.stringify(phaseResult));
      const feedbackResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-feedback-ui.cjs'))}).runFeedbackUiTests()`);
      console.log(JSON.stringify(feedbackResult));
      const startupResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-initialization-ui.cjs'))}).runInitializationUiTests()`);
      console.log(JSON.stringify(startupResult));
      const identityResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-account-identity-ui.cjs'))}).runAccountIdentityUiTests()`);
      console.log(JSON.stringify(identityResult));
      const profileRefreshResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-account-profile-refresh-ui.cjs'))}).runAccountProfileRefreshUiTests()`);
      console.log(JSON.stringify(profileRefreshResult));
      const analyticsResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-analytics-ui.cjs'))}).runAnalyticsUiTests()`);
      console.log(JSON.stringify(analyticsResult));
      const auditResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-account-data-audit-ui.cjs'))}).runAccountDataAuditUiTests()`);
      console.log(JSON.stringify(auditResult));
      const followerMonitorResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-follower-monitor-ui.cjs'))}).runFollowerMonitorUiTests()`);
      console.log(JSON.stringify(followerMonitorResult));
      const priorityResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-douyin-priority-ui.cjs'))}).runDouyinPriorityUiTests()`);
      console.log(JSON.stringify(priorityResult));
      const pickerResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-publish-account-picker-ui.cjs'))}).runPublishAccountPickerUiTests()`);
      console.log(JSON.stringify(pickerResult));
      const interactionResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-interaction-state-ui.cjs'))}).runInteractionStateUiTests()`);
      console.log(JSON.stringify(interactionResult));
      const optionsResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-official-options-ui.cjs'))}).runOfficialOptionsUiTests()`);
      console.log(JSON.stringify(optionsResult));
      const submitResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-publish-submit-ui.cjs'))}).runPublishSubmitUiTests()`);
      console.log(JSON.stringify(submitResult));
      const followupResult=await window.webContents.executeJavaScript(`require(${JSON.stringify(path.join(__dirname,'qa-publish-followup-ui.cjs'))}).runPublishFollowupUiTests()`);
      console.log(JSON.stringify(followupResult));
    } catch(error) { console.error(error);process.exitCode=1; }
    finally { clearTimeout(timeout);window?.destroy();app.exit(process.exitCode || 0); }
  });
} else {
  const fs=require('node:fs'), {spawnSync}=require('node:child_process');
  const cached=path.join(root,'.desktop-deps/node_modules/electron/dist/electron.exe');
  const result=spawnSync(fs.existsSync(cached)?cached:require('electron'),[__filename],{cwd:root,windowsHide:true,encoding:'utf8',timeout:60000});
  process.stdout.write(result.stdout || '');process.stderr.write(result.stderr || '');
  if(result.error)console.error(result.error.message);
  process.exitCode=result.status ?? 1;
}

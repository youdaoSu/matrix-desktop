// Real React restoration/auto-save effects in the existing disposable renderer.
// Services, installed profile and official pages are never used.
async function runDraftEditorUiTests(){
 const assert=require('node:assert/strict'),path=require('node:path'),React=require('react'),{createRoot}=require('react-dom/client');
 const {loadTs}=require('./qa-load-typescript.cjs'),root=path.resolve(__dirname,'..'),cache=new Map(),overrides=new Map();
 const fixture={path:'/publish/create',state:null,owner:'draft-owner',saved:[],removed:[],errors:[],accounts:[],starts:[],auto:true,retain:true};
 const previousStorage=Object.getOwnPropertyDescriptor(window,'localStorage'),storage=new Map();
 Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{const before=JSON.parse(storage.get(key)||'[]');storage.set(key,value);if(key.startsWith('matrix-local-publish-drafts:'))for(const draft of JSON.parse(value))if(!before.some(item=>JSON.stringify(item)===JSON.stringify(draft)))fixture.saved.push(structuredClone(draft));}}});
 let draw=()=>{};
 const stub=(file,exports)=>cache.set(path.join(root,file),{exports});
 overrides.set('react-router-dom',{useLocation:()=>({pathname:fixture.path,state:fixture.state}),useNavigate:()=> (url,options)=>{fixture.path=url;if(options?.replace)fixture.state=options.state;draw();}});
 overrides.set('sonner',{toast:{error:m=>fixture.errors.push(m),success:()=>{},info:()=>{}}});
 stub('client/src/api/index.ts',{getUser:()=>({id:fixture.owner}),getAuthToken:()=>fixture.owner,axiosForBackend:{get:async()=>({data:{data:{items:[]}}})}});
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{platformLabels:{},useOfficialWorkspace:()=>({hide:()=>{},publisher:()=>{throw Error('No official page in draft QA');}}),OfficialActionButton:()=>null});
 stub('client/src/components/workspace/PublishQueue.tsx',{usePublishQueue:()=>({queue:{running:false,jobs:[],start:requests=>fixture.starts.push(requests),startMany:groups=>fixture.starts.push(groups)}})});
 stub('client/src/components/workspace/publish-preferences.ts',{loadPublishAccounts:async()=>fixture.accounts});
 stub('client/src/components/workspace/PublishAccountPanel.tsx',{PublishAccountPanel:()=>null});
 const drafts=loadTs('client/src/components/workspace/local-publish-drafts.ts',cache,overrides);
 const previousDesktop=window.matrixDesktop;
 stub('client/src/components/workspace/local-publish-drafts.ts',{...drafts,draftPreferences:()=>({auto:fixture.auto,retain:fixture.retain}),removeLocalDraft:(...args)=>{fixture.removed.push(args[0]);drafts.removeLocalDraft(...args);}});
 const {PublishEditorStateProvider}=loadTs('client/src/components/workspace/PublishEditorState.tsx',cache,overrides);
 const Single=loadTs('client/src/pages/publish/ContentCreateRealPage.tsx',cache,overrides).default,Batch=loadTs('client/src/pages/publish/BatchDraftPage.tsx',cache,overrides).default;
 const component=createRoot(document.getElementById('root'));
 draw=()=>component.render(React.createElement(PublishEditorStateProvider,null,fixture.path==='/publish/create'?React.createElement(Single):fixture.path.startsWith('/publish/batch-')?React.createElement(Batch):null));
 const pause=()=>new Promise(r=>setTimeout(r,15)),until=async(fn,label)=>{for(let i=0;i<150;i++){if(fn())return;await pause();}throw Error('Draft UI timeout: '+label+'; fixture errors: '+JSON.stringify(fixture.errors)+'; preflight: '+(document.querySelector('[data-publish-preflight-errors]')?.textContent||''));};
 const readyClick=async(find,label)=>{await until(()=>{const button=find();return button&&!button.disabled;},label);find().click();};
 const draft=(id,title,source='single')=>({ownerId:fixture.owner,id,source,title,updatedAt:'2026-01-01T00:00:00Z',mediaType:source==='batch-image'?'image':'video',config:{title,body:'body '+title,topics:['topic'],comment:'',options:{}},configs:{},files:[id+'.mp4'],accounts:[],...(source==='single'?{}:{rows:[{id:'row-'+id,title,content:'body '+title,files:[id+'.mp4']}]})});
 const input=(selector,value)=>{const n=document.querySelector(selector);assert.ok(n);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}));};
 let checks=0;
 try{
  fixture.state={localDraft:draft('one','Draft one')};draw();await until(()=>fixture.saved.some(d=>d.id==='one'),'first save');
  const untouchedStamp=fixture.saved.at(-1).updatedAt;fixture.path='/publish/tasks';fixture.state=null;draw();await pause();fixture.path='/publish/create';draw();await until(()=>document.querySelector('#publish-title')?.value==='Draft one','untouched return');await pause();
  assert.equal(fixture.saved.at(-1).updatedAt,untouchedStamp,'Leaving and returning without edits must not invent a new draft revision');checks++;
  const beforeRemoval=drafts.readLocalDrafts().find(d=>d.id==='one');drafts.removeLocalDraft('one',beforeRemoval.updatedAt,beforeRemoval.revisionId);
  fixture.path='/publish/tasks';draw();await pause();fixture.path='/publish/create';draw();await until(()=>document.querySelector('#publish-title')?.value==='Draft one','removed unchanged return');await pause();
  assert.ok(!drafts.readLocalDrafts().some(d=>d.id==='one'),'An unchanged route return cannot resurrect an intentionally removed draft');checks++;
  input('#publish-title','Actual new edit');await until(()=>drafts.readLocalDrafts().some(d=>d.id==='one'&&d.config.title==='Actual new edit'),'new edit after removal');assert.notEqual(drafts.readLocalDrafts().find(d=>d.id==='one').revisionId,beforeRemoval.revisionId);checks++;
  const start=fixture.saved.length;fixture.state={localDraft:draft('two','Draft two')};draw();await until(()=>document.querySelector('#publish-title')?.value==='Draft two'&&fixture.saved.length>start,'same-page restoration');
  assert.ok(fixture.saved.slice(start).filter(d=>d.id==='two').every(d=>d.config.title==='Draft two'),'Restoration must never save old title under the new draft ID');checks++;
  fixture.state={localDraft:{...draft('two','New revision'),updatedAt:'2026-01-02T00:00:00Z'}};draw();await until(()=>document.querySelector('#publish-title')?.value==='New revision','same-ID newer revision');checks++;
  fixture.state={localDraft:{...draft('two','Nonce first'),updatedAt:'2026-01-02T00:00:00Z',revisionId:crypto.randomUUID()}};draw();await until(()=>document.querySelector('#publish-title')?.value==='Nonce first','same-time new token first');
  fixture.state={localDraft:{...draft('two','Nonce second'),updatedAt:'2026-01-02T00:00:00Z',revisionId:crypto.randomUUID()}};draw();await until(()=>document.querySelector('#publish-title')?.value==='Nonce second','same-time new token second');checks+=2;
  const settingsDraft={...draft('two','Settings revision'),revisionId:crypto.randomUUID(),singleSettings:{syncFields:['title'],overrides:{'qa-override':['body']},autoExtract:true}};drafts.saveLocalDraft(settingsDraft);fixture.state={localDraft:settingsDraft};draw();await until(()=>document.querySelector('#publish-title')?.value==='Settings revision','settings restored');await pause();
  assert.equal(document.querySelector('.matrix-sync-fields'),null);assert.deepEqual(drafts.readLocalDrafts().find(d=>d.id==='two').singleSettings,{...settingsDraft.singleSettings,syncFields:['title','body','topics','comment'],extraction:{cover:true,title:true,body:true,topics:true},taskControls:{batchName:'单条分发',initialState:'execute'}});checks+=2;
  document.querySelector('[aria-label="自动提取设置"]').click();await until(()=>document.querySelector('[aria-label="封面：读取同名文件"]'),'extraction settings visible');document.querySelector('[aria-label="封面：读取同名文件"]').click();await until(()=>drafts.readLocalDrafts().find(d=>d.id==='two').singleSettings.extraction.cover===false,'extraction-only setting persists');checks++;
  await until(()=>drafts.readLocalDrafts().find(d=>d.id==='two').singleSettings.syncFields.includes('body'),'all fields synchronized without toggles');const settingsVersion=drafts.readLocalDrafts().find(d=>d.id==='two');assert.notEqual(settingsVersion.revisionId,settingsDraft.revisionId);checks++;
  component.render(null);await pause();fixture.state={localDraft:settingsVersion};draw();await until(()=>document.querySelector('#publish-title')?.value==='Settings revision','cold component restore');await pause();assert.equal(document.querySelector('.matrix-sync-fields'),null);assert.equal(drafts.readLocalDrafts().find(d=>d.id==='two').revisionId,settingsVersion.revisionId);checks+=2;
  document.querySelector('[aria-label="自动提取设置"]').click();await until(()=>document.querySelector('[aria-label="封面：读取同名文件"]'),'restored extraction panel');assert.equal(document.querySelector('[aria-label="封面：读取同名文件"]').checked,false);checks++;
  input('#publish-title','Edited two');await until(()=>fixture.saved.at(-1)?.config.title==='Edited two','edited draft');
  fixture.path='/publish/tasks';fixture.state=null;draw();await pause();fixture.path='/publish/create';draw();await until(()=>document.querySelector('#publish-title')?.value==='Edited two','route return');
  await pause();assert.deepEqual(fixture.saved.at(-1).files,['two.mp4'],'Display-only filenames must survive a route return');checks++;
  [...document.querySelectorAll('button')].find(b=>b.textContent==='清空').click();await until(()=>document.querySelector('#publish-title')?.value==='','single clear');await pause();
  assert.ok(fixture.removed.includes('two'));assert.ok(!fixture.saved.slice(start).some(d=>d.id!=='two'&&d.config.title==='Edited two'));checks+=2;
  fixture.path='/publish/batch-video';fixture.state={localDraft:draft('batch-one','Batch one','batch-video')};draw();await until(()=>fixture.saved.some(d=>d.id==='batch-one'),'batch first');
  window.matrixDesktop={chooseMedia:async()=>({selection:{id:'qa-live-media-only',mediaType:'video',files:[{name:'batch-one.mp4',size:12,modified:1}]}})};
  [...document.querySelectorAll('button')].find(b=>b.textContent==='选择素材').click();await until(()=>document.querySelector('.matrix-batch-media [data-preview-selection="qa-live-media-only"]'),'batch selected live material');assert.match(document.querySelector('.matrix-batch-media').textContent,/batch-one.mp4/);checks++;
  const batchStart=fixture.saved.length,otherBatch=draft('batch-two','Batch two','batch-video');otherBatch.rows[0].id='row-batch-one';otherBatch.rows[0].files=['batch-one.mp4'];fixture.state={localDraft:otherBatch};draw();await until(()=>fixture.saved.length>batchStart&&document.querySelector('[aria-label="内容1标题"]')?.value==='Batch two','batch same-page restore');
  assert.ok(fixture.saved.slice(batchStart).filter(d=>d.id==='batch-two').every(d=>d.rows[0].title==='Batch two'),'Batch restore must not transiently overwrite another draft');checks++;
  assert.match(document.querySelector('.matrix-batch-media small').textContent,/本条素材供所选账号复用/,'Another draft cannot borrow a live media handle just because row ID and basename match');checks++;
  fixture.path='/publish/batch-image';fixture.state={localDraft:draft('wrong-video','Do not import','batch-video')};draw();await pause();
  assert.notEqual(document.querySelector('[aria-label="内容1标题"]')?.value,'Do not import','A video draft cannot initialize the image editor');checks++;
  fixture.path='/publish/batch-video';fixture.state=null;draw();await until(()=>document.querySelector('[aria-label="内容1标题"]')?.value==='Batch two','batch route return');checks++;
  fixture.state={localDraft:{...draft('batch-two','Batch new revision','batch-video'),updatedAt:'2026-01-03T00:00:00Z'}};draw();await until(()=>document.querySelector('[aria-label="内容1标题"]')?.value==='Batch new revision','batch same-ID revision');checks++;
  fixture.state={localDraft:{...draft('batch-two','Batch nonce revision','batch-video'),updatedAt:'2026-01-03T00:00:00Z',revisionId:crypto.randomUUID()}};draw();await until(()=>document.querySelector('[aria-label="内容1标题"]')?.value==='Batch nonce revision','batch same-time new token');checks++;
  const batchVersion=drafts.readLocalDrafts().find(d=>d.id==='batch-two');fixture.path='/publish/tasks';fixture.state=null;draw();await pause();fixture.path='/publish/batch-video';draw();await until(()=>document.querySelector('[aria-label="内容1标题"]')?.value==='Batch nonce revision','batch untouched return');await pause();assert.equal(drafts.readLocalDrafts().find(d=>d.id==='batch-two').revisionId,batchVersion.revisionId);checks++;
  [...document.querySelectorAll('button')].find(b=>/^清空本页数据/.test(b.textContent)).click();await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='确认'),'batch clear confirm');
  [...document.querySelectorAll('button')].find(b=>b.textContent==='确认').click();await until(()=>document.querySelector('[aria-label="内容1标题"]')?.value==='','batch clear done');
  assert.ok(fixture.removed.includes('batch-two'));assert.equal(fixture.state,null);checks+=2;
  fixture.path='/publish/create';fixture.state={localDraft:draft('private-old','Foreign old draft')};fixture.owner='other-owner';draw();await pause();
  assert.notEqual(document.querySelector('#publish-title')?.value,'Foreign old draft','Browser history from another Matrix owner cannot restore its draft');checks++;
  // Real admission path carries only a matching saved version. The queue here
  // records arguments instead of creating any platform task or page.
  fixture.path='/publish/tasks';fixture.state=null;draw();await pause();
  fixture.owner='draft-owner';fixture.retain=false;fixture.accounts=['a','b'].map(id=>({id,nickname:'QA '+id,platform:'xiaohongshu',connectorSessionId:'qa-own-session'}));
  const selectedDraft=(id,title,source='single')=>({...draft(id,title,source),accounts:fixture.accounts.map(({id,nickname,platform})=>({id,nickname,platform}))});
  let picked=0;window.matrixDesktop={importMedia:async()=>{throw Error('No drag/drop allowed in admission fixture');},chooseMedia:async()=>({selection:{id:'qa-admission-'+(++picked),mediaType:'video',files:[{name:'qa-'+picked+'.mp4',size:12,modified:1}]}}),validatePublishMedia:async()=>({valid:true})};
  fixture.path='/publish/create';fixture.state={localDraft:selectedDraft('admission-one','QA one')};draw();await until(()=>document.querySelector('#publish-title')?.value==='QA one'&&fixture.saved.some(d=>d.id==='admission-one'),'single admission ready');
  const beforePick=fixture.saved.length;await readyClick(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='选择本机素材'),'single picker enabled');await until(()=>fixture.saved.length>beforePick,'single media revision saved');
  const admittedRevision=drafts.readLocalDrafts().find(d=>d.id==='admission-one').revisionId;
  await readyClick(()=>[...document.querySelectorAll('button')].find(b=>/^一键发布（/.test(b.textContent)),'single publish enabled');await until(()=>fixture.starts.length===1,'single origin admission');
  assert.equal(fixture.starts[0].length,2);assert.ok(fixture.starts[0].every(r=>r.draft.revisionId===admittedRevision&&r.draft.ownerId===fixture.owner&&r.draft.retain===false&&r.draft.accountIds.length===2));checks+=2;
  fixture.path='/publish/batch-video';const batchAdmission=selectedDraft('admission-batch','QA row one','batch-video');batchAdmission.rows.push({...batchAdmission.rows[0],id:'row-two',title:'QA row two'});fixture.state={localDraft:batchAdmission};draw();await until(()=>document.querySelectorAll('.matrix-batch-row').length===2,'batch admission ready');
  for(let i=0;i<2;i++){const count=fixture.saved.length;await readyClick(()=>[...document.querySelectorAll('.matrix-batch-row')[i].querySelectorAll('button')].find(b=>['选择素材','重新上传'].includes(b.textContent)),'batch picker enabled');await until(()=>fixture.saved.length>count,'batch material revision');}
  const batchRevision=drafts.readLocalDrafts().find(d=>d.id==='admission-batch').revisionId;
  await readyClick(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='一键分发'),'batch publish enabled');await until(()=>fixture.starts.length===2,'batch origin admission');const admitted=fixture.starts[1].flat();
  assert.equal(admitted.length,4);assert.ok(admitted.every(r=>r.draft.revisionId===batchRevision&&r.draft.rowIds.length===2&&r.draft.accountIds.length===2));assert.equal(new Set(admitted.map(r=>JSON.stringify([r.draft.rowId,r.account.id]))).size,4);checks+=3;
  fixture.auto=false;const savedOld={...selectedDraft('unsaved-origin','Saved title'),revisionId:crypto.randomUUID()};drafts.saveLocalDraft(savedOld);fixture.path='/publish/create';fixture.state={localDraft:savedOld};draw();await until(()=>document.querySelector('#publish-title')?.value==='Saved title','autosave disabled restore');
  await readyClick(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='选择本机素材'),'unsaved picker enabled');await until(()=>document.querySelector('.matrix-media-guidance [data-preview-selection]'),'unsaved media chosen');assert.match(document.querySelector('.matrix-editor-media-filenames').textContent,/qa-/);await until(()=>document.querySelector('#publish-title')?.disabled===false,'unsaved editing enabled');input('#publish-title','Unsaved title');await pause();
  await readyClick(()=>[...document.querySelectorAll('button')].find(b=>/^一键发布（/.test(b.textContent)),'unsaved publish enabled');await until(()=>fixture.starts.length===3,'unsaved origin admission');assert.ok(fixture.starts[2].every(r=>r.draft===undefined));assert.equal(drafts.readLocalDrafts().find(d=>d.id==='unsaved-origin').config.title,'Saved title');checks+=2;
  return{draftEditorLifecycleChecks:checks,realReactEffects:true,servicesStarted:false,realStorageTouched:false,officialActions:false};
 }finally{component.unmount();window.matrixDesktop=previousDesktop;if(previousStorage)Object.defineProperty(window,'localStorage',previousStorage);else delete window.localStorage;}
}
module.exports={runDraftEditorUiTests};

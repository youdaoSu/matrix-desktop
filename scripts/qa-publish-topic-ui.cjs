// Real React input and tooltip in the disposable editor window. No platforms.
async function runTopicUiTests(){
 const assert=require('node:assert/strict'),path=require('node:path'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
 const root=path.resolve(__dirname,'..'),cache=new Map(),originalStorage=Object.getOwnPropertyDescriptor(window,'localStorage'),memory=new Map();let owner='qa-topic-a',values=['初始'],disabled=false,quota=false,checks=0;
 Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>{if(quota)throw Error('QA quota');memory.set(key,value);}}});
 const style=document.createElement('style');style.textContent=['workspace.css','publish-config.css'].map(name=>require('node:fs').readFileSync(path.join(root,'client/src',name),'utf8')).join('\n');document.head.append(style);
 cache.set(path.join(root,'client/src/api/index.ts'),{exports:{getUser:()=>({id:owner})}});
 const{PublishTopicInput}=loadTs('client/src/components/workspace/PublishTopicInput.tsx',cache),{PublishTaskStageNote}=loadTs('client/src/components/workspace/PublishStepProgress.tsx',cache);
 const component=createRoot(document.getElementById('root')),pause=()=>new Promise(resolve=>setTimeout(resolve,15));let mode='topics',limits={};
 const job={id:'qa',stage:'uploading',executionStage:'uploading',uploadPercent:25,message:'已上传16.0MB/90.4MB；当前速度4.2MB/s',history:[],submission:'not_submitted'};
 const draw=()=>component.render(mode==='topics'?React.createElement(PublishTopicInput,{id:'qa-topic-input',label:'QA话题',value:values,disabled,...limits,change:next=>{values=next;draw();}}):React.createElement('div',{style:{padding:100}},React.createElement(PublishTaskStageNote,{job})));
 const until=async(fn,label)=>{for(let i=0;i<120;i++){if(fn())return;await pause();}throw Error('Topic UI timeout: '+label+' '+document.body.innerText);};
 const input=()=>document.querySelector('#qa-topic-input'),chips=()=>[...document.querySelectorAll('.matrix-topic-token')];
 const type=value=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));};
 const enter=()=>{const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});input().dispatchEvent(event);return event;};
 try{
  draw();await until(input,'mounted');assert.equal(chips().length,1);assert.equal(input().value,'');checks+=2;
  type('新');await until(()=>values.at(-1)==='新','pending included immediately');type('新话题');await until(()=>values.at(-1)==='新话题','draft amended');assert.deepEqual(values,['初始','新话题']);assert.equal(chips().length,1);assert.equal(enter().defaultPrevented,true);await until(()=>chips().length===2 && input().value==='','token committed');checks+=3;
  type('#面试 #产品经理，agent;后端开发');await until(()=>values.includes('后端开发'),'multi-separator data retained');assert.deepEqual(values,['初始','新话题','面试','产品经理','agent','后端开发']);enter();await until(()=>chips().length===6,'all boxes');assert.ok(chips().every(node=>node.querySelector('button[aria-label^="移除话题 "]')));checks+=2;
  type('面试 ');await pause();assert.equal(values.filter(value=>value==='面试').length,1);checks++;
  document.querySelector('button[aria-label="移除话题 产品经理"]').click();await until(()=>!values.includes('产品经理'),'one chip removed');assert.equal(values.length,5);checks++;
  type('发布前未敲回车');await until(()=>values.at(-1)==='发布前未敲回车','uncommitted publication data');assert.ok(input().value);checks++;
  values=[];draw();await until(()=>!chips().length && input().value==='','external clear cannot resurrect draft');checks++;
  input().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));type('工作 机会');await pause();assert.equal(chips().length,0);input().dispatchEvent(new CompositionEvent('compositionend',{data:'工作 机会',bubbles:true}));await pause();enter();await until(()=>chips().length===2,'IME result committed after composition');assert.deepEqual(values,['工作','机会']);checks+=2;
  values=['长'.repeat(41)];draw();await until(()=>document.querySelector('[role=alert]'),'long token warning');assert.equal(values[0].length,41);assert.equal(chips().length,1);checks+=2;
  values=Array.from({length:16},(_,i)=>'标签'+i);draw();await until(()=>chips().length===16,'over-limit retained');assert.match(document.querySelector('[role=alert]').textContent,/15/);checks+=2;
  limits={maxTags:10,maxTagLength:20};values=['字'.repeat(21)];draw();await until(()=>chips().length===1&&/20/.test(document.querySelector('[role=alert]')?.textContent||''),'Bili per-tag warning');assert.equal(values[0].length,21);assert.equal(chips()[0].classList.contains('is-invalid'),true);checks+=2;
  values=Array.from({length:11},(_,i)=>'B站'+i);draw();await until(()=>chips().length===11,'Bili tags not silently dropped');assert.match(document.querySelector('[role=alert]').textContent,/10/);assert.equal(values.length,11);limits={};checks+=2;
  values=[];draw();await until(()=>!chips().length,'reset');quota=true;type('仍然可编辑 ');await until(()=>document.querySelector('[role=status]'),'quota explained');assert.deepEqual(values,['仍然可编辑']);quota=false;checks++;
  input().focus();type('最近A ');await until(()=>JSON.parse(memory.get('matrix-publish-recent-topics:qa-topic-a')).includes('最近A'),'owner recent saved');values=[];draw();await until(()=>!chips().length,'clear for recent');input().click();await until(()=>document.querySelector('[aria-label="最近使用话题"]'),'recent popup');assert.match(document.querySelector('[aria-label="最近使用话题"]').textContent,/最近A/);checks++;
  owner='qa-topic-b';draw();await until(()=>!document.querySelector('[aria-label="最近使用话题"]'),'owner isolation');input().blur();input().focus();await pause();assert.equal(document.querySelector('[aria-label="最近使用话题"]'),null);checks++;
  disabled=true;draw();await until(()=>input().disabled,'disabled');assert.equal(input().disabled,true);checks++;
  mode='stage';draw();await until(()=>document.querySelector('[data-publish-stage-message]'),'compact stage');assert.equal(document.querySelector('.matrix-task-stage-copy').textContent,'上传 25%');const note=document.querySelector('.matrix-task-stage-note'),bubble=document.querySelector('[role=tooltip]');assert.match(bubble.textContent,/16.0MB.*4.2MB/);assert.equal(getComputedStyle(bubble).visibility,'hidden');const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),pointer=point=>require('electron').ipcRenderer.invoke('qa:topic-pointer',point);
  // Reset the prior test's native hover target and wait for Chromium's new
  // hit-test tree, not merely React's synchronously laid-out DOM rectangle.
  await pointer({x:1,y:1});await frame();const rect=note.getBoundingClientRect();assert.ok(note.contains(document.elementFromPoint(rect.left+5,rect.top+5)));await pointer({x:Math.round(rect.left+5),y:Math.round(rect.top+5)});await until(()=>getComputedStyle(bubble).visibility==='visible','real pointer hover shows bubble');await pointer({x:1,y:1});await until(()=>getComputedStyle(bubble).visibility==='hidden','leaving stage hides bubble');assert.equal(note.getAttribute('aria-describedby'),bubble.id);checks+=6;
  assert.equal(bubble.parentElement,document.body,'Bubble portal must not be clipped by the scrolling task list');checks++;
  job.stage='paused';delete job.executionStage;draw();await until(()=>document.querySelector('.matrix-task-stage-copy').textContent.includes('已暂停'),'paused has no fabricated stage');assert.equal(document.querySelector('.matrix-task-stage-note').hasAttribute('data-execution-stage'),false);checks++;
  job.stage='confirmed';draw();await until(()=>!document.querySelector('.matrix-task-stage-note'),'success shows no stale phase');checks++;
  return{publishTopicAndStageUiChecks:checks,realReact:true,pendingTokenIncludedWithoutBlur:true,oneBoxPerTopic:true,imeAndDuplicatesHandled:true,invalidDataNotSilentlyDropped:true,ownerScopedLocalRecents:true,quotaDoesNotLoseContent:true,compactCurrentStageAndAccessibleBubble:true,noPlatformActions:true};
 }finally{component.unmount();style.remove();if(originalStorage)Object.defineProperty(window,'localStorage',originalStorage);else delete window.localStorage;}
}
module.exports={runTopicUiTests};

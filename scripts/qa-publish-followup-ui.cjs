// Runs in the existing disposable, network-blocked React editor fixture.
// Native actions are inert promises; never loads a real account or platform.
async function runPublishFollowupUiTests(){
  const assert=require('node:assert/strict'),path=require('node:path'),React=require('react');
  const {createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
  const root=path.resolve(__dirname,'..'),cache=new Map(),overrides=new Map();
  const stub=(file,exports)=>cache.set(path.join(root,file),{exports});
  let context,mounted=false,queue,checks=0,owner='qa-followup-owner',token='qa-followup-token';
  const oldDesktop=window.matrixDesktop,calls=[],notices=[];
  const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
  const until=async(fn,label)=>{for(let i=0;i<180;i++){if(fn())return;await pause();}throw Error('Followup UI timeout: '+label+'; '+document.body.innerText.slice(0,1200));};
  overrides.set('react',{...React,useContext:()=>context});
  overrides.set('react-router-dom',{useNavigate:()=>()=>{},Outlet:()=>null});
  overrides.set('sonner',{toast:{info:message=>notices.push(message),success:message=>notices.push(message),error:message=>notices.push(message)}});
  stub('client/src/api/index.ts',{getAuthToken:()=>token,getUser:()=>({id:owner}),axiosForBackend:{get:async url=>{assert.equal(url,'/api/platform/accounts');return{data:{data:{items:accounts}}};}}});
  stub('client/src/components/workspace/OfficialWorkspace.tsx',{platformLabels:{bilibili:'B站',xiaohongshu:'小红书',wechat:'视频号'},useOfficialWorkspace:()=>({accounts:[],tabs:[],refreshAccounts:async()=>{},hide:()=>{}})});
  stub('client/src/components/ui/button.tsx',{Button:({children,variant,size,asChild,...props})=>React.createElement('button',props,children)});
  stub('client/src/components/ui/dialog.tsx',{Dialog:({open,children})=>open?React.createElement('section',{'data-fixture-dialog':true},children):null,...Object.fromEntries(['DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle'].map(name=>[name,({children})=>React.createElement('div',null,children)]))});
  stub('client/src/components/workspace/PublishTaskAssets.tsx',{PublishTaskAvatar:()=>null,PublishTaskMedia:()=>null});
  const {createPublishQueue}=loadTs('client/src/components/workspace/publish-queue.ts',cache,overrides);
  const at=new Date().toISOString();
  const row=(id,status)=>({id:'qa-followup-'+id,batchId:'qa-batch',attemptId:'qa-attempt-'+id,receiptId:'qa-parent-'+id,accountId:'qa-account-'+id,platform:'bilibili',nickname:'QA '+id,title:'QA '+id,stage:'confirmed',submission:'submitted',message:'发布成功',history:[],files:[],createdAt:at,updatedAt:at,config:{title:'QA '+id,body:'',topics:[],comment:'QA '+id+'追评',pinComment:true,options:{}},followup:{status,message:'QA '+status,...(status==='confirmed'?{receiptId:'qa-child-'+id,commentId:'9988',pinResult:{status:'failed',message:'QA已有其他置顶'}}:{})}});
  const rows=[{...row('a','pending'),createdAt:'2026-10-29T12:00:00+08:00',updatedAt:'2026-10-31T12:00:00Z'},{...row('b','unknown'),platform:'wechat',createdAt:'2026-10-30T02:00:00Z'},{...row('c','confirmed'),platform:'xiaohongshu',createdAt:'2026-10-30T09:00:00+08:00'}];
  const accounts=rows.map(job=>({id:job.accountId,platform:job.platform,nickname:job.nickname,connectorSessionId:'qa-session-'+job.id}));
  window.matrixDesktop={publishFollowup:input=>new Promise(resolve=>calls.push({input,resolve}))};
  queue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();}},rows);
  const {PublishQueuePanel}=loadTs('client/src/components/workspace/PublishQueue.tsx',cache,overrides);
  const component=createRoot(document.getElementById('root'));
  function render(){context={queue,jobs:queue.jobs,stop:()=>queue.stop()};component.render(React.createElement(PublishQueuePanel));}
  const node=id=>document.querySelector(`[data-publish-job="${id}"]`);
  const action=(id,text)=>{const article=node(id);article.querySelectorAll('details').forEach(detail=>detail.open=true);return [...article.querySelectorAll('button')].find(button=>button.textContent===text);};
  const child=(job,patch={})=>({id:'qa-child-'+job.id,kind:'comments',followupOf:job.receiptId,accountId:job.accountId,platform:job.platform,taskId:job.id,attemptId:job.attemptId,status:'confirmed',message:'QA追评已确认',commentId:'9988',...patch});
  try{
    mounted=true;render();await until(()=>document.querySelectorAll('[data-publish-job]').length===3,'three rows');
    const order=()=>[...document.querySelectorAll('[data-publish-job]')].map(node=>node.dataset.publishJob);
    eq(order(),[rows[1].id,rows[2].id,rows[0].id]);
    eq(node(rows[2].id).textContent.includes('平台评论ID：9988'),true);
    eq(node(rows[2].id).textContent.includes('置顶：未完成'),true);
    eq(action(rows[1].id,'只核对追评结果').disabled,false);
    eq(!!action(rows[1].id,'处理追评（按作品ID）'),false);
    action(rows[0].id,'处理追评（按作品ID）').click();await until(()=>calls.length===1,'start first row');
    eq(order(),[rows[1].id,rows[2].id,rows[0].id]);
    eq(calls[0].input.operation,'start');eq(calls[0].input.receiptId,rows[0].receiptId);
    eq(queue.followupsRunning,true);eq(queue.running,false);
    eq(action(rows[0].id,'处理追评（按作品ID）').disabled,true);
    eq(action(rows[1].id,'只核对追评结果').disabled,false);
    action(rows[1].id,'只核对追评结果').click();await until(()=>calls.length===2,'independent verify row');
    eq(calls[1].input.operation,'verify');eq(calls[1].input.requestId,undefined);
    calls[0].resolve({receipt:child(rows[0],{attemptId:'qa-old-attempt'})});
    await until(()=>node(rows[0].id).querySelector('[role=alert]'),'reject old child attempt');
    eq(queue.jobs[0].followup.status,'pending');eq(queue.jobs[0].stage,'confirmed');
    calls[1].resolve({receipt:child(rows[1],{pinResult:{status:'failed',message:'QA置顶权限不足'}})});
    await until(()=>node(rows[1].id).textContent.includes('QA置顶权限不足'),'independent pin failure');
    eq(queue.jobs[1].stage,'confirmed');eq(queue.jobs[1].followup.status,'confirmed');
    eq(queue.jobs[1].followup.commentId,'9988');
    action(rows[2].id,'仅处理置顶（不重发追评）').click();await until(()=>calls.length===3,'pin only');
    eq(calls[2].input.operation,'pin');eq(calls[2].input.receiptId,rows[2].receiptId);
    calls[2].resolve({receipt:child(rows[2],{pinResult:{status:'confirmed',message:'QA置顶已确认'}})});
    await until(()=>node(rows[2].id).textContent.includes('置顶：已确认'),'pin state rendered');
    eq(queue.jobs.every(job=>job.stage==='confirmed'),true);
    eq(!!action(rows[2].id,'仅处理置顶（不重发追评）'),false);
    // A disconnected invocation must not modify a different owner/attempt.
    action(rows[0].id,'处理追评（按作品ID）').click();await until(()=>calls.length===4,'owner change read');
    owner='qa-other-owner';token='qa-other-token';calls[3].resolve({receipt:child(rows[0])});await pause();
    eq(queue.jobs[0].followup.status,'pending');
    // Real queue: publication is idle while a followup is running. The stop
    // control remains enabled; completed works are never re-sent or withdrawn.
    owner='qa-followup-owner';token='qa-followup-token';queue.dispose();let finish,started=false;
    queue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();},sleep:async()=>{},prepare:async r=>({accountId:r.account.id}),upload:async()=>({uploadStarted:true}),fill:async()=>({unresolved:[]}),progress:async()=>({ready:true}),inspect:async()=>({nonce:'qa',candidates:[{index:0}]}),submit:async entries=>({results:entries.map(entry=>({accountId:entry.accountId,receipt:{id:'qa-live-parent',kind:'publish',platform:'bilibili',accountId:entry.accountId,taskId:entry.taskId,attemptId:entry.attemptId,status:'confirmed',message:'发布成功'}}))}),followup:()=>{started=true;return new Promise(resolve=>finish=resolve);}});
    queue.start([{account:accounts[0],config:{...rows[0].config,extras:{'创作声明':'内容无需标注'}},media:{id:'qa-media',mediaType:'video',files:[{name:'qa.mp4',size:1}]}}]);
    await until(()=>started&&!queue.running&&queue.followupsRunning,'publisher idle and followup running');render();await until(()=>document.body.textContent.includes('正在追评'),'running rendered');
    const stop=[...document.querySelectorAll('button')].find(button=>button.textContent==='停止后续任务');eq(stop.disabled,false);
    const clear=[...document.querySelectorAll('button')].find(button=>button.textContent==='清空筛选记录');eq(clear.disabled,true);
    stop.click();finish({status:'confirmed',message:'QA追评已确认'});await until(()=>!queue.followupsRunning,'running action safely finishes');
    eq(queue.jobs[0].stage,'confirmed');
    queue.dispose();const fresh={...row('new','pending'),platform:'wechat'};fresh.config={...fresh.config,comment:''};accounts.push({id:fresh.accountId,platform:fresh.platform,nickname:fresh.nickname,connectorSessionId:'qa-session-new'});
    queue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();}},[fresh]);render();await until(()=>document.querySelector(`[aria-label="添加追评 ${fresh.id}"]`),'new intent action');
    document.querySelector(`[aria-label="添加追评 ${fresh.id}"]`).click();await until(()=>document.querySelector('[aria-label="原作品追评正文"]'),'original-work comment editor');
    const field=document.querySelector('[aria-label="原作品追评正文"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'功能测试追评（隔离）');field.dispatchEvent(new Event('input',{bubbles:true}));await pause();
    const priorCalls=calls.length;[...document.querySelectorAll('button')].find(button=>button.textContent==='发表追评并置顶').click();await until(()=>calls.length===priorCalls+1,'explicit original-work followup submitted');
    eq(calls.at(-1).input.comment,'功能测试追评（隔离）');eq(calls.at(-1).input.pin,true);eq(calls.at(-1).input.receiptId,fresh.receiptId);eq(queue.jobs[0].id,fresh.id);eq(queue.jobs[0].stage,'confirmed');eq(queue.running,false);
    calls.at(-1).resolve({receipt:child(fresh,{pinResult:{status:'confirmed',message:'QA置顶'}})});await until(()=>queue.jobs[0].followup.status==='confirmed','new intent acknowledged');
    assert.throws(()=>queue.setFollowupIntent(queue.jobs[0],'不能覆盖已发表追评',false),/不能覆盖/);checks++;
    queue.dispose();const reviewing={...row('review','pending'),verification:{state:'processing',message:'审核中',checkedAt:at},acceptedAt:at};reviewing.config={...reviewing.config,comment:''};
    queue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();}},[reviewing]);render();await until(()=>node(reviewing.id)?.textContent.includes('审核：待审核'),'accepted work moderation label');
    eq(node(reviewing.id).textContent.includes('发布成功'),true);eq(!!action(reviewing.id,'刷新审核状态'),true);eq(!!action(reviewing.id,'重发'),false);eq(!!action(reviewing.id,'添加追评'),false);
    queue.operationReceipt({id:reviewing.receiptId,kind:'publish',taskId:reviewing.id,attemptId:reviewing.attemptId,accountId:reviewing.accountId,platform:reviewing.platform,status:'confirmed',message:'发布成功；平台审核未通过',acceptedAt:at,verification:{state:'rejected',message:'官方具体原因',checkedAt:at}});await until(()=>node(reviewing.id).textContent.includes('审核：审核未通过'),'separate rejection');eq(node(reviewing.id).textContent.includes('发布成功'),true);eq(node(reviewing.id).textContent.includes('官方具体原因'),true);eq(!!action(reviewing.id,'重发'),false);
    // Destructive management has its own exact-target confirmation; opening or
    // cancelling the dialog must never invoke the native bridge.
    queue.dispose();const managed=row('manage','confirmed');managed.followup.commentText='QA original text';accounts.push({id:managed.accountId,platform:'bilibili',connectorSessionId:'qa-managed-session'});
    queue=createPublishQueue({current:()=>true,changed:()=>{if(mounted)render();}},[managed]);render();await until(()=>node(managed.id),'management row');
    const resumePin=[...node(managed.id).querySelectorAll('button')].find(button=>button.textContent==='继续置顶');
    eq(!!resumePin,true);eq(resumePin.closest('details'),null);
    const beforePin=calls.length;resumePin.click();await until(()=>calls.length===beforePin+1,'original pin without reopening comment');
    eq(calls.at(-1).input.operation,'pin');eq(calls.at(-1).input.receiptId,managed.receiptId);
    calls.at(-1).resolve({receipt:child(managed,{summary:'QA original text',pinResult:{status:'confirmed',message:'QA置顶成功'}})});
    await until(()=>node(managed.id).textContent.includes('置顶：已确认'),'pin reflected');
    eq([...node(managed.id).querySelectorAll('button')].some(button=>button.textContent==='继续置顶'),false);
    const beforeManagement=calls.length,dialogButton=text=>[...document.querySelectorAll('[data-fixture-dialog] button')].find(button=>button.textContent===text);
    action(managed.id,'删除原追评').click();await until(()=>dialogButton('确认删除原追评'),'delete confirmation');eq(calls.length,beforeManagement);eq(document.querySelector('[data-fixture-dialog]').textContent.includes('QA original text'),true);
    dialogButton('取消').click();await until(()=>!document.querySelector('[data-fixture-dialog]'),'cancelled without native write');eq(calls.length,beforeManagement);
    action(managed.id,'取消原追评置顶').click();await until(()=>dialogButton('确认取消置顶'),'unpin confirmation');dialogButton('确认取消置顶').click();await until(()=>calls.length===beforeManagement+1,'explicit unpin');
    eq(calls.at(-1).input.operation,'unpin');eq(calls.at(-1).input.expectedCommentId,'9988');eq(calls.at(-1).input.expectedComment,'QA original text');
    calls.at(-1).resolve({receipt:child(managed,{summary:'QA original text',pinResult:{status:'cancelled',message:'QA取消成功'},commentManagement:{operation:'unpin',status:'confirmed',commentId:'9988',message:'QA取消成功'}})});await until(()=>node(managed.id).textContent.includes('置顶：未置顶'),'unpin reflected');
    action(managed.id,'删除原追评').click();await until(()=>dialogButton('确认删除原追评'),'second delete confirmation');dialogButton('确认删除原追评').click();await until(()=>calls.length===beforeManagement+2,'explicit delete');
    eq(calls.at(-1).input.operation,'delete');eq(calls.at(-1).input.expectedCommentId,'9988');
    calls.at(-1).resolve({receipt:child(managed,{summary:'QA original text',commentManagement:{operation:'delete',status:'unknown',commentId:'9988',message:'QA删除待核对'}})});await until(()=>node(managed.id).textContent.includes('QA删除待核对'),'uncertain delete');
    eq(action(managed.id,'删除原追评').disabled,true);eq(action(managed.id,'取消原追评置顶').disabled,true);eq(action(managed.id,'仅处理置顶（不重发追评）').disabled,true);eq(action(managed.id,'只核对追评与置顶（不发送）').disabled,false);
    queue.operationReceipt(child(managed,{summary:'QA original text',commentDeleted:true,pinResult:{status:'cancelled',message:'QA删除成功'},commentManagement:{operation:'delete',status:'confirmed',commentId:'9988',message:'QA删除成功'}}));await until(()=>node(managed.id).textContent.includes('已删除（发表历史保留）'),'deleted history');
    eq(queue.jobs[0].stage,'confirmed');eq(queue.jobs[0].followup.status,'confirmed');eq(!!action(managed.id,'删除原追评'),false);eq(!!action(managed.id,'仅处理置顶（不重发追评）'),false);eq(!!action(managed.id,'重发追评'),false);
    return{followupReactChecks:checks,realQueueAndRowButtons:true,perRowActionsIndependent:true,exactOriginalAttemptRequired:true,unknownOnlyVerifies:true,pinFailureDoesNotUndoPublication:true,stopAvailableAfterPublication:true,confirmedManagementOnly:true,realPlatformActions:false};
  }finally{mounted=false;queue.dispose();component.unmount();for(const call of calls)call.resolve({error:'QA cleanup'});window.matrixDesktop=oldDesktop;}
}
module.exports={runPublishFollowupUiTests};

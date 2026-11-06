async function runFeedbackUiTests(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),path=require('node:path'),{loadTs}=require('./qa-load-typescript.cjs');
 const root=path.resolve(__dirname,'..'),cache=new Map(),overrides=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});
 let token='qa-feedback-owner',owner='qa-owner',resolvePost,calls=0,body,exported,checks=0;
 const wrapper=tag=>({children})=>React.createElement(tag,null,children);
 overrides.set('sonner',{toast:{error:message=>{throw Error(message);}}});
 stub('client/src/api/index.ts',{getAuthToken:()=>token,getUser:()=>({id:owner}),axiosForBackend:{post:async(url,input)=>{assert.equal(url,'/api/feedback/publish-errors');calls++;body=input;return new Promise(resolve=>{resolvePost=resolve;});}}});
 stub('client/src/components/ui/button.tsx',{Button:({children,variant,size,...props})=>React.createElement('button',props,children)});
 stub('client/src/components/ui/dialog.tsx',{Dialog:({open,children})=>open?React.createElement('section',null,children):null,...Object.fromEntries(['DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle'].map(name=>[name,wrapper('div')]))});
 window.matrixDesktop={systemSettings:async()=>({version:'2.10.0-rc.67'})};
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
 const originalClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){assert.match(this.download,/^YuanXiao-error-/);};
 URL.createObjectURL=blob=>{exported=blob;return 'blob:qa-report';};URL.revokeObjectURL=()=>{};
 const prevent=event=>{if(event.target.tagName==='A')event.preventDefault();};document.addEventListener('click',prevent,true);
 const {PublishErrorFeedback}=loadTs('client/src/components/workspace/PublishErrorFeedback.tsx',cache,overrides);
 const job={id:crypto.randomUUID(),batchId:crypto.randomUUID(),accountId:crypto.randomUUID(),platform:'wechat',nickname:'QA private nickname',title:'QA private title',files:['QA-private-video.mp4'],stage:'failed',submission:'not_submitted',executionStage:'filling',message:'缺少字段 QA private title; QA-private-video.mp4; Cookie=fixture-secret',updatedAt:new Date().toISOString(),createdAt:new Date().toISOString(),history:[],config:{title:'QA private title',body:'QA private body',topics:['QA private topic']}};
 const before=JSON.stringify(job),component=createRoot(document.getElementById('root')),pause=()=>new Promise(resolve=>setTimeout(resolve,15));
 const until=async(fn,label)=>{for(let n=0;n<120;n++){if(fn())return;await pause();}throw Error('Feedback UI timeout: '+label);};
 const button=text=>[...document.querySelectorAll('button')].find(item=>item.textContent===text);
 try{
  component.render(React.createElement(PublishErrorFeedback,{job}));await until(()=>button('反馈开发者'),'buttons');assert.equal(calls,0);checks++;
  button('导出错误报告').click();await until(()=>exported,'export');const output=await exported.text();assert.ok(!output.includes('QA private'));assert.ok(!output.includes('QA-private-video'));assert.ok(!output.includes('fixture-secret'));assert.equal(calls,0);checks+=4;
  button('反馈开发者').click();await until(()=>document.querySelector('[aria-label="脱敏错误报告预览"]'),'preview');assert.equal(calls,0);checks++;
  button('确认发送反馈').click();button('确认发送反馈')?.click();await until(()=>calls===1,'send');assert.equal(calls,1);assert.ok(button('正在反馈…').disabled);checks+=2;
  resolvePost({data:{data:{accepted:false}}});await until(()=>document.querySelector('[role=status]')?.textContent.includes('未确认接收'),'negative ack');assert.ok(!button('确认发送反馈').disabled);checks++;
  const reportId=body.report.reportId;button('确认发送反馈').click();await until(()=>calls===2,'retry');assert.equal(body.report.reportId,reportId);checks++;
  resolvePost({data:{data:{accepted:true,reportId,id:crypto.randomUUID(),delivery:'tunnel'}}});await until(()=>document.querySelector('[role=status]')?.textContent.includes('开发者反馈后端已接收'),'ack');assert.ok(button('确认发送反馈').disabled);checks++;
  button('关闭').click();await pause();button('反馈开发者').click();await until(()=>button('确认发送反馈') && !button('确认发送反馈').disabled,'new preview');token='another-user';owner='another-owner';button('确认发送反馈').click();await until(()=>document.querySelector('[role=status]')?.textContent.includes('登录用户已变化'),'owner guard');assert.equal(calls,2);assert.equal(JSON.stringify(job),before);checks+=2;
  component.render(React.createElement(PublishErrorFeedback,{job:{...job,stage:'confirmed'}}));await until(()=>!button('反馈开发者'),'success has no error controls');checks++;
  const followupJob={...job,stage:'confirmed',message:'发布成功',followup:{status:'confirmed',message:'追评已发表',commentId:'private-comment-id',pinResult:{status:'failed',message:'置顶无权限 QA private title; bili_jct=qa-private-csrf'}}};
  followupJob.verification={state:'confirmed',checkedAt:job.updatedAt,message:'Latest verification QA private title; Cookie=verification-secret'};
  component.render(React.createElement(PublishErrorFeedback,{job:followupJob}));await until(()=>button('反馈开发者'),'pin failure export available on published work');
  exported=undefined;button('导出错误报告').click();await until(()=>exported,'pin-only error export');const pinReport=JSON.parse(await exported.text());
  assert.equal(pinReport.stage,'confirmed');assert.equal(pinReport.relatedOperations[0].operation,'pin');assert.match(pinReport.error,/置顶/);assert.ok(!JSON.stringify(pinReport).includes('private-comment-id'));assert.ok(!JSON.stringify(pinReport).includes('qa-private-csrf'));assert.ok(!JSON.stringify(pinReport).includes('QA private title'));assert.equal(calls,2);assert.equal(followupJob.stage,'confirmed');checks+=8;
  return {feedbackUiChecks:checks,explicitPreviewAndConfirm:true,redactedExport:true,duplicateClickAndOwnerGuard:true,failedDeliveryNotAcknowledged:true,jobUnchanged:true,realReportsSent:false};
 }finally{component.unmount();URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;HTMLAnchorElement.prototype.click=originalClick;document.removeEventListener('click',prevent,true);delete window.matrixDesktop;}
}
module.exports={runFeedbackUiTests};

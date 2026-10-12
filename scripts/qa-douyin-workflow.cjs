const assert=require('node:assert/strict');
const {registerDouyinInteraction}=require('../desktop/douyin-interaction.cjs');
async function scenario(outcome,cleanupFails=false){
  const handlers={},stored=new Map(),commands=[];let following=false,url='https://www.douyin.com/video/123456',approval=1;
  const target='https://www.douyin.com/user/MS4wQA';
  const guest={id:1,getURL:()=>url,loadURL:async value=>{url=value;},executeJavaScriptInIsolatedWorld:async(_world,scripts)=>{
    const code=scripts[0].code,start=code.lastIndexOf('})("')+3,end=code.lastIndexOf('); } catch');
    const [command,input]=JSON.parse('['+code.slice(start,end)+']');commands.push({command,input});
    if(command==='verification')return {required:false};
    if(command==='comments')return {records:[{author:'QA recipient',authorProfileUrl:target,content:'求资料',replies:[]}]};
    if(command==='follow'){following=true;return {following:false};}
    if(command==='unfollow'){if(cleanupFails)return {error:'Fixture cleanup failed'};following=false;return {following:true};}
    if(command==='profile')return {following,nickname:'QA recipient'};
    if(command==='chat')return {ready:true,count:0};
    if(command==='reply-editor')return {ready:true};
    if(command==='fill-message'||command==='fill-reply')return {filled:true};
    if(command==='message-result')return outcome==='unknown'?{error:'Fixture ambiguous receipt'}:{status:outcome};
    if(command==='reply-result')return {confirmed:true};
    return {clicked:true,opened:true};
  }};
  registerDouyinInteraction({ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}},context:async()=>({guest,auth:{userId:'qa-owner',account:{nickname:'QA sender'}},win:{webContents:{send(){}}}}),journal:{write:r=>stored.set(r.id,{...r}),list:owner=>[...stored.values()].filter(r=>r.ownerId===owner)},dialog:{showMessageBox:async()=>({response:approval})},sleep:async()=>{}});
  const input={platform:'douyin',accountId:'qa-account',author:'QA recipient',authorProfileUrl:target,comment:'求资料',message:'测试消息',successReply:'发了',failedReply:'关注，看私信哈'};
  const result=await handlers['matrix:douyin-comment-workflow']({},input);
  assert.ok(result.receipt,JSON.stringify(result));
  assert.equal(result.receipt.messageStatus,outcome);
  assert.equal(result.receipt.followCleanup,cleanupFails?'pending':'confirmed');
  const replies=commands.filter(c=>c.command==='send-reply');
  assert.equal(replies.length,outcome==='unknown'?0:1);
  if(replies.length)assert.equal(replies[0].input.reply,outcome==='confirmed'?'发了':'关注，看私信哈');
  assert.equal(commands.filter(c=>c.command==='send-message').length,1);
  if(cleanupFails){cleanupFails=false;const recovered=await handlers['matrix:douyin-comment-workflow']({}, {...input,operation:'cleanup',recordId:result.receipt.id});assert.equal(recovered.receipt.followCleanup,'confirmed');assert.equal(following,false);}
  const repeated=await handlers['matrix:douyin-comment-workflow']({},input);assert.ok(repeated.error);assert.equal(commands.filter(c=>c.command==='send-message').length,1);
  const external=await handlers['matrix:douyin-comment-workflow']({}, {...input,authorProfileUrl:'https://example.com/user/MS4wQA'});assert.ok(external.error);
}
(async()=>{for(const outcome of ['confirmed','failed','unknown'])await scenario(outcome);await scenario('confirmed',true);console.log(JSON.stringify({douyinWorkflowScenarioCases:4,successAndFailureCleanup:true,recoveryAndDuplicateGuard:true,livePlatformWrites:false}));})().catch(e=>{console.error(e);process.exitCode=1;});

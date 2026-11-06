'use strict';
const {recipientIdentityScript}=require('./vendor/hengyuan-interactions/src/recipient-entry.cjs');
// A normal profile Follow only. Friend/follow applications are observed and
// excluded without clicking their request/confirmation controls.
function followDOM(action){
  const visible=n=>n&&n.getClientRects().length&&!n.closest('[hidden],[aria-hidden=true]')&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden';
  const text=n=>(n.textContent||'').replace(/\s+/g,'').trim();
  const clean=()=>![...document.querySelectorAll('textarea,[contenteditable=true],input:not([type=search]):not([type=hidden])')].some(n=>visible(n)&&(n.type==='password'||String(n.value||n.textContent||'').trim()));
  const dialogs=[...document.querySelectorAll('[role=dialog],[role=alertdialog],[aria-modal=true]')].filter(visible);
  const application=n=>/^(?:申请(?:关注|好友|添加好友)|请求关注|发送好友申请|需要申请好友|关注需.{0,8}同意|该用户.{0,8}申请关注|已申请|申请已发送|等待.{0,8}同意)/.test(text(n));
  if(dialogs.some(n=>/验证码|安全验证|登录|人机|captcha/i.test(text(n))))return {state:'verification-required',safeToClose:false};
  if(dialogs.length)return dialogs.every(n=>application(n))?{state:'friend-required',safeToClose:clean()}:{state:'unknown',safeToClose:false};
  const headings=[...document.querySelectorAll('h1')].filter(visible);
  if(headings.length!==1||!clean())return {state:'unknown',safeToClose:false};
  let buttons=[];
  for(let block=headings[0].parentElement,depth=0;block&&block!==document.body&&depth<6;block=block.parentElement,depth++){
    if(block.querySelectorAll('h1').length!==1)break;
    buttons=[...block.querySelectorAll('button,[role=button]')].filter(n=>visible(n)&&!n.closest('article,[class*=recommend],[class*=comment]')&&/^(?:\+?关注|回关|已关注|互相关注|朋友|申请关注|申请好友|已申请|请求关注)$/.test(text(n)));
    if(buttons.length)break;
  }
  if(buttons.length!==1)return {state:'unknown',safeToClose:false};
  const button=buttons[0],label=text(button);
  if(application(button))return {state:'friend-required',safeToClose:true};
  if(/^(?:已关注|互相关注|朋友)$/.test(label))return {state:'following',safeToClose:true};
  if(action!=='follow')return {state:'can-follow',safeToClose:true};
  if(button.disabled||button.getAttribute('aria-disabled')==='true'||getComputedStyle(button).pointerEvents==='none')return {state:'unknown',safeToClose:false};
  const rect=button.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
  if(rect.width<=0||rect.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||hit!==button&&!button.contains(hit))return {state:'unknown',safeToClose:false};
  button.click();return {state:'dispatched',changed:false,safeToClose:false};
}
function followScript(task,fan,action='inspect'){
  if(!['inspect','follow'].includes(action)||task.origin!=='own-fan'||task.platform!=='douyin'||task.accountId!==task.primaryAccountId||task.recipientId!==fan.id||task.profileUrl!==fan.profileUrl||!/^\d+$/.test(fan.uid))throw Error('普通关注的原账号或粉丝身份无效');
  const probe=recipientIdentityScript(task.profileUrl,task.senderBinding.identity,true);
  return `(()=>{if(location.href!==${JSON.stringify(task.profileUrl)})return {state:'identity-unverified',safeToClose:false};const inspect=(${followDOM.toString()})('inspect');if(inspect.state==='friend-required')return {...inspect,identity:${JSON.stringify(task.senderBinding.identity)}};const proof=${probe};if(proof?.ok!==true||proof.expectedIdentity!==${JSON.stringify(task.senderBinding.identity)}||proof.recipientId!==${JSON.stringify(fan.uid)})return {state:'identity-unverified',safeToClose:false};if(proof.privateProfile===true)return {state:'friend-required',safeToClose:true,identity:proof.expectedIdentity};return {...(${followDOM.toString()})(${JSON.stringify(action)}),identity:proof.expectedIdentity};})()`;
}
// Called by the native host only for a finalized, hidden follow helper page.
function discardFollowPage(){
  const visible=n=>n.getClientRects().length&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden';
  for(const n of document.querySelectorAll('textarea,[contenteditable=true],input:not([type=search]):not([type=hidden])'))if(visible(n)&&(n.type==='password'||String(n.value||n.textContent||'').trim()))return false;
  const dialogs=[...document.querySelectorAll('[role=dialog],[role=alertdialog],[aria-modal=true]')].filter(visible);
  return dialogs.every(n=>/^(?:申请(?:关注|好友|添加好友)|请求关注|发送好友申请|需要申请好友|关注需.{0,8}同意|该用户.{0,8}申请关注|已申请|申请已发送|等待.{0,8}同意)/.test((n.textContent||'').replace(/\s+/g,'')));
}
module.exports={followDOM,followScript,discardFollowPage};

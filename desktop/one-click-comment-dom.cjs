'use strict';
// Top-level public comment controls only. No reply menus, global send buttons,
// nickname-based receipts, captcha handling, or writes through internal stores.
function publicCommentDom(command,input){
  const text=e=>(e?.innerText||e?.textContent||'').replace(/\r\n?/g,'\n').trim();
  const visible=e=>{if(!e?.isConnected||!e.getClientRects().length)return false;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;}return true;};
  const query=(s,root=document)=>[...root.querySelectorAll(s)].filter(visible);
  const one=(s,root=document)=>{const rows=query(s,root);if(rows.length!==1)throw Error('官方评论控件未唯一定位，未发送');return rows[0];};
  const xhs=input.platform==='xiaohongshu',dy=input.platform==='douyin';
  if(!xhs&&!dy)throw Error('此平台未接入网页评论');
  const host=xhs?'www.xiaohongshu.com':'www.douyin.com',route=xhs?/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/:/^\/video\/([1-9]\d{9,24})\/?$/;
  if(location.protocol!=='https:'||location.hostname!==host||route.exec(location.pathname)?.[1]!==input.workId)throw Error('当前页面与已确认作品编号不一致');
  if(query('input[type=password],input[autocomplete=one-time-code],iframe[src*=captcha],[id*=captcha] input').length)throw Error('官网需要本人登录或验证，已暂停评论');
  const panel=xhs?one('.interaction-container'):document;
  const composer=xhs?one('.engage-bar-container',panel):one('.comment-input-inner-container');
  if(composer.closest('[data-e2e="comment-item"],.comment-item')||query('.reply-content',composer).length)throw Error('当前处于回复他人评论模式，未发送一级评论');
  const editor=one(xhs?'p#content-textarea.content-input[contenteditable=true]':'[contenteditable=true]',composer);
  const state=window.__yuanxiaoPublicComment;
  const rows=()=>{
    if(xhs)return query('.comment-item[id]',panel).slice(0,200).filter(r=>!r.parentElement.closest('.comment-item')).map(r=>{
      const authors=query('.author .name[data-user-id]',r).filter(e=>e.closest('.comment-item')===r),bodies=query('.content',r).filter(e=>e.closest('.comment-item')===r);
      return{id:/^comment-([a-zA-Z0-9_-]{1,80})$/.exec(r.id)?.[1],uid:authors.length===1?authors[0].getAttribute('data-user-id'):'',text:bodies.length===1?text(bodies[0]):''};
    }).filter(r=>r.id);
    return query('[data-e2e="comment-item"]').slice(0,200).filter(r=>!r.parentElement.closest('[data-e2e="comment-item"]')).map(r=>{
      let f=r[Object.keys(r).find(k=>k.startsWith('__reactFiber$'))],comment;
      for(let i=0;f&&i<8;i++,f=f.return){const p=f.memoizedProps;for(const c of [p?.comment,p?.commentInfo,p?.data])if(c&&typeof c.text==='string'&&typeof c.cid==='string'&&c.user){comment=c;break;}if(comment)break;}
      if(!comment||comment.reply_id&&String(comment.reply_id)!=='0')return null;
      const body=query('.FduGc_lz .Sh1Da424',r).filter(e=>e.closest('[data-e2e="comment-item"]')===r);
      return body.length===1&&text(body[0])===comment.text.trim()?{id:comment.cid,uid:String(comment.user.uid||''),text:comment.text.trim()}:null;
    }).filter(Boolean);
  };
  if(command==='prepare'){
    if(typeof input.text!=='string'||!input.text.trim()||input.text.length>500||!input.identity||!input.nonce)throw Error('评论参数无效');
    if(xhs){const selves=query('.user.side-bar-component a[href],.bottom-menu-component a[href]').filter(e=>text(e)==='我'||e.getAttribute('title')==='我');const ids=new Set(selves.map(a=>{try{return /^\/user\/profile\/([a-f0-9]{24})\/?$/.exec(new URL(a.href).pathname)?.[1];}catch{return undefined;}}).filter(Boolean));if(ids.size!==1||!ids.has(input.identity))throw Error('官网当前登录者与选定账号ID不一致或未读到，未发送');}
    if(text(editor)&&text(editor)!==input.text)throw Error('评论输入框已有其他草稿，未覆盖');
    const before=rows();if(before.some(r=>r.uid===input.identity&&r.text===input.text))throw Error('官网已存在该账号的相同评论，未重复发送');
    editor.focus();const range=document.createRange();range.selectNodeContents(editor);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand('insertText',false,input.text);
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    if(text(editor)!==input.text)throw Error('评论正文填写未通过核对，未提交');
    window.__yuanxiaoPublicComment={nonce:input.nonce,workId:input.workId,text:input.text,identity:input.identity,before:before.map(r=>r.id),used:false};return{prepared:true};
  }
  if(!state||state.nonce!==input.nonce||state.workId!==input.workId||state.text!==input.text||state.identity!==input.identity)throw Error('评论页面上下文已变化');
  if(command==='submit'){
    if(state.used||text(editor)!==state.text)throw Error('评论已提交或正文已变化，未重复发送');
    const button=one(xhs?'button.btn.submit':'.commentInput-right-ct span.wchsYBpK',composer);
    if(button.disabled||button.getAttribute('aria-disabled')==='true'||/disabled/.test(button.className))throw Error('评论发送按钮不可用');
    if(xhs&&!/^(发送|评论)$/.test(text(button)))throw Error('评论按钮含义已改变');
    button.scrollIntoView({block:'center'});const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    if(hit!==button&&!button.contains(hit))throw Error('评论按钮被其他控件遮挡，未点击');
    state.used=true;button.click();return{clicked:true};
  }
  if(command==='result'){
    const found=rows().filter(r=>!state.before.includes(r.id)&&r.uid===state.identity&&r.text===state.text);
    if(found.length===1)return{status:'confirmed',commentId:found[0].id,message:'已核对新评论ID、发送账号和完整正文'};
    return{status:'unknown',message:'尚未读到本条评论的准确ID，请核对原作品；不会重复发送'};
  }
  throw Error('不支持的评论步骤');
}
module.exports={publicCommentDom};

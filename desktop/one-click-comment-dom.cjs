'use strict';
// Top-level public comment controls only. No reply menus, global send buttons,
// nickname-based receipts, captcha handling, or writes through internal stores.
function publicCommentDom(command,input){
  const text=e=>(e?.innerText||e?.textContent||'').replace(/\r\n?/g,'\n').trim();
  const visible=e=>{if(!e?.isConnected||!e.getClientRects().length)return false;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;}return true;};
  const query=(s,root=document)=>[...root.querySelectorAll(s)].filter(visible);
  const one=(s,root=document)=>{const rows=query(s,root);if(rows.length!==1)throw Error('官方评论控件未唯一定位，未发送');return rows[0];};
  const clickVisible=el=>{el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit!==el&&!el.contains(hit))throw Error('评论控件被其他内容遮挡，未点击');el.click();};
  const xhs=input.platform==='xiaohongshu',dy=input.platform==='douyin';
  if(!xhs&&!dy)throw Error('此平台未接入网页评论');
  const host=xhs?'www.xiaohongshu.com':'www.douyin.com',route=xhs?/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/:/^\/(?:video|note)\/([1-9]\d{9,24})\/?$/;
  if(location.protocol!=='https:'||location.hostname!==host||route.exec(location.pathname)?.[1]!==input.workId)throw Error('当前页面与已确认作品编号不一致');
  if(query('input[type=password],input[autocomplete=one-time-code],iframe[src*=captcha],[id*=captcha] input').length)throw Error('官网需要本人登录或验证，已暂停评论');
  if(command==='ready'||command==='open-comments'){
    const panels=xhs?query('.interaction-container'): [document];if(panels.length>1)throw Error('官方作品面板不唯一，未填写评论');if(!panels.length)return{ready:false};
    if(command==='open-comments'&&xhs)return{ready:query('.comment-item[id],.comments-container',panels[0]).length>0};
    const composers=query(xhs?'.engage-bar-container':'.comment-input-inner-container',panels[0]);if(composers.length>1)throw Error('官方评论输入区域不唯一，未填写评论');
    if(dy){
      if(!input.nonce)throw Error('评论准备上下文无效');
      let opening=window.__yuanxiaoCommentReadiness;
      if(!opening||opening.nonce!==input.nonce||opening.workId!==input.workId)opening=window.__yuanxiaoCommentReadiness={nonce:input.nonce,workId:input.workId,opened:false,activated:false};
      if(location.pathname.startsWith('/note/')){
        const roots=query('[data-e2e="note-detail"]');if(roots.length>1)throw Error('官方图文作品区域不唯一');
        if(!roots.length)return{ready:false};
        const lists=query('[data-e2e="comment-list"]');if(lists.length>1)throw Error('官方图文评论列表不唯一');
        if(!lists.length){
          const icons=query('[data-e2e="feed-comment-icon"]',roots[0]);
          if(icons.length>1)throw Error('官方评论展开入口不唯一');
          if(icons.length===1&&!opening.opened){clickVisible(icons[0]);opening.opened=true;}
          return{ready:false};
        }
      }
      if(!query('[data-e2e="comment-list"]').length)return{ready:false};
      if(command==='open-comments')return{ready:true};
      if(composers.length===1&&!query('[contenteditable=true]',composers[0]).length&&!opening.activated){
        const placeholders=query('.RXtfhfhu',composers[0]);
        if(placeholders.length===1&&text(placeholders[0])==='留下你的精彩评论吧'){clickVisible(placeholders[0]);opening.activated=true;}
      }
    }
    if(!composers.length)return{ready:false};
    const editors=query(xhs?'p#content-textarea.content-input[contenteditable=true]':'[contenteditable=true]',composers[0]);if(editors.length>1)throw Error('官方评论输入框不唯一，未填写评论');return{ready:editors.length===1};
  }
  const panel=xhs?one('.interaction-container'):document;
  const composer=['result','check-receipt'].includes(command)?null:xhs?one('.engage-bar-container',panel):one('.comment-input-inner-container');
  if(composer&&(composer.closest('[data-e2e="comment-item"],.comment-item')||query('.reply-content',composer).length))throw Error('当前处于回复他人评论模式，未发送一级评论');
  const editor=composer?one(xhs?'p#content-textarea.content-input[contenteditable=true]':'[contenteditable=true]',composer):null;
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
  if(command==='check-receipt'){
    if(!(xhs?/^[\w-]{1,80}$/:/^\d{1,25}$/).test(input.commentId||'')||!input.identity||!input.text)throw Error('原评论复核参数无效');
    const lists=xhs?query('.interaction-container'):query('[data-e2e="comment-list"]');
    if(lists.length!==1)return{visible:false,ready:false};
    const found=rows().filter(r=>r.id===input.commentId&&r.uid===input.identity&&r.text===input.text);
    return{visible:found.length===1,ready:true};
  }
  if(command==='prepare'){
    if(typeof input.text!=='string'||!input.text.trim()||input.text.length>500||!input.identity||!input.nonce)throw Error('评论参数无效');
    if(xhs){const selves=query('.user.side-bar-component a[href],.bottom-menu-component a[href]').filter(e=>text(e)==='我'||e.getAttribute('title')==='我');const ids=new Set(selves.map(a=>{try{return /^\/user\/profile\/([a-f0-9]{24})\/?$/.exec(new URL(a.href).pathname)?.[1];}catch{return undefined;}}).filter(Boolean));if(ids.size!==1||!ids.has(input.identity))throw Error('官网当前登录者与选定账号ID不一致或未读到，未发送');}
    if(text(editor)&&text(editor)!==input.text)throw Error('评论输入框已有其他草稿，未覆盖');
    const before=rows();if(before.some(r=>r.uid===input.identity&&r.text===input.text))throw Error('官网已存在该账号的相同评论，未重复发送');
    editor.focus();
    window.__yuanxiaoPublicComment={nonce:input.nonce,workId:input.workId,text:input.text,identity:input.identity,before:before.map(r=>r.id),used:false};
    // Draft.js owns its DOM. Use the WebContents native input path for DY;
    // inserting text through document.execCommand can unmount the official UI.
    if(dy)return{prepared:text(editor)===input.text,requiresNativeInput:text(editor)!==input.text};
    const range=document.createRange();range.selectNodeContents(editor);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand('insertText',false,input.text);
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    if(text(editor)!==input.text)throw Error('评论正文填写未通过核对，未提交');
    return{prepared:true};
  }
  if(!state||state.nonce!==input.nonce||state.workId!==input.workId||state.text!==input.text||state.identity!==input.identity)throw Error('评论页面上下文已变化');
  if(command==='input-ready'){
    if(!dy||state.used||document.activeElement!==editor||text(editor))throw Error('评论输入焦点或草稿已变化，未输入');
    return{ready:true};
  }
  if(command==='verify-prepared')return{prepared:!state.used&&text(editor)===state.text};
  if(command==='submit'||command==='submit-ready'){
    if(state.used||text(editor)!==state.text)throw Error('评论已提交或正文已变化，未重复发送');
    const buttons=query(xhs?'button.btn.submit':'.commentInput-right-ct span.wchsYBpK',composer);
    if(command==='submit-ready'&&!buttons.length)return{ready:false};
    if(buttons.length!==1)throw Error('官方评论发送按钮未唯一定位');const button=buttons[0];
    if(command==='submit-ready'&&(button.disabled||button.getAttribute('aria-disabled')==='true'||/disabled/.test(button.className)))return{ready:false};
    if(button.disabled||button.getAttribute('aria-disabled')==='true'||/disabled/.test(button.className))throw Error('评论发送按钮不可用');
    if(xhs&&!/^(发送|评论)$/.test(text(button)))throw Error('评论按钮含义已改变');
    button.scrollIntoView({block:'center'});const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    if(hit!==button&&!button.contains(hit))throw Error('评论按钮被其他控件遮挡，未点击');
    if(command==='submit-ready')return{ready:true};
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

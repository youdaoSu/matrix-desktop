// Select an existing, exact-name topic through the rendered official picker.
// No topic creation, validator changes, private API calls or agreement clicks.
function bilibiliTopicControl(command,input={},componentRoots=[]){
  if(location.origin!=='https://member.bilibili.com'||!/^\/platform\/upload\/video(?:\/|$)/.test(location.pathname))throw Error('当前不是B站官方投稿页，未选择话题');
  const {expected,nonce}=input;
  if(typeof expected!=='string'||!expected.trim()||expected!==expected.trim()||expected.length>20||typeof nonce!=='string'||!nonce)throw Error('话题名称或操作标识无效');
  const parent=n=>n.parentElement||n.getRootNode?.().host;
  const visible=n=>{
    if(!n?.isConnected)return false;
    const r=n.getBoundingClientRect();if(!(r.width>0&&r.height>0))return false;
    for(let p=n;p;p=parent(p)){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0'||p.hidden||p.getAttribute('aria-hidden')==='true')return false;}
    return true;
  };
  const all=s=>[...new Set([document,...componentRoots].flatMap(r=>[...r.querySelectorAll(s)]))];
  const query=s=>all(s).filter(visible);
  const scopes=query('[id="tag-container"].tag-container');if(scopes.length!==1)throw Error('未唯一识别原投稿标签区域');
  const scope=scopes[0],text=n=>String(n?.textContent||'').trim();
  const chips=[...scope.querySelectorAll('.tag-input-wrp .tag-pre-wrp .label-item-v2-content')].filter(visible),selected=chips.map(text);
  let plan=window.__matrixBilibiliTopicPlan;
  if(selected.includes(expected)){
    if(plan?.expected===expected){if(plan.initial.some(t=>!selected.includes(t)))throw Error('话题选择后原标签发生变化，尚未投稿');delete window.__matrixBilibiliTopicPlan;}
    return{matched:true};
  }
  if(chips.some(n=>n.closest('.label-item-v2-container')?.querySelector('.topic-icon')))throw Error('B站已选其他话题，未替换；最多可选一个话题，请在官网调整');
  if(selected.length>=10)throw Error('B站标签位置不足，未删除原标签');
  // Fixed-position dialog children can leave their wrapper with zero height.
  const dialogs=all('.topic-dialog').filter(n=>visible(n.querySelector('.topic-dialog-title'))),dialog=dialogs.length===1?dialogs[0]:null;
  const unobstructed=n=>{
    if(!visible(n)||n.disabled||n.getAttribute('aria-disabled')==='true')throw Error('话题控件当前不可用');
    n.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
    const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    let hit=document.elementFromPoint(x,y);
    for(let i=0;hit&&i<8;i++){const root=componentRoots.find(r=>r.host===hit)||hit.shadowRoot;if(!root)break;const next=root.elementFromPoint(x,y);if(!next||next===hit)break;hit=next;}
    if(hit!==n&&!n.contains(hit))throw Error('话题控件被其他窗口遮挡，请先处理官网提示');
  };
  const click=n=>{unobstructed(n);n.click();};
  if(command==='open'){
    if(dialogs.length)throw Error('官网已有话题选择窗口，未覆盖本人操作');
    const buttons=[...scope.querySelectorAll('.tag-topic-wrp .tag-more')].filter(n=>visible(n)&&!n.classList.contains('tag-more-disabled')&&text(n)==='搜索更多话题 >');
    if(buttons.length!==1)throw Error('官网未提供唯一的话题搜索入口');
    window.__matrixBilibiliTopicPlan={expected,nonce,url:location.href,initial:selected,phase:'opening'};
    click(buttons[0]);return{opened:true};
  }
  if(!plan||plan.url!==location.href||plan.expected!==expected||plan.nonce!==nonce)throw Error('话题操作上下文已变化，未继续');
  if(plan.initial.length!==selected.length||plan.initial.some(t=>!selected.includes(t)))throw Error('原标签已变化，停止本次话题选择');
  if(!dialog){if(command==='inspect')return{waiting:true};throw Error('原话题窗口已关闭，未操作其他窗口');}
  if(text(dialog.querySelector('.topic-dialog-title'))!=='参与话题')throw Error('未识别到原话题选择窗口');
  const fields=[...dialog.querySelectorAll('.topic-dialog-search input')].filter(visible);
  if(fields.length!==1||fields[0].type!=='text'||fields[0].disabled||fields[0].readOnly)throw Error('话题搜索框不可用');
  const field=fields[0],loading=[...dialog.querySelectorAll('.loading-modal')].some(visible);
  const cards=[...dialog.querySelectorAll('.dialog-item .topic-card:not(.create-card)')].filter(n=>visible(n)&&text(n.querySelector('.topic-tag-name'))===expected);
  if(cards.length>1)throw Error('官网返回多个同名话题，需本人选择，未自动猜测');
  const card=cards[0],checked=card&&card.closest('.dialog-item')?.querySelector('.check-radio-v2-box-checked');
  const selectedRows=[...dialog.querySelectorAll('.dialog-item')].filter(n=>n.querySelector('.check-radio-v2-box-checked'));
  if(selectedRows.some(n=>text(n.querySelector('.topic-tag-name'))!==expected))throw Error('话题窗口已选其他内容，未替换本人选择');
  if(command==='search'){
    if(plan.phase!=='opening'||field.value)throw Error('话题搜索已有内容，未覆盖或重复查询');
    unobstructed(field);
    field.focus();
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!setter)throw Error('话题输入控件不可写');
    setter.call(field,expected);field.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,data:expected,inputType:'insertText'}));
    plan.phase='searching';plan.searchAt=Date.now();return{searched:true};
  }
  if(command==='inspect'&&plan.phase==='opening')return{pickerReady:true};
  if(field.value!==expected)throw Error('话题搜索内容已变化，未继续');
  // The official picker debounces input for 500ms. Do not choose stale
  // recommendations while the search has not yet had time to start.
  const ready=!loading&&Date.now()-plan.searchAt>=700;
  if(command==='inspect')return{ready,found:Boolean(card),checked:Boolean(checked)};
  if(command==='select'){
    if(plan.phase!=='searching'||!ready||!card)throw Error('尚未找到唯一同名话题，未选择其他推荐');
    if(card.querySelector('.topic-activity-icon'))throw Error('该同名话题涉及活动，请在官网核对活动要求后选择');
    if(!checked)click(card);
    plan.card=card;plan.phase='selected';return{selected:true};
  }
  if(command==='confirm'){
    if(plan.phase!=='selected'||plan.card!==card||!checked||!ready)throw Error('未确认原同名话题已选中，未点击确定');
    const buttons=[...dialog.querySelectorAll('.modal-footer .submit-add')].filter(n=>visible(n)&&n.tagName==='BUTTON'&&text(n)==='确定');
    if(buttons.length!==1)throw Error('话题确认按钮不唯一');
    plan.phase='confirming';click(buttons[0]);return{confirmed:true};
  }
  throw Error('不支持的话题选择操作');
}

async function selectBilibiliTopic(evaluate,expected,{guard=()=>{},assertCurrent=async()=>{},waitMs=15000}={}){
  const nonce=require('node:crypto').randomUUID();
  const run=async command=>{guard();return evaluate(bilibiliTopicControl,[command,{expected,nonce}]);};
  const wait=async predicate=>{const end=Date.now()+waitMs;while(Date.now()<end){const state=await run('inspect');if(state.matched||predicate(state))return state;await new Promise(r=>setTimeout(r,100));}throw Error(`官网话题「${expected}」尚未确认，保留原页面，请核对同名话题或官网提示`);};
  await assertCurrent();if((await run('open')).matched)return;
  // Wait for the actual picker, without using a global key or replaying APIs.
  await wait(state=>state.pickerReady);
  await assertCurrent();await run('search');
  if((await wait(state=>state.ready&&state.found)).matched)return;
  await assertCurrent();await run('select');
  if((await wait(state=>state.checked)).matched)return;
  await assertCurrent();await run('confirm');
  await wait(state=>state.matched);
}
module.exports={bilibiliTopicControl,selectBilibiliTopic};

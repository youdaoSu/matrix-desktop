// Original rendered-control adapter. Current official videoup uses a20-unit
// input and atmost10 selected tags. Do not call its private tag-check API or
// treat comma-separated text / recommendation cards as selected tags.
function bilibiliTagControl(command,input={},componentRoots=[]){
  if(location.protocol!=='https:'||location.hostname!=='member.bilibili.com'||!/^\/platform\/upload\/video(?:\/|$)/.test(location.pathname))throw Error('当前不是B站官方投稿页，未修改标签');
  const parent=node=>node.parentElement||node.getRootNode?.().host;
  const visible=node=>{
    if(!node?.isConnected)return false;
    const rect=node.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return false;
    for(let el=node;el;el=parent(el)){const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||el.hidden||el.getAttribute('aria-hidden')==='true')return false;}
    return true;
  };
  const query=selector=>[...new Set([document,...componentRoots].flatMap(root=>[...root.querySelectorAll(selector)]))];
  const scopes=query('[id="tag-container"].tag-container').filter(visible);
  if(scopes.length!==1)throw Error('未唯一识别B站作品标签区域，未操作模板或其他控件');
  for(let node=scopes[0];node;node=parent(node))if(node.matches?.('[role=dialog],.bcc-dialog,.el-dialog'))throw Error('标签区域位于其他弹窗，未操作模板或其他控件');
  const scope=scopes[0],controls=[...scope.querySelectorAll('.tag-input-wrp input')].filter(visible);
  if(controls.length!==1)throw Error('B站标签输入框尚未唯一识别，未修改其他字段');
  const control=controls[0];
  if(control.type!=='text'||control.disabled||control.readOnly||control.getAttribute('aria-disabled')==='true'||control.form)throw Error('标签输入框不可用或位于可提交表单，未按回车以免误发作品');
  const selected=[...new Set([...scope.querySelectorAll('.tag-input-wrp .tag-pre-wrp .label-item-v2-content')].filter(visible).map(node=>String(node.textContent||'').trim()).filter(Boolean))];
  const expected=input.expected,plans=window.__matrixBilibiliTagPlan;
  if(plans&&selected.includes(plans.expected))delete window.__matrixBilibiliTagPlan;
  const plan=window.__matrixBilibiliTagPlan;
  const alerts=query('[role=alert],.bcc-message,.bcc-message-content,[class*=message-error],[class*=toast]').filter(visible).map(node=>String(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim()).filter(text=>text.length>0&&text.length<=200&&/标签|话题|tag|验证码|校验|频繁|登录|权限|请求失败|网络(?:异常|错误)|服务(?:异常|繁忙)|请求超时/i.test(text));
  const errors=[...new Set(alerts)],newErrors=plan?.dispatched?errors.filter(error=>!plan.previousErrors?.includes(error)):errors;
  const blocked=errors.find(error=>/验证码|频繁|登录|权限/.test(error));
  if(command==='inspect'){
    const error=newErrors.length===1?newErrors[0]:blocked;
    if(plan?.dispatched&&error&&!control.value)delete window.__matrixBilibiliTagPlan;
    return{selected,pending:plan?.dispatched===true,pendingTopic:plan?.dispatched?plan.expected:undefined,preparedTopic:plan&&!plan.dispatched?plan.expected:undefined,value:control.value,error,blocked};
  }
  if(typeof expected!=='string'||!expected.trim()||expected!==expected.trim()||expected.length>20)throw Error('B站每个标签最多20字，未截断或修改标签');
  if(selected.includes(expected))return{matched:true};
  if(control.maxLength>0&&expected.length>control.maxLength)throw Error(`标签超过当前官方输入框${control.maxLength}字限制，未截断或绕过`);
  if(selected.length>=10)throw Error('B站已有10个标签，未删除已有标签或替换活动标签');
  if(plan?.dispatched)return{pending:true,pendingTopic:plan.expected};
  const clear=()=>{
    const rect=control.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    let hit=document.elementFromPoint(x,y);
    for(let i=0;hit&&i<8;i++){const root=componentRoots.find(root=>root.host===hit)||hit.shadowRoot;if(!root)break;const next=root.elementFromPoint(x,y);if(!next||next===hit)break;hit=next;}
    return hit===control;
  };
  if(command==='prepare'){
    if(blocked)throw Error('B站要求先处理：'+blocked);
    if(control.value)throw Error('B站标签输入框已有未确认内容，未覆盖；请先处理原标签');
    control.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
    if(!clear())throw Error('B站标签输入框被弹窗遮挡，未按回车或点击其他位置');
    control.focus();
    if(control.value)throw Error('聚焦后标签输入已有内容，未覆盖');
    // The public v-input uses a lazy model and resets its uncommitted DOM value
    // during a focus render. Do not type across the asynchronous owner check.
    window.__matrixBilibiliTagPlan={url:location.href,expected,target:control,nonce:input.nonce,initialValue:control.value,dispatched:false,previousErrors:errors};
    return{prepared:true};
  }
  if(command==='confirm'){
    if(!plan||plan.url!==location.href||plan.expected!==expected||plan.target!==control||plan.nonce!==input.nonce)throw Error('标签控件或页面已变化，未按回车；请重新核对标签');
    if(control.value!==plan.initialValue)throw Error('标签输入内容已经变化，未覆盖或按回车');
    if(blocked)throw Error('B站要求先处理：'+blocked);
    if(!clear())throw Error('标签输入框当前被遮挡或已离开可见区域，未按回车');
    const active=()=>control.getRootNode().activeElement||document.activeElement;
    // A background guest can lose its input focus to the document while the
    // owner check awaits. Restore only our unchanged, unobstructed input once.
    // Never steal focus from another control or dispatch a global keyboard key.
    if(active()!==control&&(active()===document.body||active()===document.documentElement))control.focus({preventScroll:true});
    if(active()!==control)throw Error('标签输入焦点已经变化，未向其他控件按回车');
    if(!control.isConnected||control.value!==plan.initialValue||!clear())throw Error('恢复焦点后标签内容或位置发生变化，未按回车');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!setter)throw Error('标签原生输入控件不可写，未操作');
    setter.call(control,expected);control.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,data:expected,inputType:'insertText'}));
    if(!control.isConnected||control.value!==expected||active()!==control||!clear())throw Error('标签填写后内容或焦点已经变化，未按回车');
    // Electron's embedded guest CDP Input.dispatchKeyEvent can route to the
    // HOST's focused widget even while this guest reports hasFocus=true.
    // Dispatch through this input's public handlers inside its tag widget,
    // never a global trusted key that could activate the host's Publish button.
    // This DOM event is untrusted; only the website's resulting selected chip
    // is completion evidence. No private store, validator or tag API is called.
    plan.dispatched=true;
    // Deliver normal bubbling inside the verified tag widget, where the website
    // may delegate its input listener. Never let Enter escape to document,
    // another widget, a form, or the host's Publish button.
    const contain=event=>{if(event.target===control&&event.key==='Enter')event.stopPropagation();};
    scope.addEventListener('keydown',contain);
    try{control.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,composed:false,cancelable:true}));}
    finally{scope.removeEventListener('keydown',contain);}
    return{dispatched:true};
  }
  throw Error('不支持的标签操作');
}

async function syncBilibiliTags(guest,topics,budget,{assertCurrent=async()=>{},waitMs=30000,topicWaitMs=15000}={}){
  if(!Array.isArray(topics)||topics.length>10||topics.some(tag=>typeof tag!=='string'||!tag.trim()||tag!==tag.trim()||tag.length>20))throw Error('B站最多10个标签，每个最多20字；原文保留，未截断');
  const expected=[...new Set(topics)];if(!expected.length)return{matched:true,selected:[]};
  const {withOfficialDOM}=require('./official-dom.cjs'),{randomUUID}=require('node:crypto'),url=guest.getURL();
  return withOfficialDOM(guest,'matrix-bilibili-tags',async({evaluate,send,stopNetworkObservation})=>{
    let observation;
    try {
    const guard=()=>{budget?.check();if(guest.isDestroyed()||guest.getURL()!==url)throw Error('B站投稿页已变化，标签操作已停止');};
    const run=async(command,expected,nonce)=>{guard();return evaluate(bilibiliTagControl,[command,{expected,nonce}]);};
    let state=await run('inspect');
    if(state.value&&!state.pending&&state.value!==state.preparedTopic)throw Error('B站标签输入框已有未确认内容，未覆盖或提交；请先处理原标签');
    if(state.selected.length+expected.filter(tag=>!state.selected.includes(tag)).length>10)throw Error('B站剩余标签位置不足；不会删除已有或活动标签，请调整后继续');
    for(const tag of expected){
      state=await run('inspect');if(state.selected.includes(tag))continue;
      if(state.blocked)throw Error('B站要求先处理：'+state.blocked);
      if(state.pending&&state.pendingTopic!==tag)throw Error('B站上一条标签仍在校验，未重复添加；请等待原标签结果');
      if(!state.pending){
        if(!observation)observation=await require('./bilibili-tag-observation.cjs').createBilibiliTagObservation(guest,send,stopNetworkObservation);
        observation?.begin(tag);
        await assertCurrent();guard();const nonce=randomUUID(),prepared=await run('prepare',tag,nonce);
        if(prepared.matched)continue;
        if(!prepared.prepared)throw Error('B站标签输入尚未完成，未按回车');
        await assertCurrent();guard();await run('confirm',tag,nonce);guard();
      }
      const end=Date.now()+waitMs;let matched=false;
      while(Date.now()<end){
        state=await run('inspect');if(state.selected.includes(tag)){matched=true;break;}
        const rejection=observation?.rejection();
        if(rejection?.pendingTopicDecision){await new Promise(resolve=>setTimeout(resolve,100));continue;}
        if(rejection?.topicSearchAllowed||/话题专用/.test(state.error||'')){
          await observation?.drain();
          await require('./bilibili-topics.cjs').selectBilibiliTopic(evaluate,tag,{guard,assertCurrent,waitMs:topicWaitMs});
          state=await run('inspect');
          if(!state.selected.includes(tag))throw Error('官网话题选择后未读到原名称，尚未投稿');
          matched=true;break;
        }
        if(rejection)throw Error('B站标签校验未通过：'+observation.describe()+'；保留原标签，请核对官网要求后继续');
        if(state.error)throw Error('B站标签未完成：'+state.error);
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!matched){await observation?.drain();throw Error(`标签「${tag}」仍未形成官网已选标签；${state.value?'官网输入仍待确认':'官网已清空输入，但未读到添加成功结果'}；${observation?.describe()||'当前页面不支持标签请求诊断'}；已停止等待，不重复按回车，不提交作品`);}
      await observation?.drain();
    }
    await assertCurrent();state=await run('inspect');
    if(state.pending)throw Error('B站上一条标签仍在校验，尚未提交作品；不会重复按回车');
    if(state.value)throw Error('标签输入框仍有未确认内容，尚未提交作品');
    if(expected.some(tag=>!state.selected.includes(tag)))throw Error('B站已选标签在填写后发生变化，尚未提交作品');
    return{matched:true,selected:state.selected};
    } finally { await observation?.close(); }
  },{operationTimeoutMs:90000,commandTimeoutMs:4000});
}
module.exports={bilibiliTagControl,syncBilibiliTags};

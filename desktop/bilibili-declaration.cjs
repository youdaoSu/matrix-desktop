// Exact rendered official declaration options. A saved choice is supplied by
// the user; this module never infers AI/originality/marketing classifications.
function bilibiliDeclaration(command, input = {}, componentRoots = []) {
  if (location.protocol !== 'https:' || location.hostname !== 'member.bilibili.com' || !/^\/platform\/upload\/video(?:\/|$)/.test(location.pathname)) throw Error('当前不是B站官方投稿页，未选择创作声明');
  const labels = ['内容无需标注','含AI生成内容','含虚构演绎内容','内容含营销信息','个人观点，仅供参考','内容为转载'];
  if (!labels.includes(input.expected)) throw Error('请先按真实内容选择B站创作声明，软件不会代为判断');
  const query = selector => [...new Set([document,...componentRoots].flatMap(root => [...root.querySelectorAll(selector)]))];
  const parent = el => el.parentElement || el.getRootNode?.().host;
  const text = el => String(el?.innerText || el?.textContent || '').replace(/\s+/g,' ').trim();
  const visible = el => {
    if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const rect=el.getBoundingClientRect();if (!(rect.width>0&&rect.height>0)) return false;
    for(let node=el;node;node=parent(node)){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||node.hidden||node.getAttribute('aria-hidden')==='true')return false;}
    return true;
  };
  const candidates=query('input,select,[role=combobox]').filter(el=>visible(el)&&(el.getAttribute('placeholder')==='请选择符合您视频内容的创作声明'||el.getAttribute('aria-label')==='创作声明'));
  if(candidates.length!==1)throw Error('未唯一识别B站创作声明控件，未修改其他字段');
  const control=candidates[0],value=String(control.value||control.getAttribute('aria-valuetext')||'').trim();
  const selected=control.tagName==='SELECT'?String(control.selectedOptions[0]?.textContent||'').trim():value;
  if(command==='read')return{matched:selected===input.expected,selected:labels.includes(selected)?selected:undefined,empty:!selected};
  if(selected===input.expected)return{matched:true};
  if(control.tagName==='SELECT'){
    if(command!=='choose')return{nativeSelect:true};
    const options=[...control.options].filter(option=>!option.disabled&&option.textContent.trim()===input.expected);
    if(options.length!==1)throw Error('B站创作声明选项不存在或不唯一');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(control,options[0].value);
    control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));
    return{waiting:true};
  }
  const optionIn = root => [...root.querySelectorAll('[role=option],li,div,span')].filter(el=>{
    const option=el.closest('[role=option],li,[class*=option],[class*=item]');
    return option&&root.contains(option)&&visible(option)&&visible(el)&&text(el)===input.expected&&!el.closest('[contenteditable],textarea')&&!el.querySelector('input,textarea,[contenteditable]')&&![...el.children].some(child=>visible(child)&&text(child)===input.expected);
  });
  const optionRoots=[];
  const linked=(control.getAttribute('aria-controls')||control.getAttribute('aria-owns')||'').split(/\s+/).filter(Boolean);
  for(const id of linked)for(const root of query('[id]').filter(el=>el.id===id&&visible(el)))optionRoots.push(root);
  // Non-portalled observed widgets keep their menu beside the exact input.
  // Stop at the nearest small ancestor that owns this one control and option;
  // never fall back to searching the document/body for a matching phrase.
  if(!optionRoots.length)for(let node=parent(control),depth=0;node&&depth<5&&node!==document.body;node=parent(node),depth++){
    if(node.querySelectorAll('input,select,[role=combobox]').length>1)break;
    if(optionIn(node).length){optionRoots.push(node);break;}
  }
  const options=[...new Set(optionRoots.flatMap(optionIn))];
  if(options.length>1)throw Error('B站创作声明选项不唯一，未猜测选择');
  if(command==='open'&&options.length===1)return{opened:true};
  const choosing=command==='choose'||command==='guard-choose';
  if(choosing&&!options.length)return{waiting:true};
  const target=choosing?options[0]:control;
  target.scrollIntoView({block:'center',inline:'center'});
  const bounds=target.getBoundingClientRect(),point={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
  let hit=document.elementFromPoint(point.x,point.y);
  for(let i=0;hit&&i<8;i++){const root=componentRoots.find(root=>root.host===hit)||hit.shadowRoot;if(!root)break;const next=root.elementFromPoint(point.x,point.y);if(!next||next===hit)break;hit=next;}
  const controlWrapper=!choosing&&hit===parent(control)&&hit?.matches('[role=combobox],[class*=select],[class*=Select]');
  if(!(hit===target||target.contains(hit)||controlWrapper))throw Error('B站创作声明控件被遮挡，未点击其他位置');
  if(command.startsWith('guard-'))return{clear:Boolean(input.point&&Math.abs(point.x-input.point.x)<0.5&&Math.abs(point.y-input.point.y)<0.5)};
  return{interaction:point,action:choosing?'choose':'open'};
}

async function syncBilibiliDeclaration(guest, expected, budget) {
  const {withOfficialDOM}=require('./official-dom.cjs');
  return withOfficialDOM(guest,'matrix-bilibili-declaration',async({evaluate,send})=>{
    const guard=()=>budget?.check();
    const run=async(command,point)=>{guard();return evaluate(bilibiliDeclaration,[command,{expected,point}]);};
    const click=async state=>{
      if(!state.interaction)return;
      const current=await run('guard-'+state.action,state.interaction);guard();
      if(!current.clear)throw Error('B站创作声明布局已变化，未重复点击');
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...state.interaction});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...state.interaction});
    };
    if((await run('read')).matched)return{matched:true};
    const open=await run('open');await click(open);
    let chosen=false;
    for(let attempt=0;attempt<20;attempt++){
      const current=await run('read');if(current.matched)return{matched:true};
      if(!chosen){const choice=await run('choose');if(choice.interaction||choice.waiting&&open.nativeSelect){await click(choice);chosen=true;}}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error(chosen?'B站官方编辑器未接受创作声明，尚未提交':'B站官方创作声明选项未显示，尚未提交');
  },{backgroundFocus:true,operationTimeoutMs:12000,commandTimeoutMs:4000});
}
module.exports={bilibiliDeclaration,syncBilibiliDeclaration};

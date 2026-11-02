// Real React route with synthetic cached rows only. No platform traffic or IPC.
async function runFollowerMonitorUiTests() {
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),path=require('node:path'),{loadTs}=require('./qa-load-typescript.cjs');
 const root=path.resolve(__dirname,'..'),cache=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});let checks=0,platform='douyin',owner='owner-a',activations=0,refreshes=[];
 const accounts=[{id:'a',platform:'douyin',nickname:'本人甲',connectorSessionId:'session-a',nativeAccountKey:'native-a'},{id:'b',platform:'douyin',nickname:'本人乙',connectorSessionId:'session-b',nativeAccountKey:'native-b'},{id:'c',platform:'douyin',nickname:'未绑定'}],workspace={accounts,jobsLocked:false};
 const entries=new Map([['a',{complete:true,followerRosterVerified:false,rows:Array.from({length:104},(_,i)=>({platformId:String(i+1),platformUserId:String(i+1),author:'粉丝'+i,content:'',...(i===0?{firstObservedAt:new Date().toISOString(),lastObservedAt:new Date().toISOString(),isCurrentFollower:true}:i===1?{isCurrentFollower:false}:{} )}))}],['b',{complete:true,followerRosterVerified:true,rows:[{platformId:'999',platformUserId:'999',author:'乙粉丝',content:''}]}]]);
 const data={entry:account=>entries.get(account.id),refresh:(account,kind)=>refreshes.push({id:account.id,kind})};
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace});
 stub('client/src/components/workspace/DouyinInteractionData.tsx',{useDouyinInteractionData:kind=>{assert.equal(kind,'followers');activations++;return data;},interactionStatus:()=> '获取失败'});
 stub('client/src/components/workspace/DouyinInteractionFeed.tsx',{InteractionAvatar:({row})=>React.createElement('span',{'aria-label':'头像'},row.author.slice(0,1))});
 stub('client/src/components/workspace/InteractionPanels.tsx',{InteractionAccountRail:()=>React.createElement('aside',null,'账号栏')});
 stub('client/src/components/workspace/InteractionUi.tsx',{InteractionEmpty:({children})=>React.createElement('p',null,children),useInteractionFilters:()=>({accounts:accounts.filter(a=>a.platform===platform),loaded:true})});
 stub('client/src/components/workspace/InteractionState.ts',{useInteractionPlatform:()=>[platform,value=>{platform=value;render();}],useInteractionAccount:()=>[null,()=>{}]});
 stub('client/src/components/workspace/WorkspaceUiState.ts',{uiText:()=>true,useWorkspaceIdentity:()=>owner,useWorkspacePreference:(_key,initial)=>React.useState(initial)});
 stub('client/src/components/ui/button.tsx',{Button:({asChild,variant,children,...props})=>asChild?children:React.createElement('button',props,children)});
 const Page=loadTs('client/src/pages/user/FollowerMonitorPage.tsx',cache,new Map([['react-router-dom',{Link:({to,children})=>React.createElement('a',{href:to},children)}]])).default,component=createRoot(document.querySelector('#root'));
 const pause=()=>new Promise(r=>setTimeout(r,10)),until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await pause();}throw Error('Follower monitor synthetic UI QA timeout: '+document.body.innerText.slice(0,1400));},button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text),rows=()=>document.querySelectorAll('[data-observed-follower]'),render=()=>component.render(React.createElement(Page));
 const select=value=>{const node=document.querySelector('select');node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));};
 const search=value=>{const node=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));};
 try {
  render();await until(()=>rows().length===100);assert.match(document.body.innerText,/当前及待核对缓存：104/);assert.match(document.body.innerText,/24小时内首次采集：1/);assert.match(document.body.innerText,/本轮未在列的历史记录：1/);assert.equal(document.querySelector('[data-monitor-account=a]').textContent,'本人甲 · 可访问范围有限');assert.match(document.querySelector('[data-monitor-account=b]').textContent,/本轮名单已核对/);assert.match(document.body.innerText,/首次采集时间不等于关注时间/);checks+=7;
  button('下一页').click();await until(()=>rows().length===5);assert.equal(button('下一页').disabled,true);checks+=2;
  select('historical');await until(()=>rows().length===1);assert.match(document.body.innerText,/本轮完整名单未见，历史仍保留/);assert.match(document.body.innerText,/首次采集：未记录/);assert.equal(button('上一页').disabled,true);checks+=4;
  select('recent');await until(()=>document.querySelector('[data-observed-follower="1"]'));assert.equal(rows().length,1);checks++;
  select('all');await until(()=>rows().length===100);search('乙粉丝');await until(()=>rows().length===1);assert.equal(rows()[0].getAttribute('data-observed-follower'),'999');checks++;
  button('刷新粉丝').click();assert.deepEqual(refreshes,[{id:'a',kind:'followers'},{id:'b',kind:'followers'}]);checks++;
  workspace.jobsLocked=true;render();await until(()=>button('刷新粉丝').disabled);assert.match(document.body.innerText,/后台任务已暂停/);assert.equal(rows().length,1);checks+=2;
  const before=activations;platform='bilibili';render();await until(()=>button('查看抖音粉丝变化'));assert.equal(activations,before);assert.equal(rows().length,0);assert.match(document.body.innerText,/不会创建空跑任务/);checks+=3;
  owner='owner-b';entries.clear();platform='douyin';render();await until(()=>document.querySelector('[data-follower-observations]'));assert.equal(rows().length,0);assert.match(document.body.innerText,/没有记录不代表粉丝没有变化/);assert.equal(document.querySelector('input').value,'');checks+=3;
  return {followerMonitorReactChecks:checks,realRoute:true,sharedCacheOnly:true,firstObservedNotFollowTime:true,historyRetained:true,unsupportedPlatformDoesNotActivateDouyin:true,realPlatformRequests:0,businessWrites:0};
 } finally {component.unmount();}
}
module.exports={runFollowerMonitorUiTests};

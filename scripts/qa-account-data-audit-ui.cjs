// Actual React audit page. Every account, native check and API response is synthetic.
async function runAccountDataAuditUiTests(){
 const assert=require('node:assert/strict'),React=require('react'),{createRoot}=require('react-dom/client'),path=require('node:path'),{loadTs}=require('./qa-load-typescript.cjs');
 const root=path.resolve(__dirname,'..'),cache=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});let owner='owner-a',token='token-a',checks=0,reads=0,fail=false,held=[],nativeCalls=[],posts=[];
 const rows=Array.from({length:3},(_,i)=>({accountId:'account-'+i,sessionId:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),platform:'douyin',nickname:'本人 '+i,followers:i===0?13763:null,cachedValue:i===1?14000:undefined,status:i===0?'current':'legacy',included:i===0,source:i===0?'douyin-self-profile':undefined,observedAt:i===0?new Date().toISOString():undefined}));
 const data={rows,coverage:{accountCount:3,measuredAccounts:1,missingAccounts:2,staleAccounts:0,total:13763,bindingCount:3,duplicateBindings:0},capturedAt:new Date().toISOString()};
 const workspace={jobsLocked:false,accounts:rows.map(row=>({id:row.accountId,connectorSessionId:row.sessionId,platform:row.platform}))};
 let native=async input=>{nativeCalls.push(input);return await new Promise(resolve=>held.push(()=>resolve({accountId:input.accountId,sessionId:rows.find(row=>row.accountId===input.accountId).sessionId,state:'normal',nickname:'本人',metrics:{followersCount:13763},metricEvidence:{source:'douyin-self-profile',ownerUid:'123456'},checkedAt:Date.now()})));};
 window.matrixDesktop={inspectAccountHealth:input=>native(input)};
 stub('client/src/api/index.ts',{getUser:()=>({id:owner}),getAuthToken:()=>token,axiosForBackend:{get:async url=>{assert.equal(url,'/api/analytics/account-data-audit');reads++;if(fail)throw Error('fixture unavailable');return{data:{data:structuredClone(data)}};},post:async(url,body)=>{posts.push({url,body});return{data:{data:{id:url.split('/')[4],connectorSessionId:body.sessionId,metricsObservedAt:new Date().toISOString()}}};}}});
 stub('client/src/components/workspace/OfficialWorkspace.tsx',{useOfficialWorkspace:()=>workspace,platformLabels:{douyin:'抖音',bilibili:'B站'}});
 stub('client/src/components/workspace/WorkspaceUiState.ts',{uiOneOf:()=>()=>true,uiText:()=>true,useWorkspacePreference:(_key,initial)=>React.useState(initial)});
 stub('client/src/components/ui/button.tsx',{Button:({variant,size,children,...props})=>React.createElement('button',props,children)});
 stub('client/src/components/ui/input.tsx',{Input:props=>React.createElement('input',props)});
 const Page=loadTs('client/src/pages/user/AccountDataAuditPage.tsx',cache).default,component=createRoot(document.querySelector('#root')),pause=()=>new Promise(r=>setTimeout(r,10)),until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await pause();}throw Error('Audit React QA timeout');},button=text=>[...document.querySelectorAll('button')].find(item=>item.textContent===text),article=id=>document.querySelector(`[data-account-id="${id}"]`);
 try{
  component.render(React.createElement(Page));await until(()=>article('account-0'));assert.match(document.body.innerText,/13,763/);assert.match(article('account-1').innerText,/14,000（未核验，不计入小计）/);assert.equal(nativeCalls.length,0);checks+=3;
  rows[0].source='douyin-creator-profile';button('刷新已存数据').click();await until(()=>article('account-0').innerText.includes('抖音创作者本人资料'));checks++;
  fail=true;button('刷新已存数据').click();await until(()=>document.querySelector('[role=alert]'));assert.match(document.body.innerText,/保留上次/);assert.ok(article('account-0'));checks+=2;fail=false;
  button('只读核对筛选账号').click();await until(()=>nativeCalls.length===2);assert.equal(posts.length,0);assert.equal(button('只读核对筛选账号'),undefined);checks+=2;
  held.shift()();await until(()=>nativeCalls.length===3);assert.equal(posts.length,1);assert.equal(posts[0].body.metricEvidence.source,'douyin-self-profile');checks+=2;
  while(held.length)held.shift()();await until(()=>button('只读核对筛选账号')&&!button('只读核对筛选账号').disabled);assert.equal(posts.length,3);assert.ok(posts.every(post=>post.url.endsWith('/desktop-observation')));checks+=2;
  button('只读核对筛选账号').click();await until(()=>article('account-0').innerText.includes('间隔60秒'));assert.equal(nativeCalls.length,3);checks++;
  // Re-mount drops the UI cooldown, but native admission and binding guards remain.
  component.render(React.createElement(Page,{key:'late-binding'}));await until(()=>article('account-0')&&!article('account-0').innerText.includes('间隔60秒'));button('核对该账号').click();await until(()=>held.length===1);workspace.accounts[0].connectorSessionId='changed-session-0001';held.shift()();await until(()=>button('只读核对筛选账号')&&!button('只读核对筛选账号').disabled);assert.equal(posts.length,3);checks++;
  workspace.accounts[0].connectorSessionId=rows[0].sessionId;
  component.render(React.createElement(Page,{key:'late-owner'}));await until(()=>article('account-0'));await pause();button('核对该账号').click();await until(()=>held.length===1);owner='owner-b';token='token-b';component.render(React.createElement(Page,{key:'new-owner'}));held.shift()();await pause();assert.equal(posts.length,3);checks++;
  workspace.jobsLocked=true;component.render(React.createElement(Page,{key:'paused'}));await until(()=>button('只读核对筛选账号')?.disabled);assert.equal(button('只读核对筛选账号').disabled,true);checks++;
  return{accountDataAuditReactChecks:checks,realReactPage:true,nativeWorkers:2,cachedValuesNotInvented:true,lateOwnerAndBindingDiscarded:true,officialBusinessActions:false};
 }finally{component.unmount();delete window.matrixDesktop;}
}
module.exports={runAccountDataAuditUiTests};

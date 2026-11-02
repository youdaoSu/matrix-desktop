// Actual React pages with only in-memory requests. No server or real profile.
async function runAnalyticsUiTests(){
  const assert=require('node:assert/strict'),path=require('node:path'),React=require('react'),{createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
  const root=path.resolve(__dirname,'..'),cache=new Map(),overrides=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});
  let owner='qa-owner-a',token='qa-token-a',handler,checks=0;const requests=[];
  const wrap=tag=>({children,...props})=>React.createElement(tag,props,children),Button=({children,variant,size,asChild,...props})=>asChild?children:React.createElement('button',props,children);
  const {summarizeFollowerCoverage}=loadTs('shared/account-metrics.ts');
  const coverage=(count=undefined,total=1)=>summarizeFollowerCoverage(Array.from({length:total},(_,index)=>index===0&&count!==undefined?{followersCount:count,rawData:{metricSnapshot:{followersCount:count,followersAt:new Date().toISOString()}}}:{followersCount:0}));
  const overview=(count=undefined,total=1)=>({totalFollowers:count||0,totalPosts:0,totalEngagement:0,totalMessages:0,totalComments:0,followerCoverage:coverage(count,total)});
  const response=(url,count=undefined,total=1,privateTitle='')=>url==='/api/analytics/overview'?overview(count,total):url==='/api/platform/accounts'?{items:[{id:'qa-account',nickname:owner,platform:'douyin'}],total}:url==='/api/content/drafts'?{items:privateTitle?[{id:'qa-draft',title:privateTitle,platform:'douyin',createdAt:new Date().toISOString()}]:[]}:[];
  const normal=(count,total=1)=>(url)=>Promise.resolve({data:{data:response(url,count,total)}});
  handler=normal();
  stub('client/src/api/index.ts',{getUser:()=>({id:owner,nickname:owner,username:owner,maxAccounts:5}),getAuthToken:()=>token,axiosForBackend:{get:(url,options={})=>{requests.push({url,signal:options.signal});return handler(url,options);}}});
  overrides.set('react-router-dom',{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)});
  stub('client/src/contexts/ThemeContext.tsx',{useTheme:()=>({resolvedTheme:'light',setTheme:()=>{}})});
  stub('client/src/components/workspace/OfficialWorkspace.tsx',{platformLabels:{douyin:'抖音',xiaohongshu:'小红书',wechat:'视频号',bilibili:'B站'}});
  stub('client/src/components/workspace/PlatformLogo.tsx',{PlatformLogo:()=>null});
  stub('client/src/components/workspace/DesktopRecordOverview.tsx',{__esModule:true,default:()=>null});
  stub('client/src/components/ui/button.tsx',{Button});overrides.set('@client/src/components/ui/button',{Button});
  overrides.set('@client/src/components/ui/alert',{Alert:wrap('aside'),AlertDescription:wrap('p')});
  overrides.set('@client/src/components/ui/card',{Card:({children,...props})=>React.createElement('section',{'data-qa-card':true,...props},children),CardContent:wrap('div'),CardHeader:wrap('header'),CardTitle:wrap('h2')});
  overrides.set('@client/src/components/ui/select',Object.fromEntries(['Select','SelectContent','SelectItem','SelectTrigger','SelectValue'].map(name=>[name,({children})=>React.createElement('div',null,children)])));
  overrides.set('recharts',Object.fromEntries(['Bar','BarChart','CartesianGrid','Legend','Line','LineChart','ResponsiveContainer','Tooltip','XAxis','YAxis'].map(name=>[name,({children,data})=>React.createElement('div',{'data-qa-chart':name},data?JSON.stringify(data):children)])));
  const Dashboard=loadTs('client/src/pages/user/DashboardPage.tsx',cache,overrides).default,Analytics=loadTs('client/src/pages/user/AnalyticsPage.tsx',cache,overrides).default;
  const component=createRoot(document.getElementById('root')),pause=()=>new Promise(resolve=>setTimeout(resolve,10)),until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await pause();}throw Error('Analytics React QA timeout '+document.body.innerText.slice(0,500));};
  const mount=async(Page,key)=>{const previous=document.querySelector('button');component.render(React.createElement(Page,{key}));await until(()=>document.querySelector('button')&&(!previous||!previous.isConnected));},refresh=()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='刷新');
  const dashboardValue=()=>document.querySelectorAll('.matrix-dashboard-metrics strong')[2]?.textContent;
  const analyticsValue=label=>[...document.querySelectorAll('[data-qa-card]')].find(el=>el.querySelector('span')?.textContent===label)?.querySelector('.text-2xl')?.textContent;
  const originalTimer=global.setTimeout;
  try{
    await mount(Dashboard,'missing');await until(()=>!refresh().disabled);assert.equal(dashboardValue(),'—');assert.match(document.body.innerText,/尚未采集到可信官网粉丝计数/);checks+=2;
    handler=normal(0);await mount(Dashboard,'zero');await until(()=>!refresh().disabled);assert.equal(dashboardValue(),'0');checks++;
    handler=normal(7,3);await mount(Dashboard,'partial');await until(()=>!refresh().disabled);assert.equal(dashboardValue(),'7');assert.match(document.body.innerText,/1\/3 个账号（部分统计）/);checks+=2;
    handler=normal(9,3);const beforeProfileRefresh=requests.length;
    window.dispatchEvent(new CustomEvent('matrix:account-data-updated',{detail:{ownerId:'foreign-owner'}}));await new Promise(r=>originalTimer(r,250));assert.equal(requests.length,beforeProfileRefresh);checks++;
    for(let i=0;i<20;i++)window.dispatchEvent(new CustomEvent('matrix:account-data-updated',{detail:{ownerId:owner}}));await until(()=>dashboardValue()==='9');assert.equal(requests.length-beforeProfileRefresh,4,'Burst account observations must coalesce into one dashboard refresh');checks+=2;
    handler=url=>Promise.resolve({data:{data:url==='/api/analytics/overview'?{...overview(),totalFollowers:999,followerCoverage:undefined}:response(url)}});await mount(Dashboard,'legacy');await until(()=>!refresh().disabled);assert.equal(dashboardValue(),'—');checks++;
    let held=[];handler=(url,options)=>new Promise(resolve=>held.push({url,signal:options.signal,resolve}));
    await mount(Dashboard,'race');await until(()=>held.length===4);handler=normal(42);window.dispatchEvent(new Event('matrix:accounts-updated'));await until(()=>dashboardValue()==='42');assert.ok(held.every(item=>item.signal.aborted));checks++;
    for(const pending of held)pending.resolve({data:{data:response(pending.url,3,1,'Late private draft')}});await pause();assert.equal(dashboardValue(),'42');assert.ok(!document.body.innerText.includes('Late private draft'));checks+=2;
    held=[];handler=(url,options)=>new Promise(resolve=>held.push({url,signal:options.signal,resolve}));await mount(Dashboard,'owner');await until(()=>held.length===4);
    owner='qa-owner-b';token='qa-token-b';handler=normal(8);await mount(Dashboard,'owner');await until(()=>dashboardValue()==='8');assert.ok(held.every(item=>item.signal.aborted));checks++;
    for(const pending of held)pending.resolve({data:{data:response(pending.url,9999,1,'Owner A private draft')}});await pause();assert.equal(dashboardValue(),'8');assert.ok(!document.body.innerText.includes('Owner A private draft'));checks+=2;
    handler=normal(undefined,3);await mount(Analytics,'analytics-missing');await until(()=>!refresh().disabled);assert.equal(analyticsValue('已采集粉丝小计'),'—');assert.match(document.body.innerText,/没有已同步的粉丝记录/);checks+=2;
    handler=normal(0);await mount(Analytics,'analytics-zero');await until(()=>!refresh().disabled);assert.equal(analyticsValue('已采集粉丝小计'),'0');checks++;
    handler=normal(12);const beforeAnalyticsRefresh=requests.length;window.dispatchEvent(new CustomEvent('matrix:account-data-updated',{detail:{ownerId:owner}}));await until(()=>analyticsValue('已采集粉丝小计')==='12');assert.equal(requests.length-beforeAnalyticsRefresh,5);checks+=2;
    const beforeUnmount=requests.length;window.dispatchEvent(new CustomEvent('matrix:account-data-updated',{detail:{ownerId:owner}}));component.render(null);await new Promise(r=>originalTimer(r,250));assert.equal(requests.length,beforeUnmount,'Unmount must cancel a queued statistics refresh');checks++;
    handler=(url)=>url==='/api/analytics/overview'?Promise.reject(Error('QA unavailable')):Promise.resolve({data:{data:[]}});await mount(Analytics,'analytics-error');await until(()=>!refresh().disabled);assert.equal(analyticsValue('本地内容记录'),'—');assert.match(document.body.innerText,/未能刷新：统计概览/);checks+=2;
    let expire;global.setTimeout=(fn,ms,...args)=>{if(ms===20000)expire=fn;return originalTimer(fn,ms,...args);};
    held=[];handler=(url,options)=>new Promise((_resolve,reject)=>{held.push({url,signal:options.signal});options.signal.addEventListener('abort',()=>reject(Error('QA timed out')),{once:true});});
    await mount(Analytics,'analytics-timeout');await until(()=>held.length===5&&expire);expire();await until(()=>!refresh().disabled);assert.ok(held.every(item=>item.signal.aborted));assert.equal(analyticsValue('已采集粉丝小计'),'—');assert.match(document.body.innerText,/未能刷新/);checks+=3;
    return{analyticsReactChecks:checks,realPages:true,unmeasuredNotZero:true,measuredZeroShown:true,partialCoverageLabeled:true,supersededAndForeignOwnerResponsesIgnored:true,timeoutStopsSpinner:true,realBackendOrPlatformActions:false};
  }finally{global.setTimeout=originalTimer;component.unmount();}
}
module.exports={runAnalyticsUiTests};

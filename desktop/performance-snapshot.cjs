// Explicit local button only: bounded numeric process/page metadata. No timer,
// file, page script, URL/title, account, profiler, debugger or network access.
function createPerformanceSnapshot({getMetrics,getWindows,getContents,now=Date.now}){
 let previous,previousIds=new Set();
 const round=value=>Math.round(value*100)/100,types=new Map([['Browser','main'],['Tab','renderer'],['GPU','gpu'],['Utility','utility']]);
 const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12?value:null;
 return ()=>{
  const at=now();if(!Number.isSafeInteger(at)||at<0)throw Error('本机性能时钟不可用');
  if(previous&&at>=previous.at&&at-previous.at<5000)return {...structuredClone(previous.result),cached:true};
  try{
   const metrics=getMetrics(),windows=getWindows(),contents=getContents();
   if(!Array.isArray(metrics)||!Array.isArray(windows)||!Array.isArray(contents))throw Error();
   const ready=!!previous&&at>previous.at,groups=new Map(),ids=new Set();
   for(const metric of metrics.slice(0,128)){
    const type=types.get(metric?.type)||'other';
    let group=groups.get(type);if(!group){group={type,processes:0,cpuPercent:0,privateMiB:0,workingMiB:0};groups.set(type,group);}group.processes++;
    // Electron's Windows creationTime is milliseconds with a fractional part,
    // not an integer. Retain that exact stable value to detect PID reuse.
    const id=Number.isSafeInteger(metric?.pid)&&metric.pid>0&&typeof metric.creationTime==='number'&&Number.isFinite(metric.creationTime)&&metric.creationTime>=0&&metric.creationTime<=Number.MAX_SAFE_INTEGER?metric.pid+'/'+metric.creationTime:'';if(id)ids.add(id);
    const cpu=number(metric?.cpu?.percentCPUUsage),privateKiB=number(metric?.memory?.privateBytes),workingKiB=number(metric?.memory?.workingSetSize);
    group.cpuPercent=group.cpuPercent===null||!ready||!id||!previousIds.has(id)||cpu===null?null:group.cpuPercent+cpu;
    group.privateMiB=group.privateMiB===null||privateKiB===null?null:group.privateMiB+privateKiB/1024;
    group.workingMiB=group.workingMiB===null||workingKiB===null?null:group.workingMiB+workingKiB/1024;
   }
   const pages={total:0,webviews:0,unthrottled:0,loading:0,unavailable:0},nativeWindows={visible:0,hidden:0,unavailable:0};
   for(const content of contents.slice(0,256))try{if(content.isDestroyed())continue;pages.total++;if(content.getType()==='webview')pages.webviews++;if(content.getBackgroundThrottling()===false)pages.unthrottled++;if(content.isLoadingMainFrame())pages.loading++;}catch{pages.unavailable++;}
   for(const win of windows.slice(0,128))try{if(!win.isDestroyed())nativeWindows[win.isVisible()?'visible':'hidden']++;}catch{nativeWindows.unavailable++;}
   const result={at:new Date(at).toISOString(),electronManagedOnly:true,sampleReady:ready,sampleIntervalMs:previous?Math.max(0,at-previous.at):0,cached:false,truncated:metrics.length>128||windows.length>128||contents.length>256,groups:[...groups.values()].map(group=>({...group,cpuPercent:group.cpuPercent===null?null:round(group.cpuPercent),privateMiB:group.privateMiB===null?null:round(group.privateMiB),workingMiB:group.workingMiB===null?null:round(group.workingMiB)})),pages,windows:nativeWindows};
   previous={at,result};previousIds=ids;return structuredClone(result);
  }catch{throw Error('本机性能数据暂不可用；未读取网页内容或更改设置');}
 };
}
module.exports={createPerformanceSnapshot};

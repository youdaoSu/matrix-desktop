import { createContext,createElement,useCallback,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import type { PlatformAccount } from '@shared/api.interface';
import { displayedCommentTime } from '@shared/douyin-monitor';
import { getAuthToken,getUser } from '@/api';
import { Button } from '@/components/ui/button';
import { useOfficialWorkspace } from './OfficialWorkspace';
import { loadPublishAccounts } from './publish-preferences';
type Row={author:string;content:string;authorProfileUrl?:string;displayTime?:string};
type Snapshot={records:Row[];capturedAt?:string;partial?:boolean;error?:string};
type Job={key:string;owner:string;account:PlatformAccount;session:MatrixDesktopSession;running:boolean;total:number;done:number;phase:string;inventoryPartial?:boolean;snapshots:Record<string,Snapshot>};
type MonitorContext={jobs:Job[];start(account:PlatformAccount):Promise<void>;stop(key:string):void};
const Context=createContext<MonitorContext|null>(null);
export function DouyinCommentMonitorProvider({children}:{children:ReactNode}){
  const [jobs,setJobs]=useState<Job[]>([]);
  const update=useCallback((key:string,patch:Partial<Job>)=>setJobs(items=>items.map(job=>job.key===key?{...job,...patch}:job)),[]);
  const start=async(account:PlatformAccount)=>{
    const owner=getUser()?.id;
    if(!owner||!account.connectorSessionId||!window.matrixDesktop?.douyinCommentScan)throw Error('请使用新版桌面端并绑定抖音账号');
    const key=owner+':'+account.id;
    if(jobs.some(job=>job.key===key&&job.running))return;
    const session=await window.matrixDesktop.preparePlatformLogin('douyin',account.connectorSessionId);
    if('error'in session)throw Error(session.error);
    setJobs(items=>[...items.filter(job=>job.key!==key),{key,owner,account,session,running:true,total:0,done:0,phase:'正在读取全部公开视频目录',snapshots:{}}]);
  };
  return <Context.Provider value={{jobs,start,stop:key=>update(key,{running:false,phase:'已暂停'})}}>{children}{jobs.filter(job=>job.running).map(job=><MonitorGuest key={job.key} job={job} update={update}/>)}</Context.Provider>;
}
function MonitorGuest({job,update}:{job:Job;update(key:string,patch:Partial<Job>):void}){
  const view=useRef<any>(null),started=useRef(false),alive=useRef(true),latest=useRef(job);latest.current=job;
  useEffect(()=>{alive.current=true;const element=view.current;const pause=(ms:number)=>new Promise<void>(resolve=>{const until=Date.now()+ms;const tick=()=>{if(!alive.current||Date.now()>=until)resolve();else setTimeout(tick,200);};tick();});
    const active=()=>alive.current&&latest.current.running&&getUser()?.id===job.owner;
    const input=()=>({platform:'douyin' as const,sessionId:job.session.sessionId,accountId:job.account.id,webContentsId:element.getWebContentsId(),accessToken:getAuthToken()||''});
    const run=async()=>{if(started.current)return;started.current=true;
      try{while(active()){
        const inventory=await window.matrixDesktop!.douyinCommentScan({...input(),operation:'inventory'});
        if(!active())return;if(inventory.error)throw Error(inventory.error);
        const urls=inventory.urls||[];
        update(job.key,{total:urls.length,done:0,inventoryPartial:inventory.partial,phase:urls.length?'逐篇检查当前评论':'该账号没有可读取的公开视频'});
        if(!urls.length){update(job.key,{running:false});return;}
        for(let index=0;index<urls.length&&active();index++){
          const videoUrl=urls[index],result=await window.matrixDesktop!.douyinCommentScan({...input(),operation:'scan',videoUrl});
          if(!active())return;
          const previous=latest.current.snapshots;
          const snapshot=result.error?{...(previous[videoUrl]||{records:[]}),error:result.error}:{records:result.records||[],capturedAt:result.capturedAt,partial:result.partial||result.capped};
          const snapshots={...previous,[videoUrl]:snapshot};
          latest.current={...latest.current,snapshots};
          update(job.key,{snapshots,done:index+1,phase:result.error?`作品读取失败：${result.error}`:`本轮已检查 ${index+1}/${urls.length} 篇作品`});
          if(result.error?.includes('验证'))throw Error(result.error);
          await pause(1200);
        }
        if(active())update(job.key,{phase:(inventory.partial?'作品目录未明确显示结束，可能不完整；':'')+'本轮完成，60 秒后更新目录并继续检查'});
        await pause(60000);
      }}catch(error){if(alive.current)update(job.key,{running:false,phase:error instanceof Error?error.message:'监控已暂停，请核对官方登录'});}
    };
    element.addEventListener('dom-ready',run);
    return()=>{alive.current=false;element.removeEventListener('dom-ready',run);};
  },[job.key,job.owner,job.account.id,job.session.sessionId,update]);
  return <div aria-hidden="true" style={{position:'fixed',left:-20000,top:0,width:1280,height:900}}>{createElement('webview',{ref:view,src:'https://www.douyin.com/user/self',partition:job.session.partition,style:{display:'flex',width:'100%',height:'100%'}})}</div>;
}
export function DouyinCommentMonitorPanel(){
  const monitor=useContext(Context),workspace=useOfficialWorkspace();
  const [accounts,setAccounts]=useState<PlatformAccount[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let active=true;void loadPublishAccounts().then(items=>{if(active)setAccounts(items.filter(a=>a.platform==='douyin'&&a.connectorSessionId));}).catch(()=>setError('抖音账号加载失败'));return()=>{active=false;};},[]);
  if(!monitor)return null;
  const ownJobs=monitor.jobs.filter(job=>job.owner===getUser()?.id);
  const rows=ownJobs.flatMap(job=>Object.entries(job.snapshots).flatMap(([videoUrl,snapshot])=>snapshot.records.map((row,index)=>({job,videoUrl,snapshot,row,index,time:displayedCommentTime(row.displayTime,snapshot.capturedAt||'')})))).sort((a,b)=>(b.time??0)-(a.time??0));
  const openVideo=async(job:Job,url:string)=>{if(await workspace.openAccount(job.account,'manage'))setTimeout(()=>workspace.openPage('douyin-'+job.session.sessionId,url),200);};
  return <section className="rounded-lg border bg-background p-4 space-y-3" aria-label="抖音全部视频评论监控"><h2 className="font-semibold">抖音全部公开视频 · 评论监控</h2><p className="text-xs text-muted-foreground">逐篇检查本人主页当前列出的作品，按可识别的评论时间展示新近内容。切换模块继续运行；关闭软件或退出账号会停止。分页未加载完整的作品会标注“部分评论”，不代表全量实时事件。</p><div className="flex flex-wrap gap-2"><select aria-label="选择抖音评论监控账号" className="rounded border p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">选择已登录抖音账号</option>{accounts.map(a=><option value={a.id} key={a.id}>{a.nickname}</option>)}</select><Button disabled={!selected} onClick={()=>{const account=accounts.find(a=>a.id===selected);if(account)void monitor.start(account).catch(e=>setError(e.message));}}>监控该账号全部视频</Button></div>{error&&<p role="alert">{error}</p>}{ownJobs.map(job=><div key={job.key} className="flex flex-wrap gap-3 items-center text-sm"><strong>{job.account.nickname}</strong><span>{job.done}/{job.total} · {job.phase}</span>{job.running&&<Button variant="outline" size="sm" onClick={()=>monitor.stop(job.key)}>暂停监控</Button>}</div>)}<div className="max-h-80 overflow-auto divide-y">{rows.map(({job,videoUrl,snapshot,row,index})=><article className="py-2 space-y-1" key={job.key+videoUrl+index}><strong>{row.author}</strong><p className="text-sm">{row.content}</p><small className="text-muted-foreground">{job.account.nickname} · {row.displayTime||'时间未识别'} · {snapshot.partial?'部分评论':'当前页已显示结束'}{snapshot.error?' · 上次读取失败，以下为旧快照':''}</small><Button size="sm" variant="ghost" onClick={()=>void openVideo(job,videoUrl)}>打开原视频处理</Button></article>)}</div></section>;
}

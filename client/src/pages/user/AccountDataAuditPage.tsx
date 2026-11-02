import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {axiosForBackend,getAuthToken,getUser} from '@/api';
import type {AccountDataAudit,AccountDataAuditRow} from '@shared/account-data-audit';
import {followerPresentation,accountMetricSourceLabel} from '@shared/account-metrics';
import {useOwnerRequest} from '@/components/workspace/use-owner-request';
import {notifyAccountDataUpdated,useAccountDataRefresh} from '@/components/workspace/account-data-events';
import {boundedAccountCheck,checkAccountsIndependently} from '@/components/workspace/async-account-checks';
import {platformLabels,useOfficialWorkspace} from '@/components/workspace/OfficialWorkspace';
import {uiOneOf,uiText,useWorkspacePreference} from '@/components/workspace/WorkspaceUiState';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

const statusLabels={current:'已核验',stale:'超过24小时',legacy:'旧值待核验',missing:'尚未采集',duplicate:'重复绑定，不重复计入'};
const time=(value?:string)=>value?new Date(value).toLocaleString('zh-CN'):'—';
export default function AccountDataAuditPage(){return <AuditWorkspace key={getUser()?.id||'signed-out'}/>;}
function AuditWorkspace(){
  const workspace=useOfficialWorkspace(),latest=useRef(workspace);latest.current=workspace;
  const owner=getUser()?.id,token=getAuthToken(),beginRequest=useOwnerRequest();
  const [data,setData]=useState<AccountDataAudit>(),[loading,setLoading]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState('');
  const [results,setResults]=useState<Record<string,string>>({});
  const [platform,setPlatform]=useWorkspacePreference('analytics.audit.platform','douyin',uiOneOf(['all','douyin','xiaohongshu','bilibili','wechat']));
  const [search,setSearch]=useWorkspacePreference('analytics.audit.search','',uiText);
  const alive=useRef(true),lock=useRef(false),lastChecks=useRef(new Map<string,number>());
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const current=()=>alive.current&&getUser()?.id===owner&&getAuthToken()===token;
  const load=useCallback(async()=>{
    const request=beginRequest();if(!request.authorized){request.finish();return;}
    setLoading(true);
    try{const response=await axiosForBackend.get('/api/analytics/account-data-audit',{signal:request.signal});
      if(!request.current())return;const next=response.data?.data as AccountDataAudit;
      if(!Array.isArray(next?.rows)||!next.coverage)throw Error('计数核对结果不完整');
      setData(next);setError('');
    }catch{if(request.current())setError('无法刷新已存数据；保留上次结果，请稍后重试。');}
    finally{request.finish();if(request.current())setLoading(false);}
  },[beginRequest]);
  useEffect(()=>{void load();},[load,owner,token]);useAccountDataRefresh(load);
  const rows=useMemo(()=>data?.rows.filter(row=>(platform==='all'||row.platform===platform)&&row.nickname.toLowerCase().includes(search.trim().toLowerCase()))||[],[data,platform,search]);
  const check=async(targets:AccountDataAuditRow[])=>{
    if(lock.current||!window.matrixDesktop?.inspectAccountHealth||!owner||!token||latest.current.jobsLocked)return;
    lock.current=true;setChecking(true);
    const eligible=targets.filter(row=>row.sessionId);
    const publishResult=(id:string,message:string)=>{if(current())setResults(previous=>({...previous,[id]:message}));};
    const sameBinding=(row:AccountDataAuditRow)=>current()&&!latest.current.jobsLocked&&latest.current.accounts.some(account=>account.id===row.accountId&&account.platform===row.platform&&account.connectorSessionId===row.sessionId);
    try{await checkAccountsIndependently(eligible,async row=>{
      if(!sameBinding(row)){publishResult(row.accountId,'绑定已变化或任务占用，未发起核对');return;}
      const last=lastChecks.current.get(row.accountId)||0;if(Date.now()-last<60000){publishResult(row.accountId,'刚刚核对过，请间隔60秒再试');return;}
      lastChecks.current.set(row.accountId,Date.now());publishResult(row.accountId,'正在只读核对本人主页…');
      try{
        const health=await boundedAccountCheck(()=>window.matrixDesktop!.inspectAccountHealth({accessToken:token,accountId:row.accountId}),35000,'本次核对超时；保留原计数，不自动重试');
        if(!sameBinding(row))return;
        if(health.error||health.state!=='normal'||!health.nickname)throw Error(health.error||health.message||'无法确认本人主页；未覆盖原计数');
        if(health.accountId!==row.accountId||health.sessionId!==row.sessionId)throw Error('核对结果与当前绑定不符，已忽略');
        const saved=await axiosForBackend.post(`/api/platform/accounts/${row.accountId}/desktop-observation`,{sessionId:row.sessionId,nickname:health.nickname,avatarUrl:health.avatarUrl,nativeAccountKey:health.nativeAccountKey,metrics:health.metrics,metricEvidence:health.metricEvidence,metricsError:health.metricsError,observedAt:health.checkedAt},{timeout:12000});
        if(!sameBinding(row))return;
        const updated=saved.data?.data;if(updated?.id!==row.accountId||updated.connectorSessionId!==row.sessionId)throw Error('保存结果不匹配，尚未确认更新');
        publishResult(row.accountId,health.metricsError||(!updated.metricsObservedAt?'尚未获得可信精确数，原记录保留':'精确计数已保存'));
        window.dispatchEvent(new CustomEvent('matrix:account-profile-updated',{detail:{ownerId:owner,account:updated}}));notifyAccountDataUpdated(owner);
      }catch(failure){publishResult(row.accountId,(failure as Error).message.slice(0,200));}
    },()=>current()&&!latest.current.jobsLocked,2);}
    finally{lock.current=false;if(current()){setChecking(false);void load();}}
  };
  const metric=followerPresentation(data?.coverage);
  return <section className="space-y-4" data-matrix-account-data-audit>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">账号数据核对</h1><div className="flex gap-2"><Button variant="outline" disabled={loading||checking} onClick={()=>void load()}>刷新已存数据</Button><Button disabled={checking||!window.matrixDesktop?.inspectAccountHealth||workspace.jobsLocked||!rows.some(row=>row.sessionId)} onClick={()=>void check(rows)}>{checking?'核对中…':'只读核对筛选账号'}</Button></div></div>
    <p className="text-sm text-muted-foreground">按官方账号身份去重，不按昵称合并。只读本人主页的精确计数，不打开粉丝通知、不清除未读；未得到精确值时保留旧记录，不把粉丝名单长度或“万”缩写当总数。</p>
    <p className="text-sm text-muted-foreground">此处记录官方资料返回的计数字段。粉丝指数、活跃粉丝、可访问名单条数及客户端跨产品合并数可能口径不同，不互相反推；切换数据来源不计算涨跌。</p>
    <div className="rounded border p-4"><p>全部平台已核验粉丝小计：<strong>{metric.value===null?'—':metric.value.toLocaleString('zh-CN')}</strong></p><p className="text-sm text-muted-foreground">{metric.detail}；{data?.coverage.bindingCount??0} 个绑定。以下筛选不改变该小计。</p></div>
    {error&&<p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2"><select aria-label="核对平台" className="rounded border bg-background p-2" value={platform} onChange={event=>setPlatform(event.target.value)}><option value="all">全部平台</option>{Object.entries(platformLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><Input className="max-w-xs" aria-label="搜索核对账号" placeholder="搜索账号昵称" value={search} onChange={event=>setSearch(event.target.value)}/></div>
    <div className="space-y-3">{rows.map(row=><article key={row.accountId} className="rounded border p-4" data-account-id={row.accountId}><div className="flex flex-wrap justify-between gap-2"><strong>{platformLabels[row.platform]} · {row.nickname}</strong><span>{statusLabels[row.status]}</span></div><div className="mt-2 grid gap-2 text-sm md:grid-cols-2"><p>精确粉丝数：{row.followers===null?'—':row.followers.toLocaleString('zh-CN')}{row.included?'（计入小计）':''}</p><p>采集时间：{time(row.observedAt)}</p><p>来源：{accountMetricSourceLabel(row.source)}</p><p>最近尝试：{time(row.lastAttemptAt)}</p>{row.cachedValue!==undefined&&<p>历史存储值：{row.cachedValue.toLocaleString('zh-CN')}（未核验，不计入小计）</p>}{row.duplicateOf&&<p>计入绑定：{data?.rows.find(item=>item.accountId===row.duplicateOf)?.nickname||'同一官方账号的更新记录'}</p>}</div>{row.error&&<p className="mt-2 text-sm text-orange-700">{row.error}</p>}{results[row.accountId]&&<p role="status" className="mt-2 text-sm">{results[row.accountId]}</p>}<Button className="mt-3" size="sm" variant="outline" disabled={checking||!row.sessionId||!window.matrixDesktop?.inspectAccountHealth||workspace.jobsLocked} onClick={()=>void check([row])}>核对该账号</Button></article>)}</div>
    {!rows.length&&!loading&&<p>当前筛选没有账号。</p>}
    {!window.matrixDesktop?.inspectAccountHealth&&<p className="text-sm text-muted-foreground">浏览器版仅查看已存数据；本人主页核对需要桌面版。</p>}
  </section>;
}

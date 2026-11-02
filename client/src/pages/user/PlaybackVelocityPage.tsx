import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { useWorkspaceIdentity } from '@/components/workspace/WorkspaceUiState';
import { useDouyinInteractionData } from '@/components/workspace/DouyinInteractionData';
import { playbackVelocity } from '@shared/playback-velocity';

const labels={missing:'未采集播放数',baseline:'等待第二次采样',waiting:'采样间隔不足一分钟','counter-reset':'播放计数回落，等待新基线',measured:'已观测区间'};
const date=(s?:string)=>s?new Date(s).toLocaleString('zh-CN',{hour12:false}):'—';
export default function PlaybackVelocityPage(){return <PlaybackPanel key={useWorkspaceIdentity()}/>;}
function PlaybackPanel(){
 const workspace=useOfficialWorkspace(),data=useDouyinInteractionData('comments');
 const [selected,setSelected]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const accounts=workspace.accounts.filter(a=>a.platform==='douyin'&&a.connectorSessionId);
 const rows=useMemo(()=>accounts.filter(a=>!selected||a.id===selected).flatMap(a=>(data.entry(a,'comments')?.works||[]).map(work=>({account:a,work,reading:playbackVelocity(work,a.nativeAccountKey)}))).filter(r=>(r.work.title+' '+r.work.platformId).toLowerCase().includes(query.toLowerCase())),[workspace.accounts,data,selected,query]);
 const pages=Math.max(1,Math.ceil(rows.length/50)),current=Math.min(page,pages),account=accounts.find(a=>a.id===selected);
 const exportCsv=()=>{
  const cell=(v:unknown)=>{let s=v===undefined?'':String(v);if(/^[\s\uFEFF]*[=+@-]/u.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const csv='\uFEFF'+[['账号','作品编号','标题','上次播放数','上次采样时间','本次播放数','本次采样时间','区间新增','区间分钟','折算次/小时','状态'],...rows.map(({account:a,work:w,reading:r})=>[a.nickname,w.platformId,w.title,r.previous?.count,r.previous?.at,r.latest?.count,r.latest?.at,r.delta,r.elapsedMs===undefined?undefined:r.elapsedMs/60000,r.perHour,labels[r.state]])].map(r=>r.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='远效-已观测播放流速.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <section className="space-y-4" aria-label="作品播放流速">
  <header><h1 className="text-xl font-semibold">作品播放流速</h1><p className="text-sm text-muted-foreground">以本人创作者后台实际返回的播放数计算两个采样点间的平均变化，不是瞬时流量或预测值。</p></header>
  <div className="rounded-lg border bg-card p-4 text-sm space-y-2"><p>沿用抖音作品采集；没有另开采集窗口。官网未返回播放数时显示“—”，首次采样不会计算流速。旧草稿的默认播放数不参与统计。</p><p>每个作品保留最多16个历史点，历史点间隔至少5分钟；新返回的准确计数可与至少1分钟前的样本比较。官网数据可能延迟，刷新页面不会制造新样本。</p><Link to="/accounts" className="text-primary">到账号管理核对官网账号</Link></div>
  <div className="flex flex-wrap items-center gap-3"><label>账号 <select aria-label="播放流速账号" className="rounded border p-2" value={selected} onChange={e=>{setSelected(e.target.value);setPage(1);}}><option value="">全部抖音账号</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.nickname}</option>)}</select></label><input aria-label="搜索播放流速作品" className="rounded border p-2" placeholder="搜索标题或作品编号" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/><Button variant="outline" disabled={!account||workspace.jobsLocked} onClick={()=>{if(account)data.refresh(account,'comments');}}>刷新所选账号作品</Button><Button variant="outline" disabled={!rows.length} onClick={exportCsv}>导出采样 CSV</Button></div>
  {account&&<p role="status" className="text-sm text-muted-foreground">{data.entry(account,'comments')?.error||data.entry(account,'comments')?.phase||'等待加载已有缓存'}</p>}
  <div className="overflow-auto rounded-lg border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">作品 / 账号</th><th className="p-3">播放数</th><th className="p-3">区间新增</th><th className="p-3">折算次 / 小时</th><th className="p-3">采样区间与状态</th></tr></thead><tbody>{rows.slice((current-1)*50,current*50).map(({account:a,work:w,reading:r})=><tr key={a.id+'/'+w.platformId} className="border-b" data-playback-row><th className="p-3 text-left font-normal"><strong>{w.title||w.platformId}</strong><small className="block text-muted-foreground">{a.nickname} · {w.platformId}</small></th><td className="p-3">{r.latest?.count.toLocaleString('zh-CN')??'—'}</td><td className="p-3">{r.delta?.toLocaleString('zh-CN')??'—'}</td><td className="p-3">{r.perHour===undefined?'—':r.perHour.toLocaleString('zh-CN',{maximumFractionDigits:1})}</td><td className="p-3">{labels[r.state]}{r.stale?' · 样本超过30分钟':''}<small className="block text-muted-foreground">{r.previous?date(r.previous.at)+' → ':''}{date(r.latest?.at)}</small></td></tr>)}</tbody></table>{!rows.length&&<p className="p-6 text-muted-foreground">{accounts.length?'尚无匹配的已采集作品；可选择账号后刷新作品。':'请先在账号管理绑定抖音账号。'}</p>}</div>
  <footer className="flex items-center gap-3 text-sm"><span>{rows.length} 个缓存作品 · 第 {current}/{pages} 页</span><Button variant="outline" disabled={current<=1} onClick={()=>setPage(current-1)}>上一页</Button><Button variant="outline" disabled={current>=pages} onClick={()=>setPage(current+1)}>下一页</Button></footer>
 </section>;
}

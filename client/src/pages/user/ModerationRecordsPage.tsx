import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { usePublishQueue } from '@/components/workspace/PublishQueue';
import { useWorkspaceIdentity } from '@/components/workspace/WorkspaceUiState';
import { moderationOf,moderationLabels } from '@/components/workspace/publish-moderation';
export default function ModerationRecordsPage(){return <Records key={useWorkspaceIdentity()}/>;}
function Records(){
 const {jobs}=usePublishQueue();
 const [filter,setFilter]=useState(''),[platform,setPlatform]=useState(''),[page,setPage]=useState(1);
 const items=useMemo(()=>jobs.map(job=>({job,result:moderationOf(job)})).filter(r=>(!filter||r.result.state===filter)&&(!platform||r.job.platform===platform)).sort((a,b)=>b.job.updatedAt.localeCompare(a.job.updatedAt)),[jobs,filter,platform]);
 const pages=Math.max(1,Math.ceil(items.length/50)),current=Math.min(page,pages);
 return <section className="space-y-4" aria-label="作品审核记录"><header><h1 className="text-xl font-semibold">作品审核记录</h1><p className="text-sm text-muted-foreground">汇总当前用户原发布任务的官方回执。平台已接收、等待审核的作品仍计为发布成功。</p></header>
  <div className="rounded-lg border bg-card p-4 text-sm space-y-2"><p>“已确认发布”不代表后续永远不会被下架；“官方提示未通过”保留官网原文，不自动推断违规原因。上传失败、未找到作品、核对超时都不算违规。</p><p>这里只覆盖本机原任务，不包含全部历史作品或平台处罚通知。页面不会自动重发、删除作品或启动高频查询。</p><Link to="/publish/tasks" className="text-primary">查看原任务与发布回执</Link></div>
  <div className="flex flex-wrap gap-3"><label>状态 <select aria-label="审核状态筛选" className="rounded border p-2" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="">全部状态</option>{Object.entries(moderationLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>平台 <select aria-label="审核平台筛选" className="rounded border p-2" value={platform} onChange={e=>{setPlatform(e.target.value);setPage(1);}}><option value="">全部平台</option>{Object.entries({douyin:'抖音',xiaohongshu:'小红书',bilibili:'B站',wechat:'视频号'}).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
  <div className="space-y-2">{items.slice((current-1)*50,current*50).map(({job,result})=><article key={job.id} data-moderation-row className="rounded-lg border bg-card p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{job.title||'未命名作品'} · {job.nickname}</strong><span>{result.label}</span></div><p className="my-2 text-muted-foreground">{result.detail}</p><small>最近官方核对：{result.checkedAt?new Date(result.checkedAt).toLocaleString('zh-CN',{hour12:false}):'未记录'}</small></article>)}</div>
  {!items.length&&<p className="rounded border p-6 text-muted-foreground">没有符合条件的本地任务；不能据此判断账号没有违规。</p>}
  <footer className="flex items-center gap-3 text-sm"><span>{items.length} 条记录 · 第 {current}/{pages} 页</span><Button variant="outline" disabled={current<=1} onClick={()=>setPage(current-1)}>上一页</Button><Button variant="outline" disabled={current>=pages} onClick={()=>setPage(current+1)}>下一页</Button></footer>
 </section>;
}

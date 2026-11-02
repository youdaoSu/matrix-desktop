import { Button } from '@/components/ui/button';
import { useDouyinInboxCache, inboxAccountStatus } from '@/components/workspace/DouyinInbox';
import type { OperationsSnapshot } from '@shared/account-operations';

export function OperationsMonitoring({data,busy,onConnections,onRules}:{data?:OperationsSnapshot;busy:boolean;onConnections():void;onRules():void}){
 const inbox=useDouyinInboxCache();
 const labels:Record<string,string>={off:'未启动',waiting:'等待下一页',reading:'正在读取',ready:'持续监控',paused:'已暂停'};
 return <section className="ops-card"><h2>监控与自动发送状态</h2>
  <p>监控、规则与发送分别显示。先核对规则文案和发送账号，再开启对应自动模式；不会补发历史消息。</p>
  {data?.settings.policy.paused&&<div className="ops-alert">全局已暂停，请在“运行与安全”中核对并恢复。</div>}
  {!data&&<p className="ops-empty">正在读取监控状态…</p>}
  {data&&!data.accounts.length&&<p className="ops-empty">暂无已绑定的抖音或小红书账号，请先到账号管理绑定。</p>}
  {data?.accounts.map(a=>{const comment=data.commentMonitors?.find(m=>m.accountId===a.id),dm=inboxAccountStatus(inbox.rows[a.accountId]);return <article className="ops-reply" key={a.id}>
   <h3>{a.name} · {a.platform==='douyin'?'抖音':'小红书'}</h3>
   {a.platform==='douyin'?<><p>评论读取：{comment?labels[comment.status]||comment.status:'状态尚未读取'} · {comment?.detail}</p>{comment?.lastReadAt&&<small>最近成功读取：{new Date(comment.lastReadAt).toLocaleString('zh-CN',{hour12:false})}</small>}<p>私信通道：{dm.label}</p><small>{dm.detail}</small></>:<>{data.connections?.connections.filter(c=>c.accountId===a.id).map(c=><p key={c.channel}>{c.channel==='dm'?'私信':c.channel==='comment'?'评论':'新增关注'}：{c.monitorEnabled?'监听已开启':'未监听'} · {c.detail}</p>)}</>}
   <div className="ops-row">{(['comment','dm','follow'] as const).map(channel=>{const mode=data.settings.modes.find(m=>m.accountId===a.id&&m.channel===channel)?.mode||'review';return <span className="ops-status" key={channel}>{channel==='dm'?'私信':channel==='comment'?'评论':'新增关注'}发送：{mode==='auto'?'自动':mode==='off'?'关闭':'逐条核对'}</span>;})}</div>
  </article>;})}
  <div className="ops-row"><Button variant="outline" disabled={busy} onClick={onRules}>配置回复规则与模式</Button><Button variant="outline" disabled={busy} onClick={onConnections}>检查官网连接</Button></div>
  <p className="ops-muted">同一账号共用读取队列和分页位置；发送结果不明时保留原任务供核对，不自动重发。睡眠或退出软件后不运行。</p>
 </section>;
}

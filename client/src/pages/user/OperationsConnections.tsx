import { operationsAccountLabel } from './operations-account-label';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OperationsAccount, OperationsCommand, OperationsSnapshot } from '@shared/account-operations';

type Props={data?:OperationsSnapshot;busy:boolean;run(command:OperationsCommand,args?:unknown):Promise<unknown>};
const channels={dm:'私信',comment:'评论',follow:'真实新增关注通知'};
const statuses:Record<string,string>={ready:'已核对',login:'需核对登录',closed:'尚未打开',unconfigured:'等待检查',error:'已停止，需检查',recovering:'等待重新核对'};
export function OperationsConnections({data,busy,run}:Props){
 const act=(command:OperationsCommand,args:unknown)=>void run(command,args).catch(()=>{});
 const resources=data?.connections?.resources;
 return <>
  <section className="ops-card"><h2>同账号官网互动连接</h2><p className="ops-muted">沿用账号管理已验证的登录分区，不重新绑定。官网监听可能更新通知／会话已读状态；默认不启用，首次检查只建立历史基线。抖音原生私信、评论继续走原链路，不会重复读取为新事件。</p>
   {resources&&<p className="ops-muted">运营页面：{resources.residentCount} 个 · 后台 {resources.hiddenCount} 个 · 正在监听 {resources.monitoringCount} 个 · 正在处理 {resources.busyCount} 个</p>}
   {data?.accounts.map(a=><article className="ops-reply" key={a.id}><h3>{a.name} · {a.platform==='douyin'?'抖音':'小红书'}</h3>
    {(data.connections?.connections||[]).filter(c=>c.accountId===a.id&&!(a.platform==='douyin'&&c.channel==='comment')).map(c=>{
     const dependency=a.platform==='douyin'&&c.channel==='dm',title=dependency?'官网私信页（新关注单聊准备）':channels[c.channel];
     return <div className="ops-reply" key={c.channel}><div className="ops-row"><strong>{title}</strong><span className="ops-status">{statuses[c.status]||c.status}{c.monitorEnabled?' · 监听已开启':' · 未监听'}</span></div><p>{c.detail}</p>
      {c.lastSuccessfulAt&&<small>最近核对：{new Date(c.lastSuccessfulAt).toLocaleString('zh-CN',{hour12:false})}</small>}
      <div className="ops-row"><Button size="sm" variant="outline" disabled={busy} onClick={()=>act('connection-open',{accountId:a.id,channel:c.channel,background:false})}>打开同账号页面</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>act('connection-check',{accountId:a.id,channel:c.channel})}>检查连接，不发送</Button>
       {!dependency&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>{const enabled=!c.monitorEnabled;if(enabled&&!window.confirm(`开启「${a.name}」${title}监听？\n官网可能更新通知或会话已读状态。首次仅建立历史基线，不补发旧消息；发送模式单独设置。`))return;act('connection-monitor',{accountId:a.id,channel:c.channel,enabled,acknowledgeOfficialRead:enabled});}}>{c.monitorEnabled?'停止监听':'知悉已读影响，开启监听'}</Button>}
      </div></div>;
    })}
    <div className="ops-review"><p>自动欢迎／评论私信的首个单聊：{data.connections?.connections.find(c=>c.accountId===a.id&&c.channel==='dm')?.firstConversationAllowed?'已明确允许':'默认未允许，仅既有会话'}</p><p className="ops-muted">开启后只为真实新关注或重新核验的原评论作者准备同账号单聊；平台限制照常停止，不自动关注或代替你完成验证。已有自动规则的发送范围可能因此扩大，请先核对规则。</p><Button size="sm" variant="outline" disabled={busy} onClick={()=>{const allowed=!data.connections?.connections.find(c=>c.accountId===a.id&&c.channel==='dm')?.firstConversationAllowed;if(allowed&&!window.confirm(`明确允许「${a.name}」的自动欢迎／评论私信为真实来源、平台允许的关系建立首个单聊？\n仍按当前逐条核对或自动模式处理；默认旧历史不补发，未知结果不重试。`))return;act('connection-first-chat',{accountId:a.id,allowed,acknowledgeEligibleRelationship:allowed});}}>{data.connections?.connections.find(c=>c.accountId===a.id&&c.channel==='dm')?.firstConversationAllowed?'撤回首个单聊授权':'明确允许首个单聊准备'}</Button></div>
   </article>)}
   <Button variant="outline" disabled={busy} onClick={()=>act('connection-release-idle',{})}>释放已确认空闲的后台页</Button><p className="ops-muted">保留草稿、对话框和未知发送结果所在页面，不强行关闭。登录／验证问题请到账号管理处理。</p>
  </section>
  <section className="ops-card"><h2>账号分工</h2><p className="ops-muted">只调整已绑定账号的运营关联，不改变账号登录。当前仍有待确认、发送中或未知结果的协作任务时不能改变分工。此处保存分工本身不会创建或发送消息。</p>
   {data?.accounts.map(a=><TeamRow key={a.id+':'+a.role+':'+a.primaryAccountId} account={a} accounts={data.accounts} busy={busy} save={changes=>act('save-teams',[changes])}/>)}
  </section>
 </>;
}
function TeamRow({account,accounts,busy,save}:{account:OperationsAccount;accounts:OperationsAccount[];busy:boolean;save(value:unknown):void}){
 const [role,setRole]=useState(account.role||'independent'),[primary,setPrimary]=useState(account.primaryAccountId||''),[notes,setNotes]=useState(account.notes||'');
 return <div className="ops-reply"><strong>{operationsAccountLabel(account)}</strong><div className="ops-grid"><label className="ops-field">运营分工<select value={role} disabled={busy} onChange={e=>setRole(e.target.value as typeof role)}><option value="independent">独立账号</option><option value="primary">主账号</option><option value="member">协作账号</option></select></label>
  {role==='member'&&<label className="ops-field">所属同平台主账号<select value={primary} disabled={busy} onChange={e=>setPrimary(e.target.value)}><option value="">选择主账号</option>{accounts.filter(a=>a.id!==account.id&&a.platform===account.platform&&a.role==='primary').map(a=><option key={a.id} value={a.id}>{operationsAccountLabel(a)}</option>)}</select></label>}
  <label className="ops-field">内部备注<input maxLength={5000} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div><Button size="sm" variant="outline" disabled={busy||role==='member'&&!primary} onClick={()=>save({id:account.id,role,primaryAccountId:role==='member'?primary:null,notes})}>保存分工，不发送</Button></div>;
}

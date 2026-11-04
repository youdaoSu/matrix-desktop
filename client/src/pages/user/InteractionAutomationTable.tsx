import { operationsAccountLabel } from './operations-account-label';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { OperationsRule, OperationsSnapshot } from '@shared/account-operations';

type Section = 'comment' | 'dm' | 'batch';
const batchLabels: Record<string, string> = { idle:'未开始', waiting:'等待间隔', running:'运行中', stopping:'停止中', stopped:'已停止', completed:'已完成', done:'已完成', paused:'已暂停', failed:'失败', sent:'已确认发送', queued:'排队中', pending:'待处理', sending:'发送中', unknown:'结果待核对', cancelled:'已取消', skipped:'已跳过' };
export function InteractionAutomationTable({ section, data, busy, error, refresh, open, edit, toggle, remove, stop, panel, panelTitle, onClose }: {
  section: Section; data?: OperationsSnapshot; busy: boolean; error: string; refresh():void;
  open(tab:string):void; edit(rule?:OperationsRule):void; toggle(rule:OperationsRule):void; remove(rule:OperationsRule):void; stop():void;
  panel?:ReactNode; panelTitle:string; onClose():void;
}) {
  const batch = section === 'batch', title = batch ? '批量任务' : section === 'comment' ? '自动评论' : '自动私信';
  const [search,setSearch] = useState(''), [account,setAccount] = useState(''), [status,setStatus] = useState('all'), [page,setPage] = useState(1);
  const accountName=(id:string)=>data?.accounts.find(a=>a.id===id)?.name || '原绑定已不可用';
  const scope=(r:OperationsRule)=>data?.accounts.filter(a=>(r.platform==='all'||a.platform===r.platform)&&(!r.accountIds.length||r.accountIds.includes(a.id))) || [];
  const rules=(data?.rules||[]).filter(r=>(r.channel===section||r.channel==='all'||section==='dm'&&(r.channel==='follow'||r.deliveryChannel==='dm'))&&r.name.toLowerCase().includes(search.trim().toLowerCase())&&(!account.trim()||scope(r).some(a=>(a.name+' '+a.id).toLowerCase().includes(account.trim().toLowerCase())))&&(status==='all'||(r.enabled?'enabled':'disabled')===status));
  const tasks=(data?.batch.tasks||[]).filter(t=>(t.recipientName+' '+t.replyText).toLowerCase().includes(search.trim().toLowerCase())&&(t.accountName+' '+t.accountId).toLowerCase().includes(account.trim().toLowerCase())&&(status==='all'||t.status===status));
  const ownPlan=section==='dm'?data?.ownFanPlan:null;
  const ownAccount=data?.accounts.find(a=>a.id===ownPlan?.accountId);
  const showOwnPlan=!!ownPlan&&'粉丝欢迎语 分批私信'.includes(search.trim())&&(!account.trim()||(ownAccount?operationsAccountLabel(ownAccount)+' '+ownAccount.id:'').toLowerCase().includes(account.trim().toLowerCase()))&&(status==='all'||(status==='enabled')===['running','waiting'].includes(ownPlan.status));
  const routed=(section==='dm'||section==='comment'?data?.keywordRoutes?.rules||[]:[]).filter(r=>r.name.toLowerCase().includes(search.trim().toLowerCase())&&(!account.trim()||data?.accounts.some(a=>[r.primaryAccountId,...r.senderAccountIds].includes(a.id)&&(operationsAccountLabel(a)+' '+a.id).toLowerCase().includes(account.trim().toLowerCase())))&&(status==='all'||(r.armed?'enabled':'disabled')===status));
  const ruleOffset=(showOwnPlan?1:0)+routed.length;
  const total=batch?tasks.length:rules.length+ruleOffset, pages=Math.max(1,Math.ceil(total/20)), current=Math.min(page,pages);
  useEffect(()=>{if(page>pages)setPage(pages);},[page,pages]);
  const modeText=(r:OperationsRule)=>{
    if(!r.enabled)return '已停用';
    if(data?.halted)return '后台已停止';
    if(data?.settings.policy.paused)return '全局暂停';
    const accounts=scope(r); if(!accounts.length)return '无可用账号';
    return accounts.map(a=>{const mode=data?.settings.modes.find(m=>m.accountId===a.id&&m.channel===r.channel)?.mode||'review';return operationsAccountLabel(a)+'：'+(mode==='auto'?'自动已开启':mode==='off'?'已关闭':'逐条核对');}).join('；');
  };
  const name='任务', legacy=batch?'manual-tasks':section==='comment'?'manual-comment':'manual-message';
  const changeFilter=(setter:(value:string)=>void,value:string)=>{setter(value);setPage(1);};
  return <div className="matrix-interaction-task-page" data-interaction-view={batch?'batch-tasks':section==='comment'?'auto-comment':'auto-message'} data-automation-table>
    <p className="matrix-interaction-hint"><strong>{title}</strong> {batch?'选择已有来信创建回复任务，发送结果以平台回执为准。':'在新建计划内配置条件与自动执行开关；账号分工统一在账号管理设置。'} <Link to={'/engage/'+legacy}>查看原人工待办</Link></p>
    <div className="matrix-interaction-toolbar">
      <Input aria-label="搜索计划名称" placeholder={batch?'搜索接收人 / 文案':'搜索计划名称'} value={search} onChange={e=>changeFilter(setSearch,e.target.value)}/>
      <Input aria-label="搜索执行账号" placeholder="账号昵称 / ID" value={account} onChange={e=>changeFilter(setAccount,e.target.value)}/>
      <span className="matrix-toolbar-spacer"/>{batch&&<Button disabled={busy||!data} onClick={()=>edit()}>新建自动化计划</Button>}
      <Button variant="outline" disabled={busy} onClick={refresh}><RefreshCw size={15}/>刷新</Button>
      <Button disabled={busy||!data} onClick={()=>batch?open('reply'):edit()}><Plus size={15}/>{batch?'新建任务':'新建计划'}</Button>
    </div>
    <div className="matrix-interaction-actionbar">
      <select aria-label="运行状态筛选" value={status} onChange={e=>changeFilter(setStatus,e.target.value)}><option value="all">全部状态</option>{batch?Object.entries(batchLabels).map(([id,label])=><option key={id} value={id}>{label}</option>):<><option value="enabled">计划启用</option><option value="disabled">计划停用</option></>}</select>
      <Button variant="outline" onClick={()=>open('monitor')}>监控状态</Button>
      <Button variant="outline" onClick={()=>open('history')}>发送记录</Button>
    </div>
    {(error||data?.error)&&<p className="matrix-interaction-hint" role="alert">{error||data?.error}</p>}
    {data?.halted&&<p role="status">后台已停止，请检查登录状态。</p>}
    {data?.settings.policy.paused&&<p role="status">全局已暂停，尚未开始的任务不会发送。</p>}
    {!data&&!error&&<p role="status">正在加载{title}…</p>}
    {batch&&data?.batch.id&&<div className="matrix-interaction-actionbar"><span>当前批次：{batchLabels[data.batch.status]||data.batch.status} · 已确认 {data.batch.sent}/{data.batch.total} · {data.batch.detail}</span><Button variant="outline" disabled={busy||!['running','stopping'].includes(data.batch.status)} onClick={stop}>停止未开始的回复</Button></div>}
    <div className="matrix-interaction-table-wrap"><table aria-label={`${title}列表`}><thead><tr>{(batch?['任务名称','任务类型','状态','操作账号','已确认发送数','结果说明','操作']:['计划名称','执行账号',...(section==='comment'?['作品范围']:[]),'运行状态','监控方式','概要','操作']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{showOwnPlan&&ownPlan&&current===1&&<tr data-own-fan-plan={ownPlan.id}><td><strong>粉丝欢迎语</strong><small>未联系粉丝分批私信</small></td><td>{ownAccount?operationsAccountLabel(ownAccount):'原绑定已不可用'}</td><td>{batchLabels[ownPlan.status]||ownPlan.status}</td><td>分批执行</td><td>已处理 {ownPlan.cursor}/{ownPlan.total} · 已确认发送 {ownPlan.sent}<small>{ownPlan.detail}</small></td><td><Button variant="outline" disabled={busy} onClick={()=>open('own-fans')}>查看计划</Button></td></tr>}
      {routed.filter((_r,i)=>{const index=i+(showOwnPlan?1:0);return index>=(current-1)*20&&index<current*20;}).map(r=><tr key={'route-'+r.id} data-keyword-plan={r.id}><td><strong>{r.name}</strong></td><td>{data?.accounts.filter(a=>[r.primaryAccountId,...r.senderAccountIds].includes(a.id)).map(operationsAccountLabel).join('、')}</td>{section==='comment'&&<td>{r.workIds.length?r.workIds.join('、'):'主账号作品'}</td>}<td>{r.armed?'已启用':'已暂停'}</td><td>评论关键词 → 协作私信</td><td>{r.replyText}<small>{r.keywords.join('、')}</small></td><td><Button variant="outline" disabled={busy} onClick={()=>open('keyword-routes')}>查看与编辑计划</Button></td></tr>)}
      {batch?tasks.slice((current-1)*20,current*20).map(t=><tr key={t.id} data-task-id={t.id}><td><strong>{t.recipientName||t.recipientId}</strong><small>{t.replyText}</small></td><td>私信回复</td><td>{t.status?batchLabels[t.status]||t.status:'未返回状态'}</td><td>{t.accountName||accountName(t.accountId)}</td><td>{t.status==='sent'?1:0}</td><td>{t.detail||'—'}</td><td><Button variant="outline" onClick={()=>open('reply')}>查看本批详情</Button></td></tr>):rules.slice(Math.max(0,(current-1)*20-ruleOffset),Math.max(0,current*20-ruleOffset)).map(r=><tr key={r.id} data-rule-id={r.id}><td><strong>{r.name}</strong></td><td className="matrix-interaction-account-cell">{scope(r).map(operationsAccountLabel).join('、')||'原账号已解绑'}<small>{r.platform==='all'?'全部支持平台':r.platform==='douyin'?'抖音':'小红书'}</small></td>{section==='comment'&&<td>账号可读取作品</td>}<td>{modeText(r)}</td><td>{section==='comment'?'后台分页读取':'私信监听'}<small><button type="button" onClick={()=>open('monitor')}>查看读取状态</button></small></td><td className="matrix-task-summary">{r.replyText}<small>{r.keywords.length?r.keywords.join('、'):'任意文本'}</small></td><td><div className="matrix-record-actions"><Button variant="outline" disabled={busy} onClick={()=>edit(r)}>编辑</Button><Button variant="outline" disabled={busy} onClick={()=>toggle(r)}>{r.enabled?'停用':'启用'}</Button><Button variant="outline" disabled={busy} onClick={()=>remove(r)}>删除</Button></div></td></tr>)}
      {data&&total===0&&<tr><td colSpan={7}>暂无符合条件的{batch?name:'计划'}</td></tr>}
    </tbody></table></div>
    <div className="flex items-center justify-end gap-3 text-sm"><span>共 {data?total:'—'} 条 · 每页 20 条</span><Button variant="outline" disabled={busy||current===1} onClick={()=>setPage(current-1)}>上一页</Button><span>第 {current}/{pages} 页</span><Button variant="outline" disabled={busy||current>=pages} onClick={()=>setPage(current+1)}>下一页</Button></div>
    <Dialog open={!!panel} onOpenChange={value=>{if(!value&&!busy)onClose();}}><DialogContent className="ops-automation-dialog"><DialogHeader><DialogTitle>{panelTitle}</DialogTitle><DialogDescription>配置和记录沿用当前账号；关闭窗口后后台任务继续运行。</DialogDescription></DialogHeader><div className="ops-page ops-automation-dialog-body" data-automation-dialog-body role="region" aria-label={`${panelTitle}内容`} tabIndex={0}>{panel}</div><div className="ops-automation-dialog-footer"><Button variant="outline" disabled={busy} onClick={onClose}>返回列表</Button></div></DialogContent></Dialog>
  </div>;
}

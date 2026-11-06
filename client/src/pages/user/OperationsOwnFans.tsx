import { operationsAccountLabel } from './operations-account-label';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OperationsCommand, OperationsSnapshot, OperationsFan } from '@shared/account-operations';

type Preview={token:string;accountId:string;text:string;recipients:OperationsFan[];recipientCount?:number;scanned:number;excluded:number;unknown:number;nextOffset:number;sourceTotal:number;sourceComplete?:boolean;batchSize:number;intervalSeconds:number;batchGapSeconds:number;followOnFailure?:boolean};
type Props={data?:OperationsSnapshot;busy:boolean;run(command:OperationsCommand,args?:unknown):Promise<unknown>};
const labels:Record<string,string>={running:'执行中',waiting:'等待间隔',paused:'已暂停',completed:'已完成',cancelled:'已结束'};
export function OperationsOwnFans({data,busy,run}:Props){
 const [accountId,setAccount]=useState(''),[text,setText]=useState(''),[batchSize,setSize]=useState(10),[intervalSeconds,setInterval]=useState(30),[batchGapSeconds,setGap]=useState(300),[offset,setOffset]=useState(0),[scanLimit,setLimit]=useState(100),[scanAll,setAll]=useState(true),[followOnFailure,setFollow]=useState(true),[preview,setPreview]=useState<Preview>(),[page,setPage]=useState(0),[pageRows,setPageRows]=useState<OperationsFan[]>([]);
 const current=useRef(0);useEffect(()=>()=>{current.current++;},[]);
 const plan=data?.ownFanPlan,active=plan&&['running','waiting'].includes(plan.status),locked=busy||!!active||!!plan?.working,accounts=data?.accounts.filter(a=>a.platform==='douyin'&&a.role==='primary')||[];
 const edit=(change:()=>void)=>{current.current++;change();setPreview(undefined);setPage(0);setPageRows([]);};
 const act=(command:OperationsCommand)=>void run(command,{}).catch(()=>{});
 const count=preview?.recipientCount??preview?.recipients.length??0;
 const readPreview=()=>{
  const generation=++current.current;setPreview(undefined);setPageRows([]);
  void run('own-fan-preview',{accountId,text,batchSize,intervalSeconds,batchGapSeconds,offset:scanAll?0:offset,scanLimit,scanAll,followOnFailure}).then(value=>{
   if(current.current!==generation)return;const result=value as Preview;setPreview(result);setPage(0);setPageRows(result.recipients.slice(0,50));
  }).catch(()=>{});
 };
 const readPage=(next:number)=>{
  if(!preview)return;const generation=current.current,token=preview.token;
  void run('own-fan-preview-page',{token,offset:next*50,limit:50}).then(value=>{
   if(current.current!==generation)return;const result=value as {token:string;offset:number;items:OperationsFan[]};
   if(result.token!==token||result.offset!==next*50)return;setPage(next);setPageRows(result.items);
  }).catch(()=>{});
 };
 return <section className="ops-card" aria-label="本人粉丝分批私信">
  <h2>未私信粉丝欢迎语</h2>
  <p className="ops-muted">使用粉丝关注的本人抖音账号，核对当前可读取的完整私信历史，向未发过私信的粉丝发送欢迎语。已有发送、待处理记录或历史尚未读全的对象不加入队列。</p>
  <p className="ops-muted">成功发送和需要申请好友的粉丝会保留排除标记，换欢迎语、重建计划也不会再次加入。平台删除或不再提供的历史无法证明从未联系。</p>
  <div className="ops-grid">
   <label className="ops-field">发送账号<select aria-label="粉丝批次发送账号" value={accountId} disabled={locked} onChange={e=>edit(()=>setAccount(e.target.value))}><option value="">选择本人抖音主账号</option>{accounts.map(a=><option key={a.id} value={a.id}>{operationsAccountLabel(a)}</option>)}</select></label>
   <label className="ops-field">每批人数<input aria-label="每批粉丝人数" type="number" min={1} max={50} value={batchSize} disabled={locked} onChange={e=>edit(()=>setSize(Number(e.target.value)))}/></label>
   <label className="ops-field">同批次逐条间隔（秒，至少5秒）<input aria-label="粉丝逐条间隔" type="number" min={5} max={3600} value={intervalSeconds} disabled={locked} onChange={e=>edit(()=>setInterval(Number(e.target.value)))}/></label>
   <label className="ops-field">不同批次间隔（秒）<input aria-label="粉丝批次间隔" type="number" min={5} max={86400} value={batchGapSeconds} disabled={locked} onChange={e=>edit(()=>setGap(Number(e.target.value)))}/></label>
  </div>
  <label className="ops-field"><span><input aria-label="核对全部粉丝" type="checkbox" checked={scanAll} disabled={locked} onChange={e=>edit(()=>setAll(e.target.checked))}/> 核对全部已同步粉丝</span><small>先在账号管理完成全部粉丝同步；名单核对期间发生变化会停止，避免漏查。历史不完整的对象保留待核对。</small></label>
  {!scanAll&&<div className="ops-grid">
   <label className="ops-field">从缓存第几位开始（0为首位）<input aria-label="粉丝扫描起点" type="number" min={0} max={50000} value={offset} disabled={locked} onChange={e=>edit(()=>setOffset(Number(e.target.value)))}/></label>
   <label className="ops-field">本轮核对人数<input aria-label="本轮粉丝核对人数" type="number" min={1} max={500} value={scanLimit} disabled={locked} onChange={e=>edit(()=>setLimit(Number(e.target.value)))}/></label>
  </div>}
  {!accounts.length&&<p>请先在连接设置中，将已绑定的抖音账号设置为主账号；发送账号不会替换为其他小号。</p>}
  <label className="ops-field">自定义欢迎语<textarea aria-label="粉丝批次文案" maxLength={2000} value={text} disabled={locked} onChange={e=>edit(()=>setText(e.target.value))}/></label>
  <label className="ops-field"><span><input aria-label="发送失败先关注" type="checkbox" checked={followOnFailure} disabled={locked} onChange={e=>edit(()=>setFollow(e.target.checked))}/> 明确发送失败后，尝试普通关注再发送一次</span><small>仅在确定未发送且平台允许普通关注时执行；若需要申请好友，不提交申请，直接移出队列并标记不再加入。关注或发送结果不明时暂停核对。</small></label>
  <Button variant="outline" disabled={locked||!accountId||!text.trim()} onClick={readPreview}>核对未联系粉丝，不发送</Button>
  {preview&&<div className="ops-review"><h3>确认本次名单</h3><p>核对 {preview.scanned} 位 · 可发送 {count} 位 · 已联系／已处理记录 {preview.excluded} 位 · 待核对历史 {preview.unknown} 位。</p>
   <p>发送账号：{accounts.find(a=>a.id===preview.accountId)?.name}；每批 {preview.batchSize} 人，逐条至少 {preview.intervalSeconds} 秒，批间至少 {Math.max(preview.batchGapSeconds,preview.intervalSeconds)} 秒。下一批自动继续，无须逐批点击。</p><p>{preview.text}</p>
   <p>{preview.followOnFailure?'已允许：明确未发送后尝试一次普通关注，再核对并补发一次；需申请好友则永久排除，不提交申请。':'发送失败后暂停，不自动关注或补发。'}</p>
   <div className="ops-message-list">{pageRows.map(f=><article className="ops-message" key={f.id}><strong>{f.name||'昵称未提供'}</strong><small>UID：{f.uid}</small></article>)}</div>
   <div className="ops-row"><Button variant="outline" disabled={page===0||busy} onClick={()=>readPage(page-1)}>上一页名单</Button><span>第 {page+1}/{Math.max(1,Math.ceil(count/50))} 页</span><Button variant="outline" disabled={busy||(page+1)*50>=count} onClick={()=>readPage(page+1)}>下一页名单</Button></div>
   <Button disabled={busy||!count} onClick={()=>{if(!window.confirm(`确认由本人账号给本次固定名单 ${count} 位粉丝发送所示欢迎语？\n${preview.followOnFailure?'明确失败后最多尝试一次普通关注和一次补发；需要好友申请则不发送申请并永久排除。':''}\n将按所设间隔执行，请仅向允许联系的粉丝发送。`))return;const generation=current.current;void run('own-fan-start',{token:preview.token,acknowledge:true}).then(()=>{if(current.current===generation){current.current++;setPreview(undefined);setPageRows([]);}}).catch(()=>{});}}>开始分批发送</Button>
   {preview.nextOffset<preview.sourceTotal&&<p className="ops-muted">本轮之后尚有缓存粉丝未核对；本轮结束后可从位置 {preview.nextOffset} 创建下一轮。</p>}
  </div>}
  {plan&&<div className="ops-review" aria-live="polite">
   <h3>当前计划 · {labels[plan.status]||plan.status}</h3>
   <p>{data?.accounts.find(a=>a.id===plan.accountId)?.name||'原账号不可用'} · 已处理 {plan.cursor}/{plan.total} · 平台确认发送 {plan.sent} · 已联系等跳过 {plan.skipped} · 需申请好友排除 {plan.friendRequired||0} · 普通关注确认 {plan.followed||0} · 剩余 {plan.remaining}</p><p>{plan.detail}</p>
   {plan.nextAt&&<p>最早继续时间：{new Date(plan.nextAt).toLocaleString('zh-CN',{hour12:false})}</p>}
   <div className="ops-row">
    <Button variant="outline" disabled={busy||!active} onClick={()=>act('own-fan-pause')}>暂停并保留进度</Button>
    <Button disabled={busy||plan.working||plan.status!=='paused'} onClick={()=>act('own-fan-resume')}>继续未处理的粉丝</Button>
    <Button variant="outline" disabled={busy||plan.working||['completed','cancelled'].includes(plan.status)} onClick={()=>{if(window.confirm('结束当前计划？已处理粉丝的排除记录保留，未处理对象不再发送。'))act('own-fan-cancel');}}>结束计划</Button>
    {['completed','cancelled'].includes(plan.status)&&!scanAll&&<Button variant="outline" disabled={busy} onClick={()=>edit(()=>setOffset(plan.nextOffset))}>从下段缓存开始核对</Button>}
   </div>
   <p className="ops-muted">暂停和重启保留队列与处理记录，重启后需点击继续。成功与需申请好友的对象从待发送队列移除；结果不明的消息不会自动重发。成功数只按平台回执累计。</p>
  </div>}
 </section>;
}

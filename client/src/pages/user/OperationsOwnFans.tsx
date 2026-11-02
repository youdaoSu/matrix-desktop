import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OperationsCommand, OperationsSnapshot, OperationsFan } from '@shared/account-operations';

type Preview={token:string;accountId:string;text:string;recipients:OperationsFan[];scanned:number;excluded:number;unknown:number;nextOffset:number;sourceTotal:number;batchSize:number;intervalSeconds:number;batchGapSeconds:number};
type Props={data?:OperationsSnapshot;busy:boolean;run(command:OperationsCommand,args?:unknown):Promise<unknown>};
const labels:Record<string,string>={running:'执行中',waiting:'等待间隔',paused:'已暂停',completed:'已完成',cancelled:'已结束'};
export function OperationsOwnFans({data,busy,run}:Props){
 const [accountId,setAccount]=useState(''),[text,setText]=useState(''),[batchSize,setSize]=useState(10),[intervalSeconds,setInterval]=useState(30),[batchGapSeconds,setGap]=useState(300),[offset,setOffset]=useState(0),[scanLimit,setLimit]=useState(100),[preview,setPreview]=useState<Preview>(),[page,setPage]=useState(0);
 const plan=data?.ownFanPlan,active=plan&&['running','waiting'].includes(plan.status),locked=busy||!!active,accounts=data?.accounts.filter(a=>a.platform==='douyin'&&a.role==='primary')||[];
 const edit=(change:()=>void)=>{change();setPreview(undefined);setPage(0);};
 const act=(command:OperationsCommand)=>void run(command,{}).catch(()=>{});
 return <section className="ops-card" aria-label="本人粉丝分批私信">
  <h2>本人粉丝分批私信</h2>
  <p className="ops-muted">使用粉丝所关注的本人账号发送，每位一条。目前接入抖音：核对当前可读取的完整私信历史，已联系、已有任务和历史不完整的对象均不入选。平台已删除或不提供的历史无法据此证明“从未联系”。</p>
  <p className="ops-muted">名单来自已有粉丝缓存，不会边发送边扩大本次名单。每轮最多核对500位；发送时间同时受原有全局额度和平台限制约束。</p>
  <div className="ops-grid">
   <label className="ops-field">发送账号<select aria-label="粉丝批次发送账号" value={accountId} disabled={locked} onChange={e=>edit(()=>setAccount(e.target.value))}><option value="">选择本人抖音主账号</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label className="ops-field">每批人数<input aria-label="每批粉丝人数" type="number" min={1} max={50} value={batchSize} disabled={locked} onChange={e=>edit(()=>setSize(Number(e.target.value)))}/></label>
   <label className="ops-field">逐条间隔（秒，至少5秒）<input aria-label="粉丝逐条间隔" type="number" min={5} max={3600} value={intervalSeconds} disabled={locked} onChange={e=>edit(()=>setInterval(Number(e.target.value)))}/></label>
   <label className="ops-field">批次间等待（秒）<input aria-label="粉丝批次间隔" type="number" min={5} max={86400} value={batchGapSeconds} disabled={locked} onChange={e=>edit(()=>setGap(Number(e.target.value)))}/></label>
   <label className="ops-field">从缓存第几位开始（0为首位）<input aria-label="粉丝扫描起点" type="number" min={0} max={50000} value={offset} disabled={locked} onChange={e=>edit(()=>setOffset(Number(e.target.value)))}/></label>
   <label className="ops-field">本轮核对人数<input aria-label="本轮粉丝核对人数" type="number" min={1} max={500} value={scanLimit} disabled={locked} onChange={e=>edit(()=>setLimit(Number(e.target.value)))}/></label>
  </div>
  {!accounts.length&&<p>请先在连接设置中，将已绑定的抖音账号设置为主账号；发送账号不会替换为其他小号。</p>}
  <label className="ops-field">发送内容<textarea aria-label="粉丝批次文案" maxLength={2000} value={text} disabled={locked} onChange={e=>edit(()=>setText(e.target.value))}/></label>
  <Button variant="outline" disabled={locked||!accountId||!text.trim()} onClick={()=>{setPreview(undefined);void run('own-fan-preview',{accountId,text,batchSize,intervalSeconds,batchGapSeconds,offset,scanLimit}).then(value=>{setPreview(value as Preview);setPage(0);}).catch(()=>{});}}>核对未联系粉丝，不发送</Button>
  {preview&&<div className="ops-review"><h3>确认本次名单</h3><p>核对 {preview.scanned} 位 · 可发送 {preview.recipients.length} 位 · 已联系／已有记录 {preview.excluded} 位 · 待核对历史 {preview.unknown} 位。</p>
   <p>发送账号：{accounts.find(a=>a.id===preview.accountId)?.name}；每批 {preview.batchSize} 人，逐条至少 {preview.intervalSeconds} 秒，批间至少 {Math.max(preview.batchGapSeconds,preview.intervalSeconds)} 秒。下一批自动继续，无须逐批点击。</p><p>{preview.text}</p>
   <div className="ops-message-list">{preview.recipients.slice(page*50,(page+1)*50).map(f=><article className="ops-message" key={f.id}><strong>{f.name||'昵称未提供'}</strong><small>UID：{f.uid}</small></article>)}</div>
   <div className="ops-row"><Button variant="outline" disabled={page===0||busy} onClick={()=>setPage(page-1)}>上一页名单</Button><span>第 {page+1}/{Math.max(1,Math.ceil(preview.recipients.length/50))} 页</span><Button variant="outline" disabled={busy||(page+1)*50>=preview.recipients.length} onClick={()=>setPage(page+1)}>下一页名单</Button></div>
   <Button disabled={busy||!preview.recipients.length} onClick={()=>{if(!window.confirm(`确认由本人账号给上方 ${preview.recipients.length} 位粉丝发送所示内容？将按所设间隔自动执行，请仅向允许联系的粉丝发送。`))return;void run('own-fan-start',{token:preview.token,acknowledge:true}).then(()=>setPreview(undefined)).catch(()=>{});}}>开始分批发送</Button>
   {preview.nextOffset<preview.sourceTotal&&<p className="ops-muted">本轮之后尚有缓存粉丝未核对；本轮结束后可从位置 {preview.nextOffset} 创建下一轮。</p>}
  </div>}
  {plan&&<div className="ops-review" aria-live="polite">
   <h3>当前计划 · {labels[plan.status]||plan.status}</h3>
   <p>{data?.accounts.find(a=>a.id===plan.accountId)?.name||'原账号不可用'} · 已处理 {plan.cursor}/{plan.total} · 平台确认发送 {plan.sent} · 已联系等跳过 {plan.skipped} · 剩余 {plan.remaining}</p><p>{plan.detail}</p>
   {plan.nextAt&&<p>最早继续时间：{new Date(plan.nextAt).toLocaleString('zh-CN',{hour12:false})}</p>}
   <div className="ops-row">
    <Button variant="outline" disabled={busy||!active} onClick={()=>act('own-fan-pause')}>暂停并保留进度</Button>
    <Button disabled={busy||plan.working||plan.status!=='paused'} onClick={()=>act('own-fan-resume')}>继续未处理的粉丝</Button>
    <Button variant="outline" disabled={busy||plan.working||['completed','cancelled'].includes(plan.status)} onClick={()=>{if(window.confirm('结束当前计划？已发送记录保留，未处理对象不再发送。'))act('own-fan-cancel');}}>结束计划</Button>
    {['completed','cancelled'].includes(plan.status)&&<Button variant="outline" disabled={busy} onClick={()=>edit(()=>setOffset(plan.nextOffset))}>从下段缓存开始核对</Button>}
   </div>
   <p className="ops-muted">暂停、重启和切换页面都保留位置。重启后需要点击继续；失败或结果不明的消息不会自动重发。成功次数只按平台回执累计。</p>
  </div>}
 </section>;
}

import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { OperationsSnapshot, OperationsReplyQuery, OperationsCommand } from '@shared/account-operations';
const channels={dm:'私信',comment:'评论',follow:'新增关注'};
const statuses={pending:'待核对',queued:'已排队',sending:'发送中',sent:'已确认发送',failed:'未发送 / 失败',unknown:'结果待核对',cancelled:'已取消',skipped:'已跳过'};
const time=(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false});
export function OperationsReplies({data,busy,act,onPage}:{data?:OperationsSnapshot;busy:boolean;act(command:OperationsCommand,args?:unknown):void;onPage(query:OperationsReplyQuery):Promise<void>}){
 const {offset=0,limit=300,status='all',accountId='',matchingReplies=data?.totalReplies??0}=data?.replyPage||{},matching=matchingReplies;
 const list=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(list.current)list.current.scrollTop=0;},[offset,limit,status,accountId]);
 const sources=useMemo(()=>{const map=new Map<string,NonNullable<OperationsSnapshot['messages']>[number]>();for(const m of data?.replySources??data?.messages??[])if(!map.has(m.id))map.set(m.id,m);return map;},[data?.messages,data?.replySources]);
 const accountName=(id:string)=>data?.accounts.find(a=>a.id===id)?.name||'原绑定已不可用';
 const go=(next:OperationsReplyQuery)=>void onPage({offset,limit,status,accountId,...next});
 return (<section className="ops-card"><h2>回复与真实结果</h2><p className="ops-muted">共 {data?.totalReplies??'—'} 条，当前筛选 {data?matching:'—'} 条，每页最多 {limit} 条。发送结果以回执为准；未知结果先核对。</p>
      <div className="ops-row"><select aria-label="回复历史状态" value={status} disabled={busy||!data} onChange={e=>go({offset:0,status:e.target.value as OperationsReplyQuery['status']})}><option value="all">全部状态</option>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label="回复历史账号" value={accountId} disabled={busy||!data} onChange={e=>go({offset:0,accountId:e.target.value})}><option value="">全部回复账号</option>{data?.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      <div ref={list} className="ops-task-history" role="region" aria-label="回复历史列表" tabIndex={0}>
        {data?.replies.map(r=>{const found=sources.get(r.messageId),source=found?.accountId===r.accountId?found:undefined;return <article className="ops-reply" key={r.id}>
          <div className="ops-row"><strong>{accountName(r.accountId)} · {channels[r.channel]}{r.deliveryChannel?' → 私信':''}</strong><span className={'ops-status is-'+r.status}>{statuses[r.status]}</span></div>
          {source?<div className="ops-code"><strong>回复对象：{source.senderName||'昵称未提供'} · {source.senderId}</strong><p>原{source.channel==='comment'?'作品':'会话'}编号：{source.threadId}</p><p>原文：{source.text}</p></div>:<p className="ops-muted">来源详情尚未读取，不能直接批准发送。</p>}
          <p>回复：{r.replyText}</p><small>{time(r.createdAt)} · {r.reason}{r.error?' · '+r.error:''}</small>
          <div className="ops-row">{r.status==='pending'&&<Button size="sm" disabled={busy||!source} onClick={()=>{if(source&&window.confirm(`发送账号：${accountName(r.accountId)}\n接收人：${source.senderName||'昵称未提供'}（${source.senderId}）\n原文：${source.text}\n回复：${r.replyText}\n确认只提交这一次回复？`))act('send',{id:r.id});}}>核对后单条发送</Button>}
            {['pending','queued'].includes(r.status)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>act('cancel',{id:r.id})}>取消</Button>}
            {['failed','skipped','unknown','cancelled','sent'].includes(r.status)&&(r.channel==='follow'||r.deliveryChannel==='dm')&&<><Button size="sm" variant="outline" disabled={busy} onClick={()=>act('reply-open-chat',{id:r.id})}>检查原单聊，不重发</Button>{data.accounts.find(a=>a.id===r.accountId)?.platform==='douyin'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>act('reply-open-profile',{id:r.id})}>用原账号查看来源主页</Button>}</>}
            {r.channel==='dm'&&r.status==='unknown'&&data.accounts.find(a=>a.id===r.accountId)?.platform==='xiaohongshu'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>act('connection-open',{accountId:r.accountId,channel:'dm',background:false})}>打开原账号私信页核对，不重发</Button>}
            {r.status==='unknown'&&<><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(window.confirm('已在官方原会话核对为发送成功？这只修正记录，不会发送。'))act('resolve',{id:r.id,sent:true});}}>人工核对已发送</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(window.confirm('已在官方原会话核对为未发送？这只修正记录，不会重发。'))act('resolve',{id:r.id,sent:false});}}>人工核对未发送</Button></>}
          </div></article>;})}
        {data&&!data.replies.length&&<p className="ops-empty">{data.totalReplies?'当前条件下没有回复记录。':'暂无回复任务，保存规则不会补发历史消息。'}</p>}
      </div><div className="ops-row"><Button variant="outline" disabled={busy||!data||offset===0} onClick={()=>go({offset:Math.max(0,offset-limit)})}>上一页回复记录</Button><span>回复第 {data?(matching?Math.floor(offset/limit)+1:0):'—'}/{data?Math.ceil(matching/limit):'—'} 页</span><Button variant="outline" disabled={busy||!data||offset+limit>=matching} onClick={()=>go({offset:offset+limit})}>下一页回复记录</Button></div>
      </section>);
}

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, CheckCheck, MessageCircle, PauseCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { useWorkspaceIdentity } from '@/components/workspace/WorkspaceUiState';
import { useDouyinInteractionCache } from '@/components/workspace/DouyinInteractionData';
import { useDouyinInboxCache } from '@/components/workspace/DouyinInbox';
import { operationsCall } from '@/components/workspace/account-operations-client';
import { AccountAvatar } from '@/components/workspace/AccountAvatar';
import type { OperationsAccount, OperationsBatchTask, OperationsChannel, OperationsCommand, OperationsMode, OperationsOutreachQuery, OperationsInboxQuery, OperationsReplyQuery, OperationsPolicy, OperationsRule, OperationsSnapshot } from '@shared/account-operations';
import './account-operations.css';
import { OneClickComments } from '@/components/workspace/OneClickComments';
import { OperationsConnections } from './OperationsConnections';
import { OperationsOwnFans } from './OperationsOwnFans';
import { OperationsContacts } from './OperationsContacts';
import { OperationsReplies } from './OperationsReplies';
import { OperationsArchives } from './OperationsArchives';
import { OperationsCoverage } from './OperationsCoverage';
import { OperationsKeywordRoutes } from './OperationsKeywordRoutes';
import { OperationsMonitoring } from './OperationsMonitoring';
import { InteractionAutomationTable } from './InteractionAutomationTable';

const channels:Record<OperationsChannel,string>={dm:'私信',comment:'评论',follow:'新增关注'};
const statuses:Record<string,string>={pending:'待核对',queued:'已排队',sending:'发送中',sent:'已确认发送',failed:'未发送 / 失败',unknown:'结果待核对',cancelled:'已取消',skipped:'已跳过'};
const errorText=(error:unknown)=>error instanceof Error?error.message:'操作失败，原记录保留';
const time=(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false});
type Section='all'|'comment'|'dm'|'batch';
export default function AccountOperationsPage({section='all'}:{section?:Section}){const lease=useWorkspaceIdentity();return <OperationsPanel key={lease+':'+section} section={section}/>;}
function OperationsPanel({section}:{section:Section}){
  const workspace=useOfficialWorkspace(),cache=useDouyinInteractionCache(),inbox=useDouyinInboxCache();
  const [commentHistory,setCommentHistory]=useState(false);
  const location=useLocation(),requestedPanel=new URLSearchParams(location.search).get('panel')||'';
  const linkedPanel=['monitor','connections','history','keyword-routes'].includes(requestedPanel)?requestedPanel:'';
  const [tab,setTab]=useState(linkedPanel||(section==='comment'||section==='dm'?'rules':'reply')),[data,setData]=useState<OperationsSnapshot>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const mounted=useRef(true),locked=useRef(false);
  const inboxView=useRef<OperationsInboxQuery>({offset:0,limit:100,accountId:''});
  const replyView=useRef<OperationsReplyQuery>({offset:0,limit:100,status:'all',accountId:''});
  const outreachView=useRef<OperationsOutreachQuery>({offset:0,limit:100,status:'all',accountId:''});
  const loader=useRef<{read():Promise<void>;invalidate():void;fresh():Promise<void>}|undefined>(undefined);
  useEffect(()=>{
    mounted.current=true;
    let live=true,revision=0,inFlight:Promise<void>|undefined;
    const read=()=>{
      if(!live)return Promise.resolve();
      if(inFlight)return inFlight;
      const started=revision,query={...outreachView.current},replyQuery={...replyView.current},inboxQuery={...inboxView.current};
      const request=Promise.resolve().then(()=>operationsCall('snapshot',{outreach:query,replies:replyQuery,inbox:inboxQuery})).then(value=>{
        if(live&&started===revision){const next=value as OperationsSnapshot;if(next.outreach)outreachView.current={offset:next.outreach.offset??query.offset,limit:next.outreach.limit??query.limit,status:next.outreach.status??query.status,accountId:next.outreach.accountId??query.accountId};if(next.replyPage)replyView.current={offset:next.replyPage.offset,limit:next.replyPage.limit,status:next.replyPage.status,accountId:next.replyPage.accountId};if(next.inboxPage)inboxView.current={offset:next.inboxPage.offset,limit:next.inboxPage.limit,accountId:next.inboxPage.accountId};setData(next);setError('');}
      },e=>{if(live&&started===revision)setError(errorText(e));}).finally(()=>{if(inFlight===request)inFlight=undefined;});
      inFlight=request;return request;
    };
    const controller={read,invalidate:()=>{revision++;},fresh:async()=>{revision++;if(inFlight)await inFlight;if(live)await read();}};
    loader.current=controller;void read();
    const timer=setInterval(()=>{if(!document.hidden&&!locked.current)void read();},5000);
    return()=>{live=false;mounted.current=false;if(loader.current===controller)loader.current=undefined;clearInterval(timer);};
  },[]);
  const load=()=>loader.current?.read()||Promise.resolve();
  const run=async(command:OperationsCommand,args?:unknown)=>{if(locked.current)throw Error('上一步尚未完成，请稍后');locked.current=true;setBusy(true);setError('');const controller=loader.current;controller?.invalidate();try{const result=await operationsCall(command,args);await controller?.fresh();return result;}catch(e){if(mounted.current)setError(errorText(e));throw e;}finally{locked.current=false;if(mounted.current)setBusy(false);}};
  const act=(command:OperationsCommand,args?:unknown)=>void run(command,args).catch(()=>{});
  const pageOutreach=async(query:OperationsOutreachQuery)=>{if(locked.current)return;locked.current=true;setBusy(true);outreachView.current={...query};try{await loader.current?.fresh();}finally{locked.current=false;if(mounted.current)setBusy(false);}};
  const pageReplies=async(query:OperationsReplyQuery)=>{if(locked.current)return;locked.current=true;setBusy(true);replyView.current={...query};try{await loader.current?.fresh();}finally{locked.current=false;if(mounted.current)setBusy(false);}};
  const [primary,setPrimary]=useState(''),[sender,setSender]=useState(''),[workUrl,setWorkUrl]=useState(''),[publicText,setPublicText]=useState('');
  const primaryAccount=workspace.accounts.find(a=>a.id===primary),works=primaryAccount?cache.entry(primaryAccount,'comments')?.works||[]:[];
  const [replyText,setReplyText]=useState(''),[selected,setSelected]=useState<string[]>([]),[preview,setPreview]=useState<{token:string;expiresAt:string;tasks:OperationsBatchTask[];context:string}>(),[thread,setThread]=useState('');
  const incomingMessages=(data?.inboxMessages??data?.messages??[]).filter(m=>m.channel==='dm'&&!m.isOwn&&!m.isGroup);
  const incomingById=new Map(incomingMessages.map(m=>[m.id,m])),bindingsById=new Map(data?.accounts.map(a=>[a.id,a])||[]);
  // Bind even a late preview to the exact form and source that requested it.
  // This also hides it during the render before stale-selection effects run.
  const previewContext=JSON.stringify([replyText,selected.map(id=>{const message=incomingById.get(id);return[id,message||null,message?bindingsById.get(message.accountId)||null:null];})]);
  useEffect(()=>{if(preview&&preview.context!==previewContext)setPreview(undefined);},[preview,previewContext]);
  const {offset:inboxOffset=0,limit:inboxLimit=100,accountId:inboxAccount='',matchingConversations:inboxTotal=incomingMessages.length}=data?.inboxPage||{};
  const inboxList=useRef<HTMLDivElement>(null);
  useEffect(()=>{setSelected([]);setPreview(undefined);if(inboxList.current)inboxList.current.scrollTop=0;},[inboxOffset,inboxLimit,inboxAccount]);
  useEffect(()=>{const ids=new Set(incomingMessages.map(m=>m.id));if(selected.some(id=>!ids.has(id))){setSelected(s=>s.filter(id=>ids.has(id)));setPreview(undefined);}},[data?.inboxMessages,data?.messages,selected]);
  const pageInbox=async(query:OperationsInboxQuery)=>{if(locked.current)return;locked.current=true;setBusy(true);setSelected([]);setPreview(undefined);inboxView.current={...query};try{await loader.current?.fresh();}finally{locked.current=false;if(mounted.current)setBusy(false);}};
  const inboxPage=(next:OperationsInboxQuery)=>void pageInbox({offset:inboxOffset,limit:inboxLimit,accountId:inboxAccount,...next});
  const [ruleChannel,setRuleChannel]=useState<OperationsChannel|'all'>(section==='comment'?'comment':section==='dm'?'dm':'all');
  const title=section==='comment'?'自动评论':section==='dm'?'自动私信':section==='batch'?'批量任务':'账号运营';
  const legacy=section==='comment'?'manual-comment':section==='dm'?'manual-message':'manual-tasks';
  const [dialogOpen,setDialogOpen]=useState(Boolean(linkedPanel)&&section!=='all');
  useEffect(()=>{if(linkedPanel){setTab(linkedPanel);if(section!=='all')setDialogOpen(true);}},[linkedPanel,section]);
  const [rule,setRule]=useState<OperationsRule>(),[testText,setTestText]=useState(''),[testResult,setTestResult]=useState('');
  const accountName=(id:string)=>data?.accounts.find(a=>a.id===id)?.name||'原绑定已不可用';
  const canAuto=(account:OperationsAccount,channel:OperationsChannel)=>{
    if(account.platform==='douyin'&&channel!=='follow')return true;
    const connection=data?.connections?.connections.find(c=>c.accountId===account.id&&c.channel===channel);
    return connection?.status==='ready'&&(channel!=='follow'||connection.eventValidated&&data?.connections?.connections.some(c=>c.accountId===account.id&&c.channel==='dm'&&c.status==='ready'));
  };
  const changeMode=(account:OperationsAccount,channel:OperationsChannel,mode:OperationsMode)=>{
    if(mode==='auto'&&!window.confirm(`启用「${account.name}」的${channels[channel]}自动回复？\n仅处理本次启用后的新记录，按已启用规则发送；历史来信不补发，未知结果不重试。请先保存规则并预演。`))return;
    act('mode',{accountId:account.id,channel,mode});
  };
  const modesPanel=<section className="ops-card"><h2><Bot size={17}/>按账号启用</h2><p className="ops-muted">先保存规则。抖音评论在明确选择模式后自动监控，私信使用已有实时通道；小红书需在“官网连接与分工”检查并开启监听。自动模式只处理启用后10分钟内的新事件。</p><label className="ops-field">规则渠道<select aria-label="规则渠道" value={ruleChannel} onChange={e=>{setRule(undefined);setTestResult('');setRuleChannel(e.target.value as typeof ruleChannel);}}><option value="all">全部渠道</option><option value="comment">评论</option><option value="dm">私信</option><option value="follow">新增关注</option></select></label>{data?.accounts.map(a=><div key={a.id} className="ops-mode"><strong>{a.name} <small>{a.platform==='douyin'?'抖音':'小红书'}</small></strong>{(['dm','comment','follow'] as OperationsChannel[]).filter(c=>ruleChannel==='all'||c===ruleChannel).map(channel=><label key={channel}>{channels[channel]}<select aria-label={a.name+channels[channel]+'模式'} value={data.settings.modes.find(m=>m.accountId===a.id&&m.channel===channel)?.mode||'review'} disabled={busy} onChange={e=>changeMode(a,channel,e.target.value as OperationsMode)}><option value="off">关闭</option><option value="review">逐条核对</option><option value="auto" disabled={!canAuto(a,channel)}>自动</option></select></label>)}</div>)}</section>;
  const editorPanel=<RuleEditor key={(rule?.id||'new')+':'+ruleChannel} defaultChannel={ruleChannel==='all'?'dm':ruleChannel} accounts={data?.accounts||[]} initial={rule} busy={busy} save={value=>void run('save-rule',value).then(()=>{setRule(undefined);if(section!=='all')setDialogOpen(false);toast.success('规则已保存；发送模式保持不变');}).catch(()=>{})}/>;
  const content=<>
    {commentHistory&&<OneClickComments close={()=>setCommentHistory(false)}/>}
    {tab==='monitor'&&<OperationsMonitoring data={data} busy={busy} onConnections={()=>setTab('connections')} onRules={()=>setTab(section==='all'?'rules':'modes')}/>}
    {tab==='connections'&&<OperationsConnections data={data} busy={busy} run={run}/>}
    {tab==='own-fans'&&<OperationsOwnFans data={data} busy={busy} run={run}/>}
    {tab==='contacts'&&<OperationsContacts data={data} busy={busy} run={run} onOutreachPage={pageOutreach}/>}
    {tab==='keyword-routes'&&<OperationsKeywordRoutes data={data} busy={busy} run={run}/>}
    {tab==='archives'&&<OperationsArchives data={data} busy={busy} run={run}/>}
    {tab==='reply'&&<>
      <section className="ops-card"><h2><MessageCircle size={17}/>已有会话回复</h2><p className="ops-muted">只从已绑定账号的既有单聊取最新文本；不创建陌生人名单。导入仅保存历史，不会触发自动欢迎。</p>
        <div className="ops-row"><select aria-label="已有会话" value={thread} onChange={e=>setThread(e.target.value)}><option value="">选择要核对的会话</option>{data?.accounts.filter(a=>a.platform==='douyin').flatMap(a=>(inbox.rows[a.accountId]?.threads||[]).filter(t=>t.type===1).map(t=><option key={a.id+'/'+t.id} value={JSON.stringify([a.id,t.id])}>{a.name} · {t.name}</option>))}</select><Button disabled={busy||!thread} variant="outline" onClick={()=>{try{const [accountId,threadId]=JSON.parse(thread);act('import-thread',{accountId,threadId});}catch{}}}>读取该会话最近文本</Button></div>
        <div className="ops-row"><select aria-label="私信会话账号" value={inboxAccount} disabled={busy||!data} onChange={e=>inboxPage({offset:0,accountId:e.target.value})}><option value="">全部私信账号</option>{data?.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><span>当前筛选 {data?inboxTotal:'—'} 个来信会话；每个会话显示最新一条来信。</span></div>
        <div ref={inboxList} className="ops-message-list" role="region" aria-label="私信会话列表">{incomingMessages.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).map(m=><label className="ops-message" key={m.id}><input type="checkbox" checked={selected.includes(m.id)} disabled={busy} onChange={e=>{setPreview(undefined);setSelected(v=>e.target.checked?[...v,m.id]:v.filter(id=>id!==m.id));}}/><div><strong>{m.senderName||'昵称未提供'}</strong><small>{accountName(m.accountId)} · {time(m.receivedAt)}{m.historical?' · 历史记录':''}</small><p>{m.text}</p></div></label>)}{data&&!incomingMessages.length&&<p className="ops-empty">当前条件下暂无已保存的单聊来信。可选择上方已有会话读取，或等待新的文本私信。</p>}</div>
        <div className="ops-row"><Button variant="outline" disabled={busy||!data||inboxOffset===0} onClick={()=>inboxPage({offset:Math.max(0,inboxOffset-inboxLimit)})}>上一页私信会话</Button><span>会话第 {data?(inboxTotal?Math.floor(inboxOffset/inboxLimit)+1:0):'—'}/{data?Math.ceil(inboxTotal/inboxLimit):'—'} 页</span><Button variant="outline" disabled={busy||!data||inboxOffset+inboxLimit>=inboxTotal} onClick={()=>inboxPage({offset:inboxOffset+inboxLimit})}>下一页私信会话</Button></div>
        <label className="ops-field">本次回复文案<textarea maxLength={2000} value={replyText} onChange={e=>{setReplyText(e.target.value);setPreview(undefined);}} placeholder="填写本次完整回复；每个会话只选一条，最多50个。"/></label>
        <Button disabled={busy||!selected.length||selected.length>50||!replyText.trim()} onClick={()=>void run('batch-preview',{messageIds:selected,replyText}).then(v=>{if(mounted.current)setPreview({...v as NonNullable<typeof preview>,context:previewContext});}).catch(()=>{})}>核对 {selected.length} 条回复，不发送</Button>
        {preview&&preview.context===previewContext&&<div className="ops-review"><h3>本次完整发送核对</h3><p>确认有效期至 {time(preview.expiresAt)}；按下方账号逐条发送，遇到失败或不明立即暂停。</p>{preview.tasks.map(t=><article key={t.id}><strong>{t.accountName} → {t.recipientName||'当前会话用户'}</strong><p>平台用户编号：{t.recipientId} · 原会话：{t.threadId}</p><p>来信：{t.incomingText}</p><p>回复：{t.replyText}</p></article>)}<Button disabled={busy} onClick={()=>{if(window.confirm('已逐条核对发送账号、接收人和完整文案，确认发送本批回复？'))void run('batch-start',{token:preview.token}).then(()=>{setPreview(undefined);setSelected([]);}).catch(()=>{});}}><CheckCheck size={15}/>确认本批发送</Button></div>}
      </section>
      {data?.batch.id&&<section className="ops-card"><h2>本批进度：{data.batch.sent}/{data.batch.total}</h2><p>{data.batch.detail}</p><Button variant="outline" disabled={!['running','stopping'].includes(data.batch.status)} onClick={()=>act('batch-stop')}>停止未开始的回复</Button></section>}
      <OperationsReplies data={data} busy={busy} act={act} onPage={pageReplies}/>
    </>}
    {tab==='rules'&&<>
      {modesPanel}
      {editorPanel}
      <section className="ops-card"><h2>已保存规则</h2>{data?.rules.filter(r=>ruleChannel==='all'||r.channel==='all'||r.channel===ruleChannel).map(r=><article className="ops-reply" key={r.id}><strong>{r.name} · {r.enabled?'启用':'停用'} · 优先级 {r.priority}</strong><p>{r.replyText}</p><small>{r.trigger==='first-message'?'首次观察到的私信':r.trigger==='follow'?'新增关注':r.channel==='comment'?'新评论':'新消息'}{r.deliveryChannel?' → 同账号私信':''} · {r.match} · {r.keywords.join('、')||'任意文本'}</small><div className="ops-row"><Button size="sm" variant="outline" onClick={()=>setRule(r)}>编辑</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>act('save-rule',{...r,enabled:!r.enabled})}>{r.enabled?'停用':'启用'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(window.confirm('删除规则并撤销尚未发送的旧任务？历史记录仍保留。'))act('delete-rule',{id:r.id});}}>删除</Button></div></article>)}<label className="ops-field">本地预演来信<input value={testText} onChange={e=>setTestText(e.target.value)} placeholder="不会向平台发送"/></label><div className="ops-row">{data?.accounts.map(a=><Button key={a.id} size="sm" variant="outline" disabled={busy||!testText} onClick={()=>void run('preview-rule',{accountId:a.id,channel:ruleChannel==='all'?'dm':ruleChannel,senderId:'local-preview',senderName:'预演用户',text:testText}).then(v=>setTestResult(JSON.stringify(v,null,2))).catch(()=>{})}>{a.name} {channels[ruleChannel==='all'?'dm':ruleChannel]}预演</Button>)}</div>{testResult&&<pre className="ops-code">{testResult}</pre>}</section>
    </>}
    {tab==='rules'&&<OperationsReplies data={data} busy={busy} act={act} onPage={pageReplies}/>}
    {tab==='public'&&<section className="ops-card"><h2>选择账号评论作品</h2><div className="ops-row"><Button variant="outline" onClick={()=>setCommentHistory(true)}>一键评论 · 评论集与记录</Button><Link to="/publish/tasks">选择已发布作品进行一键评论</Link></div><p className="ops-muted">单次打开作品，使用选定账号的独立登录页。不会自动轮换账号、批量刷评论或代替核对发送。</p><div className="ops-grid"><label className="ops-field">主号（作品来源）<select value={primary} onChange={e=>{setPrimary(e.target.value);setWorkUrl('');}}><option value="">选择已绑定主号</option>{workspace.accounts.filter(a=>a.platform==='douyin').map(a=><option key={a.id} value={a.id}>{a.nickname}</option>)}</select></label><label className="ops-field">发送账号<select value={sender} onChange={e=>setSender(e.target.value)}><option value="">选择已绑定发送账号</option>{workspace.accounts.filter(a=>a.platform==='douyin'&&a.id!==primary&&a.nativeAccountKey!==primaryAccount?.nativeAccountKey).map(a=><option key={a.id} value={a.id}>{a.nickname}</option>)}</select></label></div>{works.length>0&&<label className="ops-field">主号已缓存作品<select value={workUrl} onChange={e=>setWorkUrl(e.target.value)}><option value="">选择作品或粘贴完整官网链接</option>{works.map(w=><option key={w.platformId} value={'https://www.douyin.com/video/'+w.platformId}>{w.title||w.platformId}</option>)}</select></label>}<label className="ops-field">作品官网完整链接<input value={workUrl} onChange={e=>setWorkUrl(e.target.value)} placeholder="https://www.douyin.com/video/作品编号"/></label><label className="ops-field">本次评论<textarea maxLength={500} value={publicText} onChange={e=>setPublicText(e.target.value)}/></label>{workspace.accounts.find(a=>a.id===sender)&&<div className="ops-row"><AccountAvatar account={workspace.accounts.find(a=>a.id===sender)!}/><span>以 {workspace.accounts.find(a=>a.id===sender)?.nickname} 打开，不改变主号或发布页面。</span></div>}<Button disabled={busy||workspace.jobsLocked||!sender||sender===primary||!publicText.trim()||!workUrl} onClick={()=>void workspace.openAccountWork(sender,workUrl.trim(),publicText)}>打开作品并准备文案，不发送</Button><p className="ops-muted">在右侧官方页面选定评论输入框，用“文案与提交”填入；检查完整表单后再单次提交。已有草稿不会覆盖。</p></section>}
    {tab==='safety'&&data&&<SafetyPanel policy={data.settings.policy} accounts={data.accounts} busy={busy} save={args=>act('policy',args)}/>}
    {tab==='coverage'&&<OperationsCoverage/>}
    {tab==='modes'&&modesPanel}
    {tab==='editor'&&editorPanel}
    {tab==='history'&&<OperationsReplies data={data} busy={busy} act={act} onPage={pageReplies}/>}
  </>;
  if(section!=='all')return <InteractionAutomationTable section={section} data={data} busy={busy} error={error} refresh={()=>void load()} open={value=>{setTab(value);setDialogOpen(true);}} edit={value=>{setRule(value);setTab('editor');setDialogOpen(true);}} toggle={value=>act('save-rule',{...value,enabled:!value.enabled})} remove={value=>{if(window.confirm('删除规则并撤销尚未发送的旧任务？历史记录仍保留。'))act('delete-rule',{id:value.id});}} stop={()=>act('batch-stop')} panel={dialogOpen?content:undefined} panelTitle={{editor:rule?'编辑计划':'新建计划',modes:'账号设置',monitor:'监控状态',history:'发送记录',connections:'连接设置',safety:'运行设置',reply:'新建批量回复任务','keyword-routes':'关键词分配','own-fans':'粉丝分批私信'}[tab]||title} onClose={()=>{setDialogOpen(false);setRule(undefined);setPreview(undefined);setSelected([]);}}/>;
  return <div className="ops-page matrix-interaction-tool-page matrix-tools-workbench">
    <header className="ops-header"><div><div className="ops-eyebrow"><ShieldCheck size={15}/>自有账号 · 原账号回复 · 本机加密</div><h1>{title}</h1><p>{section==='all'?'自动回复、会话回复与作品评论，在同一处核对账号和真实回执。':'已接入 Hengyuan 互动引擎。保存规则、检查监控，再按账号开启自动模式；切换页面后继续运行。'}</p></div><Button variant="outline" disabled={busy} onClick={()=>void load()}><RefreshCw size={14}/>刷新记录</Button></header>
    <div className="ops-metrics">{[['待核对',data?.counts.pending],['排队中',data?.counts.queued],['已确认发送',data?.counts.sent],['结果不明',data?.counts.unknown]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{value===undefined?'—':value}</strong><small>本机互动队列记录</small></div>)}</div>
    {error&&<div className="ops-alert" role="alert">{error}</div>}{data?.error&&<div className="ops-alert">自动队列提示：{data.error}</div>}{data?.halted&&<div className="ops-alert">后台已安全停止，未发送任务不会恢复。请检查登录或重新进入软件。</div>}
    <nav className="ops-tabs" aria-label="账号运营">{[['reply','会话回复'],['rules','自动回复规则'],['monitor','监控状态'],['keyword-routes','关键词分配'],['connections','官网连接与分工'],['contacts','联系人与主号接手'],['own-fans','粉丝分批私信'],['archives','业务迁移与归档'],['public','作品评论'],['safety','运行与安全'],['coverage','接入进度']].map(([id,label])=><button key={id} className={tab===id?'is-active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {content}
    <footer className="ops-footer"><ShieldCheck size={14}/>电脑休眠、退出、登录失效时不能保证接收；后台存活不代表消息已发送。<Link to="/accounts">管理已绑定账号</Link><Link to={'/engage/'+legacy}>查看原人工待办（不自动发送）</Link></footer>
  </div>;
}

function RuleEditor({accounts,initial,busy,save,defaultChannel='dm'}:{defaultChannel?:OperationsChannel;accounts:OperationsAccount[];initial?:OperationsRule;busy:boolean;save(value:unknown):void}){
  const [form,setForm]=useState({name:initial?.name||'',platform:initial?.platform||'douyin',accountIds:initial?.accountIds||[],channel:initial?.channel||defaultChannel,trigger:initial?.trigger||(defaultChannel==='follow'?'follow':'message'),deliveryChannel:initial?.deliveryChannel||'',match:initial?.match||'contains',keywords:initial?.keywords.join('\n')||'',replyText:initial?.replyText||'',replyVariants:initial?.replyVariants.join('\n---\n')||'',enabled:initial?.enabled??true,priority:initial?.priority||0,cooldownMinutes:initial?.cooldownMinutes??30,delaySeconds:initial?.delaySeconds||0});
  const set=(field:string,value:unknown)=>setForm(f=>({...f,[field]:value,...(field==='platform'?{accountIds:f.accountIds.filter(id=>accounts.some(a=>a.id===id&&a.platform===value)),deliveryChannel:value==='douyin'?f.deliveryChannel:''}:{})}));
  return <section className="ops-card"><h2>{initial?'编辑规则':'新增自动回复规则'}</h2><div className="ops-grid"><label className="ops-field">名称<input value={form.name} maxLength={100} onChange={e=>set('name',e.target.value)}/></label><label className="ops-field">平台<select value={form.platform} onChange={e=>set('platform',e.target.value)}><option value="douyin">抖音</option><option value="xiaohongshu">小红书</option></select></label><label className="ops-field">触发类型<select value={form.trigger+'|'+form.channel+'|'+form.deliveryChannel} onChange={e=>{const [trigger,channel,deliveryChannel]=e.target.value.split('|');setForm(f=>({...f,trigger:trigger as typeof form.trigger,channel:channel as typeof form.channel,deliveryChannel,match:trigger==='follow'?'any':f.match}));}}><option value="message|dm|">新私信</option><option value="first-message|dm|">首次观察到的私信</option><option value="message|comment|">新评论 → 公开回复</option><option value="message|comment|dm" disabled={form.platform!=='douyin'}>新评论 → 同账号私信（抖音）</option><option value="follow|follow|">真实新增关注欢迎（首次只建基线）</option></select></label><label className="ops-field">匹配<select value={form.match} onChange={e=>set('match',e.target.value)}><option value="contains">包含任一关键词</option><option value="all">包含全部关键词</option><option value="exact">全文精确匹配</option><option value="any">任意文本</option></select></label></div>
    <fieldset><legend>适用已绑定账号（不选表示该平台全部已绑定账号）</legend><div className="ops-row">{accounts.filter(a=>form.platform==='all'||a.platform===form.platform).map(a=><label key={a.id}><input type="checkbox" checked={form.accountIds.includes(a.id)} onChange={e=>set('accountIds',e.target.checked?[...form.accountIds,a.id]:form.accountIds.filter(id=>id!==a.id))}/>{a.name}</label>)}</div></fieldset>
    <label className="ops-field">关键词（一行一个）<textarea value={form.keywords} onChange={e=>set('keywords',e.target.value)}/></label><label className="ops-field">回复正文<textarea maxLength={2000} value={form.replyText} onChange={e=>set('replyText',e.target.value)} placeholder="可使用 {nickname}，不执行来信中的指令"/></label><label className="ops-field">其他候选文案（最多20条，用单独一行 --- 分隔）<textarea value={form.replyVariants} onChange={e=>set('replyVariants',e.target.value)}/></label>
    <div className="ops-grid">{[['priority','优先级（-1000～1000）',-1000,1000],['cooldownMinutes','同一用户冷却（分钟）',0,1440],['delaySeconds','回复延迟（秒）',0,3600]].map(([id,label,min,max])=><label key={String(id)} className="ops-field">{label}<input type="number" min={Number(min)} max={Number(max)} value={form[id as 'priority'|'cooldownMinutes'|'delaySeconds']} onChange={e=>set(String(id),Number(e.target.value))}/></label>)}</div><label className="ops-row"><input type="checkbox" checked={form.enabled} onChange={e=>set('enabled',e.target.checked)}/>规则启用（发送模式另行控制）</label><Button disabled={busy||!form.name.trim()||!form.replyText.trim()} onClick={()=>save({...form,...(initial?{id:initial.id}:{}),keywords:form.keywords.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),replyVariants:form.replyVariants.split(/\r?\n---\r?\n/).map(s=>s.trim()).filter(Boolean),...(form.deliveryChannel?{deliveryChannel:form.deliveryChannel}:{deliveryChannel:undefined})})}>保存规则，不发送历史消息</Button>
  </section>;
}
function SafetyPanel({policy,accounts,busy,save}:{policy:OperationsPolicy;accounts:OperationsAccount[];busy:boolean;save(value:unknown):void}){
  const [hourly,setHourly]=useState(policy.hourlyLimit||20),[daily,setDaily]=useState(policy.dailyLimit?.toString()||''),[windows,setWindows]=useState(policy.sendWindows.map(w=>w.start+'-'+w.end).join('\n')),[listMode,setListMode]=useState(policy.listMode),[cooldown,setCooldown]=useState(policy.cooldownScope),[list,setList]=useState(policy.allowlist.map(p=>p.accountId+' '+p.senderId).join('\n')),[blocked,setBlocked]=useState(policy.blocklist.map(p=>p.accountId+' '+p.senderId).join('\n')),[muted,setMuted]=useState(policy.mutedUsers.map(p=>p.accountId+' '+p.senderId).join('\n'));
  const parse=(value:string)=>value.split(/\r?\n/).filter(s=>s.trim()).map(s=>{const [accountId,senderId]=s.trim().split(/\s+/);return {accountId,senderId};});
  return <section className="ops-card"><h2><PauseCircle size={17}/>运行与安全</h2><p>额度是本机保护上限，不代表平台许可。所有已尝试的发送（包括失败和结果不明）占用额度。</p><Button variant={policy.paused?'default':'outline'} disabled={busy} onClick={()=>save({paused:!policy.paused})}>{policy.paused?'解除全局暂停（不恢复旧批次）':'立即暂停未开始的任务'}</Button><div className="ops-grid"><label className="ops-field">每账号每小时尝试上限<input type="number" min={1} max={1000} value={hourly} onChange={e=>setHourly(Number(e.target.value))}/></label><label className="ops-field">每账号每日上限（空为不另设）<input type="number" min={1} max={100000} value={daily} onChange={e=>setDaily(e.target.value)}/></label><label className="ops-field">冷却范围<select value={cooldown} onChange={e=>setCooldown(e.target.value as typeof cooldown)}><option value="account">跨渠道按账号与用户</option><option value="channel">同渠道</option></select></label></div><label className="ops-field">北京时间允许时段（一行一个 HH:mm-HH:mm，可跨午夜；空为全天）<textarea value={windows} onChange={e=>setWindows(e.target.value)} placeholder="09:00-21:00"/></label><label className="ops-field">允许名单模式<select value={listMode} onChange={e=>setListMode(e.target.value as typeof listMode)}><option value="off">不使用允许名单</option><option value="allowlist">仅允许名单中的用户</option></select></label><p className="ops-muted">名单格式：每行“账号绑定编号 空格 平台用户编号”；不是昵称。以下是当前账号绑定编号：</p><div className="ops-code">{accounts.map(a=><p key={a.id}>{a.name}：{a.id}</p>)}</div>{[['允许名单',list,setList],['禁止名单',blocked,setBlocked],['静默用户',muted,setMuted]].map(([label,value,setter])=><label className="ops-field" key={String(label)}>{label as string}<textarea value={value as string} onChange={e=>(setter as (s:string)=>void)(e.target.value)}/></label>)}<Button disabled={busy} onClick={()=>save({hourlyLimit:hourly,dailyLimit:daily?Number(daily):null,cooldownScope:cooldown,sendWindows:windows.split(/\r?\n/).filter(s=>s.trim()).map(s=>{const [start,end]=s.trim().split('-');return {start,end};}),listMode,allowlist:parse(list),blocklist:parse(blocked),mutedUsers:parse(muted)})}>保存安全策略</Button></section>;
}

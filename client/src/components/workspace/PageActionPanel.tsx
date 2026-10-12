import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, Send } from 'lucide-react';
import { getAuthToken } from '@/api';
import { Button } from '@/components/ui/button';
import { useOfficialWorkspace } from './OfficialWorkspace';
import { loadPublishAccounts } from './publish-preferences';

export function PageActionPanel({ platform, sessionId, accountId, kind, pageUrl, getGuestId, task }: {
  platform: MatrixDesktopPlatform; sessionId: string; accountId?: string;
  kind: 'manage' | 'publish' | 'comments' | 'messages' | 'withdraw'; pageUrl: string; getGuestId(): number;
  task?: { id: string; title: string; kind: 'comments' | 'withdraw' };
}) {
  const [plan, setPlan] = useState<MatrixPageActionPlan | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<MatrixPageActionReceipt | null>(null);
  const lock = useRef(false), generation = useRef(0);
  useEffect(() => { generation.current++; setPlan(null); setError(''); setReceipt(null); }, [kind, accountId, pageUrl, task?.id]);
  const input = (): MatrixPageActionInput => {
    const accessToken = getAuthToken();
    if (!accessToken || !accountId) throw new Error('请先登录矩效并完成账号绑定');
    return { platform, sessionId, accountId, webContentsId: getGuestId(), accessToken, ...(task?.kind === kind ? { taskId: task.id, expectedTitle: task.title } : {}) };
  };
  const inspect = async () => {
    if (lock.current || kind === 'manage') return;
    lock.current = true; setBusy(true); setError(''); setPlan(null); setReceipt(null);
    const current = generation.current;
    try {
      if (task?.kind === kind && !window.confirm(`请核对正在操作的是这条作品：${task.title || '未填写标题'}。\n账号、作品内容和发布时间都一致吗？确认后本次${kind === 'withdraw' ? '下架' : '追评'}结果将关联到该任务。`)) return;
      const result = await window.matrixDesktop!.inspectPageAction({ ...input(), kind });
      if (current !== generation.current) return;
      if ('error' in result) throw new Error(result.error);
      setPlan(result); setIndex(0);
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : '检查表单失败'); }
    finally { lock.current = false; setBusy(false); }
  };
  const submit = async () => {
    if (lock.current || !plan) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await window.matrixDesktop!.submitPageAction({ ...input(), nonce: plan.nonce, index });
      if (result.cancelled) return;
      setPlan(null);
      window.dispatchEvent(new Event('matrix:page-actions-updated'));
      if (result.error) throw new Error(result.error + (result.mayHaveSubmitted ? '；请先核对官方页面，避免重复提交。' : ''));
      if (result.receipt) setReceipt(result.receipt);
    } catch (e) { setError(e instanceof Error ? e.message : '提交失败，请核对页面'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (kind === 'manage' || !accountId) return null;
  return <section className="matrix-page-action-panel"><header><Send size={15} /><strong>提交当前{kind === 'publish' ? '作品' : kind === 'comments' ? '回复' : kind === 'withdraw' ? '下架操作' : '私信'}</strong></header><p>{task?.kind === kind ? '关联作品：' + (task.title || '未填写标题') + '。请核对准确的作品；结果将单独记录，不改变作品发布结果。' : '在官方页面完成素材、文案和对象选择后，检查表单并提交。'}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void inspect()}><RefreshCw size={13} />{busy ? '处理中…' : '检查可提交表单'}</Button>{error && <p role="alert" className="text-destructive">{error}</p>}{plan && <div className="matrix-action-review"><strong>{plan.nickname}</strong>{plan.fields.filter(field => field.value.trim()).map((field, i) => <div key={i}><small>{field.label}</small><p>{field.value}</p></div>)}<label>官方提交按钮<select aria-label="官方提交按钮" value={index} disabled={busy} onChange={event => setIndex(Number(event.target.value))}>{plan.candidates.map(candidate => <option key={candidate.index} value={candidate.index}>{candidate.label} · {candidate.context.slice(0, 70)}</option>)}</select></label><Button disabled={busy} onClick={() => void submit()}><Send size={14} />核对并提交</Button></div>}{receipt && <div className={`matrix-action-receipt is-${receipt.status}`} role="status"><CheckCircle2 size={15} /><div><strong>{receipt.status === 'confirmed' ? '官方页面提示成功' : receipt.status === 'failed' ? '官方页面提示失败' : '提交结果待核对'}</strong><p>{receipt.message}</p><small>记录已保存在本机；作品审核与公开状态以平台为准。</small></div></div>}</section>;
}

export function PageActionHistory() {
  const workspace = useOfficialWorkspace();
  const [items, setItems] = useState<MatrixPageActionReceipt[]>([]);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const token = getAuthToken();
      if (!token || !window.matrixDesktop?.listPageActions) return;
      try { const result = await window.matrixDesktop.listPageActions(token); if (!cancelled) { setItems(result.items || []); setError(result.error || ''); } }
      catch { if (!cancelled) setError('读取本机提交记录失败'); }
    };
    void load(); window.addEventListener('matrix:page-actions-updated', load);
    return () => { cancelled = true; window.removeEventListener('matrix:page-actions-updated', load); };
  }, [refresh]);
  const recover = async (item: MatrixPageActionReceipt) => {
    try {
      const accounts = await loadPublishAccounts(), account = accounts.find(a=>a.id===item.accountId);
      if (!account || !await workspace.openAccount(account,'manage')) throw Error('账号无法打开，请重新登录');
      let page: (()=>MatrixPageActionInput)|undefined;
      for(let attempt=0;attempt<40&&!page;attempt++){page=workspace.page(item.accountId);if(!page)await new Promise(r=>setTimeout(r,250));}
      if(!page)throw Error('账号页面尚未加载，请稍后重试');
      const result=await window.matrixDesktop!.douyinCommentWorkflow({...page(),operation:'cleanup',recordId:item.id});
      if(result.error)throw Error(result.error);setRefresh(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'取消关注待处理');}
  };
  if (!window.matrixDesktop?.isDesktop) return null;
  return <section className="matrix-action-history"><header><h2>官方页面提交记录</h2><Button size="sm" variant="outline" onClick={() => setRefresh(n => n + 1)}>刷新提交记录</Button></header>{error && <p role="alert">{error}</p>}{!items.length && !error && <p>暂无通过矩效提交的记录。</p>}{items.map(item => <article key={item.id}><div><strong>{item.nickname} · {item.button}</strong><time>{new Date(item.createdAt).toLocaleString('zh-CN')}</time></div><p>{item.summary}</p><small>{item.status === 'confirmed' ? '页面提示成功' : item.status === 'failed' ? '页面提示失败' : '结果待核对'} · {item.message}</small>{item.followCleanup&&<p>私信：{item.messageStatus||'待核对'} · 回复：{item.replyStatus||'待核对'} · 取消关注：{item.followCleanup==='confirmed'?'已确认':'待处理'}</p>}{item.followCleanup==='pending'&&<Button size="sm" variant="destructive" onClick={()=>void recover(item)}>恢复取消关注</Button>}</article>)}</section>;
}

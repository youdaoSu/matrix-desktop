import { OfficialActionButton, platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Plus, Save, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }
export default function ContentCreateRealPage() {
  const workspace = useOfficialWorkspace();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video'>('video');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState<string[]>([]);
  const lock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100, authStatus: 'authorized' } })
      .then(response => { if (!cancelled) setAccounts(response.data?.data?.items || []); })
      .catch(e => { if (!cancelled) setError(errorMessage(e, '加载账号失败')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const chosenAccounts = () => accounts.filter(account => selected.includes(account.id));
  const validate = () => {
    if (!chosenAccounts().length) { toast.error('请先选择账号'); return false; }
    if (!title.trim() && !content.trim()) { toast.error('请先填写标题或正文'); return false; }
    return true;
  };
  const preparePersonalPublish = async () => {
    if (lock.current || !validate()) return;
    const chosen = chosenAccounts();
    if (chosen.some(account => !account.connectorSessionId)) return toast.error('请先通过本机官方登录绑定这些账号');
    lock.current = true; setBusy(true);
    const opened: string[] = [];
    try {
      for (const account of chosen) {
        if (await workspace.openAccount(account, 'publish', false, [title.trim(), content.trim()].filter(Boolean).join('\n\n'))) opened.push(account.id);
      }
      setPrepared(opened);
      if (opened.length === chosen.length) toast.info('已准备账号页面和文案；还需上传素材并在页面点击发表，尚未发布');
      else toast.error(`仅准备了 ${opened.length}/${chosen.length} 个账号，请重试未打开的账号；尚未发布`);
    } finally { lock.current = false; setBusy(false); }
  };
  const save = async () => {
    if (lock.current || !validate()) return;
    lock.current = true; setBusy(true);
    try {
      await axiosForBackend.post('/api/content/posts', { title: title.trim() || undefined, content: content.trim() || undefined, mediaType, accountIds: chosenAccounts().map(a => a.id), status: 'draft' });
      toast.success(`已保存 ${chosenAccounts().length} 条本地草稿，尚未发布`);
      navigate('/publish/drafts');
    } catch (e) { toast.error(errorMessage(e, '保存草稿失败')); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="matrix-publish-editor">
    <div className="matrix-publish-columns">
      <section className="matrix-publish-common">
        <header><strong>通用配置</strong><span>发单条视频 / 图文</span></header>
        <div className="matrix-publish-form">
          <div className="matrix-media-guidance"><Video size={26} /><strong>选择视频或图片</strong><p>素材在右侧账号页面中选择上传。每个账号独立上传，完成后仍需点击官方“发表”。</p><OfficialActionButton intent="publish">进入官方发布页</OfficialActionButton></div>
          <div className="matrix-publish-field"><Label htmlFor="publish-media-type">内容类型</Label><Select value={mediaType} disabled={busy} onValueChange={v => setMediaType(v as typeof mediaType)}><SelectTrigger id="publish-media-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="video">视频</SelectItem><SelectItem value="image">图文</SelectItem><SelectItem value="text">文本草稿</SelectItem></SelectContent></Select></div>
          <div className="matrix-publish-field"><Label htmlFor="publish-title">通用标题</Label><div><Input id="publish-title" disabled={busy} value={title} onChange={e => { setTitle(e.target.value); setPrepared([]); }} maxLength={500} placeholder="请输入作品标题" /><small>{title.length}/500 · 发表时以平台标题限制为准</small></div></div>
          <div className="matrix-publish-field"><Label htmlFor="publish-content">通用简介</Label><div><Textarea id="publish-content" disabled={busy} value={content} onChange={e => { setContent(e.target.value); setPrepared([]); }} maxLength={20000} placeholder="请输入正文、话题或作品简介" /><small>{content.length}/20000 · 上传后在账号页面核对</small></div></div>
          <div className="matrix-publication-steps" aria-label="发表流程"><strong>发表流程</strong><ol><li>选择目标账号，准备账号页面</li><li>打开发表入口，上传素材并填写文案</li><li>核对账号、封面、文案和可见范围</li><li>在官方页面点击发表，查看平台结果</li></ol><p>保存草稿、准备页面、上传完成都不等于发表成功。当前不会自动点击发表，也没有平台成功回执。</p></div>
        </div>
      </section>
      <section className="matrix-publish-accounts">
        <header><strong>平台和账号配置</strong><span>已选 {selected.length} 个账号</span></header>
        <div className="matrix-publish-account-list">
          {loading && <p role="status">正在加载账号…</p>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {accounts.map(account => <label key={account.id} className="matrix-publish-account"><Checkbox disabled={busy} checked={selected.includes(account.id)} onCheckedChange={checked => setSelected(ids => checked ? [...new Set([...ids, account.id])] : ids.filter(id => id !== account.id))} /><div><strong>{account.nickname || '未命名账号'}</strong><small>{platformLabels[account.platform]}</small></div><span className={prepared.includes(account.id) ? 'is-prepared' : ''}>{prepared.includes(account.id) ? <><CheckCircle2 size={13} />页面已准备 · 未发布</> : '未发布'}</span></label>)}
          {!loading && !error && !accounts.length && <div className="matrix-publish-no-account"><Plus size={32} /><p>还没有已绑定账号</p><Button variant="outline" onClick={() => navigate('/accounts')}>添加账号</Button></div>}
        </div>
      </section>
    </div>
    <footer className="matrix-publish-footer"><Button variant="outline" disabled={busy} onClick={() => { if ((title || content) && !window.confirm('清空当前未保存的标题和正文？已保存草稿和官方页面不受影响。')) return; setTitle(''); setContent(''); setPrepared([]); }}>清空文案</Button><Button variant="outline" disabled={busy || loading} onClick={() => void save()}><Save size={14} />存为草稿</Button><span>未发布 · 请以平台发表结果为准</span><Button disabled={busy || loading} onClick={() => void preparePersonalPublish()}>{busy ? '处理中…' : '为所选账号准备发布'}</Button></footer>
  </div>;
}

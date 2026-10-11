import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import type { AutoReplyRule, MessageTemplate, PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { platformLabels, useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Item = AutoReplyRule | MessageTemplate;
const errorText = (error: any) => error?.response?.data?.message || error?.message || '操作失败，请重试';
const labels = { keyword: '关键词回复', welcome: '欢迎语', offline: '离线回复' };
export default function ReplyToolsPage() {
  const { pathname } = useLocation();
  const templates = pathname.endsWith('/templates');
  const ruleType = pathname.endsWith('/welcome') ? 'welcome' : pathname.endsWith('/offline') ? 'offline' : 'keyword';
  const name = templates ? '文本消息模板' : labels[ruleType];
  const endpoint = templates ? '/api/automation/templates' : '/api/auto-reply/rules';
  const workspace = useOfficialWorkspace();
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [keywords, setKeywords] = useState('');
  const [mode, setMode] = useState('contains');
  const [testText, setTestText] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reset = () => { setId(''); setTitle(''); setContent(''); setKeywords(''); setSuggestion(''); };
  useEffect(() => {
    const controller = new AbortController();
    reset(); setItems([]); setLoading(true); setError('');
    Promise.all([
      axiosForBackend.get(endpoint, { params: { page: 1, pageSize: 100, ...(templates ? { templateType: 'text' } : { ruleType }) }, signal: controller.signal }),
      axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 }, signal: controller.signal }),
    ]).then(([rules, a]) => { setItems(rules.data.data.items); setAccounts(a.data.data.items); }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, ruleType, templates]);
  const reload = async () => {
    const response = await axiosForBackend.get(endpoint, { params: { page: 1, pageSize: 100, ...(templates ? { templateType: 'text' } : { ruleType }) } });
    setItems(response.data.data.items);
  };
  const save = async () => {
    if (!title.trim() || !content.trim()) return toast.error('请填写名称和回复文案');
    if (!templates && ruleType === 'keyword' && !keywords.trim()) return toast.error('请填写至少一个关键词');
    setBusy(true);
    try {
      const body = templates ? { templateName: title.trim(), templateType: 'text', content: content.trim() } : { ruleName: title.trim(), ruleType, keywords: keywords.split(/[，,\n]/).map(v => v.trim()).filter(Boolean), matchMode: mode, replyContent: content.trim(), replyType: 'text' };
      if (!id) await axiosForBackend.post(endpoint, body);
      else if (templates) await axiosForBackend.patch(`${endpoint}/${id}`, body);
      else await axiosForBackend.put(`${endpoint}/${id}`, body);
      await reload(); reset(); toast.success('已保存到数据库；不会自动发送');
    } catch (e) { toast.error(errorText(e)); }
    finally { setBusy(false); }
  };
  const edit = (item: Item) => {
    setId(item.id); setSuggestion('');
    if ('ruleName' in item) { setTitle(item.ruleName); setContent(item.replyContent || ''); setKeywords(item.keywords?.join('，') || ''); setMode(item.matchMode); }
    else { setTitle(item.templateName); setContent(item.content || ''); }
  };
  const remove = async (itemId: string) => {
    if (!window.confirm('删除这条配置？此操作不可撤销。')) return;
    setBusy(true);
    try { await axiosForBackend.delete(`${endpoint}/${itemId}`); await reload(); if (id === itemId) reset(); toast.success('已删除'); }
    catch (e) { toast.error(errorText(e)); }
    finally { setBusy(false); }
  };
  const test = async (item: Item) => {
    setBusy(true); setSuggestion('');
    try {
      if ('ruleName' in item) {
        const response = await axiosForBackend.post(`${endpoint}/${item.id}/test`, { text: testText });
        const result = response.data.data;
        setSuggestion(result.hit ? result.replyContent || '' : '');
        toast.info(result.hit ? '已命中规则，仅生成建议，未发送' : '未命中该规则');
      } else setSuggestion(item.content || '');
    } catch (e) { toast.error(errorText(e)); }
    finally { setBusy(false); }
  };
  const prepare = async () => {
    const account = accounts.find(item => item.id === accountId);
    if (!account?.connectorSessionId) return toast.error('请选择已在本机绑定的账号');
    await workspace.openAccount(account, 'messages', false, suggestion);
  };
  return <div className="space-y-5">
    <h1 className="text-xl font-semibold">{name}</h1>
    <Alert><AlertDescription>个人账号辅助模式：配置真实保存，可测试关键词并生成回复建议。欢迎语和离线回复须由你判断适用场景；不监听官方消息、不自动发送，也不代表平台审核通过。</AlertDescription></Alert>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Card><CardHeader><CardTitle className="text-base">{id ? '编辑' : '新增'}{name}</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label htmlFor="reply-tool-name">名称</Label><Input id="reply-tool-name" maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></div>{!templates && ruleType === 'keyword' && <><div><Label htmlFor="reply-tool-keywords">关键词（逗号或换行分隔）</Label><Textarea id="reply-tool-keywords" maxLength={2000} value={keywords} onChange={e => setKeywords(e.target.value)} /></div><label className="flex items-center gap-3">匹配方式<select aria-label="匹配方式" className="rounded-md border bg-background p-2" value={mode} onChange={e => setMode(e.target.value)}><option value="contains">包含</option><option value="exact">完全相同</option><option value="fuzzy">顺序字符匹配</option></select></label></>}<div><Label htmlFor="reply-tool-content">回复文案</Label><Textarea id="reply-tool-content" maxLength={20000} value={content} onChange={e => setContent(e.target.value)} /></div><div className="flex gap-2"><Button disabled={busy || loading} onClick={() => void save()}>{busy ? '处理中…' : '保存配置'}</Button><Button variant="outline" disabled={busy} onClick={reset}>清空编辑</Button></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">已保存配置（最近 100 条）</CardTitle></CardHeader><CardContent className="space-y-3">{!templates && <Input aria-label="用于测试的消息" placeholder="粘贴消息用于规则测试；不会发送到平台" maxLength={20000} value={testText} onChange={e => setTestText(e.target.value)} />}{items.map(item => <div key={item.id} className="rounded-lg border p-3"><strong>{'ruleName' in item ? item.ruleName : item.templateName}</strong><p className="my-2 whitespace-pre-wrap text-sm text-muted-foreground">{'ruleName' in item ? item.replyContent : item.content}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => edit(item)}>编辑配置</Button><Button variant="outline" disabled={busy} onClick={() => void test(item)}>{templates ? '使用文案' : '测试并生成建议'}</Button><Button variant="ghost" disabled={busy} onClick={() => void remove(item.id)}>删除配置</Button></div></div>)}{!loading && !items.length && <p className="text-muted-foreground">暂无配置，请先新增</p>}</CardContent></Card>
    {suggestion && <Card><CardHeader><CardTitle className="text-base">回复建议 · 未发送</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea aria-label="回复建议" value={suggestion} onChange={e => setSuggestion(e.target.value)} /><select aria-label="使用回复的账号" className="w-full rounded-md border bg-background p-2" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">选择本机账号</option>{accounts.filter(item => item.connectorSessionId).map(item => <option key={item.id} value={item.id}>{platformLabels[item.platform]} · {item.nickname}</option>)}</select><div className="flex flex-wrap gap-2"><Button disabled={!suggestion.trim()} onClick={() => void prepare()}>准备当前账号回复</Button><Button variant="outline" onClick={() => void navigator.clipboard.writeText(suggestion).then(() => toast.success('文案已复制')).catch(() => toast.error('复制失败，请手动复制'))}>复制建议</Button></div></CardContent></Card>}
  </div>;
}

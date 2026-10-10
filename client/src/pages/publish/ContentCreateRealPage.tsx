import { OfficialActionButton } from '@/components/workspace/OfficialWorkspace';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PlatformAccount } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Checkbox } from '@client/src/components/ui/checkbox';
import { Input } from '@client/src/components/ui/input';
import { Label } from '@client/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@client/src/components/ui/select';
import { Textarea } from '@client/src/components/ui/textarea';
import { toast } from 'sonner';

function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }
export default function ContentCreateRealPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video'>('text');
  const [saving, setSaving] = useState(false);
  useEffect(() => { axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100, authStatus: 'authorized' } }).then((response) => setAccounts(response.data?.data?.items || [])).catch((error) => toast.error(errorMessage(error, '加载账号失败'))); }, []);
  const save = async () => {
    if (!selected.length) return toast.error('请至少选择一个账号');
    if (!title.trim() && !content.trim()) return toast.error('标题或正文至少填写一项');
    setSaving(true);
    try {
      await axiosForBackend.post('/api/content/posts', { title: title.trim() || undefined, content: content.trim() || undefined, mediaType, accountIds: selected, status: 'draft' });
      toast.success(`已保存 ${selected.length} 条真实草稿`);
      navigate('/publish/tasks');
    } catch (error: any) { toast.error(errorMessage(error, '保存草稿失败')); }
    finally { setSaving(false); }
  };
  return <div className="space-y-5"><Alert className="border-primary/20 bg-primary/5"><Save className="h-4 w-4 text-primary" /><AlertDescription>先整理标题和正文并保存草稿，再进入官方工作区上传素材、确认发表。</AlertDescription></Alert><div><h1 className="text-xl font-semibold">新建内容草稿</h1><p className="mt-1 text-sm text-muted-foreground">同一内容选择多个账号时，会分别保存对应平台草稿。</p></div><div className="grid gap-4 lg:grid-cols-[320px_1fr]"><Card><CardHeader><CardTitle className="text-base">选择真实账号</CardTitle></CardHeader><CardContent className="space-y-2">{accounts.map((account) => <label key={account.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3"><Checkbox checked={selected.includes(account.id)} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, account.id] : current.filter((id) => id !== account.id))} /><div><div className="text-sm font-medium">{account.nickname || '未命名账号'}</div><div className="text-xs text-muted-foreground">{account.platform}</div></div></label>)}{accounts.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">请先绑定账号</div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">草稿内容</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label>内容类型</Label><Select value={mediaType} onValueChange={(value) => setMediaType(value as typeof mediaType)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="text">文本</SelectItem><SelectItem value="image">图文</SelectItem><SelectItem value="video">视频</SelectItem></SelectContent></Select></div><div><Label>标题</Label><Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} placeholder="请输入标题" /></div><div><Label>正文</Label><Textarea className="mt-1 min-h-52" value={content} onChange={(event) => setContent(event.target.value)} placeholder="请输入正文内容" /></div><div className="flex justify-end gap-2"><OfficialActionButton intent="publish">进入官方发布页</OfficialActionButton><Button variant="outline" onClick={() => navigate('/publish/tasks')}>取消</Button><Button disabled={saving} onClick={() => void save()}><Save className="mr-1 h-4 w-4" />{saving ? '保存中…' : '保存草稿'}</Button></div></CardContent></Card></div></div>;
}

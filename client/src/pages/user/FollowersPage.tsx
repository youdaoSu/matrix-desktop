import { useEffect, useState } from 'react';
import { RefreshCw, Search, Users } from 'lucide-react';
import type { FollowerRecord, PlatformAccount, PlatformType } from '@shared/api.interface';
import { axiosForBackend } from '@/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@client/src/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/src/components/ui/table';
import { toast } from 'sonner';

const platformLabels: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }

export default function FollowersPage() {
  const [followers, setFollowers] = useState<FollowerRecord[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [accountId, setAccountId] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: 100 };
      if (search.trim()) params.keyword = search.trim();
      if (platform !== 'all') params.platform = platform;
      if (accountId !== 'all') params.accountId = accountId;
      const [followerResponse, accountResponse] = await Promise.all([
        axiosForBackend.get('/api/platform/followers', { params }),
        axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } }),
      ]);
      setFollowers(followerResponse.data?.data?.items || []);
      setAccounts(accountResponse.data?.data?.items || []);
    } catch (error: any) {
      toast.error(errorMessage(error, '加载粉丝记录失败'));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [platform, accountId]);
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.nickname || '未知账号';

  return <div className="space-y-5">
    <Alert className="border-primary/20 bg-primary/5"><Users className="h-4 w-4 text-primary" /><AlertDescription>仅显示已通过获批平台接口同步到本地的真实粉丝记录；网页登录本身不会自动获得完整粉丝名单。</AlertDescription></Alert>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">粉丝管理</h1><p className="mt-1 text-sm text-muted-foreground">共 {followers.length} 条已同步记录</p></div><Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div>
    <Card><CardContent className="flex flex-wrap gap-3 p-4">
      <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void load()} placeholder="搜索昵称或标签，回车查询" /></div>
      <Select value={platform} onValueChange={(value) => { setPlatform(value); setAccountId('all'); }}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部平台</SelectItem>{Object.entries(platformLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={accountId} onValueChange={setAccountId}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部账号</SelectItem>{accounts.filter((account) => platform === 'all' || account.platform === platform).map((account) => <SelectItem key={account.id} value={account.id}>{account.nickname || '未命名账号'}</SelectItem>)}</SelectContent></Select>
      <Button onClick={() => void load()}>查询</Button>
    </CardContent></Card>
    <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>粉丝</TableHead><TableHead>平台</TableHead><TableHead>所属账号</TableHead><TableHead>标签</TableHead><TableHead>地区</TableHead><TableHead>关注时间</TableHead></TableRow></TableHeader><TableBody>
      {followers.map((follower) => <TableRow key={follower.id}><TableCell><div className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarImage src={follower.avatarUrl} /><AvatarFallback>{(follower.nickname || '粉').slice(0, 1)}</AvatarFallback></Avatar><span>{follower.nickname || '未命名粉丝'}</span>{follower.isMutual && <Badge variant="secondary">互关</Badge>}</div></TableCell><TableCell>{platformLabels[follower.platform]}</TableCell><TableCell>{accountName(follower.accountId)}</TableCell><TableCell><div className="flex flex-wrap gap-1">{(follower.tags || []).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div></TableCell><TableCell>{follower.location || '—'}</TableCell><TableCell>{follower.followedAt ? new Date(follower.followedAt).toLocaleString('zh-CN') : '—'}</TableCell></TableRow>)}
      {!loading && followers.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">暂无真实粉丝记录。平台接口获批并执行同步后会显示在这里。</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>
  </div>;
}

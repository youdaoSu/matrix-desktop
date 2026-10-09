import { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileText, Heart, MessageCircle, MessageSquare, RefreshCw, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axiosForBackend } from '@/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@client/src/components/ui/select';
import { toast } from 'sonner';

interface Overview {
  totalFollowers: number;
  totalPosts: number;
  totalEngagement: number;
  totalMessages: number;
  totalComments: number;
}

interface FollowerPoint { date: string; followers: number; newFollowers: number }
interface EngagementPoint { date: string; likes: number; comments: number; shares: number }
interface AccountComparison { accountId: string; nickname?: string; platform: string; followers: number; posts: number; engagement: number }
interface RankingItem { id: string; title?: string; platform: string; accountNickname?: string; engagement: number; likeCount: number; commentCount: number; shareCount: number }

const emptyOverview: Overview = { totalFollowers: 0, totalPosts: 0, totalEngagement: 0, totalMessages: 0, totalComments: 0 };
const platformLabels: Record<string, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback;
}

export default function AnalyticsPage() {
  const [days, setDays] = useState('30');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [followers, setFollowers] = useState<FollowerPoint[]>([]);
  const [engagement, setEngagement] = useState<EngagementPoint[]>([]);
  const [accounts, setAccounts] = useState<AccountComparison[]>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [overviewResult, followerResult, engagementResult, accountResult, rankingResult] = await Promise.all([
        axiosForBackend.get('/api/analytics/overview'),
        axiosForBackend.get('/api/analytics/follower-trend', { params: { days } }),
        axiosForBackend.get('/api/analytics/engagement-trend', { params: { days } }),
        axiosForBackend.get('/api/analytics/account-comparison'),
        axiosForBackend.get('/api/analytics/content-ranking', { params: { limit: 10 } }),
      ]);
      setOverview(overviewResult.data?.data || emptyOverview);
      setFollowers(followerResult.data?.data || []);
      setEngagement(engagementResult.data?.data || []);
      setAccounts(accountResult.data?.data || []);
      setRanking(rankingResult.data?.data || []);
    } catch (error: any) {
      toast.error(errorMessage(error, '加载真实统计数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [days]);

  const cards = useMemo(() => [
    { label: '粉丝总量', value: overview.totalFollowers, icon: Users },
    { label: '内容总数', value: overview.totalPosts, icon: FileText },
    { label: '累计互动', value: overview.totalEngagement, icon: Heart },
    { label: '私信记录', value: overview.totalMessages, icon: MessageSquare },
    { label: '评论记录', value: overview.totalComments, icon: MessageCircle },
  ], [overview]);

  return (
    <div className="space-y-6">
      <Alert className="border-primary/20 bg-primary/5">
        <BarChart3 className="h-4 w-4 text-primary" />
        <AlertDescription>本页只展示本地数据库已同步的真实记录；平台尚未授权的数据会显示为 0，不再生成演示数值。</AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">数据中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">统计范围来自当前用户的真实业务记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">近 7 天</SelectItem>
              <SelectItem value="30">近 30 天</SelectItem>
              <SelectItem value="90">近 90 天</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div><div className="mt-3 text-2xl font-bold">{Number(value || 0).toLocaleString()}</div></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">粉丝记录趋势</CardTitle></CardHeader>
          <CardContent className="h-72">
            {followers.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={followers}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="followers" name="累计记录" stroke="hsl(221 83% 53%)" /><Line type="monotone" dataKey="newFollowers" name="新增记录" stroke="hsl(130 54% 42%)" /></LineChart></ResponsiveContainer> : <Empty text="当前没有已同步的粉丝记录" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">内容互动趋势</CardTitle></CardHeader>
          <CardContent className="h-72">
            {engagement.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={engagement}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="likes" name="点赞" stroke="hsl(350 85% 60%)" /><Line type="monotone" dataKey="comments" name="评论" stroke="hsl(26 90% 49%)" /><Line type="monotone" dataKey="shares" name="分享" stroke="hsl(200 90% 55%)" /></LineChart></ResponsiveContainer> : <Empty text="当前没有已同步的内容互动记录" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">账号对比</CardTitle></CardHeader>
          <CardContent className="h-72">
            {accounts.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={accounts}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nickname" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar dataKey="followers" name="粉丝" fill="hsl(221 83% 53%)" /><Bar dataKey="engagement" name="互动" fill="hsl(26 90% 49%)" /></BarChart></ResponsiveContainer> : <Empty text="请先绑定并同步平台账号" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">内容互动排行</CardTitle></CardHeader>
          <CardContent>
            {ranking.length ? <div className="space-y-2">{ranking.map((item, index) => <div key={item.id} className="flex items-center gap-3 rounded-md border p-3"><span className="w-6 text-center text-sm font-semibold text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{item.title || '未命名内容'}</div><div className="text-xs text-muted-foreground">{platformLabels[item.platform] || item.platform} · {item.accountNickname || '未知账号'}</div></div><div className="text-right"><div className="text-sm font-semibold">{item.engagement.toLocaleString()}</div><div className="text-xs text-muted-foreground">互动</div></div></div>)}</div> : <Empty text="当前没有已同步的内容记录" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div>;
}

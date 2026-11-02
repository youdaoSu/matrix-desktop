import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, FileText, Heart, MessageCircle, MessageSquare, RefreshCw, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axiosForBackend, getAuthToken, getUser } from '@/api';
import { followerPresentation, type FollowerCoverage } from '@shared/account-metrics';
import { useOwnerRequest } from '@/components/workspace/use-owner-request';
import { useAccountDataRefresh } from '@/components/workspace/account-data-events';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@client/src/components/ui/select';
import { uiOneOf, useWorkspacePreference } from '@/components/workspace/WorkspaceUiState';
import DesktopRecordOverview from '@/components/workspace/DesktopRecordOverview';

interface Overview {
  totalFollowers: number;
  totalPosts: number;
  totalEngagement: number;
  totalMessages: number;
  totalComments: number;
  followerCoverage?: FollowerCoverage;
}

interface FollowerPoint { date: string; followers: number; newFollowers: number }
interface EngagementPoint { date: string; likes: number; comments: number; shares: number }
interface AccountComparison { accountId: string; nickname?: string; platform: string; followers: number|null; followersObservedAt?:string; posts: number; engagement: number }
interface RankingItem { id: string; title?: string; platform: string; accountNickname?: string; engagement: number; likeCount: number; commentCount: number; shareCount: number }

const platformLabels: Record<string, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };

export default function AnalyticsPage() {
  return <AnalyticsWorkspace key={getUser()?.id || 'signed-out'} />;
}
function AnalyticsWorkspace() {
  const [days, setDays] = useWorkspacePreference<string>('analytics.days', '30', uiOneOf(['7', '30', '90']));
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview>();
  const [followers, setFollowers] = useState<FollowerPoint[]>([]);
  const [engagement, setEngagement] = useState<EngagementPoint[]>([]);
  const [accounts, setAccounts] = useState<AccountComparison[]>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loadErrors,setLoadErrors]=useState<string[]>([]);
  const beginRequest=useOwnerRequest(),owner=getUser()?.id,token=getAuthToken();

  const load = useCallback(async () => {
    const request=beginRequest();if(!request.authorized){request.finish();setLoading(false);return;}
    setLoading(true);
    const labels=['统计概览','粉丝记录趋势','内容互动记录','账号对比','内容排行'];
    const results=await Promise.allSettled([
      axiosForBackend.get('/api/analytics/overview',{signal:request.signal}),
      axiosForBackend.get('/api/analytics/follower-trend',{params:{days},signal:request.signal}),
      axiosForBackend.get('/api/analytics/engagement-trend',{params:{days},signal:request.signal}),
      axiosForBackend.get('/api/analytics/account-comparison',{signal:request.signal}),
      axiosForBackend.get('/api/analytics/content-ranking',{params:{limit:10},signal:request.signal}),
    ]);request.finish();if(!request.current())return;
    const setters=[setOverview,setFollowers,setEngagement,setAccounts,setRanking];
    const errors:string[]=[];
    results.forEach((result,index)=>{
      if(result.status==='rejected'){errors.push(labels[index]);return;}
      const data=result.value.data?.data;
      if(index===0){if(data&&['totalPosts','totalEngagement','totalMessages','totalComments'].every(key=>Number.isSafeInteger(data[key])&&data[key]>=0))setOverview(data);else errors.push(labels[index]);}
      else if(Array.isArray(data)) (setters[index] as (value: unknown[])=>void)(data);
      else errors.push(labels[index]);
    });
    setLoadErrors(errors);setLoading(false);
  },[beginRequest,days]);

  useEffect(()=>{setOverview(undefined);setFollowers([]);setEngagement([]);setAccounts([]);setRanking([]);setLoadErrors([]);void load();},[load,owner,token]);
  useAccountDataRefresh(load);
  const followerMetric=followerPresentation(overview?.followerCoverage);

  const cards = useMemo(() => [
    { label: '已采集粉丝小计', value: followerMetric.value, icon: Users },
    { label: '本地内容记录', value: overview?.totalPosts, icon: FileText },
    { label: '已保存互动数', value: overview?.totalEngagement, icon: Heart },
    { label: '本地私信记录', value: overview?.totalMessages, icon: MessageSquare },
    { label: '本地评论记录', value: overview?.totalComments, icon: MessageCircle },
  ], [overview,followerMetric.value]);

  return (
    <div className="matrix-analytics space-y-6">
      <DesktopRecordOverview />
      <Alert className="border-primary/20 bg-primary/5">
        <BarChart3 className="h-4 w-4 text-primary" />
        <AlertDescription>本页汇总当前用户已保存的记录，不等同于平台实时总量。粉丝未采集时显示“—”，真实采集到 0 才显示 0；部分采集只显示已采集小计。互动趋势按内容日期汇总，不代表当日新增互动。</AlertDescription>
      </Alert>
      {loadErrors.length>0&&<div role="alert" className="rounded border border-orange-300 p-3 text-sm">未能刷新：{loadErrors.join('、')}。没有把失败请求记作 0；已有部分保留上次结果，可重新刷新。</div>}
      <p className="text-xs text-muted-foreground" role="status">{followerMetric.detail}{overview?.followerCoverage?.latestObservedAt?`；最近样本 ${new Date(overview.followerCoverage.latestObservedAt).toLocaleString('zh-CN')}`:''}</p>

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
          <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div><div className="mt-3 text-2xl font-bold">{loading||value===undefined||value===null?'—':value.toLocaleString()}</div></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">粉丝记录趋势</CardTitle></CardHeader>
          <CardContent className="h-72">
            {followers.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={followers}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Line isAnimationActive={false} type="monotone" dataKey="followers" name="累计记录" stroke="hsl(221 83% 53%)" /><Line isAnimationActive={false} type="monotone" dataKey="newFollowers" name="新增记录" stroke="hsl(130 54% 42%)" /></LineChart></ResponsiveContainer> : <Empty text="当前没有已同步的粉丝记录" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">按内容日期汇总互动</CardTitle></CardHeader>
          <CardContent className="h-72">
            {engagement.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={engagement}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Line isAnimationActive={false} type="monotone" dataKey="likes" name="点赞" stroke="hsl(350 85% 60%)" /><Line isAnimationActive={false} type="monotone" dataKey="comments" name="评论" stroke="hsl(26 90% 49%)" /><Line isAnimationActive={false} type="monotone" dataKey="shares" name="分享" stroke="hsl(200 90% 55%)" /></LineChart></ResponsiveContainer> : <Empty text="当前没有已同步的内容互动记录" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">账号对比</CardTitle></CardHeader>
          {!!accounts.length&&<p className="px-6 text-xs text-muted-foreground">粉丝已采集 {accounts.filter(account=>account.followers!==null).length}/{accounts.length} 个账号；未采集账号不按 0 绘制。</p>}
          <CardContent className="h-72">
            {accounts.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={accounts}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nickname" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar isAnimationActive={false} dataKey="followers" name="粉丝" fill="hsl(221 83% 53%)" /><Bar isAnimationActive={false} dataKey="engagement" name="互动" fill="hsl(26 90% 49%)" /></BarChart></ResponsiveContainer> : <Empty text="请先绑定并同步平台账号" />}
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

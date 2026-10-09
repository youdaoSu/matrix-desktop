import { useState, useMemo } from 'react';
import {
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Calendar,
  BarChart3,
  PieChart,
  AlertCircle,
  Users,
  Trophy,
  Download,
  Target,
  FileDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import AccountSelector from '@client/src/components/account/AccountSelector';
import type { PlatformAccount, AccountGroup, PlatformType } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@client/src/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart as RechartsPie,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';

const platformData = [
  { platform: '抖音', published: 128, failed: 15, success: 89.5 },
  { platform: '小红书', published: 95, failed: 8, success: 92.2 },
  { platform: '视频号', published: 62, failed: 12, success: 83.8 },
  { platform: 'B站', published: 45, failed: 5, success: 90.0 },
];

const failReasonData = [
  { name: '账号授权过期', value: 18, color: 'hsl(2 84% 62%)' },
  { name: '内容违规', value: 12, color: 'hsl(26 90% 49%)' },
  { name: '频控限制', value: 8, color: 'hsl(221 83% 53%)' },
  { name: 'CSRF校验失败', value: 6, color: 'hsl(200 90% 55%)' },
  { name: '网络超时', value: 4, color: 'hsl(130 54% 42%)' },
  { name: '其他原因', value: 3, color: 'hsl(220 14% 46%)' },
];

const weeklyData = [
  { day: '周一', 成功: 38, 失败: 7 },
  { day: '周二', 成功: 49, 失败: 3 },
  { day: '周三', 成功: 62, 失败: 6 },
  { day: '周四', 成功: 51, 失败: 4 },
  { day: '周五', 成功: 65, 失败: 7 },
  { day: '周六', 成功: 77, 失败: 8 },
  { day: '周日', 成功: 72, 失败: 6 },
];

const monthlyData = [
  { day: '09/01', 成功: 28, 失败: 3 },
  { day: '09/05', 成功: 35, 失败: 5 },
  { day: '09/10', 成功: 42, 失败: 4 },
  { day: '09/15', 成功: 55, 失败: 7 },
  { day: '09/20', 成功: 48, 失败: 6 },
  { day: '09/25', 成功: 62, 失败: 5 },
  { day: '09/28', 成功: 58, 失败: 4 },
];

const chartConfig: ChartConfig = {
  成功: { label: '成功', color: 'hsl(130 54% 42%)' },
  失败: { label: '失败', color: 'hsl(2 84% 62%)' },
} satisfies ChartConfig;

const platformPieData = [
  { name: '抖音', value: 143, color: 'hsl(0 0% 8%)' },
  { name: '小红书', value: 103, color: 'hsl(350 85% 60%)' },
  { name: '视频号', value: 74, color: 'hsl(142 45% 45%)' },
  { name: 'B站', value: 50, color: 'hsl(200 90% 55%)' },
];

const accountRank = [
  { rank: 1, name: '美食探店小队', platform: '抖音', platformKey: 'douyin', groupName: '主力账号', published: 68, failed: 5, success: 93.2 },
  { rank: 2, name: '生活种草日记', platform: '小红书', platformKey: 'xiaohongshu', groupName: '种草矩阵', published: 52, failed: 3, success: 94.5 },
  { rank: 3, name: '科技宅频道', platform: 'B站', platformKey: 'bilibili', groupName: '主力账号', published: 35, failed: 4, success: 89.7 },
  { rank: 4, name: '旅行日记Vlog', platform: '抖音', platformKey: 'douyin', groupName: '主力账号', published: 60, failed: 10, success: 85.7 },
  { rank: 5, name: '时尚穿搭指南', platform: '小红书', platformKey: 'xiaohongshu', groupName: '生活方式', published: 43, failed: 5, success: 89.6 },
  { rank: 6, name: '职场成长笔记', platform: '视频号', platformKey: 'wechat', groupName: '知识科普', published: 31, failed: 6, success: 83.8 },
  { rank: 7, name: '数码开箱测评', platform: 'B站', platformKey: 'bilibili', groupName: '知识科普', published: 10, failed: 1, success: 90.9 },
  { rank: 8, name: '健身打卡日记', platform: '抖音', platformKey: 'douyin', groupName: '种草矩阵', published: 15, failed: 2, success: 88.2 },
];

const mockGroups: AccountGroup[] = [
  { id: 'g1', userId: 'u1', groupName: '主力账号', sortOrder: 1, isDefault: true, accountCount: 4, createdAt: '2026-01-01' },
  { id: 'g2', userId: 'u1', groupName: '种草矩阵', sortOrder: 2, isDefault: false, accountCount: 3, createdAt: '2026-01-02' },
  { id: 'g3', userId: 'u1', groupName: '知识科普', sortOrder: 3, isDefault: false, accountCount: 3, createdAt: '2026-01-03' },
  { id: 'g4', userId: 'u1', groupName: '生活方式', sortOrder: 4, isDefault: false, accountCount: 2, createdAt: '2026-01-04' },
  { id: 'g5', userId: 'u1', groupName: '测试账号', sortOrder: 5, isDefault: false, accountCount: 2, createdAt: '2026-01-05' },
];

const mockAccounts: PlatformAccount[] = [
  { id: 'acc1', platform: 'douyin', nickname: '美食探店小队', groupName: '主力账号', authStatus: 'authorized', followersCount: 128000, followingCount: 230, likesCount: 1250000, postsCount: 356, healthStatus: 'normal', createdAt: '2026-01-10' },
  { id: 'acc2', platform: 'douyin', nickname: '旅行日记Vlog', groupName: '主力账号', authStatus: 'authorized', followersCount: 86000, followingCount: 180, likesCount: 890000, postsCount: 243, healthStatus: 'normal', createdAt: '2026-01-12' },
  { id: 'acc3', platform: 'douyin', nickname: '健身打卡日记', groupName: '种草矩阵', authStatus: 'authorized', followersCount: 52000, followingCount: 150, likesCount: 420000, postsCount: 178, healthStatus: 'normal', createdAt: '2026-02-01' },
  { id: 'acc4', platform: 'xiaohongshu', nickname: '生活种草日记', groupName: '种草矩阵', authStatus: 'authorized', followersCount: 95000, followingCount: 210, likesCount: 1120000, postsCount: 289, healthStatus: 'normal', createdAt: '2026-01-15' },
  { id: 'acc5', platform: 'xiaohongshu', nickname: '时尚穿搭指南', groupName: '生活方式', authStatus: 'authorized', followersCount: 72000, followingCount: 195, likesCount: 780000, postsCount: 215, healthStatus: 'normal', createdAt: '2026-01-20' },
  { id: 'acc6', platform: 'xiaohongshu', nickname: '护肤小课堂', groupName: '种草矩阵', authStatus: 'authorized', followersCount: 45000, followingCount: 140, likesCount: 520000, postsCount: 134, healthStatus: 'warning', createdAt: '2026-02-10' },
  { id: 'acc7', platform: 'wechat', nickname: '职场成长笔记', groupName: '知识科普', authStatus: 'authorized', followersCount: 38000, followingCount: 120, likesCount: 310000, postsCount: 156, healthStatus: 'normal', createdAt: '2026-01-25' },
  { id: 'acc8', platform: 'wechat', nickname: '读书分享会', groupName: '知识科普', authStatus: 'authorized', followersCount: 25000, followingCount: 100, likesCount: 180000, postsCount: 98, healthStatus: 'normal', createdAt: '2026-02-05' },
  { id: 'acc9', platform: 'wechat', nickname: '生活家小助手', groupName: '生活方式', authStatus: 'expired', followersCount: 15000, followingCount: 80, likesCount: 95000, postsCount: 67, healthStatus: 'error', createdAt: '2026-03-01' },
  { id: 'acc10', platform: 'bilibili', nickname: '科技宅频道', groupName: '主力账号', authStatus: 'authorized', followersCount: 156000, followingCount: 260, likesCount: 1890000, postsCount: 412, healthStatus: 'normal', createdAt: '2026-01-05' },
  { id: 'acc11', platform: 'bilibili', nickname: '数码开箱测评', groupName: '知识科普', authStatus: 'authorized', followersCount: 68000, followingCount: 170, likesCount: 720000, postsCount: 189, healthStatus: 'normal', createdAt: '2026-01-30' },
  { id: 'acc12', platform: 'douyin', nickname: '测试账号01', groupName: '测试账号', authStatus: 'pending', followersCount: 100, followingCount: 5, likesCount: 200, postsCount: 3, healthStatus: 'warning', createdAt: '2026-03-15' },
];

const statsCards = [
  { label: '总发布任务', value: '370', icon: BarChart3, color: 'hsl(221 83% 53%)', bg: 'bg-[hsl(221_83%_53%)]/10' },
  { label: '发布成功', value: '318', icon: CheckCircle, color: 'hsl(130 54% 42%)', bg: 'bg-[hsl(130_54%_42%)]/10' },
  { label: '发布失败', value: '52', icon: XCircle, color: 'hsl(2 84% 62%)', bg: 'bg-[hsl(2_84%_62%)]/10' },
  { label: '成功率', value: '85.9%', icon: TrendingUp, color: 'hsl(26 90% 49%)', bg: 'bg-[hsl(26_90%_49%)]/10' },
];

const PublishStatsPage = () => {
  const [period, setPeriod] = useState('7days');
  const [platform, setPlatform] = useState<PlatformType | 'all'>('all');
  const [groupId, setGroupId] = useState<string | 'all'>('all');
  const [accountId, setAccountId] = useState<string | 'all'>('all');

  // 三级联动过滤：计算当前筛选范围内的账号名集合
  const filteredAccountNames = useMemo<Set<string>>(() => {
    const names = new Set<string>();
    for (const acc of mockAccounts) {
      if (platform !== 'all' && acc.platform !== platform) continue;
      if (groupId !== 'all') {
        const group = mockGroups.find((g: AccountGroup) => g.id === groupId);
        if (!group || acc.groupName !== group.groupName) continue;
      }
      if (accountId !== 'all' && acc.id !== accountId) continue;
      if (acc.nickname) names.add(acc.nickname);
    }
    return names;
  }, [platform, groupId, accountId]);

  // 过滤后的账号排行
  const filteredAccountRank = useMemo(() => {
    return accountRank
      .filter((a) => filteredAccountNames.has(a.name))
      .map((a, idx) => ({ ...a, rank: idx + 1 }));
  }, [filteredAccountNames]);

  // 过滤后的平台数据（按当前筛选账号所属平台聚合）
  const filteredPlatformData = useMemo(() => {
    const platformMap = new Map<string, { platform: string; published: number; failed: number; success: number }>();
    for (const acc of filteredAccountRank) {
      if (!platformMap.has(acc.platform)) {
        platformMap.set(acc.platform, { platform: acc.platform, published: 0, failed: 0, success: 0 });
      }
      const entry = platformMap.get(acc.platform)!;
      entry.published += acc.published;
      entry.failed += acc.failed;
    }
    const arr = Array.from(platformMap.values());
    for (const p of arr) {
      p.success = p.published + p.failed > 0
        ? Number(((p.published / (p.published + p.failed)) * 100).toFixed(1))
        : 0;
    }
    return arr;
  }, [filteredAccountRank]);

  // 过滤后的平台饼图数据
  const filteredPlatformPie = useMemo(() => {
    const colorMap: Record<string, string> = {
      '抖音': 'hsl(0 0% 8%)',
      '小红书': 'hsl(350 85% 60%)',
      '视频号': 'hsl(142 45% 45%)',
      'B站': 'hsl(200 90% 55%)',
    };
    return filteredPlatformData.map((p) => ({
      name: p.platform,
      value: p.published + p.failed,
      color: colorMap[p.platform] || 'hsl(220 14% 46%)',
    }));
  }, [filteredPlatformData]);

  // 过滤后的统计卡（根据账号排行聚合）
  const filteredStats = useMemo(() => {
    const totalPublished = filteredAccountRank.reduce((sum, a) => sum + a.published, 0);
    const totalFailed = filteredAccountRank.reduce((sum, a) => sum + a.failed, 0);
    const total = totalPublished + totalFailed;
    const successRate = total > 0 ? ((totalPublished / total) * 100).toFixed(1) + '%' : '0%';
    return [
      { label: '总发布任务', value: String(total), icon: BarChart3, color: 'hsl(221 83% 53%)', bg: 'bg-[hsl(221_83%_53%)]/10' },
      { label: '发布成功', value: String(totalPublished), icon: CheckCircle, color: 'hsl(130 54% 42%)', bg: 'bg-[hsl(130_54%_42%)]/10' },
      { label: '发布失败', value: String(totalFailed), icon: XCircle, color: 'hsl(2 84% 62%)', bg: 'bg-[hsl(2_84%_62%)]/10' },
      { label: '成功率', value: successRate, icon: TrendingUp, color: 'hsl(26 90% 49%)', bg: 'bg-[hsl(26_90%_49%)]/10' },
    ];
  }, [filteredAccountRank]);

  // 趋势数据（根据筛选比例缩放，保持视觉一致性）
  const scaledTrendData = useMemo(() => {
    const baseData = period === '7days' ? weeklyData : monthlyData;
    const originalTotal = 370; // 原始总任务数
    const filteredTotal = filteredStats[0] ? Number(filteredStats[0].value) : 0;
    const ratio = originalTotal > 0 ? filteredTotal / originalTotal : 0;
    if (ratio === 0) return baseData.map((d) => ({ ...d, 成功: 0, 失败: 0 }));
    return baseData.map((d) => ({
      ...d,
      成功: Math.max(0, Math.round(d.成功 * ratio)),
      失败: Math.max(0, Math.round(d.失败 * ratio)),
    }));
  }, [period, filteredStats]);

  const trendData = scaledTrendData;

  const handleExport = () => {
    const headers = ['平台', '发布成功', '发布失败', '成功率(%)'];
    const rows = platformData.map((p) => [p.platform, p.published, p.failed, p.success]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `\"${String(cell).replace(/\"/g, '\"\"')}\"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `发布统计_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return 'bg-[#FFD700] text-white';
    if (rank === 2) return 'bg-[#C0C0C0] text-white';
    if (rank === 3) return 'bg-[#CD7F32] text-white';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-4 p-4">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          <span className="text-[hsl(26_90%_49%)] font-medium">示例数据 / 演示流程</span>
          ，统计数据为前端模拟展示
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">任务统计</h1>
          <p className="text-sm text-muted-foreground mt-1">发布任务数据总览与趋势分析</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AccountSelector
            accounts={mockAccounts}
            groups={mockGroups}
            platform={platform}
            groupId={groupId}
            accountId={accountId}
            onPlatformChange={setPlatform}
            onGroupChange={setGroupId}
            onAccountChange={setAccountId}
            size="sm"
          />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">今日</SelectItem>
              <SelectItem value="7days">近 7 天</SelectItem>
              <SelectItem value="30days">近 30 天</SelectItem>
              <SelectItem value="90days">近 90 天</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <FileDown className="w-4 h-4 mr-1" />
            导出报表
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-ai-section-type="card-stat">
        {filteredStats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-xs">
                <TrendingUp className="w-3 h-3 text-[hsl(130_54%_42%)]" />
                <span className="text-[hsl(130_54%_42%)]">+12.5%</span>
                <span className="text-muted-foreground">较上周</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              发布趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey={period === '7days' ? 'day' : 'day'} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="成功" fill="var(--color-成功)" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="失败" fill="var(--color-失败)" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Platform pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              平台发布占比
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={filteredPlatformPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {filteredPlatformPie.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </RechartsPie>
              </ResponsiveContainer>
            </div>
             <div className="space-y-1.5 mt-2">
               {filteredPlatformPie.map((item) => {
                 const total = filteredPlatformPie.reduce((sum, p) => sum + p.value, 0);
                 const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
                return (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.value}</span>
                      <span className="text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform stats + Account rank */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Platform comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              各平台发布量对比
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
               {filteredPlatformData.map((p) => (
                <div key={p.platform}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-medium">{p.platform}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[hsl(130_54%_42%)]">成功 {p.published}</span>
                      <span className="text-[hsl(2_84%_62%)]">失败 {p.failed}</span>
                      <span className="text-muted-foreground">成功率 {p.success}%</span>
                    </div>
                  </div>
                  <div className="h-6 bg-muted rounded-md overflow-hidden flex">
                    <div
                      className="bg-[hsl(130_54%_42%)] flex items-center justify-end pr-2 text-xs text-white font-medium transition-all"
                      style={{ width: `${(p.published / (p.published + p.failed)) * 100}%` }}
                    >
                      {p.published}
                    </div>
                    <div
                      className="bg-[hsl(2_84%_62%)] flex items-center justify-start pl-2 text-xs text-white font-medium"
                      style={{ width: `${(p.failed / (p.published + p.failed)) * 100}%` }}
                    >
                      {p.failed}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Account rank */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[hsl(26_90%_49%)]" />
              账号发布排行
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {filteredAccountRank.slice(0, 8).map((acc) => (
                 <div key={acc.name} className="flex items-center gap-3">
                   <div
                     className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${getRankBadge(acc.rank)}`}
                   >
                     {acc.rank}
                   </div>
                   <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                     style={{ backgroundColor: acc.platformKey === 'douyin' ? 'hsl(0 0% 8%)' : acc.platformKey === 'xiaohongshu' ? 'hsl(350 85% 60%)' : acc.platformKey === 'wechat' ? 'hsl(142 45% 45%)' : 'hsl(200 90% 55%)' }}
                   >
                    {acc.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{acc.name}</div>
                    <div className="text-[10px] text-muted-foreground">{acc.platform}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{acc.published}</div>
                    <div className="text-[10px] text-muted-foreground">成功率 {acc.success}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failure reasons */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[hsl(26_90%_49%)]" />
            失败原因分布
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {failReasonData.map((item) => (
              <div key={item.name} className="border border-border rounded-lg p-3 text-center">
                <div
                  className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center"
                  style={{ backgroundColor: item.color + '20' }}
                >
                  <span className="text-sm font-bold" style={{ color: item.color }}>
                    {item.value}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{item.name}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublishStatsPage;

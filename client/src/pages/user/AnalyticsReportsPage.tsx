import { useState } from 'react';
import {
  Info,
  Download,
  Users,
  MessageSquare,
  MessageCircle,
  Heart,
  Clock,
  TrendingUp,
  Reply,
  Music,
  BookOpen,
  Video,
  Tv,
  Calendar,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import type { PlatformType } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@client/src/components/ui/card';
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
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@client/src/components/ui/tabs';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Progress } from '@client/src/components/ui/progress';
import { cn } from '@/lib/utils';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

const fanGrowthData = [
  { date: '09-22', value: 12580, newFans: 320 },
  { date: '09-23', value: 12890, newFans: 310 },
  { date: '09-24', value: 13120, newFans: 230 },
  { date: '09-25', value: 13450, newFans: 330 },
  { date: '09-26', value: 13780, newFans: 330 },
  { date: '09-27', value: 14120, newFans: 340 },
  { date: '09-28', value: 14560, newFans: 440 },
];

const interactionData = [
  { date: '09-22', likes: 2560, comments: 380, shares: 120 },
  { date: '09-23', likes: 2890, comments: 420, shares: 145 },
  { date: '09-24', likes: 3120, comments: 450, shares: 160 },
  { date: '09-25', likes: 2780, comments: 390, shares: 135 },
  { date: '09-26', likes: 3450, comments: 510, shares: 180 },
  { date: '09-27', likes: 3890, comments: 580, shares: 210 },
  { date: '09-28', likes: 4120, comments: 620, shares: 230 },
];

const platformDistribution = [
  { name: '抖音', value: 45, color: 'hsl(0 0% 8%)' },
  { name: '小红书', value: 30, color: 'hsl(350 85% 60%)' },
  { name: '视频号', value: 15, color: 'hsl(142 45% 45%)' },
  { name: 'B站', value: 10, color: 'hsl(200 90% 55%)' },
];

const reportTypes = [
  { value: 'fans', label: '粉丝报表' },
  { value: 'interaction', label: '互动报表' },
  { value: 'content', label: '内容报表' },
  { value: 'message', label: '私信报表' },
  { value: 'comment', label: '评论报表' },
];

const AnalyticsReportsPage: React.FC = () => {
  const [platformFilter, setPlatformFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('7d');
  const [reportType, setReportType] = useState('fans');

  const messageStats = [
    { label: '总私信数', value: '3,256', icon: MessageSquare, color: 'text-primary' },
    { label: '已回复', value: '2,980', icon: Reply, color: 'text-[hsl(130_54%_42%)]' },
    { label: '平均回复时长', value: '12 分钟', icon: Clock, color: 'text-[hsl(26_90%_49%)]' },
    { label: '待处理', value: '156', icon: MessageCircle, color: 'text-[hsl(2_84%_62%)]' },
  ];

  const replyRate = 92.4;

  const formatCount = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
    return n.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-info/10 border-info/30 text-info">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info">
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">数据统计报表</h1>
          <p className="text-sm text-muted-foreground mt-1">多维度数据分析报表，洞察运营效果</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4" />
            导出 Excel
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4" />
            导出 CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">平台：</span>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                {(Object.keys(platformMeta) as PlatformType[]).map((p) => (
                  <SelectItem key={p} value={p}>{platformMeta[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">账号：</span>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="全部账号" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部账号</SelectItem>
                <SelectItem value="1">美食探店小队</SelectItem>
                <SelectItem value="2">旅行日记Vlog</SelectItem>
                <SelectItem value="3">生活种草日记</SelectItem>
                <SelectItem value="4">美妆测评师</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="时间范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">近7天</SelectItem>
                <SelectItem value="30d">近30天</SelectItem>
                <SelectItem value="90d">近90天</SelectItem>
                <SelectItem value="month">本月</SelectItem>
                <SelectItem value="last_month">上月</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground whitespace-nowrap">报表类型：</span>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Report tabs */}
      <Tabs defaultValue="fans" value={reportType} onValueChange={setReportType}>
        <TabsList className="grid grid-cols-5 w-full max-w-xl">
          <TabsTrigger value="fans">粉丝增长</TabsTrigger>
          <TabsTrigger value="interaction">内容互动</TabsTrigger>
          <TabsTrigger value="message">私信效率</TabsTrigger>
          <TabsTrigger value="comment">评论回复</TabsTrigger>
          <TabsTrigger value="content">内容产出</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="fans" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">粉丝增长趋势</CardTitle>
                    <Badge variant="secondary" className="text-xs">近7天</Badge>
                  </div>
                  <CardDescription>累计粉丝数与每日新增</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={fanGrowthData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 89%)" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(218 7% 59%)" />
                        <YAxis tick={{ fontSize: 12 }} stroke="hsl(218 7% 59%)" />
                        <Tooltip
                          contentStyle={{ background: 'white', border: '1px solid hsl(220 14% 89%)', borderRadius: '8px', fontSize: '12px' }}
                          formatter={(value: number) => formatCount(value)}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line type="monotone" dataKey="value" name="累计粉丝" stroke="hsl(221 83% 53%)" strokeWidth={2} dot={{ fill: 'hsl(221 83% 53%)', r: 4 }} />
                        <Line type="monotone" dataKey="newFans" name="每日新增" stroke="hsl(130 54% 42%)" strokeWidth={2} dot={{ fill: 'hsl(130 54% 42%)', r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">平台粉丝分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={platformDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {platformDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'white', border: '1px solid hsl(220 14% 89%)', borderRadius: '8px', fontSize: '12px' }}
                          formatter={(value: number) => `${value}%`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 mt-2">
                    {platformDistribution.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-foreground">{item.name}</span>
                        </div>
                        <span className="font-medium">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="interaction" className="mt-0">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">内容互动报表</CardTitle>
                <CardDescription>点赞、评论、转发数据统计</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={interactionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 89%)" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(218 7% 59%)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(218 7% 59%)" />
                      <Tooltip
                        contentStyle={{ background: 'white', border: '1px solid hsl(220 14% 89%)', borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="likes" name="点赞" fill="hsl(221 83% 53%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="comments" name="评论" fill="hsl(350 85% 60%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="shares" name="转发" fill="hsl(142 45% 45%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="message" className="mt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {messageStats.map((stat, index: number) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                      <stat.icon className={cn('w-4 h-4', stat.color)} />
                    </div>
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="comment" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">评论回复率</CardTitle>
                  <CardDescription>整体评论回复情况</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="relative w-40 h-40">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="hsl(220 14% 89%)"
                          strokeWidth="8"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="hsl(221 83% 53%)"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${replyRate * 2.51} 251`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-3xl font-bold text-foreground">{replyRate}%</div>
                        <div className="text-xs text-muted-foreground">回复率</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">总评论数</span>
                        <span className="font-medium">8,620</span>
                      </div>
                      <Progress value={100} />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">已回复</span>
                        <span className="font-medium text-[hsl(130_54%_42%)]">7,965</span>
                      </div>
                      <Progress value={replyRate} />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">待回复</span>
                        <span className="font-medium text-[hsl(2_84%_62%)]">655</span>
                      </div>
                      <Progress value={7.6} className="[&>div]:bg-[hsl(2_84%_62%)]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">回复效率</CardTitle>
                  <CardDescription>评论处理效率数据</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">平均回复时长</div>
                      <div className="text-2xl font-bold text-primary">25 分钟</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">24h内回复率</div>
                      <div className="text-2xl font-bold text-[hsl(130_54%_42%)]">94.2%</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">最快回复</div>
                      <div className="text-2xl font-bold text-foreground">1 分钟</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">最慢回复</div>
                      <div className="text-2xl font-bold text-[hsl(2_84%_62%)]">5 小时</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="content" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">内容产出报表</CardTitle>
                <CardDescription>发布内容数量与质量分析</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">发布总数</div>
                    <div className="text-2xl font-bold text-foreground">856</div>
                    <div className="text-xs text-[hsl(130_54%_42%)] mt-0.5">+12 本周</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">总阅读量</div>
                    <div className="text-2xl font-bold text-primary">126.8w</div>
                    <div className="text-xs text-[hsl(130_54%_42%)] mt-0.5">+8.5% 周增</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">平均互动率</div>
                    <div className="text-2xl font-bold text-[hsl(130_54%_42%)]">4.8%</div>
                    <div className="text-xs text-muted-foreground mt-0.5">高于行业均值</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-xs text-muted-foreground mb-1">爆款内容</div>
                    <div className="text-2xl font-bold text-[hsl(26_90%_49%)]">12</div>
                    <div className="text-xs text-muted-foreground mt-0.5">10w+ 播放/阅读</div>
                  </div>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={interactionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 89%)" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(218 7% 59%)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(218 7% 59%)" />
                      <Tooltip
                        contentStyle={{ background: 'white', border: '1px solid hsl(220 14% 89%)', borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="likes" name="互动量" fill="hsl(221 83% 53%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default AnalyticsReportsPage;

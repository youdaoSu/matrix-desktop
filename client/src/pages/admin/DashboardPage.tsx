import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Crown,
  Clock,
  KeyRound,
  Link2,
  Send,
  UserPlus,
  AlertTriangle,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Music2,
  BookOpen,
  Video,
  Zap,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { AdminDashboardStats, AppUser, OperationLog, PlatformType } from '@shared/api.interface';

const mockStats: AdminDashboardStats & {
  todayNewVip: number;
  expiredCount: number;
  unusedCodes: number;
  todayNewAccounts: number;
  todayPosts: number;
  successRate: number;
  todayNewFollowers: number;
  followerGrowthRate: number;
  pendingTasks: number;
  violationAlerts: number;
} = {
  totalUsers: 12846,
  activeVipUsers: 3527,
  todayNewUsers: 128,
  todayNewVip: 42,
  expiringSoon: 186,
  expiredCount: 53,
  totalCodes: 10000,
  usedCodes: 6284,
  unusedCodes: 3716,
  totalAccounts: 28934,
  todayNewAccounts: 86,
  todayPosts: 342,
  successRate: 94.2,
  todayNewFollowers: 2156,
  followerGrowthRate: 12.5,
  pendingTasks: 18,
  violationAlerts: 7,
};

const mockGrowthData = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const base = 80 + i * 2;
  return {
    date: `${date.getMonth() + 1}/${date.getDate()}`,
    newUsers: base + Math.floor(Math.random() * 40),
    activeUsers: Math.floor(base * 2.8 + Math.random() * 60),
  };
});

const mockVipDistribution = [
  { name: '月度会员', value: 1280, color: 'hsl(221 83% 65%)' },
  { name: '季度会员', value: 945, color: 'hsl(221 83% 53%)' },
  { name: '年度会员', value: 1052, color: 'hsl(221 83% 42%)' },
  { name: '企业/终身版', value: 250, color: 'hsl(26 90% 49%)' },
];

const mockPlatformStats: { platform: PlatformType; name: string; count: number; icon: typeof Music2; color: string }[] = [
  { platform: 'douyin', name: '抖音', count: 12450, icon: Music2, color: 'hsl(340 85% 55%)' },
  { platform: 'xiaohongshu', name: '小红书', count: 8320, icon: BookOpen, color: 'hsl(350 85% 60%)' },
  { platform: 'wechat', name: '视频号', count: 4860, icon: Video, color: 'hsl(142 45% 45%)' },
  { platform: 'bilibili', name: 'B站', count: 3304, icon: Zap, color: 'hsl(200 90% 55%)' },
];

const mockRecentUsers: (AppUser & { avatarFallback: string })[] = [
  { id: 'u1', username: 'creator_zhang', email: 'zhang@example.com', nickname: '张同学', avatarFallback: 'ZC', vipStatus: 'active', vipPlanName: '年度会员', maxAccounts: 20, status: 'active', createdAt: '2026-09-28 09:12' },
  { id: 'u2', username: 'lisa_wang', email: 'lisa@example.com', nickname: 'Lisa Wang', avatarFallback: 'LW', vipStatus: 'inactive', vipPlanName: '', maxAccounts: 1, status: 'active', createdAt: '2026-09-28 08:45' },
  { id: 'u3', username: 'mr_chen', email: 'chen@example.com', nickname: '陈先生', avatarFallback: 'MC', vipStatus: 'active', vipPlanName: '季度会员', maxAccounts: 10, status: 'active', createdAt: '2026-09-28 07:30' },
  { id: 'u4', username: 'yoyo_liu', email: 'yoyo@example.com', nickname: '优优', avatarFallback: 'YL', vipStatus: 'active', vipPlanName: '月度会员', maxAccounts: 5, status: 'active', createdAt: '2026-09-28 06:18' },
  { id: 'u5', username: 'tech_zhao', email: 'zhao@example.com', nickname: '老赵说科技', avatarFallback: 'TZ', vipStatus: 'expired', vipPlanName: '年度会员', maxAccounts: 20, status: 'active', createdAt: '2026-09-28 05:02' },
];

const mockRecentLogs: OperationLog[] = [
  { id: 'l1', operatorType: 'admin', operatorName: 'admin', action: '生成授权码', targetType: 'activation_code', detail: '批量生成 100 张月度卡密', createdAt: '2026-09-28 09:30' },
  { id: 'l2', operatorType: 'admin', operatorName: 'admin', action: '更新套餐', targetType: 'vip_plan', detail: '年度会员价格调整为 899 元', createdAt: '2026-09-28 09:15' },
  { id: 'l3', operatorType: 'user', operatorName: 'creator_zhang', action: '激活授权码', targetType: 'activation_code', detail: '激活年度会员授权码', createdAt: '2026-09-28 09:12' },
  { id: 'l4', operatorType: 'admin', operatorName: 'admin', action: '禁用用户', targetType: 'app_user', detail: '账号 user_xyz 因违规被禁用', createdAt: '2026-09-28 08:50' },
  { id: 'l5', operatorType: 'admin', operatorName: 'admin', action: '修改系统配置', targetType: 'system_setting', detail: '更新敏感词库配置', createdAt: '2026-09-28 08:30' },
  { id: 'l6', operatorType: 'user', operatorName: 'lisa_wang', action: '用户注册', targetType: 'app_user', detail: '新用户注册成功', createdAt: '2026-09-28 08:45' },
  { id: 'l7', operatorType: 'admin', operatorName: 'operator_li', action: '审核模板', targetType: 'message_template', detail: '通过消息模板「欢迎语v2」', createdAt: '2026-09-28 08:20' },
  { id: 'l8', operatorType: 'admin', operatorName: 'admin', action: '删除授权码', targetType: 'activation_code', detail: '删除批次 B20260920 全部卡密', createdAt: '2026-09-28 07:55' },
  { id: 'l9', operatorType: 'user', operatorName: 'mr_chen', action: '绑定账号', targetType: 'platform_account', detail: '绑定抖音账号「陈先生」', createdAt: '2026-09-28 07:30' },
  { id: 'l10', operatorType: 'admin', operatorName: 'admin', action: '登录系统', targetType: 'admin_user', detail: '管理员登录后台', createdAt: '2026-09-28 07:00' },
];

interface StatCardProps {
  icon: typeof Users;
  label: string;
  value: number | string;
  delta: number | string;
  deltaLabel: string;
  deltaPositive?: boolean;
  colorClass: string;
  bgClass: string;
}

function StatCard({ icon: Icon, label, value, delta, deltaLabel, deltaPositive = true, colorClass, bgClass }: StatCardProps) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 rounded-lg ${bgClass} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${colorClass}`} />
          </div>
          <div className="flex items-center gap-1 text-xs">
            {deltaPositive ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            )}
            <span className={deltaPositive ? 'text-emerald-600' : 'text-red-500'}>
              {delta}
            </span>
            <span className="text-muted-foreground">{deltaLabel}</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <div className="text-sm text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const todayStr = useMemo(() => {
    const d = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
  }, []);

  const totalPlatformAccounts = mockPlatformStats.reduce((sum: number, p) => sum + p.count, 0);

  // Bar chart calculation
  const chartWidth = 560;
  const chartHeight = 260;
  const padding = { top: 24, right: 16, bottom: 28, left: 40 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;
  const maxVal = Math.max(...mockGrowthData.map((d) => d.activeUsers));
  const yMax = Math.ceil(maxVal / 50) * 50;
  const barGroupWidth = innerW / mockGrowthData.length;
  const barWidth = Math.max(4, (barGroupWidth - 6) / 2);
  const yTicks = 5;

  // Donut chart calculation
  const donutSize = 200;
  const donutStroke = 24;
  const donutRadius = (donutSize - donutStroke) / 2;
  const donutCenter = donutSize / 2;
  const donutTotal = mockVipDistribution.reduce((s: number, d) => s + d.value, 0);
  let cumulativeAngle = -Math.PI / 2;
  const donutSegments = mockVipDistribution.map((d) => {
    const angle = (d.value / donutTotal) * Math.PI * 2;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    const endAngle = cumulativeAngle;
    const x1 = donutCenter + donutRadius * Math.cos(startAngle);
    const y1 = donutCenter + donutRadius * Math.sin(startAngle);
    const x2 = donutCenter + donutRadius * Math.cos(endAngle);
    const y2 = donutCenter + donutRadius * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return {
      ...d,
      path: `M ${x1} ${y1} A ${donutRadius} ${donutRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
    };
  });

  const getVipBadgeVariant = (status: string) => {
    if (status === 'active') return 'default';
    if (status === 'expired') return 'destructive';
    return 'outline';
  };

  const getVipBadgeText = (status: string) => {
    if (status === 'active') return 'VIP';
    if (status === 'expired') return '已过期';
    return '未激活';
  };

  return (
    <div className="space-y-6">
      {/* 顶部欢迎区 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">早上好，管理员</h1>
          <p className="text-sm text-muted-foreground mt-1">{todayStr} · 欢迎回到运营总览</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            导出报表
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      {/* 8 个核心指标卡 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="注册用户总数"
          value={mockStats.totalUsers.toLocaleString()}
          delta={`+${mockStats.todayNewUsers}`}
          deltaLabel="今日新增"
          deltaPositive
          colorClass="text-blue-600"
          bgClass="bg-blue-50 dark:bg-blue-950"
        />
        <StatCard
          icon={Crown}
          label="有效 VIP 用户"
          value={mockStats.activeVipUsers.toLocaleString()}
          delta={`+${mockStats.todayNewVip}`}
          deltaLabel="今日激活"
          deltaPositive
          colorClass="text-blue-600"
          bgClass="bg-blue-50 dark:bg-blue-950"
        />
        <StatCard
          icon={Clock}
          label="即将到期（7天内）"
          value={mockStats.expiringSoon}
          delta={`${mockStats.expiredCount}`}
          deltaLabel="已过期"
          deltaPositive={false}
          colorClass="text-orange-600"
          bgClass="bg-orange-50 dark:bg-orange-950"
        />
        <StatCard
          icon={KeyRound}
          label="授权码总数"
          value={mockStats.totalCodes.toLocaleString()}
          delta={`${mockStats.unusedCodes}`}
          deltaLabel={`未使用 / ${mockStats.usedCodes.toLocaleString()} 已用`}
          deltaPositive
          colorClass="text-purple-600"
          bgClass="bg-purple-50 dark:bg-purple-950"
        />
        <StatCard
          icon={Link2}
          label="绑定账号总数"
          value={mockStats.totalAccounts.toLocaleString()}
          delta={`+${mockStats.todayNewAccounts}`}
          deltaLabel="今日新增"
          deltaPositive
          colorClass="text-cyan-600"
          bgClass="bg-cyan-50 dark:bg-cyan-950"
        />
        <StatCard
          icon={Send}
          label="今日发布数"
          value={mockStats.todayPosts}
          delta={`${mockStats.successRate}%`}
          deltaLabel="成功率"
          deltaPositive
          colorClass="text-orange-600"
          bgClass="bg-orange-50 dark:bg-orange-950"
        />
        <StatCard
          icon={UserPlus}
          label="今日新增粉丝"
          value={mockStats.todayNewFollowers.toLocaleString()}
          delta={`+${mockStats.followerGrowthRate}%`}
          deltaLabel="增长率"
          deltaPositive
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50 dark:bg-emerald-950"
        />
        <StatCard
          icon={AlertTriangle}
          label="待处理事项"
          value={mockStats.pendingTasks}
          delta={`${mockStats.violationAlerts}`}
          deltaLabel="违规提醒"
          deltaPositive={false}
          colorClass="text-red-600"
          bgClass="bg-red-50 dark:bg-red-950"
        />
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 用户增长趋势图 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">用户增长趋势（近 30 天）</CardTitle>
            <div className="flex items-center gap-4 text-xs mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                <span className="text-muted-foreground">新增用户</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
                <span className="text-muted-foreground">活跃用户</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible">
              {/* Y 轴网格线 + 标签 */}
              {Array.from({ length: yTicks + 1 }, (_, i) => {
                const y = padding.top + (innerH / yTicks) * i;
                const val = Math.round(yMax - (yMax / yTicks) * i);
                return (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      stroke="hsl(220 14% 89%)"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="hsl(220 9% 46%)"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* X 轴标签 */}
              {mockGrowthData.filter((_, i) => i % 5 === 0).map((d, idx) => {
                const actualIndex = idx * 5;
                const x = padding.left + actualIndex * barGroupWidth + barGroupWidth / 2;
                return (
                  <text
                    key={d.date}
                    x={x}
                    y={chartHeight - padding.bottom + 18}
                    textAnchor="middle"
                    fontSize="10"
                    fill="hsl(220 9% 46%)"
                  >
                    {d.date}
                  </text>
                );
              })}

              {/* 柱状图 */}
              {mockGrowthData.map((d, i) => {
                const baseX = padding.left + i * barGroupWidth;
                const newH = (d.newUsers / yMax) * innerH;
                const activeH = (d.activeUsers / yMax) * innerH;
                const newY = padding.top + innerH - newH;
                const activeY = padding.top + innerH - activeH;
                return (
                  <g key={i}>
                    <rect
                      x={baseX + 2}
                      y={newY}
                      width={barWidth}
                      height={newH}
                      fill="hsl(221 83% 65%)"
                      rx={2}
                    />
                    <rect
                      x={baseX + 4 + barWidth}
                      y={activeY}
                      width={barWidth}
                      height={activeH}
                      fill="hsl(130 54% 52%)"
                      rx={2}
                    />
                  </g>
                );
              })}
            </svg>
          </CardContent>
        </Card>

        {/* VIP 套餐分布 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">VIP 套餐分布</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center gap-6">
              <div className="relative flex-shrink-0">
                <svg width={donutSize} height={donutSize}>
                  {/* 背景环 */}
                  <circle
                    cx={donutCenter}
                    cy={donutCenter}
                    r={donutRadius}
                    fill="none"
                    stroke="hsl(220 14% 96%)"
                    strokeWidth={donutStroke}
                  />
                  {/* 分段 */}
                  {donutSegments.map((seg) => (
                    <path
                      key={seg.name}
                      d={seg.path}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={donutStroke}
                      strokeLinecap="butt"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold text-foreground">{donutTotal.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">VIP 用户</div>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                {mockVipDistribution.map((seg) => {
                  const pct = ((seg.value / donutTotal) * 100).toFixed(1);
                  return (
                    <div key={seg.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-sm inline-block"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="text-sm text-foreground">{seg.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">{seg.value}</div>
                        <div className="text-xs text-muted-foreground">{pct}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 平台账号分布 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">平台账号分布</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-4 gap-4">
            {mockPlatformStats.map((p) => {
              const pct = ((p.count / totalPlatformAccounts) * 100).toFixed(1);
              const Icon = p.icon;
              return (
                <div key={p.platform} className="p-4 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{p.name}</div>
                      <div className="text-xs text-muted-foreground">平台账号</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-bold text-foreground">{p.count.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">占 {pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 下方两栏 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 最近注册用户 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">最近注册用户</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockRecentUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                          {u.avatarFallback}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground">{u.nickname || u.username}</div>
                          <div className="text-xs text-muted-foreground">@{u.username}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.createdAt}</TableCell>
                    <TableCell>
                      <Badge variant={getVipBadgeVariant(u.vipStatus)} className="text-[10px]">
                        {getVipBadgeText(u.vipStatus)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 最近操作日志 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">最近操作日志</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>操作人</TableHead>
                  <TableHead>动作</TableHead>
                  <TableHead>结果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockRecentLogs.slice(0, 10).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{log.createdAt}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {log.operatorType === 'admin' ? '管理员' : '用户'}
                        </Badge>
                        <span className="text-foreground">{log.operatorName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      <div>{log.action}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">{log.detail}</div>
                    </TableCell>
                    <TableCell>
                      {log.operatorType === 'user' && log.action === '用户注册' ? (
                        <div className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span className="text-xs">成功</span>
                        </div>
                      ) : log.action.includes('禁用') || log.action.includes('删除') ? (
                        <div className="flex items-center gap-1 text-orange-600">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span className="text-xs">处理中</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span className="text-xs">成功</span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <div className="px-4 py-2 border-t text-xs text-muted-foreground text-right">
            共 {mockRecentLogs.length} 条记录
          </div>
        </Card>
      </div>
    </div>
  );
}

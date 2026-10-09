import { useState, useMemo } from 'react';
import {
  Info,
  AlertTriangle,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Filter,
  Zap,
  Timer,
  Activity,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@client/src/components/ui/alert';
import { Progress } from '@client/src/components/ui/progress';
import { cn } from '@/lib/utils';

interface LogItem {
  id: string;
  time: string;
  taskName: string;
  type: 'keyword_reply' | 'monitor_task' | 'welcome' | 'offline' | 'timeout' | 'auto_message';
  typeLabel: string;
  triggerObject: string;
  action: string;
  result: 'success' | 'failed';
  duration: number;
  failReason?: string;
  account: string;
}

const typeLabels: Record<string, string> = {
  keyword_reply: '关键词回复',
  monitor_task: '监控任务',
  welcome: '关注欢迎语',
  offline: '离线回复',
  timeout: '超时回复',
  auto_message: '主动私信',
};

const failReasonLabels: Record<string, string> = {
  frequency_limit: '发送过于频繁（触发频控）',
  need_mutual_follow: '需双方互关才能发送私信',
  private_account: '对方为隐私账号',
  out_of_window: '不在平台允许的会话窗口内',
  content_blocked: '内容被平台拦截',
  auth_error: '账号授权异常',
  unknown: '未知错误',
};

const generateMockLogs = (): LogItem[] => {
  const types = ['keyword_reply', 'monitor_task', 'welcome', 'offline', 'timeout', 'auto_message'] as const;
  const tasks = [
    '店铺地址询问',
    '价格咨询自动回复',
    '新粉自动欢迎',
    '评论区求链接',
    '离线自动回复',
    '私信合作引导',
    '售后客服',
    '负面评论监控',
    '新品上市图',
    '预约咨询',
  ];
  const users = ['小甜心', '阳光少年', '爱吃鱼的猫', '柠檬不萌', '追梦人', '清风徐来', '大海无量', '云淡风轻', '月下独酌', '星星点灯'];
  const actions = ['回复私信', '回复评论', '发送图片', '发送图文', '发送链接'];
  const failReasons = ['frequency_limit', 'need_mutual_follow', 'content_blocked', 'out_of_window', 'auth_error', ''];

  const logs: LogItem[] = [];
  const now = new Date();

  for (let i = 0; i < 50; i++) {
    const isFailed = Math.random() < 0.2;
    const failReason = isFailed ? failReasons[Math.floor(Math.random() * 5)] : undefined;
    const type = types[Math.floor(Math.random() * types.length)];
    const time = new Date(now.getTime() - i * Math.floor(Math.random() * 300000 + 60000));

    logs.push({
      id: `log-${i}`,
      time: time.toLocaleString('zh-CN', { hour12: false }),
      taskName: tasks[Math.floor(Math.random() * tasks.length)],
      type,
      typeLabel: typeLabels[type],
      triggerObject: users[Math.floor(Math.random() * users.length)],
      action: actions[Math.floor(Math.random() * actions.length)],
      result: isFailed ? 'failed' : 'success',
      duration: Math.floor(Math.random() * 5000) + 200,
      failReason,
      account: ['美食探店小队', '生活种草日记', '科技UP主', '品牌官方号'][Math.floor(Math.random() * 4)],
    });
  }

  return logs;
};

const mockLogs = generateMockLogs();

const AutomationLogsPage = () => {
  const [typeFilter, setTypeFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filteredLogs = useMemo(() => {
    return mockLogs.filter((log) => {
      if (typeFilter !== 'all' && log.type !== typeFilter) return false;
      if (resultFilter !== 'all' && log.result !== resultFilter) return false;
      if (taskFilter !== 'all' && log.taskName !== taskFilter) return false;
      if (search && !log.taskName.includes(search) && !log.triggerObject.includes(search)) return false;
      return true;
    });
  }, [typeFilter, resultFilter, taskFilter, search]);

  const total = filteredLogs.length;
  const successCount = filteredLogs.filter((l) => l.result === 'success').length;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;
  const avgDuration =
    total > 0 ? Math.round(filteredLogs.reduce((sum, l) => sum + l.duration, 0) / total) : 0;

  const paginatedLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(total / pageSize);

  const taskNames = [...new Set(mockLogs.map((l) => l.taskName))];

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <Info className="w-4 h-4" />
        <AlertDescription>当前为示例数据演示 - 绑定真实平台账号后将同步真实数据</AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">运行日志</h1>
          <p className="text-sm text-muted-foreground mt-1">自动化任务执行记录与效果统计</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-ai-section-type="card-stat">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">总执行数</span>
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{total.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">累计自动化执行次数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">成功率</span>
              <CheckCircle className="w-4 h-4 text-[hsl(130_54%_42%)]" />
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-bold text-foreground">{successRate}%</span>
              <span className="text-xs text-[hsl(130_54%_42%)] flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />
                +2.1%
              </span>
            </div>
            <Progress value={successRate} className="h-1.5 [&>div]:bg-[hsl(130_54%_42%)]" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">平均耗时</span>
              <Timer className="w-4 h-4 text-[hsl(26_90%_49%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{avgDuration}ms</div>
            <div className="text-xs text-muted-foreground">单次执行平均响应时间</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">今日执行</span>
              <Zap className="w-4 h-4 text-[hsl(130_54%_42%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{total}</div>
            <div className="text-xs text-[hsl(130_54%_42%)]">+12.5% 较昨日</div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索任务名称/触发对象"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {Object.entries(typeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resultFilter} onValueChange={(v) => { setResultFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="全部结果" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部结果</SelectItem>
            <SelectItem value="success">成功</SelectItem>
            <SelectItem value="failed">失败</SelectItem>
          </SelectContent>
        </Select>
        <Select value={taskFilter} onValueChange={(v) => { setTaskFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="全部任务" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部任务</SelectItem>
            {taskNames.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto">
          <Download className="w-4 h-4 mr-1" />
          导出日志
        </Button>
      </div>

      {/* 日志列表 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>任务/规则名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>触发对象</TableHead>
                <TableHead>执行账号</TableHead>
                <TableHead>执行动作</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead>失败原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{log.time}</TableCell>
                  <TableCell className="font-medium">{log.taskName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] h-5">{log.typeLabel}</Badge>
                  </TableCell>
                  <TableCell>{log.triggerObject}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{log.account}</TableCell>
                  <TableCell className="text-sm">{log.action}</TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        log.result === 'success'
                          ? 'bg-[hsl(130_54%_42%)] text-white'
                          : 'bg-[hsl(2_84%_62%)] text-white'
                      )}
                    >
                      {log.result === 'success' ? '成功' : '失败'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{log.duration}ms</TableCell>
                  <TableCell>
                    {log.failReason ? (
                      <Badge variant="outline" className="text-[10px] h-5 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30 max-w-[200px] truncate">
                        {failReasonLabels[log.failReason] || log.failReason}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {paginatedLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    暂无符合条件的日志
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            共 {total} 条记录，第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum = i + 1;
              if (totalPages > 5 && page > 3) {
                pageNum = Math.min(page - 2 + i, totalPages - 4 + i > 0 ? page - 2 + i : i + 1);
                pageNum = Math.min(Math.max(page - 2 + i, 1), totalPages);
              }
              if (pageNum < 1 || pageNum > totalPages) return null;
              return (
                <Button
                  key={pageNum}
                  size="sm"
                  variant={page === pageNum ? 'default' : 'outline'}
                  onClick={() => setPage(pageNum)}
                  className="w-8 h-8 p-0"
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationLogsPage;

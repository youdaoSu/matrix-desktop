import { useState } from 'react';
import {
  Layers,
  AlertTriangle,
  Check,
  MessageCircle,
  ThumbsUp,
  Tag,
  Play,
  Pause,
  Clock,
  CheckCircle,
  XCircle,
  Download,
  Filter,
  Search,
} from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@client/src/components/ui/alert';
import { Card, CardContent } from '@client/src/components/ui/card';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@client/src/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import { Progress } from '@client/src/components/ui/progress';

const mockTasks = [
  { id: 'bt1', name: '国庆活动评论批量回复', type: 'reply', total: 300, completed: 180, status: 'running', account: '美食探店小队', platform: 'douyin', createdAt: '2026-09-28 10:00' },
  { id: 'bt2', name: '全平台新评论点赞', type: 'like', total: 500, completed: 500, status: 'completed', account: '全部账号', platform: 'all', createdAt: '2026-09-27 09:00' },
  { id: 'bt3', name: '粉丝标签批量打标', type: 'tag', total: 800, completed: 320, status: 'paused', account: '生活种草日记', platform: 'xiaohongshu', createdAt: '2026-09-26 14:00' },
  { id: 'bt4', name: '历史评论标记已读', type: 'read', total: 1200, completed: 1200, status: 'completed', account: '科技宅频道', platform: 'bilibili', createdAt: '2026-09-25 20:00' },
  { id: 'bt5', name: '双十一种草评论回复', type: 'reply', total: 600, completed: 0, status: 'pending', account: '生活种草日记', platform: 'xiaohongshu', createdAt: '2026-09-28 08:00' },
];

const typeLabels: Record<string, { label: string; icon: any; color: string }> = {
  reply: { label: '批量回复', icon: MessageCircle, color: 'text-primary' },
  like: { label: '批量点赞', icon: ThumbsUp, color: 'text-[hsl(350_85%_60%)]' },
  tag: { label: '批量打标签', icon: Tag, color: 'text-[hsl(26_90%_49%)]' },
  read: { label: '标记已读', icon: CheckCircle, color: 'text-[hsl(130_54%_42%)]' },
};

const statusLabels: Record<string, { label: string; variant: string }> = {
  running: { label: '执行中', variant: 'default' },
  completed: { label: '已完成', variant: 'secondary' },
  paused: { label: '已暂停', variant: 'outline' },
  pending: { label: '等待中', variant: 'outline' },
  failed: { label: '失败', variant: 'destructive' },
};

const EngageBatchTasksPage = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredTasks = mockTasks.filter((t) => {
    if (activeTab !== 'all' && t.type !== activeTab) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchText && !t.name.includes(searchText)) return false;
    return true;
  });

  const summaryStats = {
    total: mockTasks.length,
    running: mockTasks.filter((t) => t.status === 'running').length,
    completed: mockTasks.filter((t) => t.status === 'completed').length,
  };

  return (
    <div className="p-0 space-y-4">
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle>合规警示</AlertTitle>
        <AlertDescription className="text-xs">
          使用批量功能时请严格遵守各平台社区规范，合理控制操作频率，避免触发平台风控机制。批量操作均受平台频控限制。
        </AlertDescription>
      </Alert>

      <Alert variant="warning">
        <AlertTriangle className="w-4 h-4" />
        <AlertDescription>
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">批量任务</h1>
          <Badge variant="secondary">{summaryStats.total} 个任务</Badge>
        </div>
        <Button className="gap-1">
          <Layers className="w-4 h-4" />
          新建批量任务
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4" data-ai-section-type="card-stat">
        {[
          { label: '总任务数', value: summaryStats.total, icon: Layers, color: 'text-primary' },
          { label: '执行中', value: summaryStats.running, icon: Play, color: 'text-[hsl(26_90%_49%)]' },
          { label: '已完成', value: summaryStats.completed, icon: CheckCircle, color: 'text-[hsl(130_54%_42%)]' },
          { label: '今日处理量', value: '2,850', icon: Check, color: 'text-[hsl(200_90%_55%)]' },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="reply">批量回复</TabsTrigger>
              <TabsTrigger value="like">批量点赞</TabsTrigger>
              <TabsTrigger value="tag">批量打标</TabsTrigger>
              <TabsTrigger value="read">标记已读</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索任务名称"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="running">执行中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="paused">已暂停</SelectItem>
              <SelectItem value="pending">等待中</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Task List */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务名称</TableHead>
                <TableHead className="w-[100px]">类型</TableHead>
                <TableHead className="w-[140px]">账号</TableHead>
                <TableHead className="w-[200px]">进度</TableHead>
                <TableHead className="w-[80px]">总数</TableHead>
                <TableHead className="w-[80px]">状态</TableHead>
                <TableHead className="w-[140px]">创建时间</TableHead>
                <TableHead className="text-right w-[180px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => {
                const typeInfo = typeLabels[task.type];
                const statusInfo = statusLabels[task.status];
                const progress = Math.round((task.completed / task.total) * 100);
                const TypeIcon = typeInfo.icon;
                return (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.name}</TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1.5 text-sm ${typeInfo.color}`}>
                        <TypeIcon className="w-4 h-4" />
                        {typeInfo.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{task.account}</span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress value={progress} className="h-1.5" />
                        <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                          <span>{task.completed} / {task.total}</span>
                          <span>{progress}%</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{task.total}</TableCell>
                    <TableCell>
                      <Badge
                        variant={statusInfo.variant as any}
                        className="text-xs"
                      >
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {task.createdAt}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {task.status === 'running' ? (
                          <Button variant="outline" size="sm" className="h-7 gap-1">
                            <Pause className="w-3.5 h-3.5" />
                            暂停
                          </Button>
                        ) : task.status === 'paused' || task.status === 'pending' ? (
                          <Button variant="outline" size="sm" className="h-7 gap-1">
                            <Play className="w-3.5 h-3.5" />
                            启动
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 gap-1">
                            <Download className="w-3.5 h-3.5" />
                            导出
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default EngageBatchTasksPage;

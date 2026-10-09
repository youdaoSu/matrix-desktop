import { useState } from 'react';
import {
  AlertTriangle,
  Plus,
  Edit3,
  Trash2,
  Settings,
  Bell,
  TrendingUp,
  TrendingDown,
  Users,
  BarChart3,
  MoreHorizontal,
  Eye,
  AlertCircle,
  MessageCircle,
  MessageSquare,
  UserPlus,
  Check,
  X as XIcon,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import type { MonitorTask, MonitorHitRecord, MonitorType } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Switch } from '@client/src/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@client/src/components/ui/tabs';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import { Label } from '@client/src/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import {
  mockMonitorTasks,
  mockMonitorHitRecords,
  mockAccounts,
  platformMeta,
} from './engage-data';

const monitorTypeMeta: Record<MonitorType, { label: string; icon: any; color: string }> = {
  new_follower: { label: '新粉丝监控', icon: UserPlus, color: 'hsl(130 54% 42%)' },
  message_keyword: { label: '私信关键词', icon: MessageCircle, color: 'hsl(26 90% 49%)' },
  comment_keyword: { label: '评论关键词', icon: MessageSquare, color: 'hsl(221 83% 53%)' },
};

const EngageFollowerMonitorPage = () => {
  const [tasks, setTasks] = useState<MonitorTask[]>(mockMonitorTasks);
  const [typeFilter, setTypeFilter] = useState<MonitorType | 'all'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<MonitorTask | null>(null);
  const [formType, setFormType] = useState<MonitorType>('new_follower');
  const [formName, setFormName] = useState('');
  const [formAccount, setFormAccount] = useState('1');
  const [formKeyword, setFormKeyword] = useState('');
  const [formKeywords, setFormKeywords] = useState<string[]>([]);
  const [formMatchMode, setFormMatchMode] = useState<'exact' | 'contains' | 'fuzzy'>('contains');
  const [formActionContent, setFormActionContent] = useState('');
  const [formNotify, setFormNotify] = useState(true);
  const [formFreqHour, setFormFreqHour] = useState(60);
  const [formFreqDay, setFormFreqDay] = useState(500);
  const [editMode, setEditMode] = useState(false);

  const filteredTasks = tasks.filter((t) => {
    if (typeFilter !== 'all' && t.monitorType !== typeFilter) return false;
    return true;
  });

  const handleToggle = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isEnabled: !t.isEnabled } : t))
    );
  };

  const handleViewDetail = (task: MonitorTask) => {
    setCurrentTask(task);
    setDetailDialogOpen(true);
  };

  const handleCreate = () => {
    setEditMode(false);
    setFormName('');
    setFormAccount('1');
    setFormType('new_follower');
    setFormKeywords([]);
    setFormKeyword('');
    setFormMatchMode('contains');
    setFormActionContent('');
    setFormNotify(true);
    setFormFreqHour(60);
    setFormFreqDay(500);
    setCreateDialogOpen(true);
  };

  const handleEdit = (task: MonitorTask) => {
    setEditMode(true);
    setCurrentTask(task);
    setFormName(task.taskName);
    setFormType(task.monitorType);
    setFormAccount(task.monitoredAccountIds[0] || '1');
    setFormKeywords(task.keywords);
    setFormMatchMode(task.matchMode);
    setFormActionContent(task.actionContent || '');
    setFormNotify(true);
    setFormFreqHour(task.frequencyLimitHour);
    setFormFreqDay(task.frequencyLimitDay);
    setCreateDialogOpen(true);
  };

  const handleAddKeyword = () => {
    if (!formKeyword.trim() || formKeywords.includes(formKeyword.trim())) return;
    setFormKeywords([...formKeywords, formKeyword.trim()]);
    setFormKeyword('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setFormKeywords(formKeywords.filter((k) => k !== kw));
  };

  // Hit records for current task
  const currentTaskHits = currentTask
    ? mockMonitorHitRecords.filter((r) => r.taskId === currentTask.id)
    : [];

  // Trend chart
  const trendOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: ['09-22', '09-23', '09-24', '09-25', '09-26', '09-27', '09-28'],
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        name: '命中次数',
        type: 'line',
        smooth: true,
        data: [85, 102, 93, 128, 156, 110, 145],
        itemStyle: { color: 'hsl(221 83% 53%)' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'hsl(221 83% 53% / 20%)' },
              { offset: 1, color: 'hsl(221 83% 53% / 2%)' },
            ],
          },
        },
      },
    ],
    legend: { data: ['命中次数'], bottom: 0, textStyle: { fontSize: 10 } },
  };

  const hitTypeStats = {
    new_follower: mockMonitorHitRecords.filter((r) => r.monitorType === 'new_follower').length,
    message_keyword: mockMonitorHitRecords.filter((r) => r.monitorType === 'message_keyword').length,
    comment_keyword: mockMonitorHitRecords.filter((r) => r.monitorType === 'comment_keyword').length,
  };

  return (
    <div className="p-0 space-y-4">
      {/* Compliance warning */}
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-destructive">合规使用声明</p>
          <p className="text-xs text-destructive/80 mt-1">
            监控与自动回复功能仅用于您自有矩阵账号下的互动场景，所有自动回复操作受平台接口调用配额限制。
            禁止用于骚扰用户、发送营销广告或突破平台规则的场景，关键词设置请遵守各平台社区规范。
          </p>
        </div>
      </div>

      <Alert variant="warning">
        <AlertTriangle className="w-4 h-4" />
        <AlertDescription>
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">监控任务</h1>
          <Badge variant="secondary">{tasks.length} 个监控任务</Badge>
        </div>
        <Button onClick={handleCreate} className="gap-1">
          <Plus className="w-4 h-4" />
          新建监控
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4" data-ai-section-type="card-stat">
        {[
          { label: '监控任务', value: tasks.length, icon: Settings, color: 'text-primary', sub: `${tasks.filter((t) => t.isEnabled).length} 个运行中` },
          { label: '今日命中', value: '145', icon: TrendingUp, color: 'text-[hsl(130_54%_42%)]', sub: '较昨日 +32%' },
          { label: '新粉丝监控', value: hitTypeStats.new_follower, icon: UserPlus, color: 'text-[hsl(26_90%_49%)]', sub: '自动欢迎' },
          { label: '关键词监控', value: hitTypeStats.message_keyword + hitTypeStats.comment_keyword, icon: AlertCircle, color: 'text-[hsl(350_85%_60%)]', sub: '私信+评论' },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-[10px] text-muted-foreground">{s.sub}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">命中趋势</CardTitle>
          <CardDescription>最近7天监控命中次数</CardDescription>
        </CardHeader>
        <CardContent>
          <ReactECharts option={trendOption} style={{ height: 240 }} />
        </CardContent>
      </Card>

      {/* Task List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">监控任务列表</CardTitle>
            <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as MonitorType | 'all')}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs px-3 h-7">全部</TabsTrigger>
                <TabsTrigger value="new_follower" className="text-xs px-3 h-7">新粉丝</TabsTrigger>
                <TabsTrigger value="message_keyword" className="text-xs px-3 h-7">私信关键词</TabsTrigger>
                <TabsTrigger value="comment_keyword" className="text-xs px-3 h-7">评论关键词</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务名称</TableHead>
                <TableHead className="w-[120px]">类型</TableHead>
                <TableHead className="w-[140px]">监控账号</TableHead>
                <TableHead>触发条件</TableHead>
                <TableHead className="w-[180px]">执行动作</TableHead>
                <TableHead className="w-[100px]">命中次数</TableHead>
                <TableHead className="w-[100px]">状态</TableHead>
                <TableHead className="text-right w-[120px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((t: MonitorTask) => {
                const typeInfo = monitorTypeMeta[t.monitorType];
                const TypeIcon = typeInfo.icon;
                const accounts = t.monitoredAccountIds
                  .map((id) => mockAccounts[id])
                  .filter(Boolean);
                const firstAccount = accounts[0];
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{t.taskName}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="text-[11px]"
                        style={{
                          backgroundColor: `${typeInfo.color}15`,
                          color: typeInfo.color,
                          border: 'none',
                        }}
                      >
                        <TypeIcon className="w-3 h-3 mr-1" />
                        {typeInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1.5">
                          {accounts.slice(0, 3).map((a, i) => {
                            const meta = platformMeta[a.platform];
                            return (
                              <div
                                key={a.id}
                                className="w-6 h-6 rounded-full border-2 border-card flex items-center justify-center text-white text-[10px] font-medium"
                                style={{ backgroundColor: meta.color, zIndex: 10 - i }}
                              >
                                {a.nickname[0]}
                              </div>
                            );
                          })}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {accounts.length > 1 ? `等${accounts.length}个` : firstAccount?.nickname}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-foreground">
                        {t.monitorType === 'new_follower'
                          ? '新粉丝关注时'
                          : (
                            <div className="flex flex-wrap gap-1">
                              {t.keywords.slice(0, 3).map((kw, i) => (
                                <Badge key={i} variant="outline" className="text-[10px] h-4 px-1.5">
                                  {kw}
                                </Badge>
                              ))}
                              {t.keywords.length > 3 && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                  +{t.keywords.length - 3}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-1">
                                ({t.matchMode === 'exact' ? '精确匹配' : t.matchMode === 'contains' ? '包含匹配' : '模糊匹配'})
                              </span>
                            </div>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        {t.actionType === 'reply_message' ? '自动回复私信' : '自动回复评论'}
                        {t.actionContent && (
                          <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                            {t.actionContent}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-foreground">
                        {t.hitCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={t.isEnabled}
                          onCheckedChange={() => handleToggle(t.id)}
                        />
                        <span className={`text-xs ${t.isEnabled ? 'text-[hsl(130_54%_42%)]' : 'text-muted-foreground'}`}>
                          {t.isEnabled ? '运行中' : '已停用'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => handleViewDetail(t)}>
                          <Eye className="w-3.5 h-3.5" />
                          详情
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            <DropdownMenuItem onClick={() => handleEdit(t)}>
                              <Edit3 className="w-3.5 h-3.5 mr-2" />编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Settings className="w-3.5 h-3.5 mr-2" />频控设置
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="w-3.5 h-3.5 mr-2" />删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Hit Records */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">最近命中记录</CardTitle>
            <Button variant="outline" size="sm">查看全部</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">监控任务</TableHead>
                <TableHead className="w-[120px]">类型</TableHead>
                <TableHead>触发内容</TableHead>
                <TableHead className="w-[140px]">目标用户</TableHead>
                <TableHead className="w-[140px]">触发账号</TableHead>
                <TableHead className="w-[100px]">执行状态</TableHead>
                <TableHead className="w-[160px]">触发时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockMonitorHitRecords.slice(0, 6).map((r: MonitorHitRecord) => {
                const typeInfo = monitorTypeMeta[r.monitorType];
                const TypeIcon = typeInfo.icon;
                const account = mockAccounts[r.triggeredAccountId];
                const task = tasks.find((t) => t.id === r.taskId);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <span className="text-sm">{r.taskName}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                        style={{
                          backgroundColor: `${typeInfo.color}15`,
                          color: typeInfo.color,
                          border: 'none',
                        }}
                      >
                        <TypeIcon className="w-2.5 h-2.5 mr-1" />
                        {typeInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.hitKeyword ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                            {r.hitKeyword}
                          </Badge>
                          {r.sourceContent && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {r.sourceContent}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">新粉丝关注触发</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Avatar className="w-5 h-5">
                          <AvatarFallback className="text-[10px]">{r.targetUserNickname?.[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs truncate max-w-[80px]">{r.targetUserNickname}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{account?.nickname || '-'}</span>
                    </TableCell>
                    <TableCell>
                      {r.actionStatus === 'success' ? (
                        <Badge variant="outline" className="text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/40 text-[10px]">
                          <Check className="w-2.5 h-2.5 mr-0.5" />
                          成功
                        </Badge>
                      ) : r.actionStatus === 'failed' ? (
                        <Badge variant="destructive" className="text-[10px]">
                          <XIcon className="w-2.5 h-2.5 mr-0.5" />
                          失败
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          待执行
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.createdAt}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editMode ? '编辑监控任务' : '新建监控任务'}</DialogTitle>
            <DialogDescription>
              设置监控规则，命中时自动执行回复或告警
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">任务名称</Label>
              <Input
                placeholder="请输入任务名称"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">监控类型</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as MonitorType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(monitorTypeMeta) as MonitorType[]).map((type) => {
                    const meta = monitorTypeMeta[type];
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: meta.color }} />
                          <span>{meta.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">监控账号</Label>
              <Select value={formAccount} onValueChange={setFormAccount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(mockAccounts).map((a) => {
                    const meta = platformMeta[a.platform];
                    return (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: meta.color }}
                          />
                          <span>{a.nickname}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                多账号批量设置请创建后编辑添加
              </p>
            </div>

            {formType !== 'new_follower' && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">匹配模式</Label>
                  <Select value={formMatchMode} onValueChange={(v: any) => setFormMatchMode(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exact">精确匹配（完全一致）</SelectItem>
                      <SelectItem value="contains">包含匹配（包含关键词）</SelectItem>
                      <SelectItem value="fuzzy">模糊匹配（相似即命中）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">关键词</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入关键词后回车添加"
                      value={formKeyword}
                      onChange={(e) => setFormKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddKeyword();
                        }
                      }}
                    />
                    <Button variant="outline" onClick={handleAddKeyword}>添加</Button>
                  </div>
                  {formKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {formKeywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-[11px] h-5 px-2 gap-1">
                          {kw}
                          <button
                            onClick={() => handleRemoveKeyword(kw)}
                            className="ml-0.5 hover:text-foreground/80 text-muted-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label className="text-sm">
                {formType === 'comment_keyword' ? '自动回复评论内容' : '自动回复私信内容'}
              </Label>
              <textarea
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                placeholder="支持变量：{昵称}、{账号名}"
                value={formActionContent}
                onChange={(e) => setFormActionContent(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm">每小时上限</Label>
                <Input
                  type="number"
                  value={formFreqHour}
                  onChange={(e) => setFormFreqHour(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">每天上限</Label>
                <Input
                  type="number"
                  value={formFreqDay}
                  onChange={(e) => setFormFreqDay(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="text-sm">站内通知告警</span>
              </div>
              <Switch checked={formNotify} onCheckedChange={setFormNotify} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>取消</Button>
            <Button onClick={() => setCreateDialogOpen(false)}>
              {editMode ? '保存修改' : '创建任务'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>监控任务详情</DialogTitle>
          </DialogHeader>
          {currentTask && (
            <div className="space-y-5">
              {/* Task Info */}
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const info = monitorTypeMeta[currentTask.monitorType];
                      const Icon = info.icon;
                      return (
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: info.color }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                      );
                    })()}
                    <div>
                      <div className="font-medium">{currentTask.taskName}</div>
                      <div className="text-xs text-muted-foreground">
                        {monitorTypeMeta[currentTask.monitorType].label}
                        {' · '}
                        {currentTask.monitoredAccountIds.length} 个账号
                      </div>
                    </div>
                  </div>
                  <Badge variant={currentTask.isEnabled ? 'outline' : 'secondary'} className={
                    currentTask.isEnabled
                      ? 'text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/40'
                      : ''
                  }>
                    {currentTask.isEnabled ? '运行中' : '已停用'}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">总命中</div>
                    <div className="font-medium">{currentTask.hitCount} 次</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">每小时上限</div>
                    <div className="font-medium">{currentTask.frequencyLimitHour}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">每天上限</div>
                    <div className="font-medium">{currentTask.frequencyLimitDay}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">创建时间</div>
                    <div className="font-medium">{currentTask.createdAt}</div>
                  </div>
                </div>
              </div>

              {/* Keywords */}
              {currentTask.keywords.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    关键词列表
                    <Badge variant="outline" className="text-[10px] ml-1">
                      {currentTask.matchMode === 'exact' ? '精确匹配' : currentTask.matchMode === 'contains' ? '包含匹配' : '模糊匹配'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentTask.keywords.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-xs px-3 py-1">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Trend Chart */}
              <div>
                <div className="text-sm font-medium mb-2 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  命中趋势（7天）
                </div>
                <Card>
                  <CardContent className="pt-4">
                    <ReactECharts option={trendOption} style={{ height: 200 }} />
                  </CardContent>
                </Card>
              </div>

              {/* Hit Records */}
              <div>
                <div className="text-sm font-medium mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[hsl(26_90%_49%)]" />
                    命中记录
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">
                    共 {currentTaskHits.length} 条
                  </span>
                </div>
                {currentTaskHits.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    暂无命中记录
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentTaskHits.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg"
                      >
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarFallback className="text-xs">{r.targetUserNickname?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{r.targetUserNickname}</span>
                              {r.hitKeyword && (
                                <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                                  命中: {r.hitKeyword}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">{r.createdAt}</span>
                          </div>
                          {r.sourceContent && (
                            <p className="text-xs text-muted-foreground mb-1">触发内容：{r.sourceContent}</p>
                          )}
                          <div className="flex items-center gap-2 text-[11px]">
                            {r.actionStatus === 'success' && (
                              <span className="text-[hsl(130_54%_42%)] flex items-center gap-1">
                                <Check className="w-3 h-3" /> 自动回复成功
                              </span>
                            )}
                            {r.actionStatus === 'failed' && (
                              <span className="text-destructive flex items-center gap-1">
                                <XIcon className="w-3 h-3" /> 执行失败: {r.actionFailReason}
                              </span>
                            )}
                            {r.actionStatus === 'pending' && (
                              <span className="text-muted-foreground">待执行</span>
                            )}
                            {r.executedAt && (
                              <span className="text-muted-foreground">执行于 {r.executedAt}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>关闭</Button>
            <Button onClick={() => { setDetailDialogOpen(false); handleEdit(currentTask!); }}>
              <Edit3 className="w-3.5 h-3.5 mr-1" />
              编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EngageFollowerMonitorPage;

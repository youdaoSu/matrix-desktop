import { useState } from 'react';
import {
  Send,
  AlertTriangle,
  Plus,
  Play,
  Pause,
  Square,
  Edit2,
  Trash2,
  Copy,
  Eye,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Image,
  Link2,
  FileText,
  ChevronRight,
  X,
  AlertCircle,
  PieChart as PieChartIcon,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { Alert, AlertTitle, AlertDescription } from '@client/src/components/ui/alert';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/src/components/ui/dialog';
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
import { Checkbox } from '@client/src/components/ui/checkbox';
import type { AutoMessageTask, AutoMessageTaskItem, SendFailReason } from '@shared/api.interface';
import { FAIL_REASON_LABELS } from '@shared/api.interface';
import { mockAutoMessageTasks, mockAccounts, platformMeta } from './engage-data';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  running: 'bg-primary text-primary-foreground',
  paused: 'bg-[hsl(26_90%_49%)] text-white',
  completed: 'bg-[hsl(130_54%_42%)] text-white',
  stopped: 'bg-destructive text-white',
};

const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  stopped: '已停止',
};

const msgTypeIcons: Record<string, any> = {
  text: Send,
  image: Image,
  link: Link2,
  article: FileText,
};

const msgTypeLabels: Record<string, string> = {
  text: '文本',
  image: '图片',
  link: '链接卡片',
  article: '图文',
};

const EngageAutoMessagePage = () => {
  const [tasks, setTasks] = useState<AutoMessageTask[]>(mockAutoMessageTasks);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<AutoMessageTask | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState('');
  const [complianceChecked, setComplianceChecked] = useState(false);

  const handleNewTask = () => {
    setWizardStep(1);
    setComplianceChecked(false);
    setWizardOpen(true);
  };

  const handleDetail = (task: AutoMessageTask) => {
    setDetailTask(task);
    setDetailOpen(true);
  };

  const toggleTask = (task: AutoMessageTask) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== task.id) return t;
        if (t.status === 'running') return { ...t, status: 'paused' };
        if (t.status === 'paused' || t.status === 'draft') return { ...t, status: 'running' };
        return t;
      })
    );
  };

  const stopTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'stopped' } : t)));
  };

  // Detail items
  const taskItems: AutoMessageTaskItem[] = detailTask
    ? Array.from({ length: 10 }, (_, i) => {
        const failReasons: SendFailReason[] = ['need_mutual_follow', 'frequency_limit', 'private_account', 'auth_error', 'content_blocked'];
        const shouldFail = i % 5 === 0 && i > 0;
        return {
          id: `item-${i}`,
          taskId: detailTask.id,
          targetPlatformId: `user-${i + 100}`,
          targetNickname: `粉丝用户${i + 1}`,
          targetAvatarUrl: '',
          status: shouldFail ? 'failed' : (i < 6 ? 'success' : 'pending'),
          failReason: shouldFail ? failReasons[i % failReasons.length] : undefined,
          sentAt: i < 6 ? `2026-09-28 ${10 + i}:${String(i * 7).padStart(2, '0')}` : undefined,
          createdAt: `2026-09-28 08:00`,
        };
      })
    : [];

  const failReasonsPie = {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 4, borderColor: 'transparent', borderWidth: 2 },
      label: { show: true, fontSize: 11 },
      data: [
        { value: 15, name: '非粉丝无法私信', itemStyle: { color: 'hsl(2 84% 62%)' } },
        { value: 8, name: '频次限制', itemStyle: { color: 'hsl(26 90% 49%)' } },
        { value: 5, name: '内容违规', itemStyle: { color: 'hsl(350 85% 60%)' } },
        { value: 3, name: '网络错误', itemStyle: { color: 'hsl(200 90% 55%)' } },
        { value: 2, name: '被拉黑', itemStyle: { color: 'hsl(0 0% 47%)' } },
      ],
    }],
  };

  const successRate = detailTask
    ? detailTask.totalCount > 0
      ? Math.round((detailTask.successCount / (detailTask.successCount + detailTask.failCount)) * 100)
      : 0
    : 0;

  return (
    <div className="p-0 space-y-4">
      {/* Compliance Warning */}
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle className="font-medium">合规警示</AlertTitle>
        <AlertDescription className="text-xs">
          主动私信功能仅限向已关注您的粉丝发送，禁止向陌生人发送营销信息。所有操作受平台频控限制，发送前请确认已获得用户同意，遵守各平台社区规范。
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
          <h1 className="text-xl font-semibold text-foreground">主动私信任务</h1>
          <Badge variant="secondary">{tasks.length} 个任务</Badge>
        </div>
        <Button className="gap-1" onClick={handleNewTask}>
          <Plus className="w-4 h-4" />
          新建任务
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4" data-ai-section-type="card-stat">
        {[
          { label: '总任务数', value: tasks.length, icon: Send, color: 'text-primary' },
          { label: '执行中', value: tasks.filter((t) => t.status === 'running').length, icon: Play, color: 'text-[hsl(26_90%_49%)]' },
          { label: '今日发送', value: '1,256', icon: CheckCircle, color: 'text-[hsl(130_54%_42%)]' },
          { label: '成功率', value: '92.3%', icon: PieChartIcon, color: 'text-[hsl(200_90%_55%)]' },
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

      {/* Task List */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">任务名称</TableHead>
                <TableHead className="w-[140px]">发送账号</TableHead>
                <TableHead className="w-[100px]">消息类型</TableHead>
                <TableHead className="w-[200px]">进度</TableHead>
                <TableHead className="w-[80px]">目标数</TableHead>
                <TableHead className="w-[80px]">成功</TableHead>
                <TableHead className="w-[80px]">失败</TableHead>
                <TableHead className="w-[80px]">状态</TableHead>
                <TableHead className="text-right w-[240px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task: AutoMessageTask) => {
                const account = mockAccounts[task.senderAccountId];
                const progress = task.totalCount > 0
                  ? Math.round(((task.successCount + task.failCount) / task.totalCount) * 100)
                  : 0;
                const MsgIcon = msgTypeIcons[task.msgType] || Send;
                return (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.taskName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {account && (
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: platformMeta[account.platform].color }}
                          />
                        )}
                        <span className="text-sm">{task.senderAccountNickname}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MsgIcon className="w-3.5 h-3.5" />
                        {msgTypeLabels[task.msgType]}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress value={progress} className="h-1.5" />
                        <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                          <span>{task.successCount + task.failCount} / {task.totalCount}</span>
                          <span>{progress}%</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{task.totalCount}</TableCell>
                    <TableCell className="text-sm text-[hsl(130_54%_42%)]">{task.successCount}</TableCell>
                    <TableCell className="text-sm text-destructive">{task.failCount}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn('text-xs', statusColors[task.status])}
                        variant="outline"
                      >
                        {statusLabels[task.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDetail(task)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {task.status === 'running' ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleTask(task)}>
                            <Pause className="w-3.5 h-3.5" />
                          </Button>
                        ) : (task.status === 'paused' || task.status === 'draft') && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-[hsl(130_54%_42%)]" onClick={() => toggleTask(task)}>
                            <Play className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {task.status === 'running' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => stopTask(task.id)}>
                            <Square className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {}}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {}}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => { setDeleteId(task.id); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Task Wizard */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建主动私信任务</DialogTitle>
            <DialogDescription className="text-xs text-destructive">
              ⚠️ 仅限向已关注您的粉丝发送，请严格遵守平台规则
            </DialogDescription>
          </DialogHeader>

          {/* Steps */}
          <div className="flex items-center mb-4">
            {[
              { step: 1, label: '基本信息' },
              { step: 2, label: '目标对象' },
              { step: 3, label: '消息内容' },
              { step: 4, label: '发送设置' },
              { step: 5, label: '合规确认' },
            ].map((s) => (
              <>
                <div key={s.step} className="flex flex-col items-center">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium',
                    wizardStep >= s.step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {s.step}
                  </div>
                  <span className="text-[11px] mt-1 text-muted-foreground">{s.label}</span>
                </div>
                {s.step < 5 && <div className="flex-1 h-px bg-border mx-2 mb-5" />}
              </>
            ))}
          </div>

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">任务名称</label>
                <Input placeholder="请输入任务名称" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">发送账号</label>
                <Select defaultValue="">
                  <SelectTrigger>
                    <SelectValue placeholder="选择发送账号" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(mockAccounts).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: platformMeta[a.platform].color }}
                          />
                          <span>{a.nickname}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">目标对象来源</label>
                <Select defaultValue="group">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">选择粉丝分组</SelectItem>
                    <SelectItem value="import">导入ID列表</SelectItem>
                    <SelectItem value="tag">按标签筛选</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">目标分组</label>
                <div className="space-y-1 max-h-[200px] overflow-y-auto border border-border rounded-lg p-2">
                  {['全部粉丝', 'VIP粉丝', '活跃群', '默认分组', '新粉丝(7天内)', '高价值粉丝'].map((g, i) => (
                    <label key={i} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer text-sm">
                      <Checkbox />
                      <span>{g}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{Math.floor(Math.random() * 5000) + 100} 人</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
                预计目标人数：约 <span className="text-primary font-medium">2,350</span> 人
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">消息类型</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(msgTypeLabels).map(([k, v]) => {
                    const Icon = msgTypeIcons[k];
                    return (
                      <div
                        key={k}
                        className={cn(
                          'p-3 border rounded-lg cursor-pointer text-center',
                          k === 'text' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                        )}
                      >
                        <Icon className="w-5 h-5 mx-auto mb-1 text-primary" />
                        <div className="text-xs">{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">消息内容</label>
                <Textarea
                  placeholder="请输入私信内容..."
                  className="min-h-[120px] resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  支持变量：{'{昵称}'}、{'{账号名}'}
                </p>
              </div>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">发送时机</label>
                <Select defaultValue="now">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="now">立即发送</SelectItem>
                    <SelectItem value="schedule">定时发送</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">每小时上限</label>
                  <Input type="number" defaultValue={120} />
                  <p className="text-[11px] text-muted-foreground">单账号每小时发送条数</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">每天上限</label>
                  <Input type="number" defaultValue={800} />
                  <p className="text-[11px] text-muted-foreground">单账号每天发送条数</p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">随机间隔范围（秒）</label>
                <div className="flex items-center gap-2">
                  <Input type="number" defaultValue={20} className="w-24" />
                  <span className="text-muted-foreground">~</span>
                  <Input type="number" defaultValue={60} className="w-24" />
                  <span className="text-xs text-muted-foreground">秒</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  每条消息之间随机等待，模拟人工操作节奏
                </p>
              </div>
            </div>
          )}

          {wizardStep === 5 && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertTitle>合规声明</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  <p>我已阅读并理解以下内容：</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>主动私信仅可发送给已关注我的粉丝</li>
                    <li>不发送违规、欺诈、骚扰类内容</li>
                    <li>遵守各平台频控限制，不恶意骚扰用户</li>
                    <li>因违规发送导致的账号问题由我自行承担</li>
                  </ol>
                </AlertDescription>
              </Alert>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={complianceChecked}
                  onCheckedChange={(v) => setComplianceChecked(!!v)}
                />
                <span className="text-sm">我已仔细阅读并同意上述合规声明</span>
              </label>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setWizardStep(Math.max(1, wizardStep - 1))}
              disabled={wizardStep === 1}
            >
              上一步
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setWizardOpen(false)}>取消</Button>
              {wizardStep < 5 ? (
                <Button onClick={() => setWizardStep(wizardStep + 1)}>
                  下一步
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => setWizardOpen(false)}
                  disabled={!complianceChecked}
                >
                  创建任务
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>任务详情</DialogTitle>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-4">
              {/* Task Summary */}
              <div className="grid grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold">{detailTask.totalCount}</div>
                    <div className="text-xs text-muted-foreground">目标总数</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-[hsl(130_54%_42%)]">{detailTask.successCount}</div>
                    <div className="text-xs text-muted-foreground">成功</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-destructive">{detailTask.failCount}</div>
                    <div className="text-xs text-muted-foreground">失败</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{successRate}%</div>
                    <div className="text-xs text-muted-foreground">成功率</div>
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="items">
                <TabsList>
                  <TabsTrigger value="items">发送明细</TabsTrigger>
                  <TabsTrigger value="failures">失败原因分布</TabsTrigger>
                  <TabsTrigger value="settings">任务设置</TabsTrigger>
                </TabsList>

                <TabsContent value="items" className="mt-3">
                  <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>目标用户</TableHead>
                          <TableHead className="w-[100px]">状态</TableHead>
                          <TableHead>失败原因</TableHead>
                          <TableHead className="w-[160px]">发送时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {taskItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{item.targetNickname}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.status === 'success' ? (
                                <Badge className="bg-[hsl(130_54%_42%)] text-white border-none text-xs">成功</Badge>
                              ) : item.status === 'failed' ? (
                                <Badge variant="destructive" className="text-xs">失败</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">待发送</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {item.failReason ? FAIL_REASON_LABELS[item.failReason as SendFailReason] : '-'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.sentAt || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="failures" className="mt-3">
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-sm font-medium mb-2">失败原因分布</div>
                        <ReactECharts option={failReasonsPie} style={{ height: 240 }} />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="text-sm font-medium">失败原因列表</div>
                        {[
                          { name: '非粉丝无法私信', count: 15, pct: '42.9%' },
                          { name: '频次限制', count: 8, pct: '22.9%' },
                          { name: '内容违规', count: 5, pct: '14.3%' },
                          { name: '网络错误', count: 3, pct: '8.6%' },
                          { name: '被拉黑', count: 2, pct: '5.7%' },
                        ].map((r, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-destructive" />
                            <span className="text-xs flex-1">{r.name}</span>
                            <span className="text-xs font-medium">{r.count}</span>
                            <span className="text-xs text-muted-foreground w-12 text-right">{r.pct}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="settings" className="mt-3">
                  <Card>
                    <CardContent className="p-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">任务名称</span>
                        <span>{detailTask.taskName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">发送账号</span>
                        <span>{detailTask.senderAccountNickname}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">消息类型</span>
                        <span>{msgTypeLabels[detailTask.msgType]}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">每小时上限</span>
                        <span>{detailTask.frequencyLimitHour} 条</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">每天上限</span>
                        <span>{detailTask.frequencyLimitDay} 条</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">随机间隔</span>
                        <span>{detailTask.minIntervalSeconds} - {detailTask.maxIntervalSeconds} 秒</span>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后任务记录和相关数据将被清除，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(false)}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EngageAutoMessagePage;

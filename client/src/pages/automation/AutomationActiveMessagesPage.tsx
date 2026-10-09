import { useState } from 'react';
import {
  Info,
  AlertTriangle,
  Plus,
  Play,
  Pause,
  Square,
  Edit3,
  Trash2,
  Eye,
  X,
  ChevronRight,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  Image,
  Link as LinkIcon,
  FileText,
} from 'lucide-react';
import {
  FAIL_REASON_LABELS,
  type AutoMessageTask,
  type AutoMessageTaskItem,
  type SendFailReason,
} from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@client/src/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from '@client/src/components/ui/drawer';
import { Alert, AlertDescription, AlertTitle } from '@client/src/components/ui/alert';
import { Progress } from '@client/src/components/ui/progress';
import { Separator } from '@client/src/components/ui/separator';

const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  stopped: '已停止',
};

const statusColors: Record<string, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  running: 'bg-[hsl(221_83%_53%)] text-white',
  paused: 'bg-[hsl(26_90%_49%)] text-white',
  completed: 'bg-[hsl(130_54%_42%)] text-white',
  stopped: 'bg-[hsl(2_84%_62%)] text-white',
};

const msgTypeLabels: Record<string, string> = {
  text: '文本',
  image: '图片',
  link: '链接',
  article: '图文',
};

const mockTasks: AutoMessageTask[] = [
  { id: 't1', taskName: '新品上市通知', senderAccountId: 'a2', senderAccountNickname: '生活种草日记', msgType: 'article', content: '新品上市啦！点击查看详情', totalCount: 500, successCount: 236, failCount: 28, status: 'running', frequencyLimitHour: 30, frequencyLimitDay: 200, minIntervalSeconds: 30, maxIntervalSeconds: 90, startedAt: '2026-09-27 10:00', createdAt: '2026-09-26 14:30' },
  { id: 't2', taskName: '粉丝节福利放送', senderAccountId: 'a1', senderAccountNickname: '美食探店小队', msgType: 'text', content: '粉丝节福利来啦！专属优惠码：FANS2026，全场8折～', totalCount: 200, successCount: 200, failCount: 0, status: 'completed', frequencyLimitHour: 40, frequencyLimitDay: 300, minIntervalSeconds: 20, maxIntervalSeconds: 60, startedAt: '2026-09-25 09:00', completedAt: '2026-09-25 18:30', createdAt: '2026-09-24 16:00' },
  { id: 't3', taskName: '售后满意度调研', senderAccountId: 'a3', senderAccountNickname: '品牌官方号', msgType: 'link', linkTitle: '售后满意度调研', linkUrl: 'https://example.com/survey', totalCount: 150, successCount: 45, failCount: 12, status: 'paused', frequencyLimitHour: 20, frequencyLimitDay: 100, minIntervalSeconds: 60, maxIntervalSeconds: 120, startedAt: '2026-09-27 14:00', createdAt: '2026-09-27 10:00' },
  { id: 't4', taskName: '会员日专属活动', senderAccountId: 'a4', senderAccountNickname: '科技UP主', msgType: 'image', totalCount: 300, successCount: 0, failCount: 0, status: 'draft', frequencyLimitHour: 30, frequencyLimitDay: 200, minIntervalSeconds: 30, maxIntervalSeconds: 90, createdAt: '2026-09-28 09:00' },
  { id: 't5', taskName: '直播间开播提醒', senderAccountId: 'a1', senderAccountNickname: '美食探店小队', msgType: 'text', content: '直播啦！快来围观～ 今晚8点直播间不见不散', totalCount: 800, successCount: 520, failCount: 67, status: 'stopped', frequencyLimitHour: 50, frequencyLimitDay: 500, minIntervalSeconds: 15, maxIntervalSeconds: 45, startedAt: '2026-09-26 20:00', createdAt: '2026-09-26 18:00' },
];

const mockTaskItems: AutoMessageTaskItem[] = [
  { id: 'i1', taskId: 't1', targetPlatformId: 'u1', targetNickname: '小甜心', status: 'success', scheduledAt: '2026-09-27 10:01', sentAt: '2026-09-27 10:01', createdAt: '2026-09-27 10:00' },
  { id: 'i2', taskId: 't1', targetPlatformId: 'u2', targetNickname: '阳光少年', status: 'success', scheduledAt: '2026-09-27 10:02', sentAt: '2026-09-27 10:02', createdAt: '2026-09-27 10:00' },
  { id: 'i3', taskId: 't1', targetPlatformId: 'u3', targetNickname: '爱吃鱼的猫', status: 'failed', failReason: 'frequency_limit', scheduledAt: '2026-09-27 10:03', createdAt: '2026-09-27 10:00' },
  { id: 'i4', taskId: 't1', targetPlatformId: 'u4', targetNickname: '柠檬不萌', status: 'success', scheduledAt: '2026-09-27 10:04', sentAt: '2026-09-27 10:04', createdAt: '2026-09-27 10:00' },
  { id: 'i5', taskId: 't1', targetPlatformId: 'u5', targetNickname: '追梦人', status: 'failed', failReason: 'need_mutual_follow', scheduledAt: '2026-09-27 10:05', createdAt: '2026-09-27 10:00' },
  { id: 'i6', taskId: 't1', targetPlatformId: 'u6', targetNickname: '星星点灯', status: 'pending', scheduledAt: '2026-09-27 11:30', createdAt: '2026-09-27 10:00' },
  { id: 'i7', taskId: 't1', targetPlatformId: 'u7', targetNickname: '大海无量', status: 'failed', failReason: 'private_account', scheduledAt: '2026-09-27 10:07', createdAt: '2026-09-27 10:00' },
  { id: 'i8', taskId: 't1', targetPlatformId: 'u8', targetNickname: '清风徐来', status: 'success', scheduledAt: '2026-09-27 10:08', sentAt: '2026-09-27 10:08', createdAt: '2026-09-27 10:00' },
  { id: 'i9', taskId: 't1', targetPlatformId: 'u9', targetNickname: '我是小透明', status: 'failed', failReason: 'out_of_window', scheduledAt: '2026-09-27 10:09', createdAt: '2026-09-27 10:00' },
  { id: 'i10', taskId: 't1', targetPlatformId: 'u10', targetNickname: '云淡风轻', status: 'success', scheduledAt: '2026-09-27 10:10', sentAt: '2026-09-27 10:10', createdAt: '2026-09-27 10:00' },
  { id: 'i11', taskId: 't1', targetPlatformId: 'u11', targetNickname: '月下独酌', status: 'failed', failReason: 'content_blocked', scheduledAt: '2026-09-27 10:11', createdAt: '2026-09-27 10:00' },
  { id: 'i12', taskId: 't1', targetPlatformId: 'u12', targetNickname: '故事里的人', status: 'skipped', scheduledAt: '2026-09-27 10:12', createdAt: '2026-09-27 10:00' },
];

const AutomationActiveMessagesPage = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AutoMessageTask | null>(null);
  const [step, setStep] = useState(1);
  const [msgType, setMsgType] = useState<'text' | 'image' | 'link' | 'article'>('text');
  const [hourLimit, setHourLimit] = useState('30');
  const [dayLimit, setDayLimit] = useState('200');
  const [minInterval, setMinInterval] = useState('30');
  const [maxInterval, setMaxInterval] = useState('90');

  const viewDetail = (task: AutoMessageTask) => {
    setSelectedTask(task);
    setDrawerOpen(true);
  };

  const taskItems = mockTaskItems.filter((i) => i.taskId === selectedTask?.id);
  const successCount = taskItems.filter((i) => i.status === 'success').length;
  const failCount = taskItems.filter((i) => i.status === 'failed').length;
  const pendingCount = taskItems.filter((i) => i.status === 'pending' || i.status === 'sending').length;
  const totalItems = taskItems.length;
  const progress = totalItems > 0 ? ((successCount + failCount) / totalItems) * 100 : 0;

  const failBadgeClass = (reason?: SendFailReason): string => {
    if (!reason) return '';
    const map: Record<SendFailReason, string> = {
      frequency_limit: 'bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/30',
      need_mutual_follow: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      private_account: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      out_of_window: 'bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/30',
      content_blocked: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      auth_error: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      unknown: 'bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/30',
    };
    return map[reason];
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      success: 'bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/30',
      failed: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      pending: 'bg-secondary text-secondary-foreground',
      sending: 'bg-[hsl(221_83%_53%)]/10 text-[hsl(221_83%_53%)] border-[hsl(221_83%_53%)]/30',
      skipped: 'bg-muted text-muted-foreground',
    };
    const labels: Record<string, string> = {
      success: '成功',
      failed: '失败',
      pending: '待发送',
      sending: '发送中',
      skipped: '已跳过',
    };
    return { cls: map[status] || '', label: labels[status] || status };
  };

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <Info className="w-4 h-4" />
        <AlertDescription>
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle className="font-semibold">合规提醒</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>· 仅对与已授权自有账号存在合法会话关系或已关注的用户发送</p>
          <p>· 遵守各平台频率限制，不得用于陌生人骚扰群发</p>
          <p>· 账号安全保护机制默认保守配置，建议不要随意放宽</p>
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">主动私信任务</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) setStep(1); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4" />新建任务
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span>新建主动私信任务</span>
                <div className="flex items-center gap-1.5 ml-auto text-xs font-normal">
                  {[1, 2, 3, 4].map((s) => (
                    <div key={s} className="flex items-center">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                        s <= step ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                      }`}>
                        {s}
                      </div>
                      {s < 4 && <div className={`w-8 h-0.5 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
                    </div>
                  ))}
                </div>
              </DialogTitle>
            </DialogHeader>

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">任务名称</label>
                  <Input placeholder="请输入任务名称，便于后续管理" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">选择发送账号</label>
                  <Select defaultValue="a1">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a1">美食探店小队（抖音）</SelectItem>
                      <SelectItem value="a2">生活种草日记（小红书）</SelectItem>
                      <SelectItem value="a3">品牌官方号（视频号）</SelectItem>
                      <SelectItem value="a4">科技UP主（B站）</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    仅可选择已授权的自有账号
                  </p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">消息类型</label>
                  <div className="flex gap-2">
                    {([
                      { v: 'text', label: '文本', icon: Send },
                      { v: 'image', label: '图片', icon: Image },
                      { v: 'link', label: '链接', icon: LinkIcon },
                      { v: 'article', label: '图文', icon: FileText },
                    ] as const).map(({ v, label, icon: Icon }) => (
                      <Button
                        key={v}
                        variant={msgType === v ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMsgType(v)}
                        type="button"
                      >
                        <Icon className="w-3.5 h-3.5" />{label}
                      </Button>
                    ))}
                  </div>
                </div>
                {msgType === 'text' && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">消息内容</label>
                    <Textarea placeholder="请输入私信内容" className="min-h-[120px] resize-none" />
                  </div>
                )}
                {msgType === 'image' && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">发送图片</label>
                    <div className="border border-dashed border-border rounded-lg h-40 flex items-center justify-center text-muted-foreground text-sm">
                      点击上传图片
                    </div>
                  </div>
                )}
                {msgType === 'link' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">链接标题</label>
                      <Input placeholder="请输入链接标题" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">链接地址</label>
                      <Input placeholder="https://" />
                    </div>
                  </div>
                )}
                {msgType === 'article' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">图文标题</label>
                      <Input placeholder="请输入图文标题" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">图文描述</label>
                      <Textarea placeholder="请输入图文描述" className="min-h-[80px] resize-none" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">封面图</label>
                      <div className="border border-dashed border-border rounded-lg h-24 flex items-center justify-center text-muted-foreground text-sm">
                        点击上传封面图
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">目标用户来源</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2.5 border border-border rounded-md cursor-pointer hover:bg-muted/30">
                      <input type="checkbox" defaultChecked className="h-4 w-4" />
                      <div>
                        <div className="text-sm font-medium">已关注用户</div>
                        <div className="text-xs text-muted-foreground">向所有关注本账号的粉丝发送</div>
                      </div>
                      <Badge variant="outline" className="ml-auto">约 12,580 人</Badge>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 border border-border rounded-md cursor-pointer hover:bg-muted/30">
                      <input type="checkbox" className="h-4 w-4" />
                      <div>
                        <div className="text-sm font-medium">指定粉丝分组</div>
                        <div className="text-xs text-muted-foreground">选择已有的粉丝标签分组</div>
                      </div>
                      <Badge variant="outline" className="ml-auto">可配置</Badge>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 border border-border rounded-md cursor-pointer hover:bg-muted/30">
                      <input type="checkbox" className="h-4 w-4" />
                      <div>
                        <div className="text-sm font-medium">特定会话用户</div>
                        <div className="text-xs text-muted-foreground">近期有过私信往来的用户</div>
                      </div>
                      <Badge variant="outline" className="ml-auto">约 860 人</Badge>
                    </label>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">预计目标用户数：</span>
                    <span className="font-semibold text-lg">约 12,580 人</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    最终实际发送数可能因频控、失败等原因少于预期
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="bg-[hsl(26_90%_49%)]/5 border border-[hsl(26_90%_49%)]/20 rounded-lg p-3">
                  <div className="text-sm font-medium text-[hsl(26_90%_49%)] flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />节奏控制
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    合理的发送节奏可以降低账号风险，避免触发平台风控
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">每小时发送上限</label>
                    <Input
                      type="number"
                      value={hourLimit}
                      onChange={(e) => setHourLimit(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">默认 30 条/小时</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">每日发送上限</label>
                    <Input
                      type="number"
                      value={dayLimit}
                      onChange={(e) => setDayLimit(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">默认 200 条/天</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">最小间隔秒数</label>
                    <Input
                      type="number"
                      value={minInterval}
                      onChange={(e) => setMinInterval(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">默认 30 秒</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">最大间隔秒数</label>
                    <Input
                      type="number"
                      value={maxInterval}
                      onChange={(e) => setMaxInterval(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">默认 90 秒</p>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
                  <strong className="text-foreground">说明：</strong>
                  两条消息之间将在最小间隔和最大间隔之间取随机值，避免过短或完全一致的发送频率，降低被平台识别为自动化操作的风险。
                </div>
              </div>
            )}

            <DialogFooter className="flex items-center justify-between">
              <div>
                {step > 1 && (
                  <Button variant="outline" onClick={() => setStep(step - 1)}>上一步</Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                {step < 4 ? (
                  <Button onClick={() => setStep(step + 1)}>下一步</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>保存草稿</Button>
                    <Button onClick={() => setDialogOpen(false)}>立即启动</Button>
                  </>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务名称</TableHead>
                <TableHead>发送账号</TableHead>
                <TableHead>消息类型</TableHead>
                <TableHead>目标数量</TableHead>
                <TableHead>成功/失败</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.taskName}</TableCell>
                  <TableCell>{task.senderAccountNickname}</TableCell>
                  <TableCell>{msgTypeLabels[task.msgType]}</TableCell>
                  <TableCell>{task.totalCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className="text-[hsl(130_54%_42%)]">{task.successCount}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-destructive">{task.failCount}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[task.status]}>
                      {statusLabels[task.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{task.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {task.status === 'draft' && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[hsl(130_54%_42%)]">
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {task.status === 'running' && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[hsl(26_90%_49%)]">
                          <Pause className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {task.status === 'paused' && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[hsl(130_54%_42%)]">
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {(task.status === 'running' || task.status === 'paused') && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive">
                          <Square className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => viewDetail(task)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      {task.status === 'draft' && (
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="h-[85vh] sm:max-w-xl sm:ml-auto">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              {selectedTask?.taskName}
              <Badge className={selectedTask ? statusColors[selectedTask.status] : ''}>
                {selectedTask ? statusLabels[selectedTask.status] : ''}
              </Badge>
            </DrawerTitle>
            <DrawerDescription>任务详情与发送记录</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto flex-1 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">发送账号</div>
                  <div className="text-sm font-medium">{selectedTask?.senderAccountNickname}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">消息类型</div>
                  <div className="text-sm font-medium">{selectedTask ? msgTypeLabels[selectedTask.msgType] : ''}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">发送进度</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={progress} className="h-2" />
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-foreground">{totalItems}</div>
                    <div className="text-xs text-muted-foreground">总计</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[hsl(130_54%_42%)]">{successCount}</div>
                    <div className="text-xs text-muted-foreground">成功</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-destructive">{failCount}</div>
                    <div className="text-xs text-muted-foreground">失败</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-muted-foreground">{pendingCount}</div>
                    <div className="text-xs text-muted-foreground">待发送</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">节奏配置</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">每小时上限</span>
                  <span className="font-medium">{selectedTask?.frequencyLimitHour} 条</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">每日上限</span>
                  <span className="font-medium">{selectedTask?.frequencyLimitDay} 条</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最小间隔</span>
                  <span className="font-medium">{selectedTask?.minIntervalSeconds} 秒</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最大间隔</span>
                  <span className="font-medium">{selectedTask?.maxIntervalSeconds} 秒</span>
                </div>
              </CardContent>
            </Card>

            <Separator />

            <div className="font-medium">发送明细</div>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>目标用户</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>失败原因</TableHead>
                    <TableHead>发送时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskItems.map((item) => {
                    const sb = statusBadge(item.status);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-sm">{item.targetNickname}</TableCell>
                        <TableCell>
                          <Badge className={sb.cls} variant="outline">{sb.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {item.failReason ? (
                            <Badge className={failBadgeClass(item.failReason)} variant="outline">
                              {FAIL_REASON_LABELS[item.failReason]}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {item.sentAt || item.scheduledAt || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default AutomationActiveMessagesPage;

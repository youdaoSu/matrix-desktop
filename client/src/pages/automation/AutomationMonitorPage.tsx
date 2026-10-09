import { useState, useMemo, useRef } from 'react';
import { ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import {
   Info,
   AlertTriangle,
   Plus,
   Eye,
   Edit3,
   Trash2,
   UserPlus,
   MessageSquare,
   MessageCircle,
   Search,
   Shield,
   Zap,
   TrendingUp,
 } from 'lucide-react';
import {
  FAIL_REASON_LABELS,
  type MonitorTask,
  type MonitorHitRecord,
  type MonitorType,
  type SendFailReason,
  type PlatformAccount,
  type AccountGroup,
  type PlatformType,
} from '@shared/api.interface';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/src/components/ui/tabs';
import { Switch } from '@client/src/components/ui/switch';
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
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@client/src/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@client/src/components/ui/alert';
import { cn } from '@/lib/utils';
import AccountSelector from '@client/src/components/account/AccountSelector';
import { Check, X } from 'lucide-react';

const monitorTypeLabels: Record<MonitorType, string> = {
  new_follower: '新增粉丝',
  message_keyword: '私信关键词',
  comment_keyword: '评论关键词',
};

const monitorTypeIcons: Record<MonitorType, typeof UserPlus> = {
  new_follower: UserPlus,
  message_keyword: MessageSquare,
  comment_keyword: MessageCircle,
};

const actionTypeLabels: Record<string, string> = {
  reply_message: '回复私信',
  reply_comment: '回复评论',
};

const matchModeLabels: Record<string, string> = {
  exact: '精确匹配',
  contains: '包含匹配',
  fuzzy: '模糊匹配',
};

const actionStatusLabels: Record<string, string> = {
  pending: '待执行',
  success: '成功',
  failed: '失败',
};

const actionStatusColors: Record<string, string> = {
  pending: 'bg-secondary text-secondary-foreground',
  success: 'bg-[hsl(130_54%_42%)] text-white',
  failed: 'bg-[hsl(2_84%_62%)] text-white',
};

const mockGroups: AccountGroup[] = [
  { id: 'gid1', userId: 'u1', groupName: '美食探店组', sortOrder: 1, isDefault: false, createdAt: '2026-01-01' },
  { id: 'gid2', userId: 'u1', groupName: '生活种草组', sortOrder: 2, isDefault: false, createdAt: '2026-01-02' },
  { id: 'gid3', userId: 'u1', groupName: '品牌官方组', sortOrder: 3, isDefault: true, createdAt: '2026-01-03' },
  { id: 'gid4', userId: 'u1', groupName: '科技数码组', sortOrder: 4, isDefault: false, createdAt: '2026-01-04' },
  { id: 'gid5', userId: 'u1', groupName: '时尚美妆组', sortOrder: 5, isDefault: false, createdAt: '2026-01-05' },
  { id: 'gid6', userId: 'u1', groupName: '知识科普组', sortOrder: 6, isDefault: false, createdAt: '2026-01-06' },
];

const mockAccounts: PlatformAccount[] = [
  { id: 'a1', platform: 'douyin', nickname: '美食探店小队', groupName: '美食探店组', authStatus: 'authorized', followersCount: 128000, followingCount: 320, likesCount: 2400000, postsCount: 186, healthStatus: 'normal', createdAt: '2026-01-10' },
  { id: 'a5', platform: 'douyin', nickname: '探店老王', groupName: '美食探店组', authStatus: 'authorized', followersCount: 56000, followingCount: 180, likesCount: 890000, postsCount: 92, healthStatus: 'normal', createdAt: '2026-02-15' },
  { id: 'a10', platform: 'douyin', nickname: '时尚博主Lily', groupName: '时尚美妆组', authStatus: 'authorized', followersCount: 230000, followingCount: 450, likesCount: 4500000, postsCount: 310, healthStatus: 'normal', createdAt: '2026-03-01' },
  { id: 'a2', platform: 'xiaohongshu', nickname: '生活种草日记', groupName: '生活种草组', authStatus: 'authorized', followersCount: 86000, followingCount: 210, likesCount: 1200000, postsCount: 245, healthStatus: 'normal', createdAt: '2026-01-12' },
  { id: 'a6', platform: 'xiaohongshu', nickname: '穿搭种草酱', groupName: '生活种草组', authStatus: 'authorized', followersCount: 64000, followingCount: 150, likesCount: 920000, postsCount: 178, healthStatus: 'normal', createdAt: '2026-02-20' },
  { id: 'a9', platform: 'xiaohongshu', nickname: '美妆小课堂', groupName: '时尚美妆组', authStatus: 'authorized', followersCount: 156000, followingCount: 280, likesCount: 2800000, postsCount: 260, healthStatus: 'warning', createdAt: '2026-03-10' },
  { id: 'a3', platform: 'wechat', nickname: '品牌官方号', groupName: '品牌官方组', authStatus: 'authorized', followersCount: 42000, followingCount: 80, likesCount: 560000, postsCount: 120, healthStatus: 'normal', createdAt: '2026-01-15' },
  { id: 'a7', platform: 'wechat', nickname: '官方旗舰店', groupName: '品牌官方组', authStatus: 'authorized', followersCount: 38000, followingCount: 60, likesCount: 480000, postsCount: 95, healthStatus: 'normal', createdAt: '2026-02-25' },
  { id: 'a12', platform: 'wechat', nickname: '科普中国', groupName: '知识科普组', authStatus: 'authorized', followersCount: 28000, followingCount: 45, likesCount: 320000, postsCount: 140, healthStatus: 'normal', createdAt: '2026-03-20' },
  { id: 'a4', platform: 'bilibili', nickname: '科技UP主', groupName: '科技数码组', authStatus: 'authorized', followersCount: 98000, followingCount: 120, likesCount: 1600000, postsCount: 210, healthStatus: 'normal', createdAt: '2026-01-18' },
  { id: 'a8', platform: 'bilibili', nickname: '数码测评君', groupName: '科技数码组', authStatus: 'expired', followersCount: 72000, followingCount: 95, likesCount: 1100000, postsCount: 165, healthStatus: 'error', createdAt: '2026-03-05' },
  { id: 'a11', platform: 'bilibili', nickname: '知识大爆炸', groupName: '知识科普组', authStatus: 'authorized', followersCount: 54000, followingCount: 70, likesCount: 780000, postsCount: 130, healthStatus: 'normal', createdAt: '2026-03-15' },
];

const platformLabels: Record<PlatformType, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  bilibili: 'B站',
};

const mockTasks: MonitorTask[] = [
  { id: 'm1', taskName: '新粉自动欢迎', monitorType: 'new_follower', monitoredAccountIds: ['a1', 'a2'], keywords: [], matchMode: 'contains', actionType: 'reply_message', actionAccountId: 'a1', actionContent: '感谢关注！有什么可以帮你的吗～', actionMediaType: 'text', actionDelaySeconds: 5, isEnabled: true, hitCount: 1286, frequencyLimitHour: 50, frequencyLimitDay: 500, minIntervalSeconds: 10, maxIntervalSeconds: 30, createdAt: '2026-08-10' },
  { id: 'm2', taskName: '价格咨询自动回复', monitorType: 'message_keyword', monitoredAccountIds: ['a1'], keywords: ['价格', '多少钱', '贵吗', '优惠'], matchMode: 'contains', actionType: 'reply_message', actionAccountId: 'a1', actionContent: '人均大概150元左右，现在团购更优惠哦～', actionMediaType: 'text', actionDelaySeconds: 3, isEnabled: true, hitCount: 342, frequencyLimitHour: 30, frequencyLimitDay: 200, minIntervalSeconds: 20, maxIntervalSeconds: 60, createdAt: '2026-08-15' },
  { id: 'm3', taskName: '评论区求链接', monitorType: 'comment_keyword', monitoredAccountIds: ['a2'], keywords: ['链接', '怎么买', '在哪买', '求链接'], matchMode: 'contains', actionType: 'reply_comment', actionAccountId: 'a2', actionContent: '点击主页商品橱窗即可购买哦～', actionMediaType: 'text', actionDelaySeconds: 10, isEnabled: true, hitCount: 567, frequencyLimitHour: 40, frequencyLimitDay: 300, minIntervalSeconds: 15, maxIntervalSeconds: 45, createdAt: '2026-08-20' },
  { id: 'm4', taskName: '负面评论监控', monitorType: 'comment_keyword', monitoredAccountIds: ['a1', 'a3'], keywords: ['投诉', '垃圾', '不好', '差评'], matchMode: 'contains', actionType: 'reply_comment', actionAccountId: 'a1', actionContent: '非常抱歉给您带来不好的体验，请私信我们详细情况，我们会尽快处理', actionMediaType: 'text', actionDelaySeconds: 15, isEnabled: false, hitCount: 23, frequencyLimitHour: 20, frequencyLimitDay: 100, minIntervalSeconds: 30, maxIntervalSeconds: 90, createdAt: '2026-09-01' },
  { id: 'm5', taskName: '私信合作引导', monitorType: 'message_keyword', monitoredAccountIds: ['a2', 'a4'], keywords: ['合作', '商务', '推广'], matchMode: 'exact', actionType: 'reply_message', actionAccountId: 'a2', actionContent: '商务合作请发邮件至 business@example.com', actionMediaType: 'text', actionDelaySeconds: 60, isEnabled: true, hitCount: 89, frequencyLimitHour: 10, frequencyLimitDay: 50, minIntervalSeconds: 60, maxIntervalSeconds: 120, createdAt: '2026-09-05' },
  { id: 'm6', taskName: '视频号新粉关怀', monitorType: 'new_follower', monitoredAccountIds: ['a3'], keywords: [], matchMode: 'contains', actionType: 'reply_message', actionAccountId: 'a3', actionContent: '感谢关注视频号！更多精彩内容持续更新中～', actionMediaType: 'text', actionDelaySeconds: 10, isEnabled: true, hitCount: 456, frequencyLimitHour: 30, frequencyLimitDay: 200, minIntervalSeconds: 20, maxIntervalSeconds: 60, createdAt: '2026-09-10' },
];

const mockHitRecords: MonitorHitRecord[] = [
  { id: 'h1', taskId: 'm1', taskName: '新粉自动欢迎', monitorType: 'new_follower', triggeredAccountId: 'a1', triggeredAccountNickname: '美食探店小队', targetUserPlatformId: 'u1', targetUserNickname: '小甜心', actionType: 'reply_message', actionStatus: 'success', createdAt: '2026-09-28 10:30:15', executedAt: '2026-09-28 10:30:20' },
  { id: 'h2', taskId: 'm2', taskName: '价格咨询自动回复', monitorType: 'message_keyword', triggeredAccountId: 'a1', triggeredAccountNickname: '美食探店小队', hitKeyword: '价格', targetUserPlatformId: 'u2', targetUserNickname: '阳光少年', sourceContent: '请问价格是多少呀', actionType: 'reply_message', actionStatus: 'success', createdAt: '2026-09-28 10:25:00', executedAt: '2026-09-28 10:25:03' },
  { id: 'h3', taskId: 'm3', taskName: '评论区求链接', monitorType: 'comment_keyword', triggeredAccountId: 'a2', triggeredAccountNickname: '生活种草日记', hitKeyword: '链接', targetUserPlatformId: 'u3', targetUserNickname: '爱吃鱼的猫', sourceContent: '求链接！！', actionType: 'reply_comment', actionStatus: 'success', createdAt: '2026-09-28 10:20:30', executedAt: '2026-09-28 10:20:40' },
  { id: 'h4', taskId: 'm2', taskName: '价格咨询自动回复', monitorType: 'message_keyword', triggeredAccountId: 'a1', triggeredAccountNickname: '美食探店小队', hitKeyword: '多少钱', targetUserPlatformId: 'u4', targetUserNickname: '柠檬不萌', sourceContent: '人均多少钱呀', actionType: 'reply_message', actionStatus: 'failed', actionFailReason: 'frequency_limit', createdAt: '2026-09-28 10:15:00' },
  { id: 'h5', taskId: 'm1', taskName: '新粉自动欢迎', monitorType: 'new_follower', triggeredAccountId: 'a2', triggeredAccountNickname: '生活种草日记', targetUserPlatformId: 'u5', targetUserNickname: '追梦人', actionType: 'reply_message', actionStatus: 'success', createdAt: '2026-09-28 10:10:10', executedAt: '2026-09-28 10:10:15' },
  { id: 'h6', taskId: 'm3', taskName: '评论区求链接', monitorType: 'comment_keyword', triggeredAccountId: 'a2', triggeredAccountNickname: '生活种草日记', hitKeyword: '在哪买', targetUserPlatformId: 'u6', targetUserNickname: '星星点灯', sourceContent: '请问在哪买的呀', actionType: 'reply_comment', actionStatus: 'pending', createdAt: '2026-09-28 10:05:00' },
  { id: 'h7', taskId: 'm5', taskName: '私信合作引导', monitorType: 'message_keyword', triggeredAccountId: 'a2', triggeredAccountNickname: '生活种草日记', hitKeyword: '合作', targetUserPlatformId: 'u7', targetUserNickname: '大海无量', sourceContent: '您好，有合作意向', actionType: 'reply_message', actionStatus: 'failed', actionFailReason: 'need_mutual_follow', createdAt: '2026-09-28 09:55:00' },
  { id: 'h8', taskId: 'm6', taskName: '视频号新粉关怀', monitorType: 'new_follower', triggeredAccountId: 'a3', triggeredAccountNickname: '品牌官方号', targetUserPlatformId: 'u8', targetUserNickname: '清风徐来', actionType: 'reply_message', actionStatus: 'success', createdAt: '2026-09-28 09:50:00', executedAt: '2026-09-28 09:50:10' },
  { id: 'h9', taskId: 'm3', taskName: '评论区求链接', monitorType: 'comment_keyword', triggeredAccountId: 'a2', triggeredAccountNickname: '生活种草日记', hitKeyword: '求链接', targetUserPlatformId: 'u9', targetUserNickname: '我是小透明', sourceContent: '求链接求链接', actionType: 'reply_comment', actionStatus: 'failed', actionFailReason: 'content_blocked', createdAt: '2026-09-28 09:45:00' },
  { id: 'h10', taskId: 'm1', taskName: '新粉自动欢迎', monitorType: 'new_follower', triggeredAccountId: 'a1', triggeredAccountNickname: '美食探店小队', targetUserPlatformId: 'u10', targetUserNickname: '云淡风轻', actionType: 'reply_message', actionStatus: 'success', createdAt: '2026-09-28 09:40:00', executedAt: '2026-09-28 09:40:05' },
  { id: 'h11', taskId: 'm2', taskName: '价格咨询自动回复', monitorType: 'message_keyword', triggeredAccountId: 'a1', triggeredAccountNickname: '美食探店小队', hitKeyword: '优惠', targetUserPlatformId: 'u11', targetUserNickname: '月下独酌', sourceContent: '有优惠吗', actionType: 'reply_message', actionStatus: 'success', createdAt: '2026-09-28 09:35:00', executedAt: '2026-09-28 09:35:03' },
  { id: 'h12', taskId: 'm4', taskName: '负面评论监控', monitorType: 'comment_keyword', triggeredAccountId: 'a1', triggeredAccountNickname: '美食探店小队', hitKeyword: '差评', targetUserPlatformId: 'u12', targetUserNickname: '故事里的人', sourceContent: '差评！太失望了', actionType: 'reply_comment', actionStatus: 'pending', createdAt: '2026-09-28 09:30:00' },
  { id: 'h13', taskId: 'm6', taskName: '视频号新粉关怀', monitorType: 'new_follower', triggeredAccountId: 'a3', triggeredAccountNickname: '品牌官方号', targetUserPlatformId: 'u13', targetUserNickname: '浮生若梦', actionType: 'reply_message', actionStatus: 'failed', actionFailReason: 'out_of_window', createdAt: '2026-09-28 09:25:00' },
  { id: 'h14', taskId: 'm5', taskName: '私信合作引导', monitorType: 'message_keyword', triggeredAccountId: 'a4', triggeredAccountNickname: '科技UP主', hitKeyword: '商务', targetUserPlatformId: 'u14', targetUserNickname: '半世晨晓', sourceContent: '商务合作请联系', actionType: 'reply_message', actionStatus: 'success', createdAt: '2026-09-28 09:20:00', executedAt: '2026-09-28 09:21:00' },
  { id: 'h15', taskId: 'm1', taskName: '新粉自动欢迎', monitorType: 'new_follower', triggeredAccountId: 'a1', triggeredAccountNickname: '美食探店小队', targetUserPlatformId: 'u15', targetUserNickname: '人间不值得', actionType: 'reply_message', actionStatus: 'success', createdAt: '2026-09-28 09:15:00', executedAt: '2026-09-28 09:15:05' },
];

const AutomationMonitorPage = () => {
  const [tasks, setTasks] = useState<MonitorTask[]>(mockTasks);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [monitorType, setMonitorType] = useState<MonitorType>('message_keyword');
  const [activeTab, setActiveTab] = useState<'tasks' | 'records'>('tasks');
  const [recordTaskFilter, setRecordTaskFilter] = useState('all');
  const [recordStatusFilter, setRecordStatusFilter] = useState('all');
  const [wizardStep, setWizardStep] = useState(1);
  const wizardTotalSteps = 6;
  // 顶部筛选：三级联动
  const [platformFilter, setPlatformFilter] = useState<PlatformType | 'all'>('all');
  const [groupFilter, setGroupFilter] = useState<string | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all');
  // 新建向导内的账号筛选（监控对象多选）
  const [wizardPlatform, setWizardPlatform] = useState<PlatformType | 'all'>('all');
  const [wizardGroup, setWizardGroup] = useState<string | 'all'>('all');
  const [wizardAccount, setWizardAccount] = useState<string | 'all'>('all');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(['a1', 'a2']);
  // 新建向导内动作账号筛选
  const [actionPlatform, setActionPlatform] = useState<PlatformType | 'all'>('douyin');
  const [actionGroup, setActionGroup] = useState<string | 'all'>('all');
  const [actionAccountId, setActionAccountId] = useState<string | 'all'>('a1');
  // 任务名称和关键词输入
  const [taskName, setTaskName] = useState('');
  const [wizardKeywords, setWizardKeywords] = useState('');
  const [wizardMatchMode, setWizardMatchMode] = useState('contains');
  const [wizardActionContent, setWizardActionContent] = useState('');
  const [wizardActionType, setWizardActionType] = useState('reply_message');
  const [wizardActionMediaType, setWizardActionMediaType] = useState('text');
  const [wizardDelaySeconds, setWizardDelaySeconds] = useState('10');
  const [wizardFreqHour, setWizardFreqHour] = useState('30');
  const [wizardFreqDay, setWizardFreqDay] = useState('200');
  const [wizardMinInterval, setWizardMinInterval] = useState('30');
  const [wizardMaxInterval, setWizardMaxInterval] = useState('90');
  const [wizardEnabledAfterCreate, setWizardEnabledAfterCreate] = useState(true);
  // 监控类型筛选
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // 命中记录搜索
  const [recordSearch, setRecordSearch] = useState('');
  // 详情弹窗
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<MonitorTask | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'records' | 'logs'>('info');
  // 删除确认
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 2500);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, isEnabled: !t.isEnabled } : t)));
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task: MonitorTask) => {
      if (platformFilter !== 'all') {
        const matchPlatform = task.monitoredAccountIds.some((aid: string) => {
          const acc = mockAccounts.find((a: PlatformAccount) => a.id === aid);
          return acc?.platform === platformFilter;
        });
        if (!matchPlatform) return false;
      }
      if (accountFilter !== 'all' && !task.monitoredAccountIds.includes(accountFilter)) return false;
      if (typeFilter !== 'all' && task.monitorType !== typeFilter) return false;
      return true;
    });
  }, [tasks, platformFilter, accountFilter, typeFilter]);

  // 向导步骤2：按平台/分组过滤后的可选账号
  const wizardFilteredAccounts = mockAccounts.filter((acc: PlatformAccount) => {
    if (wizardPlatform !== 'all' && acc.platform !== wizardPlatform) return false;
    if (wizardGroup !== 'all' && acc.groupName !== mockGroups.find((g: AccountGroup) => g.id === wizardGroup)?.groupName) return false;
    return true;
  });

  const toggleWizardAccount = (aid: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(aid) ? prev.filter((x: string) => x !== aid) : [...prev, aid],
    );
  };

  const filteredRecords = useMemo(() => {
    return mockHitRecords.filter((r) => {
      if (recordTaskFilter !== 'all' && r.taskId !== recordTaskFilter) return false;
      if (recordStatusFilter !== 'all' && r.actionStatus !== recordStatusFilter) return false;
      if (recordSearch) {
        const searchLower = recordSearch.toLowerCase();
        if (!r.taskName.toLowerCase().includes(searchLower) &&
            !r.targetUserNickname.toLowerCase().includes(searchLower) &&
            !r.triggeredAccountNickname.toLowerCase().includes(searchLower) &&
            !(r.hitKeyword || '').toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [recordTaskFilter, recordStatusFilter, recordSearch]);

  const failBadgeClass = (reason?: string): string => {
    if (!reason) return '';
    const reasonKey = reason as SendFailReason;
    const map: Record<SendFailReason, string> = {
      frequency_limit: 'bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/30',
      need_mutual_follow: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      private_account: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      out_of_window: 'bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/30',
      content_blocked: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      auth_error: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30',
      unknown: 'bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/30',
    };
    return map[reasonKey] || map.unknown;
  };

  // 统计数据
  const taskStats = useMemo(() => {
    const total = tasks.length;
    const enabled = tasks.filter((t) => t.isEnabled).length;
    const totalHits = tasks.reduce((s, t) => s + t.hitCount, 0);
    const todayHits = mockHitRecords.filter((r) => r.createdAt?.startsWith('2026-09-28')).length;
    const successRate = mockHitRecords.length > 0
      ? Math.round((mockHitRecords.filter((r) => r.actionStatus === 'success').length / mockHitRecords.length) * 100)
      : 0;
    return { total, enabled, totalHits, todayHits, successRate };
  }, [tasks]);

  // 打开新建向导
  const openWizard = () => {
    setTaskName('');
    setMonitorType('message_keyword');
    setSelectedAccountIds([]);
    setWizardKeywords('');
    setWizardMatchMode('contains');
    setWizardActionContent('');
    setWizardActionType('reply_message');
    setWizardActionMediaType('text');
    setWizardDelaySeconds('10');
    setWizardFreqHour('30');
    setWizardFreqDay('200');
    setWizardMinInterval('30');
    setWizardMaxInterval('90');
    setWizardEnabledAfterCreate(true);
    setWizardStep(1);
    setDialogOpen(true);
  };

  // 完成创建
  const handleCreateTask = () => {
    if (!taskName.trim()) {
      showToast('请输入任务名称', 'error');
      return;
    }
    if (selectedAccountIds.length === 0) {
      showToast('请至少选择一个监控账号', 'error');
      return;
    }
    if (monitorType !== 'new_follower' && !wizardKeywords.trim()) {
      showToast('请输入关键词', 'error');
      return;
    }
    const keywordsList = monitorType === 'new_follower' ? [] : wizardKeywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean);
    const newTask: MonitorTask = {
      id: `m${Date.now()}`,
      taskName: taskName.trim(),
      monitorType,
      monitoredAccountIds: selectedAccountIds,
      keywords: keywordsList,
      matchMode: wizardMatchMode as any,
      actionType: wizardActionType as any,
      actionAccountId: actionAccountId,
      actionContent: wizardActionContent,
      actionMediaType: wizardActionMediaType as any,
      actionDelaySeconds: Number(wizardDelaySeconds),
      isEnabled: wizardEnabledAfterCreate,
      hitCount: 0,
      frequencyLimitHour: Number(wizardFreqHour),
      frequencyLimitDay: Number(wizardFreqDay),
      minIntervalSeconds: Number(wizardMinInterval),
      maxIntervalSeconds: Number(wizardMaxInterval),
      createdAt: new Date().toISOString().split('T')[0],
    };
    setTasks([newTask, ...tasks]);
    setDialogOpen(false);
    setWizardStep(1);
    showToast('监控任务创建成功');
  };

  // 查看任务详情
  const handleViewDetail = (task: MonitorTask) => {
    setDetailTask(task);
    setDetailTab('info');
    setDetailOpen(true);
  };

  // 删除任务
  const handleDeleteClick = (id: string) => {
    setTaskToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (!taskToDelete) return;
    setTasks(tasks.filter((t) => t.id !== taskToDelete));
    if (detailTask?.id === taskToDelete) {
      setDetailOpen(false);
      setDetailTask(null);
    }
    setDeleteConfirmOpen(false);
    setTaskToDelete(null);
    showToast('任务已删除');
  };

  // 查看命中记录（从任务列表眼睛按钮）
  const handleViewRecords = (taskId: string) => {
    setRecordTaskFilter(taskId);
    setActiveTab('records');
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
        <Shield className="w-4 h-4" />
        <AlertTitle className="font-semibold">合规提醒</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>· 仅可监控本账号下已授权绑定的自有矩阵账号</p>
          <p>· 数据来自官方开放接口，不支持未授权的他人账号</p>
          <p>· 自动动作同样受频率与节奏限制，遵守平台规则</p>
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">监控任务</h1>
      </div>

       {/* 统计卡片 */}
       <div className="grid grid-cols-4 gap-4 mb-4" data-ai-section-type="card-stat">
         {[
           { label: '任务总数', value: taskStats.total, icon: Shield, color: 'text-primary' },
           { label: '已启用', value: taskStats.enabled, icon: CheckCircle2, color: 'text-[hsl(130_54%_42%)]' },
           { label: '总命中次数', value: taskStats.totalHits.toLocaleString(), icon: Zap, color: 'text-[hsl(26_90%_49%)]' },
           { label: '今日命中', value: taskStats.todayHits, icon: TrendingUp, color: 'text-[hsl(200_90%_55%)]' },
         ].map((s, i) => (
           <Card key={i}>
             <CardContent className="p-4 flex items-center gap-3">
               <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                 <s.icon className={`w-5 h-5 ${s.color}`} />
               </div>
               <div className="flex-1">
                 <div className="text-2xl font-bold text-foreground">{s.value}</div>
                 <div className="text-xs text-muted-foreground">{s.label}</div>
               </div>
             </CardContent>
           </Card>
         ))}
       </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tasks' | 'records')} className="w-full">
         <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="tasks">监控任务</TabsTrigger>
            <TabsTrigger value="records">命中记录</TabsTrigger>
          </TabsList>

        <TabsContent value="tasks">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 flex-wrap flex-1">
              <AccountSelector
                accounts={mockAccounts}
                groups={mockGroups}
                platform={platformFilter}
                groupId={groupFilter}
                accountId={accountFilter}
                onPlatformChange={setPlatformFilter}
                onGroupChange={setGroupFilter}
                onAccountChange={setAccountFilter}
                size="sm"
              />
               <Select value={typeFilter} onValueChange={setTypeFilter}>
                 <SelectTrigger className="w-36">
                   <SelectValue placeholder="监控类型" />
                 </SelectTrigger>
                 <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="new_follower">新增粉丝</SelectItem>
                  <SelectItem value="message_keyword">私信关键词</SelectItem>
                  <SelectItem value="comment_keyword">评论关键词</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
               <DialogTrigger asChild>
                 <Button onClick={openWizard}>
                   <Plus className="w-4 h-4" />新建监控任务
                 </Button>
               </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>新建监控任务</DialogTitle>
                </DialogHeader>

                {/* 步骤指示器 */}
                <div className="flex items-center justify-between py-2 px-1">
                  {[1, 2, 3, 4, 5, 6].map((step) => (
                    <div key={step} className="flex items-center flex-1 last:flex-none">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                            wizardStep > step
                              ? 'bg-[hsl(130_54%_42%)] text-white'
                              : wizardStep === step
                              ? 'bg-primary text-white'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {wizardStep > step ? <CheckCircle2 className="w-4 h-4" /> : step}
                        </div>
                      </div>
                      {step < 6 && (
                        <div
                          className={cn(
                            'flex-1 h-0.5 mx-1',
                            wizardStep > step ? 'bg-[hsl(130_54%_42%)]' : 'bg-muted'
                          )}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="text-xs text-center text-muted-foreground mb-4">
                  步骤 {wizardStep} / {wizardTotalSteps} ：
                  {wizardStep === 1 && '基本信息'}
                  {wizardStep === 2 && '选择监控对象'}
                  {wizardStep === 3 && '设置触发条件'}
                  {wizardStep === 4 && '编排自动动作'}
                  {wizardStep === 5 && '频率与节奏控制'}
                  {wizardStep === 6 && '合规确认与启用'}
                </div>

                <div className="space-y-4 min-h-[320px]">
                  {/* 步骤 1：基本信息 */}
                   {wizardStep === 1 && (
                     <>
                       <div>
                         <label className="text-sm font-medium mb-1.5 block">任务名称</label>
                         <Input
                           placeholder="请输入任务名称，便于内部识别"
                           value={taskName}
                           onChange={(e) => setTaskName(e.target.value)}
                         />
                       </div>
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">监控类型</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['new_follower', 'message_keyword', 'comment_keyword'] as MonitorType[]).map((t) => {
                            const Icon = monitorTypeIcons[t];
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setMonitorType(t)}
                                className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border transition-colors ${
                                  monitorType === t
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : 'border-border hover:border-primary/30'
                                }`}
                              >
                                <Icon className="w-5 h-5" />
                                <span className="text-xs">{monitorTypeLabels[t]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* 步骤 2：监控对象 */}
                  {wizardStep === 2 && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-2 block">按平台/分组筛选账号</label>
                        <AccountSelector
                          accounts={mockAccounts}
                          groups={mockGroups}
                          platform={wizardPlatform}
                          groupId={wizardGroup}
                          accountId={wizardAccount}
                          onPlatformChange={setWizardPlatform}
                          onGroupChange={setWizardGroup}
                          onAccountChange={setWizardAccount}
                          size="sm"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          监控账号（多选，已选 {selectedAccountIds.length} 个）
                        </label>
                        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                          {wizardFilteredAccounts.length === 0 && (
                            <div className="text-center text-muted-foreground text-sm py-6">
                              当前筛选下暂无账号
                            </div>
                          )}
                          {wizardFilteredAccounts.map((acc: PlatformAccount) => (
                            <label
                              key={acc.id}
                              className="flex items-center gap-2 p-2.5 border border-border rounded-md cursor-pointer hover:bg-muted/30 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedAccountIds.includes(acc.id)}
                                onChange={() => toggleWizardAccount(acc.id)}
                                className="h-4 w-4"
                              />
                              <span className="text-sm flex-1">
                                {acc.nickname || '未命名账号'}
                                <span className="text-xs text-muted-foreground ml-2">
                                  {platformLabels[acc.platform]}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">仅限自有已授权矩阵账号，不支持监控他人账号</p>
                      </div>
                    </div>
                  )}

                  {/* 步骤 3：触发条件 */}
                  {wizardStep === 3 && (
                    <>
                      {monitorType === 'new_follower' ? (
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <UserPlus className="w-10 h-10 text-primary mx-auto mb-2" />
                          <div className="text-sm font-medium mb-1">新增粉丝触发</div>
                          <p className="text-xs text-muted-foreground">
                            当监控账号有新粉丝时自动触发后续动作，无需额外设置关键词
                          </p>
                        </div>
                      ) : (
                        <>
                           <div>
                             <label className="text-sm font-medium mb-1.5 block">关键词（多个用逗号分隔）</label>
                             <Input
                               placeholder="如：价格,多少钱,优惠"
                               value={wizardKeywords}
                               onChange={(e) => setWizardKeywords(e.target.value)}
                             />
                             <p className="text-xs text-muted-foreground mt-1">用户消息/评论中包含任一关键词即触发</p>
                           </div>
                           <div>
                             <label className="text-sm font-medium mb-1.5 block">匹配模式</label>
                             <Select value={wizardMatchMode} onValueChange={setWizardMatchMode}>
                               <SelectTrigger><SelectValue /></SelectTrigger>
                               <SelectContent>
                                <SelectItem value="contains">包含匹配（出现关键词即命中）</SelectItem>
                                <SelectItem value="exact">精确匹配（完全一致才命中）</SelectItem>
                                <SelectItem value="fuzzy">模糊匹配（近似语义匹配）</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* 步骤 4：动作编排 */}
                  {wizardStep === 4 && (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">动作步骤</div>
                      <div className="border border-border rounded-lg p-3 space-y-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="bg-primary/10 text-primary font-medium px-2 py-0.5 rounded">动作 1</span>
                        </div>
                         <div className="grid grid-cols-2 gap-3">
                           <div>
                             <label className="text-xs text-muted-foreground mb-1 block">动作类型</label>
                             <Select value={wizardActionType} onValueChange={setWizardActionType}>
                               <SelectTrigger><SelectValue /></SelectTrigger>
                               <SelectContent>
                                 <SelectItem value="reply_message">回复私信</SelectItem>
                                 <SelectItem value="reply_comment">回复评论</SelectItem>
                               </SelectContent>
                             </Select>
                           </div>
                           <div>
                             <label className="text-xs text-muted-foreground mb-1 block">执行账号</label>
                             <AccountSelector
                               accounts={mockAccounts}
                               groups={mockGroups}
                               platform={actionPlatform}
                               groupId={actionGroup}
                               accountId={actionAccountId}
                               onPlatformChange={setActionPlatform}
                               onGroupChange={setActionGroup}
                               onAccountChange={setActionAccountId}
                               size="sm"
                               showAllOption={false}
                               placeholderAccount="请选择执行账号"
                             />
                           </div>
                         </div>
                         <div>
                           <label className="text-xs text-muted-foreground mb-1 block">消息类型</label>
                           <Select value={wizardActionMediaType} onValueChange={setWizardActionMediaType}>
                             <SelectTrigger><SelectValue /></SelectTrigger>
                             <SelectContent>
                               <SelectItem value="text">文本</SelectItem>
                               <SelectItem value="image">图片</SelectItem>
                               <SelectItem value="link">链接</SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                         <div>
                           <label className="text-xs text-muted-foreground mb-1 block">消息内容</label>
                           <Textarea
                             placeholder="请输入自动回复内容"
                             className="min-h-[80px] resize-none"
                             value={wizardActionContent}
                             onChange={(e) => setWizardActionContent(e.target.value)}
                           />
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                           <div>
                             <label className="text-xs text-muted-foreground mb-1 block">延迟秒数</label>
                             <Select value={wizardDelaySeconds} onValueChange={setWizardDelaySeconds}>
                               <SelectTrigger><SelectValue /></SelectTrigger>
                               <SelectContent>
                                <SelectItem value="0">立即执行</SelectItem>
                                <SelectItem value="5">延迟 5 秒</SelectItem>
                                <SelectItem value="10">延迟 10 秒</SelectItem>
                                <SelectItem value="30">延迟 30 秒</SelectItem>
                                <SelectItem value="60">延迟 60 秒</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="w-full border-dashed">
                        <Plus className="w-4 h-4" />
                        添加下一步动作
                      </Button>
                    </div>
                  )}

                  {/* 步骤 5：频控设置 */}
                  {wizardStep === 5 && (
                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-3">
                         <div>
                           <label className="text-sm font-medium mb-1.5 block">每小时上限</label>
                           <Input
                             type="number"
                             value={wizardFreqHour}
                             onChange={(e) => setWizardFreqHour(e.target.value)}
                           />
                           <p className="text-xs text-muted-foreground mt-1">每小时最多执行次数</p>
                         </div>
                         <div>
                           <label className="text-sm font-medium mb-1.5 block">每日上限</label>
                           <Input
                             type="number"
                             value={wizardFreqDay}
                             onChange={(e) => setWizardFreqDay(e.target.value)}
                           />
                           <p className="text-xs text-muted-foreground mt-1">当日总执行次数上限</p>
                         </div>
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                         <div>
                           <label className="text-sm font-medium mb-1.5 block">最小间隔（秒）</label>
                           <Input
                             type="number"
                             value={wizardMinInterval}
                             onChange={(e) => setWizardMinInterval(e.target.value)}
                           />
                         </div>
                         <div>
                           <label className="text-sm font-medium mb-1.5 block">最大间隔（秒）</label>
                           <Input
                             type="number"
                             value={wizardMaxInterval}
                             onChange={(e) => setWizardMaxInterval(e.target.value)}
                           />
                         </div>
                       </div>
                      <Alert variant="default" className="bg-info/10 border-info/30">
                        <Info className="w-4 h-4 text-info" />
                        <AlertDescription className="text-info text-xs">
                          随机间隔可模拟人工操作节奏，降低被平台检测为自动化行为的风险。建议最小间隔不低于 30 秒。
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}

                  {/* 步骤 6：合规确认 */}
                  {wizardStep === 6 && (
                    <div className="space-y-4">
                      <Alert variant="destructive">
                        <Shield className="w-4 h-4" />
                        <AlertTitle className="font-semibold text-sm">合规声明</AlertTitle>
                        <AlertDescription className="text-xs space-y-1 mt-1">
                          <p>· 我确认所监控的账号均为自有并已获得平台授权</p>
                          <p>· 自动回复内容不违反各平台社区规范与法律法规</p>
                          <p>· 不会利用此功能进行营销骚扰、刷单刷量等违规行为</p>
                          <p>· 理解平台限制可能导致发送失败，系统会如实记录失败原因</p>
                        </AlertDescription>
                      </Alert>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="h-4 w-4 mt-0.5" />
                        <span className="text-sm">我已阅读并同意以上合规声明</span>
                      </label>
                       <div className="flex items-center justify-between pt-3 border-t">
                         <span className="text-sm font-medium">创建后立即启用</span>
                         <Switch checked={wizardEnabledAfterCreate} onCheckedChange={setWizardEnabledAfterCreate} />
                       </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex items-center justify-between pt-4">
                  <div>
                    {wizardStep > 1 ? (
                      <Button variant="outline" onClick={() => setWizardStep(wizardStep - 1)}>
                        <ChevronLeft className="w-4 h-4" />
                        上一步
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => { setDialogOpen(false); setWizardStep(1); }}>
                        取消
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                     {wizardStep < wizardTotalSteps ? (
                       <Button onClick={() => setWizardStep(wizardStep + 1)}>
                         下一步
                         <ChevronRight className="w-4 h-4" />
                       </Button>
                     ) : (
                       <Button onClick={handleCreateTask}>
                         <CheckCircle2 className="w-4 h-4" />
                         完成创建
                       </Button>
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
                    <TableHead>监控类型</TableHead>
                    <TableHead>监控账号数</TableHead>
                    <TableHead>关键词</TableHead>
                    <TableHead>动作类型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>命中次数</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task: MonitorTask) => {
                    const Icon = monitorTypeIcons[task.monitorType];
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.taskName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-4 h-4 text-primary" />
                            <span>{monitorTypeLabels[task.monitorType]}</span>
                          </div>
                        </TableCell>
                        <TableCell>{task.monitoredAccountIds.length} 个</TableCell>
                        <TableCell>
                          {task.keywords && task.keywords.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {task.keywords.slice(0, 3).map((kw, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] h-5">{kw}</Badge>
                              ))}
                              {task.keywords.length > 3 && (
                                <Badge variant="outline" className="text-[10px] h-5">+{task.keywords.length - 3}</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{actionTypeLabels[task.actionType]}</TableCell>
                        <TableCell>
                          <Switch checked={task.isEnabled} onCheckedChange={() => toggleTask(task.id)} />
                        </TableCell>
                        <TableCell>{task.hitCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                           <div className="flex justify-end gap-1">
                             <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleViewRecords(task.id)} title="查看命中记录">
                               <Eye className="w-3.5 h-3.5" />
                             </Button>
                             <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleViewDetail(task)} title="详情">
                               <Edit3 className="w-3.5 h-3.5" />
                             </Button>
                             <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => handleDeleteClick(task.id)} title="删除">
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
        </TabsContent>

        <TabsContent value="records">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <Select value={recordTaskFilter} onValueChange={setRecordTaskFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="全部任务" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部任务</SelectItem>
                {mockTasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.taskName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={recordStatusFilter} onValueChange={setRecordStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="pending">待执行</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative ml-auto">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
               <Input
                 placeholder="搜索"
                 className="pl-9 w-56"
                 value={recordSearch}
                 onChange={(e) => setRecordSearch(e.target.value)}
               />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>任务名称</TableHead>
                    <TableHead>监控类型</TableHead>
                    <TableHead>触发账号</TableHead>
                    <TableHead>命中关键词</TableHead>
                    <TableHead>目标用户</TableHead>
                    <TableHead>动作状态</TableHead>
                    <TableHead>失败原因</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => {
                    const Icon = monitorTypeIcons[record.monitorType];
                    const reason = record.actionFailReason as SendFailReason | undefined;
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="text-muted-foreground text-xs">{record.createdAt}</TableCell>
                        <TableCell className="font-medium">{record.taskName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Icon className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs">{monitorTypeLabels[record.monitorType]}</span>
                          </div>
                        </TableCell>
                        <TableCell>{record.triggeredAccountNickname}</TableCell>
                        <TableCell>
                          {record.hitKeyword ? (
                            <Badge variant="secondary" className="text-[10px] h-5">{record.hitKeyword}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{record.targetUserNickname}</TableCell>
                        <TableCell>
                          <Badge className={actionStatusColors[record.actionStatus]}>
                            {actionStatusLabels[record.actionStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {reason ? (
                            <Badge className={failBadgeClass(reason)} variant="outline">
                              {FAIL_REASON_LABELS[reason]}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
       </Tabs>

       {/* 任务详情弹窗 */}
       <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
         <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>任务详情</DialogTitle>
           </DialogHeader>
           {detailTask && (
             <>
               <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                 <div className="flex items-center gap-2">
                   {(() => {
                     const Icon = monitorTypeIcons[detailTask.monitorType];
                     return (
                       <>
                         <Icon className="w-5 h-5 text-primary" />
                         <h2 className="text-base font-semibold">{detailTask.taskName}</h2>
                       </>
                     );
                   })()}
                 </div>
                 <Badge className={detailTask.isEnabled ? 'bg-[hsl(130_54%_42%)] text-white' : 'bg-secondary text-secondary-foreground'}>
                   {detailTask.isEnabled ? '运行中' : '已停用'}
                 </Badge>
               </div>

               <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as 'info' | 'records' | 'logs')}>
                 <TabsList>
                   <TabsTrigger value="info">基本信息</TabsTrigger>
                   <TabsTrigger value="records">命中记录</TabsTrigger>
                   <TabsTrigger value="logs">执行日志</TabsTrigger>
                 </TabsList>

                 <TabsContent value="info" className="mt-3">
                   <Card>
                     <CardContent className="p-4 space-y-3 text-sm">
                       <div className="grid grid-cols-2 gap-4">
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">监控类型</span>
                           <span>{monitorTypeLabels[detailTask.monitorType]}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">动作类型</span>
                           <span>{actionTypeLabels[detailTask.actionType]}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">匹配模式</span>
                           <span>{matchModeLabels[detailTask.matchMode] || '-'}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">命中次数</span>
                           <span className="font-medium">{detailTask.hitCount.toLocaleString()}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">监控账号数</span>
                           <span>{detailTask.monitoredAccountIds.length} 个</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">创建时间</span>
                           <span>{detailTask.createdAt}</span>
                         </div>
                       </div>
                       {detailTask.keywords && detailTask.keywords.length > 0 && (
                         <div className="pt-3 border-t">
                           <div className="text-muted-foreground text-xs mb-2">监控关键词</div>
                           <div className="flex flex-wrap gap-1.5">
                             {detailTask.keywords.map((kw: string, i: number) => (
                               <Badge key={i} variant="secondary" className="text-[10px] h-5">{kw}</Badge>
                             ))}
                           </div>
                         </div>
                       )}
                       <div className="pt-3 border-t">
                         <div className="text-muted-foreground text-xs mb-2">动作内容</div>
                         <div className="p-3 bg-white border border-border rounded-md text-xs leading-relaxed whitespace-pre-wrap">
                           {detailTask.actionContent || '（无内容）'}
                         </div>
                       </div>
                       <div className="pt-3 border-t grid grid-cols-2 gap-4">
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">每小时上限</span>
                           <span>{detailTask.frequencyLimitHour} 次</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">每日上限</span>
                           <span>{detailTask.frequencyLimitDay} 次</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">最小间隔</span>
                           <span>{detailTask.minIntervalSeconds} 秒</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-muted-foreground">最大间隔</span>
                           <span>{detailTask.maxIntervalSeconds} 秒</span>
                         </div>
                       </div>
                     </CardContent>
                   </Card>
                 </TabsContent>

                 <TabsContent value="records" className="mt-3">
                   <Card>
                     <CardContent className="p-0">
                       <Table>
                         <TableHeader>
                           <TableRow>
                             <TableHead>时间</TableHead>
                             <TableHead>触发账号</TableHead>
                             <TableHead>命中关键词</TableHead>
                             <TableHead>目标用户</TableHead>
                             <TableHead>状态</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {mockHitRecords
                             .filter((r) => r.taskId === detailTask.id)
                             .slice(0, 10)
                             .map((record) => (
                               <TableRow key={record.id}>
                                 <TableCell className="text-xs text-muted-foreground">{record.createdAt}</TableCell>
                                 <TableCell className="text-xs">{record.triggeredAccountNickname}</TableCell>
                                 <TableCell>
                                   {record.hitKeyword ? (
                                     <Badge variant="secondary" className="text-[10px] h-5">{record.hitKeyword}</Badge>
                                   ) : (
                                     <span className="text-muted-foreground text-xs">—</span>
                                   )}
                                 </TableCell>
                                 <TableCell className="text-xs">{record.targetUserNickname}</TableCell>
                                 <TableCell>
                                    <Badge className={cn(actionStatusColors[record.actionStatus], 'text-[10px] h-5')}>
                                     {actionStatusLabels[record.actionStatus]}
                                   </Badge>
                                 </TableCell>
                               </TableRow>
                             ))}
                           {mockHitRecords.filter((r) => r.taskId === detailTask.id).length === 0 && (
                             <TableRow>
                               <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                                 暂无命中记录
                               </TableCell>
                             </TableRow>
                           )}
                         </TableBody>
                       </Table>
                     </CardContent>
                   </Card>
                 </TabsContent>

                 <TabsContent value="logs" className="mt-3">
                   <Card>
                     <CardContent className="p-4">
                       <div className="space-y-2 font-mono text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 max-h-[300px] overflow-y-auto">
                         <div>[2026-09-28 10:30:20] INFO 任务执行成功，命中规则，已发送自动回复</div>
                         <div>[2026-09-28 10:25:03] INFO 任务执行成功，用户消息命中关键词「价格」</div>
                         <div>[2026-09-28 10:15:00] WARN 发送失败：已达到每小时频率上限</div>
                         <div>[2026-09-28 10:10:15] INFO 新粉丝触发自动欢迎语</div>
                         <div>[2026-09-28 09:55:00] WARN 发送失败：对方非粉丝无法私信</div>
                         <div>[2026-09-28 09:45:00] WARN 发送失败：内容被平台拦截，含敏感词</div>
                         <div>[2026-09-28 09:35:03] INFO 评论关键词命中，已自动回复</div>
                         <div>[2026-09-28 09:30:00] INFO 负面评论监控触发，待人工审核</div>
                         <div>[2026-09-28 09:25:00] WARN 不在生效时段内，跳过执行</div>
                         <div>[2026-09-28 09:21:00] INFO 私信合作引导任务执行成功</div>
                         <div>[2026-09-28 09:15:05] INFO 新粉自动欢迎发送成功</div>
                         <div>[2026-09-28 08:00:00] INFO 任务调度器启动，加载 {taskStats.enabled} 个启用任务</div>
                       </div>
                     </CardContent>
                   </Card>
                 </TabsContent>
               </Tabs>
             </>
           )}
           <DialogFooter>
             <Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* 删除确认弹窗 */}
       <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
         <DialogContent className="sm:max-w-md">
           <DialogHeader>
             <DialogTitle>确认删除</DialogTitle>
             <DialogDescription>
               确定要删除该监控任务吗？删除后不可恢复。
             </DialogDescription>
           </DialogHeader>
           <DialogFooter>
             <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
             <Button variant="destructive" onClick={confirmDelete}>
               <Trash2 className="w-3.5 h-3.5 mr-1" />
               确认删除
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* Toast */}
       {toast.show && (
         <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
           <div
             className={cn(
               'px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2',
               toast.type === 'success'
                 ? 'bg-[hsl(130_54%_42%)] text-white'
                 : 'bg-[hsl(2_84%_62%)] text-white'
             )}
           >
             {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
             {toast.message}
           </div>
         </div>
       )}
     </div>
   );
 };

export default AutomationMonitorPage;

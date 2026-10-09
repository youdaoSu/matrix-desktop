import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import {
  Search,
  Download,
  Eye,
  Crown,
  Clock,
  ShieldOff,
  ShieldCheck,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Calendar as CalendarIcon,
  CheckSquare,
  X,
  LogIn,
  Link2,
  FileText,
  UserCog,
  Upload,
} from 'lucide-react';
import type {
  AppUser,
  VipPlan,
  PlatformAccount,
  OperationLog,
  VipStatus,
  UserStatus,
  PlatformType,
} from '@shared/api.interface';

// ─── Types ────────────────────────────────────────────────────────────
interface ActivationRecord {
  id: string;
  code: string;
  planName: string;
  activatedAt: string;
  expiresAt: string;
  days: number;
}

interface UserDetail extends AppUser {
  registerIp: string;
  lastLoginIp?: string;
  activationHistory: ActivationRecord[];
  boundAccounts: PlatformAccount[];
  operationLogs: OperationLog[];
}

// ─── Mock Data ────────────────────────────────────────────────────────
const mockPlans: VipPlan[] = [
  { id: 'p1', name: '月度会员', code: 'monthly', durationDays: 30, maxAccounts: 5, price: '99', status: 'active', sortOrder: 1 },
  { id: 'p2', name: '季度会员', code: 'quarterly', durationDays: 90, maxAccounts: 10, price: '259', status: 'active', sortOrder: 2 },
  { id: 'p3', name: '年度会员', code: 'yearly', durationDays: 365, maxAccounts: 20, price: '899', status: 'active', sortOrder: 3 },
  { id: 'p4', name: '企业版', code: 'enterprise', durationDays: 365, maxAccounts: 50, price: '2999', status: 'active', sortOrder: 4 },
];

const nicknamePool = ['张明', '李红', '王强', '赵燕', '孙伟', '周涛', '吴敏', '郑磊', '冯雪', '陈杰', '黄丽', '刘洋', '徐静', '马超', '朱琳', '胡斌', '郭蕊', '何宇', '高翔', '罗瑶'];
const platformPool: PlatformType[] = ['douyin', 'xiaohongshu', 'wechat', 'bilibili'];
const platformNicknames: Record<PlatformType, string[]> = {
  douyin: ['矩阵小助手', '抖影玩家', '热门精选', '生活记录家', '职场老司机'],
  xiaohongshu: ['种草达人', '穿搭日记', '美食探店', '护肤研究所', '旅行手账'],
  wechat: ['视频号运营', '职场充电站', '亲子时光', '健康生活家', '科技前沿'],
  bilibili: ['UP主小明', '科技宅说', '游戏解说君', '动画区UP', '知识分享官'],
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomIp(): string {
  return `${randInt(1, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function dateTimeStr(daysAgo: number, hour?: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour ?? randInt(0, 23), randInt(0, 59), randInt(0, 59));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function generateUsers(count: number): UserDetail[] {
  const users: UserDetail[] = [];
  for (let i = 0; i < count; i++) {
    const vipStatus: VipStatus =
      i % 5 === 0 ? 'inactive' : i % 7 === 0 ? 'expired' : 'active';
    const status: UserStatus = i % 11 === 0 ? 'disabled' : 'active';
    const planIdx = i % mockPlans.length;
    const plan = mockPlans[planIdx];
    const createdAtDays = randInt(1, 300);
    const lastLoginDays = randInt(0, 30);

    // activation history: 2-3 records
    const histCount = randInt(2, 3);
    const activationHistory: ActivationRecord[] = [];
    let histStartDays = createdAtDays;
    for (let h = 0; h < histCount; h++) {
      const histPlan = mockPlans[randInt(0, mockPlans.length - 1)];
      const activatedAtDays = histStartDays - randInt(0, 30);
      activationHistory.push({
        id: `ah_${i}_${h}`,
        code: `VIP${histPlan.durationDays}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        planName: histPlan.name,
        activatedAt: dateStr(activatedAtDays),
        expiresAt: dateStr(activatedAtDays - histPlan.durationDays),
        days: histPlan.durationDays,
      });
      histStartDays = activatedAtDays - histPlan.durationDays;
    }

    // bound accounts: 1-5
    const accCount = randInt(1, 5);
    const usedPlatforms = new Set<PlatformType>();
    const boundAccounts: PlatformAccount[] = [];
    for (let a = 0; a < accCount; a++) {
      let plat: PlatformType;
      let tries = 0;
      do {
        plat = platformPool[randInt(0, platformPool.length - 1)];
        tries++;
      } while (usedPlatforms.has(plat) && tries < 10);
      usedPlatforms.add(plat);
      const nickList = platformNicknames[plat];
      const nickname = nickList[randInt(0, nickList.length - 1)] + (a > 0 ? a : '');
      const authStatus: PlatformAccount['authStatus'] =
        a === 0 ? 'authorized' : Math.random() > 0.3 ? 'authorized' : 'expired';
      boundAccounts.push({
        id: `acc_${i}_${a}`,
        platform: plat,
        nickname,
        authStatus,
        followersCount: randInt(100, 50000),
        followingCount: randInt(10, 2000),
        likesCount: randInt(1000, 200000),
        postsCount: randInt(5, 500),
        healthStatus: authStatus === 'authorized' ? 'normal' : 'warning',
        createdAt: dateStr(randInt(10, 200)),
      });
    }

    // operation logs: 5-10
    const logCount = randInt(5, 10);
    const logActions = [
      { action: '登录', targetType: 'auth', detail: '用户登录系统', icon: 'login' },
      { action: '绑定账号', targetType: 'platform_account', detail: '绑定抖音账号', icon: 'link' },
      { action: '发布内容', targetType: 'content_post', detail: '发布视频作品', icon: 'upload' },
      { action: '激活VIP', targetType: 'activation_code', detail: '激活授权码', icon: 'crown' },
      { action: '修改资料', targetType: 'user', detail: '修改个人资料', icon: 'user' },
      { action: '修改密码', targetType: 'auth', detail: '重置登录密码', icon: 'key' },
    ];
    const operationLogs: OperationLog[] = [];
    for (let l = 0; l < logCount; l++) {
      const act = logActions[randInt(0, logActions.length - 1)];
      const isAdmin = act.action === '激活VIP';
      operationLogs.push({
        id: `log_${i}_${l}`,
        operatorType: isAdmin ? 'admin' : 'user',
        operatorName: isAdmin ? 'admin' : undefined,
        action: act.action,
        targetType: act.targetType,
        detail: act.detail,
        ipAddress: randomIp(),
        createdAt: dateTimeStr(randInt(0, createdAtDays)),
      });
    }
    operationLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    users.push({
      id: `user_${(i + 1).toString().padStart(3, '0')}`,
      username: `user${i + 1}`,
      nickname: nicknamePool[i % nicknamePool.length] + (i >= nicknamePool.length ? String(i + 1) : ''),
      email: `user${i + 1}@example.com`,
      phone: `138${randInt(1000, 9999)}${randInt(1000, 9999)}`,
      avatarUrl: undefined,
      vipStatus,
      vipPlanId: vipStatus === 'inactive' ? undefined : plan.id,
      vipPlanName: vipStatus === 'inactive' ? undefined : plan.name,
      vipExpiresAt: vipStatus === 'inactive' ? undefined : dateStr(randInt(-30, 300)),
      maxAccounts: plan.maxAccounts,
      status,
      lastLoginAt: status === 'disabled' ? undefined : dateTimeStr(lastLoginDays),
      createdAt: dateTimeStr(createdAtDays),
      registerIp: randomIp(),
      lastLoginIp: status === 'disabled' ? undefined : randomIp(),
      activationHistory,
      boundAccounts,
      operationLogs,
    });
  }
  return users;
}

const allUsers: UserDetail[] = generateUsers(50);

// ─── Helpers ──────────────────────────────────────────────────────────
const vipStatusLabel: Record<VipStatus, string> = {
  active: '活跃',
  expired: '过期',
  inactive: '未激活',
};

const vipStatusVariant = (status: VipStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'active': return 'default';
    case 'expired': return 'destructive';
    case 'inactive': return 'secondary';
  }
};

const vipStatusClass = (status: VipStatus): string => {
  switch (status) {
    case 'active': return 'bg-emerald-500/10 text-emerald-600 border-0';
    case 'expired': return 'bg-orange-500/10 text-orange-600 border-0';
    case 'inactive': return 'bg-slate-100 text-slate-500 border-0 dark:bg-slate-800 dark:text-slate-400';
  }
};

const accountStatusClass = (status: UserStatus): string => {
  return status === 'active'
    ? 'bg-emerald-500/10 text-emerald-600 border-0'
    : 'bg-red-500/10 text-red-600 border-0';
};

const platformLabel = (platform: PlatformType): string => {
  const map: Record<PlatformType, string> = { douyin: '抖音', xiaohongshu: '小红书', wechat: '视频号', bilibili: 'B站' };
  return map[platform];
};

const platformColor = (platform: PlatformType): string => {
  switch (platform) {
    case 'douyin': return 'bg-black text-white';
    case 'xiaohongshu': return 'bg-rose-500 text-white';
    case 'wechat': return 'bg-green-600 text-white';
    case 'bilibili': return 'bg-sky-500 text-white';
  }
};

const logIcon = (action: string) => {
  if (action === '登录') return <LogIn className="w-3.5 h-3.5" />;
  if (action.includes('绑定')) return <Link2 className="w-3.5 h-3.5" />;
  if (action.includes('发布')) return <Upload className="w-3.5 h-3.5" />;
  if (action.includes('VIP') || action.includes('激活')) return <Crown className="w-3.5 h-3.5 text-amber-500" />;
  if (action.includes('资料')) return <UserCog className="w-3.5 h-3.5" />;
  if (action.includes('密码')) return <KeyRound className="w-3.5 h-3.5" />;
  return <FileText className="w-3.5 h-3.5" />;
};

// ─── Component ────────────────────────────────────────────────────────
export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [vipFilter, setVipFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('basic');
  const [vipDialogMode, setVipDialogMode] = useState<'open' | 'extend' | 'batchOpen' | 'batchExtend' | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [startMode, setStartMode] = useState<'immediate' | 'custom'>('immediate');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [vipRemark, setVipRemark] = useState('');
  const [newUserDialogOpen, setNewUserDialogOpen] = useState(false);

  const filteredUsers = useMemo(() => {
    return allUsers.filter((user) => {
      if (search) {
        const kw = search.toLowerCase();
        const match =
          user.username.toLowerCase().includes(kw) ||
          user.nickname?.toLowerCase().includes(kw) ||
          user.email?.toLowerCase().includes(kw) ||
          user.phone?.includes(kw);
        if (!match) return false;
      }
      if (vipFilter !== 'all' && user.vipStatus !== vipFilter) return false;
      if (statusFilter !== 'all' && user.status !== statusFilter) return false;
      if (startDate && new Date(user.createdAt) < startDate) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(user.createdAt) > end) return false;
      }
      return true;
    });
  }, [search, vipFilter, statusFilter, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pagedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
  const allSelected = pagedUsers.length > 0 && pagedUsers.every((u) => selectedIds.includes(u.id));

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedIds(selectedIds.filter((id) => !pagedUsers.find((u) => u.id === id)));
    } else {
      const newIds = [...selectedIds];
      pagedUsers.forEach((u) => { if (!newIds.includes(u.id)) newIds.push(u.id); });
      setSelectedIds(newIds);
    }
  };

  const handleToggleOne = (id: string) => {
    setSelectedIds(selectedIds.includes(id)
      ? selectedIds.filter((i) => i !== id)
      : [...selectedIds, id]);
  };

  const handleViewDetail = (user: UserDetail) => {
    setSelectedUser(user);
    setDetailTab('basic');
    setDetailOpen(true);
  };

  const openVipDialog = (mode: 'open' | 'extend' | 'batchOpen' | 'batchExtend', user?: UserDetail) => {
    setVipDialogMode(mode);
    setSelectedUser(user ?? selectedUser ?? null);
    setSelectedPlan('');
    setDurationDays('');
    setStartMode('immediate');
    setCustomStartDate(undefined);
    setVipRemark('');
  };

  const handleExportCsv = () => {
    const headers = ['用户ID', '用户名', '昵称', '邮箱', '手机', 'VIP套餐', 'VIP到期时间', 'VIP状态', '账号状态', '注册时间'];
    const rows = filteredUsers.map((u) => [
      u.id,
      u.username,
      u.nickname || '',
      u.email || '',
      u.phone || '',
      u.vipPlanName || '',
      u.vipExpiresAt || '',
      vipStatusLabel[u.vipStatus],
      u.status === 'active' ? '正常' : '停用',
      u.createdAt,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `用户列表_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBatchToggleStatus = (targetStatus: UserStatus) => {
    // 模拟批量操作
    setSelectedIds([]);
  };

  const vipDialogTitle = () => {
    switch (vipDialogMode) {
      case 'open': return '开通 VIP';
      case 'extend': return '延长 VIP';
      case 'batchOpen': return '批量开通 VIP';
      case 'batchExtend': return '批量延长 VIP';
      default: return '';
    }
  };

  const handlePlanChange = (planId: string) => {
    setSelectedPlan(planId);
    const plan = mockPlans.find((p) => p.id === planId);
    if (plan) setDurationDays(String(plan.durationDays));
  };

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">用户管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理平台注册用户及 VIP 权益</p>
        </div>
      </div>

      <Card className="shadow-sm">
        {/* 筛选栏 */}
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="搜索用户名/昵称/邮箱/手机号"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-64 pl-9 h-9"
              />
            </div>
            <Select value={vipFilter} onValueChange={(v) => { setVipFilter(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="VIP状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部VIP状态</SelectItem>
                <SelectItem value="active">活跃</SelectItem>
                <SelectItem value="expired">过期</SelectItem>
                <SelectItem value="inactive">未激活</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="账号状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">正常</SelectItem>
                <SelectItem value="disabled">停用</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 border rounded-md px-2 h-9 bg-background">
              <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-xs text-left px-1 h-7 w-28 hover:bg-accent/50 rounded px-1">
                    {startDate ? format(startDate, 'yyyy-MM-dd') : '开始日期'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => { setStartDate(d); setPage(1); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-slate-400">~</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-xs text-left px-1 h-7 w-28 hover:bg-accent/50 rounded px-1">
                    {endDate ? format(endDate, 'yyyy-MM-dd') : '结束日期'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => { setEndDate(d); setPage(1); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(undefined); setEndDate(undefined); setPage(1); }}
                  className="text-slate-400 hover:text-slate-600 ml-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <Button onClick={() => setNewUserDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            新建用户
          </Button>
        </div>

        {/* 批量操作栏 */}
        {selectedIds.length > 0 && (
          <div className="mx-4 mt-3 mb-0 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CheckSquare className="w-4 h-4 text-primary" />
              <span>已选择 <span className="font-semibold text-primary">{selectedIds.length}</span> 个用户</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openVipDialog('batchOpen')}>
                <Crown className="w-3.5 h-3.5 mr-1 text-amber-500" />
                批量开通VIP
              </Button>
              <Button size="sm" variant="outline" onClick={() => openVipDialog('batchExtend')}>
                <Clock className="w-3.5 h-3.5 mr-1 text-blue-500" />
                批量延长VIP
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBatchToggleStatus('disabled')}>
                <ShieldOff className="w-3.5 h-3.5 mr-1 text-red-500" />
                批量停用
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBatchToggleStatus('active')}>
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                批量启用
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>取消选择</Button>
            </div>
          </div>
        )}

        {/* 表格 */}
        <CardContent className="p-0 pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleToggleAll}
                    aria-label="全选"
                  />
                </TableHead>
                <TableHead>用户信息</TableHead>
                <TableHead>联系方式</TableHead>
                <TableHead>VIP套餐</TableHead>
                <TableHead>VIP到期时间</TableHead>
                <TableHead>VIP状态</TableHead>
                <TableHead>账号状态</TableHead>
                <TableHead>注册时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(user.id)}
                      onCheckedChange={() => handleToggleOne(user.id)}
                      aria-label={`选择 ${user.username}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>{user.nickname?.charAt(0) || user.username.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold text-sm leading-tight">{user.nickname || user.username}</div>
                        <div className="text-xs text-slate-500">@{user.username}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs leading-tight">
                      <div>{user.email}</div>
                      <div className="text-slate-500 mt-0.5">{user.phone}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{user.vipPlanName || '-'}</TableCell>
                  <TableCell className="text-xs text-slate-500">{user.vipExpiresAt || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={vipStatusVariant(user.vipStatus)} className={vipStatusClass(user.vipStatus)}>
                      {vipStatusLabel[user.vipStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={accountStatusClass(user.status)}>
                      {user.status === 'active' ? '正常' : '停用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{user.createdAt.slice(0, 10)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => handleViewDetail(user)}>
                          <Eye className="w-3.5 h-3.5 mr-2" />
                          查看详情
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openVipDialog('open', user)}>
                          <Crown className="w-3.5 h-3.5 mr-2 text-amber-500" />
                          开通VIP
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openVipDialog('extend', user)}>
                          <Clock className="w-3.5 h-3.5 mr-2 text-blue-500" />
                          延长VIP
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <KeyRound className="w-3.5 h-3.5 mr-2 text-slate-500" />
                          重置密码
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.status === 'active' ? (
                          <DropdownMenuItem className="text-red-600">
                            <ShieldOff className="w-3.5 h-3.5 mr-2" />
                            停用账号
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="text-emerald-600">
                            <ShieldCheck className="w-3.5 h-3.5 mr-2" />
                            启用账号
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {pagedUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                    暂无匹配用户
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>

        {/* 底部分页栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>共 {filteredUsers.length} 条</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-28 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 条/页</SelectItem>
                <SelectItem value="20">20 条/页</SelectItem>
                <SelectItem value="50">50 条/页</SelectItem>
                <SelectItem value="100">100 条/页</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) {
                  p = i + 1;
                } else if (page <= 3) {
                  p = i + 1;
                } else if (page >= totalPages - 2) {
                  p = totalPages - 4 + i;
                } else {
                  p = page - 2 + i;
                }
                return (
                  <Button
                    key={p}
                    variant={page === p ? 'default' : 'outline'}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="w-3.5 h-3.5 mr-1" />
              导出 CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* 用户详情抽屉 */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-[520px] sm:max-w-[520px] p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>用户详情</SheetTitle>
          </SheetHeader>
          {selectedUser && (
            <div className="flex-1 overflow-y-auto p-4">
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="basic" className="flex-1">基础资料</TabsTrigger>
                  <TabsTrigger value="vip" className="flex-1">VIP信息</TabsTrigger>
                  <TabsTrigger value="accounts" className="flex-1">绑定账号</TabsTrigger>
                  <TabsTrigger value="logs" className="flex-1">操作记录</TabsTrigger>
                </TabsList>

                {/* Tab 1 - 基础资料 */}
                <TabsContent value="basic" className="m-0 pt-1">
                  <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <Avatar className="w-14 h-14">
                      <AvatarFallback className="text-lg font-bold bg-gradient-to-br from-blue-400 to-purple-500 text-white">
                        {selectedUser.nickname?.charAt(0) || selectedUser.username.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold text-base">{selectedUser.nickname || selectedUser.username}</div>
                      <div className="text-xs text-slate-500">@{selectedUser.username}</div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge variant="outline" className={accountStatusClass(selectedUser.status)}>
                          {selectedUser.status === 'active' ? '正常' : '已停用'}
                        </Badge>
                        <Badge variant="outline" className={vipStatusClass(selectedUser.vipStatus)}>
                          {vipStatusLabel[selectedUser.vipStatus]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    {[
                      ['用户ID', selectedUser.id],
                      ['用户名', selectedUser.username],
                      ['昵称', selectedUser.nickname || '-'],
                      ['邮箱', selectedUser.email || '-'],
                      ['手机', selectedUser.phone || '-'],
                      ['注册时间', selectedUser.createdAt],
                      ['注册IP', selectedUser.registerIp],
                      ['最后登录时间', selectedUser.lastLoginAt || '-'],
                      ['最后登录IP', selectedUser.lastLoginIp || '-'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center py-2 border-b border-b-slate-100 dark:border-b-slate-700 last:border-0">
                        <span className="text-slate-500 text-xs">{label}</span>
                        <span className="text-right text-xs">{value}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Tab 2 - VIP 信息 */}
                <TabsContent value="vip" className="m-0 pt-1">
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">当前套餐</span>
                        <span className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <Crown className="w-4 h-4" />
                          {selectedUser.vipPlanName || '未开通'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-2 text-sm">
                        <span className="text-slate-600 dark:text-slate-300">到期时间</span>
                        <span>{selectedUser.vipExpiresAt || '-'}</span>
                      </div>
                      <div className="mt-3">
                        {(() => {
                          const plan = mockPlans.find((p) => p.id === selectedUser.vipPlanId);
                          const total = plan?.durationDays || 30;
                          const remaining = selectedUser.vipStatus === 'active' && selectedUser.vipExpiresAt
                            ? Math.max(0, Math.ceil((new Date(selectedUser.vipExpiresAt).getTime() - Date.now()) / 86400000))
                            : 0;
                          const percent = Math.min(100, Math.max(0, (remaining / total) * 100));
                          return (
                            <>
                              <div className="flex items-center justify-between mb-1.5 text-xs">
                                <span className="text-slate-600 dark:text-slate-300">剩余天数</span>
                                <span className="font-semibold text-amber-600 dark:text-amber-400">{remaining} / {total} 天</span>
                              </div>
                              <Progress value={percent} className="h-1.5" />
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">账号额度</span>
                        <span className="font-medium">
                          已绑定 {selectedUser.boundAccounts.length} / 上限 {selectedUser.maxAccounts}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, (selectedUser.boundAccounts.length / selectedUser.maxAccounts) * 100)}
                        className="mt-2 h-1.5"
                      />
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">历史激活记录</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs font-medium">授权码</TableHead>
                            <TableHead className="text-xs font-medium">套餐</TableHead>
                            <TableHead className="text-xs font-medium">激活时间</TableHead>
                            <TableHead className="text-xs font-medium">到期时间</TableHead>
                            <TableHead className="text-xs font-medium text-right">时长</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedUser.activationHistory.map((h) => (
                            <TableRow key={h.id}>
                              <TableCell className="text-xs font-mono">{h.code}</TableCell>
                              <TableCell className="text-xs">{h.planName}</TableCell>
                              <TableCell className="text-xs text-slate-500">{h.activatedAt}</TableCell>
                              <TableCell className="text-xs text-slate-500">{h.expiresAt}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{h.days} 天</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                {/* Tab 3 - 绑定账号 */}
                <TabsContent value="accounts" className="m-0 pt-1">
                  <div className="space-y-2">
                    {selectedUser.boundAccounts.map((acc) => (
                      <div key={acc.id} className="p-3 rounded-lg border hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className={`${platformColor(acc.platform)} border-0 text-[10px]`}>
                              {platformLabel(acc.platform)}
                            </Badge>
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="text-xs">
                                {acc.nickname?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">{acc.nickname}</div>
                              <div className="text-xs text-slate-500">绑定于 {acc.createdAt}</div>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={acc.authStatus === 'authorized'
                              ? 'bg-emerald-500/10 text-emerald-600 border-0'
                              : 'bg-orange-500/10 text-orange-600 border-0'}
                          >
                            {acc.authStatus === 'authorized' ? '已授权' : '已过期'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t">
                          <div>
                            <div className="font-semibold">{acc.followersCount.toLocaleString()}</div>
                            <div className="text-slate-500">粉丝</div>
                          </div>
                          <div>
                            <div className="font-semibold">{acc.likesCount.toLocaleString()}</div>
                            <div className="text-slate-500">获赞</div>
                          </div>
                          <div>
                            <div className="font-semibold">{acc.postsCount}</div>
                            <div className="text-slate-500">作品</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* Tab 4 - 操作记录 */}
                <TabsContent value="logs" className="m-0 pt-1">
                  <div className="relative">
                    <div className="absolute left-[11px] top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
                    <div className="space-y-3">
                      {selectedUser.operationLogs.map((log) => (
                        <div key={log.id} className="relative pl-8">
                          <div className="absolute left-0 top-0.5 w-6 h-6 rounded-full bg-background border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500">
                            {logIcon(log.action)}
                          </div>
                          <div className="pt-0.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{log.action}</span>
                              <span className="text-xs text-slate-400">{log.createdAt}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">{log.detail}</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              IP: {log.ipAddress}
                              {log.operatorName && <span className="ml-2">操作人：{log.operatorName}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* 底部操作按钮 */}
          {selectedUser && (
            <div className="p-4 border-t flex items-center gap-2 shrink-0">
              <Button size="sm" className="flex-1" onClick={() => openVipDialog('open', selectedUser)}>
                <Crown className="w-3.5 h-3.5 mr-1" />
                开通/延长VIP
              </Button>
              <Button size="sm" variant="outline" className="flex-1">
                <KeyRound className="w-3.5 h-3.5 mr-1" />
                重置密码
              </Button>
              {selectedUser.status === 'active' ? (
                <Button size="sm" variant="destructive">
                  <ShieldOff className="w-3.5 h-3.5 mr-1" />
                  停用
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-emerald-600">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  启用
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 开通/延长 VIP 弹窗 */}
      <Dialog
        open={vipDialogMode !== null}
        onOpenChange={(open) => { if (!open) setVipDialogMode(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{vipDialogTitle()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {(vipDialogMode === 'open' || vipDialogMode === 'extend') && selectedUser && (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="text-xs">
                    {selectedUser.nickname?.charAt(0) || selectedUser.username.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span>为用户 <span className="font-medium text-slate-700 dark:text-slate-200">{selectedUser.username}</span> 操作</span>
              </div>
            )}
            {(vipDialogMode === 'batchOpen' || vipDialogMode === 'batchExtend') && (
              <div className="text-sm text-slate-500">
                已选择 <span className="font-medium text-primary">{selectedIds.length}</span> 个用户
              </div>
            )}

            {(vipDialogMode === 'open' || vipDialogMode === 'batchOpen') && (
              <div className="space-y-2">
                <Label>选择套餐 *</Label>
                <Select value={selectedPlan} onValueChange={handlePlanChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择套餐" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockPlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}（{plan.durationDays}天，{plan.maxAccounts}个账号，¥{plan.price}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>时长（天）*</Label>
              <Input
                type="number"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="请输入天数"
              />
            </div>

            <div className="space-y-2">
              <Label>开始方式</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={startMode === 'immediate'}
                    onCheckedChange={() => setStartMode('immediate')}
                  />
                  立即开始
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={startMode === 'custom'}
                    onCheckedChange={() => setStartMode('custom')}
                  />
                  指定日期
                </label>
              </div>
              {startMode === 'custom' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {customStartDate ? format(customStartDate, 'yyyy-MM-dd') : '选择日期'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={setCustomStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Textarea
                value={vipRemark}
                onChange={(e) => setVipRemark(e.target.value)}
                placeholder="操作原因/说明"
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button onClick={() => setVipDialogMode(null)}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新建用户弹窗 */}
      <Dialog open={newUserDialogOpen} onOpenChange={setNewUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>用户名 *</Label>
                <Input placeholder="请输入用户名" />
              </div>
              <div className="space-y-1.5">
                <Label>昵称</Label>
                <Input placeholder="请输入昵称" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>初始密码 *</Label>
              <Input type="password" placeholder="请输入初始密码" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>邮箱</Label>
                <Input placeholder="邮箱地址" />
              </div>
              <div className="space-y-1.5">
                <Label>手机号</Label>
                <Input placeholder="手机号码" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button onClick={() => setNewUserDialogOpen(false)}>创建用户</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

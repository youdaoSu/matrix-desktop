import { useEffect, useMemo, useState } from 'react';
import { useOfficialWorkspace } from '@/components/workspace/OfficialWorkspace';
import { openPlatformDirectory } from '@/components/workspace/AdditionalPlatformWorkspaces';
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit3,
  FolderGit2,
  RefreshCw,
  Unlink,
  Info,
  Music,
  BookOpen,
  Video,
  Tv,
  Filter,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  GripVertical,
  AlertTriangle,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Heart,
  ThumbsUp,
  Play,
  Eye,
  Settings2,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  History,
  AlertCircle,
  Shield,
  Activity,
  UserPlus,
  Share2,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  LockKeyhole,
  Globe2,
} from 'lucide-react';
import type { PlatformType, PlatformAccountDetail } from '@shared/api.interface';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@client/src/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@client/src/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Checkbox } from '@client/src/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@client/src/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@client/src/components/ui/tabs';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from '@client/src/components/ui/pagination';
import { Card, CardContent } from '@client/src/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@client/src/components/ui/alert-dialog';
import { Label } from '@client/src/components/ui/label';
import { Separator } from '@client/src/components/ui/separator';
import { ScrollArea } from '@client/src/components/ui/scroll-area';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@client/src/components/ui/chart';
import { cn } from '@/lib/utils';
import { axiosForBackend } from '@/api';
import { toast } from 'sonner';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

interface AccountItem extends PlatformAccountDetail {
  groupName: string;
}


interface GroupItem {
  id: string;
  name: string;
  isDefault: boolean;
  sortOrder: number;
}

type EmbeddedAuthMode = 'bind' | 'reauthorize' | 'manage';

function apiErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.error?.message
    || error?.response?.data?.message
    || error?.message
    || fallback;
}

type SortField = 'followers' | 'likes' | 'createdAt';
type SortOrder = 'asc' | 'desc';

const authStatusMap: Record<string, { label: string; className: string; icon: any }> = {
  authorized: { label: '正常', className: 'bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-none', icon: CheckCircle2 },
  expired: { label: '已过期', className: 'bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] border-none', icon: Clock },
  error: { label: '异常', className: 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-none', icon: AlertTriangle },
  pending: { label: '待授权', className: 'bg-muted text-muted-foreground border-none', icon: Clock },
};

type ColumnKey =
  | 'account'
  | 'nickname'
  | 'remark'
  | 'group'
  | 'status'
  | 'expires'
  | 'followers'
  | 'likes'
  | 'bindTime'
  | 'actions';

const ALL_COLUMNS: { key: ColumnKey; label: string; default?: boolean }[] = [
  { key: 'account', label: '账号', default: true },
  { key: 'nickname', label: '昵称' },
  { key: 'remark', label: '备注', default: true },
  { key: 'group', label: '分组', default: true },
  { key: 'status', label: '授权状态', default: true },
  { key: 'expires', label: '授权到期', default: true },
  { key: 'followers', label: '粉丝数', default: true },
  { key: 'likes', label: '获赞数', default: true },
  { key: 'bindTime', label: '绑定时间' },
  { key: 'actions', label: '操作', default: true },
];

const AccountsPage = () => {
  const workspace = useOfficialWorkspace();
  const [searchText, setSearchText] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(
    ALL_COLUMNS.filter((c) => c.default).map((c) => c.key)
  );

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [startingOAuth, setStartingOAuth] = useState(false);
  const [oauthStatus, setOAuthStatus] = useState<Record<PlatformType, { available: boolean; message: string }> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAccount, setDetailAccount] = useState<AccountItem | null>(null);

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [groupFormName, setGroupFormName] = useState('');
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<GroupItem | null>(null);

  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const [bindPlatform, setBindPlatform] = useState<PlatformType>('douyin');

  const [reAuthOpen, setReAuthOpen] = useState(false);
  const [reAuthAccount, setReAuthAccount] = useState<AccountItem | null>(null);

  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [batchMoveTarget, setBatchMoveTarget] = useState('');

  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);

  const [editRemarkOpen, setEditRemarkOpen] = useState(false);
  const [remarkAccount, setRemarkAccount] = useState<AccountItem | null>(null);
  const [remarkText, setRemarkText] = useState('');

  const [moveGroupOpen, setMoveGroupOpen] = useState(false);
  const [moveAccount, setMoveAccount] = useState<AccountItem | null>(null);
  const [moveTargetGroup, setMoveTargetGroup] = useState('');

  const [unbindConfirmOpen, setUnbindConfirmOpen] = useState(false);
  const [unbindAccount, setUnbindAccount] = useState<AccountItem | null>(null);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const response = await axiosForBackend.get('/api/platform/accounts', { params: { page: 1, pageSize: 100 } });
      setAccounts((response.data?.data?.items || []) as AccountItem[]);
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '加载真实账号失败'));
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await axiosForBackend.get('/api/platform/groups');
      setGroups((response.data?.data || []).map((group: any) => ({
        id: group.id,
        name: group.groupName,
        isDefault: Boolean(group.isDefault),
        sortOrder: Number(group.sortOrder || 0),
      })));
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '加载账号分组失败'));
    }
  };

  useEffect(() => {
    void loadAccounts();
    void loadGroups();
    axiosForBackend.get('/api/platform/oauth-status')
      .then((response: any) => setOAuthStatus(response.data?.data || null))
      .catch(() => setOAuthStatus(null));

    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get('oauth');
    const message = params.get('message');
    if (oauthResult) {
      if (oauthResult === 'success') toast.success(message || '账号授权成功');
      else toast.error(message || '账号授权失败');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const openEmbeddedAuth = async (
    platform: PlatformType,
    sessionId?: string,
    mode: EmbeddedAuthMode = 'bind',
  ) => {
    if (!window.matrixDesktop?.isDesktop) return false;
    setBindDialogOpen(false);
    setReAuthOpen(false);
    const account = accounts.find(item => item.platform === platform && item.connectorSessionId === sessionId);
    if (account && sessionId) await workspace.openAccount(account, 'manage', mode === 'reauthorize');
    else await workspace.bindAccount(platform);
    return true;
  };

  const startOAuth = async (platform: PlatformType, sessionId?: string, mode: EmbeddedAuthMode = 'bind') => {
    setStartingOAuth(true);
    try {
      if (window.matrixDesktop?.isDesktop) {
        await openEmbeddedAuth(platform, sessionId, mode);
        setStartingOAuth(false);
        return;
      }
      const response = await axiosForBackend.post(`/api/platform/oauth/${platform}`);
      const authUrl = response.data?.data?.authUrl;
      if (!authUrl || !authUrl.startsWith('https://')) throw new Error('服务端未返回有效授权地址');
      window.location.assign(authUrl);
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '无法发起授权'));
      setStartingOAuth(false);
    }
  };

  useEffect(() => {
    const refresh = () => { void loadAccounts(); void loadGroups(); };
    window.addEventListener('matrix:accounts-updated', refresh);
    return () => window.removeEventListener('matrix:accounts-updated', refresh);
  }, []);

  const platformAvailable = (platform: PlatformType) =>
    Boolean(window.matrixDesktop?.isDesktop || oauthStatus?.[platform]?.available);

  const platformAuthMessage = (platform: PlatformType) =>
    window.matrixDesktop?.isDesktop
      ? '桌面连接器可用 · 登录状态仅保存在本机'
      : (oauthStatus?.[platform]?.message || '正在检查平台配置');

  // 过滤 + 排序
  const filteredAccounts = useMemo(() => {
    let result = [...accounts];
    if (selectedGroupId !== 'all') {
      const group = groups.find((g) => g.id === selectedGroupId);
      if (group) {
        result = result.filter((a) => a.groupName === group.name);
      }
    }
    if (platformFilter !== 'all') {
      result = result.filter((a) => a.platform === platformFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((a) => a.authStatus === statusFilter);
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(
        (a) =>
          a.nickname?.toLowerCase().includes(q) ||
          (a.accountRemark || '').toLowerCase().includes(q) ||
          a.platformUserId?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let diff = 0;
      if (sortField === 'followers') diff = a.followersCount - b.followersCount;
      else if (sortField === 'likes') diff = a.likesCount - b.likesCount;
      else diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === 'asc' ? diff : -diff;
    });
    return result;
  }, [accounts, selectedGroupId, platformFilter, statusFilter, searchText, sortField, sortOrder, groups]);

  const total = filteredAccounts.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageAccounts = filteredAccounts.slice((page - 1) * pageSize, page * pageSize);

  const allSelected = pageAccounts.length > 0 && pageAccounts.every((a) => selectedIds.includes(a.id));
  const someSelected = pageAccounts.some((a) => selectedIds.includes(a.id));

  // 按当前平台筛选的账号
  const platformFilteredAccounts = useMemo(() => {
    if (platformFilter === 'all') return accounts;
    return accounts.filter((a: AccountItem) => a.platform === platformFilter);
  }, [accounts, platformFilter]);

  // 分组计数：随平台筛选联动
  const groupAccountCounts = useMemo(() => {
    const counts: Record<string, number> = { all: platformFilteredAccounts.length };
    for (const g of groups) {
      counts[g.id] = platformFilteredAccounts.filter((a) => a.groupName === g.name).length;
    }
    return counts;
  }, [platformFilteredAccounts, groups]);

  // 过滤后的分组：当前平台下有账号的分组
  const filteredGroups = useMemo(() => {
    if (platformFilter === 'all') return groups;
    const groupNames = new Set<string>();
    for (const acc of platformFilteredAccounts) {
      if (acc.groupName) groupNames.add(acc.groupName);
    }
    return groups.filter((g: GroupItem) => groupNames.has(g.name));
  }, [groups, platformFilteredAccounts, platformFilter]);

  // 平台变更时，若当前选中分组在新平台下无账号则重置为全部
  const handlePlatformChange = (value: string) => {
    setPlatformFilter(value);
    if (value !== 'all' && selectedGroupId !== 'all') {
      const group = groups.find((g) => g.id === selectedGroupId);
      if (group) {
        const stillHas = accounts.some(
          (a) => a.platform === value && a.groupName === group.name
        );
        if (!stillHas) {
          setSelectedGroupId('all');
        }
      }
    }
    setPage(1);
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageAccounts.some((a) => a.id === id)));
    } else {
      const ids = pageAccounts.map((a) => a.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const openDetail = (account: AccountItem) => {
    setDetailAccount(account);
    setDetailOpen(true);
  };

  const handleHealthCheck = async () => {
    setHealthChecking(true);
    try {
      const desktopAccounts = accounts.filter(
        (account) => account.connectorMode === 'desktop' && account.connectorSessionId
      );
      if (window.matrixDesktop?.isDesktop && desktopAccounts.length > 0) {
        const results = await Promise.all(desktopAccounts.map(async (account) => ({
          account,
          state: await window.matrixDesktop!.checkPlatformSession(account.platform, account.connectorSessionId!),
        })));
        const invalid = results.filter(({ state }) => !state.healthy);
        if (invalid.length === 0) toast.success(`已检查 ${results.length} 个账号，登录状态均正常`);
        else toast.warning(`${invalid.length} 个账号需要重新授权：${invalid.map(({ account }) => account.nickname || platformMeta[account.platform].label).join('、')}`);
      } else {
        const results = await Promise.all(accounts.map((account) =>
          axiosForBackend.post(`/api/platform/accounts/${account.id}/health-check`)
        ));
        const warningCount = results.filter((result) => result.data?.data?.status !== 'healthy').length;
        if (warningCount) toast.warning(`${warningCount} 个账号状态异常，请重新授权`);
        else toast.success(accounts.length ? `已检查 ${accounts.length} 个账号，状态正常` : '当前没有已绑定账号');
      }
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '账号状态检查失败'));
    } finally {
      setHealthChecking(false);
    }
  };

  const handleAddGroup = async () => {
    if (!groupFormName.trim()) return;
    try {
      await axiosForBackend.post('/api/platform/groups', { groupName: groupFormName.trim(), sortOrder: groups.length });
      await loadGroups();
      setAddGroupOpen(false);
      setGroupFormName('');
      toast.success('分组已创建');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '创建分组失败'));
    }
  };

  const startEditGroup = (group: GroupItem) => {
    setEditingGroup(group);
    setGroupFormName(group.name);
    setEditGroupOpen(true);
  };

  const saveEditGroup = async () => {
    if (!groupFormName.trim() || !editingGroup) return;
    try {
      await axiosForBackend.put(`/api/platform/groups/${editingGroup.id}`, { groupName: groupFormName.trim() });
      await Promise.all([loadGroups(), loadAccounts()]);
      setEditGroupOpen(false);
      setEditingGroup(null);
      setGroupFormName('');
      toast.success('分组已更新');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '更新分组失败'));
    }
  };

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;
    try {
      await axiosForBackend.delete(`/api/platform/groups/${groupToDelete.id}`);
      await Promise.all([loadGroups(), loadAccounts()]);
      if (selectedGroupId === groupToDelete.id) setSelectedGroupId('all');
      setDeleteGroupConfirm(false);
      setGroupToDelete(null);
      toast.success('分组已删除，原账号已移至默认分组');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '删除分组失败'));
    }
  };

  const handleBatchMove = async () => {
    if (!batchMoveTarget) return;
    try {
      await axiosForBackend.post('/api/platform/groups/move-accounts', { accountIds: selectedIds, groupId: batchMoveTarget });
      await Promise.all([loadGroups(), loadAccounts()]);
      setBatchMoveOpen(false);
      setBatchMoveTarget('');
      setSelectedIds([]);
      toast.success('账号已移动');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '移动账号失败'));
    }
  };

  const handleBatchDelete = async () => {
    try {
      await Promise.all(selectedIds.map((id) => axiosForBackend.delete(`/api/platform/accounts/${id}`)));
      await Promise.all([loadGroups(), loadAccounts()]);
      setBatchDeleteOpen(false);
      setSelectedIds([]);
      toast.success('所选账号已解绑');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '批量解绑失败'));
    }
  };

  const handleSaveRemark = async () => {
    if (!remarkAccount) return;
    try {
      await axiosForBackend.put(`/api/platform/accounts/${remarkAccount.id}`, { accountRemark: remarkText });
      await loadAccounts();
      setEditRemarkOpen(false);
      setRemarkAccount(null);
      setRemarkText('');
      toast.success('备注已保存');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '保存备注失败'));
    }
  };

  const handleMoveGroup = async () => {
    if (!moveAccount || !moveTargetGroup) return;
    try {
      await axiosForBackend.post('/api/platform/groups/move-accounts', { accountIds: [moveAccount.id], groupId: moveTargetGroup });
      await Promise.all([loadGroups(), loadAccounts()]);
      setMoveGroupOpen(false);
      setMoveAccount(null);
      setMoveTargetGroup('');
      toast.success('账号已移动');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '移动账号失败'));
    }
  };

  const handleUnbind = async () => {
    if (!unbindAccount) return;
    try {
      await axiosForBackend.delete(`/api/platform/accounts/${unbindAccount.id}`);
      setAccounts(accounts.filter((a) => a.id !== unbindAccount.id));
      setUnbindConfirmOpen(false);
      setUnbindAccount(null);
      setDetailOpen(false);
      toast.success('账号已解绑');
    } catch (error: any) {
      toast.error(apiErrorMessage(error, '解绑失败'));
    }
  };

  const formatNumber = (n: number) => {
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  };

  const trendData = detailAccount
    ? Array.from({ length: 7 }, (_, i) => {
        const base = detailAccount.followersCount / 7;
        const variance = (Math.sin(i * 1.3) + 0.5) * base * 0.3;
        return {
          day: `D${i + 1}`,
          粉丝: Math.round(base * (i + 1) + variance),
          获赞: Math.round((detailAccount.likesCount / 7) * (i + 1) + variance * 0.5),
        };
      })
    : [];

  const operationLogs = detailAccount
    ? [
        { time: detailAccount.lastSyncAt || '', action: '数据同步', status: 'success', desc: '自动同步账号数据成功' },
        { time: '2026-09-25 16:30:00', action: '发布内容', status: 'success', desc: '发布视频《秋日穿搭分享》成功' },
        { time: '2026-09-20 10:15:00', action: '刷新授权', status: 'success', desc: '手动刷新授权成功' },
        { time: '2026-09-15 09:00:00', action: '绑定账号', status: 'success', desc: '首次授权绑定成功' },
        detailAccount.authStatus === 'error'
          ? { time: '2026-09-18 14:20:00', action: '授权异常', status: 'error', desc: '平台返回 token 失效' }
          : { time: '2026-09-12 11:30:00', action: '评论回复', status: 'success', desc: '自动回复 3 条评论' },
      ]
    : [];

  const chartConfig = {
    粉丝: { label: '粉丝', color: 'hsl(221 83% 53%)' },
    获赞: { label: '获赞', color: 'hsl(26 90% 49%)' },
  };

  return (
    <div data-account-management className="flex flex-col h-[calc(100vh-152px)] min-h-[520px]">
      {/* 平台接入状态 */}
      <Alert
        variant="default"
        className="bg-[hsl(26_90%_49%)]/10 border-b border-[hsl(26_90%_49%)]/30 text-[hsl(26_90%_49%)] rounded-none border-x-0 border-t-0"
      >
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <AlertDescription className="text-[hsl(26_90%_49%)] text-xs">
          账号列表仅展示数据库中的真实授权结果 · 平台能力以开放平台实际审批的 Scope 为准
        </AlertDescription>
      </Alert>

      {/* 主体：左树 + 右列表 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧分组树 */}
        <aside className="w-[240px] border-r border-border bg-card flex flex-col shrink-0">
          <div className="h-11 flex items-center justify-between px-3 border-b border-border">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">
                {platformFilter === 'all'
                  ? '账号分组'
                  : `${platformMeta[platformFilter as PlatformType]?.label ?? ''}分组`}
              </span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAddGroupOpen(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {/* 全部 */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 h-9 cursor-pointer border-l-2 transition-colors',
                selectedGroupId === 'all'
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'border-transparent hover:bg-muted/50 text-foreground'
              )}
              onClick={() => setSelectedGroupId('all')}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span className="text-sm flex-1 truncate">全部账号</span>
              <span className="text-xs text-muted-foreground">{platformFilteredAccounts.length}</span>
            </div>
            <Separator className="my-1" />
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                className={cn(
                  'flex items-center gap-2 px-3 h-9 cursor-pointer group border-l-2 transition-colors',
                  selectedGroupId === group.id
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-transparent hover:bg-muted/50 text-foreground'
                )}
                onClick={() => setSelectedGroupId(group.id)}
              >
                <FolderGit2 className="w-4 h-4 shrink-0" />
                <span className="text-sm flex-1 truncate">{group.name}</span>
                {group.isDefault && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 border-muted-foreground/30">
                    默认
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{groupAccountCounts[group.id] || 0}</span>
                {!group.isDefault && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditGroup(group);
                        }}
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-2" />
                        重命名
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGroupToDelete(group);
                          setDeleteGroupConfirm(true);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </ScrollArea>
          <div className="border-t border-border p-2">
            <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => setAddGroupOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              新增分组
            </Button>
          </div>
        </aside>

        {/* 右侧主区域 */}
        <main className="flex-1 min-w-0 flex flex-col bg-[hsl(220_20%_98%)]">
          {/* 顶部操作栏 */}
          <div className="bg-card border-b border-border p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={platformFilter} onValueChange={handlePlatformChange}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="全部平台" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部平台</SelectItem>
                  {(Object.keys(platformMeta) as PlatformType[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: platformMeta[p].color }}
                        />
                        {platformMeta[p].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="authorized">正常</SelectItem>
                  <SelectItem value="expired">授权过期</SelectItem>
                  <SelectItem value="error">异常</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索昵称/备注/ID"
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 h-9"
                />
              </div>

              <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleHealthCheck} disabled={healthChecking}>
                <RefreshCw className={cn('w-4 h-4', healthChecking && 'animate-spin')} />
              </Button>

              <div className="flex-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1">
                    <Settings2 className="w-4 h-4" />
                    列设置
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>显示列</DropdownMenuLabel>
                  {ALL_COLUMNS.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.key}
                      checked={visibleColumns.includes(col.key)}
                      onCheckedChange={(checked) => {
                        setVisibleColumns((prev) =>
                          checked ? [...prev, col.key] : prev.filter((k) => k !== col.key)
                        );
                      }}
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {workspace.tabs.some(tab => !tab.background && tab.scope === '/accounts') && <Button variant="outline" onClick={() => workspace.show('manage')}>继续账号页面</Button>}
              <Button onClick={() => setBindDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                绑定账号
              </Button>
            </div>

            {/* 批量操作栏 */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-[hsl(221_83%_53%)]/5 border border-[hsl(221_83%_53%)]/20 rounded-md">
                <span className="text-sm text-primary font-medium">
                  已选 {selectedIds.length} 项
                </span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => setBatchMoveOpen(true)}>
                  <FolderGit2 className="w-3.5 h-3.5 mr-1" />
                  移动分组
                </Button>
                <Button size="sm" variant="outline" className="h-7">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  重新授权
                </Button>
                <Button size="sm" variant="destructive" className="h-7" onClick={() => setBatchDeleteOpen(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  删除
                </Button>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelectedIds([])}>
                  取消
                </Button>
              </div>
            )}
          </div>

          {/* 表格区 */}
          <div className="flex-1 overflow-auto p-4">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                {pageAccounts.length === 0 ? (
                  <div className="py-20 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                      <Users className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      {loadingAccounts ? '正在加载真实账号…' : '暂无已授权账号，点击右上角绑定账号'}
                    </p>
                    <Button onClick={() => setBindDialogOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" />
                      绑定账号
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          {visibleColumns.includes('account') && (
                            <th className="w-10 px-3 py-2.5">
                              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="全选" />
                            </th>
                          )}
                          {visibleColumns.includes('nickname') || visibleColumns.includes('account') ? (
                            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">账号</th>
                          ) : null}
                          {visibleColumns.includes('remark') && (
                            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">备注</th>
                          )}
                          {visibleColumns.includes('group') && (
                            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">分组</th>
                          )}
                          {visibleColumns.includes('status') && (
                            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">授权状态</th>
                          )}
                          {visibleColumns.includes('expires') && (
                            <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">授权到期</th>
                          )}
                          {visibleColumns.includes('followers') && (
                            <th
                              className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none"
                              onClick={() => handleSort('followers')}
                            >
                              <span className="inline-flex items-center gap-1">
                                粉丝数
                                {sortField === 'followers' ? (
                                  sortOrder === 'asc' ? (
                                    <ArrowUp className="w-3 h-3" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />
                                )}
                              </span>
                            </th>
                          )}
                          {visibleColumns.includes('likes') && (
                            <th
                              className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none"
                              onClick={() => handleSort('likes')}
                            >
                              <span className="inline-flex items-center gap-1">
                                获赞数
                                {sortField === 'likes' ? (
                                  sortOrder === 'asc' ? (
                                    <ArrowUp className="w-3 h-3" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />
                                )}
                              </span>
                            </th>
                          )}
                          {visibleColumns.includes('bindTime') && (
                            <th
                              className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none"
                              onClick={() => handleSort('createdAt')}
                            >
                              <span className="inline-flex items-center gap-1">
                                绑定时间
                                {sortField === 'createdAt' ? (
                                  sortOrder === 'asc' ? (
                                    <ArrowUp className="w-3 h-3" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />
                                )}
                              </span>
                            </th>
                          )}
                          {visibleColumns.includes('actions') && (
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-[80px]">操作</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {pageAccounts.map((acc) => {
                          const meta = platformMeta[acc.platform];
                          const Icon = meta.icon;
                          const statusInfo = authStatusMap[acc.authStatus];
                          const StatusIcon = statusInfo.icon;
                          return (
                            <tr key={acc.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                              {visibleColumns.includes('account') && (
                                <td className="px-3 py-2.5">
                                  <Checkbox
                                    checked={selectedIds.includes(acc.id)}
                                    onCheckedChange={() => toggleSelect(acc.id)}
                                    aria-label="选择"
                                  />
                                </td>
                              )}
                              {(visibleColumns.includes('nickname') || visibleColumns.includes('account')) && (
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 ring-2 ring-card shadow-sm"
                                      style={{ backgroundColor: meta.color }}
                                    >
                                      <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-medium truncate max-w-[180px]">
                                        {acc.nickname}
                                      </div>
                                      <div className="text-xs text-muted-foreground">{meta.label}</div>
                                    </div>
                                  </div>
                                </td>
                              )}
                              {visibleColumns.includes('remark') && (
                                <td className="px-3 py-2.5 text-muted-foreground">
                                  {acc.accountRemark || <span className="text-muted-foreground/40">—</span>}
                                </td>
                              )}
                              {visibleColumns.includes('group') && (
                                <td className="px-3 py-2.5">
                                  <Badge variant="secondary" className="font-normal">
                                    {acc.groupName}
                                  </Badge>
                                </td>
                              )}
                              {visibleColumns.includes('status') && (
                                <td className="px-3 py-2.5">
                                  <Badge className={cn('gap-1', statusInfo.className)}>
                                    <StatusIcon className="w-3 h-3" />
                                    {statusInfo.label}
                                  </Badge>
                                </td>
                              )}
                              {visibleColumns.includes('expires') && (
                                <td className="px-3 py-2.5 text-muted-foreground">
                                  {acc.authExpiresAt || '—'}
                                </td>
                              )}
                              {visibleColumns.includes('followers') && (
                                <td className="px-3 py-2.5 text-right font-medium">
                                  {formatNumber(acc.followersCount)}
                                </td>
                              )}
                              {visibleColumns.includes('likes') && (
                                <td className="px-3 py-2.5 text-right text-muted-foreground">
                                  {formatNumber(acc.likesCount)}
                                </td>
                              )}
                              {visibleColumns.includes('bindTime') && (
                                <td className="px-3 py-2.5 text-muted-foreground">{acc.createdAt}</td>
                              )}
                              {visibleColumns.includes('actions') && (
                                <td className="px-3 py-2.5 text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                      <DropdownMenuItem onClick={() => openDetail(acc)}>
                                        <Info className="w-3.5 h-3.5 mr-2" />
                                        查看详情
                                      </DropdownMenuItem>
                                      {window.matrixDesktop?.isDesktop && acc.connectorMode === 'desktop' && acc.connectorSessionId && (
                                        <DropdownMenuItem
                                          onClick={() => {
                                            void startOAuth(acc.platform, acc.connectorSessionId!, 'manage');
                                          }}
                                        >
                                          <Share2 className="w-3.5 h-3.5 mr-2" />
                                          打开平台后台
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setReAuthAccount(acc);
                                          setReAuthOpen(true);
                                        }}
                                      >
                                        <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                        重新授权
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setRemarkAccount(acc);
                                          setRemarkText(acc.accountRemark || '');
                                          setEditRemarkOpen(true);
                                        }}
                                      >
                                        <Edit3 className="w-3.5 h-3.5 mr-2" />
                                        编辑备注
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setMoveAccount(acc);
                                          setMoveTargetGroup(acc.groupId || '');
                                          setMoveGroupOpen(true);
                                        }}
                                      >
                                        <FolderGit2 className="w-3.5 h-3.5 mr-2" />
                                        移动分组
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => {
                                          setUnbindAccount(acc);
                                          setUnbindConfirmOpen(true);
                                        }}
                                      >
                                        <Unlink className="w-3.5 h-3.5 mr-2" />
                                        解绑账号
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 分页 */}
                {pageAccounts.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <div className="text-xs text-muted-foreground">
                      共 {total} 个账号，第 {page}/{totalPages} 页
                    </div>
                    <div className="flex items-center gap-3">
                      <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                        <SelectTrigger className="w-[90px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 条/页</SelectItem>
                          <SelectItem value="20">20 条/页</SelectItem>
                          <SelectItem value="50">50 条/页</SelectItem>
                        </SelectContent>
                      </Select>
                      <Pagination className="w-auto">
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              className={cn('cursor-pointer', page === 1 && 'pointer-events-none opacity-50')}
                            />
                          </PaginationItem>
                          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            let pageNum = i + 1;
                            if (totalPages > 5) {
                              if (page > 3) pageNum = page - 2 + i;
                              if (page > totalPages - 2) pageNum = totalPages - 4 + i;
                            }
                            return (
                              <PaginationItem key={pageNum}>
                                <PaginationLink isActive={page === pageNum} onClick={() => setPage(pageNum)}>
                                  {pageNum}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          })}
                          <PaginationItem>
                            <PaginationNext
                              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                              className={cn('cursor-pointer', page === totalPages && 'pointer-events-none opacity-50')}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* 账号详情抽屉 */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="sm:max-w-[520px] p-0">
          {detailAccount && (
            <div className="flex flex-col h-full">
              <div className="p-5 border-b border-border">
                <div className="flex items-start gap-3">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: platformMeta[detailAccount.platform].color }}
                  >
                    {(() => {
                      const Icon = platformMeta[detailAccount.platform].icon;
                      return <Icon className="w-7 h-7" />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold truncate">{detailAccount.nickname}</h2>
                      <Badge className={authStatusMap[detailAccount.authStatus].className}>
                        {authStatusMap[detailAccount.authStatus].label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {platformMeta[detailAccount.platform].label} · {detailAccount.platformUserId}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setDetailOpen(false); setReAuthAccount(detailAccount); setReAuthOpen(true); }}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    重新授权
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setDetailOpen(false); setRemarkAccount(detailAccount); setRemarkText(detailAccount.accountRemark || ''); setEditRemarkOpen(true); }}>
                    <Edit3 className="w-3.5 h-3.5 mr-1" />
                    编辑备注
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setDetailOpen(false); setMoveAccount(detailAccount); setMoveTargetGroup(detailAccount.groupId || ''); setMoveGroupOpen(true); }}>
                    <FolderGit2 className="w-3.5 h-3.5 mr-1" />
                    移动分组
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="info" className="flex-1 flex flex-col">
                <div className="px-5 border-b border-border">
                  <TabsList className="h-9">
                    <TabsTrigger value="info">基础资料</TabsTrigger>
                    <TabsTrigger value="auth">授权信息</TabsTrigger>
                    <TabsTrigger value="data">数据概览</TabsTrigger>
                    <TabsTrigger value="logs">操作记录</TabsTrigger>
                  </TabsList>
                </div>
                <ScrollArea className="flex-1">
                  <TabsContent value="info" className="p-5">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xs text-muted-foreground mb-1">平台</div>
                          <div className="font-medium">{platformMeta[detailAccount.platform].label}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xs text-muted-foreground mb-1">账号 ID</div>
                          <div className="font-medium font-mono text-xs">{detailAccount.platformUserId}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xs text-muted-foreground mb-1">分组</div>
                          <div className="font-medium">{detailAccount.groupName}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="text-xs text-muted-foreground mb-1">绑定时间</div>
                          <div className="font-medium text-xs">{detailAccount.bindTime}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1.5">备注</div>
                        <div className="text-sm p-3 rounded-lg bg-muted/30">
                          {detailAccount.accountRemark || '暂无备注'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1.5">标签</div>
                        <div className="flex flex-wrap gap-1.5">
                          {detailAccount.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="font-normal">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="auth" className="p-5">
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg border border-border">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium">授权状态</span>
                          <Badge className={authStatusMap[detailAccount.authStatus].className}>
                            {authStatusMap[detailAccount.authStatus].label}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">授权到期</div>
                            <div className="font-medium">{detailAccount.authExpiresAt}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">上次刷新</div>
                            <div className="font-medium text-xs">{detailAccount.lastSyncAt}</div>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-3">
                          <Shield className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">授权 Scope</span>
                        </div>
                        <div className="space-y-2">
                          {(detailAccount.authScope || []).map((scope) => (
                            <div key={scope} className="flex items-center gap-2 text-sm">
                              <Check className="w-4 h-4 text-[hsl(130_54%_42%)]" />
                              <span>{scope}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">健康状态</span>
                        </div>
                        <div className="text-sm">
                          {detailAccount.healthStatus === 'normal' && (
                            <span className="text-[hsl(130_54%_42%)]">账号绑定状态正常；发布和互动能力以平台页面及获批权限为准</span>
                          )}
                          {detailAccount.healthStatus === 'warning' && (
                            <span className="text-[hsl(26_90%_49%)]">授权即将到期，请及时重新授权</span>
                          )}
                          {detailAccount.healthStatus === 'error' && (
                            <span className="text-[hsl(2_84%_62%)]">授权异常，部分功能受限，请重新授权</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="data" className="p-5">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-[hsl(221_83%_53%)]/5 border border-[hsl(221_83%_53%)]/20">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Users className="w-3.5 h-3.5" />粉丝数
                          </div>
                          <div className="text-xl font-bold text-[hsl(221_83%_53%)]">
                            {formatNumber(detailAccount.followersCount)}
                          </div>
                          <div className={cn(
                            'text-xs mt-0.5',
                            (detailAccount.weeklyGrowth || 0) >= 0 ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]'
                          )}>
                            周 {(detailAccount.weeklyGrowth || 0) >= 0 ? '+' : ''}{detailAccount.weeklyGrowth}%
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-[hsl(26_90%_49%)]/5 border border-[hsl(26_90%_49%)]/20">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <ThumbsUp className="w-3.5 h-3.5" />获赞数
                          </div>
                          <div className="text-xl font-bold text-[hsl(26_90%_49%)]">
                            {formatNumber(detailAccount.likesCount)}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Play className="w-3.5 h-3.5" />作品数
                          </div>
                          <div className="text-xl font-bold">{detailAccount.postsCount}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Eye className="w-3.5 h-3.5" />总播放
                          </div>
                          <div className="text-xl font-bold">
                            {formatNumber(detailAccount.totalPlayCount || 0)}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg border border-border">
                        <div className="text-sm font-medium mb-3">近 7 天趋势</div>
                        <div className="h-48">
                          <ChartContainer config={chartConfig}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(220 14% 69%)" axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11 }} stroke="hsl(220 14% 69%)" axisLine={false} tickLine={false} width={45} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Line type="monotone" dataKey="粉丝" stroke="hsl(221 83% 53%)" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="获赞" stroke="hsl(26 90% 49%)" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </ChartContainer>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="logs" className="p-5">
                    <div className="relative">
                      <div className="absolute left-[11px] top-1 bottom-1 w-px bg-border" />
                      <div className="space-y-4">
                        {operationLogs.map((log, i) => (
                          <div key={i} className="relative flex gap-3">
                            <div className={cn(
                              'w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center shrink-0 z-10 bg-card',
                              log.status === 'success' ? 'border-[hsl(130_54%_42%)]' : 'border-[hsl(2_84%_62%)]'
                            )}>
                              {log.status === 'success' ? (
                                <Check className="w-3 h-3 text-[hsl(130_54%_42%)]" />
                              ) : (
                                <XCircle className="w-3 h-3 text-[hsl(2_84%_62%)]" />
                              )}
                            </div>
                            <div className="flex-1 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{log.action}</span>
                                <Badge variant="secondary" className="text-[10px] h-4">
                                  {log.status === 'success' ? '成功' : '失败'}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">{log.desc}</div>
                              <div className="text-xs text-muted-foreground/70 mt-1">{log.time}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>

              <div className="p-4 border-t border-border">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    setUnbindAccount(detailAccount);
                    setUnbindConfirmOpen(true);
                  }}
                >
                  <Unlink className="w-4 h-4 mr-1.5" />
                  解绑账号
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 新增分组 Dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新增分组</DialogTitle>
            <DialogDescription>输入分组名称，创建后可将账号移入</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-sm font-medium mb-1.5 block">分组名称</Label>
            <Input
              placeholder="请输入分组名称"
              value={groupFormName}
              onChange={(e) => setGroupFormName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddGroupOpen(false); setGroupFormName(''); }}>取消</Button>
            <Button onClick={handleAddGroup}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑分组 Dialog */}
      <Dialog open={editGroupOpen} onOpenChange={setEditGroupOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名分组</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-sm font-medium mb-1.5 block">分组名称</Label>
            <Input
              placeholder="请输入分组名称"
              value={groupFormName}
              onChange={(e) => setGroupFormName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditGroupOpen(false); setEditingGroup(null); setGroupFormName(''); }}>取消</Button>
            <Button onClick={saveEditGroup}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除分组确认 */}
      <AlertDialog open={deleteGroupConfirm} onOpenChange={setDeleteGroupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除分组</AlertDialogTitle>
            <AlertDialogDescription>
              删除「{groupToDelete?.name}」后，该分组内的账号将被移至默认分组。账号本身不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setGroupToDelete(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGroup} className="bg-destructive hover:bg-destructive/90 text-white">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 绑定账号 Dialog */}
      <Dialog open={bindDialogOpen} onOpenChange={setBindDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>绑定账号</DialogTitle>
            <DialogDescription>点击平台即可打开官方登录页，扫码或短信登录后确认绑定</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium mb-2 block">选择平台</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(platformMeta) as PlatformType[]).map((p) => {
                  const meta = platformMeta[p];
                  const Icon = meta.icon;
                  const active = bindPlatform === p;
                  return (
                    <button
                      key={p}
                      disabled={startingOAuth}
                      onClick={() => { setBindPlatform(p); if (window.matrixDesktop?.isDesktop) void startOAuth(p); }}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors',
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                        style={{ backgroundColor: meta.color }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground leading-6">
              <p>1. 点击上方平台，直接在远效内显示官方登录页。</p>
              <p>2. 根据官方页扫码或短信登录；遇到本人验证需要你本人完成，远效不会绕过验证。</p>
              <p>3. 稳定识别到本人昵称和头像后自动绑定；仅收到手机通知或保存工作区不算登录成功。</p>
              <p>视频号：Windows 原生 Edge 内嵌，首次使用新会话需要扫码。B站：从同一会话的官方个人中心核对本人昵称。</p>
              <p className="mt-2 text-xs">二维码由官方实时提供；失效后可刷新登录页。远效不会生成仿制二维码，也不会获取手机验证码。</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBindDialogOpen(false); openPlatformDirectory(); }}>更多平台（29 类）</Button>
            <Button variant="outline" onClick={() => setBindDialogOpen(false)}>取消</Button>
            <Button
              className={window.matrixDesktop?.isDesktop ? "hidden" : undefined}
              disabled={startingOAuth || !platformAvailable(bindPlatform)}
              onClick={() => void startOAuth(bindPlatform)}
            >
              {startingOAuth ? '正在打开…' : window.matrixDesktop?.isDesktop ? '在远效中打开官方授权' : '前往官方授权'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重新授权 Dialog */}
      <Dialog open={reAuthOpen} onOpenChange={setReAuthOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重新授权</DialogTitle>
            <DialogDescription>
              为「{reAuthAccount?.nickname}」重新授权 {reAuthAccount ? platformMeta[reAuthAccount.platform].label : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground leading-6">
            <p>打开该账号的独立官方登录页，扫描官方二维码或按平台提示重新登录，再确认绑定。</p>
            <p className="mt-2 text-xs">{reAuthAccount ? platformAuthMessage(reAuthAccount.platform) : "正在检查平台配置"}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReAuthOpen(false); setReAuthAccount(null); }}>取消</Button>
            <Button
              disabled={startingOAuth || !reAuthAccount || !platformAvailable(reAuthAccount.platform)}
              onClick={() => reAuthAccount && void startOAuth(reAuthAccount.platform, reAuthAccount.connectorSessionId, 'reauthorize')}
            >
              {startingOAuth ? '正在打开…' : window.matrixDesktop?.isDesktop ? '在远效中重新授权' : '前往官方重新授权'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量移动分组 Dialog */}
      <Dialog open={batchMoveOpen} onOpenChange={setBatchMoveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>批量移动分组</DialogTitle>
            <DialogDescription>将选中的 {selectedIds.length} 个账号移动到目标分组</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-sm font-medium mb-1.5 block">目标分组</Label>
            <Select value={batchMoveTarget} onValueChange={setBatchMoveTarget}>
              <SelectTrigger>
                <SelectValue placeholder="选择目标分组" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBatchMoveOpen(false); setBatchMoveTarget(''); }}>取消</Button>
            <Button onClick={handleBatchMove} disabled={!batchMoveTarget}>确认移动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认 */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要解绑选中的 {selectedIds.length} 个账号吗？解绑后数据将会保留，如需重新绑定可随时添加。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} className="bg-destructive hover:bg-destructive/90 text-white">
              确认解绑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 编辑备注 Dialog */}
      <Dialog open={editRemarkOpen} onOpenChange={setEditRemarkOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>编辑备注</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-sm font-medium mb-1.5 block">账号备注</Label>
            <Input
              placeholder="请输入账号备注"
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditRemarkOpen(false); setRemarkAccount(null); }}>取消</Button>
            <Button onClick={handleSaveRemark}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 移动分组 Dialog（单条） */}
      <Dialog open={moveGroupOpen} onOpenChange={setMoveGroupOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>移动分组</DialogTitle>
            <DialogDescription>将「{moveAccount?.nickname}」移动到其他分组</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-sm font-medium mb-1.5 block">目标分组</Label>
            <Select value={moveTargetGroup} onValueChange={setMoveTargetGroup}>
              <SelectTrigger>
                <SelectValue placeholder="选择目标分组" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMoveGroupOpen(false); setMoveAccount(null); setMoveTargetGroup(''); }}>取消</Button>
            <Button onClick={handleMoveGroup} disabled={!moveTargetGroup}>确认移动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 解绑确认 */}
      <AlertDialog open={unbindConfirmOpen} onOpenChange={setUnbindConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认解绑账号</AlertDialogTitle>
            <AlertDialogDescription>
              确定要解绑「{unbindAccount?.nickname}」吗？解绑后该账号的所有数据将保留，如需恢复可重新绑定。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUnbindAccount(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnbind} className="bg-destructive hover:bg-destructive/90 text-white">
              确认解绑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountsPage;

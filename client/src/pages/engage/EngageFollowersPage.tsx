import { useState, useMemo, useRef } from 'react';
import {
  Search,
  Music,
  BookOpen,
  Video,
  Tv,
  AlertTriangle,
  UserCheck,
  Lock,
  Edit3,
  Download,
  Send,
  Tag,
  MessageCircle,
  Calendar,
  MoreHorizontal,
  ArrowUpDown,
  Filter,
  ChevronDown,
  ChevronUp,
  Users,
  MapPin,
  Clock,
  BarChart3,
  Sparkles,
  User,
  PieChart as PieChartIcon,
  TrendingUp,
  X,
  Check,
  Trash2,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import type { FollowerRecord, PlatformType } from '@shared/api.interface';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@client/src/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Checkbox } from '@client/src/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import {
  mockFollowers,
  allFollowerTags,
  mockAccounts,
  platformMeta,
  followerProfileStats,
  mockAccountList,
  mockAccountGroups,
} from './engage-data';
import AccountSelector from '@client/src/components/account/AccountSelector';
import { cn } from '@/lib/utils';

const platformIconMap: Record<PlatformType, any> = {
  douyin: Music,
  xiaohongshu: BookOpen,
  wechat: Video,
  bilibili: Tv,
};

const EngageFollowersPage = () => {
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformType | 'all'>('all');
  const [accountGroupFilter, setAccountGroupFilter] = useState<string | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [mutualFilter, setMutualFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [fanGroupFilter, setFanGroupFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailFollower, setDetailFollower] = useState<FollowerRecord | null>(null);
  const [detailTab, setDetailTab] = useState('profile');
  const [remarkText, setRemarkText] = useState('');
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageContent, setMessageContent] = useState('');
  const [sendAccount, setSendAccount] = useState('1');
  const [rightPanel, setRightPanel] = useState<'none' | 'profile'>('profile');
  const [followers, setFollowers] = useState<FollowerRecord[]>(mockFollowers);
  // 批量操作弹窗
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [batchGroupOpen, setBatchGroupOpen] = useState(false);
  const [batchRemarkOpen, setBatchRemarkOpen] = useState(false);
  const [batchTagValue, setBatchTagValue] = useState('');
  const [batchGroupValue, setBatchGroupValue] = useState('');
  const [batchRemarkValue, setBatchRemarkValue] = useState('');
  // Toast 提示
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 2500);
  };

  // 根据账号分组筛选出符合的账号ID列表
  const filteredAccountIds = useMemo(() => {
    let list = mockAccountList;
    if (platformFilter !== 'all') {
      list = list.filter((a) => a.platform === platformFilter);
    }
    if (accountGroupFilter !== 'all') {
      const group = mockAccountGroups.find((g) => g.id === accountGroupFilter);
      if (group) {
        list = list.filter((a) => a.groupName === group.groupName);
      }
    }
    if (accountFilter !== 'all') {
      list = list.filter((a) => a.id === accountFilter);
    }
    return new Set(list.map((a) => a.id));
  }, [platformFilter, accountGroupFilter, accountFilter]);

  const filteredFollowers = useMemo(() => {
    return followers
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.followedAt || 0).getTime();
        const bTime = new Date(b.followedAt || 0).getTime();
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      })
      .filter((f: FollowerRecord) => {
        if (!filteredAccountIds.has(f.accountId)) return false;
        if (mutualFilter === 'mutual' && !f.isMutual) return false;
        if (mutualFilter === 'nonmutual' && f.isMutual) return false;
        if (mutualFilter === 'private' && !f.isPrivate) return false;
        if (tagFilter !== 'all' && !f.tags?.includes(tagFilter)) return false;
        if (fanGroupFilter !== 'all' && f.groupName !== fanGroupFilter) return false;
        if (searchText && !f.nickname?.includes(searchText)) return false;
        return true;
      });
  }, [followers, filteredAccountIds, mutualFilter, tagFilter, fanGroupFilter, searchText, sortOrder]);

  const paginatedFollowers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredFollowers.slice(start, start + pageSize);
  }, [filteredFollowers, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredFollowers.length / pageSize));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedFollowers.length && paginatedFollowers.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedFollowers.map((f) => f.id));
    }
  };

  const handleDetail = (follower: FollowerRecord) => {
    setDetailFollower(follower);
    setDetailTab('profile');
    setRemarkText(follower.remark || '');
    setDetailOpen(true);
  };

  const handleSendMessage = () => {
    if (!messageContent.trim()) return;
    setMessageContent('');
    setMessageDialogOpen(false);
    showToast('私信已发送');
  };

  // 导出 CSV
  const handleExport = () => {
    const headers = ['昵称', '平台', '来源账号', '标签', '是否互关', '关注时间', '性别', '地区'];
    const rows = filteredFollowers.map((f: FollowerRecord) => [
      f.nickname || '',
      platformMeta[f.platform]?.label || '',
      mockAccounts[f.accountId]?.nickname || '',
      (f.tags || []).join('、'),
      f.isMutual ? '是' : '否',
      f.followedAt || '',
      f.gender || '',
      f.location || '',
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `粉丝列表_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`已导出 ${filteredFollowers.length} 位粉丝数据`);
  };

  // 批量打标签
  const handleBatchTag = () => {
    if (!batchTagValue.trim()) {
      showToast('请选择或输入标签', 'error');
      return;
    }
    setFollowers((prev) =>
      prev.map((f) =>
        selectedIds.includes(f.id)
          ? { ...f, tags: f.tags?.includes(batchTagValue) ? f.tags : [...(f.tags || []), batchTagValue] }
          : f
      )
    );
    // 同步更新详情弹窗中的粉丝
    if (detailFollower && selectedIds.includes(detailFollower.id)) {
      setDetailFollower((prev) => prev ? { ...prev, tags: prev.tags?.includes(batchTagValue) ? prev.tags : [...(prev.tags || []), batchTagValue] } : null);
    }
    setBatchTagOpen(false);
    setBatchTagValue('');
    showToast(`已为 ${selectedIds.length} 位粉丝添加标签「${batchTagValue}」`);
  };

  // 批量移动分组
  const handleBatchGroup = () => {
    if (!batchGroupValue) {
      showToast('请选择分组', 'error');
      return;
    }
    setFollowers((prev) =>
      prev.map((f) =>
        selectedIds.includes(f.id) ? { ...f, groupName: batchGroupValue } : f
      )
    );
    if (detailFollower && selectedIds.includes(detailFollower.id)) {
      setDetailFollower((prev) => prev ? { ...prev, groupName: batchGroupValue } : null);
    }
    setBatchGroupOpen(false);
    setBatchGroupValue('');
    showToast(`已将 ${selectedIds.length} 位粉丝移动到「${batchGroupValue}」`);
  };

  // 批量备注
  const handleBatchRemark = () => {
    if (!batchRemarkValue.trim()) {
      showToast('请输入备注内容', 'error');
      return;
    }
    setFollowers((prev) =>
      prev.map((f) =>
        selectedIds.includes(f.id) ? { ...f, remark: batchRemarkValue } : f
      )
    );
    if (detailFollower && selectedIds.includes(detailFollower.id)) {
      setDetailFollower((prev) => prev ? { ...prev, remark: batchRemarkValue } : null);
    }
    setBatchRemarkOpen(false);
    setBatchRemarkValue('');
    showToast(`已为 ${selectedIds.length} 位粉丝更新备注`);
  };

  // 批量导出
  const handleBatchExport = () => {
    const selected = followers.filter((f) => selectedIds.includes(f.id));
    const headers = ['昵称', '平台', '来源账号', '标签', '是否互关', '关注时间'];
    const rows = selected.map((f: FollowerRecord) => [
      f.nickname || '',
      platformMeta[f.platform]?.label || '',
      mockAccounts[f.accountId]?.nickname || '',
      (f.tags || []).join('、'),
      f.isMutual ? '是' : '否',
      f.followedAt || '',
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `选中粉丝_${selectedIds.length}人.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`已导出 ${selectedIds.length} 位粉丝`);
  };

  // 单个粉丝打标签
  const handleAddTag = (tag: string) => {
    if (!detailFollower) return;
    if (detailFollower.tags?.includes(tag)) return;
    const newTags = [...(detailFollower.tags || []), tag];
    setDetailFollower({ ...detailFollower, tags: newTags });
    setFollowers((prev) =>
      prev.map((f) => (f.id === detailFollower.id ? { ...f, tags: newTags } : f))
    );
    showToast(`已添加标签「${tag}」`);
  };

  const handleRemoveTag = (tag: string) => {
    if (!detailFollower) return;
    const newTags = detailFollower.tags?.filter((t: string) => t !== tag) || [];
    setDetailFollower({ ...detailFollower, tags: newTags });
    setFollowers((prev) =>
      prev.map((f) => (f.id === detailFollower.id ? { ...f, tags: newTags } : f))
    );
    showToast(`已移除标签「${tag}」`);
  };

  // 保存备注
  const handleSaveRemark = () => {
    if (!detailFollower) return;
    setFollowers((prev) =>
      prev.map((f) => (f.id === detailFollower.id ? { ...f, remark: remarkText } : f))
    );
    setDetailFollower({ ...detailFollower, remark: remarkText });
    showToast('备注已保存');
  };

  // 移动到分组（单个）
  const handleMoveToGroup = (follower: FollowerRecord, groupName: string) => {
    setFollowers((prev) =>
      prev.map((f) => (f.id === follower.id ? { ...f, groupName } : f))
    );
    if (detailFollower?.id === follower.id) {
      setDetailFollower({ ...detailFollower, groupName });
    }
    showToast(`已移动到「${groupName}」`);
  };

  // 移除粉丝
  const handleRemoveFollower = (id: string) => {
    setFollowers((prev) => prev.filter((f) => f.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
    if (detailFollower?.id === id) {
      setDetailOpen(false);
      setDetailFollower(null);
    }
    showToast('已移除粉丝');
  };

  // 单个粉丝打标签
  const handleAddSingleTag = (follower: FollowerRecord, tag: string) => {
    const newTags = follower.tags?.includes(tag) ? follower.tags : [...(follower.tags || []), tag];
    setFollowers((prev) =>
      prev.map((f) => (f.id === follower.id ? { ...f, tags: newTags } : f))
    );
    if (detailFollower?.id === follower.id) {
      setDetailFollower({ ...detailFollower, tags: newTags });
    }
    showToast(`已添加标签「${tag}」`);
  };

  const stats = useMemo(() => {
    const today = '2026-09-28';
    const thisMonth = '2026-09';
    let newToday = 0;
    let newThisMonth = 0;
    let active = 0;
    for (const f of filteredFollowers) {
      if (f.tags?.includes('活跃粉丝') || f.tags?.includes('互动达人') || f.tags?.includes('评论达人')) {
        active += 1;
      }
      if (f.followedAt?.startsWith(today)) newToday += 1;
      if (f.followedAt?.startsWith(thisMonth)) newThisMonth += 1;
    }
    return {
      total: filteredFollowers.length,
      newToday,
      newThisMonth,
      active,
    };
  }, [filteredFollowers]);

  // Chart options
  const genderOption = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of filteredFollowers) {
      const g = f.gender || '未知';
      counts[g] = (counts[g] || 0) + 1;
    }
    const entries = Object.entries(counts);
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['50%', '75%'],
        itemStyle: { borderRadius: 4 },
        label: { fontSize: 11 },
        data: entries.length > 0 ? entries.map(([name, value], i) => ({
          value,
          name,
          itemStyle: { color: i === 0 ? 'hsl(350 85% 60%)' : 'hsl(200 90% 55%)' },
        })) : [{ value: 1, name: '暂无数据', itemStyle: { color: 'hsl(220 14% 89%)' } }],
      }],
    };
  }, [filteredFollowers]);

  const locationOption = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of filteredFollowers) {
      const loc = f.location || '未知';
      counts[loc] = (counts[loc] || 0) + 1;
    }
    const entries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reverse();
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 60, right: 20, top: 10, bottom: 20 },
      xAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      yAxis: {
        type: 'category',
        data: entries.map(([name]) => name),
        axisLabel: { fontSize: 10 },
      },
      series: [{
        type: 'bar',
        data: entries.map(([, value]) => value),
        itemStyle: {
          color: 'hsl(221 83% 53%)',
          borderRadius: [0, 4, 4, 0],
        },
        barWidth: 12,
      }],
    };
  }, [filteredFollowers]);

  const activeHoursOption = {
    tooltip: { position: 'top' },
    grid: { height: '60%', top: '10%', left: '12%', right: '5%' },
    xAxis: {
      type: 'category',
      data: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22'],
      axisLabel: { fontSize: 9 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: ['一', '日'],
      axisLabel: { fontSize: 10 },
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: 300,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      textStyle: { fontSize: 10 },
      inRange: {
        color: ['#ebf5ff', '#91caff', '#4096ff', '#1677ff', '#0958d9'],
      },
    },
    series: [{
      type: 'heatmap',
      data: [
        [0, 0, 20], [1, 0, 10], [2, 0, 5], [3, 0, 8], [4, 0, 40], [5, 0, 80],
        [6, 0, 120], [7, 0, 150], [8, 0, 180], [9, 0, 200], [10, 0, 180], [11, 0, 150],
        [0, 1, 30], [1, 1, 15], [2, 1, 8], [3, 1, 12], [4, 1, 60], [5, 1, 100],
        [6, 1, 180], [7, 1, 250], [8, 1, 300], [9, 1, 280], [10, 1, 220], [11, 1, 160],
      ],
      label: { show: false },
    }],
  };

  const sourceOption = {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      itemStyle: { borderRadius: 4 },
      label: { fontSize: 10 },
      data: followerProfileStats.source.map((s, i) => ({
        value: s.value,
        name: s.name,
        itemStyle: { color: ['hsl(221 83% 53%)', 'hsl(26 90% 49%)', 'hsl(130 54% 42%)', 'hsl(350 85% 60%)', 'hsl(200 90% 55%)'][i] },
      })),
    }],
  };

  const interactionTimeline = detailFollower ? [
    { id: 1, type: 'follow', content: '关注了账号', time: detailFollower.followedAt || '' },
    { id: 2, type: 'message', content: '你好呀，请问产品怎么买', time: '2026-09-28 14:30', direction: 'inbound' },
    { id: 3, type: 'message', content: '链接已经发给你啦～', time: '2026-09-28 14:32', direction: 'outbound' },
    { id: 4, type: 'comment', content: '这家店看着好好吃啊', time: '2026-09-27 20:15', postTitle: '成都火锅探店vlog' },
  ] : [];

  return (
    <div className="p-0 space-y-4">
      <Alert variant="warning">
        <AlertTriangle className="w-4 h-4" />
        <AlertDescription>
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">粉丝管理</h1>
          <Badge variant="secondary">{filteredFollowers.length} 位粉丝</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={handleExport}>
             <Download className="w-4 h-4" />
             导出粉丝
           </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4" data-ai-section-type="card-stat">
        {[
          { label: '粉丝总数', value: stats.total.toLocaleString(), icon: Users, color: 'text-primary', trend: `+${stats.newToday}` },
          { label: '今日新增', value: stats.newToday, icon: TrendingUp, color: 'text-[hsl(130_54%_42%)]', trend: '' },
          { label: '本月新增', value: stats.newThisMonth, icon: BarChart3, color: 'text-[hsl(26_90%_49%)]', trend: '' },
          { label: '活跃粉丝', value: stats.active, icon: Sparkles, color: 'text-[hsl(200_90%_55%)]', trend: '' },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-foreground">{s.value}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  {s.trend && (
                    <span className="text-[10px] text-[hsl(130_54%_42%)]">{s.trend}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content: list + profile */}
      <div className="flex gap-4">
        {/* Left: list */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索粉丝昵称"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-8"
                />
              </div>
              <AccountSelector
                accounts={mockAccountList}
                groups={mockAccountGroups}
                platform={platformFilter}
                groupId={accountGroupFilter}
                accountId={accountFilter}
                onPlatformChange={setPlatformFilter}
                onGroupChange={setAccountGroupFilter}
                onAccountChange={setAccountFilter}
                size="sm"
              />
              <Select value={mutualFilter} onValueChange={setMutualFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="关系" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="mutual">互关</SelectItem>
                  <SelectItem value="nonmutual">未互关</SelectItem>
                  <SelectItem value="private">隐私号</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="标签" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部标签</SelectItem>
                  {allFollowerTags.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fanGroupFilter} onValueChange={setFanGroupFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="粉丝分组" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分组</SelectItem>
                  <SelectItem value="VIP粉丝">VIP粉丝</SelectItem>
                  <SelectItem value="活跃群">活跃群</SelectItem>
                  <SelectItem value="默认分组">默认分组</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 h-9">
                    <ArrowUpDown className="w-4 h-4" />
                    排序
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => setSortOrder('desc')}>
                    关注时间倒序
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOrder('asc')}>
                    关注时间正序
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>

          {/* Batch bar */}
          {selectedIds.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="text-sm text-foreground">
                  已选择 <span className="font-medium text-primary">{selectedIds.length}</span> 位粉丝
                </div>
                <div className="flex items-center gap-2">
                   <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => { setBatchTagValue(''); setBatchTagOpen(true); }}>
                     <Tag className="w-3.5 h-3.5" />
                     批量打标签
                   </Button>
                   <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => { setBatchGroupValue(''); setBatchGroupOpen(true); }}>
                     <Users className="w-3.5 h-3.5" />
                     批量分组
                   </Button>
                   <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => { setBatchRemarkValue(''); setBatchRemarkOpen(true); }}>
                     <Edit3 className="w-3.5 h-3.5" />
                     批量备注
                   </Button>
                   <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleBatchExport}>
                     <Download className="w-3.5 h-3.5" />
                     批量导出
                   </Button>
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedIds([])}>
                    取消
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={paginatedFollowers.length > 0 && selectedIds.length === paginatedFollowers.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[180px]">粉丝</TableHead>
                    <TableHead className="w-[100px]">平台</TableHead>
                    <TableHead className="w-[140px]">来源账号</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead className="w-[80px]">是否互关</TableHead>
                    <TableHead className="w-[140px]">关注时间</TableHead>
                    <TableHead className="text-right w-[160px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedFollowers.map((f: FollowerRecord) => {
                    const Icon = platformIconMap[f.platform];
                    const color = platformMeta[f.platform].color;
                    const account = mockAccounts[f.accountId];
                    return (
                      <TableRow key={f.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(f.id)}
                            onCheckedChange={() => toggleSelect(f.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="relative shrink-0">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={f.avatarUrl} />
                                <AvatarFallback>{f.nickname?.[0]}</AvatarFallback>
                              </Avatar>
                              {f.isPrivate && (
                                <Lock className="absolute -top-0.5 -right-0.5 w-3 h-3 text-[hsl(26_90%_49%)] bg-card rounded-full p-[1px]" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate max-w-[120px]">{f.nickname}</div>
                              {f.remark && (
                                <div className="text-[10px] text-muted-foreground truncate">备注：{f.remark}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-white"
                              style={{ backgroundColor: color }}
                            >
                              <Icon className="w-2.5 h-2.5" />
                            </div>
                            <span className="text-xs text-muted-foreground">{platformMeta[f.platform].label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{account?.nickname || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {f.tags?.slice(0, 2).map((tag: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-[10px] h-4 px-1.5">
                                {tag}
                              </Badge>
                            ))}
                            {f.tags && f.tags.length > 2 && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                +{f.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {f.isMutual ? (
                            <Badge variant="outline" className="text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/40 text-xs">
                              <UserCheck className="w-3 h-3 mr-0.5" />
                              互关
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">单关</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {f.followedAt?.split(' ')[0]}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => handleDetail(f)}>
                              <User className="w-3.5 h-3.5" />
                              详情
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSendAccount(f.accountId); setMessageDialogOpen(true); setDetailFollower(f); }}>
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                               <DropdownMenuContent align="end" className="w-36">
                                 <DropdownMenuItem onClick={() => handleAddSingleTag(f, '活跃粉丝')}>
                                   <Tag className="w-3.5 h-3.5 mr-2" />打标签
                                 </DropdownMenuItem>
                                 <DropdownMenuItem onClick={() => handleMoveToGroup(f, 'VIP粉丝')}>
                                   <Users className="w-3.5 h-3.5 mr-2" />移动分组
                                 </DropdownMenuItem>
                                 <DropdownMenuItem onClick={() => handleRemoveFollower(f.id)} className="text-destructive">
                                   <Trash2 className="w-3.5 h-3.5 mr-2" />移除粉丝
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

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              共 {filteredFollowers.length} 位粉丝
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}条/页</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  <ChevronDown className="w-4 h-4 -rotate-90" />
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: profile panel */}
        <div className="w-[300px] shrink-0 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[hsl(26_90%_49%)]" />
                  <span className="font-medium text-sm">粉丝画像</span>
                </div>
                <Badge variant="outline" className="text-[10px] text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/50">
                  示例数据
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                待平台数据同步后将展示真实粉丝画像
              </p>

              <div className="space-y-4">
                <div>
                  <div className="text-xs font-medium mb-2 flex items-center gap-1">
                    <PieChartIcon className="w-3 h-3" />
                    性别分布
                  </div>
                  <ReactECharts option={genderOption} style={{ height: 140 }} />
                </div>

                <div>
                  <div className="text-xs font-medium mb-2 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    地域分布 TOP10
                  </div>
                  <ReactECharts option={locationOption} style={{ height: 200 }} />
                </div>

                <div>
                  <div className="text-xs font-medium mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    活跃时段热力图
                  </div>
                  <ReactECharts option={activeHoursOption} style={{ height: 160 }} />
                </div>

                <div>
                  <div className="text-xs font-medium mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    关注来源分布
                  </div>
                  <ReactECharts option={sourceOption} style={{ height: 160 }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>粉丝详情</DialogTitle>
          </DialogHeader>
          {detailFollower && (
            <>
              <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                <Avatar className="w-16 h-16 shrink-0">
                  <AvatarImage src={detailFollower.avatarUrl} />
                  <AvatarFallback className="text-xl">
                    {detailFollower.nickname?.[0] || '粉'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-foreground truncate">
                      {detailFollower.nickname}
                    </h2>
                    <Badge
                      variant="secondary"
                      className="text-[11px]"
                      style={{
                        backgroundColor: `${platformMeta[detailFollower.platform].color}15`,
                        color: platformMeta[detailFollower.platform].color,
                        border: 'none',
                      }}
                    >
                      {platformMeta[detailFollower.platform].label}
                    </Badge>
                    {detailFollower.isMutual && (
                      <Badge variant="outline" className="text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/40 text-[11px]">
                        <UserCheck className="w-3 h-3 mr-0.5" />
                        互相关注
                      </Badge>
                    )}
                    {detailFollower.isPrivate && (
                      <Badge variant="outline" className="text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/40 text-[11px]">
                        <Lock className="w-3 h-3 mr-0.5" />
                        隐私账号
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      关注于 {detailFollower.followedAt}
                    </div>
                    <div>来自：{mockAccounts[detailFollower.accountId]?.nickname}</div>
                    {detailFollower.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {detailFollower.location}
                      </div>
                    )}
                    {detailFollower.gender && <div>{detailFollower.gender}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="gap-1" onClick={() => setMessageDialogOpen(true)}>
                      <Send className="w-3.5 h-3.5" />
                      发起私信
                    </Button>
                     <Button variant="outline" size="sm" className="gap-1" onClick={() => setDetailTab('remark')}>
                       <Edit3 className="w-3.5 h-3.5" />
                       备注
                     </Button>
                  </div>
                </div>
              </div>

              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList>
                  <TabsTrigger value="profile">基础资料</TabsTrigger>
                  <TabsTrigger value="interactions">互动记录</TabsTrigger>
                  <TabsTrigger value="tags">标签管理</TabsTrigger>
                  <TabsTrigger value="remark">备注</TabsTrigger>
                </TabsList>

                <TabsContent value="profile" className="mt-3">
                  <Card>
                    <CardContent className="p-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">平台ID</span>
                        <span>{detailFollower.followerPlatformId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">性别</span>
                        <span>{detailFollower.gender || '未知'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">地区</span>
                        <span>{detailFollower.location || '未知'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">分组</span>
                        <span>{detailFollower.groupName || '默认分组'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">粉丝数</span>
                        <span>示例数据</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">关注数</span>
                        <span>示例数据</span>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="interactions" className="mt-3">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground mb-3">
                      跨账号互动时间线
                    </div>
                    {interactionTimeline.map((item) => (
                      <div key={item.id} className="flex gap-3 pb-4 relative">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 z-10">
                          {item.type === 'message' && <MessageCircle className="w-4 h-4 text-primary" />}
                          {item.type === 'comment' && <MessageCircle className="w-4 h-4 text-[hsl(350_85%_60%)]" />}
                          {item.type === 'follow' && <UserCheck className="w-4 h-4 text-[hsl(130_54%_42%)]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground mb-1">
                            {item.time}
                            {item.direction && (
                              <span className="ml-2">
                                {item.direction === 'inbound' ? '对方发送' : '我方回复'}
                              </span>
                            )}
                            {item.postTitle && (
                              <span className="ml-2">· {item.postTitle}</span>
                            )}
                          </div>
                          <div className="text-sm text-foreground bg-muted/40 rounded-lg p-2.5 inline-block max-w-full">
                            {item.content}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="tags" className="mt-3">
                  <div className="space-y-4">
                    <div className="text-xs font-medium text-muted-foreground">已有标签</div>
                   <div className="flex flex-wrap gap-2">
                       {detailFollower.tags?.map((tag: string, i: number) => (
                         <Badge key={i} variant="secondary" className="text-xs px-3 py-1 gap-1">
                           {tag}
                           <button
                             className="ml-1 hover:text-foreground/80 inline-flex items-center"
                             onClick={() => handleRemoveTag(tag)}
                             title="移除标签"
                           >
                             <X className="w-3 h-3" />
                           </button>
                         </Badge>
                       ))}
                       {(!detailFollower.tags || detailFollower.tags.length === 0) && (
                         <span className="text-xs text-muted-foreground">暂无标签</span>
                       )}
                     </div>
                     <div className="text-xs font-medium text-muted-foreground mt-4">可添加标签</div>
                     <div className="flex flex-wrap gap-2">
                       {allFollowerTags
                         .filter((t) => !detailFollower.tags?.includes(t))
                         .map((tag: string, i: number) => (
                           <Badge
                             key={i}
                             variant="outline"
                             className="text-xs px-3 py-1 cursor-pointer hover:bg-muted hover:border-primary/50"
                             onClick={() => handleAddTag(tag)}
                           >
                             <Tag className="w-3 h-3 mr-1" />
                             + {tag}
                           </Badge>
                         ))}
                     </div>
                  </div>
                </TabsContent>

                <TabsContent value="remark" className="mt-3">
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-muted-foreground">备注信息</div>
                    <Textarea
                      placeholder="添加备注..."
                      value={remarkText}
                      onChange={(e) => setRemarkText(e.target.value)}
                      className="min-h-[120px] text-sm"
                    />
                     <Button size="sm" onClick={handleSaveRemark}>
                       <Check className="w-3.5 h-3.5 mr-1" />
                       保存备注
                     </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Dialog */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>发起私信</DialogTitle>
            <DialogDescription>
              向 {detailFollower?.nickname} 发送私信
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">发送账号</label>
              <Select value={sendAccount} onValueChange={setSendAccount}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(mockAccounts)
                    .filter((a) => detailFollower && a.platform === detailFollower.platform)
                    .map((a) => {
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
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">消息内容</label>
              <Textarea
                placeholder="输入私信内容..."
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageDialogOpen(false)}>取消</Button>
            <Button onClick={handleSendMessage}>
              <Send className="w-3.5 h-3.5 mr-1" />
              发送
            </Button>
          </DialogFooter>
        </DialogContent>
       </Dialog>

      {/* 批量打标签弹窗 */}
      <Dialog open={batchTagOpen} onOpenChange={setBatchTagOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量打标签</DialogTitle>
            <DialogDescription>
              已选择 {selectedIds.length} 位粉丝，选择或输入要添加的标签
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-2 block">选择标签</label>
              <div className="flex flex-wrap gap-2">
                {allFollowerTags.map((tag: string) => (
                  <Badge
                    key={tag}
                    variant={batchTagValue === tag ? 'default' : 'outline'}
                    className="text-xs px-3 py-1 cursor-pointer"
                    onClick={() => setBatchTagValue(tag)}
                  >
                    {batchTagValue === tag && <Check className="w-3 h-3 mr-1" />}
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">或输入新标签</label>
              <Input
                placeholder="输入自定义标签名"
                value={batchTagValue}
                onChange={(e) => setBatchTagValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchTagOpen(false)}>取消</Button>
            <Button onClick={handleBatchTag}>
              <Tag className="w-3.5 h-3.5 mr-1" />
              确认添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量分组弹窗 */}
      <Dialog open={batchGroupOpen} onOpenChange={setBatchGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量移动分组</DialogTitle>
            <DialogDescription>
              已选择 {selectedIds.length} 位粉丝，选择目标分组
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">目标分组</label>
              <Select value={batchGroupValue || 'all'} onValueChange={setBatchGroupValue}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择分组" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIP粉丝">VIP粉丝</SelectItem>
                  <SelectItem value="活跃群">活跃群</SelectItem>
                  <SelectItem value="默认分组">默认分组</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchGroupOpen(false)}>取消</Button>
            <Button onClick={handleBatchGroup}>
              <Users className="w-3.5 h-3.5 mr-1" />
              确认移动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量备注弹窗 */}
      <Dialog open={batchRemarkOpen} onOpenChange={setBatchRemarkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量设置备注</DialogTitle>
            <DialogDescription>
              已选择 {selectedIds.length} 位粉丝，输入统一备注内容
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">备注内容</label>
              <Textarea
                placeholder="输入备注内容..."
                value={batchRemarkValue}
                onChange={(e) => setBatchRemarkValue(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchRemarkOpen(false)}>取消</Button>
            <Button onClick={handleBatchRemark}>
              <Edit3 className="w-3.5 h-3.5 mr-1" />
              确认设置
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

export default EngageFollowersPage;

import { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Heart,
  MessageCircle,
  Share2,
  Search,
  Settings,
  Grid2x2,
  LayoutList,
  ChevronDown,
  Eye,
  EyeOff,
  Info,
  Clock,
  TrendingUp,
  TrendingDown,
  User,
  Download,
  X,
  BarChart3,
  Film,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Checkbox } from '@client/src/components/ui/checkbox';
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
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@client/src/components/ui/dialog';
import { Avatar, AvatarFallback } from '@client/src/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Image } from '@client/src/components/ui/image';
import AccountSelector from '@client/src/components/account/AccountSelector';
import type { PlatformAccount, AccountGroup, PlatformType } from '@shared/api.interface';

interface WorkItem {
  id: string;
  title: string;
  account: string;
  accountAvatar: string;
  thumbnail: string;
  platform: string;
  plays: number;
  playsDelta: number;
  likes: number;
  likesDelta: number;
  comments: number;
  commentsDelta: number;
  shares: number;
  sharesDelta: number;
}

const baseWorks: Omit<WorkItem, 'playsDelta' | 'likesDelta' | 'commentsDelta' | 'sharesDelta'>[] = [
  { id: '1', title: '北京烤鸭哪家强？5家老字号深度测评', account: '美食探店小队', accountAvatar: '美', thumbnail: 'https://picsum.photos/seed/work1/400/225', platform: '抖音', plays: 152340, likes: 8920, comments: 1240, shares: 560 },
  { id: '2', title: '平价彩妆红黑榜｜学生党必看避雷指南', account: '美妆测评师', accountAvatar: '美', thumbnail: 'https://picsum.photos/seed/work2/400/225', platform: '小红书', plays: 0, likes: 12680, comments: 2340, shares: 890 },
  { id: '3', title: '程序员桌面好物分享｜效率提升200%', account: '科技宅频道', accountAvatar: '科', thumbnail: 'https://picsum.photos/seed/work3/400/225', platform: 'B站', plays: 98760, likes: 6240, comments: 890, shares: 320 },
  { id: '4', title: '秋季护肤全攻略｜干皮油皮都适用', account: '生活种草日记', accountAvatar: '生', thumbnail: 'https://picsum.photos/seed/work4/400/225', platform: '小红书', plays: 0, likes: 9870, comments: 1560, shares: 430 },
  { id: '5', title: '职场新人避坑指南｜我踩过的那些坑', account: '职场成长', accountAvatar: '职', thumbnail: 'https://picsum.photos/seed/work5/400/225', platform: '视频号', plays: 45230, likes: 3210, comments: 560, shares: 280 },
  { id: '6', title: '三亚5天4晚自由行攻略｜人均3000', account: '旅行日记Vlog', accountAvatar: '旅', thumbnail: 'https://picsum.photos/seed/work6/400/225', platform: '抖音', plays: 234560, likes: 15680, comments: 2890, shares: 1230 },
  { id: '7', title: '新手健身入门｜30天蜕变计划', account: '健身教练阿杰', accountAvatar: '健', thumbnail: 'https://picsum.photos/seed/work7/400/225', platform: 'B站', plays: 67890, likes: 4560, comments: 780, shares: 340 },
  { id: '8', title: '猫咪日常｜我家主子的一天', account: '萌宠日记', accountAvatar: '萌', thumbnail: 'https://picsum.photos/seed/work8/400/225', platform: '抖音', plays: 312450, likes: 23450, comments: 3560, shares: 1890 },
  { id: '9', title: '家居收纳技巧｜小户型也能整整齐齐', account: '生活种草日记', accountAvatar: '生', thumbnail: 'https://picsum.photos/seed/work9/400/225', platform: '小红书', plays: 0, likes: 7650, comments: 1230, shares: 560 },
  { id: '10', title: '数码开箱｜最新旗舰手机深度评测', account: '科技宅频道', accountAvatar: '科', thumbnail: 'https://picsum.photos/seed/work10/400/225', platform: 'B站', plays: 145670, likes: 9870, comments: 1670, shares: 720 },
];

// 平台中文名 -> PlatformType 映射
const PLATFORM_NAME_TO_TYPE: Record<string, PlatformType> = {
  '抖音': 'douyin',
  '小红书': 'xiaohongshu',
  '视频号': 'wechat',
  'B站': 'bilibili',
};

// 模拟账号数据（与 baseWorks 中的 account 对应）
const mockAccounts: PlatformAccount[] = [
  { id: 'acc_1', platform: 'douyin', nickname: '美食探店小队', avatarUrl: '', groupName: '美食组', authStatus: 'authorized', followersCount: 125000, followingCount: 230, likesCount: 890000, postsCount: 156, healthStatus: 'normal', createdAt: '2024-01-15T00:00:00Z' },
  { id: 'acc_2', platform: 'xiaohongshu', nickname: '美妆测评师', avatarUrl: '', groupName: '美妆组', authStatus: 'authorized', followersCount: 89000, followingCount: 180, likesCount: 560000, postsCount: 210, healthStatus: 'normal', createdAt: '2024-02-10T00:00:00Z' },
  { id: 'acc_3', platform: 'bilibili', nickname: '科技宅频道', avatarUrl: '', groupName: '科技组', authStatus: 'authorized', followersCount: 230000, followingCount: 45, likesCount: 1200000, postsCount: 89, healthStatus: 'normal', createdAt: '2023-11-20T00:00:00Z' },
  { id: 'acc_4', platform: 'xiaohongshu', nickname: '生活种草日记', avatarUrl: '', groupName: '生活组', authStatus: 'authorized', followersCount: 67000, followingCount: 320, likesCount: 430000, postsCount: 178, healthStatus: 'normal', createdAt: '2024-03-05T00:00:00Z' },
  { id: 'acc_5', platform: 'wechat', nickname: '职场成长', avatarUrl: '', groupName: '职场组', authStatus: 'authorized', followersCount: 45000, followingCount: 90, likesCount: 210000, postsCount: 67, healthStatus: 'normal', createdAt: '2024-04-12T00:00:00Z' },
  { id: 'acc_6', platform: 'douyin', nickname: '旅行日记Vlog', avatarUrl: '', groupName: '生活组', authStatus: 'authorized', followersCount: 178000, followingCount: 156, likesCount: 980000, postsCount: 134, healthStatus: 'normal', createdAt: '2023-09-28T00:00:00Z' },
  { id: 'acc_7', platform: 'bilibili', nickname: '健身教练阿杰', avatarUrl: '', groupName: '生活组', authStatus: 'authorized', followersCount: 56000, followingCount: 78, likesCount: 340000, postsCount: 92, healthStatus: 'normal', createdAt: '2024-01-30T00:00:00Z' },
  { id: 'acc_8', platform: 'douyin', nickname: '萌宠日记', avatarUrl: '', groupName: '生活组', authStatus: 'authorized', followersCount: 420000, followingCount: 210, likesCount: 2100000, postsCount: 245, healthStatus: 'normal', createdAt: '2023-06-15T00:00:00Z' },
];

// 模拟分组数据
const mockGroups: AccountGroup[] = [
  { id: 'grp_food', userId: 'u_demo', groupName: '美食组', sortOrder: 1, isDefault: false, accountCount: 1, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'grp_beauty', userId: 'u_demo', groupName: '美妆组', sortOrder: 2, isDefault: false, accountCount: 1, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'grp_tech', userId: 'u_demo', groupName: '科技组', sortOrder: 3, isDefault: false, accountCount: 1, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'grp_life', userId: 'u_demo', groupName: '生活组', sortOrder: 4, isDefault: true, accountCount: 4, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'grp_career', userId: 'u_demo', groupName: '职场组', sortOrder: 5, isDefault: false, accountCount: 1, createdAt: '2024-01-01T00:00:00Z' },
];

const formatCount = (n: number): string => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
};

// Generate mock hourly trend for detail view
const generateTrendData = (basePlay: number, hours: number): number[] => {
  const data: number[] = [];
  let val = basePlay * 0.7;
  for (let i = 0; i < hours; i++) {
    val += (basePlay / hours) * (0.5 + Math.random() * 1);
    data.push(Math.floor(val));
  }
  return data;
};

const DeltaBadge: React.FC<{ value: number }> = ({ value }) => {
  if (value === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const isUp = value > 0;
  return (
    <span className={cn('text-xs font-medium flex items-center gap-0.5', isUp ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]')}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{value}
    </span>
  );
};

const AnalyticsMonitorPage: React.FC = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [colMode, setColMode] = useState<'double' | 'single'>('double');
  const [searchText, setSearchText] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<PlatformType | 'all'>('all');
  const [groupFilter, setGroupFilter] = useState<string | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all');
  const [flowFilter, setFlowFilter] = useState('all');
  const [sortBy, setSortBy] = useState('time');
  const [selectedWork, setSelectedWork] = useState<WorkItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [monitorInterval, setMonitorInterval] = useState(5);

  // 根据筛选条件计算当前账号数
  const filteredAccountCount = useMemo(() => {
    let list = mockAccounts;
    if (platformFilter !== 'all') {
      list = list.filter((a: PlatformAccount) => a.platform === platformFilter);
    }
    if (groupFilter !== 'all') {
      const group = mockGroups.find((g: AccountGroup) => g.id === groupFilter);
      if (group) {
        list = list.filter((a: PlatformAccount) => a.groupName === group.groupName);
      }
    }
    if (accountFilter !== 'all') {
      list = list.filter((a: PlatformAccount) => a.id === accountFilter);
    }
    return list.length;
  }, [platformFilter, groupFilter, accountFilter]);

  const workCount = works.length;

  const stats = useMemo(() => {
    if (works.length === 0) return { maxPlay: 0, minPlay: 0, totalPlays: 0, totalLikes: 0, totalComments: 0, totalShares: 0 };
    const plays = works.map((w) => w.plays).filter((p) => p > 0);
    const totalPlays = works.reduce((s, w) => s + w.plays, 0);
    const totalLikes = works.reduce((s, w) => s + w.likes, 0);
    const totalComments = works.reduce((s, w) => s + w.comments, 0);
    const totalShares = works.reduce((s, w) => s + w.shares, 0);
    if (plays.length === 0) return { maxPlay: 0, minPlay: 0, totalPlays: 0, totalLikes, totalComments, totalShares };
    return { maxPlay: Math.max(...plays), minPlay: Math.min(...plays), totalPlays, totalLikes, totalComments, totalShares };
  }, [works]);

  const detailTrend = useMemo(() => {
    if (!selectedWork) return [];
    return generateTrendData(selectedWork.plays, 24);
  }, [selectedWork]);

  const handleOpenDetail = (work: WorkItem) => {
    setSelectedWork(work);
    setDetailOpen(true);
  };

  const handleExportData = () => {
    if (filteredWorks.length === 0) return;
    const headers = ['ID', '标题', '平台', '账号', '播放', '点赞', '评论', '分享'];
    const rows = filteredWorks.map((w) => [
      w.id, w.title, w.platform, w.account, w.plays, w.likes, w.comments, w.shares,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `作品监控数据_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSingle = () => {
    if (!selectedWork) return;
    const headers = ['字段', '数值'];
    const rows = [
      ['标题', selectedWork.title],
      ['平台', selectedWork.platform],
      ['账号', selectedWork.account],
      ['播放量', selectedWork.plays],
      ['点赞', selectedWork.likes],
      ['评论', selectedWork.comments],
      ['分享', selectedWork.shares],
    ];
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `作品详情_${selectedWork.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBatchHide = () => {
    const ids = filteredWorks.map((w) => w.id);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleRefreshAll = () => {
    setLastRefresh('刚刚');
    // 触发一次增量刷新（模拟立即刷新）
    if (isMonitoring && works.length > 0) {
      setWorks((prev) =>
        prev.map((w) => {
          const playDelta = w.plays > 0 ? Math.floor(Math.random() * 80) + 10 : 0;
          const likeDelta = Math.floor(Math.random() * 25) + 5;
          const commentDelta = Math.floor(Math.random() * 8);
          const shareDelta = Math.floor(Math.random() * 5);
          return {
            ...w,
            plays: w.plays + playDelta,
            playsDelta: playDelta,
            likes: Math.max(0, w.likes + likeDelta),
            likesDelta: likeDelta,
            comments: Math.max(0, w.comments + commentDelta),
            commentsDelta: commentDelta,
            shares: Math.max(0, w.shares + shareDelta),
            sharesDelta: shareDelta,
          };
        })
      );
    }
  };

  const startMonitoring = () => {
    setIsMonitoring(true);
    // 3秒后加载示例数据
    setTimeout(() => {
      const initial: WorkItem[] = baseWorks.map((w) => ({
        ...w,
        playsDelta: Math.floor(Math.random() * 50) + 1,
        likesDelta: Math.floor(Math.random() * 20) + 1,
        commentsDelta: Math.floor(Math.random() * 10),
        sharesDelta: Math.floor(Math.random() * 8),
      }));
      setWorks(initial);
      setLastRefresh('刚刚');
    }, 3000);
  };

  const stopMonitoring = () => {
    setIsMonitoring(false);
  };

  // 按设置间隔自动刷新数据
  useEffect(() => {
    if (!isMonitoring || works.length === 0) return;
    const timer = setInterval(() => {
      setWorks((prev) =>
        prev.map((w) => {
          const playDelta = w.plays > 0 ? Math.floor(Math.random() * 50) + 1 : 0;
          const likeDelta = Math.floor(Math.random() * 15) + 1;
          const commentDelta = Math.floor(Math.random() * 5);
          const shareDelta = Math.floor(Math.random() * 3);
          // 偶尔出现负增量
          const negLike = Math.random() < 0.1 ? -Math.floor(Math.random() * 3) : 0;
          return {
            ...w,
            plays: w.plays + playDelta,
            playsDelta: playDelta,
            likes: Math.max(0, w.likes + likeDelta + negLike),
            likesDelta: likeDelta + negLike,
            comments: Math.max(0, w.comments + commentDelta),
            commentsDelta: commentDelta,
            shares: Math.max(0, w.shares + shareDelta),
            sharesDelta: shareDelta,
          };
        })
      );
       setLastRefresh('刚刚');
     }, monitorInterval * 1000);
     return () => clearInterval(timer);
   }, [isMonitoring, works.length, monitorInterval]);

  // 更新"最后刷新"显示
  useEffect(() => {
    if (!lastRefresh) return;
    if (lastRefresh === '刚刚') {
      const timer = setTimeout(() => setLastRefresh('1 分钟前'), 60000);
      return () => clearTimeout(timer);
    }
  }, [lastRefresh]);

  const filteredWorks = useMemo(() => {
    let result = works.filter((w) => {
      // 隐藏项筛选
      if (!showHidden && hiddenIds.has(w.id)) return false;
      if (searchText && !w.title.includes(searchText) && !w.account.includes(searchText)) return false;
      // 平台筛选
      if (platformFilter !== 'all') {
        const platformType = PLATFORM_NAME_TO_TYPE[w.platform];
        if (platformType !== platformFilter) return false;
      }
      // 分组筛选
      if (groupFilter !== 'all') {
        const group = mockGroups.find((g: AccountGroup) => g.id === groupFilter);
        const account = mockAccounts.find((a: PlatformAccount) => a.nickname === w.account);
        if (!group || !account || account.groupName !== group.groupName) return false;
      }
      // 账号筛选
      if (accountFilter !== 'all') {
        const account = mockAccounts.find((a: PlatformAccount) => a.id === accountFilter);
        if (!account || account.nickname !== w.account) return false;
      }
      // 流速筛选
      if (flowFilter !== 'all') {
        const delta = w.playsDelta + w.likesDelta + w.commentsDelta + w.sharesDelta;
        if (flowFilter === 'fast' && delta < 50) return false;
        if (flowFilter === 'normal' && (delta < 10 || delta >= 50)) return false;
        if (flowFilter === 'slow' && (delta < 0 || delta >= 10)) return false;
        if (flowFilter === 'down' && delta >= 0) return false;
      }
      return true;
    });
    // 排序
    const sorted = [...result];
    switch (sortBy) {
      case 'plays':
        sorted.sort((a, b) => b.plays - a.plays);
        break;
      case 'likes':
        sorted.sort((a, b) => b.likes - a.likes);
        break;
      case 'flow':
        sorted.sort((a, b) => (b.playsDelta + b.likesDelta) - (a.playsDelta + a.likesDelta));
        break;
      case 'time':
      default:
        // 按 id 顺序（原始顺序）
        break;
    }
    return sorted;
  }, [works, searchText, platformFilter, groupFilter, accountFilter, flowFilter, sortBy, showHidden, hiddenIds]);

  return (
    <div className="space-y-0">
      {/* 合规提示条 */}
      <Alert variant="default" className="bg-info/10 border-info/30 text-info rounded-none border-x-0 border-t-0 mx-0">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info text-xs">
          监控数据仅限已授权自有矩阵账号，数据来源为各平台官方开放接口 · 仅供运营分析参考
        </AlertDescription>
      </Alert>

      {/* 顶部状态条 */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            账号数 <span className="font-semibold text-foreground">{filteredAccountCount}</span>
          </span>
          <span className="text-muted-foreground">
            作品数 <span className="font-semibold text-foreground">{workCount || '—'}</span>
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', isMonitoring ? 'bg-[hsl(130_54%_42%)]' : 'bg-[hsl(2_84%_62%)]')} />
            <span className={cn('font-medium', isMonitoring ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]')}>
              {isMonitoring ? '监控中' : '已停止'}
            </span>
          </div>
          {lastRefresh && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              最后刷新：{lastRefresh}
            </span>
          )}
          {works.length > 0 && (
            <>
              <span className="text-muted-foreground">
                最高播放 <span className="font-semibold text-foreground">{formatCount(stats.maxPlay)}</span>
              </span>
              <span className="text-muted-foreground">
                最低播放 <span className="font-semibold text-foreground">{formatCount(stats.minPlay)}</span>
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="w-4 h-4 mr-1" />
            打开设置
          </Button>
          <Button
            size="sm"
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            className="bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white"
          >
            {isMonitoring ? '停止监控' : '开始监控'}
          </Button>
        </div>
      </div>

       {/* 核心指标卡 */}
       {works.length > 0 && (
         <div className="px-6 py-4 border-b border-border">
           <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-ai-section-type="card-stat">
             <div className="bg-muted/30 rounded-lg p-3">
               <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                 <Film className="w-3.5 h-3.5" />
                 监控作品数
               </div>
               <div className="text-xl font-bold text-foreground">{works.length}</div>
             </div>
             <div className="bg-muted/30 rounded-lg p-3">
               <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                 <Play className="w-3.5 h-3.5" />
                 总播放
               </div>
               <div className="text-xl font-bold text-foreground">{formatCount(stats.totalPlays)}</div>
             </div>
             <div className="bg-muted/30 rounded-lg p-3">
               <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                 <Heart className="w-3.5 h-3.5" />
                 总点赞
               </div>
               <div className="text-xl font-bold text-foreground">{formatCount(stats.totalLikes)}</div>
             </div>
             <div className="bg-muted/30 rounded-lg p-3">
               <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                 <MessageCircle className="w-3.5 h-3.5" />
                 总评论
               </div>
               <div className="text-xl font-bold text-foreground">{formatCount(stats.totalComments)}</div>
             </div>
             <div className="bg-muted/30 rounded-lg p-3">
               <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                 <Share2 className="w-3.5 h-3.5" />
                 总分享
               </div>
               <div className="text-xl font-bold text-foreground">{formatCount(stats.totalShares)}</div>
             </div>
           </div>
         </div>
       )}

       {/* 筛选栏 */}
      <div className="bg-card/50 border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
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
          showAllOption
          placeholderAccount="全部账号"
        />

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="作品标题/描述"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Select value={flowFilter} onValueChange={setFlowFilter}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue placeholder="增量流速" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部流速</SelectItem>
            <SelectItem value="fast">高速增长</SelectItem>
            <SelectItem value="normal">正常</SelectItem>
            <SelectItem value="slow">缓慢</SelectItem>
            <SelectItem value="down">下降</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Checkbox id="show-hidden" checked={showHidden} onCheckedChange={(v) => setShowHidden(!!v)} />
           <label htmlFor="show-hidden" className="text-xs text-muted-foreground cursor-pointer">
             显示隐藏项({hiddenIds.size})
           </label>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs">
              更多
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </Button>
          </DropdownMenuTrigger>
           <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleExportData}>
                <Download className="w-3.5 h-3.5 mr-2" />
                导出数据
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleBatchHide}>
                <EyeOff className="w-3.5 h-3.5 mr-2" />
                批量隐藏
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRefreshAll}>
                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                刷新全部
              </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            显示 <span className="font-medium text-foreground">{filteredWorks.length}</span> 条
          </span>
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8 rounded-none border-r border-border', colMode === 'double' && 'bg-muted')}
              onClick={() => setColMode('double')}
            >
              <Grid2x2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8 rounded-none', colMode === 'single' && 'bg-muted')}
              onClick={() => setColMode('single')}
            >
              <LayoutList className="w-4 h-4" />
            </Button>
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time">按时间排序</SelectItem>
              <SelectItem value="plays">按播放排序</SelectItem>
              <SelectItem value="likes">按点赞排序</SelectItem>
              <SelectItem value="flow">按流速排序</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 主区域 */}
      <div className="p-6">
        {works.length === 0 ? (
          isMonitoring ? (
            // 加载状态：监控中但数据尚未加载
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-48 h-48 mb-6 flex items-center justify-center">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-muted/50 flex items-center justify-center animate-pulse">
                    <Eye className="w-16 h-16 text-primary/40" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                </div>
              </div>
              <p className="text-foreground font-medium mb-2">正在初始化监控...</p>
              <p className="text-sm text-muted-foreground">正在拉取作品数据，请稍候</p>
            </div>
          ) : (
            // 空状态
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-48 h-48 mb-6 flex items-center justify-center">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-muted/50 flex items-center justify-center">
                    <Eye className="w-16 h-16 text-muted-foreground/40" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-[hsl(26_90%_49%)]/20 flex items-center justify-center">
                    <EyeOff className="w-5 h-5 text-[hsl(26_90%_49%)]" />
                  </div>
                </div>
              </div>
              <p className="text-foreground font-medium mb-2">暂无监控数据</p>
              <p className="text-sm text-muted-foreground mb-4">请选择账号，设置监控参数之后开始监控</p>
              <Button
                size="sm"
                onClick={startMonitoring}
                disabled={isMonitoring}
                className="bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white"
              >
                {isMonitoring ? '正在启动...' : '去设置'}
              </Button>
            </div>
          )
        ) : (
          <div
            className={cn(
              'grid gap-4',
              colMode === 'double' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-1 max-w-xl'
            )}
            data-ai-section-type="card-list"
          >
            {filteredWorks.map((work) => (
               <Card
                 key={work.id}
                 className="overflow-hidden hover:shadow-lg transition-shadow duration-200 cursor-pointer group"
                 onClick={() => handleOpenDetail(work)}
               >
                {/* 缩略图 */}
                <div className="relative aspect-video bg-muted overflow-hidden">
                  <Image
                    src={work.thumbnail}
                    alt={work.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <Badge className="absolute top-2 right-2 bg-black/70 text-white border-0 backdrop-blur-sm">
                    <Play className="w-3 h-3 mr-1" />
                    {formatCount(work.plays)}
                  </Badge>
                </div>

                <CardContent className="p-3 space-y-3">
                  {/* 标题 */}
                  <div className="text-sm font-medium leading-5 line-clamp-2 h-10">
                    {work.title}
                  </div>

                  {/* 账号信息 */}
                  <div className="flex items-center gap-2">
                    <Avatar className="w-5 h-5">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {work.accountAvatar}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground truncate">{work.account}</span>
                    <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
                      {work.platform}
                    </Badge>
                  </div>

                  {/* 数据行 */}
                  <div className="grid grid-cols-4 gap-1 pt-2 border-t border-border">
                    <div className="text-center">
                      <div className="text-sm font-semibold text-foreground">{formatCount(work.plays)}</div>
                      <DeltaBadge value={work.playsDelta} />
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-semibold text-foreground">{formatCount(work.likes)}</div>
                      <DeltaBadge value={work.likesDelta} />
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-semibold text-foreground">{formatCount(work.comments)}</div>
                      <DeltaBadge value={work.commentsDelta} />
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-semibold text-foreground">{formatCount(work.shares)}</div>
                      <DeltaBadge value={work.sharesDelta} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                    <div className="text-center">播放</div>
                    <div className="text-center">点赞</div>
                    <div className="text-center">评论</div>
                    <div className="text-center">转发</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
       </div>

       {/* 设置弹窗 */}
       <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
         <DialogContent className="sm:max-w-md">
           <DialogHeader>
             <DialogTitle className="text-base">监控设置</DialogTitle>
           </DialogHeader>
           <div className="space-y-4 py-2">
             <div className="space-y-2">
               <label className="text-sm font-medium">刷新间隔（秒）</label>
               <Select value={String(monitorInterval)} onValueChange={(v) => setMonitorInterval(Number(v))}>
                 <SelectTrigger className="h-9">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="3">3 秒</SelectItem>
                   <SelectItem value="5">5 秒</SelectItem>
                   <SelectItem value="10">10 秒</SelectItem>
                   <SelectItem value="30">30 秒</SelectItem>
                   <SelectItem value="60">60 秒</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             <div className="space-y-2">
               <label className="text-sm font-medium">监控作品范围</label>
               <Select defaultValue="recent">
                 <SelectTrigger className="h-9">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">全部作品</SelectItem>
                   <SelectItem value="recent">最近发布的作品</SelectItem>
                   <SelectItem value="top">Top 20 热门</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             <Alert variant="default" className="bg-info/10 border-info/30 text-info">
               <Info className="w-4 h-4" />
               <AlertDescription className="text-info text-xs">
                 演示模式：设置项仅作展示，实际生效需绑定真实平台账号
               </AlertDescription>
             </Alert>
           </div>
           <div className="flex justify-end gap-2">
             <Button variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>取消</Button>
             <Button size="sm" onClick={() => setSettingsOpen(false)}>保存设置</Button>
           </div>
         </DialogContent>
       </Dialog>

       {/* 作品详情弹窗 */}
       <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
         <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle className="text-base">作品详情</DialogTitle>
           </DialogHeader>
           {selectedWork && (
             <div className="space-y-4">
               <div className="flex gap-4">
                 <div className="w-40 h-24 rounded-md overflow-hidden bg-muted shrink-0">
                   <Image src={selectedWork.thumbnail} alt={selectedWork.title} className="w-full h-full object-cover" />
                 </div>
                 <div className="flex-1 min-w-0">
                   <h3 className="font-semibold text-foreground mb-1 line-clamp-2">{selectedWork.title}</h3>
                   <div className="flex items-center gap-2 mb-2">
                     <Badge variant="secondary" className="text-[10px] h-4">{selectedWork.platform}</Badge>
                     <span className="text-xs text-muted-foreground">{selectedWork.account}</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                     <span className={cn('w-2 h-2 rounded-full', isMonitoring ? 'bg-[hsl(130_54%_42%)]' : 'bg-[hsl(2_84%_62%)]')} />
                     <span className="text-xs text-muted-foreground">
                       {isMonitoring ? '监控中' : '已停止监控'}
                     </span>
                   </div>
                 </div>
               </div>

               {/* 数据指标 */}
               <div className="grid grid-cols-4 gap-3">
                 {[
                   { label: '播放量', value: formatCount(selectedWork.plays), delta: selectedWork.playsDelta, icon: Play },
                   { label: '点赞', value: formatCount(selectedWork.likes), delta: selectedWork.likesDelta, icon: Heart },
                   { label: '评论', value: formatCount(selectedWork.comments), delta: selectedWork.commentsDelta, icon: MessageCircle },
                   { label: '分享', value: formatCount(selectedWork.shares), delta: selectedWork.sharesDelta, icon: Share2 },
                 ].map((item) => {
                   const ItemIcon = item.icon;
                   return (
                     <div key={item.label} className="bg-muted/30 rounded-lg p-3 text-center">
                       <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                         <ItemIcon className="w-3 h-3" />
                         {item.label}
                       </div>
                       <div className="text-lg font-bold text-foreground">{item.value}</div>
                       <DeltaBadge value={item.delta} />
                     </div>
                   );
                 })}
               </div>

               {/* 播放趋势 */}
               <Card>
                 <CardHeader className="pb-2">
                   <CardTitle className="text-sm flex items-center gap-2">
                     <BarChart3 className="w-4 h-4" />
                     近24小时播放趋势
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="pt-2">
                   <div className="h-40">
                     <svg className="w-full h-full" viewBox="0 0 500 140" preserveAspectRatio="none">
                       <defs>
                         <linearGradient id="detailGradient" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="hsl(26 90% 49%)" stopOpacity="0.3" />
                           <stop offset="95%" stopColor="hsl(26 90% 49%)" stopOpacity="0" />
                         </linearGradient>
                       </defs>
                       {[0, 1, 2, 3].map((i) => (
                         <line key={i} x1="0" y1={35 * i + 10} x2="500" y2={35 * i + 10} stroke="hsl(220 14% 89%)" strokeDasharray="3 3" />
                       ))}
                       {(() => {
                         const max = Math.max(...detailTrend);
                         const min = Math.min(...detailTrend);
                         const range = max - min || 1;
                         const areaPoints = detailTrend.map((v, i) => {
                           const x = (i / (detailTrend.length - 1)) * 500;
                           const y = 130 - ((v - min) / range) * 110;
                           return `${x},${y}`;
                         }).join(' ');
                         const areaPath = `M 0 130 L ${areaPoints.split(' ').map(p => p).join(' L ')} L 500 130 Z`;
                         const linePath = `M ${detailTrend.map((v, i) => {
                           const x = (i / (detailTrend.length - 1)) * 500;
                           const y = 130 - ((v - min) / range) * 110;
                           return `${x} ${y}`;
                         }).join(' L ')}`;
                         return (
                           <>
                             <path d={areaPath} fill="url(#detailGradient)" />
                             <path d={linePath} fill="none" stroke="hsl(26 90% 49%)" strokeWidth="2" />
                           </>
                         );
                       })()}
                     </svg>
                   </div>
                   <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                     <span>00:00</span>
                     <span>06:00</span>
                     <span>12:00</span>
                     <span>18:00</span>
                     <span>24:00</span>
                   </div>
                 </CardContent>
               </Card>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={handleExportSingle}>
                    <Download className="w-4 h-4 mr-2" />
                    导出数据
                  </Button>
                  <Button className="flex-1" onClick={() => setDetailOpen(false)}>去发布页查看</Button>
                </div>
             </div>
           )}
         </DialogContent>
       </Dialog>
     </div>
   );
};

export default AnalyticsMonitorPage;

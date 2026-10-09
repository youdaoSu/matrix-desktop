import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Calendar,
  Filter,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
  Pause,
  Trash2,
  Copy,
  Eye,
  Settings,
  Trash,
  Download,
  Clock,
  AlertCircle,
  Check,
  X,
  Video,
  Image,
  Zap,
  Timer,
  ArrowRight,
  Pin,
  MessageSquare,
  PlayCircle,
  ThumbsUp,
  MessageCircle,
  Share2,
  Heart,
  FileDown,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent } from '@client/src/components/ui/card';
import AccountSelector from '@client/src/components/account/AccountSelector';
import type { PlatformAccount, AccountGroup, PlatformType } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Checkbox } from '@client/src/components/ui/checkbox';
import { Switch } from '@client/src/components/ui/switch';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@client/src/components/ui/dialog';
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
import { Avatar, AvatarFallback } from '@client/src/components/ui/avatar';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Textarea } from '@client/src/components/ui/textarea';
import { Image as UIImage } from '@client/src/components/ui/image';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@client/src/components/ui/pagination';

type PublishStatus = 'published' | 'failed' | 'publishing' | 'reviewing' | 'pending';
type FollowupStatus = 'published' | 'failed' | 'none';
type ContentType = 'video' | 'image';

interface TaskItem {
  id: string;
  title: string;
  thumbnail: string;
  platform: PlatformType;
  accountName: string;
  accountId: string;
  contentType: ContentType;
  publishStatus: PublishStatus;
  publishFailReason?: string;
  followupStatus: FollowupStatus;
  followupFailReason?: string;
  createdAt: string;
  executeAt: string;
  duration: string;
  isScheduled: boolean;
  batchName: string;
  fileName: string;
  fileSize: string;
}

const platformLabels: Record<PlatformType, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  bilibili: 'B站',
};

const statusLabels: Record<PublishStatus, string> = {
  published: '已发布',
  failed: '发表失败',
  publishing: '发布中',
  reviewing: '审核中',
  pending: '待发布',
};

const statusColors: Record<PublishStatus, string> = {
  published: 'hsl(130 54% 42%)',
  failed: 'hsl(2 84% 62%)',
  publishing: 'hsl(26 90% 49%)',
  reviewing: 'hsl(26 90% 49%)',
  pending: 'hsl(220 14% 46%)',
};

const mockTasks: TaskItem[] = [
  {
    id: '1',
    title: '秋日穿搭灵感分享，通勤约会都合适',
    thumbnail: 'https://picsum.photos/seed/task1/120/120',
    platform: 'douyin',
    accountName: '美食探店小队',
    accountId: 'DY_2039485',
    contentType: 'video',
    publishStatus: 'published',
    followupStatus: 'published',
    createdAt: '2026-09-28 10:23:45',
    executeAt: '2026-09-28 10:24:00',
    duration: '2分15秒',
    isScheduled: false,
    batchName: '批次-0928-早间',
    fileName: 'autumn_outfit_v1.mp4',
    fileSize: '45.2MB',
  },
  {
    id: '2',
    title: '3个超实用的厨房收纳技巧',
    thumbnail: 'https://picsum.photos/seed/task2/120/120',
    platform: 'xiaohongshu',
    accountName: '生活种草日记',
    accountId: 'XHS_8475632',
    contentType: 'image',
    publishStatus: 'failed',
    publishFailReason: 'CSRF校验失败，请重新授权',
    followupStatus: 'none',
    createdAt: '2026-09-28 09:15:20',
    executeAt: '2026-09-28 09:16:00',
    duration: '0分45秒',
    isScheduled: false,
    batchName: '批次-0928-早间',
    fileName: 'kitchen_storage_03.jpg',
    fileSize: '3.8MB',
  },
  {
    id: '3',
    title: '旅行vlog | 云南大理三日游攻略',
    thumbnail: 'https://picsum.photos/seed/task3/120/120',
    platform: 'douyin',
    accountName: '旅行日记Vlog',
    accountId: 'DY_1029384',
    contentType: 'video',
    publishStatus: 'publishing',
    followupStatus: 'none',
    createdAt: '2026-09-28 11:00:00',
    executeAt: '2026-09-28 11:00:30',
    duration: '-',
    isScheduled: false,
    batchName: '批次-0928-午间',
    fileName: 'dali_travel_vlog.mp4',
    fileSize: '128.6MB',
  },
  {
    id: '4',
    title: '职场新人必看！5个高效办公技巧',
    thumbnail: 'https://picsum.photos/seed/task4/120/120',
    platform: 'wechat',
    accountName: '职场成长笔记',
    accountId: 'WX_7364921',
    contentType: 'video',
    publishStatus: 'published',
    followupStatus: 'failed',
    followupFailReason: '账号授权过期',
    createdAt: '2026-09-27 18:30:00',
    executeAt: '2026-09-27 18:30:00',
    duration: '1分30秒',
    isScheduled: true,
    batchName: '批次-0927-晚间',
    fileName: 'office_tips_05.mp4',
    fileSize: '67.3MB',
  },
  {
    id: '5',
    title: '科技新品开箱 | 最新旗舰耳机体验',
    thumbnail: 'https://picsum.photos/seed/task5/120/120',
    platform: 'bilibili',
    accountName: '科技宅频道',
    accountId: 'BILI_9283746',
    contentType: 'video',
    publishStatus: 'reviewing',
    followupStatus: 'none',
    createdAt: '2026-09-28 10:45:00',
    executeAt: '2026-09-28 10:45:30',
    duration: '-',
    isScheduled: false,
    batchName: '批次-0928-午间',
    fileName: 'headphone_unboxing.mp4',
    fileSize: '312.5MB',
  },
  {
    id: '6',
    title: '时尚穿搭 | 秋季必入单品推荐',
    thumbnail: 'https://picsum.photos/seed/task6/120/120',
    platform: 'xiaohongshu',
    accountName: '时尚穿搭指南',
    accountId: 'XHS_1293847',
    contentType: 'image',
    publishStatus: 'published',
    followupStatus: 'published',
    createdAt: '2026-09-27 14:20:00',
    executeAt: '2026-09-27 14:20:00',
    duration: '3分10秒',
    isScheduled: true,
    batchName: '批次-0927-午后',
    fileName: 'fall_fashion_01.jpg',
    fileSize: '5.2MB',
  },
  {
    id: '7',
    title: '周末探店 | 藏在巷子里的宝藏咖啡馆',
    thumbnail: 'https://picsum.photos/seed/task7/120/120',
    platform: 'douyin',
    accountName: '美食探店小队',
    accountId: 'DY_2039485',
    contentType: 'video',
    publishStatus: 'failed',
    publishFailReason: '内容违规，请修改后重试',
    followupStatus: 'none',
    createdAt: '2026-09-26 20:15:00',
    executeAt: '2026-09-26 20:15:30',
    duration: '0分20秒',
    isScheduled: false,
    batchName: '批次-0926-晚间',
    fileName: 'cafe_explore_v2.mp4',
    fileSize: '89.1MB',
  },
  {
    id: '8',
    title: '读书分享 | 本月最值得读的5本书',
    thumbnail: 'https://picsum.photos/seed/task8/120/120',
    platform: 'wechat',
    accountName: '职场成长笔记',
    accountId: 'WX_7364921',
    contentType: 'image',
    publishStatus: 'pending',
    followupStatus: 'none',
    createdAt: '2026-09-28 08:00:00',
    executeAt: '2026-09-28 20:00:00',
    duration: '-',
    isScheduled: true,
    batchName: '批次-0928-晚间',
    fileName: 'book_review_sep.jpg',
    fileSize: '2.7MB',
  },
  {
    id: '9',
    title: '健身干货 | 在家也能练的腹肌训练',
    thumbnail: 'https://picsum.photos/seed/task9/120/120',
    platform: 'bilibili',
    accountName: '科技宅频道',
    accountId: 'BILI_9283746',
    contentType: 'video',
    publishStatus: 'published',
    followupStatus: 'failed',
    followupFailReason: '频控限制，已达今日上限',
    createdAt: '2026-09-26 12:00:00',
    executeAt: '2026-09-26 12:00:00',
    duration: '4分20秒',
    isScheduled: false,
    batchName: '批次-0926-午间',
    fileName: 'abs_workout_home.mp4',
    fileSize: '156.8MB',
  },
  {
    id: '10',
    title: '护肤干货 | 换季敏感肌护理指南',
    thumbnail: 'https://picsum.photos/seed/task10/120/120',
    platform: 'xiaohongshu',
    accountName: '生活种草日记',
    accountId: 'XHS_8475632',
    contentType: 'image',
    publishStatus: 'published',
    followupStatus: 'published',
    createdAt: '2026-09-25 16:30:00',
    executeAt: '2026-09-25 16:30:00',
    duration: '1分50秒',
    isScheduled: false,
    batchName: '批次-0925-午后',
    fileName: 'skincare_autumn.jpg',
    fileSize: '4.1MB',
  },
  {
    id: '11',
    title: '数码测评 | 性价比之王百元耳机',
    thumbnail: 'https://picsum.photos/seed/task11/120/120',
    platform: 'douyin',
    accountName: '旅行日记Vlog',
    accountId: 'DY_1029384',
    contentType: 'video',
    publishStatus: 'failed',
    publishFailReason: '账号授权过期',
    followupStatus: 'none',
    createdAt: '2026-09-27 10:00:00',
    executeAt: '2026-09-27 10:00:30',
    duration: '0分15秒',
    isScheduled: false,
    batchName: '批次-0927-早间',
    fileName: 'budget_headset_review.mp4',
    fileSize: '72.4MB',
  },
  {
    id: '12',
    title: '美食教程 | 零失败红烧肉做法',
    thumbnail: 'https://picsum.photos/seed/task12/120/120',
    platform: 'douyin',
    accountName: '美食探店小队',
    accountId: 'DY_2039485',
    contentType: 'video',
    publishStatus: 'published',
    followupStatus: 'none',
    createdAt: '2026-09-25 19:00:00',
    executeAt: '2026-09-25 19:00:00',
    duration: '2分40秒',
    isScheduled: true,
    batchName: '批次-0925-晚间',
    fileName: 'braised_pork_recipe.mp4',
    fileSize: '98.7MB',
  },
];

const batches = ['全部批次', '批次-0928-早间', '批次-0928-午间', '批次-0928-晚间', '批次-0927-晚间', '批次-0927-午后', '批次-0926-晚间', '批次-0926-午间', '批次-0925-午后', '批次-0925-晚间'];

const mockGroups: AccountGroup[] = [
  { id: 'g1', userId: 'u1', groupName: '主力账号', sortOrder: 1, isDefault: true, accountCount: 4, createdAt: '2026-01-01' },
  { id: 'g2', userId: 'u1', groupName: '种草矩阵', sortOrder: 2, isDefault: false, accountCount: 3, createdAt: '2026-01-02' },
  { id: 'g3', userId: 'u1', groupName: '知识科普', sortOrder: 3, isDefault: false, accountCount: 3, createdAt: '2026-01-03' },
  { id: 'g4', userId: 'u1', groupName: '生活方式', sortOrder: 4, isDefault: false, accountCount: 2, createdAt: '2026-01-04' },
  { id: 'g5', userId: 'u1', groupName: '测试账号', sortOrder: 5, isDefault: false, accountCount: 2, createdAt: '2026-01-05' },
];

const mockAccounts: PlatformAccount[] = [
  { id: 'acc1', platform: 'douyin', nickname: '美食探店小队', groupName: '主力账号', authStatus: 'authorized', followersCount: 128000, followingCount: 230, likesCount: 1250000, postsCount: 356, healthStatus: 'normal', createdAt: '2026-01-10' },
  { id: 'acc2', platform: 'douyin', nickname: '旅行日记Vlog', groupName: '主力账号', authStatus: 'authorized', followersCount: 86000, followingCount: 180, likesCount: 890000, postsCount: 243, healthStatus: 'normal', createdAt: '2026-01-12' },
  { id: 'acc3', platform: 'douyin', nickname: '健身打卡日记', groupName: '种草矩阵', authStatus: 'authorized', followersCount: 52000, followingCount: 150, likesCount: 420000, postsCount: 178, healthStatus: 'normal', createdAt: '2026-02-01' },
  { id: 'acc4', platform: 'xiaohongshu', nickname: '生活种草日记', groupName: '种草矩阵', authStatus: 'authorized', followersCount: 95000, followingCount: 210, likesCount: 1120000, postsCount: 289, healthStatus: 'normal', createdAt: '2026-01-15' },
  { id: 'acc5', platform: 'xiaohongshu', nickname: '时尚穿搭指南', groupName: '生活方式', authStatus: 'authorized', followersCount: 72000, followingCount: 195, likesCount: 780000, postsCount: 215, healthStatus: 'normal', createdAt: '2026-01-20' },
  { id: 'acc6', platform: 'xiaohongshu', nickname: '护肤小课堂', groupName: '种草矩阵', authStatus: 'authorized', followersCount: 45000, followingCount: 140, likesCount: 520000, postsCount: 134, healthStatus: 'warning', createdAt: '2026-02-10' },
  { id: 'acc7', platform: 'wechat', nickname: '职场成长笔记', groupName: '知识科普', authStatus: 'authorized', followersCount: 38000, followingCount: 120, likesCount: 310000, postsCount: 156, healthStatus: 'normal', createdAt: '2026-01-25' },
  { id: 'acc8', platform: 'wechat', nickname: '读书分享会', groupName: '知识科普', authStatus: 'authorized', followersCount: 25000, followingCount: 100, likesCount: 180000, postsCount: 98, healthStatus: 'normal', createdAt: '2026-02-05' },
  { id: 'acc9', platform: 'wechat', nickname: '生活家小助手', groupName: '生活方式', authStatus: 'expired', followersCount: 15000, followingCount: 80, likesCount: 95000, postsCount: 67, healthStatus: 'error', createdAt: '2026-03-01' },
  { id: 'acc10', platform: 'bilibili', nickname: '科技宅频道', groupName: '主力账号', authStatus: 'authorized', followersCount: 156000, followingCount: 260, likesCount: 1890000, postsCount: 412, healthStatus: 'normal', createdAt: '2026-01-05' },
  { id: 'acc11', platform: 'bilibili', nickname: '数码开箱测评', groupName: '知识科普', authStatus: 'authorized', followersCount: 68000, followingCount: 170, likesCount: 720000, postsCount: 189, healthStatus: 'normal', createdAt: '2026-01-30' },
  { id: 'acc12', platform: 'douyin', nickname: '测试账号01', groupName: '测试账号', authStatus: 'pending', followersCount: 100, followingCount: 5, likesCount: 200, postsCount: 3, healthStatus: 'warning', createdAt: '2026-03-15' },
];

// 账号ID到账号信息的映射，方便按accountId筛选
const accountIdMap = new Map(mockAccounts.map((a: PlatformAccount) => [a.id, a]));
// 账号名到账号信息的映射
const accountNameMap = new Map(mockAccounts.map((a: PlatformAccount) => [a.nickname || '', a]));

// 将任务的 accountName 映射到账号 id（用于筛选）
function getAccountIdByName(name: string): string | undefined {
  return accountNameMap.get(name)?.id;
}

const PublishTasksPage = () => {
  const [tasks, setTasks] = useState<TaskItem[]>(mockTasks);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [platform, setPlatform] = useState<PlatformType | 'all'>('all');
  const [groupId, setGroupId] = useState<string | 'all'>('all');
  const [accountId, setAccountId] = useState<string | 'all'>('all');
  const [status, setStatus] = useState<string>('all');
  const [contentType, setContentType] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [batch, setBatch] = useState<string>('all');
  const [pinPublishing, setPinPublishing] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<string | null>(null);
  const [defaultParams, setDefaultParams] = useState({ publishMode: 'now', autoFollowup: true, followupDelay: '30', frequencyLimit: '5', intervalMin: '2' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [followupDialogOpen, setFollowupDialogOpen] = useState(false);
  const [followupTaskId, setFollowupTaskId] = useState<string | null>(null);
  const [followupContent, setFollowupContent] = useState('');
  const [followupSending, setFollowupSending] = useState(false);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [retryTaskId, setRetryTaskId] = useState<string | null>(null);
  const [retryDate, setRetryDate] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [modifyTimeOpen, setModifyTimeOpen] = useState(false);
  const [modifyTimeDate, setModifyTimeDate] = useState('');

  const filteredTasks = useMemo(() => {
    // 根据三级筛选计算出匹配的账号名集合
    let filteredAccountNames: Set<string> | null = null;
    if (platform !== 'all' || groupId !== 'all' || accountId !== 'all') {
      const names = new Set<string>();
      for (const acc of mockAccounts) {
        if (platform !== 'all' && acc.platform !== platform) continue;
        if (groupId !== 'all') {
          const group = mockGroups.find((g: AccountGroup) => g.id === groupId);
          if (!group || acc.groupName !== group.groupName) continue;
        }
        if (accountId !== 'all' && acc.id !== accountId) continue;
        if (acc.nickname) names.add(acc.nickname);
      }
      filteredAccountNames = names;
    }

    let result = tasks.filter((t) => {
      if (searchText && !t.title.includes(searchText) && !t.fileName.includes(searchText)) return false;
      if (filteredAccountNames && !filteredAccountNames.has(t.accountName)) return false;
      if (status !== 'all' && t.publishStatus !== status) return false;
      if (contentType !== 'all' && t.contentType !== contentType) return false;
      if (batch !== 'all' && t.batchName !== batch) return false;
      if (startDate && t.createdAt < startDate) return false;
      if (endDate && t.createdAt > endDate + ' 23:59:59') return false;
      return true;
    });
    if (pinPublishing) {
      const publishing = result.filter((t) => t.publishStatus === 'publishing');
      const others = result.filter((t) => t.publishStatus !== 'publishing');
      result = [...publishing, ...others];
    }
    return result;
  }, [tasks, searchText, platform, groupId, accountId, status, contentType, startDate, endDate, batch, pinPublishing]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const paginatedTasks = filteredTasks.slice((page - 1) * pageSize, page * pageSize);

  const allSelected = paginatedTasks.length > 0 && paginatedTasks.every((t) => selectedIds.includes(t.id));
  const someSelected = filteredTasks.some((t) => selectedIds.includes(t.id));

  // 筛选变化时重置到第一页
  useEffect(() => {
    setPage(1);
  }, [searchText, platform, groupId, accountId, status, contentType, startDate, endDate, batch, pinPublishing]);

  const headerCheckboxRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) {
      const input = headerCheckboxRef.current.querySelector('input');
      if (input) {
        (input as HTMLInputElement).indeterminate = someSelected && !allSelected;
      }
    }
  }, [allSelected, someSelected]);

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(selectedIds.filter((id) => !paginatedTasks.find((t) => t.id === id)));
    } else {
      const newIds = new Set(selectedIds);
      paginatedTasks.forEach((t) => newIds.add(t.id));
      setSelectedIds(Array.from(newIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleRetry = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, publishStatus: 'publishing' as PublishStatus, publishFailReason: undefined } : t))
    );
    setTimeout(() => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, publishStatus: 'published' as PublishStatus } : t))
      );
    }, 2000);
  };

  const handleFollowupRetry = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, followupStatus: 'published' as FollowupStatus, followupFailReason: undefined } : t))
    );
  };

  const handleBatchAction = (action: string) => {
    setBatchAction(action);
  };

  const confirmBatchAction = () => {
    if (!batchAction) return;
    if (batchAction === 'retry') {
      setTasks((prev) =>
        prev.map((t) =>
          selectedIds.includes(t.id) && t.publishStatus === 'failed'
            ? { ...t, publishStatus: 'publishing' as PublishStatus, publishFailReason: undefined }
            : t
        )
      );
      setTimeout(() => {
        setTasks((prev) =>
          prev.map((t) =>
            selectedIds.includes(t.id) && t.publishStatus === 'publishing'
              ? { ...t, publishStatus: 'published' as PublishStatus }
              : t
          )
        );
      }, 2000);
    } else if (batchAction === 'delete') {
      setTasks((prev) => prev.filter((t) => !selectedIds.includes(t.id)));
      setSelectedIds([]);
    } else if (batchAction === 'pause') {
      setTasks((prev) =>
        prev.map((t) =>
          selectedIds.includes(t.id) && t.publishStatus === 'publishing'
            ? { ...t, publishStatus: 'pending' as PublishStatus }
            : t
        )
      );
    }
    setBatchAction(null);
  };

  const handleClearRecords = async () => {
    if (window.confirm('确定要清空所有记录吗？此操作不可撤销。')) {
      setTasks([]);
      setSelectedIds([]);
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', '标题', '平台', '账号', '类型', '发布状态', '失败原因', '追评状态', '创建时间', '执行时间'];
    const rows = filteredTasks.map((t) => [
      t.id,
      t.title,
      platformLabels[t.platform],
      t.accountName,
      t.contentType === 'video' ? '视频' : '图文',
      statusLabels[t.publishStatus],
      t.publishFailReason || '',
      t.followupStatus === 'none' ? '未开启' : t.followupStatus === 'published' ? '已发表' : '发表失败',
      t.createdAt,
      t.executeAt,
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `发布任务记录_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openFollowupDialog = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    setFollowupTaskId(taskId);
    setFollowupContent(task?.followupFailReason ? '' : '感谢观看，喜欢的话记得点赞关注哦～');
    setFollowupDialogOpen(true);
  };

  const handleSendFollowup = () => {
    if (!followupTaskId || !followupContent.trim()) return;
    setFollowupSending(true);
    setTimeout(() => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === followupTaskId
            ? { ...t, followupStatus: 'published' as FollowupStatus, followupFailReason: undefined }
            : t
        )
      );
      setFollowupSending(false);
      setFollowupDialogOpen(false);
    }, 1000);
  };

  const openDeleteDialog = (taskId: string) => {
    setDeleteTaskId(taskId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteTask = () => {
    if (!deleteTaskId) return;
    setTasks((prev) => prev.filter((t) => t.id !== deleteTaskId));
    setSelectedIds((prev) => prev.filter((id) => id !== deleteTaskId));
    setDeleteDialogOpen(false);
    setDeleteTaskId(null);
  };

  const handleCopyContent = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      navigator.clipboard?.writeText(task.title).catch(() => {});
    }
  };

  const handleModifyTime = () => {
    if (!modifyTimeDate || selectedIds.length === 0) return;
    setTasks((prev) =>
      prev.map((t) =>
        selectedIds.includes(t.id)
          ? { ...t, executeAt: modifyTimeDate.replace('T', ' '), isScheduled: true }
          : t
      )
    );
    setModifyTimeOpen(false);
    setModifyTimeDate('');
  };

  const openRetryDialog = (taskId: string) => {
    setRetryTaskId(taskId);
    setRetryDate('');
    setRetryDialogOpen(true);
  };

  const handleConfirmRetry = () => {
    if (!retryTaskId) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === retryTaskId
          ? { ...t, publishStatus: 'publishing' as PublishStatus, publishFailReason: undefined }
          : t
      )
    );
    setRetryDialogOpen(false);
    setTimeout(() => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === retryTaskId ? { ...t, publishStatus: 'published' as PublishStatus } : t
        )
      );
    }, 2000);
  };

  return (
    <div className="space-y-4 p-4">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          <span className="text-[hsl(26_90%_49%)] font-medium">示例数据 / 演示流程</span>
          ，所有操作均为前端模拟，不产生真实发布
        </AlertDescription>
      </Alert>

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">任务记录</h1>
          <Badge variant="secondary">{filteredTasks.length} 条记录</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClearRecords}>
            <Trash className="w-4 h-4 mr-1" />
            清空记录
          </Button>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-1" />
                任务设置
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>任务设置</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">默认发布参数</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">默认发布方式</Label>
                      <Select value={defaultParams.publishMode} onValueChange={(v) => setDefaultParams({ ...defaultParams, publishMode: v })}>
                        <SelectTrigger className="h-8 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="now">立即发布</SelectItem>
                          <SelectItem value="scheduled">定时发布</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">默认间隔(分钟)</Label>
                      <Input className="h-8 mt-1" value={defaultParams.intervalMin} onChange={(e) => setDefaultParams({ ...defaultParams, intervalMin: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">频控设置</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">每账号每日上限(条)</Label>
                      <Input className="h-8 mt-1" value={defaultParams.frequencyLimit} onChange={(e) => setDefaultParams({ ...defaultParams, frequencyLimit: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">最短间隔(分钟)</Label>
                      <Input className="h-8 mt-1" defaultValue="2" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">追评默认值</h3>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">默认开启追评</Label>
                    <Switch checked={defaultParams.autoFollowup} onCheckedChange={(v) => setDefaultParams({ ...defaultParams, autoFollowup: v })} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">追评延迟(分钟)</Label>
                    <Input className="h-8 mt-1" value={defaultParams.followupDelay} onChange={(e) => setDefaultParams({ ...defaultParams, followupDelay: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>取消</Button>
                <Button size="sm" onClick={() => setSettingsOpen(false)}>保存设置</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-[240px]">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索标题/描述/文件名"
                className="pl-8 h-9"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <AccountSelector
              accounts={mockAccounts}
              groups={mockGroups}
              platform={platform}
              groupId={groupId}
              accountId={accountId}
              onPlatformChange={setPlatform}
              onGroupChange={setGroupId}
              onAccountChange={setAccountId}
              size="sm"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="published">已发布</SelectItem>
                <SelectItem value="failed">发布失败</SelectItem>
                <SelectItem value="publishing">发布中</SelectItem>
                <SelectItem value="reviewing">审核中</SelectItem>
                <SelectItem value="pending">待发布</SelectItem>
              </SelectContent>
            </Select>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger className="w-[110px] h-9">
                <SelectValue placeholder="作品类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="video">视频</SelectItem>
                <SelectItem value="image">图文</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-8 h-9 w-[140px]"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-8 h-9 w-[140px]"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <Select value={batch} onValueChange={setBatch}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="批次" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b} value={b === '全部批次' ? 'all' : b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-auto pl-2 border-l border-border">
              <Pin className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">置顶正在发布</span>
              <Switch checked={pinPublishing} onCheckedChange={setPinPublishing} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task list */}
      <Card>
        <CardContent className="p-0">
          {/* Table header */}
          <div className="flex items-center px-3 py-2.5 border-b border-border bg-muted/30 text-xs text-muted-foreground font-medium">
            <div className="w-8 shrink-0">
              <Checkbox ref={headerCheckboxRef} checked={allSelected} onCheckedChange={toggleAll} />
            </div>
            <div className="w-14 shrink-0">缩略图</div>
            <div className="w-44 shrink-0">账号</div>
            <div className="flex-1 min-w-[120px]">作品标题</div>
            <div className="w-44 shrink-0">发布状态</div>
            <div className="w-40 shrink-0">追评状态</div>
            <div className="w-40 shrink-0">时间信息</div>
            <div className="w-24 shrink-0">标签</div>
            <div className="w-40 shrink-0">文件信息</div>
            <div className="w-24 shrink-0 text-right">操作</div>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-border">
            {filteredTasks.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">暂无匹配的任务记录</div>
            ) : (
              paginatedTasks.map((task) => (
                <div key={task.id}>
                  <div className="flex items-center px-3 py-2.5 hover:bg-muted/30 transition-colors text-sm">
                  <div className="w-8 shrink-0">
                    <Checkbox checked={selectedIds.includes(task.id)} onCheckedChange={() => toggleOne(task.id)} />
                  </div>
                  <div className="w-14 shrink-0">
                    <div className="w-11 h-11 rounded-md overflow-hidden bg-muted relative">
                      <UIImage src={task.thumbnail} alt="" className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] flex items-center justify-center py-0.5">
                        {task.contentType === 'video' ? <Video className="w-3 h-3 mr-0.5" /> : <Image className="w-3 h-3 mr-0.5" />}
                        {task.contentType === 'video' ? '视频' : '图文'}
                      </div>
                    </div>
                  </div>
                  <div className="w-44 shrink-0">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className="text-xs">{task.accountName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{task.accountName}</div>
                        <div className="text-xs text-muted-foreground truncate">{task.accountId}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-[120px] pr-3">
                    <div className="text-sm truncate">{task.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
                        {platformLabels[task.platform]}
                      </Badge>
                    </div>
                  </div>
                  <div className="w-44 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: statusColors[task.publishStatus] }}
                      />
                      <span className="text-sm" style={{ color: statusColors[task.publishStatus] }}>
                        {statusLabels[task.publishStatus]}
                      </span>
                    </div>
                    {task.publishFailReason && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-muted-foreground truncate flex-1">{task.publishFailReason}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[11px] px-1.5 text-[hsl(26_90%_49%)] hover:text-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_49%)]/10"
                          onClick={() => handleRetry(task.id)}
                        >
                          <RefreshCw className="w-3 h-3 mr-0.5" />
                          重发
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="w-40 shrink-0">
                    {task.followupStatus === 'none' ? (
                      <span className="text-sm text-muted-foreground">-</span>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                task.followupStatus === 'published'
                                  ? 'hsl(130 54% 42%)'
                                  : 'hsl(2 84% 62%)',
                            }}
                          />
                          <span
                            className="text-sm"
                            style={{
                              color:
                                task.followupStatus === 'published'
                                  ? 'hsl(130 54% 42%)'
                                  : 'hsl(2 84% 62%)',
                            }}
                          >
                            {task.followupStatus === 'published' ? '已发表' : '发表失败'}
                          </span>
                        </div>
                        {task.followupFailReason && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-muted-foreground truncate flex-1">{task.followupFailReason}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[11px] px-1.5 text-[hsl(26_90%_49%)] hover:text-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_49%)]/10"
                              onClick={() => handleFollowupRetry(task.id)}
                            >
                              重发
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="w-40 shrink-0 text-xs text-muted-foreground space-y-0.5">
                    <div>创建：{task.createdAt.slice(5, 16)}</div>
                    <div>执行：{task.executeAt.slice(5, 16)}</div>
                    <div>用时：{task.duration}</div>
                  </div>
                  <div className="w-24 shrink-0">
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-4 px-1.5 font-normal ${
                          task.isScheduled
                            ? 'text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/30'
                            : 'text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/30'
                        }`}
                      >
                        {task.isScheduled ? (
                          <><Timer className="w-3 h-3 mr-0.5" />定时</>
                        ) : (
                          <><Zap className="w-3 h-3 mr-0.5" />即时</>
                        )}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                        {task.contentType === 'video' ? '视频' : '图文'}
                      </Badge>
                    </div>
                  </div>
                  <div className="w-40 shrink-0 text-xs">
                    <div className="truncate" title={task.fileName}>{task.fileName}</div>
                    <div className="text-muted-foreground mt-0.5">{task.fileSize}</div>
                  </div>
                    <div className="w-24 shrink-0 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
                        >
                          {expandedId === task.id ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => setExpandedId(task.id)}>
                              <Eye className="w-4 h-4 mr-2" />查看详情
                            </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => openRetryDialog(task.id)}>
                               <RefreshCw className="w-4 h-4 mr-2" />重新发布
                             </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => openFollowupDialog(task.id)}>
                               <MessageSquare className="w-4 h-4 mr-2" />手动追评
                             </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => handleCopyContent(task.id)}>
                               <Copy className="w-4 h-4 mr-2" />复制内容
                             </DropdownMenuItem>
                             <DropdownMenuSeparator />
                             <DropdownMenuItem className="text-destructive" onClick={() => openDeleteDialog(task.id)}>
                               <Trash2 className="w-4 h-4 mr-2" />删除
                             </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail row */}
                  {expandedId === task.id && (
                    <div className="bg-muted/20 px-3 py-4 border-t border-border">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Platform publish detail */}
                        <div className="lg:col-span-2 space-y-3">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            发布详情
                          </h4>
                          <div className="bg-card rounded-lg border border-border p-3">
                            <div className="flex items-center gap-3 mb-3">
                              <div
                                className="w-8 h-8 rounded-full text-white text-xs flex items-center justify-center"
                                style={{ backgroundColor: statusColors[task.publishStatus] }}
                              >
                                {task.accountName.charAt(0)}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium">{task.accountName}</div>
                                <div className="text-xs text-muted-foreground">{platformLabels[task.platform]} · {task.accountId}</div>
                              </div>
                              <Badge
                                variant="outline"
                                className="text-xs"
                                style={{
                                  color: statusColors[task.publishStatus],
                                  borderColor: statusColors[task.publishStatus] + '40',
                                }}
                              >
                                {statusLabels[task.publishStatus]}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="text-muted-foreground">平台返回ID：<span className="text-foreground">{task.platform.slice(0, 3).toUpperCase()}_{task.id.padStart(8, '0')}</span></div>
                              <div className="text-muted-foreground">发布时间：<span className="text-foreground">{task.executeAt}</span></div>
                              <div className="text-muted-foreground">文件名称：<span className="text-foreground">{task.fileName}</span></div>
                              <div className="text-muted-foreground">文件大小：<span className="text-foreground">{task.fileSize}</span></div>
                            </div>
                            {task.publishFailReason && (
                              <div className="mt-3 p-2 bg-[hsl(2_84%_62%)]/5 rounded-md border border-[hsl(2_84%_62%)]/20">
                                <p className="text-xs font-medium text-[hsl(2_84%_62%)] flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  失败原因
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">{task.publishFailReason}</p>
                              </div>
                            )}
                          </div>

                          {/* Data metrics */}
                          <h4 className="text-sm font-medium flex items-center gap-2 pt-1">
                            <BarChart3 className="w-4 h-4" />
                            数据指标
                          </h4>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { icon: PlayCircle, label: '播放量', value: task.publishStatus === 'published' ? `${Math.floor(Math.random() * 50000 + 1000).toLocaleString()}` : '-' },
                              { icon: ThumbsUp, label: '点赞', value: task.publishStatus === 'published' ? `${Math.floor(Math.random() * 3000 + 100).toLocaleString()}` : '-' },
                              { icon: MessageCircle, label: '评论', value: task.publishStatus === 'published' ? `${Math.floor(Math.random() * 500 + 10).toLocaleString()}` : '-' },
                              { icon: Share2, label: '分享', value: task.publishStatus === 'published' ? `${Math.floor(Math.random() * 200 + 5).toLocaleString()}` : '-' },
                            ].map((m) => (
                              <div key={m.label} className="bg-card rounded-lg border border-border p-3 text-center">
                                <m.icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                                <div className="text-sm font-semibold">{m.value}</div>
                                <div className="text-[10px] text-muted-foreground">{m.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Follow-up status */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            追评状态
                          </h4>
                          <div className="bg-card rounded-lg border border-border p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">追评状态</span>
                              <Badge
                                variant="outline"
                                className={
                                  task.followupStatus === 'published'
                                    ? 'text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/30'
                                    : task.followupStatus === 'failed'
                                    ? 'text-destructive border-destructive/30'
                                    : 'text-muted-foreground'
                                }
                              >
                                {task.followupStatus === 'none' && '未开启'}
                                {task.followupStatus === 'published' && '已发送'}
                                {task.followupStatus === 'failed' && '发送失败'}
                              </Badge>
                            </div>
                            {task.followupStatus !== 'none' && (
                              <div className="pt-2 border-t border-border">
                                <p className="text-xs text-muted-foreground mb-1">追评内容</p>
                                <p className="text-xs bg-muted/50 rounded p-2">感谢观看，喜欢的话记得点赞关注哦～更多精彩内容请看主页</p>
                              </div>
                            )}
                            {task.followupFailReason && (
                              <div className="p-2 bg-[hsl(2_84%_62%)]/5 rounded-md border border-[hsl(2_84%_62%)]/20">
                                <p className="text-xs text-[hsl(2_84%_62%)] font-medium">失败原因</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{task.followupFailReason}</p>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => openFollowupDialog(task.id)}
                              >
                                <MessageSquare className="w-3.5 h-3.5 mr-1" />
                                {task.followupStatus === 'none' ? '手动追评' : task.followupStatus === 'failed' ? '重新追评' : '修改追评'}
                              </Button>
                            </div>
                          </div>

                          {/* Batch info */}
                          <div className="bg-card rounded-lg border border-border p-3">
                            <p className="text-xs text-muted-foreground mb-2">批次信息</p>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">所属批次</span>
                                <span>{task.batchName}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">创建时间</span>
                                <span>{task.createdAt}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">执行耗时</span>
                                <span>{task.duration}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card rounded-lg shadow-sm -mt-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={selectedIds.length === 0} onClick={() => handleBatchAction('retry')}>
            <RefreshCw className="w-4 h-4 mr-1" />
            批量重发
          </Button>
          <Button variant="outline" size="sm" disabled={selectedIds.length === 0} onClick={() => handleBatchAction('pause')}>
            <Pause className="w-4 h-4 mr-1" />
            批量暂停
          </Button>
          <Button variant="outline" size="sm" disabled={selectedIds.length === 0} onClick={() => handleBatchAction('delete')}>
            <Trash2 className="w-4 h-4 mr-1" />
            批量删除
          </Button>
            <Button variant="outline" size="sm" disabled={selectedIds.length === 0} onClick={() => setModifyTimeOpen(true)}>
             <Clock className="w-4 h-4 mr-1" />
             修改时间
           </Button>
           <Button variant="outline" size="sm" onClick={handleExportCSV}>
             <FileDown className="w-4 h-4 mr-1" />
             导出CSV
           </Button>
         </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            已选择 <span className="text-foreground font-medium">{selectedIds.length}</span> / {filteredTasks.length}
          </span>
          <button type="button" className="text-primary text-sm hover:underline" onClick={toggleAll}>
            {allSelected ? '取消全选' : '全选'}
          </button>
        </div>
      </div>

      {/* Batch action confirm dialog */}
      <AlertDialog open={!!batchAction} onOpenChange={(o) => !o && setBatchAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchAction === 'retry' && '确认批量重发'}
              {batchAction === 'delete' && '确认批量删除'}
              {batchAction === 'pause' && '确认批量暂停'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {batchAction === 'retry' && `确定要对选中的 ${selectedIds.length} 条任务执行重发操作吗？`}
              {batchAction === 'delete' && `确定要删除选中的 ${selectedIds.length} 条任务记录吗？此操作不可撤销。`}
              {batchAction === 'pause' && `确定要暂停选中的 ${selectedIds.length} 条正在发布的任务吗？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={batchAction === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}
              onClick={confirmBatchAction}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pagination */}
      {filteredTasks.length > 0 && (
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>共 {filteredTasks.length} 条，每页</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 条</SelectItem>
                <SelectItem value="20">20 条</SelectItem>
                <SelectItem value="50">50 条</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage(Math.max(1, page - 1))}
                  className={page === 1 ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let p = i + 1;
                if (totalPages > 5) {
                  if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                }
                return (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === page}
                      onClick={() => setPage(p)}
                      className="cursor-pointer"
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  className={page === totalPages ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Follow-up dialog */}
      <Dialog open={followupDialogOpen} onOpenChange={setFollowupDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[hsl(26_90%_49%)]" />
              手动追评
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">追评内容</Label>
              <Textarea
                value={followupContent}
                onChange={(e) => setFollowupContent(e.target.value)}
                className="min-h-[100px] mt-1.5 resize-none"
                placeholder="输入追评内容..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                {followupContent.length} / 500 字
              </p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">💡 追评建议</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>可以引导用户关注主页获取更多内容</li>
                <li>回答用户常见问题可提高互动率</li>
                <li>注意避免敏感词和违规内容</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFollowupDialogOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={!followupContent.trim() || followupSending}
              onClick={handleSendFollowup}
            >
              {followupSending ? '发送中...' : '发送追评'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       {/* Single delete confirm dialog */}
       <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>确认删除</AlertDialogTitle>
             <AlertDialogDescription>
               确定要删除这条任务记录吗？此操作不可撤销。
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>取消</AlertDialogCancel>
             <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteTask}>
               确认删除
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>

       {/* Batch modify time dialog */}
       <Dialog open={modifyTimeOpen} onOpenChange={setModifyTimeOpen}>
         <DialogContent className="sm:max-w-md">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Clock className="w-5 h-5" />
               修改发布时间
             </DialogTitle>
           </DialogHeader>
           <div className="space-y-3 py-2">
             <p className="text-sm text-muted-foreground">
               将修改选中的 {selectedIds.length} 条任务的发布时间
             </p>
             <div>
               <Label className="text-sm">新的发布时间</Label>
               <Input
                 type="datetime-local"
                 className="h-9 mt-1.5"
                 value={modifyTimeDate}
                 onChange={(e) => setModifyTimeDate(e.target.value)}
               />
             </div>
           </div>
           <DialogFooter>
             <Button variant="outline" size="sm" onClick={() => setModifyTimeOpen(false)}>取消</Button>
             <Button size="sm" onClick={handleModifyTime} disabled={!modifyTimeDate}>确认修改</Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* Retry dialog */}
       <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              重新发布
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              确认重新发布此条内容？你可以选择立即发布或设置新的发布时间。
            </p>
            <div>
              <Label className="text-sm">发布时间（可选）</Label>
              <Input
                type="datetime-local"
                className="h-9 mt-1.5"
                value={retryDate}
                onChange={(e) => setRetryDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">不填则立即发布</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRetryDialogOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleConfirmRetry}>
              确认重发
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublishTasksPage;

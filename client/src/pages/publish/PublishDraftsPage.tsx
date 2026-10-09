import { useState, useMemo } from 'react';
import {
  Search,
  Edit3,
  Send,
  Clock,
  Trash2,
  Calendar,
  FileText,
  Video,
  Image,
  AlertCircle,
  Filter,
  Grid3X3,
  List,
  MoreHorizontal,
  Plus,
  FolderOpen,
  Trash,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Label } from '@client/src/components/ui/label';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import { Image as UIImage } from '@client/src/components/ui/image';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@client/src/components/ui/pagination';

type DraftType = 'video' | 'image';
type DraftStatus = 'incomplete' | 'scheduled';

interface DraftItem {
  id: string;
  title: string;
  type: DraftType;
  status: DraftStatus;
  thumbnail: string;
  platforms: string[];
  accountCount: number;
  updatedAt: string;
  scheduledAt?: string;
  content?: string;
  tags: string[];
  fileCount: number;
  totalSize: string;
}

const mockDrafts: DraftItem[] = [
  {
    id: '1',
    title: '秋日穿搭灵感分享，通勤约会都合适',
    type: 'video',
    status: 'incomplete',
    thumbnail: 'https://picsum.photos/seed/d1/160/120',
    platforms: ['douyin', 'xiaohongshu'],
    accountCount: 3,
    updatedAt: '2026-09-28 14:30',
    content: '秋天来了，分享几套温柔又显瘦的秋日穿搭...',
    tags: ['秋日穿搭', 'ootd'],
    fileCount: 1,
    totalSize: '45.2MB',
  },
  {
    id: '2',
    title: '厨房收纳技巧｜小户型必看',
    type: 'image',
    status: 'incomplete',
    thumbnail: 'https://picsum.photos/seed/d2/160/120',
    platforms: ['xiaohongshu'],
    accountCount: 2,
    updatedAt: '2026-09-28 10:15',
    content: '3个超实用的厨房收纳技巧，让你的厨房瞬间变大...',
    tags: ['收纳', '厨房'],
    fileCount: 6,
    totalSize: '12.8MB',
  },
  {
    id: '3',
    title: '云南大理三日游超详细攻略',
    type: 'video',
    status: 'scheduled',
    thumbnail: 'https://picsum.photos/seed/d3/160/120',
    platforms: ['douyin', 'bilibili'],
    accountCount: 2,
    updatedAt: '2026-09-27 18:00',
    scheduledAt: '2026-10-01 09:00',
    content: '旅行vlog | 云南大理三日游攻略，人均2000玩转大理...',
    tags: ['旅行', '大理', '攻略'],
    fileCount: 1,
    totalSize: '128.6MB',
  },
  {
    id: '4',
    title: '职场新人高效办公技巧',
    type: 'video',
    status: 'scheduled',
    thumbnail: 'https://picsum.photos/seed/d4/160/120',
    platforms: ['wechat'],
    accountCount: 1,
    updatedAt: '2026-09-27 14:20',
    scheduledAt: '2026-09-30 08:30',
    content: '职场新人必看！5个高效办公技巧，让你效率翻倍...',
    tags: ['职场', '办公技巧'],
    fileCount: 1,
    totalSize: '67.3MB',
  },
  {
    id: '5',
    title: '换季护肤｜敏感肌护理指南',
    type: 'image',
    status: 'incomplete',
    thumbnail: 'https://picsum.photos/seed/d5/160/120',
    platforms: ['xiaohongshu', 'douyin'],
    accountCount: 3,
    updatedAt: '2026-09-26 20:45',
    content: '入秋后皮肤容易干燥敏感，分享几个亲测有效的护肤小技巧...',
    tags: ['护肤', '敏感肌', '换季'],
    fileCount: 9,
    totalSize: '18.5MB',
  },
  {
    id: '6',
    title: '健身干货｜在家练腹肌',
    type: 'video',
    status: 'incomplete',
    thumbnail: 'https://picsum.photos/seed/d6/160/120',
    platforms: ['bilibili', 'douyin'],
    accountCount: 2,
    updatedAt: '2026-09-25 16:30',
    content: '不用去健身房，在家也能练出腹肌，跟着做就对了...',
    tags: ['健身', '腹肌训练'],
    fileCount: 1,
    totalSize: '156.8MB',
  },
  {
    id: '7',
    title: '平价彩妆分享｜学生党必入',
    type: 'image',
    status: 'scheduled',
    thumbnail: 'https://picsum.photos/seed/d7/160/120',
    platforms: ['xiaohongshu'],
    accountCount: 1,
    updatedAt: '2026-09-24 11:00',
    scheduledAt: '2026-10-02 12:00',
    content: '平价彩妆天花板！学生党也能轻松入手...',
    tags: ['彩妆', '平价好物'],
    fileCount: 6,
    totalSize: '8.2MB',
  },
  {
    id: '8',
    title: '周末探店｜宝藏咖啡馆',
    type: 'video',
    status: 'incomplete',
    thumbnail: 'https://picsum.photos/seed/d8/160/120',
    platforms: ['douyin', 'xiaohongshu'],
    accountCount: 2,
    updatedAt: '2026-09-23 19:20',
    content: '藏在巷子里的宝藏咖啡馆，氛围感拉满...',
    tags: ['探店', '咖啡'],
    fileCount: 1,
    totalSize: '89.1MB',
  },
];

const platformLabels: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  bilibili: 'B站',
};

const platformColors: Record<string, string> = {
  douyin: 'hsl(0 0% 8%)',
  xiaohongshu: 'hsl(350 85% 60%)',
  wechat: 'hsl(142 45% 45%)',
  bilibili: 'hsl(200 90% 55%)',
};

const PublishDraftsPage = () => {
  const [drafts, setDrafts] = useState<DraftItem[]>(mockDrafts);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [statusTab, setStatusTab] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [scheduleDialog, setScheduleDialog] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');

  const filteredDrafts = useMemo(() => {
    return drafts.filter((d) => {
      if (statusTab !== 'all' && d.status !== statusTab) return false;
      if (typeFilter !== 'all' && d.type !== typeFilter) return false;
      if (searchText && !d.title.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [drafts, statusTab, typeFilter, searchText]);

  const totalPages = Math.ceil(filteredDrafts.length / pageSize);
  const paginatedDrafts = filteredDrafts.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedDrafts.length) {
      setSelectedIds(selectedIds.filter((id) => !paginatedDrafts.find((d) => d.id === id)));
    } else {
      const newIds = new Set(selectedIds);
      paginatedDrafts.forEach((d) => newIds.add(d.id));
      setSelectedIds(Array.from(newIds));
    }
  };

  const handleDelete = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
    setDeleteDialog(null);
  };

  const handleBatchDelete = () => {
    setDrafts((prev) => prev.filter((d) => !selectedIds.includes(d.id)));
    setSelectedIds([]);
    setBatchDeleteOpen(false);
  };

  const handleSchedule = (id: string) => {
    if (scheduleDate) {
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: 'scheduled' as DraftStatus, scheduledAt: scheduleDate.replace('T', ' ') }
            : d
        )
      );
    }
    setScheduleDialog(null);
    setScheduleDate('');
  };

  const handlePublishNow = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setSelectedIds((prev) => prev.filter((i) => i !== id));
  };

  const allSelected = paginatedDrafts.length > 0 && paginatedDrafts.every((d) => selectedIds.includes(d.id));
  const someSelected = paginatedDrafts.some((d) => selectedIds.includes(d.id));

  return (
    <div className="space-y-4 p-4">
      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertDescription>
          <span className="text-[hsl(26_90%_49%)] font-medium">示例数据 / 本地存储</span>
          ，草稿保存为前端模拟，刷新后重置
        </AlertDescription>
      </Alert>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">本地草稿箱</h1>
          <p className="text-sm text-muted-foreground mt-1">
            未完成和已定时的草稿都在这里
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <FolderOpen className="w-4 h-4 mr-1" />
            导入草稿
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-1" />
            新建草稿
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4" data-ai-section-type="card-stat">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">全部草稿</p>
              <p className="text-2xl font-bold mt-1">{drafts.length}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">未完成</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'hsl(26 90% 49%)' }}>
                {drafts.filter((d) => d.status === 'incomplete').length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-[hsl(26_90%_49%)]/10 flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-[hsl(26_90%_49%)]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">待定时发布</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'hsl(221 83% 53%)' }}>
                {drafts.filter((d) => d.status === 'scheduled').length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={statusTab} onValueChange={setStatusTab} className="min-w-[200px]">
              <TabsList>
                <TabsTrigger value="all">全部 ({drafts.length})</TabsTrigger>
                <TabsTrigger value="incomplete">未完成 ({drafts.filter((d) => d.status === 'incomplete').length})</TabsTrigger>
                <TabsTrigger value="scheduled">待定时 ({drafts.filter((d) => d.status === 'scheduled').length})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative flex-1 min-w-[180px] max-w-[260px] ml-auto">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索草稿标题..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[110px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="video">视频</SelectItem>
                <SelectItem value="image">图文</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
              <Button
                variant={viewMode === 'card' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('card')}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('table')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Batch actions bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  已选择 <span className="text-foreground font-medium">{selectedIds.length}</span> 项
                </span>
                <Button size="sm" variant="outline" onClick={() => setBatchDeleteOpen(true)}>
                  <Trash className="w-4 h-4 mr-1" />
                  批量删除
                </Button>
                <Button size="sm" variant="outline">
                  <Calendar className="w-4 h-4 mr-1" />
                  批量定时
                </Button>
              </div>
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs text-primary hover:underline"
              >
                取消选择
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drafts content */}
      {filteredDrafts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium mb-1">暂无草稿</h3>
            <p className="text-sm text-muted-foreground mb-4">
              快去发布页面创作你的第一条内容吧
            </p>
            <Button>
              <Plus className="w-4 h-4 mr-1" />
              去发布
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedDrafts.map((draft) => {
            const isSelected = selectedIds.includes(draft.id);
            return (
              <Card
                key={draft.id}
                className={`overflow-hidden transition-shadow hover:shadow-md ${
                  isSelected ? 'ring-2 ring-primary' : ''
                }`}
              >
                <div className="relative">
                  <div className="aspect-video bg-muted overflow-hidden relative">
                    <UIImage src={draft.thumbnail} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                      <Button size="sm" variant="secondary">
                        <Edit3 className="w-4 h-4 mr-1" />
                        编辑
                      </Button>
                    </div>
                    <div className="absolute top-2 left-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(draft.id)}
                      />
                    </div>
                    <div className="absolute top-2 right-2">
                      <Badge
                        variant="secondary"
                        className="gap-1 text-[10px] backdrop-blur bg-black/50 text-white border-none"
                      >
                        {draft.type === 'video' ? (
                          <><Video className="w-3 h-3" />视频</>
                        ) : (
                          <><Image className="w-3 h-3" />图文</>
                        )}
                      </Badge>
                    </div>
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      {draft.platforms.map((p) => (
                        <div
                          key={p}
                          className="w-5 h-5 rounded-full text-white text-[8px] flex items-center justify-center backdrop-blur"
                          style={{ backgroundColor: platformColors[p] }}
                          title={platformLabels[p]}
                        >
                          {platformLabels[p]?.charAt(0)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-medium line-clamp-2 flex-1">{draft.title}</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem>
                          <Edit3 className="w-4 h-4 mr-2" />编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePublishNow(draft.id)}>
                          <Send className="w-4 h-4 mr-2" />立即发布
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setScheduleDate(draft.scheduledAt?.replace(' ', 'T') || ''); setScheduleDialog(draft.id); }}>
                          <Calendar className="w-4 h-4 mr-2" />定时发布
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteDialog(draft.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-2">
                    {draft.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px] h-4 px-1 font-normal">
                        #{tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{draft.accountCount} 个账号</span>
                    <span>{draft.fileCount} 个文件</span>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                    <div className="text-xs text-muted-foreground">
                      {draft.status === 'scheduled' ? (
                        <span className="flex items-center gap-1 text-[hsl(221_83%_53%)]">
                          <Clock className="w-3 h-3" />
                          定时：{draft.scheduledAt?.slice(5, 16)}
                        </span>
                      ) : (
                        <span>更新于 {draft.updatedAt.slice(5, 16)}</span>
                      )}
                    </div>
                    <Badge
                      variant={draft.status === 'scheduled' ? 'default' : 'secondary'}
                      className="text-[10px] h-5"
                    >
                      {draft.status === 'scheduled' ? '待发布' : '未完成'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                    </th>
                    <th className="text-left py-3 px-4 font-medium">标题</th>
                    <th className="text-left py-3 px-4 font-medium w-20">类型</th>
                    <th className="text-left py-3 px-4 font-medium w-28">平台</th>
                    <th className="text-left py-3 px-4 font-medium w-20">账号</th>
                    <th className="text-left py-3 px-4 font-medium w-20">状态</th>
                    <th className="text-left py-3 px-4 font-medium w-40">更新时间</th>
                    <th className="text-right py-3 px-4 font-medium w-32">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDrafts.map((draft) => (
                    <tr key={draft.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="py-3 px-4">
                        <Checkbox
                          checked={selectedIds.includes(draft.id)}
                          onCheckedChange={() => toggleSelect(draft.id)}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <UIImage
                            src={draft.thumbnail}
                            alt=""
                            className="w-14 h-10 rounded object-cover"
                          />
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[300px]">{draft.title}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                              {draft.content}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="gap-1">
                          {draft.type === 'video' ? (
                            <><Video className="w-3 h-3" />视频</>
                          ) : (
                            <><Image className="w-3 h-3" />图文</>
                          )}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {draft.platforms.map((p) => (
                            <div
                              key={p}
                              className="w-5 h-5 rounded-full text-white text-[8px] flex items-center justify-center"
                              style={{ backgroundColor: platformColors[p] }}
                              title={platformLabels[p]}
                            >
                              {platformLabels[p]?.charAt(0)}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{draft.accountCount} 个</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={draft.status === 'scheduled' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {draft.status === 'scheduled' ? '待发布' : '未完成'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {draft.status === 'scheduled' && draft.scheduledAt
                          ? `定时: ${draft.scheduledAt}`
                          : draft.updatedAt
                        }
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <Edit3 className="w-3.5 h-3.5 mr-1" />编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[hsl(26_90%_49%)] hover:text-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_49%)]/10"
                            onClick={() => handlePublishNow(draft.id)}
                          >
                            <Send className="w-3.5 h-3.5 mr-1" />发布
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>每页</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8">8 条</SelectItem>
                <SelectItem value="16">16 条</SelectItem>
                <SelectItem value="32">32 条</SelectItem>
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
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
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

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteDialog} onOpenChange={(o) => !o && setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除草稿</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复，确定要删除这篇草稿吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteDialog && handleDelete(deleteDialog)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
        </AlertDialog>

      {/* Batch delete confirm */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedIds.length} 篇草稿吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleBatchDelete}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedule dialog */}
      <Dialog open={!!scheduleDialog} onOpenChange={(o) => !o && setScheduleDialog(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>设置定时发布</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">发布时间</Label>
              <Input
                type="datetime-local"
                className="h-9 mt-1"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              设置后草稿将移动到「待定时」分类，到时间自动发布。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setScheduleDialog(null)}>取消</Button>
            <Button size="sm" onClick={() => scheduleDialog && handleSchedule(scheduleDialog)}>
              确认定时
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublishDraftsPage;

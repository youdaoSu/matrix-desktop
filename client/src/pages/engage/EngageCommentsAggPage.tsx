import { useState, useMemo } from 'react';
import {
  Search,
  ThumbsUp,
  Reply,
  MessageCircle,
  Music,
  BookOpen,
  Video,
  Tv,
  AlertTriangle,
  Check,
  Send,
  Eye,
  Download,
  Tag,
  Trash2,
  Flag,
  MessageSquare,
  Users,
  Clock,
  Percent,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  Zap,
} from 'lucide-react';
import type { CommentItem, PlatformType, SendFailReason } from '@shared/api.interface';
import { FAIL_REASON_LABELS } from '@shared/api.interface';
import { Card, CardContent } from '@client/src/components/ui/card';
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
} from '@client/src/components/ui/dialog';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Textarea } from '@client/src/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Checkbox } from '@client/src/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import {
  mockComments,
  mockAccounts,
  sensitiveWords,
} from './engage-data';
import { cn } from '@/lib/utils';

const platformIconMap: Record<PlatformType, any> = {
  douyin: Music,
  xiaohongshu: BookOpen,
  wechat: Video,
  bilibili: Tv,
};

const platformColorMap: Record<PlatformType, string> = {
  douyin: 'hsl(0 0% 8%)',
  xiaohongshu: 'hsl(350 85% 60%)',
  wechat: 'hsl(142 45% 45%)',
  bilibili: 'hsl(200 90% 55%)',
};

const platformLabelMap: Record<PlatformType, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  bilibili: 'B站',
};

function highlightSensitive(text: string): React.ReactNode {
  const hitWords = sensitiveWords.filter((w) => text.includes(w));
  if (hitWords.length === 0) return text;
  let result: React.ReactNode = text;
  hitWords.forEach((word) => {
    if (typeof result !== 'string') {
      const parts: React.ReactNode[] = [];
      let keyIdx = 0;
      (result as React.ReactNode[]).forEach((part) => {
        if (typeof part === 'string') {
          const subParts = part.split(word);
          subParts.forEach((sp, i) => {
            if (sp) parts.push(sp);
            if (i < subParts.length - 1) {
              parts.push(
                <mark key={`sens-${keyIdx++}`} className="bg-destructive/30 text-destructive px-0.5 rounded">
                  {word}
                </mark>
              );
            }
          });
        } else {
          parts.push(part);
        }
      });
      result = parts;
    } else {
      const parts = result.split(word);
      const arr: React.ReactNode[] = [];
      parts.forEach((p, i) => {
        if (p) arr.push(p);
        if (i < parts.length - 1) {
          arr.push(
            <mark key={`sens-${i}`} className="bg-destructive/30 text-destructive px-0.5 rounded">
              {word}
            </mark>
          );
        }
      });
      result = arr;
    }
  });
  return result;
}

const EngageCommentsAggPage = () => {
  const [platformFilter, setPlatformFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [replyFilter, setReplyFilter] = useState('all');
  const [sensitiveFilter, setSensitiveFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [currentComment, setCurrentComment] = useState<CommentItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailComment, setDetailComment] = useState<CommentItem | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [expandReplyId, setExpandReplyId] = useState<string | null>(null);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);

  const stats = useMemo(() => {
    const total = mockComments.length;
    const pending = mockComments.filter((c) => !c.isReplied).length;
    const replied = mockComments.filter((c) => c.isReplied && !c.replyFailReason).length;
    const rate = total > 0 ? ((replied / total) * 100).toFixed(1) : '0';
    return { total, pending, rate, avgTime: '2h 15m' };
  }, []);

  const filteredComments = useMemo(() => {
    return mockComments.filter((c: CommentItem) => {
      if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
      if (accountFilter !== 'all' && c.accountId !== accountFilter) return false;
      if (replyFilter === 'pending' && c.isReplied) return false;
      if (replyFilter === 'replied' && (!c.isReplied || c.replyFailReason)) return false;
      if (replyFilter === 'failed' && !c.replyFailReason) return false;
      if (sensitiveFilter === 'sensitive' && !c.isSensitive) return false;
      if (sensitiveFilter === 'normal' && c.isSensitive) return false;
      if (searchText && !c.content.includes(searchText) && !c.commenterNickname?.includes(searchText)) return false;
      return true;
    });
  }, [platformFilter, accountFilter, replyFilter, sensitiveFilter, searchText]);

  const paginatedComments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredComments.slice(start, start + pageSize);
  }, [filteredComments, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredComments.length / pageSize));

  const handleReply = (comment: CommentItem) => {
    setCurrentComment(comment);
    setReplyContent('');
    setReplyDialogOpen(true);
  };

  const handleLike = (id: string) => {
    setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDetail = (comment: CommentItem) => {
    setDetailComment(comment);
    setDetailOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedComments.length && paginatedComments.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedComments.map((c) => c.id));
    }
  };

  const handleInlineReply = (comment: CommentItem, text: string) => {
    if (!text.trim()) return;
    setExpandReplyId(null);
  };

  const quickReplies = [
    '感谢你的评论～',
    '已经收到你的反馈啦！',
    '好的，我记下来了～',
    '谢谢你的支持！',
    '有问题随时问我哦',
  ];

  return (
    <div className="p-0 space-y-4">
      <Alert variant="warning">
        <AlertTriangle className="w-4 h-4" />
        <AlertDescription>
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">评论管理</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1">
            <Download className="w-4 h-4" />
            导出
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4" data-ai-section-type="card-stat">
        {[
          { label: '总评论数', value: stats.total, icon: MessageSquare, color: 'text-primary' },
          { label: '待回复', value: stats.pending, icon: Clock, color: 'text-[hsl(26_90%_49%)]' },
          { label: '回复率', value: `${stats.rate}%`, icon: Percent, color: 'text-[hsl(130_54%_42%)]' },
          { label: '平均回复时长', value: stats.avgTime, icon: Zap, color: 'text-[hsl(200_90%_55%)]' },
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索评论内容/评论人"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="平台筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              {(Object.keys(platformLabelMap) as PlatformType[]).map((p) => (
                <SelectItem key={p} value={p}>{platformLabelMap[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="账号筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账号</SelectItem>
              {Object.values(mockAccounts).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: platformColorMap[a.platform] }}
                    />
                    <span>{a.nickname}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={replyFilter} onValueChange={setReplyFilter}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="回复状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待回复</SelectItem>
              <SelectItem value="replied">已回复</SelectItem>
              <SelectItem value="failed">回复失败</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sensitiveFilter} onValueChange={setSensitiveFilter}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="敏感词" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="sensitive">含敏感词</SelectItem>
              <SelectItem value="normal">正常</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1">
            <Calendar className="w-4 h-4" />
            时间范围
          </Button>
        </CardContent>
      </Card>

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="text-sm text-foreground">
              已选择 <span className="font-medium text-primary">{selectedIds.length}</span> 条评论
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Reply className="w-3.5 h-3.5" />
                批量回复
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Check className="w-3.5 h-3.5" />
                批量标记已读
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Tag className="w-3.5 h-3.5" />
                批量打标签
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Download className="w-3.5 h-3.5" />
                批量导出
              </Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedIds([])}>
                <X className="w-3.5 h-3.5 mr-1" />
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
                    checked={paginatedComments.length > 0 && selectedIds.length === paginatedComments.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-[180px]">内容</TableHead>
                <TableHead className="w-[120px]">评论人</TableHead>
                <TableHead className="w-[80px]">平台</TableHead>
                <TableHead>评论内容</TableHead>
                <TableHead className="w-[70px]">点赞</TableHead>
                <TableHead className="w-[90px]">状态</TableHead>
                <TableHead className="w-[140px]">时间</TableHead>
                <TableHead className="text-right w-[200px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedComments.map((comment: CommentItem) => {
                const Icon = platformIconMap[comment.platform];
                const color = platformColorMap[comment.platform];
                const account = mockAccounts[comment.accountId];
                const failKey = comment.replyFailReason as SendFailReason | undefined;
                const isExpanded = expandReplyId === comment.id;
                return (
                  <>
                    <TableRow key={comment.id} className={cn(comment.isSensitive && 'bg-destructive/5')}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(comment.id)}
                          onCheckedChange={() => toggleSelect(comment.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center text-xs text-muted-foreground">
                            封面
                          </div>
                          <span className="text-xs font-medium line-clamp-2 max-w-[120px]">
                            {comment.postTitle}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarImage src={comment.commenterAvatarUrl} />
                            <AvatarFallback>{comment.commenterNickname?.[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate max-w-[80px]">{comment.commenterNickname}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            <Icon className="w-2.5 h-2.5" />
                          </div>
                          <span className="text-xs text-muted-foreground">{platformLabelMap[comment.platform]}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleDetail(comment)}
                          className="text-sm max-w-md line-clamp-2 text-left hover:text-primary transition-colors"
                        >
                          {highlightSensitive(comment.content)}
                        </button>
                        {comment.isSensitive && (
                          <Badge variant="destructive" className="mt-1 h-4 text-[10px]">
                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                            含敏感词
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ThumbsUp className="w-3 h-3" />
                          {comment.likeCount + (liked[comment.id] ? 1 : 0)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {comment.isReplied ? (
                          comment.replyFailReason ? (
                            <Badge variant="destructive" className="text-xs">回复失败</Badge>
                          ) : (
                            <Badge className="bg-[hsl(130_54%_42%)] text-white border-none text-xs">已回复</Badge>
                          )
                        ) : (
                          <Badge variant="outline" className="text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/50 text-xs">
                            待回复
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {comment.commentedAt}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1"
                            onClick={() => setExpandReplyId(isExpanded ? null : comment.id)}
                          >
                            <Reply className="w-3.5 h-3.5" />
                            回复
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn('h-7 w-7', liked[comment.id] && 'text-[hsl(350_85%_60%)]')}
                            onClick={() => handleLike(comment.id)}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDetail(comment)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuItem>
                                <Flag className="w-3.5 h-3.5 mr-2" />举报
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteDialogOpen(true)}>
                                <Trash2 className="w-3.5 h-3.5 mr-2" />删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={9}>
                          <div className="p-3 bg-muted/30 border-t border-border/50">
                            <div className="flex items-start gap-3 max-w-2xl">
                              <Avatar className="w-6 h-6 mt-1">
                                <AvatarFallback className="text-[10px]">
                                  {account?.nickname?.[0] || '账'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 space-y-2">
                                <Textarea
                                  placeholder="输入回复内容..."
                                  value={expandReplyId === comment.id ? replyContent : ''}
                                  onChange={(e) => setReplyContent(e.target.value)}
                                  className="min-h-[60px] text-sm resize-none"
                                />
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <DropdownMenu open={quickReplyOpen} onOpenChange={setQuickReplyOpen}>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-7 gap-1">
                                          <Zap className="w-3.5 h-3.5" />
                                          快捷回复
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent className="w-64">
                                        {quickReplies.map((qr, i) => (
                                          <DropdownMenuItem
                                            key={i}
                                            onClick={() => {
                                              setReplyContent(qr);
                                              setQuickReplyOpen(false);
                                            }}
                                          >
                                            <span className="truncate text-xs">{qr}</span>
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7"
                                      onClick={() => setExpandReplyId(null)}
                                    >
                                      取消
                                    </Button>
                                    <Button size="sm" className="h-7 gap-1" onClick={() => handleInlineReply(comment, replyContent)}>
                                      <Send className="w-3.5 h-3.5" />
                                      发送回复
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          共 {filteredComments.length} 条评论
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

      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>回复评论</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={currentComment?.commenterAvatarUrl} />
                  <AvatarFallback>{currentComment?.commenterNickname?.[0]}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{currentComment?.commenterNickname}</span>
                <Badge
                  variant="secondary"
                  className="text-[10px] h-4"
                  style={{
                    backgroundColor: currentComment ? `${platformColorMap[currentComment.platform]}15` : 'transparent',
                    color: currentComment ? platformColorMap[currentComment.platform] : 'inherit',
                    border: 'none',
                  }}
                >
                  {currentComment && platformLabelMap[currentComment.platform]}
                </Badge>
              </div>
              <p className="text-sm text-foreground/80 pl-8">{currentComment?.content}</p>
            </div>
            <Textarea
              placeholder="输入回复内容..."
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>取消</Button>
            <Button onClick={() => setReplyDialogOpen(false)}>
              <Send className="w-3.5 h-3.5 mr-1" />
              发送回复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>评论详情</DialogTitle>
          </DialogHeader>
          {detailComment && (
            <div className="space-y-4">
              {/* Commenter Profile */}
              <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={detailComment.commenterAvatarUrl} />
                  <AvatarFallback>{detailComment.commenterNickname?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground">{detailComment.commenterNickname}</span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-5"
                      style={{
                        backgroundColor: `${platformColorMap[detailComment.platform]}15`,
                        color: platformColorMap[detailComment.platform],
                        border: 'none',
                      }}
                    >
                      {platformLabelMap[detailComment.platform]}
                    </Badge>
                    <Badge variant="outline" className="text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/40 text-[10px]">
                      <Users className="w-2.5 h-2.5 mr-0.5" />
                      互关
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    粉丝数：12,580 · 获赞：8.6w
                  </div>
                  <div className="text-sm text-foreground leading-relaxed">
                    {highlightSensitive(detailComment.content)}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3" />
                      {detailComment.likeCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {detailComment.replyCount} 条回复
                    </span>
                    <span>评论于 {detailComment.commentedAt}</span>
                  </div>
                </div>
              </div>

              {/* Post Info */}
              <div className="p-3 border border-border rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">所属作品</div>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                    封面
                  </div>
                  <div>
                    <div className="text-sm font-medium">{detailComment.postTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {mockAccounts[detailComment.accountId]?.nickname}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cross-account interactions */}
              <div>
                <div className="text-sm font-medium mb-2">跨账号互动历史</div>
                <div className="space-y-2">
                  {[
                    { account: '美食探店小队', content: '这家店看着好好吃啊', time: '2026-09-28 15:30', type: 'comment' },
                    { account: '旅行日记', content: '请问有推荐的民宿吗', time: '2026-09-26 10:20', type: 'comment' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-muted/30 rounded text-xs">
                      <MessageCircle className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <div className="text-muted-foreground">
                          {item.account} · {item.time}
                        </div>
                        <div className="text-foreground mt-0.5">{item.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Operation Log */}
              <div>
                <div className="text-sm font-medium mb-2">操作记录</div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>· 评论已同步 - 2026-09-28 15:30:05</div>
                  <div>· 敏感词检测通过 - 2026-09-28 15:30:06</div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button>
            <Button onClick={() => { setDetailOpen(false); if (detailComment) handleReply(detailComment); }}>
              <Reply className="w-3.5 h-3.5 mr-1" />
              回复此评论
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后无法恢复，确定要删除这条评论吗？
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

export default EngageCommentsAggPage;

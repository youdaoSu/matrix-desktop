import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ThumbsUp,
  Send,
  Smile,
  Image,
  Download,
  Trash2,
  Settings,
  Music,
  BookOpen,
  Video,
  Tv,
  AlertCircle,
  RefreshCw,
  MessageCircle,
  Calendar,
  AlertTriangle,
  CheckSquare,
} from 'lucide-react';
import type { CommentItem, PlatformType, SendFailReason, PlatformAccount, AccountGroup } from '@shared/api.interface';
import { FAIL_REASON_LABELS, FAIL_REASON_LEVELS } from '@shared/api.interface';
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
} from '@client/src/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Label } from '@client/src/components/ui/label';
import { Checkbox } from '@client/src/components/ui/checkbox';
import {
  mockComments as initMockComments,
  mockAccounts,
  platformMeta,
  sensitiveWords,
  groupList,
} from './engage-data';
import { cn } from '@/lib/utils';
import AccountSelector from '@client/src/components/account/AccountSelector';
import { toast } from 'sonner';

const platformIconMap: Record<PlatformType, any> = {
  douyin: Music,
  xiaohongshu: BookOpen,
  wechat: Video,
  bilibili: Tv,
};

function detectSensitive(text: string): string[] {
  return sensitiveWords.filter((w) => text.includes(w));
}

const EngageCommentsPage = () => {
  const [tab, setTab] = useState('all');
  const [platform, setPlatform] = useState<PlatformType | 'all'>('all');
  const [groupId, setGroupId] = useState<string | 'all'>('all');
  const [accountId, setAccountId] = useState<string | 'all'>('all');
  const [pageSize, setPageSize] = useState('50');
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState('c1');
  const [replyText, setReplyText] = useState('');
  const [replyAccount, setReplyAccount] = useState('1');
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<CommentItem[]>(initMockComments);
  const [page, setPage] = useState(1);
  const [batchAction, setBatchAction] = useState<string | null>(null);
  const [batchTag, setBatchTag] = useState('');

  // Batch reply
  const [selectMode, setSelectMode] = useState(false);
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchReplyText, setBatchReplyText] = useState('');
  const [batchReplyAccount, setBatchReplyAccount] = useState('1');
  const batchSensitiveHits = useMemo(
    () => detectSensitive(batchReplyText),
    [batchReplyText]
  );

  // 从 mock 数据构造 accounts 和 groups 数组供 AccountSelector 使用
  const accounts: PlatformAccount[] = useMemo(() =>
    Object.values(mockAccounts).map((a) => ({
      id: a.id,
      platform: a.platform,
      nickname: a.nickname,
      avatarUrl: a.avatarUrl,
      groupName: a.groupName,
      authStatus: 'authorized' as const,
      followersCount: 0,
      followingCount: 0,
      likesCount: 0,
      postsCount: 0,
      healthStatus: 'normal' as const,
      createdAt: '',
    })),
  []);

  const groups: AccountGroup[] = useMemo(() =>
    groupList.map((g) => ({
      id: g.id,
      userId: '',
      groupName: g.groupName,
      sortOrder: 0,
      isDefault: false,
      createdAt: '',
    })),
  []);

  // 当前筛选范围内的账号列表（用于回复账号下拉、批量回复账号下拉）
  const filteredAccounts = useMemo<PlatformAccount[]>(() => {
    let list = accounts;
    if (platform !== 'all') {
      list = list.filter((a) => a.platform === platform);
    }
    if (groupId !== 'all') {
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        list = list.filter((a) => a.groupName === group.groupName);
      }
    }
    if (accountId !== 'all') {
      list = list.filter((a) => a.id === accountId);
    }
    return list;
  }, [accounts, groups, platform, groupId, accountId]);

  const filteredAccountIds = useMemo(
    () => new Set(filteredAccounts.map((a) => a.id)),
    [filteredAccounts]
  );

  // 当前筛选范围内的评论
  const filteredComments = comments.filter((c: CommentItem) => {
    if (tab === 'unreplied' && c.isReplied) return false;
    if (tab === 'replied' && !c.isReplied) return false;
    if (!filteredAccountIds.has(c.accountId)) return false;
    if (searchText && !c.content.includes(searchText) && !c.commenterNickname?.includes(searchText)) return false;
    return true;
  });

  const selectedComment = comments.find((c) => c.id === selectedId);
  const replyAccountInfo = filteredAccounts.find((a) => a.id === replyAccount);

  // 顶部统计（基于当前筛选范围）
  const stats = useMemo(() => {
    const list = filteredComments;
    const total = list.length;
    const unreplied = list.filter((c) => !c.isReplied).length;
    const today = '2026-09-28';
    const todayNew = list.filter((c) => c.commentedAt.startsWith(today)).length;
    const replied = list.filter((c) => c.isReplied).length;
    const rate = total > 0 ? Math.round((replied / total) * 100) : 0;
    return { total, unreplied, todayNew, rate };
  }, [filteredComments]);

  const unreadCount = stats.unreplied;

  // 详情页的回复账号：当前选中评论所属平台的、在筛选范围内的账号
  const currentPlatform = selectedComment?.platform || 'douyin';
  const replyAccountOptions = useMemo(() => {
    const inScope = filteredAccounts.filter((a) => a.platform === currentPlatform);
    return inScope.length > 0 ? inScope : filteredAccounts;
  }, [filteredAccounts, currentPlatform]);

  // 回复账号如果不在当前可选列表中，重置为第一个可用账号
  const replyAccountValid = replyAccountOptions.some((a) => a.id === replyAccount);
  if (replyAccount && !replyAccountValid && replyAccountOptions.length > 0) {
    // 延迟到 useEffect 处理会有闪烁，这里用 useMemo 判断即可，实际通过 set 修正
  }

  // 批量回复账号同样受筛选范围限制
  const batchReplyAccountOptions = filteredAccounts.length > 0 ? filteredAccounts : accounts;

  const toggleSelectComment = (id: string) => {
    setSelectedCommentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = paginatedComments.map((c: CommentItem) => c.id);
    const allVisibleSelected = visibleIds.every((id) => selectedCommentIds.includes(id));
    if (allVisibleSelected) {
      setSelectedCommentIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      const newSet = new Set(selectedCommentIds);
      visibleIds.forEach((id) => newSet.add(id));
      setSelectedCommentIds(Array.from(newSet));
    }
  };

  const handleSend = () => {
    if (!replyText.trim() || !selectedComment) return;
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setComments((prev) =>
      prev.map((c: CommentItem) =>
        c.id === selectedComment.id
          ? {
              ...c,
              isReplied: true,
              replyContent: replyText,
              replyAccountId: replyAccount,
              repliedAt: timeStr,
              replyCount: c.replyCount + 1,
              replyFailReason: undefined,
            }
          : c
      )
    );
    setReplyText('');
  };

  const handleBatchReply = () => {
    if (!batchReplyText.trim() || selectedCommentIds.length === 0) return;
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setComments((prev) =>
      prev.map((c: CommentItem) =>
        selectedCommentIds.includes(c.id)
          ? {
              ...c,
              isReplied: true,
              replyContent: batchReplyText,
              replyAccountId: batchReplyAccount,
              repliedAt: timeStr,
              replyCount: c.replyCount + 1,
              replyFailReason: undefined,
            }
          : c
      )
    );
    setBatchDialogOpen(false);
    setBatchReplyText('');
    setSelectedCommentIds([]);
    setSelectMode(false);
  };

  const handleLike = (id: string) => {
    setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRetry = () => {
    if (!selectedComment) return;
    setComments((prev) =>
      prev.map((c: CommentItem) =>
        c.id === selectedComment.id
          ? { ...c, replyFailReason: undefined, isReplied: true, repliedAt: new Date().toLocaleString('zh-CN') }
          : c
      )
    );
  };

  const handleMarkAsRead = () => {
    setComments((prev) =>
      prev.map((c: CommentItem) =>
        selectedCommentIds.includes(c.id) ? { ...c, isReplied: true } : c
      )
    );
    setSelectedCommentIds([]);
    setSelectMode(false);
    setBatchAction(null);
  };

  const handleBatchTag = () => {
    if (!batchTag.trim()) return;
    setSelectedCommentIds([]);
    setSelectMode(false);
    setBatchAction(null);
    setBatchTag('');
  };

  const handleExportComments = () => {
    if (filteredComments.length === 0) return;
    const headers = ['ID', '评论人', '平台', '内容', '评论时间', '状态', '点赞数', '回复数'];
    const rows = filteredComments.map((c: CommentItem) => [
      c.id, c.commenterNickname || '', c.platform, c.content,
      c.commentedAt, c.isReplied ? '已回复' : '待回复',
      c.likeCount, c.replyCount,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `评论数据_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteComments = () => {
    setComments((prev) => prev.filter((c: CommentItem) => !selectedCommentIds.includes(c.id)));
    setSelectedCommentIds([]);
    setSelectMode(false);
    setBatchAction(null);
  };

  // 分页
  const commentTotalPages = Math.max(1, Math.ceil(filteredComments.length / Number(pageSize)));
  const paginatedComments = filteredComments.slice(
    (page - 1) * Number(pageSize),
    page * Number(pageSize)
  );

  // 切换筛选时重置页码
  useEffect(() => {
    setPage(1);
  }, [tab, platform, groupId, accountId, searchText]);

  const failReasonKey = selectedComment?.replyFailReason as SendFailReason | undefined;
  const failLabel = failReasonKey ? FAIL_REASON_LABELS[failReasonKey] : '';
  const failLevel = failReasonKey ? FAIL_REASON_LEVELS[failReasonKey] : 'warning';

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
      </div>

      <Card className="overflow-hidden">
        <div className="flex h-[calc(100vh-220px)] min-h-[600px]">
          <div className="w-[380px] border-r border-border flex flex-col shrink-0">
            <div className="p-3 space-y-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Tabs value={tab} onValueChange={setTab} className="flex-1">
                  <TabsList className="w-full">
                     <TabsTrigger value="all" className="flex-1">
                       全部
                        <Badge className="ml-1 h-4 min-w-[18px] px-1 text-[10px] bg-muted-foreground/20 text-foreground">{stats.total}</Badge>
                     </TabsTrigger>
                    <TabsTrigger value="unreplied" className="flex-1">
                      未回复
                      <Badge className="ml-1 h-4 min-w-[18px] px-1 text-[10px] bg-destructive text-white">{unreadCount}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="replied" className="flex-1">已回复</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <AccountSelector
                accounts={accounts}
                groups={groups}
                platform={platform}
                groupId={groupId}
                accountId={accountId}
                onPlatformChange={setPlatform}
                onGroupChange={setGroupId}
                onAccountChange={setAccountId}
                size="sm"
                className="w-full"
              />

              <div className="flex items-center gap-2">
                <Button
                  variant={selectMode ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => {
                    setSelectMode(!selectMode);
                    setSelectedCommentIds([]);
                  }}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {selectMode ? '取消多选' : '批量回复'}
                </Button>
                <Select value={pageSize} onValueChange={setPageSize}>
                  <SelectTrigger className="w-20 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20条</SelectItem>
                    <SelectItem value="50">50条</SelectItem>
                    <SelectItem value="100">100条</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1 relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="搜索评论"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
                 <Button variant="ghost" size="icon" className="h-8 w-8" title="时间筛选" onClick={() => toast('演示模式：时间筛选功能待接入')}>
                   <Calendar className="w-4 h-4" />
                 </Button>
                 <Button variant="ghost" size="icon" className="h-8 w-8" title="导出评论" onClick={handleExportComments}>
                   <Download className="w-4 h-4" />
                 </Button>
                 <Button variant="ghost" size="icon" className="h-8 w-8" title="批量删除" onClick={() => { setSelectMode(true); setBatchAction('delete'); }}>
                   <Trash2 className="w-4 h-4" />
                 </Button>
                 <Button variant="ghost" size="icon" className="h-8 w-8" title="设置" onClick={() => toast('演示模式：评论设置功能待接入')}>
                   <Settings className="w-4 h-4" />
                 </Button>
              </div>
            </div>

            {/* Select all bar */}
            {selectMode && (
              <div className="px-3 py-2 border-b border-border/50 bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Checkbox
                     checked={paginatedComments.length > 0 && paginatedComments.every((c: CommentItem) => selectedCommentIds.includes(c.id))}
                     onCheckedChange={toggleSelectAllVisible}
                   />
                  <span className="text-xs text-muted-foreground">
                    已选 <span className="font-medium text-foreground">{selectedCommentIds.length}</span> 条
                  </span>
                </div>
                 <div className="flex gap-1.5">
                   <Button
                     size="sm"
                     variant="outline"
                     className="h-7 gap-1"
                     disabled={selectedCommentIds.length === 0}
                     onClick={() => setBatchAction('read')}
                   >
                     已读
                   </Button>
                   <Button
                     size="sm"
                     variant="outline"
                     className="h-7 gap-1"
                     disabled={selectedCommentIds.length === 0}
                     onClick={() => setBatchAction('tag')}
                   >
                     打标签
                   </Button>
                   <Button
                     size="sm"
                     className="h-7 gap-1"
                     disabled={selectedCommentIds.length === 0}
                     onClick={() => setBatchDialogOpen(true)}
                   >
                     <Send className="w-3.5 h-3.5" />
                     回复
                   </Button>
                 </div>
              </div>
            )}

             <div className="flex-1 overflow-y-auto">
               {paginatedComments.map((c: CommentItem) => {
                const meta = platformMeta[c.platform];
                const Icon = meta.icon;
                const isSelected = selectedId === c.id;
                const isChecked = selectedCommentIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => selectMode ? toggleSelectComment(c.id) : setSelectedId(c.id)}
                    className={cn(
                      'p-3 cursor-pointer border-b border-border/50 transition-colors relative',
                      isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                    )}
                    <div className="flex items-start gap-2.5">
                      {selectMode && (
                        <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleSelectComment(c.id)}
                          />
                        </div>
                      )}
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={c.commenterAvatarUrl} />
                        <AvatarFallback>{c.commenterNickname?.[0] || '评'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium truncate">{c.commenterNickname}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {c.commentedAt.split(' ')[1]}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mb-1 truncate">
                          {c.postTitle}
                        </div>
                        <div className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                          {c.isSensitive ? (
                            <span className="text-destructive">{c.content}</span>
                          ) : (
                            c.content
                          )}
                          {c.isSensitive && (
                            <Badge variant="destructive" className="ml-1 h-3.5 text-[9px] px-1">
                              敏感
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="h-4 text-[10px] px-1.5"
                              style={{ backgroundColor: `${meta.color}15`, color: meta.color, border: 'none' }}
                            >
                              <Icon className="w-2.5 h-2.5 mr-0.5" />
                              {meta.label}
                            </Badge>
                            <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <ThumbsUp className="w-3 h-3" />
                              {c.likeCount}
                            </div>
                          </div>
                          {c.isReplied ? (
                            c.replyFailReason ? (
                              <Badge variant="destructive" className="h-4 text-[10px] px-1.5">
                                <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                                失败
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="h-4 text-[10px] px-1.5 text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/40">
                                已回复
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="h-4 text-[10px] px-1.5 text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/40">
                              待回复
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
             </div>

             {/* Pagination */}
             {filteredComments.length > Number(pageSize) && (
               <div className="px-3 py-2 border-t border-border/50 bg-muted/20 flex items-center justify-between">
                 <span className="text-[10px] text-muted-foreground">
                   共 {filteredComments.length} 条
                 </span>
                 <div className="flex items-center gap-1">
                   <Button
                     variant="ghost"
                     size="sm"
                     className="h-6 w-6 p-0"
                     onClick={() => setPage((p) => Math.max(1, p - 1))}
                     disabled={page === 1}
                   >
                     {'<'} 上一页
                   </Button>
                   <span className="text-[10px] text-muted-foreground mx-1">
                     {page} / {commentTotalPages}
                   </span>
                   <Button
                     variant="ghost"
                     size="sm"
                     className="h-6 w-6 p-0"
                     onClick={() => setPage((p) => Math.min(commentTotalPages, p + 1))}
                     disabled={page === commentTotalPages}
                   >
                     下一页 {'>'}
                   </Button>
                 </div>
               </div>
             )}
           </div>

           <div className="flex-1 flex flex-col min-w-0">
            {selectedComment ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="flex items-start gap-3 pb-4 border-b border-border">
                    <Avatar className="w-12 h-12 shrink-0">
                      <AvatarImage src={selectedComment.commenterAvatarUrl} />
                      <AvatarFallback>{selectedComment.commenterNickname?.[0] || '评'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{selectedComment.commenterNickname}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5"
                          style={{
                            backgroundColor: `${platformMeta[selectedComment.platform].color}15`,
                            color: platformMeta[selectedComment.platform].color,
                            border: 'none',
                          }}
                        >
                          {platformMeta[selectedComment.platform].label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        评论于 {selectedComment.commentedAt}
                      </div>
                      <p className="text-sm leading-relaxed text-foreground">
                        {selectedComment.content}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'h-7 px-2 text-xs gap-1',
                            liked[selectedComment.id] && 'text-[hsl(350_85%_60%)]'
                          )}
                          onClick={() => handleLike(selectedComment.id)}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          {selectedComment.likeCount + (liked[selectedComment.id] ? 1 : 0)}
                        </Button>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageCircle className="w-3.5 h-3.5" />
                          {selectedComment.replyCount} 条回复
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">所属作品</div>
                    <div className="text-sm font-medium">{selectedComment.postTitle}</div>
                  </div>

                  {selectedComment.replyFailReason && failReasonKey && (
                    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="w-4 h-4 text-destructive" />
                        <Badge variant="destructive" className="text-xs">
                          回复失败
                        </Badge>
                      </div>
                      <div className="text-xs text-destructive mb-2">{failLabel}</div>
                       <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={handleRetry}>
                         <RefreshCw className="w-3.5 h-3.5" />
                         重试
                       </Button>
                    </div>
                  )}

                  {selectedComment.isReplied && selectedComment.replyContent && !selectedComment.replyFailReason && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">回复历史</div>
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-5 h-5">
                              <AvatarFallback className="text-[10px]">
                                {replyAccountInfo?.nickname?.[0] || '账'}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium">{replyAccountInfo?.nickname || '运营账号'}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{selectedComment.repliedAt}</span>
                        </div>
                        <p className="text-sm text-foreground">{selectedComment.replyContent}</p>
                      </div>
                    </div>
                  )}

                  <Button variant="outline" size="sm" className="w-full h-9 gap-2" onClick={() => setMessageDialogOpen(true)}>
                    <MessageCircle className="w-4 h-4" />
                    打开 TA 的私信
                  </Button>
                </div>

                    <div className="border-t border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">回复账号：</span>
                    <Select value={replyAccount} onValueChange={setReplyAccount}>
                      <SelectTrigger className="w-44 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                         {replyAccountOptions.map((a) => {
                          const meta = platformMeta[a.platform];
                          return (
                            <SelectItem key={a.id} value={a.id}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: meta.color }}
                                />
                                <span className="text-xs">{a.nickname}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {replyText && detectSensitive(replyText).length > 0 && (
                    <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <div className="font-medium text-destructive mb-0.5">检测到敏感词</div>
                        <div className="flex flex-wrap gap-1">
                          {detectSensitive(replyText).map((w, i) => (
                            <Badge key={i} variant="destructive" className="text-[10px] h-4 px-1">
                              {w}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                     <Textarea
                       placeholder="输入回复内容..."
                       value={replyText}
                       onChange={(e) => setReplyText(e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                           e.preventDefault();
                           handleSend();
                         }
                       }}
                       className="resize-none min-h-[60px] text-sm"
                     />
                    <div className="flex flex-col gap-1">
                       <Button variant="ghost" size="icon" className="h-8 w-8" title="表情" onClick={() => toast('演示模式：表情功能待接入')}>
                         <Smile className="w-4 h-4" />
                       </Button>
                       <Button variant="ghost" size="icon" className="h-8 w-8" title="图片" onClick={() => toast('演示模式：图片功能待接入')}>
                         <Image className="w-4 h-4" />
                       </Button>
                       <Button size="sm" className="gap-1" onClick={handleSend} disabled={!replyText.trim()}>
                         <Send className="w-3.5 h-3.5" />
                         发送
                       </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">选择一条评论查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>打开私信会话</DialogTitle>
            <DialogDescription>
              将打开与该评论人的私信会话，您可以在私信中继续沟通。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Avatar className="w-10 h-10">
              <AvatarImage src={selectedComment?.commenterAvatarUrl} />
              <AvatarFallback>{selectedComment?.commenterNickname?.[0]}</AvatarFallback>
            </Avatar>
            <div>
              <div className="text-sm font-medium">{selectedComment?.commenterNickname}</div>
              <div className="text-xs text-muted-foreground">来自 {platformMeta[selectedComment?.platform || 'douyin'].label}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageDialogOpen(false)}>取消</Button>
            <Button onClick={() => setMessageDialogOpen(false)}>确定打开</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Action Dialogs */}
      <Dialog open={batchAction === 'read'} onOpenChange={(o) => !o && setBatchAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>标记为已读</DialogTitle>
            <DialogDescription>
              将选中的 {selectedCommentIds.length} 条评论标记为已读（已回复状态）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchAction(null)}>取消</Button>
            <Button onClick={handleMarkAsRead}>确认标记</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchAction === 'tag'} onOpenChange={(o) => !o && setBatchAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量打标签</DialogTitle>
            <DialogDescription>
              为选中的 {selectedCommentIds.length} 条评论添加标签（演示模式）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">标签名称</Label>
            <Input value={batchTag} onChange={(e) => setBatchTag(e.target.value)} placeholder="输入标签名称" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchAction(null)}>取消</Button>
            <Button onClick={handleBatchTag} disabled={!batchTag.trim()}>确认添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchAction === 'delete'} onOpenChange={(o) => !o && setBatchAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除评论</DialogTitle>
            <DialogDescription>
              确定要删除选中的 {selectedCommentIds.length} 条评论吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchAction(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteComments}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Reply Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>批量回复评论</DialogTitle>
            <DialogDescription>
              将向选中的 <span className="font-medium text-foreground">{selectedCommentIds.length}</span> 条评论发送统一回复内容
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">回复账号</label>
              <Select value={batchReplyAccount} onValueChange={setBatchReplyAccount}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                   {batchReplyAccountOptions.map((a) => {
                    const meta = platformMeta[a.platform];
                    return (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: meta.color }}
                          />
                          <span className="text-sm">{a.nickname}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">回复内容</label>
              <Textarea
                placeholder="请输入回复内容..."
                value={batchReplyText}
                onChange={(e) => setBatchReplyText(e.target.value)}
                className="min-h-[120px] resize-none"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{batchReplyText.length} 字</span>
                <span>将发送给 {selectedCommentIds.length} 位用户</span>
              </div>
            </div>

            {batchSensitiveHits.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-medium text-destructive mb-1">检测到敏感词，发送将被拦截</div>
                  <div className="flex flex-wrap gap-1">
                    {batchSensitiveHits.map((w, i) => (
                      <Badge key={i} variant="destructive" className="text-[10px] h-4 px-1">
                        {w}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>取消</Button>
            <Button
              onClick={handleBatchReply}
              disabled={!batchReplyText.trim() || batchSensitiveHits.length > 0}
            >
              确认发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EngageCommentsPage;

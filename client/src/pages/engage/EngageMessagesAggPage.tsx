import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Send,
  Smile,
  Image,
  Link2,
  MoreHorizontal,
  Pin,
  CheckCheck,
  Zap,
  Music,
  BookOpen,
  Video,
  Tv,
  AlertTriangle,
  AlertCircle,
  X,
  Plus,
  Tag,
  Edit3,
  Trash2,
  Download,
  ChevronDown,
  ChevronUp,
  BookMarked,
  Folder,
  Filter,
  Clock,
  User,
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import type { MessageSession, MessageItem, PlatformType, SendFailReason, QuickReply } from '@shared/api.interface';
import { FAIL_REASON_LABELS } from '@shared/api.interface';
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
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Switch } from '@client/src/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@client/src/components/ui/dropdown-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@client/src/components/ui/accordion';
import { Checkbox } from '@client/src/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@client/src/components/ui/tooltip';
import {
  mockSessions,
  generateSessionMessages,
  quickReplyGroups,
  mockAccounts,
  platformMeta,
  sensitiveWords,
} from './engage-data';
import { cn } from '@/lib/utils';

const platformIconMap: Record<PlatformType, any> = {
  douyin: Music,
  xiaohongshu: BookOpen,
  wechat: Video,
  bilibili: Tv,
};

const SENSITIVE_WORDS = sensitiveWords;

function checkSensitive(text: string): string[] {
  return SENSITIVE_WORDS.filter((w) => text.includes(w));
}

const EngageMessagesAggPage = () => {
  const [sessions, setSessions] = useState<MessageSession[]>(mockSessions);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, MessageItem[]>>({});
  const [inputText, setInputText] = useState('');
  const [sendAccount, setSendAccount] = useState('1');
  const [doubleClickSend, setDoubleClickSend] = useState(true);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [activeQuickCategory, setActiveQuickCategory] = useState<string>('默认分组');
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<'none' | 'quick' | 'profile'>('quick');
  const [detailTab, setDetailTab] = useState('info');
  const [quickSearch, setQuickSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find((s) => s.id === selectedSessionId) || null;
  const currentMessages = selectedSessionId ? (messages[selectedSessionId] || []) : [];

  // Load messages on session select
  useEffect(() => {
    if (selectedSessionId && !messages[selectedSessionId]) {
      setMessages((prev) => ({
        ...prev,
        [selectedSessionId]: generateSessionMessages(selectedSessionId, 12),
      }));
    }
  }, [selectedSessionId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  const filteredSessions = sessions
    .slice()
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    })
    .filter((s: MessageSession) => {
      if (platformFilter !== 'all' && s.platform !== platformFilter) return false;
      if (accountFilter !== 'all' && s.accountId !== accountFilter) return false;
      if (unreadOnly && s.unreadCount === 0) return false;
      if (searchText && !s.userNickname?.includes(searchText)) return false;
      return true;
    });

  const samePlatformAccounts = currentSession
    ? Object.values(mockAccounts).filter((a) => a.platform === currentSession.platform)
    : Object.values(mockAccounts).filter((a) => a.platform === 'douyin');

  const handleSend = () => {
    if (!inputText.trim() || !selectedSessionId) return;
    const newMsg: MessageItem = {
      id: `${selectedSessionId}-m${Date.now()}`,
      sessionId: selectedSessionId,
      direction: 'outbound',
      msgType: 'text',
      content: inputText.trim(),
      senderAccountId: sendAccount,
      isRead: false,
      sentAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    };
    setMessages((prev) => ({
      ...prev,
      [selectedSessionId]: [...(prev[selectedSessionId] || []), newMsg],
    }));
    setInputText('');
  };

  const togglePin = (id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isPinned: !s.isPinned } : s))
    );
  };

  const markAsRead = (id: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, unreadCount: 0 } : s))
    );
  };

  const handleSelectSession = (id: string) => {
    if (selectMode) {
      setSelectedSessionIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      );
    } else {
      setSelectedSessionId(id);
      markAsRead(id);
    }
  };

  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedSessionIds([]);
  };

  const handleQuickReply = (content: string) => {
    setInputText(content);
    setQuickPanelOpen(false);
  };

  const hitWords = checkSensitive(inputText);

  // Filtered quick reply groups (search)
  const filteredQuickGroups: Record<string, QuickReply[]> = useMemo(() => {
    const result: Record<string, QuickReply[]> = {};
    Object.entries(quickReplyGroups).forEach(([group, items]) => {
      if (!quickSearch.trim()) {
        result[group] = items;
        return;
      }
      const q = quickSearch.toLowerCase();
      const matched = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q) ||
          group.toLowerCase().includes(q)
      );
      if (matched.length > 0) {
        result[group] = matched;
      }
    });
    return result;
  }, [quickSearch]);

  // Batch stats
  const selectedCount = selectedSessionIds.length;

  const sendStatusLabels: Record<string, { icon: any; color: string; label: string }> = {
    sending: { icon: Clock, color: 'text-muted-foreground', label: '发送中' },
    sent: { icon: CheckCheck, color: 'text-primary', label: '已送达' },
    read: { icon: CheckCheck, color: 'text-[hsl(130_54%_42%)]', label: '已读' },
    failed: { icon: AlertCircle, color: 'text-destructive', label: '失败' },
  };

  // Profile stats (示例数据)
  const profileStats = {
    gender: [
      { name: '女性', value: 58 },
      { name: '男性', value: 42 },
    ],
  };

  const genderOption = {
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: ['50%', '70%'],
      itemStyle: { borderRadius: 4 },
      label: { fontSize: 11 },
      data: [
        { value: 58, name: '女性', itemStyle: { color: 'hsl(350 85% 60%)' } },
        { value: 42, name: '男性', itemStyle: { color: 'hsl(200 90% 55%)' } },
      ],
    }],
  };

  return (
    <TooltipProvider>
      <div className="p-0 space-y-4">
        <Alert variant="warning">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">私信管理</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={toggleSelectMode}>
              {selectMode ? <X className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
              {selectMode ? '退出批量' : '批量操作'}
            </Button>
            <Button variant="outline" size="sm" className="gap-1">
              <Download className="w-4 h-4" />
              导出
            </Button>
          </div>
        </div>

        {/* Batch bar */}
        {selectMode && selectedCount > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="text-sm text-foreground">
                已选择 <span className="font-medium text-primary">{selectedCount}</span> 个会话
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setBatchDialogOpen(true)}>
                  <CheckCheck className="w-3.5 h-3.5" />
                  批量标记已读
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  <Pin className="w-3.5 h-3.5" />
                  批量置顶
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  批量打标签
                </Button>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedSessionIds([])}>
                  取消全选
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="flex h-[calc(100vh-220px)] min-h-[600px]">
            {/* Session List */}
            <div className="w-[300px] border-r border-border flex flex-col shrink-0">
              <div className="p-3 space-y-2 border-b border-border">
                {/* Top filters */}
                <div className="flex items-center gap-2">
                  <Select value={platformFilter} onValueChange={setPlatformFilter}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="平台" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部平台</SelectItem>
                      {(Object.keys(platformMeta) as PlatformType[]).map((p) => (
                        <SelectItem key={p} value={p}>{platformMeta[p].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant={unreadOnly ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setUnreadOnly(!unreadOnly)}
                  >
                    未读
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="搜索会话"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="pl-7 h-8 text-xs"
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={toggleSelectMode}>
                        {selectMode ? '退出批量' : '批量操作'}
                      </DropdownMenuItem>
                      <DropdownMenuItem>全部标记已读</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredSessions.map((s: MessageSession) => {
                  const Icon = platformIconMap[s.platform];
                  const isSelected = selectedSessionId === s.id;
                  const isChecked = selectedSessionIds.includes(s.id);
                  const isNew = s.unreadCount > 0;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSession(s.id)}
                      className={cn(
                        'p-3 cursor-pointer border-b border-border/50 transition-colors relative',
                        isSelected && !selectMode ? 'bg-primary/5' : 'hover:bg-muted/50',
                        isNew && !selectMode && 'bg-[hsl(26_90%_49%)]/5'
                      )}
                    >
                      {isSelected && !selectMode && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                      )}
                      <div className="flex items-start gap-2.5">
                        {selectMode && (
                          <Checkbox
                            checked={isChecked}
                            className="mt-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="relative shrink-0">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={s.userAvatarUrl} />
                            <AvatarFallback>{s.userNickname?.[0] || '用'}</AvatarFallback>
                          </Avatar>
                          <div
                            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                            style={{ backgroundColor: platformMeta[s.platform].color }}
                          >
                            <Icon className="w-2.5 h-2.5" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1 min-w-0">
                              {s.isPinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                              <span className={cn(
                                'text-sm truncate',
                                isNew ? 'font-semibold text-foreground' : 'text-foreground'
                              )}>
                                {s.userNickname}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                              {s.lastMessageAt?.split(' ')[1]}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
                            {s.lastMessage}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              {mockAccounts[s.accountId]?.nickname}
                            </span>
                            {s.unreadCount > 0 && (
                              <Badge variant="destructive" className="h-4 min-w-[18px] px-1 text-[10px] justify-center">
                                {s.unreadCount > 99 ? '99+' : s.unreadCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-border">
              {currentSession ? (
                <>
                  {/* Header */}
                  <div className="h-14 border-b border-border flex items-center px-4 gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={currentSession.userAvatarUrl} />
                      <AvatarFallback>{currentSession.userNickname?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{currentSession.userNickname}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5"
                          style={{
                            backgroundColor: `${platformMeta[currentSession.platform].color}15`,
                            color: platformMeta[currentSession.platform].color,
                            border: 'none',
                          }}
                        >
                          {platformMeta[currentSession.platform].label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {mockAccounts[currentSession.accountId]?.nickname}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Select value={sendAccount} onValueChange={setSendAccount}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {samePlatformAccounts.map((a) => {
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
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => markAsRead(currentSession.id)}>
                        <CheckCheck className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn('h-8 w-8', currentSession.isPinned && 'text-primary')}
                        onClick={() => togglePin(currentSession.id)}
                      >
                        <Pin className="w-4 h-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem>
                            <Edit3 className="w-3.5 h-3.5 mr-2" />
                            备注
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Tag className="w-3.5 h-3.5 mr-2" />
                            打标签
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRightPanel(rightPanel === 'profile' ? 'none' : 'profile')}>
                            <User className="w-3.5 h-3.5 mr-2" />
                            查看资料
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            删除会话
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
                    {currentMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Send className="w-10 h-10 mb-2 opacity-30" />
                        <p className="text-sm">暂无消息，发送第一条私信吧</p>
                      </div>
                    ) : (
                      currentMessages.map((msg: MessageItem) => {
                        const isOutbound = msg.direction === 'outbound';
                        const failKey = msg.failReason as SendFailReason | undefined;
                        const sender = msg.senderAccountId ? mockAccounts[msg.senderAccountId] : null;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[70%] ${isOutbound ? 'order-2' : 'order-1'}`}>
                              {!isOutbound && (
                                <div className="text-[10px] text-muted-foreground mb-1">
                                  {currentSession.userNickname}
                                </div>
                              )}
                              {isOutbound && sender && (
                                <div className="text-[10px] text-muted-foreground mb-1 text-right">
                                  {sender.nickname}
                                </div>
                              )}
                              <div
                                className={cn(
                                  'px-3 py-2 rounded-lg text-sm relative',
                                  isOutbound
                                    ? failKey
                                      ? 'bg-destructive/20 border border-destructive text-destructive rounded-br-none'
                                      : 'bg-primary text-white rounded-br-none'
                                    : 'bg-card border border-border rounded-bl-none'
                                )}
                              >
                                {msg.content}
                                {isOutbound && failKey && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertCircle className="absolute -left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                      <p className="text-xs">{FAIL_REASON_LABELS[failKey]}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              {isOutbound && failKey && (
                                <div className="text-[11px] text-destructive mt-1 text-right flex items-center justify-end gap-1">
                                  <span>发送失败：{FAIL_REASON_LABELS[failKey]}</span>
                                  <button className="underline hover:text-destructive/80">重发</button>
                                </div>
                              )}
                              <div className={`text-[10px] text-muted-foreground mt-1 flex items-center gap-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                                <span>{msg.sentAt?.split(' ')[1]}</span>
                                {isOutbound && !failKey && (
                                  <CheckCheck className="w-3 h-3 text-[hsl(130_54%_42%)]" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Sensitive warning */}
                  {hitWords.length > 0 && (
                    <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
                      <div className="flex items-center gap-2 text-xs text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>检测到敏感词：{hitWords.join('、')}，发送后可能被平台拦截，请修改后再发送</span>
                      </div>
                    </div>
                  )}

                  {/* Input Area */}
                  <div className="border-t border-border p-3">
                    <div className="flex items-center gap-1 mb-2">
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
                        <Smile className="w-4 h-4" />
                        表情
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
                        <Image className="w-4 h-4" />
                        图片
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
                        <Link2 className="w-4 h-4" />
                        链接
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1"
                        onClick={() => setRightPanel(rightPanel === 'quick' ? 'none' : 'quick')}
                      >
                        <Zap className="w-4 h-4" />
                        话术库
                      </Button>
                    </div>
                    <div className="flex items-end gap-2">
                      <Textarea
                        placeholder="输入消息..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        className="resize-none min-h-[60px] text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                      />
                      <Button onClick={handleSend} className="gap-1">
                        <Send className="w-4 h-4" />
                        发送
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Send className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">选择一个会话开始聊天</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel */}
            {rightPanel !== 'none' && (
              <div className="w-[280px] flex flex-col shrink-0">
                {rightPanel === 'quick' && (
                  <>
                    <div className="h-14 border-b border-border flex items-center justify-between px-4">
                      <span className="font-medium text-sm">话术库</span>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Plus className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            <DropdownMenuItem>新建话术</DropdownMenuItem>
                            <DropdownMenuItem>新建分组</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRightPanel('none')}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">双击发送</span>
                      <Switch checked={doubleClickSend} onCheckedChange={setDoubleClickSend} />
                    </div>

                     <div className="px-3 py-2 border-b border-border">
                       <div className="relative">
                         <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                         <Input
                           placeholder="搜索话术"
                           className="pl-7 h-8 text-xs"
                           value={quickSearch}
                           onChange={(e) => setQuickSearch(e.target.value)}
                         />
                       </div>
                     </div>

                     <div className="flex-1 overflow-y-auto">
                       <Accordion type="multiple" defaultValue={['默认分组', '问候语']}>
                         {Object.entries(filteredQuickGroups).length === 0 ? (
                           <div className="text-center text-xs text-muted-foreground py-8">
                             未找到匹配的话术
                           </div>
                         ) : (
                           Object.entries(filteredQuickGroups).map(([group, items]) => (
                             <AccordionItem key={group} value={group}>
                               <AccordionTrigger className="px-3 py-2 text-xs font-medium hover:no-underline">
                                 {group}
                                 <Badge variant="secondary" className="ml-2 h-4 text-[10px]">
                                   {items.length}
                                 </Badge>
                               </AccordionTrigger>
                               <AccordionContent className="px-0 pb-1">
                                 {items.map((item: QuickReply) => (
                                   <div
                                     key={item.id}
                                     onDoubleClick={() => doubleClickSend && handleQuickReply(item.content)}
                                     onClick={() => handleQuickReply(item.content)}
                                     className="px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/30"
                                   >
                                     <div className="text-xs font-medium text-foreground mb-0.5 truncate">
                                       {item.title}
                                     </div>
                                     <div className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                       {item.content}
                                     </div>
                                   </div>
                                 ))}
                               </AccordionContent>
                             </AccordionItem>
                           ))
                         )}
                       </Accordion>
                     </div>
                  </>
                )}

                {rightPanel === 'profile' && currentSession && (
                  <>
                    <div className="h-14 border-b border-border flex items-center justify-between px-4">
                      <span className="font-medium text-sm">对方资料</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRightPanel('none')}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <div className="text-center">
                        <Avatar className="w-16 h-16 mx-auto mb-2">
                          <AvatarImage src={currentSession.userAvatarUrl} />
                          <AvatarFallback className="text-xl">{currentSession.userNickname?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{currentSession.userNickname}</div>
                        <div className="text-xs text-muted-foreground">
                          {platformMeta[currentSession.platform].label}
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">粉丝数</span>
                          <span>12,580</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">关注数</span>
                          <span>326</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">获赞</span>
                          <span>8.6w</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">关注时间</span>
                          <span>2026-09-15</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-medium mb-2">性别分布（示例）</div>
                        <ReactECharts option={genderOption} style={{ height: 140 }} />
                      </div>

                      <div className="pt-2 border-t border-border space-y-2">
                        <Button variant="outline" size="sm" className="w-full gap-1">
                          <Edit3 className="w-3.5 h-3.5" />
                          编辑备注
                        </Button>
                        <Button variant="outline" size="sm" className="w-full gap-1">
                          <Tag className="w-3.5 h-3.5" />
                          管理标签
                        </Button>
                        <Button variant="outline" size="sm" className="w-full gap-1">
                          <Download className="w-3.5 h-3.5" />
                          导出会话记录
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Batch Confirm Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批量标记已读</DialogTitle>
            <DialogDescription>
              将 {selectedCount} 个会话标记为已读？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>取消</Button>
            <Button onClick={() => { setBatchDialogOpen(false); setSelectMode(false); setSelectedSessionIds([]); }}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default EngageMessagesAggPage;

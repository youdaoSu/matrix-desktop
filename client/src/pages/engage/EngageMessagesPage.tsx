import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Send,
  Smile,
  Image,
  Link2,
  Pin,
  CheckCheck,
  MoreHorizontal,
  Music,
  BookOpen,
  Video,
  Tv,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  Plus,
  Zap,
} from 'lucide-react';
import type { MessageSession, MessageItem, PlatformType, SendFailReason, QuickReply } from '@shared/api.interface';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@client/src/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@client/src/components/ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@client/src/components/ui/accordion';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Switch } from '@client/src/components/ui/switch';
import { cn } from '@/lib/utils';
import AccountSelector from '@client/src/components/account/AccountSelector';
import type { PlatformAccount, AccountGroup } from '@shared/api.interface';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

const mockAccounts: Record<string, { id: string; platform: PlatformType; nickname: string; groupName: string }> = {
  '1': { id: '1', platform: 'douyin', nickname: '美食探店小队', groupName: '美食组' },
  '2': { id: '2', platform: 'douyin', nickname: '旅行日记', groupName: '生活组' },
  '3': { id: '3', platform: 'xiaohongshu', nickname: '生活种草日记', groupName: '生活组' },
  '5': { id: '5', platform: 'wechat', nickname: '职场成长笔记', groupName: '科技组' },
  '6': { id: '6', platform: 'bilibili', nickname: '科技宅频道', groupName: '科技组' },
};

const mockAccountList: PlatformAccount[] = Object.values(mockAccounts).map((a, i) => ({
  id: a.id,
  platform: a.platform,
  platformUserId: `pu_${a.id}`,
  nickname: a.nickname,
  avatarUrl: '',
  accountRemark: '',
  groupName: a.groupName,
  authStatus: 'authorized',
  authExpiresAt: '2027-09-28 00:00',
  followersCount: 10000 + i * 2300,
  followingCount: 200 + i * 50,
  likesCount: 50000 + i * 8000,
  postsCount: 120 + i * 30,
  healthStatus: 'normal',
  createdAt: '2026-01-15 10:00',
}));

const uniqueGroupNames = Array.from(new Set(Object.values(mockAccounts).map((a) => a.groupName)));
const mockAccountGroups: AccountGroup[] = uniqueGroupNames.map((name, i) => ({
  id: `g${i + 1}`,
  userId: 'u1',
  groupName: name,
  sortOrder: i + 1,
  isDefault: i === 0,
  accountCount: Object.values(mockAccounts).filter((a) => a.groupName === name).length,
  createdAt: '2026-01-01 00:00',
}));

const mockSessions: MessageSession[] = [
  { id: 's1', platform: 'douyin', accountId: '1', sessionPlatformId: 'u1', userNickname: '小美食家', userAvatarUrl: '', lastMessage: '你好，请问这家店的地址在哪里呀？', lastMessageAt: '2026-09-28 14:30', unreadCount: 2, isPinned: true, status: 'active' },
  { id: 's2', platform: 'xiaohongshu', accountId: '3', sessionPlatformId: 'u2', userNickname: '精致生活家', userAvatarUrl: '', lastMessage: '这款护肤品有链接吗', lastMessageAt: '2026-09-28 12:15', unreadCount: 1, isPinned: false, status: 'active' },
  { id: 's3', platform: 'douyin', accountId: '1', sessionPlatformId: 'u3', userNickname: '吃货张三', userAvatarUrl: '', lastMessage: '好的谢谢！', lastMessageAt: '2026-09-28 10:45', unreadCount: 0, isPinned: false, status: 'active' },
  { id: 's4', platform: 'bilibili', accountId: '6', sessionPlatformId: 'u4', userNickname: '程序员小王', userAvatarUrl: '', lastMessage: 'up主能不能出一期对比视频', lastMessageAt: '2026-09-27 20:30', unreadCount: 1, isPinned: false, status: 'active' },
  { id: 's5', platform: 'wechat', accountId: '5', sessionPlatformId: 'u5', userNickname: '职场小白', userAvatarUrl: '', lastMessage: '请问PPT模板在哪里领取', lastMessageAt: '2026-09-27 16:00', unreadCount: 0, isPinned: false, status: 'active' },
  { id: 's6', platform: 'xiaohongshu', accountId: '3', sessionPlatformId: 'u6', userNickname: '种草达人', userAvatarUrl: '', lastMessage: '已收到，谢谢～', lastMessageAt: '2026-09-27 14:20', unreadCount: 0, isPinned: false, status: 'active' },
  { id: 's7', platform: 'douyin', accountId: '2', sessionPlatformId: 'u7', userNickname: '旅行爱好者', userAvatarUrl: '', lastMessage: '大理的攻略什么时候更呀', lastMessageAt: '2026-09-26 18:50', unreadCount: 1, isPinned: false, status: 'active' },
  { id: 's8', platform: 'bilibili', accountId: '6', sessionPlatformId: 'u8', userNickname: '数码评测君', userAvatarUrl: '', lastMessage: '[图片]', lastMessageAt: '2026-09-26 15:30', unreadCount: 0, isPinned: true, status: 'active' },
  { id: 's9', platform: 'wechat', accountId: '5', sessionPlatformId: 'u9', userNickname: '努力搬砖', userAvatarUrl: '', lastMessage: '已经发你啦，注意查收', lastMessageAt: '2026-09-25 11:20', unreadCount: 0, isPinned: false, status: 'active' },
  { id: 's10', platform: 'douyin', accountId: '1', sessionPlatformId: 'u10', userNickname: '老北京人儿', userAvatarUrl: '', lastMessage: '下次来北京带你吃地道的', lastMessageAt: '2026-09-24 20:00', unreadCount: 0, isPinned: false, status: 'active' },
];

const mockMessages: Record<string, MessageItem[]> = {
  s1: [
    { id: 'm1', sessionId: 's1', direction: 'inbound', msgType: 'text', content: '你好呀，关注你很久了！', isRead: true, sentAt: '2026-09-28 14:20' },
    { id: 'm2', sessionId: 's1', direction: 'outbound', msgType: 'text', content: '你好～感谢关注！有什么可以帮你的吗？', senderAccountId: '1', isRead: true, sentAt: '2026-09-28 14:22' },
    { id: 'm3', sessionId: 's1', direction: 'inbound', msgType: 'text', content: '请问你最近发的那家火锅店具体地址在哪里呀？', isRead: true, sentAt: '2026-09-28 14:25' },
    { id: 'm4', sessionId: 's1', direction: 'outbound', msgType: 'text', content: '在朝阳区三里屯太古里南区，导航搜「辣翻天火锅」就能找到～', senderAccountId: '1', isRead: true, sentAt: '2026-09-28 14:26', failReason: 'frequency_limit' as SendFailReason },
    { id: 'm5', sessionId: 's1', direction: 'inbound', msgType: 'text', content: '你好，请问这家店的地址在哪里呀？', isRead: false, sentAt: '2026-09-28 14:30' },
  ],
  s2: [
    { id: 'm6', sessionId: 's2', direction: 'inbound', msgType: 'text', content: '博主你好，关注你好久了！', isRead: true, sentAt: '2026-09-28 10:00' },
    { id: 'm7', sessionId: 's2', direction: 'outbound', msgType: 'text', content: '谢谢宝子的喜欢～有什么想聊的吗', senderAccountId: '3', isRead: true, sentAt: '2026-09-28 10:05' },
    { id: 'm8', sessionId: 's2', direction: 'inbound', msgType: 'text', content: '这款护肤品有链接吗，想入一套试试', isRead: false, sentAt: '2026-09-28 12:15' },
  ],
  s4: [
    { id: 'm9', sessionId: 's4', direction: 'inbound', msgType: 'text', content: 'UP主你好，一直很喜欢你的视频', isRead: true, sentAt: '2026-09-27 19:00' },
    { id: 'm10', sessionId: 's4', direction: 'outbound', msgType: 'text', content: '感谢支持！有什么建议吗', senderAccountId: '6', isRead: true, sentAt: '2026-09-27 19:30', failReason: 'out_of_window' as SendFailReason },
    { id: 'm11', sessionId: 's4', direction: 'inbound', msgType: 'text', content: 'up主能不能出一期对比视频', isRead: false, sentAt: '2026-09-27 20:30' },
  ],
};

const quickReplyGroups: Record<string, QuickReply[]> = {
  '默认分组': [
    { id: 'qr1', category: '默认分组', title: '通用问候', content: '你好～感谢关注！有什么可以帮你的吗？', sortOrder: 1 },
    { id: 'qr2', category: '默认分组', title: '感谢支持', content: '谢谢你的喜欢和支持～我会继续努力的！', sortOrder: 2 },
  ],
  '问候': [
    { id: 'qr3', category: '问候', title: '新粉欢迎', content: '你好呀～欢迎来到我的主页，很高兴认识你！', sortOrder: 1 },
    { id: 'qr4', category: '问候', title: '早安问候', content: '早上好呀～新的一天也要元气满满哦！', sortOrder: 2 },
  ],
  '产品介绍': [
    { id: 'qr5', category: '产品介绍', title: '店铺地址', content: '店铺地址是朝阳区三里屯太古里南区，导航搜「辣翻天火锅」就能找到～', sortOrder: 1 },
    { id: 'qr6', category: '产品介绍', title: '价格说明', content: '具体价格因需求不同而异，可以私信详聊哦～', sortOrder: 2 },
  ],
  '售后': [
    { id: 'qr7', category: '售后', title: '退换货', content: '您好，商品支持7天无理由退换，有问题请随时联系客服～', sortOrder: 1 },
    { id: 'qr8', category: '售后', title: '物流查询', content: '您好，物流信息已同步，可以在订单详情中查看哦～', sortOrder: 2 },
  ],
};

const EngageMessagesPage = () => {
  const [selectedSession, setSelectedSession] = useState<string>('s1');
  const [inputText, setInputText] = useState('');
  const [searchText, setSearchText] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformType | 'all'>('all');
  const [groupFilter, setGroupFilter] = useState<string | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all');
  const [tab, setTab] = useState('all');
  const [sendAccount, setSendAccount] = useState('1');
  const [doubleClickSend, setDoubleClickSend] = useState(true);

  const currentSession = mockSessions.find((s) => s.id === selectedSession);
  const messages = mockMessages[selectedSession] || [];

  // 三级筛选后的账号ID集合
  const filteredAccountIds = useMemo(() => {
    let list = mockAccountList;
    if (platformFilter !== 'all') {
      list = list.filter((a) => a.platform === platformFilter);
    }
    if (groupFilter !== 'all') {
      const group = mockAccountGroups.find((g) => g.id === groupFilter);
      if (group) {
        list = list.filter((a) => a.groupName === group.groupName);
      }
    }
    if (accountFilter !== 'all') {
      list = list.filter((a) => a.id === accountFilter);
    }
    return new Set(list.map((a) => a.id));
  }, [platformFilter, groupFilter, accountFilter]);

  const filteredSessions = mockSessions.filter((s: MessageSession) => {
    if (!filteredAccountIds.has(s.accountId)) return false;
    if (tab === 'unread' && s.unreadCount === 0) return false;
    if (tab === 'pinned' && !s.isPinned) return false;
    if (searchText && !s.userNickname?.includes(searchText)) return false;
    return true;
  });

  // 当筛选变化导致当前选中会话不可见时，自动切换到第一条
  useEffect(() => {
    const stillVisible = filteredSessions.some((s) => s.id === selectedSession);
    if (!stillVisible && filteredSessions.length > 0) {
      const firstId = filteredSessions[0].id;
      setSelectedSession(firstId);
      setSendAccount(filteredSessions[0].accountId);
    }
  }, [filteredSessions, selectedSession]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    setInputText('');
  };

  const handleQuickReply = (content: string) => {
    if (doubleClickSend) {
      setInputText(content);
    } else {
      setInputText((prev) => prev + content);
    }
  };

  const samePlatformAccounts = Object.values(mockAccounts).filter(
    (a) => currentSession && a.platform === currentSession.platform
  );

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
        </div>

        <Card className="overflow-hidden">
          <div className="flex h-[calc(100vh-220px)] min-h-[600px]">
            <div className="w-[320px] border-r border-border flex flex-col shrink-0">
                <div className="p-3 space-y-2 border-b border-border">
                  <AccountSelector
                    accounts={mockAccountList}
                    groups={mockAccountGroups}
                    platform={platformFilter}
                    groupId={groupFilter}
                    accountId={accountFilter}
                    onPlatformChange={setPlatformFilter}
                    onGroupChange={setGroupFilter}
                    onAccountChange={setAccountFilter}
                    size="sm"
                    className="w-full"
                  />
                  <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索会话"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { value: 'all', label: '全部' },
                    { value: 'unread', label: '未读' },
                    { value: 'pinned', label: '置顶' },
                  ].map((t) => (
                    <Button
                      key={t.value}
                      variant={tab === t.value ? 'default' : 'ghost'}
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setTab(t.value)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredSessions.map((session: MessageSession) => {
                  const meta = platformMeta[session.platform];
                  const Icon = meta.icon;
                  const account = mockAccounts[session.accountId];
                  const isSelected = selectedSession === session.id;
                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        setSelectedSession(session.id);
                        setSendAccount(session.accountId);
                      }}
                      className={cn(
                        'flex items-start gap-3 p-3 cursor-pointer border-b border-border/50 transition-colors relative',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                      )}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                      )}
                      <div className="relative shrink-0">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={session.userAvatarUrl} />
                          <AvatarFallback>{session.userNickname?.[0]}</AvatarFallback>
                        </Avatar>
                        <div
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                          style={{ backgroundColor: meta.color }}
                        >
                          <Icon className="w-2.5 h-2.5" />
                        </div>
                        {session.isPinned && (
                          <Pin className="absolute -top-0.5 -left-0.5 w-3 h-3 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">
                            {session.userNickname}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {session.lastMessageAt?.split(' ')[1]}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mb-0.5">
                          {account?.nickname}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground truncate flex-1">
                            {session.lastMessage}
                          </p>
                          {session.unreadCount > 0 && (
                            <span className="ml-2 min-w-[18px] h-[18px] px-1 bg-destructive text-white text-[10px] rounded-full flex items-center justify-center shrink-0">
                              {session.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 border-r border-border">
              {currentSession ? (
                <>
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
                    <div className="flex items-center gap-2">
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
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <CheckCheck className="w-4 h-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem>标记已读</DropdownMenuItem>
                          <DropdownMenuItem>置顶会话</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">删除会话</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Send className="w-10 h-10 mb-2 opacity-30" />
                        <p className="text-sm">暂无消息，发送第一条私信吧</p>
                      </div>
                    ) : (
                      messages.map((msg: MessageItem) => {
                        const isOutbound = msg.direction === 'outbound';
                        const failKey = msg.failReason as SendFailReason | undefined;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[70%] ${isOutbound ? 'order-2' : 'order-1'}`}>
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
                                <div className="text-[11px] text-destructive mt-1 text-right">
                                  发送失败：{FAIL_REASON_LABELS[failKey]}
                                </div>
                              )}
                              <div className={`text-[10px] text-muted-foreground mt-1 ${isOutbound ? 'text-right' : 'text-left'}`}>
                                {msg.sentAt?.split(' ')[1]}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

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
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 ml-auto">
                        <Zap className="w-4 h-4" />
                        话术
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

            <div className="w-[280px] flex flex-col shrink-0">
              <div className="h-14 border-b border-border flex items-center justify-between px-4">
                <span className="font-medium text-sm">话术库</span>
                <div className="flex items-center gap-2">
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
                </div>
              </div>

              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">双击发送</span>
                <Switch checked={doubleClickSend} onCheckedChange={setDoubleClickSend} />
              </div>

              <div className="flex-1 overflow-y-auto">
                <Accordion type="multiple" defaultValue={['默认分组', '问候']}>
                  {Object.entries(quickReplyGroups).map(([group, items]) => (
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
                  ))}
                </Accordion>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default EngageMessagesPage;

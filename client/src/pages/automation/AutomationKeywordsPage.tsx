import { useState, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Copy,
  Info,
  AlertTriangle,
  TestTube2,
  Zap,
  CheckCircle2,
  XCircle,
  X,
  MessageSquare,
  Timer,
  MousePointerClick,
  GripVertical,
} from 'lucide-react';
import type {
  AutoReplyRule,
  PlatformType,
  PlatformAccount,
  AccountGroup,
} from '@shared/api.interface';
import AccountSelector from '@client/src/components/account/AccountSelector';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { cn } from '@/lib/utils';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Switch } from '@client/src/components/ui/switch';
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
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from '@client/src/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@client/src/components/ui/alert';
import { Check } from 'lucide-react';

const platformLabels: Record<PlatformType, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  bilibili: 'B站',
};

const matchModeLabels: Record<string, string> = {
  exact: '精确匹配',
  contains: '包含匹配',
  fuzzy: '模糊匹配',
};

const replyTypeLabels: Record<string, string> = {
  text: '文本',
  image: '图片',
};

const mockGroups: AccountGroup[] = [
  { id: 'gid1', userId: 'u1', groupName: '美食探店组', sortOrder: 1, isDefault: false, createdAt: '2026-01-01' },
  { id: 'gid2', userId: 'u1', groupName: '生活种草组', sortOrder: 2, isDefault: false, createdAt: '2026-01-02' },
  { id: 'gid3', userId: 'u1', groupName: '品牌官方组', sortOrder: 3, isDefault: true, createdAt: '2026-01-03' },
  { id: 'gid4', userId: 'u1', groupName: '科技数码组', sortOrder: 4, isDefault: false, createdAt: '2026-01-04' },
  { id: 'gid5', userId: 'u1', groupName: '时尚美妆组', sortOrder: 5, isDefault: false, createdAt: '2026-01-05' },
  { id: 'gid6', userId: 'u1', groupName: '知识科普组', sortOrder: 6, isDefault: false, createdAt: '2026-01-06' },
];

const mockAccounts: PlatformAccount[] = [
  { id: 'a1', platform: 'douyin', nickname: '美食探店小队', groupName: '美食探店组', authStatus: 'authorized', followersCount: 128000, followingCount: 320, likesCount: 2400000, postsCount: 186, healthStatus: 'normal', createdAt: '2026-01-10' },
  { id: 'a5', platform: 'douyin', nickname: '探店老王', groupName: '美食探店组', authStatus: 'authorized', followersCount: 56000, followingCount: 180, likesCount: 890000, postsCount: 92, healthStatus: 'normal', createdAt: '2026-02-15' },
  { id: 'a10', platform: 'douyin', nickname: '时尚博主Lily', groupName: '时尚美妆组', authStatus: 'authorized', followersCount: 230000, followingCount: 450, likesCount: 4500000, postsCount: 310, healthStatus: 'normal', createdAt: '2026-03-01' },
  { id: 'a2', platform: 'xiaohongshu', nickname: '生活种草日记', groupName: '生活种草组', authStatus: 'authorized', followersCount: 86000, followingCount: 210, likesCount: 1200000, postsCount: 245, healthStatus: 'normal', createdAt: '2026-01-12' },
  { id: 'a6', platform: 'xiaohongshu', nickname: '穿搭种草酱', groupName: '生活种草组', authStatus: 'authorized', followersCount: 64000, followingCount: 150, likesCount: 920000, postsCount: 178, healthStatus: 'normal', createdAt: '2026-02-20' },
  { id: 'a9', platform: 'xiaohongshu', nickname: '美妆小课堂', groupName: '时尚美妆组', authStatus: 'authorized', followersCount: 156000, followingCount: 280, likesCount: 2800000, postsCount: 260, healthStatus: 'warning', createdAt: '2026-03-10' },
  { id: 'a3', platform: 'wechat', nickname: '品牌官方号', groupName: '品牌官方组', authStatus: 'authorized', followersCount: 42000, followingCount: 80, likesCount: 560000, postsCount: 120, healthStatus: 'normal', createdAt: '2026-01-15' },
  { id: 'a7', platform: 'wechat', nickname: '官方旗舰店', groupName: '品牌官方组', authStatus: 'authorized', followersCount: 38000, followingCount: 60, likesCount: 480000, postsCount: 95, healthStatus: 'normal', createdAt: '2026-02-25' },
  { id: 'a12', platform: 'wechat', nickname: '科普中国', groupName: '知识科普组', authStatus: 'authorized', followersCount: 28000, followingCount: 45, likesCount: 320000, postsCount: 140, healthStatus: 'normal', createdAt: '2026-03-20' },
  { id: 'a4', platform: 'bilibili', nickname: '科技UP主', groupName: '科技数码组', authStatus: 'authorized', followersCount: 98000, followingCount: 120, likesCount: 1600000, postsCount: 210, healthStatus: 'normal', createdAt: '2026-01-18' },
  { id: 'a8', platform: 'bilibili', nickname: '数码测评君', groupName: '科技数码组', authStatus: 'expired', followersCount: 72000, followingCount: 95, likesCount: 1100000, postsCount: 165, healthStatus: 'error', createdAt: '2026-03-05' },
  { id: 'a11', platform: 'bilibili', nickname: '知识大爆炸', groupName: '知识科普组', authStatus: 'authorized', followersCount: 54000, followingCount: 70, likesCount: 780000, postsCount: 130, healthStatus: 'normal', createdAt: '2026-03-15' },
];

const mockRules: AutoReplyRule[] = [
  { id: 'r1', ruleType: 'keyword', ruleName: '店铺地址询问', platform: 'douyin', accountId: 'a1', keywords: ['地址', '在哪', '位置', '怎么走'], matchMode: 'contains', replyContent: '店铺地址是朝阳区三里屯太古里南区，导航搜「辣翻天火锅」就能找到～营业时间11:00-22:00', replyType: 'text', priority: 9, isEnabled: true, hitCount: 256, createdAt: '2026-08-15 10:30' },
  { id: 'r2', ruleType: 'keyword', ruleName: '价格咨询', platform: 'douyin', accountId: 'a1', keywords: ['多少钱', '价格', '贵吗', '人均'], matchMode: 'contains', replyContent: '人均大概150元左右，性价比超高的～现在还有团购套餐更划算', replyType: 'text', priority: 7, isEnabled: true, hitCount: 186, createdAt: '2026-08-20 14:20' },
  { id: 'r3', ruleType: 'keyword', ruleName: '商务合作', platform: 'xiaohongshu', accountId: 'a2', keywords: ['合作', '商务', '推广', '广告'], matchMode: 'contains', replyContent: '商务合作请发详细方案至邮箱：business@example.com，我们会在24小时内回复', replyType: 'text', priority: 5, isEnabled: true, hitCount: 73, createdAt: '2026-09-01 09:15' },
  { id: 'r4', ruleType: 'keyword', ruleName: '新品上市图', platform: 'xiaohongshu', accountId: 'a2', keywords: ['新品', '上新', '新款'], matchMode: 'contains', replyContent: '新品已上架，点击主页商品橱窗查看更多', replyType: 'image', replyMediaUrl: '', priority: 6, isEnabled: true, hitCount: 142, createdAt: '2026-09-05 16:40' },
  { id: 'r5', ruleType: 'keyword', ruleName: '售后客服', platform: 'wechat', accountId: 'a3', keywords: ['客服', '售后', '退款', '退货'], matchMode: 'contains', replyContent: '您好，售后问题请联系在线客服，工作时间9:00-21:00，我们会尽快为您处理', replyType: 'text', priority: 8, isEnabled: true, hitCount: 95, createdAt: '2026-09-08 11:00' },
  { id: 'r6', ruleType: 'keyword', ruleName: '感谢关注', platform: 'bilibili', accountId: 'a4', keywords: ['你好', 'hi', '在吗', 'up主'], matchMode: 'fuzzy', replyContent: '你好呀～感谢关注！有什么问题可以直接问哦，看到会尽快回复哒', replyType: 'text', priority: 1, isEnabled: false, hitCount: 0, createdAt: '2026-09-10 20:10' },
  { id: 'r7', ruleType: 'keyword', ruleName: '预约咨询', platform: 'douyin', accountId: 'a1', keywords: ['预约', '订座', '订位', '排队'], matchMode: 'exact', replyContent: '可以拨打预约电话400-888-8888，或通过主页「预约」按钮在线订座', replyType: 'text', priority: 8, isEnabled: true, hitCount: 67, createdAt: '2026-09-12 13:25' },
];

const AutomationKeywordsPage = () => {
  const [rules, setRules] = useState<AutoReplyRule[]>(mockRules);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformType | 'all'>('all');
  const [groupFilter, setGroupFilter] = useState<string | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  // 新建/编辑弹窗内的账号选择
  const [rulePlatform, setRulePlatform] = useState<PlatformType | 'all'>('douyin');
  const [ruleGroup, setRuleGroup] = useState<string | 'all'>('all');
  const [ruleAccount, setRuleAccount] = useState<string | 'all'>('a1');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [replyType, setReplyType] = useState<'text' | 'image'>('text');
  const [testOpen, setTestOpen] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<{ matched: boolean; ruleName?: string; reply?: string } | null>(null);
  const [sortBy, setSortBy] = useState('priority');
  const [multiTurnEnabled, setMultiTurnEnabled] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [matchMode, setMatchMode] = useState('contains');
  const [priority, setPriority] = useState('5');
  const [replyContent, setReplyContent] = useState('');
  const [replyMediaUrl, setReplyMediaUrl] = useState('');
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 2500);
  };

  interface MultiTurnRound {
    id: string;
    trigger: 'keyword' | 'button' | 'timeout';
    keywords: string[];
    keywordInput: string;
    replyType: 'text' | 'image';
    replyContent: string;
    replyMediaUrl: string;
    delaySeconds: number;
  }

  const [multiTurnRounds, setMultiTurnRounds] = useState<MultiTurnRound[]>([
    { id: 'r1', trigger: 'keyword', keywords: [], keywordInput: '', replyType: 'text', replyContent: '', replyMediaUrl: '', delaySeconds: 3 },
  ]);

  const addRound = () => {
    if (multiTurnRounds.length >= 5) return;
    setMultiTurnRounds([
      ...multiTurnRounds,
      {
        id: `r${Date.now()}`,
        trigger: 'keyword',
        keywords: [],
        keywordInput: '',
        replyType: 'text',
        replyContent: '',
        replyMediaUrl: '',
        delaySeconds: 3,
      },
    ]);
  };

  const removeRound = (id: string) => {
    if (multiTurnRounds.length <= 1) return;
    setMultiTurnRounds(multiTurnRounds.filter((r) => r.id !== id));
  };

  const updateRound = (id: string, patch: Partial<MultiTurnRound>) => {
    setMultiTurnRounds(multiTurnRounds.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRoundKeyword = (roundId: string) => {
    const round = multiTurnRounds.find((r) => r.id === roundId);
    if (!round) return;
    const val = round.keywordInput.trim();
    if (val && !round.keywords.includes(val)) {
      updateRound(roundId, { keywords: [...round.keywords, val], keywordInput: '' });
    }
  };

  const removeRoundKeyword = (roundId: string, kw: string) => {
    const round = multiTurnRounds.find((r) => r.id === roundId);
    if (!round) return;
    updateRound(roundId, { keywords: round.keywords.filter((k) => k !== kw) });
  };

  const addKeyword = () => {
    const val = keywordInput.trim();
    if (val && !keywords.includes(val)) {
      setKeywords([...keywords, val]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const toggleRule = (id: string) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r)));
  };

  const openCreateDialog = () => {
    setEditingRule(null);
    setRuleName('');
    setKeywords([]);
    setKeywordInput('');
    setReplyType('text');
    setReplyContent('');
    setReplyMediaUrl('');
    setMatchMode('contains');
    setPriority('5');
    setRulePlatform('douyin');
    setRuleGroup('all');
    setRuleAccount('a1');
    setMultiTurnEnabled(false);
    setMultiTurnRounds([
      { id: 'r1', trigger: 'keyword', keywords: [], keywordInput: '', replyType: 'text', replyContent: '', replyMediaUrl: '', delaySeconds: 3 },
    ]);
    setDialogOpen(true);
  };

  const openEditDialog = (rule: AutoReplyRule) => {
    setEditingRule(rule);
    setRuleName(rule.ruleName);
    setKeywords(rule.keywords || []);
    setKeywordInput('');
    setReplyType((rule.replyType as 'text' | 'image') || 'text');
    setReplyContent(rule.replyContent || '');
    setReplyMediaUrl(rule.replyMediaUrl || '');
    setMatchMode(rule.matchMode || 'contains');
    setPriority(String(rule.priority || 5));
    setRulePlatform(rule.platform || 'douyin');
    setRuleAccount(rule.accountId || 'a1');
    setMultiTurnEnabled(false);
    setDialogOpen(true);
  };

  const handleSaveRule = () => {
    if (!ruleName.trim()) {
      showToast('请输入规则名称', 'error');
      return;
    }
    if (keywords.length === 0) {
      showToast('请至少添加一个关键词', 'error');
      return;
    }
    if (replyType === 'text' && !replyContent.trim()) {
      showToast('请输入回复内容', 'error');
      return;
    }
    if (editingRule) {
      setRules(rules.map((r) =>
        r.id === editingRule.id
          ? {
              ...r,
              ruleName: ruleName.trim(),
              keywords: [...keywords],
              matchMode: matchMode as any,
              priority: Number(priority),
              replyType: replyType as any,
              replyContent: replyContent.trim(),
              replyMediaUrl,
              platform: rulePlatform as PlatformType,
              accountId: ruleAccount,
            }
          : r
      ));
      showToast('规则已更新');
    } else {
      const newRule: AutoReplyRule = {
        id: `r${Date.now()}`,
        ruleType: 'keyword',
        ruleName: ruleName.trim(),
        platform: rulePlatform as PlatformType,
        accountId: ruleAccount,
        keywords: [...keywords],
        matchMode: matchMode as any,
        replyContent: replyContent.trim(),
        replyType: replyType as any,
        replyMediaUrl,
        priority: Number(priority),
        isEnabled: true,
        hitCount: 0,
        createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      };
      setRules([newRule, ...rules]);
      showToast('规则创建成功');
    }
    setDialogOpen(false);
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
    if (expandedRuleId === id) setExpandedRuleId(null);
    showToast('规则已删除');
  };

  const handleCopyRule = (rule: AutoReplyRule) => {
    const newRule: AutoReplyRule = {
      ...rule,
      id: `r${Date.now()}`,
      ruleName: `${rule.ruleName} - 副本`,
      isEnabled: false,
      hitCount: 0,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
    };
    setRules([newRule, ...rules]);
    showToast('规则已复制');
  };

  const toggleExpand = (id: string) => {
    setExpandedRuleId(expandedRuleId === id ? null : id);
  };

  const totalHitToday = rules.reduce((s, r) => s + Math.floor(r.hitCount * 0.08), 0);

  const runRuleTest = () => {
    if (!testMessage.trim()) {
      setTestResult(null);
      return;
    }
    // Simple mock: find first enabled keyword rule that matches
    const keywordRules = rules.filter((r) => r.ruleType === 'keyword' && r.isEnabled && r.keywords && r.keywords.length > 0);
    for (const rule of keywordRules) {
      if (rule.keywords?.some((kw) => testMessage.includes(kw))) {
        setTestResult({
          matched: true,
          ruleName: rule.ruleName,
          reply: rule.replyContent || '（已匹配，回复内容按规则配置）',
        });
        return;
      }
    }
    // Check welcome
    const welcome = rules.find((r) => r.ruleType === 'welcome' && r.isEnabled);
    if (testMessage.includes('关注') || testMessage.includes('你好')) {
      setTestResult({
        matched: true,
        ruleName: welcome?.ruleName || '关注欢迎语',
        reply: welcome?.replyContent || '欢迎关注～',
      });
      return;
    }
    setTestResult({ matched: false });
  };

  const filteredRules = useMemo(() => {
    let result = rules.filter((rule) => {
      if (platformFilter !== 'all' && rule.platform !== platformFilter) return false;
      if (accountFilter !== 'all' && rule.accountId !== accountFilter) return false;
      if (statusFilter !== 'all') {
        const enabled = statusFilter === 'enabled';
        if (rule.isEnabled !== enabled) return false;
      }
      if (search && !rule.ruleName.includes(search) && !rule.keywords?.some((k: string) => k.includes(search))) return false;
      return true;
    });
    // 排序
    result = result.slice().sort((a, b) => {
      if (sortBy === 'priority') return b.priority - a.priority;
      if (sortBy === 'hitCount') return b.hitCount - a.hitCount;
      if (sortBy === 'createdAt') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      return 0;
    });
    return result;
  }, [rules, platformFilter, accountFilter, statusFilter, search, sortBy]);

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <Info className="w-4 h-4" />
        <AlertDescription>
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle className="font-semibold">合规提醒</AlertTitle>
        <AlertDescription>
          自动回复仅限已授权自有账号且在平台允许范围内使用，关键词回复为被动响应用户发起的私信，不支持主动群发或营销骚扰。
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">关键词回复</h1>
          <p className="text-sm text-muted-foreground mt-1">智能关键词匹配与多轮对话自动回复</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] h-5 gap-1 border-[hsl(130_54%_42%)]/30 text-[hsl(130_54%_42%)]">
            <Zap className="w-3 h-3" />
            今日命中 {totalHitToday} 次
          </Badge>
          <Badge variant="outline" className="text-[10px] h-5 gap-1">
            总命中 {rules.reduce((s, r) => s + r.hitCount, 0).toLocaleString()} 次
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索规则名称或关键词"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <AccountSelector
          accounts={mockAccounts}
          groups={mockGroups}
          platform={platformFilter}
          groupId={groupFilter}
          accountId={accountFilter}
          onPlatformChange={setPlatformFilter}
          onGroupChange={setGroupFilter}
          onAccountChange={setAccountFilter}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="enabled">已启用</SelectItem>
            <SelectItem value="disabled">已停用</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">按优先级</SelectItem>
              <SelectItem value="hitCount">按命中数</SelectItem>
              <SelectItem value="createdAt">按创建时间</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={testOpen} onOpenChange={setTestOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <TestTube2 className="w-4 h-4 mr-1" />
                规则测试
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base">规则测试</DialogTitle>
                <DialogDescription>
                  输入模拟用户消息，测试哪条规则会被命中
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">模拟用户消息</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="输入用户消息内容..."
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runRuleTest()}
                    />
                    <Button onClick={runRuleTest}>测试</Button>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {['你好', '价格多少', '怎么买', '地址在哪'].map((text) => (
                      <Button
                        key={text}
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => setTestMessage(text)}
                      >
                        {text}
                      </Button>
                    ))}
                  </div>
                </div>

                {testResult && (
                  <div
                    className={cn(
                      'rounded-lg p-4 border',
                      testResult.matched
                        ? 'bg-[hsl(130_54%_42%)]/5 border-[hsl(130_54%_42%)]/20'
                        : 'bg-muted/50 border-border'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.matched ? (
                        <CheckCircle2 className="w-4 h-4 text-[hsl(130_54%_42%)]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">
                        {testResult.matched ? `命中规则：${testResult.ruleName}` : '未命中任何规则'}
                      </span>
                    </div>
                    {testResult.matched && testResult.reply && (
                      <div className="bg-white border border-border rounded-lg p-3 ml-6 text-sm">
                        <div className="text-xs text-muted-foreground mb-1">回复内容：</div>
                        <div className="text-foreground">{testResult.reply}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTestOpen(false)}>关闭</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
           <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
           <DialogTrigger asChild>
             <Button onClick={openCreateDialog}>
               <Plus className="w-4 h-4 mr-1" />
               新建规则
             </Button>
           </DialogTrigger>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新建关键词回复规则</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
               <div>
                 <label className="text-sm font-medium mb-1.5 block">规则名称</label>
                 <Input
                   placeholder="请输入规则名称"
                   value={ruleName}
                   onChange={(e) => setRuleName(e.target.value)}
                 />
               </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">选择生效账号</label>
                <AccountSelector
                  accounts={mockAccounts}
                  groups={mockGroups}
                  platform={rulePlatform}
                  groupId={ruleGroup}
                  accountId={ruleAccount}
                  onPlatformChange={setRulePlatform}
                  onGroupChange={setRuleGroup}
                  onAccountChange={setRuleAccount}
                  size="sm"
                  showAllOption={false}
                  placeholderAccount="请选择账号"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">关键词（回车添加）</label>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  {keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="gap-1">
                      {kw}
                      <button onClick={() => removeKeyword(kw)} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  placeholder="输入关键词后回车添加"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="text-sm font-medium mb-1.5 block">匹配模式</label>
                   <Select value={matchMode} onValueChange={setMatchMode}>
                     <SelectTrigger><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="exact">精确匹配</SelectItem>
                       <SelectItem value="contains">包含匹配</SelectItem>
                       <SelectItem value="fuzzy">模糊匹配</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <label className="text-sm font-medium mb-1.5 block">优先级</label>
                   <Select value={priority} onValueChange={setPriority}>
                     <SelectTrigger><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="1">1（最低）</SelectItem>
                       <SelectItem value="3">3</SelectItem>
                       <SelectItem value="5">5</SelectItem>
                       <SelectItem value="7">7</SelectItem>
                       <SelectItem value="9">9（最高）</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">回复类型</label>
                <div className="flex gap-2">
                  <Button
                    variant={replyType === 'text' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setReplyType('text')}
                    type="button"
                  >
                    文本
                  </Button>
                  <Button
                    variant={replyType === 'image' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setReplyType('image')}
                    type="button"
                  >
                    图片
                  </Button>
                </div>
              </div>
               {replyType === 'text' ? (
                 <div>
                   <label className="text-sm font-medium mb-1.5 block">回复内容</label>
                   <Textarea
                     placeholder="请输入回复内容"
                     className="min-h-[100px] resize-none"
                     value={replyContent}
                     onChange={(e) => setReplyContent(e.target.value)}
                   />
                 </div>
              ) : (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">回复图片</label>
                  <div className="border border-dashed border-border rounded-lg h-32 flex items-center justify-center text-muted-foreground text-sm">
                    点击上传图片
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1.5 block">生效时段</label>
                <div className="flex items-center gap-2">
                  <Input type="time" defaultValue="09:00" className="w-28" />
                  <span className="text-muted-foreground text-sm">至</span>
                  <Input type="time" defaultValue="22:00" className="w-28" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">仅在此时段内生效，留空表示全天</p>
              </div>
              {/* 多轮对话 */}
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">多轮对话</span>
                    <Badge variant="outline" className="text-[10px] h-5 text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/30">
                      最多 5 轮
                    </Badge>
                  </div>
                  <Switch checked={multiTurnEnabled} onCheckedChange={setMultiTurnEnabled} />
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  开启后用户按流程触发多轮回复，单轮回复作为首轮响应
                </p>
                {multiTurnEnabled && (
                  <div className="space-y-3">
                    {multiTurnRounds.map((round, idx) => (
                      <div key={round.id} className="border border-border rounded-lg p-3 bg-muted/20">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded">
                              第 {idx + 2} 轮
                            </span>
                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                          </div>
                          {multiTurnRounds.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-destructive"
                              onClick={() => removeRound(round.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>

                        {/* 触发条件 */}
                        <div className="mb-3">
                          <label className="text-xs text-muted-foreground mb-1.5 block">触发条件</label>
                          <div className="flex gap-2">
                            {(['keyword', 'button', 'timeout'] as const).map((t) => {
                              const iconMap = { keyword: MessageSquare, button: MousePointerClick, timeout: Timer };
                              const labelMap = { keyword: '关键词触发', button: '点击按钮', timeout: '超时触发' };
                              const Icon = iconMap[t];
                              return (
                                <Button
                                  key={t}
                                  variant={round.trigger === t ? 'default' : 'outline'}
                                  size="sm"
                                  className="flex-1 h-7 text-xs"
                                  onClick={() => updateRound(round.id, { trigger: t })}
                                  type="button"
                                >
                                  <Icon className="w-3 h-3" />
                                  {labelMap[t]}
                                </Button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 关键词输入（仅关键词触发） */}
                        {round.trigger === 'keyword' && (
                          <div className="mb-3">
                            <label className="text-xs text-muted-foreground mb-1.5 block">关键词（回车添加）</label>
                            <div className="flex flex-wrap gap-1 mb-1.5 min-h-[24px]">
                              {round.keywords.map((kw) => (
                                <Badge key={kw} variant="secondary" className="text-[10px] h-5 gap-1">
                                  {kw}
                                  <button onClick={() => removeRoundKeyword(round.id, kw)} className="hover:text-destructive">
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                            <Input
                              size={1}
                              placeholder="输入关键词后回车添加"
                              className="h-8 text-sm"
                              value={round.keywordInput}
                              onChange={(e) => updateRound(round.id, { keywordInput: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addRoundKeyword(round.id);
                                }
                              }}
                            />
                          </div>
                        )}

                        {/* 超时秒数（仅超时触发） */}
                        {round.trigger === 'timeout' && (
                          <div className="mb-3">
                            <label className="text-xs text-muted-foreground mb-1.5 block">超时时间（秒）</label>
                            <Input
                              type="number"
                              className="h-8"
                              defaultValue={60}
                              min={10}
                              max={3600}
                            />
                          </div>
                        )}

                        {/* 回复类型 */}
                        <div className="mb-3">
                          <label className="text-xs text-muted-foreground mb-1.5 block">回复类型</label>
                          <div className="flex gap-2">
                            <Button
                              variant={round.replyType === 'text' ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => updateRound(round.id, { replyType: 'text' })}
                              type="button"
                            >
                              文本
                            </Button>
                            <Button
                              variant={round.replyType === 'image' ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => updateRound(round.id, { replyType: 'image' })}
                              type="button"
                            >
                              图片
                            </Button>
                          </div>
                        </div>

                        {/* 回复内容 */}
                        {round.replyType === 'text' ? (
                          <div className="mb-3">
                            <label className="text-xs text-muted-foreground mb-1.5 block">回复内容</label>
                            <Textarea
                              placeholder="请输入本轮回复内容"
                              className="min-h-[60px] resize-none text-sm"
                              value={round.replyContent}
                              onChange={(e) => updateRound(round.id, { replyContent: e.target.value })}
                            />
                          </div>
                        ) : (
                          <div className="mb-3">
                            <label className="text-xs text-muted-foreground mb-1.5 block">回复图片</label>
                            <div className="border border-dashed border-border rounded-lg h-20 flex items-center justify-center text-muted-foreground text-xs">
                              点击上传图片
                            </div>
                          </div>
                        )}

                        {/* 延迟时间 */}
                        <div>
                          <label className="text-xs text-muted-foreground mb-1.5 block">延迟发送（秒）</label>
                          <Select
                            value={String(round.delaySeconds)}
                            onValueChange={(v) => updateRound(round.id, { delaySeconds: Number(v) })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">立即发送</SelectItem>
                              <SelectItem value="3">延迟 3 秒</SelectItem>
                              <SelectItem value="5">延迟 5 秒</SelectItem>
                              <SelectItem value="10">延迟 10 秒</SelectItem>
                              <SelectItem value="30">延迟 30 秒</SelectItem>
                              <SelectItem value="60">延迟 60 秒</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {multiTurnRounds.length < 5 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-dashed"
                        onClick={addRound}
                        type="button"
                      >
                        <Plus className="w-4 h-4" />
                        添加下一轮（还可添加 {5 - multiTurnRounds.length} 轮）
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm font-medium">启用规则</span>
                <Switch defaultChecked />
              </div>
            </div>
             <DialogFooter>
               <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
               <Button onClick={handleSaveRule}>
                 {editingRule ? '保存修改' : '保存规则'}
               </Button>
             </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>规则名称</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>关键词</TableHead>
                <TableHead>匹配模式</TableHead>
                <TableHead>回复类型</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>命中次数</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
               {filteredRules.map((rule) => (
                 <>
                   <TableRow
                     key={rule.id}
                     className="cursor-pointer hover:bg-muted/30"
                     onClick={() => toggleExpand(rule.id)}
                   >
                     <TableCell className="font-medium">{rule.ruleName}</TableCell>
                     <TableCell>
                       <Badge variant="outline">{rule.platform ? platformLabels[rule.platform] : '-'}</Badge>
                     </TableCell>
                     <TableCell>
                       <div className="flex flex-wrap gap-1 max-w-[200px]">
                         {rule.keywords?.slice(0, 3).map((kw, i) => (
                           <Badge key={i} variant="secondary" className="text-[10px] h-5">{kw}</Badge>
                         ))}
                         {rule.keywords && rule.keywords.length > 3 && (
                           <Badge variant="outline" className="text-[10px] h-5">+{rule.keywords.length - 3}</Badge>
                         )}
                       </div>
                     </TableCell>
                     <TableCell>{matchModeLabels[rule.matchMode]}</TableCell>
                     <TableCell>{replyTypeLabels[rule.replyType]}</TableCell>
                     <TableCell>{rule.priority}</TableCell>
                     <TableCell onClick={(e) => e.stopPropagation()}>
                       <Switch checked={rule.isEnabled} onCheckedChange={() => toggleRule(rule.id)} />
                     </TableCell>
                     <TableCell>{rule.hitCount}</TableCell>
                     <TableCell className="text-muted-foreground">{rule.createdAt}</TableCell>
                     <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                       <div className="flex justify-end gap-1">
                         <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEditDialog(rule)} title="编辑">
                           <Edit3 className="w-3.5 h-3.5" />
                         </Button>
                         <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleCopyRule(rule)} title="复制">
                           <Copy className="w-3.5 h-3.5" />
                         </Button>
                         <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => handleDeleteRule(rule.id)} title="删除">
                           <Trash2 className="w-3.5 h-3.5" />
                         </Button>
                       </div>
                     </TableCell>
                   </TableRow>
                   {expandedRuleId === rule.id && (
                     <TableRow key={`${rule.id}-detail`} className="bg-muted/20">
                       <TableCell colSpan={10} className="py-3">
                         <div className="px-4 space-y-2 text-sm">
                           <div className="grid grid-cols-2 gap-4">
                             <div>
                               <span className="text-muted-foreground text-xs">回复内容：</span>
                               <div className="mt-1 p-3 bg-white border border-border rounded-md text-xs leading-relaxed whitespace-pre-wrap">
                                 {rule.replyContent || '（无文本内容）'}
                               </div>
                             </div>
                             <div className="space-y-2">
                               <div>
                                 <span className="text-muted-foreground text-xs">命中统计：</span>
                                 <span className="ml-2 font-medium">{rule.hitCount} 次</span>
                               </div>
                               <div>
                                 <span className="text-muted-foreground text-xs">创建时间：</span>
                                 <span className="ml-2">{rule.createdAt}</span>
                               </div>
                               <div>
                                 <span className="text-muted-foreground text-xs">优先级：</span>
                                 <span className="ml-2">{rule.priority}</span>
                               </div>
                               <div>
                                 <span className="text-muted-foreground text-xs">匹配模式：</span>
                                 <span className="ml-2">{matchModeLabels[rule.matchMode]}</span>
                               </div>
                             </div>
                           </div>
                         </div>
                       </TableCell>
                     </TableRow>
                   )}
                 </>
               ))}
            </TableBody>
          </Table>
        </CardContent>
       </Card>

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

export default AutomationKeywordsPage;

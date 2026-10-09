import { useState } from 'react';
import {
  MessageSquarePlus,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  Play,
  Pause,
  BarChart3,
  Zap,
  Clock,
  Shield,
  Settings,
  X,
  Check,
  ChevronRight,
  Target,
  Eye,
} from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@client/src/components/ui/alert';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import { Switch } from '@client/src/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import { Checkbox } from '@client/src/components/ui/checkbox';
import type { AutoReplyRule, PlatformType } from '@shared/api.interface';
import { mockAutoCommentRules, mockAccounts, platformMeta } from './engage-data';
import { cn } from '@/lib/utils';

const matchModeLabels: Record<string, string> = {
  exact: '精确匹配',
  contains: '包含匹配',
  fuzzy: '模糊匹配',
};

interface RuleForm {
  ruleName: string;
  accountIds: string[];
  matchMode: 'exact' | 'contains' | 'fuzzy';
  keywords: string;
  replyContent: string;
  timeStart: string;
  timeEnd: string;
  freqHour: number;
  freqDay: number;
  intervalMin: number;
  intervalMax: number;
  sensitiveCheck: boolean;
  isEnabled: boolean;
}

const emptyForm: RuleForm = {
  ruleName: '',
  accountIds: [],
  matchMode: 'contains',
  keywords: '',
  replyContent: '',
  timeStart: '09:00',
  timeEnd: '22:00',
  freqHour: 30,
  freqDay: 200,
  intervalMin: 30,
  intervalMax: 120,
  sensitiveCheck: true,
  isEnabled: true,
};

const EngageAutoCommentPage = () => {
  const [rules, setRules] = useState<AutoReplyRule[]>(mockAutoCommentRules);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [hitDialogOpen, setHitDialogOpen] = useState(false);
  const [hitRuleId, setHitRuleId] = useState('');
  const [testTab, setTestTab] = useState('form');
  const [testContent, setTestContent] = useState('');
  const [testResult, setTestResult] = useState<{ hit: boolean; matchedRule?: AutoReplyRule; matchedKeyword?: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState('');

  const handleAdd = () => {
    setEditingRule(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleEdit = (rule: AutoReplyRule) => {
    setEditingRule(rule);
    setForm({
      ruleName: rule.ruleName,
      accountIds: rule.accountId ? [rule.accountId] : [],
      matchMode: rule.matchMode,
      keywords: (rule.keywords || []).join('、'),
      replyContent: rule.replyContent || '',
      timeStart: '09:00',
      timeEnd: '22:00',
      freqHour: 30,
      freqDay: 200,
      intervalMin: 30,
      intervalMax: 120,
      sensitiveCheck: true,
      isEnabled: rule.isEnabled,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    setDialogOpen(false);
  };

  const toggleRule = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r))
    );
  };

  const viewHits = (id: string) => {
    setHitRuleId(id);
    setHitDialogOpen(true);
  };

  const runTest = () => {
    const trimmed = testContent.trim();
    if (!trimmed) {
      setTestResult(null);
      return;
    }
    for (const rule of rules) {
      if (!rule.isEnabled || !rule.keywords || rule.keywords.length === 0) continue;
      for (const kw of rule.keywords) {
        if (rule.matchMode === 'exact' && trimmed === kw) {
          setTestResult({ hit: true, matchedRule: rule, matchedKeyword: kw });
          return;
        }
        if (rule.matchMode === 'contains' && trimmed.includes(kw)) {
          setTestResult({ hit: true, matchedRule: rule, matchedKeyword: kw });
          return;
        }
        if (rule.matchMode === 'fuzzy') {
          // simple fuzzy: check if any character overlap is high enough
          const kwChars = new Set(kw);
          let hits = 0;
          for (const ch of trimmed) {
            if (kwChars.has(ch)) hits++;
          }
          if (hits / kw.length > 0.6) {
            setTestResult({ hit: true, matchedRule: rule, matchedKeyword: kw });
            return;
          }
        }
      }
    }
    setTestResult({ hit: false });
  };

  const currentRule = rules.find((r) => r.id === hitRuleId);
  const mockHitRecords = currentRule
    ? Array.from({ length: 8 }, (_, i) => ({
        id: `hr-${i}`,
        commenter: `用户${i + 100}`,
        content: `请问${currentRule.keywords?.[0] || '地址'}在哪里呀`,
        hitKeyword: currentRule.keywords?.[i % (currentRule.keywords?.length || 1)] || '',
        repliedAt: `2026-09-${28 - Math.floor(i / 3)} ${20 - i}:${String(i * 7).padStart(2, '0')}`,
        status: i % 5 === 0 ? 'failed' : 'success',
      }))
    : [];

  return (
    <div className="p-0 space-y-4">
      {/* Compliance Warning */}
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle className="font-medium">合规警示</AlertTitle>
        <AlertDescription className="text-xs">
          自动评论仅适用于您自有矩阵账号下的作品评论回复，不支持去陌生人/热门作品下发广告评论。所有操作受平台频控限制，请合理设置频率避免账号被限。
        </AlertDescription>
      </Alert>

      <Alert variant="warning">
        <AlertTriangle className="w-4 h-4" />
        <AlertDescription>
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">自动评论规则</h1>
          <Badge variant="secondary" className="gap-1">
            <Zap className="w-3 h-3" />
            {rules.length} 条规则
          </Badge>
        </div>
        <Button className="gap-1" onClick={handleAdd}>
          <Plus className="w-4 h-4" />
          新建规则
        </Button>
      </div>

      {/* Rule Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">规则名称</TableHead>
                <TableHead className="w-[100px]">匹配方式</TableHead>
                <TableHead>关键词</TableHead>
                <TableHead className="w-[200px]">回复内容预览</TableHead>
                <TableHead className="w-[140px]">生效账号</TableHead>
                <TableHead className="w-[80px]">状态</TableHead>
                <TableHead className="w-[80px]">命中次数</TableHead>
                <TableHead className="text-right w-[200px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule: AutoReplyRule) => {
                const account = rule.accountId ? mockAccounts[rule.accountId] : null;
                return (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.ruleName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {matchModeLabels[rule.matchMode]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rule.keywords?.slice(0, 3).map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] h-5">
                            {kw}
                          </Badge>
                        ))}
                        {rule.keywords && rule.keywords.length > 3 && (
                          <Badge variant="outline" className="text-[10px] h-5">
                            +{rule.keywords.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground line-clamp-2 max-w-[200px]">
                        {rule.replyContent}
                      </div>
                    </TableCell>
                    <TableCell>
                      {account ? (
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: platformMeta[account.platform].color }}
                          />
                          <span className="text-xs">{account.nickname}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">全部账号</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.isEnabled}
                          onCheckedChange={() => toggleRule(rule.id)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn('text-sm font-medium', rule.hitCount > 0 && 'text-primary')}>
                        {rule.hitCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => viewHits(rule.id)}>
                          <BarChart3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(rule)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleRule(rule.id)}
                        >
                          {rule.isEnabled ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => { setDeleteId(rule.id); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Test Panel */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">规则测试</span>
            <span className="text-xs text-muted-foreground">输入评论内容，测试是否会命中规则</span>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Textarea
                placeholder="输入评论内容进行测试..."
                value={testContent}
                onChange={(e) => setTestContent(e.target.value)}
                className="min-h-[60px] text-sm resize-none"
              />
            </div>
            <Button onClick={runTest} className="gap-1">
              <Zap className="w-4 h-4" />
              开始测试
            </Button>
          </div>
          {testResult && (
            <div className={cn(
              'mt-3 p-3 rounded-lg text-sm',
              testResult.hit
                ? 'bg-[hsl(130_54%_42%)]/10 border border-[hsl(130_54%_42%)]/30 text-[hsl(130_54%_42%)]'
                : 'bg-muted/50 border border-border text-muted-foreground'
            )}>
              {testResult.hit ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <Check className="w-4 h-4" />
                    命中规则：{testResult.matchedRule?.ruleName}
                  </div>
                  <div className="text-xs">
                    匹配关键词：<Badge variant="secondary">{testResult.matchedKeyword}</Badge>
                  </div>
                  <div className="text-xs">
                    回复内容：{testResult.matchedRule?.replyContent}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <X className="w-4 h-4" />
                  未命中任何规则
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? '编辑规则' : '新建自动评论规则'}</DialogTitle>
            <DialogDescription className="text-xs text-destructive">
              ⚠️ 请遵守各平台社区规范，仅对自有账号作品的评论进行自动回复
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="basic" className="flex-1">基本信息</TabsTrigger>
              <TabsTrigger value="trigger" className="flex-1">触发条件</TabsTrigger>
              <TabsTrigger value="reply" className="flex-1">回复内容</TabsTrigger>
              <TabsTrigger value="freq" className="flex-1">频率控制</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">规则名称</label>
                <Input
                  placeholder="请输入规则名称"
                  value={form.ruleName}
                  onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">生效账号（仅自有矩阵账号）</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(mockAccounts).map((a) => (
                    <label
                      key={a.id}
                      className={cn(
                        'flex items-center gap-2 p-2 border rounded-lg cursor-pointer text-sm',
                        form.accountIds.includes(a.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <Checkbox
                        checked={form.accountIds.includes(a.id)}
                        onCheckedChange={(checked) => {
                          setForm({
                            ...form,
                            accountIds: checked
                              ? [...form.accountIds, a.id]
                              : form.accountIds.filter((id) => id !== a.id),
                          });
                        }}
                      />
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: platformMeta[a.platform].color }}
                      />
                      <span className="truncate">{a.nickname}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[hsl(130_54%_42%)]" />
                  <span className="text-sm">启用规则</span>
                </div>
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={(v) => setForm({ ...form, isEnabled: v })}
                />
              </div>
            </TabsContent>

            <TabsContent value="trigger" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">匹配方式</label>
                <Select
                  value={form.matchMode}
                  onValueChange={(v: 'exact' | 'contains' | 'fuzzy') => setForm({ ...form, matchMode: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">精确匹配（评论完全等于关键词）</SelectItem>
                    <SelectItem value="contains">包含匹配（评论包含关键词）</SelectItem>
                    <SelectItem value="fuzzy">模糊匹配（容错匹配，相似度匹配）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  关键词 <span className="text-xs text-muted-foreground">（多个用、分隔）</span>
                </label>
                <Textarea
                  placeholder="例如：地址、多少钱、在哪里"
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  className="min-h-[80px] resize-none"
                />
              </div>
              <div className="p-3 bg-muted/30 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[hsl(26_90%_49%)]" />
                  <span className="text-sm">敏感词拦截</span>
                </div>
                <Switch
                  checked={form.sensitiveCheck}
                  onCheckedChange={(v) => setForm({ ...form, sensitiveCheck: v })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                开启后，评论内容命中敏感词时将不自动回复，转入人工审核队列
              </p>
            </TabsContent>

            <TabsContent value="reply" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">回复内容</label>
                <Textarea
                  placeholder="输入回复内容，支持变量插入"
                  value={form.replyContent}
                  onChange={(e) => setForm({ ...form, replyContent: e.target.value })}
                  className="min-h-[120px] resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">可用变量</label>
                <div className="flex flex-wrap gap-2">
                  {['{昵称}', '{评论内容}', '{作品标题}', '{表情}'].map((v, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => setForm({ ...form, replyContent: form.replyContent + v })}
                    >
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="text-xs text-primary font-medium mb-1">预览</div>
                <div className="text-sm">
                  {form.replyContent
                    .replace('{昵称}', '@小美食家')
                    .replace('{评论内容}', '请问地址在哪里')
                    .replace('{作品标题}', '成都火锅探店vlog')
                    .replace('{表情}', '😊')
                    || '回复内容预览...'}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="freq" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  生效时段
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={form.timeStart}
                    onChange={(e) => setForm({ ...form, timeStart: e.target.value })}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">至</span>
                  <Input
                    type="time"
                    value={form.timeEnd}
                    onChange={(e) => setForm({ ...form, timeEnd: e.target.value })}
                    className="w-32"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">每小时上限</label>
                  <Input
                    type="number"
                    value={form.freqHour}
                    onChange={(e) => setForm({ ...form, freqHour: Number(e.target.value) })}
                  />
                  <p className="text-[11px] text-muted-foreground">单账号每小时最多回复条数</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">每天上限</label>
                  <Input
                    type="number"
                    value={form.freqDay}
                    onChange={(e) => setForm({ ...form, freqDay: Number(e.target.value) })}
                  />
                  <p className="text-[11px] text-muted-foreground">单账号每天最多回复条数</p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  随机间隔范围（秒）
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={form.intervalMin}
                    onChange={(e) => setForm({ ...form, intervalMin: Number(e.target.value) })}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">~</span>
                  <Input
                    type="number"
                    value={form.intervalMax}
                    onChange={(e) => setForm({ ...form, intervalMax: Number(e.target.value) })}
                    className="w-24"
                  />
                  <span className="text-xs text-muted-foreground">秒</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  每条回复之间随机等待，模拟人工操作节奏，降低被平台检测风险
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>{editingRule ? '保存修改' : '创建规则'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hit Records Dialog */}
      <Dialog open={hitDialogOpen} onOpenChange={setHitDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>命中记录</DialogTitle>
            <DialogDescription>
              {currentRule?.ruleName} - 最近命中记录
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {mockHitRecords.map((record) => (
              <div key={record.id} className="p-3 border border-border rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{record.commenter}</span>
                  <Badge
                    variant={record.status === 'success' ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {record.status === 'success' ? '回复成功' : '回复失败'}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mb-1">
                  命中关键词：<Badge variant="secondary">{record.hitKeyword}</Badge>
                </div>
                <div className="text-sm text-foreground mb-1">{record.content}</div>
                <div className="text-[11px] text-muted-foreground">{record.repliedAt}</div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHitDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后规则将立即停止运行，相关命中记录也会被清除。
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

export default EngageAutoCommentPage;

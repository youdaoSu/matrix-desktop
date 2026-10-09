import { useState } from 'react';
import {
  Info,
  Hand,
  KeyRound,
  WifiOff,
  FileText,
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import type { AutoReplyRule } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/src/components/ui/tabs';
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
} from '@client/src/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@client/src/components/ui/alert';

const mockRules: AutoReplyRule[] = [
  { id: 'r1', ruleType: 'keyword', ruleName: '店铺地址询问', platform: 'douyin', keywords: ['地址', '在哪', '位置'], matchMode: 'contains', replyContent: '店铺地址是朝阳区三里屯太古里南区，导航搜「辣翻天火锅」就能找到～', replyType: 'text', priority: 5, isEnabled: true, hitCount: 128, createdAt: '2026-08-15' },
  { id: 'r2', ruleType: 'keyword', ruleName: '价格咨询', platform: 'douyin', keywords: ['多少钱', '价格', '贵吗'], matchMode: 'contains', replyContent: '人均大概150元左右，性价比超高的～', replyType: 'text', priority: 4, isEnabled: true, hitCount: 86, createdAt: '2026-08-20' },
  { id: 'r3', ruleType: 'keyword', ruleName: '商务合作', platform: 'xiaohongshu', keywords: ['合作', '商务', '推广'], matchMode: 'contains', replyContent: '商务合作请发详细方案至邮箱：business@example.com', replyType: 'text', priority: 3, isEnabled: true, hitCount: 45, createdAt: '2026-09-01' },
  { id: 'r4', ruleType: 'keyword', ruleName: '感谢关注', platform: 'bilibili', keywords: ['你好', 'hi', '在吗'], matchMode: 'fuzzy', replyContent: '你好呀～感谢关注！有什么问题可以直接问哦', replyType: 'text', priority: 1, isEnabled: false, hitCount: 0, createdAt: '2026-09-10' },
];

const messageTemplates = {
  text: [
    { id: 't1', title: '感谢关注', content: '感谢关注！有什么可以帮你的吗～', status: 'approved' },
    { id: 't2', title: '店铺地址', content: '店铺地址是朝阳区三里屯太古里南区', status: 'approved' },
    { id: 't3', title: '新品预告', content: '新品即将上线，敬请期待～', status: 'pending' },
    { id: 't4', title: '售后说明', content: '如有问题请联系客服，我们会尽快处理', status: 'approved' },
  ],
  image: [
    { id: 'i1', title: '产品图1', content: '', status: 'approved' },
    { id: 'i2', title: '活动海报', content: '', status: 'pending' },
  ],
};

const AutoReplyPage = () => {
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [welcomeText, setWelcomeText] = useState('你好呀 {{昵称}}！感谢关注我的账号～ 有什么问题随时私信我哦！');
  const [offlineEnabled, setOfflineEnabled] = useState(false);
  const [offlineText, setOfflineText] = useState('当前不在线，看到消息会尽快回复您～');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState<'text' | 'image'>('text');

  const matchModeLabel: Record<string, string> = {
    exact: '精确匹配',
    contains: '包含匹配',
    fuzzy: '模糊匹配',
  };

  return (
    <div className="space-y-6">
      {/* Demo banner */}
      <Alert variant="default" className="bg-info/10 border-info/30 text-info">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info">
          当前为示例数据演示 - 绑定真实平台账号后将同步真实数据
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">自动回复</h1>
      </div>

      <Tabs defaultValue="welcome" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="welcome">
            <Hand className="w-4 h-4" />欢迎语
          </TabsTrigger>
          <TabsTrigger value="keyword">
            <KeyRound className="w-4 h-4" />关键词回复
          </TabsTrigger>
          <TabsTrigger value="offline">
            <WifiOff className="w-4 h-4" />离线回复
          </TabsTrigger>
          <TabsTrigger value="template">
            <FileText className="w-4 h-4" />消息模板
          </TabsTrigger>
        </TabsList>

        {/* 欢迎语 Tab */}
        <TabsContent value="welcome">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">欢迎语设置</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">启用</span>
                    <Switch checked={welcomeEnabled} onCheckedChange={setWelcomeEnabled} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">选择平台</label>
                    <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择平台" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部平台</SelectItem>
                        <SelectItem value="douyin">抖音</SelectItem>
                        <SelectItem value="xiaohongshu">小红书</SelectItem>
                        <SelectItem value="wechat">视频号</SelectItem>
                        <SelectItem value="bilibili">B站</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">选择账号</label>
                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择账号" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部账号</SelectItem>
                        <SelectItem value="1">美食探店小队</SelectItem>
                        <SelectItem value="3">生活种草日记</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">回复内容</label>
                  <Textarea
                    value={welcomeText}
                    onChange={(e) => setWelcomeText(e.target.value)}
                    className="min-h-[120px] resize-none"
                    disabled={!welcomeEnabled}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-muted-foreground">可插入变量：</span>
                  <Badge variant="outline" className="cursor-pointer hover:bg-muted">{'{{昵称}}'}</Badge>
                  <Badge variant="outline" className="cursor-pointer hover:bg-muted">{'{{时间}}'}</Badge>
                  <Badge variant="outline" className="cursor-pointer hover:bg-muted">{'{{平台}}'}</Badge>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button>保存设置</Button>
                  <Button variant="outline">
                    <Eye className="w-4 h-4" />预览效果
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">效果预览</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                  <div className="text-xs text-muted-foreground text-center">— 模拟新粉丝对话 —</div>
                  <div className="flex justify-start">
                    <div className="bg-card border border-border px-3 py-2 rounded-lg rounded-bl-none text-sm max-w-[80%]">
                      你好呀
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-primary text-white px-3 py-2 rounded-lg rounded-br-none text-sm max-w-[80%]">
                      {welcomeText.replace('{{昵称}}', '新粉丝')}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 关键词回复 Tab */}
        <TabsContent value="keyword">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Select defaultValue="all">
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="全部平台" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部平台</SelectItem>
                  <SelectItem value="douyin">抖音</SelectItem>
                  <SelectItem value="xiaohongshu">小红书</SelectItem>
                  <SelectItem value="bilibili">B站</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="enabled">已启用</SelectItem>
                  <SelectItem value="disabled">已停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4" />新建规则
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>新建关键词回复规则</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">规则名称</label>
                    <Input placeholder="请输入规则名称" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">关键词（多个用逗号分隔）</label>
                    <Input placeholder="如：地址,在哪,位置" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">匹配模式</label>
                      <Select defaultValue="contains">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exact">精确匹配</SelectItem>
                          <SelectItem value="contains">包含匹配</SelectItem>
                          <SelectItem value="fuzzy">模糊匹配</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">优先级</label>
                      <Select defaultValue="5">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
                    <label className="text-sm font-medium mb-1.5 block">回复内容</label>
                    <Textarea placeholder="请输入回复内容" className="min-h-[100px] resize-none" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">生效时段</label>
                    <div className="flex items-center gap-2">
                      <Input type="time" defaultValue="09:00" className="w-28" />
                      <span className="text-muted-foreground">至</span>
                      <Input type="time" defaultValue="22:00" className="w-28" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>取消</Button>
                  <Button onClick={() => setRuleDialogOpen(false)}>保存规则</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>规则名称</TableHead>
                    <TableHead>关键词</TableHead>
                    <TableHead>匹配模式</TableHead>
                    <TableHead>回复内容</TableHead>
                    <TableHead>优先级</TableHead>
                    <TableHead>命中次数</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockRules.map((rule: AutoReplyRule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.ruleName}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {rule.keywords?.slice(0, 3).map((kw: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px] h-5">{kw}</Badge>
                          ))}
                          {rule.keywords && rule.keywords.length > 3 && (
                            <Badge variant="outline" className="text-[10px] h-5">+{rule.keywords.length - 3}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{matchModeLabel[rule.matchMode]}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                        {rule.replyContent}
                      </TableCell>
                      <TableCell>{rule.priority}</TableCell>
                      <TableCell>{rule.hitCount}</TableCell>
                      <TableCell>
                        <Switch checked={rule.isEnabled} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <Edit3 className="w-4 h-4 mr-1" />编辑
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-1" />删除
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 离线回复 Tab */}
        <TabsContent value="offline">
          <Card className="max-w-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">离线自动回复</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">启用</span>
                  <Switch checked={offlineEnabled} onCheckedChange={setOfflineEnabled} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">离线时段</label>
                <div className="flex items-center gap-2">
                  <Input type="time" defaultValue="22:00" className="w-28" />
                  <span className="text-muted-foreground">至次日</span>
                  <Input type="time" defaultValue="09:00" className="w-28" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">在此时间段内收到私信将自动回复</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">回复内容</label>
                <Textarea
                  value={offlineText}
                  onChange={(e) => setOfflineText(e.target.value)}
                  className="min-h-[100px] resize-none"
                  disabled={!offlineEnabled}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button>保存设置</Button>
                <Button variant="outline">
                  <Eye className="w-4 h-4" />预览
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 消息模板 Tab */}
        <TabsContent value="template">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant={templateTab === 'text' ? 'default' : 'outline'}
              onClick={() => setTemplateTab('text')}
              size="sm"
            >
              文本模板
            </Button>
            <Button
              variant={templateTab === 'image' ? 'default' : 'outline'}
              onClick={() => setTemplateTab('image')}
              size="sm"
            >
              图片模板
            </Button>
            <Button className="ml-auto">
              <Plus className="w-4 h-4" />新建模板
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-ai-section-type="card-list">
            {messageTemplates[templateTab].map((tpl) => (
              <Card key={tpl.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{tpl.title}</span>
                    {tpl.status === 'approved' ? (
                      <Badge className="bg-[hsl(130_54%_42%)] text-white border-none text-xs">已通过</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/50 text-xs">待审核</Badge>
                    )}
                  </div>
                  {templateTab === 'text' ? (
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                      {tpl.content}
                    </p>
                  ) : (
                    <div className="h-24 bg-muted rounded-md mb-3 flex items-center justify-center text-muted-foreground text-sm">
                      图片预览
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">编辑</Button>
                    <Button variant="ghost" size="sm" className="text-destructive">删除</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Compliance warning */}
      <Alert variant="destructive">
        <AlertTriangle className="w-4 h-4" />
        <AlertTitle className="font-semibold">群发/主动消息模块 — 受平台规则严格限制，默认禁用</AlertTitle>
        <AlertDescription className="mt-1">
          根据各大内容平台社区规范及开放平台 API 政策，未经用户主动发起对话的情况下，平台限制向用户主动发送消息（群发/批量私信/营销消息等）。违反平台规则可能导致账号权限受限甚至封禁。
          本系统的自动回复功能仅在用户主动发起私信（包括新粉丝关注触发的欢迎语）后进行被动响应，不提供主动群发、批量营销私信等功能。如需批量触达粉丝，建议使用平台官方提供的粉丝群、订阅通知等合规渠道。
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default AutoReplyPage;

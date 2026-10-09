import { useState } from 'react';
import {
  Info,
  AlertTriangle,
  Plus,
  Search,
  Edit3,
  Trash2,
  Send,
  Image,
  Link as LinkIcon,
  FileText,
  LayoutGrid,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import { Switch } from '@client/src/components/ui/switch';
import type { MessageTemplate, PlatformType } from '@shared/api.interface';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/src/components/ui/tabs';
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

const platformLabels: Record<PlatformType, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat: '视频号',
  bilibili: 'B站',
};

const templateTypeLabels: Record<string, string> = {
  text: '文本',
  image: '图片',
  article: '图文',
  link: '链接',
};

const templateTypeIcons: Record<string, typeof Send> = {
  text: Send,
  image: Image,
  article: FileText,
  link: LinkIcon,
};

const auditStatusLabels: Record<string, string> = {
  draft: '草稿',
  pending: '审核中',
  approved: '已通过',
  rejected: '已拒绝',
};

const auditStatusColors: Record<string, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  pending: 'bg-[hsl(26_90%_49%)] text-white',
  approved: 'bg-[hsl(130_54%_42%)] text-white',
  rejected: 'bg-[hsl(2_84%_62%)] text-white',
};

const mockTemplates: MessageTemplate[] = [
  { id: 'tpl1', templateType: 'text', templateName: '感谢关注通用版', platform: 'douyin', content: '感谢关注！有什么问题随时私信我哦～', auditStatus: 'approved', isEnabled: true, createdAt: '2026-08-10' },
  { id: 'tpl2', templateType: 'text', templateName: '价格咨询回复', platform: 'douyin', content: '人均大概150元左右，性价比超高～', auditStatus: 'approved', isEnabled: true, createdAt: '2026-08-12' },
  { id: 'tpl3', templateType: 'image', templateName: '新品海报图', platform: 'xiaohongshu', title: '秋季新品上市', mediaUrl: '', auditStatus: 'pending', isEnabled: false, createdAt: '2026-09-25' },
  { id: 'tpl4', templateType: 'article', templateName: '品牌故事图文', platform: 'wechat', title: '我们的品牌故事', content: '从一间小店到连锁品牌，一路走来感谢有你...', mediaUrl: '', auditStatus: 'approved', isEnabled: true, createdAt: '2026-08-20' },
  { id: 'tpl5', templateType: 'link', templateName: '商城链接卡片', platform: 'xiaohongshu', title: '官方商城', linkUrl: 'https://shop.example.com', auditStatus: 'approved', isEnabled: true, createdAt: '2026-08-25' },
  { id: 'tpl6', templateType: 'text', templateName: '售后安抚话术', platform: 'douyin', content: '非常抱歉给您带来不好的体验，我们会尽快为您处理，请稍等...', auditStatus: 'rejected', isEnabled: false, createdAt: '2026-09-20' },
  { id: 'tpl7', templateType: 'image', templateName: '节日祝福图', platform: 'bilibili', title: '中秋快乐', mediaUrl: '', auditStatus: 'approved', isEnabled: true, createdAt: '2026-09-10' },
  { id: 'tpl8', templateType: 'article', templateName: '产品介绍图文', platform: 'xiaohongshu', title: '明星产品推荐', content: '这款产品凭借其卓越的品质受到了广大用户的喜爱...', mediaUrl: '', auditStatus: 'pending', isEnabled: false, createdAt: '2026-09-27' },
  { id: 'tpl9', templateType: 'link', templateName: '直播间链接', platform: 'douyin', title: '直播间入口', linkUrl: 'https://live.example.com', auditStatus: 'draft', isEnabled: false, createdAt: '2026-09-28' },
  { id: 'tpl10', templateType: 'text', templateName: '欢迎新粉丝', platform: 'bilibili', content: '欢迎关注！硬核测评每周更新，三连支持一下吧～', auditStatus: 'approved', isEnabled: true, createdAt: '2026-09-01' },
];

const AutomationTemplatesPage = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [newType, setNewType] = useState<'text' | 'image' | 'article' | 'link'>('text');
  const [previewTpl, setPreviewTpl] = useState<MessageTemplate | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>(mockTemplates);

  const filteredTemplates = templates.filter((tpl) => {
    if (activeTab !== 'all' && tpl.templateType !== activeTab) return false;
    if (search && !tpl.templateName.includes(search) && !tpl.content?.includes(search) && !tpl.title?.includes(search)) return false;
    return true;
  });

  const tabCounts = {
    all: templates.length,
    text: templates.filter((t) => t.templateType === 'text').length,
    image: templates.filter((t) => t.templateType === 'image').length,
    article: templates.filter((t) => t.templateType === 'article').length,
    link: templates.filter((t) => t.templateType === 'link').length,
  };

  const handleSubmitAudit = (id: string) => {
    setTemplates(templates.map((t) => (t.id === id ? { ...t, auditStatus: 'pending' as const } : t)));
  };

  const handleRevoke = (id: string) => {
    setTemplates(templates.map((t) => (t.id === id ? { ...t, auditStatus: 'draft' as const, isEnabled: false } : t)));
  };

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    setTemplates(templates.map((t) => (t.id === id ? { ...t, isEnabled: enabled } : t)));
  };

  const openPreview = (tpl: MessageTemplate) => {
    setPreviewTpl(tpl);
    setPreviewOpen(true);
  };

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
          消息模板仅用于已授权自有账号的合规场景（自动回复、被动响应等），模板内容需遵守各平台社区规范与审核要求。
        </AlertDescription>
      </Alert>

      <Alert variant="default" className="bg-info/10 border-info/30">
        <Info className="w-4 h-4 text-info" />
        <AlertDescription className="text-info text-xs">
          平台审核模板需真实平台凭证（如抖音开放平台、小红书蒲公英等），当前为模拟审核流程。
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">消息模板</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="inline-flex w-auto">
            <TabsTrigger value="all">全部 ({tabCounts.all})</TabsTrigger>
            <TabsTrigger value="text">文本 ({tabCounts.text})</TabsTrigger>
            <TabsTrigger value="image">图片 ({tabCounts.image})</TabsTrigger>
            <TabsTrigger value="article">图文 ({tabCounts.article})</TabsTrigger>
            <TabsTrigger value="link">链接 ({tabCounts.link})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-56">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索模板名称/内容"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4" />新建模板
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新建消息模板</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">模板名称</label>
                <Input placeholder="请输入模板名称，便于内部管理" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">模板类型</label>
                <div className="flex gap-2">
                  {(['text', 'image', 'article', 'link'] as const).map((t) => {
                    const Icon = templateTypeIcons[t];
                    return (
                      <Button
                        key={t}
                        variant={newType === t ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setNewType(t)}
                        type="button"
                      >
                        <Icon className="w-3.5 h-3.5" />{templateTypeLabels[t]}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">适用平台</label>
                <Select defaultValue="douyin">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="douyin">抖音</SelectItem>
                    <SelectItem value="xiaohongshu">小红书</SelectItem>
                    <SelectItem value="wechat">视频号</SelectItem>
                    <SelectItem value="bilibili">B站</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newType === 'text' && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">模板内容</label>
                  <Textarea placeholder="请输入文本内容" className="min-h-[120px] resize-none" />
                  <p className="text-xs text-muted-foreground mt-1">支持变量：{'{昵称}'}、{'{时间}'}、{'{平台}'}</p>
                </div>
              )}
              {newType === 'image' && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">上传图片</label>
                  <div className="border border-dashed border-border rounded-lg h-40 flex items-center justify-center text-muted-foreground text-sm">
                    点击上传图片
                  </div>
                </div>
              )}
              {newType === 'article' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">图文标题</label>
                    <Input placeholder="请输入图文标题" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">图文描述</label>
                    <Textarea placeholder="请输入图文描述" className="min-h-[80px] resize-none" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">封面图</label>
                    <div className="border border-dashed border-border rounded-lg h-24 flex items-center justify-center text-muted-foreground text-sm">
                      点击上传封面图
                    </div>
                  </div>
                </div>
              )}
              {newType === 'link' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">链接标题</label>
                    <Input placeholder="请输入链接标题" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">链接地址</label>
                    <Input placeholder="https://" />
                  </div>
                </div>
              )}
              <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">提示：</strong>
                提交后将进入平台审核流程，审核通过后方可使用。审核时间通常为 1-2 个工作日。
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={() => setDialogOpen(false)}>提交审核</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模板名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>标题/内容预览</TableHead>
                <TableHead>审核状态</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.map((tpl) => {
                const Icon = templateTypeIcons[tpl.templateType];
                return (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-medium">{tpl.templateName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                        <span>{templateTypeLabels[tpl.templateType]}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tpl.platform ? platformLabels[tpl.platform] : '通用'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate text-muted-foreground text-sm">
                        {tpl.title || tpl.content || tpl.linkUrl || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge className={auditStatusColors[tpl.auditStatus]}>
                          {auditStatusLabels[tpl.auditStatus]}
                        </Badge>
                        {tpl.auditStatus === 'pending' && (
                          <Badge variant="outline" className="text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/40 text-[10px]">
                            需平台审核
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {tpl.isEnabled ? (
                        <Badge variant="outline" className="text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/40">
                          启用中
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          未启用
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tpl.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 items-center">
                        {tpl.auditStatus === 'approved' && (
                          <div className="mr-2">
                            <Switch
                              checked={tpl.isEnabled}
                              onCheckedChange={(checked) => handleToggleEnabled(tpl.id, checked)}
                            />
                          </div>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openPreview(tpl)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        {tpl.auditStatus === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[hsl(130_54%_42%)]"
                            onClick={() => handleSubmitAudit(tpl.id)}
                            title="提交审核"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {tpl.auditStatus === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[hsl(26_90%_49%)]"
                            onClick={() => handleRevoke(tpl.id)}
                            title="撤销审核"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive">
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

       {/* 模板预览弹窗 */}
       <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
         <DialogContent className="sm:max-w-md">
           <DialogHeader>
             <DialogTitle className="text-base">模板预览</DialogTitle>
             <DialogDescription>
               {previewTpl?.templateName} · {previewTpl?.platform ? platformLabels[previewTpl.platform] : '通用'}
             </DialogDescription>
           </DialogHeader>
           {previewTpl && (
             <div className="space-y-4">
               {/* 模拟对话预览 */}
               <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                 <div className="text-xs text-muted-foreground text-center">— 模拟用户对话 —</div>
                 <div className="flex justify-start">
                   <div className="bg-card border border-border px-3 py-2 rounded-lg rounded-bl-none text-sm max-w-[80%]">
                     {previewTpl.templateType === 'text' ? '你好' : previewTpl.templateType === 'image' ? '发张图看看' : '有链接吗？'}
                   </div>
                 </div>
                 <div className="flex justify-end">
                   {previewTpl.templateType === 'text' && (
                     <div className="bg-primary text-white px-3 py-2 rounded-lg rounded-br-none text-sm max-w-[80%] leading-5">
                       {previewTpl.content || '（无内容）'}
                     </div>
                   )}
                   {previewTpl.templateType === 'image' && (
                     <div className="bg-card border border-border rounded-lg rounded-br-none overflow-hidden w-40">
                       <div className="aspect-square bg-muted flex items-center justify-center text-muted-foreground text-xs">
                         <Image className="w-8 h-8 mr-1 opacity-50" />
                         {previewTpl.title || '图片模板'}
                       </div>
                     </div>
                   )}
                   {previewTpl.templateType === 'article' && (
                     <div className="bg-card border border-border rounded-lg rounded-br-none overflow-hidden w-48">
                       <div className="h-20 bg-muted flex items-center justify-center text-muted-foreground text-xs">
                         封面图
                       </div>
                       <div className="p-2">
                         <div className="text-sm font-medium line-clamp-1">{previewTpl.title || '图文标题'}</div>
                         <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{previewTpl.content || ''}</div>
                       </div>
                     </div>
                   )}
                   {previewTpl.templateType === 'link' && (
                     <div className="bg-primary text-white px-3 py-2 rounded-lg rounded-br-none text-sm max-w-[80%]">
                       <div className="font-medium">{previewTpl.title || '链接标题'}</div>
                       <div className="text-xs opacity-80 truncate mt-0.5">{previewTpl.linkUrl || 'https://...'}</div>
                     </div>
                   )}
                 </div>
               </div>

               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Badge className={auditStatusColors[previewTpl.auditStatus]}>
                     {auditStatusLabels[previewTpl.auditStatus]}
                   </Badge>
                   <span className="text-xs text-muted-foreground">创建于 {previewTpl.createdAt}</span>
                 </div>
               </div>
             </div>
           )}
           <DialogFooter>
             <Button variant="outline" onClick={() => setPreviewOpen(false)}>关闭</Button>
           </DialogFooter>
         </DialogContent>
        </Dialog>
      </div>
    );
  };

export default AutomationTemplatesPage;

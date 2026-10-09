import { useState } from 'react';
import {
  Clock,
  FileText,
  Info,
  Send,
  Play,
  Image,
  Video,
  Music,
  BookOpen,
  Tv,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  XCircle,
} from 'lucide-react';
import type { PlatformType, ContentPost } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/src/components/ui/tabs';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

const pendingList: ContentPost[] = [
  { id: 'p1', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '成都火锅探店vlog', content: '成都最火的火锅店测评，排队2小时值不值？', mediaType: 'video', status: 'scheduled', scheduledAt: '2026-09-29 18:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpDelaySeconds: 1800, followUpStatus: 'pending', createdAt: '2026-09-28' },
  { id: 'p2', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '秋季护肤好物分享', content: '入秋后皮肤干燥怎么办？这5件亲测有效', mediaType: 'image', status: 'scheduled', scheduledAt: '2026-09-29 10:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-28' },
  { id: 'p3', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '最新旗舰手机对比评测', content: '苹果vs华为vs小米，谁才是今年的机皇？', mediaType: 'video', status: 'scheduled', scheduledAt: '2026-09-30 20:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpDelaySeconds: 3600, followUpStatus: 'pending', createdAt: '2026-09-27' },
  { id: 'p4', platform: 'douyin', accountId: '2', accountNickname: '旅行日记Vlog', title: '云南大理旅行攻略（上）', content: '大理三天两夜超详细攻略', mediaType: 'video', status: 'publishing', scheduledAt: '2026-09-28 15:30', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpDelaySeconds: 900, followUpStatus: 'pending', createdAt: '2026-09-28' },
  { id: 'p5', platform: 'wechat', accountId: '5', accountNickname: '职场成长笔记', title: '新人入职30天成长计划', content: '从职场小白到独当一面的成长路径', mediaType: 'video', status: 'reviewing', scheduledAt: '2026-09-29 09:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-27' },
  { id: 'p6', platform: 'xiaohongshu', accountId: '4', accountNickname: '时尚穿搭指南', title: '秋日氛围感穿搭', content: '温柔系秋日穿搭合集', mediaType: 'image', status: 'scheduled', scheduledAt: '2026-09-30 08:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpDelaySeconds: 600, followUpStatus: 'pending', createdAt: '2026-09-26' },
];

const scheduledList: ContentPost[] = [
  { id: 's1', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '成都火锅探店vlog', content: '成都最火的火锅店测评', mediaType: 'video', status: 'scheduled', scheduledAt: '2026-09-29 18:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpDelaySeconds: 1800, followUpStatus: 'pending', createdAt: '2026-09-28' },
  { id: 's2', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '秋季护肤好物分享', content: '入秋后皮肤干燥怎么办', mediaType: 'image', status: 'scheduled', scheduledAt: '2026-09-29 10:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-28' },
  { id: 's3', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '最新旗舰手机对比评测', content: '苹果vs华为vs小米', mediaType: 'video', status: 'scheduled', scheduledAt: '2026-09-30 20:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpDelaySeconds: 3600, followUpStatus: 'pending', createdAt: '2026-09-27' },
];

const draftList: ContentPost[] = [
  { id: 'd1', platform: 'douyin', accountId: '2', accountNickname: '旅行日记Vlog', title: '云南大理旅行攻略（下）', content: '大理小众景点推荐', mediaType: 'video', status: 'draft', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-25' },
  { id: 'd2', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '秋季穿搭灵感合集', content: '', mediaType: 'image', status: 'draft', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-26' },
  { id: 'd3', platform: 'wechat', accountId: '5', accountNickname: '职场成长笔记', title: '职场沟通技巧', content: '高效沟通的7个原则', mediaType: 'text', status: 'draft', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-27' },
  { id: 'd4', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '程序员桌面好物分享', content: '', mediaType: 'video', status: 'draft', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-24' },
  { id: 'd5', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '上海米其林探店', content: '', mediaType: 'video', status: 'draft', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-23' },
];

const PublishQueuePage = () => {
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />待发布</Badge>;
      case 'publishing':
        return <Badge className="gap-1 bg-[hsl(221_83%_53%)] text-white border-none"><Loader2 className="w-3 h-3 animate-spin" />发布中</Badge>;
      case 'reviewing':
        return <Badge variant="outline" className="text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/50 gap-1"><Loader2 className="w-3 h-3 animate-spin" />审核中</Badge>;
      case 'draft':
        return <Badge variant="outline" className="gap-1"><FileText className="w-3 h-3" />草稿</Badge>;
      default:
        return <Badge variant="outline">未知</Badge>;
    }
  };

  const getMediaTypeLabel = (type: string) => {
    switch (type) {
      case 'image':
        return <Badge variant="outline" className="gap-1"><Image className="w-3 h-3" />图文</Badge>;
      case 'video':
        return <Badge variant="outline" className="gap-1"><Video className="w-3 h-3" />视频</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><FileText className="w-3 h-3" />文字</Badge>;
    }
  };

  const renderTable = (list: ContentPost[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10"></TableHead>
          <TableHead>标题/内容预览</TableHead>
          <TableHead>平台</TableHead>
          <TableHead>发布账号</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>计划发布时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((item: ContentPost) => {
          const meta = platformMeta[item.platform];
          const Icon = meta.icon;
          const isExpanded = expandedRows.includes(item.id);
          return (
            <>
              <TableRow key={item.id} className="cursor-pointer" onClick={() => toggleExpand(item.id)}>
                <TableCell>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{item.title}</div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.content}</p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon className="w-3 h-3" />
                    </div>
                    <span className="text-sm">{meta.label}</span>
                  </div>
                </TableCell>
                <TableCell>{item.accountNickname}</TableCell>
                <TableCell>{getMediaTypeLabel(item.mediaType)}</TableCell>
                <TableCell>{getStatusBadge(item.status)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {item.scheduledAt || '-'}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm">
                    <Edit3 className="w-4 h-4 mr-1" />编辑
                  </Button>
                  {item.status === 'scheduled' && (
                    <Button variant="ghost" size="sm" className="text-[hsl(130_54%_42%)]">
                      <Send className="w-4 h-4 mr-1" />立即发布
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-1" />删除
                  </Button>
                </TableCell>
              </TableRow>
              {isExpanded && (
                <TableRow key={`${item.id}-expand`}>
                  <TableCell colSpan={8} className="bg-muted/30">
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">内容正文</p>
                          <p className="text-sm">{item.content || '（无正文内容）'}</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">创建时间</span>
                            <span>{item.createdAt}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">自动追评</span>
                            <span>{item.autoFollowUp ? `开启（${Math.floor(item.followUpDelaySeconds / 60)}分钟后）` : '未开启'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">平台账号ID</span>
                            <span>{item.accountId}</span>
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
  );

  return (
    <div className="space-y-4 p-4">
      <Alert variant="warning">
        <Info className="w-4 h-4" />
        <AlertDescription>
          当前展示示例数据，绑定真实平台账号后可同步实际内容
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">发布队列</h1>
        <div className="flex items-center gap-2">
          <Input placeholder="搜索内容标题..." className="w-64" />
          <Button>
            <Send className="w-4 h-4 mr-1" />
            新建发布
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="pending">
            <div className="border-b border-border px-4 pt-4">
              <TabsList>
                <TabsTrigger value="pending" className="gap-1.5">
                  <Clock className="w-4 h-4" />
                  待发布
                  <Badge variant="secondary" className="ml-1">{pendingList.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="scheduled" className="gap-1.5">
                  <Play className="w-4 h-4" />
                  定时中
                  <Badge variant="secondary" className="ml-1">{scheduledList.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="draft" className="gap-1.5">
                  <FileText className="w-4 h-4" />
                  草稿箱
                  <Badge variant="secondary" className="ml-1">{draftList.length}</Badge>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="pending" className="m-0">
              {renderTable(pendingList)}
            </TabsContent>
            <TabsContent value="scheduled" className="m-0">
              {renderTable(scheduledList)}
            </TabsContent>
            <TabsContent value="draft" className="m-0">
              {renderTable(draftList)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublishQueuePage;

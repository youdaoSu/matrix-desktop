import { useState } from 'react';
import {
  FileText,
  Clock,
  File,
  History,
  Info,
  Send,
  Calendar,
  Image,
  Hash,
  Upload,
  PlayCircle,
  BookOpen,
  Video,
  Tv,
  Music,
  Check,
  XCircle,
  Loader2,
} from 'lucide-react';
import type { PlatformType, ContentPost } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/src/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Checkbox } from '@client/src/components/ui/checkbox';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

const mockAccounts = [
  { id: '1', platform: 'douyin' as PlatformType, nickname: '美食探店小队' },
  { id: '2', platform: 'douyin' as PlatformType, nickname: '旅行日记Vlog' },
  { id: '3', platform: 'xiaohongshu' as PlatformType, nickname: '生活种草日记' },
  { id: '5', platform: 'wechat' as PlatformType, nickname: '职场成长笔记' },
  { id: '6', platform: 'bilibili' as PlatformType, nickname: '科技宅频道' },
];

const scheduleList: ContentPost[] = [
  { id: 's1', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '成都火锅探店vlog', content: '成都最火的火锅店测评', mediaType: 'video', status: 'scheduled', scheduledAt: '2026-09-29 18:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, createdAt: '2026-09-28', autoFollowUp: true, followUpDelaySeconds: 1800, followUpStatus: 'pending' },
  { id: 's2', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '秋季护肤好物分享', content: '入秋后皮肤干燥怎么办', mediaType: 'image', status: 'scheduled', scheduledAt: '2026-09-29 10:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, createdAt: '2026-09-28', autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none' },
  { id: 's3', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '最新旗舰手机对比评测', content: '苹果vs华为vs小米', mediaType: 'video', status: 'scheduled', scheduledAt: '2026-09-30 20:00', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, createdAt: '2026-09-27', autoFollowUp: true, followUpDelaySeconds: 3600, followUpStatus: 'pending' },
];

const draftList: ContentPost[] = [
  { id: 'd1', platform: 'douyin', accountId: '2', accountNickname: '旅行日记Vlog', title: '云南大理旅行攻略（上）', content: '', mediaType: 'video', status: 'draft', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, createdAt: '2026-09-25', autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none' },
  { id: 'd2', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '秋季穿搭灵感合集', content: '', mediaType: 'image', status: 'draft', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, createdAt: '2026-09-26', autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none' },
  { id: 'd3', platform: 'wechat', accountId: '5', accountNickname: '职场成长笔记', title: '新人入职30天成长计划', content: '', mediaType: 'text', status: 'draft', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, createdAt: '2026-09-27', autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none' },
];

const historyList: ContentPost[] = [
  { id: 'h1', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '北京烤鸭哪家强', content: '', mediaType: 'video', status: 'published', publishedAt: '2026-09-27 18:00', playCount: 152000, likeCount: 8900, commentCount: 560, shareCount: 320, collectCount: 1200, createdAt: '2026-09-27', autoFollowUp: true, followUpDelaySeconds: 1800, followUpStatus: 'success' },
  { id: 'h2', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '平价彩妆测评', content: '', mediaType: 'image', status: 'published', publishedAt: '2026-09-26 10:00', playCount: 0, likeCount: 12600, commentCount: 890, shareCount: 450, collectCount: 3200, createdAt: '2026-09-26', autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none' },
  { id: 'h3', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '程序员桌面好物分享', content: '', mediaType: 'video', status: 'failed', failReason: '审核未通过', publishedAt: '', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, createdAt: '2026-09-25', autoFollowUp: true, followUpDelaySeconds: 3600, followUpStatus: 'failed' },
  { id: 'h4', platform: 'wechat', accountId: '5', accountNickname: '职场成长笔记', title: '职场沟通技巧', content: '', mediaType: 'video', status: 'reviewing', publishedAt: '', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, createdAt: '2026-09-28', autoFollowUp: false, followUpDelaySeconds: 0, followUpStatus: 'none' },
];

const ContentPage = () => {
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['1']);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-[hsl(130_54%_42%)] text-white border-none"><Check className="w-3 h-3 mr-1" />发布成功</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />发布失败</Badge>;
      case 'reviewing':
        return <Badge variant="outline" className="text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/50"><Loader2 className="w-3 h-3 mr-1 animate-spin" />审核中</Badge>;
      case 'scheduled':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />定时中</Badge>;
      default:
        return <Badge variant="outline">未知</Badge>;
    }
  };

  const formatCount = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
    return n.toString();
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
        <h1 className="text-xl font-semibold text-foreground">内容管理</h1>
      </div>

      <Tabs defaultValue="publish" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-md">
          <TabsTrigger value="publish">
            <Send className="w-4 h-4" />发布内容
          </TabsTrigger>
          <TabsTrigger value="queue">
            <Clock className="w-4 h-4" />发布队列
          </TabsTrigger>
          <TabsTrigger value="drafts">
            <File className="w-4 h-4" />草稿箱
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4" />发布历史
          </TabsTrigger>
        </TabsList>

        {/* 发布内容 Tab */}
        <TabsContent value="publish">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: account selection */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">选择账号</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {mockAccounts.map((acc) => {
                  const meta = platformMeta[acc.platform];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => toggleAccount(acc.id)}
                      className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                        selectedAccounts.includes(acc.id)
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-muted border border-transparent'
                      }`}
                    >
                      <Checkbox checked={selectedAccounts.includes(acc.id)} />
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: meta.color }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-sm truncate">{acc.nickname}</span>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-2">
                  已选 {selectedAccounts.length} 个账号
                </p>
              </CardContent>
            </Card>

            {/* Middle: editor */}
            <Card className="lg:col-span-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">内容编辑</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">标题</label>
                  <Input
                    placeholder="请输入内容标题"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">正文/描述</label>
                  <Textarea
                    placeholder="请输入内容正文..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[160px] resize-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    <Hash className="w-4 h-4 inline mr-1" />话题标签
                  </label>
                  <Input
                    placeholder="多个标签用空格或逗号分隔，如 #美食 #探店"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">上传封面/图片</p>
                    <p className="text-xs text-muted-foreground mt-1">支持 JPG/PNG</p>
                  </div>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    <Image className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">素材库</p>
                    <p className="text-xs text-muted-foreground mt-1">选择已有素材</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button className="flex-1">
                    <Send className="w-4 h-4" />立即发布
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <Calendar className="w-4 h-4" />定时发布
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right: platform-specific */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">平台适配</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    请先选择发布账号
                  </p>
                ) : (
                  selectedAccounts.slice(0, 4).map((accId) => {
                    const acc = mockAccounts.find((a) => a.id === accId);
                    if (!acc) return null;
                    const meta = platformMeta[acc.platform];
                    const Icon = meta.icon;
                    return (
                      <div key={accId} className="p-3 border border-border rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white"
                            style={{ backgroundColor: meta.color }}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-sm font-medium">{acc.nickname}</span>
                        </div>
                        {acc.platform === 'douyin' && (
                          <p className="text-xs text-muted-foreground">话题标签自动适配抖音话题</p>
                        )}
                        {acc.platform === 'xiaohongshu' && (
                          <p className="text-xs text-muted-foreground">标题+正文双栏适配小红书格式</p>
                        )}
                        {acc.platform === 'bilibili' && (
                          <p className="text-xs text-muted-foreground">分区选择：生活区/美食区/科技区</p>
                        )}
                        {acc.platform === 'wechat' && (
                          <p className="text-xs text-muted-foreground">视频号需手动确认发布</p>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 发布队列 Tab */}
        <TabsContent value="queue">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>内容标题</TableHead>
                    <TableHead>发布账号</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>定时时间</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleList.map((item: ContentPost) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>{item.accountNickname}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {platformMeta[item.platform].label}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.mediaType === 'video' ? '视频' : item.mediaType === 'image' ? '图文' : '文字'}</TableCell>
                      <TableCell>{item.scheduledAt}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">编辑</Button>
                        <Button variant="ghost" size="sm" className="text-destructive">取消</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 草稿箱 Tab */}
        <TabsContent value="drafts">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-ai-section-type="card-list">
            {draftList.map((item: ContentPost) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {platformMeta[item.platform].label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.createdAt}
                    </span>
                  </div>
                  <h3 className="font-medium mb-1 line-clamp-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {item.accountNickname} · {item.mediaType === 'video' ? '视频' : item.mediaType === 'image' ? '图文' : '文字'}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">继续编辑</Button>
                    <Button variant="ghost" size="sm" className="text-destructive">删除</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* 发布历史 Tab */}
        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>内容标题</TableHead>
                    <TableHead>账号</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>发布时间</TableHead>
                    <TableHead>播放/浏览</TableHead>
                    <TableHead>点赞</TableHead>
                    <TableHead>评论</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyList.map((item: ContentPost) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>{item.accountNickname}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {platformMeta[item.platform].label}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-xs">{item.publishedAt || '-'}</TableCell>
                      <TableCell>{formatCount(item.playCount || 0)}</TableCell>
                      <TableCell>{formatCount(item.likeCount)}</TableCell>
                      <TableCell>{formatCount(item.commentCount)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">详情</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContentPage;

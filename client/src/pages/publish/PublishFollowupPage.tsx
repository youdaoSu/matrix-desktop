import { useState } from 'react';
import {
  Info,
  MessageSquare,
  Check,
  XCircle,
  Clock,
  AlertCircle,
  Edit3,
  RefreshCw,
  Eye,
  Search,
  Music,
  BookOpen,
  Video,
  Tv,
} from 'lucide-react';
import type { PlatformType, ContentPost } from '@shared/api.interface';
import { Card, CardContent } from '@client/src/components/ui/card';
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

const followUpList: ContentPost[] = [
  { id: 'f1', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '北京烤鸭哪家强？5家老字号深度测评', mediaType: 'video', status: 'published', publishedAt: '2026-09-27 18:00', playCount: 152000, likeCount: 8900, commentCount: 560, shareCount: 320, collectCount: 1200, autoFollowUp: true, followUpContent: '想看更多美食测评记得关注哦～每周更新3期，带你吃遍全国美食！', followUpDelaySeconds: 1800, followUpStatus: 'success', createdAt: '2026-09-27' },
  { id: 'f2', platform: 'xiaohongshu', accountId: '4', accountNickname: '时尚穿搭指南', title: '秋日氛围感穿搭｜温柔系显白', mediaType: 'image', status: 'published', publishedAt: '2026-09-24 09:00', playCount: 0, likeCount: 8900, commentCount: 450, shareCount: 230, collectCount: 2100, autoFollowUp: true, followUpContent: '链接放在评论区啦，有问题随时问我～', followUpDelaySeconds: 600, followUpStatus: 'pending', createdAt: '2026-09-24' },
  { id: 'f3', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '2026旗舰手机横评｜谁才是真香机？', mediaType: 'video', status: 'published', publishedAt: '2026-09-23 20:00', playCount: 568000, likeCount: 32000, commentCount: 4500, shareCount: 2100, collectCount: 8900, autoFollowUp: true, followUpContent: '三连支持一下UP主，下期测你们想看的续航！', followUpDelaySeconds: 1200, followUpStatus: 'failed', followUpFailReason: '内容被拦截', createdAt: '2026-09-23' },
  { id: 'f4', platform: 'douyin', accountId: '2', accountNickname: '旅行日记Vlog', title: '云南大理｜三天两夜超详细攻略', mediaType: 'video', status: 'published', publishedAt: '2026-09-25 16:00', playCount: 234000, likeCount: 15600, commentCount: 1200, shareCount: 890, collectCount: 4500, autoFollowUp: true, followUpContent: '攻略已整理在评论区，自取～需要详细行程的可以私信我', followUpDelaySeconds: 900, followUpStatus: 'success', createdAt: '2026-09-25' },
  { id: 'f5', platform: 'wechat', accountId: '5', accountNickname: '职场成长笔记', title: '新人入职30天成长计划表', mediaType: 'text', status: 'published', publishedAt: '2026-09-21 08:30', playCount: 0, likeCount: 1200, commentCount: 89, shareCount: 450, collectCount: 670, autoFollowUp: true, followUpContent: '需要完整计划表的朋友可以私信我哦，免费分享～', followUpDelaySeconds: 2400, followUpStatus: 'success', createdAt: '2026-09-21' },
  { id: 'f6', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '平价彩妆天花板！学生党必入', mediaType: 'image', status: 'published', publishedAt: '2026-09-26 10:00', playCount: 0, likeCount: 12600, commentCount: 890, shareCount: 450, collectCount: 3200, autoFollowUp: false, followUpContent: '', followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-26' },
  { id: 'f7', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '程序员桌面好物分享', mediaType: 'video', status: 'failed', failReason: '审核未通过', publishedAt: '', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpContent: '需要链接的朋友看评论区置顶', followUpDelaySeconds: 3600, followUpStatus: 'failed', followUpFailReason: '账号授权异常', createdAt: '2026-09-25' },
  { id: 'f8', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '上海米其林探店｜人均300值不值', mediaType: 'video', status: 'published', publishedAt: '2026-09-22 12:00', playCount: 89000, likeCount: 5600, commentCount: 340, shareCount: 180, collectCount: 780, autoFollowUp: false, followUpContent: '', followUpDelaySeconds: 0, followUpStatus: 'none', createdAt: '2026-09-22' },
  { id: 'f9', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '护肤踩雷合集｜这些千万别买', mediaType: 'image', status: 'failed', failReason: '账号授权已过期', publishedAt: '', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpContent: '你们踩过哪些雷？评论区一起避雷', followUpDelaySeconds: 1800, followUpStatus: 'failed', followUpFailReason: '触发频控', createdAt: '2026-09-20' },
  { id: 'f10', platform: 'douyin', accountId: '2', accountNickname: '旅行日记Vlog', title: '西藏自驾攻略｜318川藏线', mediaType: 'video', status: 'published', publishedAt: '2026-09-19 08:00', playCount: 412000, likeCount: 28000, commentCount: 2100, shareCount: 1500, collectCount: 6800, autoFollowUp: true, followUpContent: '路线图已放评论区，想去的朋友收藏～', followUpDelaySeconds: 1500, followUpStatus: 'success', createdAt: '2026-09-19' },
  { id: 'f11', platform: 'wechat', accountId: '5', accountNickname: '职场成长笔记', title: '职场沟通技巧｜让你少走3年弯路', mediaType: 'video', status: 'reviewing', publishedAt: '', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpContent: '需要完整PPT的朋友评论区扣1', followUpDelaySeconds: 1800, followUpStatus: 'pending', createdAt: '2026-09-28' },
  { id: 'f12', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '机械键盘选购指南｜小白必看', mediaType: 'video', status: 'published', publishedAt: '2026-09-18 19:00', playCount: 198000, likeCount: 11200, commentCount: 890, shareCount: 420, collectCount: 2300, autoFollowUp: true, followUpContent: '链接放评论区置顶了，记得领券再买更划算！', followUpDelaySeconds: 2400, followUpStatus: 'failed', followUpFailReason: '内容被拦截', createdAt: '2026-09-18' },
];

const PublishFollowupPage = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  const getStatusBadge = (status: string, failReason?: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-[hsl(130_54%_42%)] text-white border-none gap-1"><Check className="w-3 h-3" />已追评</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />待追评</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />追评失败</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><MessageSquare className="w-3 h-3" />未设置</Badge>;
    }
  };

  const getFailReasonBadge = (reason?: string) => {
    if (!reason) return null;
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="w-3 h-3" />
        {reason}
      </Badge>
    );
  };

  const stats = {
    all: followUpList.filter((i) => i.followUpStatus !== 'none').length,
    pending: followUpList.filter((i) => i.followUpStatus === 'pending').length,
    success: followUpList.filter((i) => i.followUpStatus === 'success').length,
    failed: followUpList.filter((i) => i.followUpStatus === 'failed').length,
  };

  const filteredList = followUpList.filter((item) => {
    let statusMatch = true;
    if (activeTab === 'all') statusMatch = item.followUpStatus !== 'none';
    else if (activeTab === 'pending') statusMatch = item.followUpStatus === 'pending';
    else if (activeTab === 'success') statusMatch = item.followUpStatus === 'success';
    else if (activeTab === 'failed') statusMatch = item.followUpStatus === 'failed';
    const keywordMatch = !searchKeyword || item.title.toLowerCase().includes(searchKeyword.toLowerCase());
    return statusMatch && keywordMatch;
  });

  return (
    <div className="space-y-4 p-4">
      <Alert variant="warning">
        <Info className="w-4 h-4" />
        <AlertDescription>
          当前展示示例数据，绑定真实平台账号后可同步实际内容
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">追评管理</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" />
            批量重试
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">全部追评</p>
            <p className="text-2xl font-bold mt-1">{stats.all}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">待追评</p>
            <p className="text-2xl font-bold mt-1 text-[hsl(26_90%_49%)]">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">已追评</p>
            <p className="text-2xl font-bold mt-1 text-[hsl(130_54%_42%)]">{stats.success}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">追评失败</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{stats.failed}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between border-b border-border px-4 pt-4">
              <TabsList>
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="pending">待追评</TabsTrigger>
                <TabsTrigger value="success">已追评</TabsTrigger>
                <TabsTrigger value="failed">追评失败</TabsTrigger>
              </TabsList>
              <div className="relative w-64 pb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索作品标题..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            {(['all', 'pending', 'success', 'failed'] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="m-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>作品标题</TableHead>
                      <TableHead className="w-24">平台</TableHead>
                      <TableHead className="w-32">账号</TableHead>
                      <TableHead className="w-40">发布时间</TableHead>
                      <TableHead>追评内容预览</TableHead>
                      <TableHead className="w-24">追评状态</TableHead>
                      <TableHead className="w-32">失败原因</TableHead>
                      <TableHead className="text-right w-56">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredList.map((item) => {
                      const meta = platformMeta[item.platform];
                      const Icon = meta.icon;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium max-w-xs truncate">{item.title}</div>
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
                          <TableCell className="text-sm">{item.accountNickname}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.publishedAt || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs">
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {item.followUpContent || '（未设置追评内容）'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(item.followUpStatus, item.followUpFailReason)}</TableCell>
                          <TableCell>{getFailReasonBadge(item.followUpFailReason)}</TableCell>
                          <TableCell className="text-right">
                            {item.followUpStatus === 'failed' && (
                              <Button variant="ghost" size="sm" className="text-primary">
                                <RefreshCw className="w-4 h-4 mr-1" />重试
                              </Button>
                            )}
                            {item.followUpStatus !== 'none' && (
                              <Button variant="ghost" size="sm">
                                <Edit3 className="w-4 h-4 mr-1" />编辑
                              </Button>
                            )}
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4 mr-1" />查看原作品
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublishFollowupPage;

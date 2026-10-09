import { useState } from 'react';
import {
  Info,
  ThumbsUp,
  MessageCircle,
  Share2,
  Bookmark,
  Play,
  Eye,
  Edit3,
  Trash2,
  BarChart3,
  MessageSquare,
  AlertCircle,
  Check,
  XCircle,
  Clock,
  Music,
  BookOpen,
  Video,
  Tv,
  Search,
  Download,
} from 'lucide-react';
import type { PlatformType, ContentPost } from '@shared/api.interface';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@client/src/components/ui/tooltip';
import { Image } from '@client/src/components/ui/image';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

const worksList: ContentPost[] = [
  { id: 'w1', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '北京烤鸭哪家强？5家老字号深度测评', coverUrl: 'https://picsum.photos/seed/work1/200/120', mediaType: 'video', status: 'published', publishedAt: '2026-09-27 18:00', playCount: 152000, likeCount: 8900, commentCount: 560, shareCount: 320, collectCount: 1200, autoFollowUp: true, followUpStatus: 'success', followUpContent: '想看更多美食测评记得关注哦～', followUpDelaySeconds: 1800, createdAt: '2026-09-27' },
  { id: 'w2', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '平价彩妆天花板！学生党必入', coverUrl: 'https://picsum.photos/seed/work2/200/120', mediaType: 'image', status: 'published', publishedAt: '2026-09-26 10:00', playCount: 0, likeCount: 12600, commentCount: 890, shareCount: 450, collectCount: 3200, autoFollowUp: false, followUpStatus: 'none', followUpDelaySeconds: 0, createdAt: '2026-09-26' },
  { id: 'w3', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '程序员桌面好物分享｜提升效率必备', coverUrl: 'https://picsum.photos/seed/work3/200/120', mediaType: 'video', status: 'failed', failReason: '审核未通过：内容包含违规推广信息', publishedAt: '', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: true, followUpStatus: 'failed', followUpFailReason: '作品发布失败，追评未执行', followUpDelaySeconds: 3600, createdAt: '2026-09-25' },
  { id: 'w4', platform: 'wechat', accountId: '5', accountNickname: '职场成长笔记', title: '职场沟通技巧｜让你少走3年弯路', coverUrl: 'https://picsum.photos/seed/work4/200/120', mediaType: 'video', status: 'reviewing', publishedAt: '', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpStatus: 'none', followUpDelaySeconds: 0, createdAt: '2026-09-28' },
  { id: 'w5', platform: 'douyin', accountId: '2', accountNickname: '旅行日记Vlog', title: '云南大理｜三天两夜超详细攻略', coverUrl: 'https://picsum.photos/seed/work5/200/120', mediaType: 'video', status: 'published', publishedAt: '2026-09-25 16:00', playCount: 234000, likeCount: 15600, commentCount: 1200, shareCount: 890, collectCount: 4500, autoFollowUp: true, followUpStatus: 'success', followUpContent: '攻略已整理在评论区，自取～', followUpDelaySeconds: 900, createdAt: '2026-09-25' },
  { id: 'w6', platform: 'xiaohongshu', accountId: '4', accountNickname: '时尚穿搭指南', title: '秋日氛围感穿搭｜温柔系显白', coverUrl: 'https://picsum.photos/seed/work6/200/120', mediaType: 'image', status: 'published', publishedAt: '2026-09-24 09:00', playCount: 0, likeCount: 8900, commentCount: 450, shareCount: 230, collectCount: 2100, autoFollowUp: true, followUpStatus: 'pending', followUpDelaySeconds: 600, createdAt: '2026-09-24' },
  { id: 'w7', platform: 'bilibili', accountId: '6', accountNickname: '科技宅频道', title: '2026旗舰手机横评｜谁才是真香机？', coverUrl: 'https://picsum.photos/seed/work7/200/120', mediaType: 'video', status: 'published', publishedAt: '2026-09-23 20:00', playCount: 568000, likeCount: 32000, commentCount: 4500, shareCount: 2100, collectCount: 8900, autoFollowUp: true, followUpStatus: 'failed', followUpFailReason: '评论内容被平台拦截', followUpDelaySeconds: 1200, createdAt: '2026-09-23' },
  { id: 'w8', platform: 'douyin', accountId: '1', accountNickname: '美食探店小队', title: '上海米其林探店｜人均300值不值', coverUrl: 'https://picsum.photos/seed/work8/200/120', mediaType: 'video', status: 'published', publishedAt: '2026-09-22 12:00', playCount: 89000, likeCount: 5600, commentCount: 340, shareCount: 180, collectCount: 780, autoFollowUp: false, followUpStatus: 'none', followUpDelaySeconds: 0, createdAt: '2026-09-22' },
  { id: 'w9', platform: 'wechat', accountId: '5', accountNickname: '职场成长笔记', title: '新人入职30天成长计划表', coverUrl: 'https://picsum.photos/seed/work9/200/120', mediaType: 'text', status: 'published', publishedAt: '2026-09-21 08:30', playCount: 0, likeCount: 1200, commentCount: 89, shareCount: 450, collectCount: 670, autoFollowUp: true, followUpStatus: 'success', followUpContent: '需要完整计划表的朋友可以私信我哦', followUpDelaySeconds: 2400, createdAt: '2026-09-21' },
  { id: 'w10', platform: 'xiaohongshu', accountId: '3', accountNickname: '生活种草日记', title: '护肤踩雷合集｜这些千万别买', coverUrl: 'https://picsum.photos/seed/work10/200/120', mediaType: 'image', status: 'failed', failReason: '账号授权已过期，请重新授权', publishedAt: '', playCount: 0, likeCount: 0, commentCount: 0, shareCount: 0, collectCount: 0, autoFollowUp: false, followUpStatus: 'none', followUpDelaySeconds: 0, createdAt: '2026-09-20' },
];

const PublishWorksPage = () => {
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  const formatCount = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
    return n.toString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-[hsl(130_54%_42%)] text-white border-none gap-1"><Check className="w-3 h-3" />已发布</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />发布失败</Badge>;
      case 'reviewing':
        return <Badge variant="outline" className="text-[hsl(26_90%_49%)] border-[hsl(26_90%_49%)]/50 gap-1"><Clock className="w-3 h-3" />审核中</Badge>;
      default:
        return <Badge variant="outline">未知</Badge>;
    }
  };

  const getFollowUpBadge = (status: string, failReason?: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-[hsl(130_54%_42%)] text-white border-none gap-1"><Check className="w-3 h-3" />已追评</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />待追评</Badge>;
      case 'failed':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="gap-1 cursor-help"><AlertCircle className="w-3 h-3" />追评失败</Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">失败原因：{failReason}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return <Badge variant="outline" className="gap-1"><XCircle className="w-3 h-3" />未追评</Badge>;
    }
  };

  const filteredList = worksList.filter((item) => {
    const platformMatch = platformFilter === 'all' || item.platform === platformFilter;
    const statusMatch = statusFilter === 'all' || item.status === statusFilter;
    const keywordMatch = !searchKeyword || item.title.toLowerCase().includes(searchKeyword.toLowerCase());
    return platformMatch && statusMatch && keywordMatch;
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
        <h1 className="text-xl font-semibold text-foreground">作品管理</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            导出数据
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索作品标题..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">平台：</span>
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">账号：</span>
              <Select defaultValue="all">
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部账号</SelectItem>
                  <SelectItem value="1">美食探店小队</SelectItem>
                  <SelectItem value="2">旅行日记Vlog</SelectItem>
                  <SelectItem value="3">生活种草日记</SelectItem>
                  <SelectItem value="4">时尚穿搭指南</SelectItem>
                  <SelectItem value="5">职场成长笔记</SelectItem>
                  <SelectItem value="6">科技宅频道</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">状态：</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="published">已发布</SelectItem>
                  <SelectItem value="failed">发布失败</SelectItem>
                  <SelectItem value="reviewing">审核中</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">时间：</span>
              <Select defaultValue="7">
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">近7天</SelectItem>
                  <SelectItem value="30">近30天</SelectItem>
                  <SelectItem value="90">近90天</SelectItem>
                  <SelectItem value="all">全部时间</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">封面</TableHead>
                <TableHead>标题</TableHead>
                <TableHead className="w-20">平台</TableHead>
                <TableHead className="w-32">账号</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-40">发布时间</TableHead>
                <TableHead>数据</TableHead>
                <TableHead className="w-24">追评状态</TableHead>
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
                      <div className="relative w-24 h-14 rounded overflow-hidden bg-muted">
                        {item.coverUrl ? (
                          <Image src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        {item.mediaType === 'video' && item.coverUrl && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Play className="w-5 h-5 text-white" />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium max-w-xs truncate">{item.title}</div>
                      {item.status === 'failed' && (
                        <p className="text-xs text-destructive mt-0.5 truncate">失败原因：{item.failReason}</p>
                      )}
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
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.publishedAt || '-'}
                    </TableCell>
                    <TableCell>
                      {item.status === 'published' ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {item.mediaType === 'video' && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Play className="w-3 h-3" />{formatCount(item.playCount)}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <ThumbsUp className="w-3 h-3" />{formatCount(item.likeCount)}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MessageCircle className="w-3 h-3" />{formatCount(item.commentCount)}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Share2 className="w-3 h-3" />{formatCount(item.shareCount)}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Bookmark className="w-3 h-3" />{formatCount(item.collectCount)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.autoFollowUp || item.followUpStatus !== 'none'
                        ? getFollowUpBadge(item.followUpStatus, item.followUpFailReason)
                        : <span className="text-xs text-muted-foreground">未设置</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <BarChart3 className="w-4 h-4 mr-1" />数据
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit3 className="w-4 h-4 mr-1" />编辑
                      </Button>
                      {item.status === 'published' && item.followUpStatus !== 'success' && (
                        <Button variant="ghost" size="sm" className="text-primary">
                          <MessageSquare className="w-4 h-4 mr-1" />追评
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-1" />删除
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublishWorksPage;

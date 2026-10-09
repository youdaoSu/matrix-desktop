import { useState } from 'react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Info,
  Heart,
  Shield,
  ShieldAlert,
  Video,
  Music,
  BookOpen,
  Tv,
  Clock,
  Download,
  Grid2x2,
  LayoutList,
} from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Badge } from '@client/src/components/ui/badge';
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
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Avatar, AvatarFallback } from '@client/src/components/ui/avatar';
import { Progress } from '@client/src/components/ui/progress';
import { cn } from '@/lib/utils';

interface AccountItem {
  id: string;
  name: string;
  platform: string;
  platformIcon: typeof Music;
  platformColor: string;
  avatar: string;
  followers: number;
  followersDelta: number;
  health: number;
  healthStatus: 'good' | 'warning' | 'danger';
  todayPosts: number;
  totalLikes: number;
  lastSync: string;
}

const accounts: AccountItem[] = [
  { id: '1', name: '美食探店小队', platform: '抖音', platformIcon: Music, platformColor: 'hsl(0 0% 8%)', avatar: '美', followers: 52800, followersDelta: 320, health: 95, healthStatus: 'good', todayPosts: 2, totalLikes: 128600, lastSync: '2分钟前' },
  { id: '2', name: '美妆测评师', platform: '小红书', platformIcon: BookOpen, platformColor: 'hsl(350 85% 60%)', avatar: '美', followers: 38600, followersDelta: 280, health: 88, healthStatus: 'good', todayPosts: 3, totalLikes: 256800, lastSync: '5分钟前' },
  { id: '3', name: '科技宅频道', platform: 'B站', platformIcon: Tv, platformColor: 'hsl(200 90% 55%)', avatar: '科', followers: 18200, followersDelta: 150, health: 72, healthStatus: 'warning', todayPosts: 1, totalLikes: 76500, lastSync: '1分钟前' },
  { id: '4', name: '生活种草日记', platform: '小红书', platformIcon: BookOpen, platformColor: 'hsl(350 85% 60%)', avatar: '生', followers: 26800, followersDelta: 190, health: 92, healthStatus: 'good', todayPosts: 2, totalLikes: 189200, lastSync: '3分钟前' },
  { id: '5', name: '旅行日记Vlog', platform: '抖音', platformIcon: Music, platformColor: 'hsl(0 0% 8%)', avatar: '旅', followers: 42300, followersDelta: -45, health: 58, healthStatus: 'danger', todayPosts: 0, totalLikes: 95600, lastSync: '12分钟前' },
  { id: '6', name: '职场成长', platform: '视频号', platformIcon: Video, platformColor: 'hsl(142 45% 45%)', avatar: '职', followers: 21500, followersDelta: 120, health: 85, healthStatus: 'good', todayPosts: 1, totalLikes: 67800, lastSync: '8分钟前' },
];

const formatCount = (n: number): string => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
};

const AnalyticsAccountMonitorPage: React.FC = () => {
  const [platformFilter, setPlatformFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const totalFollowers = accounts.reduce((sum, a) => sum + a.followers, 0);
  const totalDelta = accounts.reduce((sum, a) => sum + a.followersDelta, 0);
  const avgHealth = Math.floor(accounts.reduce((sum, a) => sum + a.health, 0) / accounts.length);
  const todayTotalPosts = accounts.reduce((sum, a) => sum + a.todayPosts, 0);

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-info/10 border-info/30 text-info">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info text-xs">
          账号数据来自已授权自有矩阵账号 · 授权健康度基于平台接口响应状态综合评估 · 数据来源：平台官方开放接口
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">账号监控</h1>
          <p className="text-sm text-muted-foreground mt-1">全平台账号粉丝增长与授权状态实时监控</p>
        </div>
         <div className="flex items-center gap-2">
           <Select value={groupFilter} onValueChange={setGroupFilter}>
             <SelectTrigger className="w-32 h-9">
               <SelectValue placeholder="全部分组" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="all">全部分组</SelectItem>
               <SelectItem value="food">美食组</SelectItem>
               <SelectItem value="life">生活组</SelectItem>
               <SelectItem value="tech">科技组</SelectItem>
             </SelectContent>
           </Select>
           <Select value={platformFilter} onValueChange={setPlatformFilter}>
             <SelectTrigger className="w-32 h-9">
               <SelectValue placeholder="全部平台" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="all">全部平台</SelectItem>
               <SelectItem value="douyin">抖音</SelectItem>
               <SelectItem value="xiaohongshu">小红书</SelectItem>
               <SelectItem value="bilibili">B站</SelectItem>
               <SelectItem value="wechat">视频号</SelectItem>
             </SelectContent>
           </Select>
           <div className="flex items-center border border-border rounded-md overflow-hidden">
             <button
               onClick={() => setViewMode('grid')}
               className={cn(
                 'p-2 transition-colors',
                 viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
               )}
               title="卡片模式"
             >
               <Grid2x2 className="w-4 h-4" />
             </button>
             <button
               onClick={() => setViewMode('list')}
               className={cn(
                 'p-2 transition-colors border-l border-border',
                 viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
               )}
               title="列表模式"
             >
               <LayoutList className="w-4 h-4" />
             </button>
           </div>
           <Button variant="outline" size="sm">
             <Download className="w-4 h-4 mr-1" />
             导出
           </Button>
         </div>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-ai-section-type="card-stat">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">总粉丝数</span>
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{formatCount(totalFollowers)}</div>
            <div className={cn('text-xs flex items-center gap-1', totalDelta >= 0 ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]')}>
              {totalDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {totalDelta >= 0 ? '+' : ''}{totalDelta} 今日新增
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">平均健康度</span>
              <Shield className="w-4 h-4 text-[hsl(130_54%_42%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{avgHealth}%</div>
            <div className="text-xs text-muted-foreground">{accounts.filter((a) => a.healthStatus === 'good').length} 个账号状态良好</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">今日发布</span>
              <Video className="w-4 h-4 text-[hsl(26_90%_49%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{todayTotalPosts}</div>
            <div className="text-xs text-muted-foreground">个作品已发布</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">总获赞数</span>
              <Heart className="w-4 h-4 text-[hsl(2_84%_62%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{formatCount(accounts.reduce((s, a) => s + a.totalLikes, 0))}</div>
            <div className="text-xs text-[hsl(130_54%_42%)]">+2.3% 较昨日</div>
          </CardContent>
        </Card>
      </div>

      {/* 账号展示区 */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-ai-section-type="card-list">
          {accounts.map((account) => (
            <Card key={account.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-4">
                  <Avatar className="w-12 h-12" style={{ backgroundColor: account.platformColor + '20' }}>
                    <AvatarFallback style={{ color: account.platformColor }} className="text-sm">
                      {account.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{account.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px] h-4 gap-1">
                        <account.platformIcon className="w-3 h-3" />
                        {account.platform}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {account.lastSync}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'gap-1',
                      account.healthStatus === 'good' && 'bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/20',
                      account.healthStatus === 'warning' && 'bg-[hsl(46_100%_52%)]/10 text-[hsl(26_90%_49%)] border-[hsl(46_100%_52%)]/20',
                      account.healthStatus === 'danger' && 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/20'
                    )}
                  >
                    {account.healthStatus === 'good' ? <Shield className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                    {account.health}%
                  </Badge>
                </div>

                <div className="space-y-3">
                  {/* 粉丝 */}
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">粉丝数</div>
                      <div className="text-xl font-bold text-foreground">{formatCount(account.followers)}</div>
                    </div>
                    <div className={cn('text-sm font-medium flex items-center gap-0.5', account.followersDelta >= 0 ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]')}>
                      {account.followersDelta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {account.followersDelta >= 0 ? '+' : ''}{account.followersDelta}
                    </div>
                  </div>

                  {/* 健康度进度条 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">授权健康度</span>
                      <span className="text-xs font-medium">{account.health}%</span>
                    </div>
                    <Progress
                      value={account.health}
                      className={cn(
                        'h-1.5',
                        account.healthStatus === 'good' && '[&>div]:bg-[hsl(130_54%_42%)]',
                        account.healthStatus === 'warning' && '[&>div]:bg-[hsl(46_100%_52%)]',
                        account.healthStatus === 'danger' && '[&>div]:bg-[hsl(2_84%_62%)]'
                      )}
                    />
                  </div>

                  {/* 底部数据 */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                    <div>
                      <div className="text-xs text-muted-foreground">今日发布</div>
                      <div className="text-sm font-semibold text-foreground">{account.todayPosts} 篇</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">总获赞</div>
                      <div className="text-sm font-semibold text-foreground">{formatCount(account.totalLikes)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>粉丝数</TableHead>
                  <TableHead>作品数</TableHead>
                  <TableHead>今日播放</TableHead>
                  <TableHead>健康状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9" style={{ backgroundColor: account.platformColor + '20' }}>
                          <AvatarFallback style={{ color: account.platformColor }} className="text-xs">
                            {account.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate max-w-[180px]">{account.name}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {account.lastSync}同步
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                        <account.platformIcon className="w-3 h-3" />
                        {account.platform}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-foreground">{formatCount(account.followers)}</div>
                      <div className={cn('text-xs flex items-center gap-0.5', account.followersDelta >= 0 ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]')}>
                        {account.followersDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {account.followersDelta >= 0 ? '+' : ''}{account.followersDelta} 今日
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground">{account.todayPosts} 篇</TableCell>
                    <TableCell className="text-foreground">{formatCount(Math.floor(account.totalLikes * 0.3))}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'gap-1',
                          account.healthStatus === 'good' && 'bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/20',
                          account.healthStatus === 'warning' && 'bg-[hsl(46_100%_52%)]/10 text-[hsl(26_90%_49%)] border-[hsl(46_100%_52%)]/20',
                          account.healthStatus === 'danger' && 'bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/20'
                        )}
                      >
                        {account.healthStatus === 'good' ? <Shield className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                        {account.health}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2">查看</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2">同步</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AnalyticsAccountMonitorPage;

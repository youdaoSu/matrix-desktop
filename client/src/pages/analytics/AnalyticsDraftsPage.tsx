import { useState } from 'react';
import {
  FileText,
  Info,
  Music,
  BookOpen,
  Video,
  Tv,
  Clock,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Upload,
  Download,
  Edit3,
  Send,
  Trash2,
  CalendarClock,
  AlertOctagon,
  Archive,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Badge } from '@client/src/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Button } from '@client/src/components/ui/button';
import { Progress } from '@client/src/components/ui/progress';
import { cn } from '@/lib/utils';

interface DraftItem {
  id: string;
  platform: string;
  platformIcon: typeof Music;
  platformColor: string;
  draftCount: number;
  syncedCount: number;
  lastSync: string;
  syncStatus: 'success' | 'syncing' | 'failed';
  recentDrafts: { id: string; title: string; time: string; status: 'synced' | 'pending' | 'failed' }[];
}

const draftsData: DraftItem[] = [
  {
    id: '1',
    platform: '抖音',
    platformIcon: Music,
    platformColor: 'hsl(0 0% 8%)',
    draftCount: 12,
    syncedCount: 12,
    lastSync: '5分钟前',
    syncStatus: 'success',
    recentDrafts: [
      { id: 'd1', title: '北京烤鸭哪家强？5家老字号测评', time: '今天 14:30', status: 'synced' },
      { id: 'd2', title: '三亚5天4晚自由行攻略', time: '今天 10:15', status: 'synced' },
      { id: 'd3', title: '猫咪日常｜我家主子的一天', time: '昨天 20:00', status: 'synced' },
    ],
  },
  {
    id: '2',
    platform: '小红书',
    platformIcon: BookOpen,
    platformColor: 'hsl(350 85% 60%)',
    draftCount: 8,
    syncedCount: 6,
    lastSync: '同步中...',
    syncStatus: 'syncing',
    recentDrafts: [
      { id: 'd4', title: '平价彩妆红黑榜｜学生党必看', time: '今天 15:00', status: 'pending' },
      { id: 'd5', title: '秋季护肤全攻略', time: '今天 12:20', status: 'synced' },
      { id: 'd6', title: '家居收纳技巧｜小户型', time: '昨天 18:30', status: 'synced' },
    ],
  },
  {
    id: '3',
    platform: 'B站',
    platformIcon: Tv,
    platformColor: 'hsl(200 90% 55%)',
    draftCount: 5,
    syncedCount: 4,
    lastSync: '10分钟前',
    syncStatus: 'success',
    recentDrafts: [
      { id: 'd7', title: '程序员桌面好物分享', time: '今天 11:00', status: 'synced' },
      { id: 'd8', title: '数码开箱｜最新旗舰手机评测', time: '今天 09:30', status: 'synced' },
      { id: 'd9', title: '新手健身入门30天计划', time: '昨天 22:00', status: 'failed' },
    ],
  },
  {
    id: '4',
    platform: '视频号',
    platformIcon: Video,
    platformColor: 'hsl(142 45% 45%)',
    draftCount: 3,
    syncedCount: 0,
    lastSync: '同步失败',
    syncStatus: 'failed',
    recentDrafts: [
      { id: 'd10', title: '职场新人避坑指南', time: '今天 13:45', status: 'failed' },
      { id: 'd11', title: '通勤穿搭分享', time: '昨天 16:00', status: 'failed' },
    ],
  },
];

const statusConfig = {
  success: { label: '同步成功', color: 'text-[hsl(130_54%_42%)]', icon: CheckCircle },
  syncing: { label: '同步中', color: 'text-[hsl(46_100%_45%)]', icon: RefreshCw },
  failed: { label: '同步失败', color: 'text-[hsl(2_84%_62%)]', icon: AlertTriangle },
};

const AnalyticsDraftsPage: React.FC = () => {
  const [platformFilter, setPlatformFilter] = useState('all');

  const totalDrafts = draftsData.reduce((sum, d) => sum + d.draftCount, 0);
  const totalSynced = draftsData.reduce((sum, d) => sum + d.syncedCount, 0);
  const syncRate = totalDrafts > 0 ? Math.round((totalSynced / totalDrafts) * 100) : 0;
  const failedPlatforms = draftsData.filter((d) => d.syncStatus === 'failed').length;

  const filteredData = draftsData.filter((d) => {
    if (platformFilter !== 'all' && d.platform !== platformFilter) return false;
    return true;
  });

  const getDraftStatusBadge = (status: string) => {
    switch (status) {
      case 'synced':
        return <Badge className="text-[10px] h-4 bg-[hsl(130_54%_42%)]/10 text-[hsl(130_54%_42%)] border-[hsl(130_54%_42%)]/20">已同步</Badge>;
      case 'pending':
        return <Badge className="text-[10px] h-4 bg-[hsl(46_100%_52%)]/10 text-[hsl(26_90%_49%)] border-[hsl(46_100%_52%)]/20">同步中</Badge>;
      case 'failed':
        return <Badge className="text-[10px] h-4 bg-[hsl(2_84%_62%)]/10 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/20">失败</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-info/10 border-info/30 text-info">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info text-xs">
          草稿数据来自已授权自有矩阵账号的平台官方开放接口 · 仅用于草稿内容同步管理
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">草稿监控</h1>
          <p className="text-sm text-muted-foreground mt-1">各平台草稿箱同步状态一览，确保内容安全备份</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="全部平台" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              <SelectItem value="抖音">抖音</SelectItem>
              <SelectItem value="小红书">小红书</SelectItem>
              <SelectItem value="B站">B站</SelectItem>
              <SelectItem value="视频号">视频号</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-[hsl(26_90%_49%)] hover:bg-[hsl(26_90%_45%)] text-white"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
             全部同步
           </Button>
           <Button variant="outline" size="sm">
             <Download className="w-4 h-4 mr-1" />
             导出
           </Button>
         </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-ai-section-type="card-stat">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">草稿总数</span>
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{totalDrafts}</div>
            <div className="text-xs text-muted-foreground">篇草稿已备份</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">同步成功率</span>
              <CheckCircle className="w-4 h-4 text-[hsl(130_54%_42%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{syncRate}%</div>
            <Progress value={syncRate} className="h-1.5 [&>div]:bg-[hsl(130_54%_42%)]" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">监控平台</span>
              <Upload className="w-4 h-4 text-[hsl(26_90%_49%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{draftsData.length}</div>
            <div className="text-xs text-muted-foreground">个平台草稿同步</div>
          </CardContent>
        </Card>
         <Card>
           <CardContent className="p-4">
             <div className="flex items-center justify-between mb-2">
               <span className="text-xs text-muted-foreground">异常平台</span>
               <AlertTriangle className="w-4 h-4 text-[hsl(2_84%_62%)]" />
             </div>
             <div className="text-2xl font-bold text-foreground mb-1">{failedPlatforms}</div>
             <div className="text-xs text-muted-foreground">同步失败需处理</div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="p-4">
             <div className="flex items-center justify-between mb-2">
               <span className="text-xs text-muted-foreground">定时待发</span>
               <CalendarClock className="w-4 h-4 text-[hsl(130_54%_42%)]" />
             </div>
             <div className="text-2xl font-bold text-foreground mb-1">8</div>
             <div className="text-xs text-muted-foreground">篇定时发布中</div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="p-4">
             <div className="flex items-center justify-between mb-2">
               <span className="text-xs text-muted-foreground">超期未发</span>
               <AlertOctagon className="w-4 h-4 text-[hsl(26_90%_49%)]" />
             </div>
             <div className="text-2xl font-bold text-foreground mb-1">3</div>
             <div className="text-xs text-[hsl(26_90%_49%)]">超过计划发布时间</div>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="p-4">
             <div className="flex items-center justify-between mb-2">
               <span className="text-xs text-muted-foreground">7天未动</span>
               <Archive className="w-4 h-4 text-muted-foreground" />
             </div>
             <div className="text-2xl font-bold text-foreground mb-1">5</div>
             <div className="text-xs text-muted-foreground">篇草稿7天未编辑</div>
           </CardContent>
         </Card>
      </div>

      {/* 各平台草稿状态 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-ai-section-type="card-list">
        {filteredData.map((item) => {
          const status = statusConfig[item.syncStatus];
          const StatusIcon = status.icon;
          const rate = item.draftCount > 0 ? Math.round((item.syncedCount / item.draftCount) * 100) : 0;
          return (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: item.platformColor + '20' }}
                  >
                    <item.platformIcon className="w-5 h-5" style={{ color: item.platformColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{item.platform}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('text-xs flex items-center gap-1', status.color)}>
                        <StatusIcon className={cn('w-3 h-3', item.syncStatus === 'syncing' && 'animate-spin')} />
                        {status.label}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.lastSync}
                      </span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs">
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    同步
                  </Button>
                </div>

                {/* 同步进度 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">同步进度</span>
                    <span className="text-xs font-medium">
                      {item.syncedCount} / {item.draftCount}
                    </span>
                  </div>
                  <Progress
                    value={rate}
                    className={cn(
                      'h-1.5',
                      item.syncStatus === 'success' && '[&>div]:bg-[hsl(130_54%_42%)]',
                      item.syncStatus === 'syncing' && '[&>div]:bg-[hsl(46_100%_52%)]',
                      item.syncStatus === 'failed' && '[&>div]:bg-[hsl(2_84%_62%)]'
                    )}
                  />
                </div>

                 {/* 最近草稿 */}
                 <div className="space-y-2">
                   <div className="text-xs text-muted-foreground">最近草稿</div>
                   {item.recentDrafts.map((draft) => (
                     <div key={draft.id} className="flex items-center gap-2 text-sm py-1 group">
                       <span className="flex-1 truncate">{draft.title}</span>
                       <span className="text-xs text-muted-foreground shrink-0">{draft.time}</span>
                       {getDraftStatusBadge(draft.status)}
                       <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                         <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="编辑">
                           <Edit3 className="w-3 h-3" />
                         </Button>
                         <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[hsl(130_54%_42%)]" title="发布">
                           <Send className="w-3 h-3" />
                         </Button>
                         <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" title="删除">
                           <Trash2 className="w-3 h-3" />
                         </Button>
                       </div>
                     </div>
                   ))}
                 </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AnalyticsDraftsPage;

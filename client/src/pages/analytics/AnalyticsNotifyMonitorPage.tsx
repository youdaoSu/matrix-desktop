import { useState, useMemo } from 'react';
import {
  Bell,
  Info,
  Music,
  BookOpen,
  Video,
  Tv,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Download,
  PieChart as PieChartIcon,
  TrendingUp,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@client/src/components/ui/tabs';
import { Button } from '@client/src/components/ui/button';
import { cn } from '@/lib/utils';

interface NotifyItem {
  id: string;
  platform: string;
  platformIcon: typeof Music;
  platformColor: string;
  title: string;
  content: string;
  time: string;
  unread: boolean;
  type: 'system' | 'warning' | 'success';
}

const notifications: NotifyItem[] = [
  { id: '1', platform: '抖音', platformIcon: Music, platformColor: 'hsl(0 0% 8%)', title: '作品审核通过', content: '您发布的作品「北京烤鸭哪家强？」已通过审核，开始正常分发', time: '10分钟前', unread: true, type: 'success' },
  { id: '2', platform: '小红书', platformIcon: BookOpen, platformColor: 'hsl(350 85% 60%)', title: '账号安全提醒', content: '检测到异地登录，请确认是否为本人操作', time: '30分钟前', unread: true, type: 'warning' },
  { id: '3', platform: 'B站', platformIcon: Tv, platformColor: 'hsl(200 90% 55%)', title: '系统通知', content: 'B站开放平台API接口升级，部分功能可能受影响', time: '1小时前', unread: true, type: 'system' },
  { id: '4', platform: '抖音', platformIcon: Music, platformColor: 'hsl(0 0% 8%)', title: '流量扶持通知', content: '恭喜您获得新人流量扶持包，曝光量+5000', time: '2小时前', unread: false, type: 'success' },
  { id: '5', platform: '小红书', platformIcon: BookOpen, platformColor: 'hsl(350 85% 60%)', title: '违规提醒', content: '您的笔记「平价彩妆红黑榜」被投诉，已限制部分流量', time: '3小时前', unread: false, type: 'warning' },
  { id: '6', platform: '视频号', platformIcon: Video, platformColor: 'hsl(142 45% 45%)', title: '审核延迟通知', content: '由于平台审核压力较大，您的作品审核可能延迟1-2小时', time: '5小时前', unread: false, type: 'system' },
  { id: '7', platform: 'B站', platformIcon: Tv, platformColor: 'hsl(200 90% 55%)', title: '充电提醒', content: '您收到了5笔充电打赏，共计25元', time: '6小时前', unread: false, type: 'success' },
  { id: '8', platform: '抖音', platformIcon: Music, platformColor: 'hsl(0 0% 8%)', title: '账号升级通知', content: '您的账号已升级为企业认证账号', time: '昨天', unread: false, type: 'system' },
  { id: '9', platform: '小红书', platformIcon: BookOpen, platformColor: 'hsl(350 85% 60%)', title: '蒲公英合作邀请', content: '您收到了3个品牌合作邀请，快去看看吧', time: '昨天', unread: false, type: 'success' },
  { id: '10', platform: '视频号', platformIcon: Video, platformColor: 'hsl(142 45% 45%)', title: '原创保护开通', content: '恭喜您成功开通原创保护功能', time: '2天前', unread: false, type: 'success' },
];

const AnalyticsNotifyMonitorPage: React.FC = () => {
  const [platformFilter, setPlatformFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('all');

  const unreadCount = notifications.filter((n) => n.unread).length;
  const warningCount = notifications.filter((n) => n.type === 'warning').length;
  const successCount = notifications.filter((n) => n.type === 'success').length;
  const systemCount = notifications.filter((n) => n.type === 'system').length;

  const typeDistribution = useMemo(() => [
    { name: '系统通知', count: systemCount, color: 'hsl(221 83% 53%)' },
    { name: '成功通知', count: successCount, color: 'hsl(130 54% 42%)' },
    { name: '告警通知', count: warningCount, color: 'hsl(26 90% 49%)' },
  ], [systemCount, successCount, warningCount]);

  const dailyTrend = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      data.push({
        day: `${d.getMonth() + 1}/${d.getDate()}`,
        count: Math.floor(Math.random() * 15) + 5,
        warning: Math.floor(Math.random() * 3) + 1,
      });
    }
    return data;
  }, []);

  const totalTypeCount = typeDistribution.reduce((s, t) => s + t.count, 0) || 1;
  const maxDailyCount = Math.max(...dailyTrend.map((d) => d.count + d.warning));

  const filteredNotifications = notifications.filter((n) => {
    if (platformFilter !== 'all' && n.platform !== platformFilter) return false;
    if (activeTab === 'unread' && !n.unread) return false;
    if (activeTab === 'warning' && n.type !== 'warning') return false;
    return true;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-[hsl(130_54%_42%)]" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-[hsl(26_90%_49%)]" />;
      default: return <Info className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-info/10 border-info/30 text-info">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info text-xs">
          系统通知数据来自已授权自有矩阵账号的平台官方接口 · 仅用于及时了解账号状态变动
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">通知监控</h1>
          <p className="text-sm text-muted-foreground mt-1">集中查看各平台系统通知，及时处理重要事项</p>
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
           <Button variant="outline" size="sm">
             <Download className="w-4 h-4 mr-1" />
             导出
           </Button>
         </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-ai-section-type="card-stat">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">未读通知</span>
              <Bell className="w-4 h-4 text-[hsl(26_90%_49%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{unreadCount}</div>
            <div className="text-xs text-muted-foreground">条未读消息</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">告警通知</span>
              <AlertTriangle className="w-4 h-4 text-[hsl(2_84%_62%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{warningCount}</div>
            <div className="text-xs text-[hsl(2_84%_62%)]">需要关注</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">监控平台</span>
              <Filter className="w-4 h-4 text-[hsl(130_54%_42%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">4</div>
            <div className="text-xs text-muted-foreground">个平台接入</div>
          </CardContent>
        </Card>
      </div>

       {/* 类型分布 + 趋势图 */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         {/* 通知类型分布饼图 */}
         <Card>
           <CardHeader className="pb-2">
             <CardTitle className="text-base flex items-center gap-2">
               <PieChartIcon className="w-4 h-4" />
               通知类型分布
             </CardTitle>
           </CardHeader>
           <CardContent className="pt-2">
             <div className="flex items-center gap-4">
               <div className="relative w-28 h-28 shrink-0">
                 <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                   {typeDistribution.reduce(
                     (acc, item, i) => {
                       const pct = (item.count / totalTypeCount) * 100;
                       const dash = `${pct * 2.51} ${251.2 - pct * 2.51}`;
                       const offset = -acc.offset * 2.51;
                       acc.items.push(
                         <circle
                           key={i}
                           cx="50"
                           cy="50"
                           r="40"
                           fill="none"
                           stroke={item.color}
                           strokeWidth="16"
                           strokeDasharray={dash}
                           strokeDashoffset={offset}
                         />
                       );
                       acc.offset += pct;
                       return acc;
                     },
                     { items: [] as React.ReactNode[], offset: 0 }
                   ).items}
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                   <div className="text-lg font-bold text-foreground">{totalTypeCount}</div>
                   <div className="text-[10px] text-muted-foreground">通知总数</div>
                 </div>
               </div>
               <div className="flex-1 space-y-2">
                 {typeDistribution.map((item) => (
                   <div key={item.name} className="flex items-center gap-2 text-xs">
                     <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                     <span className="text-foreground flex-1">{item.name}</span>
                     <span className="font-mono font-medium">{item.count}</span>
                     <span className="text-muted-foreground">
                       {((item.count / totalTypeCount) * 100).toFixed(0)}%
                     </span>
                   </div>
                 ))}
               </div>
             </div>
           </CardContent>
         </Card>

         {/* 每日趋势 */}
         <Card className="md:col-span-2">
           <CardHeader className="pb-2">
             <CardTitle className="text-base flex items-center gap-2">
               <TrendingUp className="w-4 h-4" />
               近7日通知趋势
             </CardTitle>
           </CardHeader>
           <CardContent className="pt-2">
             <div className="h-36">
               <svg className="w-full h-full" viewBox="0 0 500 130" preserveAspectRatio="none">
                 {/* Grid */}
                 {[0, 1, 2, 3].map((i) => (
                   <line key={i} x1="0" y1={30 * i + 10} x2="500" y2={30 * i + 10} stroke="hsl(220 14% 89%)" strokeDasharray="3 3" />
                 ))}
                 {/* Bars */}
                 {dailyTrend.map((d, i) => {
                   const barWidth = 500 / dailyTrend.length - 20;
                   const x = (i / dailyTrend.length) * 500 + 10;
                   const totalH = ((d.count + d.warning) / maxDailyCount) * 100;
                   const warningH = (d.warning / maxDailyCount) * 100;
                   const normalH = totalH - warningH;
                   return (
                     <g key={i}>
                       <rect
                         x={x}
                         y={115 - totalH}
                         width={barWidth}
                         height={normalH}
                         fill="hsl(221 83% 53%)"
                         rx="2"
                       />
                       {warningH > 0 && (
                         <rect
                           x={x}
                           y={115 - totalH + normalH}
                           width={barWidth}
                           height={warningH}
                           fill="hsl(26 90% 49%)"
                           rx="2"
                         />
                       )}
                       <text x={x + barWidth / 2} y="128" textAnchor="middle" fontSize="9" fill="hsl(218 7% 59%)">{d.day}</text>
                     </g>
                   );
                 })}
               </svg>
               <div className="flex items-center gap-4 text-xs text-muted-foreground justify-end mt-1">
                 <span className="flex items-center gap-1">
                   <span className="w-2 h-2 bg-primary rounded-sm" /> 系统/成功
                 </span>
                 <span className="flex items-center gap-1">
                   <span className="w-2 h-2 bg-[hsl(26_90%_49%)] rounded-sm" /> 告警
                 </span>
               </div>
             </div>
           </CardContent>
         </Card>
       </div>

       {/* 通知列表 */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">通知列表</CardTitle>
            <span className="text-xs text-muted-foreground">共 {filteredNotifications.length} 条</span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 w-64">
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="unread">未读 ({unreadCount})</TabsTrigger>
              <TabsTrigger value="warning">告警 ({warningCount})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <div className="space-y-2">
                {filteredNotifications.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                      item.unread
                        ? 'bg-[hsl(26_90%_49%)]/5 border-[hsl(26_90%_49%)]/20'
                        : 'bg-card border-border hover:bg-muted/30'
                    )}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: item.platformColor + '20' }}
                    >
                      <item.platformIcon className="w-4 h-4" style={{ color: item.platformColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] h-4">
                          {item.platform}
                        </Badge>
                        {getTypeIcon(item.type)}
                        <span className="font-medium text-sm">{item.title}</span>
                        {item.unread && (
                          <span className="w-2 h-2 rounded-full bg-[hsl(2_84%_62%)] shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{item.content}</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="unread" className="mt-4">
              <div className="space-y-2">
                {filteredNotifications.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-[hsl(26_90%_49%)]/5 border-[hsl(26_90%_49%)]/20"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: item.platformColor + '20' }}
                    >
                      <item.platformIcon className="w-4 h-4" style={{ color: item.platformColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] h-4">{item.platform}</Badge>
                        {getTypeIcon(item.type)}
                        <span className="font-medium text-sm">{item.title}</span>
                        <span className="w-2 h-2 rounded-full bg-[hsl(2_84%_62%)] shrink-0" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{item.content}</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                  </div>
                ))}
                {filteredNotifications.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground text-sm">暂无未读通知</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="warning" className="mt-4">
              <div className="space-y-2">
                {filteredNotifications.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-[hsl(26_90%_49%)]/30 bg-[hsl(26_90%_49%)]/5"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[hsl(26_90%_49%)]/20">
                      <AlertTriangle className="w-4 h-4 text-[hsl(26_90%_49%)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] h-4">{item.platform}</Badge>
                        <span className="font-medium text-sm">{item.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{item.content}</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                  </div>
                ))}
                {filteredNotifications.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground text-sm">暂无告警通知</div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsNotifyMonitorPage;

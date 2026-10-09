import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Info,
  Music,
  BookOpen,
  Video,
  Tv,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
  Download,
  X,
  FileWarning,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@client/src/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Image } from '@client/src/components/ui/image';

interface ViolationItem {
  id: string;
  title: string;
  platform: string;
  platformIcon: typeof Music;
  platformColor: string;
  thumbnail: string;
  reason: string;
  suggestion: string;
  status: 'pending' | 'appealed' | 'resolved' | 'failed';
  time: string;
  violationType: string;
}

const violations: ViolationItem[] = [
  {
    id: '1',
    title: '平价彩妆红黑榜｜学生党必看避雷指南',
    platform: '小红书',
    platformIcon: BookOpen,
    platformColor: 'hsl(350 85% 60%)',
    thumbnail: 'https://picsum.photos/seed/v1/120/80',
    reason: '涉嫌虚假宣传，夸大产品效果',
    suggestion: '建议修改文案中"绝对有效""100%见效"等表述，补充真实测评数据',
    status: 'pending',
    time: '3小时前',
    violationType: '虚假宣传',
  },
  {
    id: '2',
    title: '三亚5天4晚自由行攻略',
    platform: '抖音',
    platformIcon: Music,
    platformColor: 'hsl(0 0% 8%)',
    thumbnail: 'https://picsum.photos/seed/v2/120/80',
    reason: '背景音乐涉嫌版权侵权',
    suggestion: '建议更换为平台授权音乐库内的音乐，或使用原创背景音乐',
    status: 'appealed',
    time: '1天前',
    violationType: '版权侵权',
  },
  {
    id: '3',
    title: '程序员桌面好物分享',
    platform: 'B站',
    platformIcon: Tv,
    platformColor: 'hsl(200 90% 55%)',
    thumbnail: 'https://picsum.photos/seed/v3/120/80',
    reason: '视频中含有第三方推广链接未标注',
    suggestion: '请在视频简介和视频中明确标注推广合作信息',
    status: 'resolved',
    time: '2天前',
    violationType: '未标推广',
  },
  {
    id: '4',
    title: '秋季护肤全攻略',
    platform: '小红书',
    platformIcon: BookOpen,
    platformColor: 'hsl(350 85% 60%)',
    thumbnail: 'https://picsum.photos/seed/v4/120/80',
    reason: '使用医疗术语描述化妆品功效',
    suggestion: '删除"治疗""修复肌肤屏障"等医疗用语，改为"改善""呵护"等表述',
    status: 'failed',
    time: '3天前',
    violationType: '违规用词',
  },
  {
    id: '5',
    title: '职场新人避坑指南',
    platform: '视频号',
    platformIcon: Video,
    platformColor: 'hsl(142 45% 45%)',
    thumbnail: 'https://picsum.photos/seed/v5/120/80',
    reason: '标题党，内容与标题不符',
    suggestion: '建议修改标题，使其与实际内容相符，避免使用过度吸引眼球的表述',
    status: 'pending',
    time: '5小时前',
    violationType: '标题党',
  },
];

const statusConfig = {
  pending: { label: '待处理', color: 'text-[hsl(26_90%_49%)]', bg: 'bg-[hsl(26_90%_49%)]/10', border: 'border-[hsl(26_90%_49%)]/20', icon: AlertCircle },
  appealed: { label: '申诉中', color: 'text-[hsl(46_100%_45%)]', bg: 'bg-[hsl(46_100%_52%)]/10', border: 'border-[hsl(46_100%_52%)]/20', icon: Clock },
  resolved: { label: '已解决', color: 'text-[hsl(130_54%_42%)]', bg: 'bg-[hsl(130_54%_42%)]/10', border: 'border-[hsl(130_54%_42%)]/20', icon: CheckCircle },
  failed: { label: '申诉失败', color: 'text-[hsl(2_84%_62%)]', bg: 'bg-[hsl(2_84%_62%)]/10', border: 'border-[hsl(2_84%_62%)]/20', icon: XCircle },
};

const AnalyticsViolationPage: React.FC = () => {
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<ViolationItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const violationTypeStats = useMemo(() => {
    const map = new Map<string, number>();
    violations.forEach((v) => {
      map.set(v.violationType, (map.get(v.violationType) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, []);

  const maxTypeCount = Math.max(...violationTypeStats.map((t) => t.count), 1);

  const pendingCount = violations.filter((v) => v.status === 'pending').length;
  const totalCount = violations.length;
  const resolvedRate = Math.round((violations.filter((v) => v.status === 'resolved').length / totalCount) * 100);

  const filteredViolations = violations.filter((v) => {
    if (platformFilter !== 'all' && v.platform !== platformFilter) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-info/10 border-info/30 text-info">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info text-xs">
          违规通知数据来自已授权自有矩阵账号的平台官方接口 · 仅用于运营合规管理参考
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">作品违规</h1>
          <p className="text-sm text-muted-foreground mt-1">集中查看各平台违规作品，及时处理降低账号风险</p>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待处理</SelectItem>
              <SelectItem value="appealed">申诉中</SelectItem>
              <SelectItem value="resolved">已解决</SelectItem>
              <SelectItem value="failed">申诉失败</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

       <div className="flex items-center gap-2">
         <Button variant="outline" size="sm" className="ml-auto">
           <Download className="w-4 h-4 mr-1" />
           导出违规记录
         </Button>
       </div>

       {/* 统计卡片 */}
       <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-ai-section-type="card-stat">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">待处理</span>
              <AlertTriangle className="w-4 h-4 text-[hsl(2_84%_62%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{pendingCount}</div>
            <div className="text-xs text-[hsl(2_84%_62%)]">需要及时处理</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">申诉中</span>
              <Clock className="w-4 h-4 text-[hsl(46_100%_45%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">
              {violations.filter((v) => v.status === 'appealed').length}
            </div>
            <div className="text-xs text-muted-foreground">等待平台审核</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">已解决</span>
              <CheckCircle className="w-4 h-4 text-[hsl(130_54%_42%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">
              {violations.filter((v) => v.status === 'resolved').length}
            </div>
            <div className="text-xs text-[hsl(130_54%_42%)]">解决率 {resolvedRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">累计违规</span>
              <Filter className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{totalCount}</div>
            <div className="text-xs text-muted-foreground">近30天</div>
          </CardContent>
        </Card>
      </div>

       {/* 违规类型分布 + 列表 */}
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
         {/* 违规类型分布 */}
         <Card>
           <CardHeader className="pb-2">
             <CardTitle className="text-base flex items-center gap-2">
               <FileWarning className="w-4 h-4" />
               违规类型分布
             </CardTitle>
           </CardHeader>
           <CardContent className="pt-2 space-y-2">
             {violationTypeStats.map((item, i) => (
               <div key={item.name} className="space-y-1">
                 <div className="flex items-center justify-between text-xs">
                   <span className="text-foreground">{item.name}</span>
                   <span className="font-medium text-muted-foreground">{item.count}</span>
                 </div>
                 <div className="h-2 bg-muted rounded-full overflow-hidden">
                   <div
                     className={cn(
                       'h-full rounded-full',
                       i === 0 && 'bg-[hsl(2_84%_62%)]',
                       i === 1 && 'bg-[hsl(26_90%_49%)]',
                       i === 2 && 'bg-[hsl(46_100%_52%)]',
                       i >= 3 && 'bg-primary'
                     )}
                     style={{ width: `${(item.count / maxTypeCount) * 100}%` }}
                   />
                 </div>
               </div>
             ))}
           </CardContent>
         </Card>

         {/* 违规列表 */}
         <Card className="lg:col-span-2">
           <CardHeader className="pb-0">
             <div className="flex items-center justify-between">
               <CardTitle className="text-base">违规作品列表</CardTitle>
               <span className="text-xs text-muted-foreground">共 {filteredViolations.length} 条</span>
             </div>
           </CardHeader>
           <CardContent className="pt-4">
             <div className="space-y-3">
                {filteredViolations.map((item) => {
                  const status = statusConfig[item.status];
                  const StatusIcon = status.icon;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-start gap-4 p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow',
                        status.bg,
                        status.border
                      )}
                      onClick={() => { setSelectedItem(item); setDetailOpen(true); }}
                    >
                      <div className="w-24 h-16 rounded-md overflow-hidden bg-muted shrink-0">
                        <Image src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 gap-1"
                            style={{ backgroundColor: item.platformColor + '15', color: item.platformColor, borderColor: item.platformColor + '30' }}
                          >
                            <item.platformIcon className="w-3 h-3" />
                            {item.platform}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] h-4 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30">
                        {item.violationType}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                        <Clock className="w-3 h-3" />
                        {item.time}
                      </span>
                    </div>
                    <h3 className="font-medium text-sm mb-2 line-clamp-1">{item.title}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">违规原因：</span>
                        <span className="text-foreground">{item.reason}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">处理建议：</span>
                        <span className="text-foreground">{item.suggestion}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Badge className={cn('gap-1 border', status.bg, status.color, status.border)}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </Badge>
                      {item.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            去修改
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            发起申诉
                          </Button>
                        </>
                      )}
                      {item.status === 'appealed' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled>
                          等待结果
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
             </div>
           </CardContent>
         </Card>
       </div>

       {/* 违规详情弹窗 */}
       <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
         <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle className="text-base">违规详情</DialogTitle>
           </DialogHeader>
           {selectedItem && (
             <div className="space-y-4">
               <div className="flex gap-4">
                 <div className="w-32 h-20 rounded-md overflow-hidden bg-muted shrink-0">
                   <Image src={selectedItem.thumbnail} alt={selectedItem.title} className="w-full h-full object-cover" />
                 </div>
                 <div className="flex-1 min-w-0">
                   <h3 className="font-semibold text-foreground mb-1 line-clamp-2">{selectedItem.title}</h3>
                   <div className="flex items-center gap-2">
                     <Badge
                       variant="secondary"
                       className="text-[10px] h-4 gap-1"
                       style={{ backgroundColor: selectedItem.platformColor + '15', color: selectedItem.platformColor, borderColor: selectedItem.platformColor + '30' }}
                     >
                       <selectedItem.platformIcon className="w-3 h-3" />
                       {selectedItem.platform}
                     </Badge>
                     <Badge variant="outline" className="text-[10px] h-4 text-[hsl(2_84%_62%)] border-[hsl(2_84%_62%)]/30">
                       {selectedItem.violationType}
                     </Badge>
                   </div>
                 </div>
               </div>

               <div className="space-y-3">
                 <div className="bg-[hsl(2_84%_62%)]/5 border border-[hsl(2_84%_62%)]/20 rounded-lg p-3">
                   <div className="text-xs font-medium text-[hsl(2_84%_62%)] mb-1">违规原因</div>
                   <p className="text-sm text-foreground">{selectedItem.reason}</p>
                 </div>

                 <div className="bg-info/5 border border-info/20 rounded-lg p-3">
                   <div className="text-xs font-medium text-info mb-1">平台通知</div>
                   <p className="text-sm text-foreground">
                     您的作品「{selectedItem.title}」因违反《{selectedItem.platform}社区规范》，已被限制流量推荐。如对结果有异议，可在3天内发起申诉。
                   </p>
                 </div>

                 <div className="bg-[hsl(130_54%_42%)]/5 border border-[hsl(130_54%_42%)]/20 rounded-lg p-3">
                   <div className="text-xs font-medium text-[hsl(130_54%_42%)] mb-1">处理建议</div>
                   <p className="text-sm text-foreground">{selectedItem.suggestion}</p>
                 </div>
               </div>

               <div className="flex items-center gap-2">
                 <Badge className={cn('gap-1 border', statusConfig[selectedItem.status].bg, statusConfig[selectedItem.status].color, statusConfig[selectedItem.status].border)}>
                   {(() => {
                     const s = statusConfig[selectedItem.status];
                     const Icon = s.icon;
                     return <><Icon className="w-3 h-3" />{s.label}</>;
                   })()}
                 </Badge>
                 <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                   <Clock className="w-3 h-3" />
                   {selectedItem.time}
                 </span>
               </div>

               <div className="flex gap-2 pt-2 border-t">
                 {selectedItem.status === 'pending' && (
                   <>
                     <Button className="flex-1">去修改作品</Button>
                     <Button variant="outline" className="flex-1">发起申诉</Button>
                   </>
                 )}
                 {selectedItem.status === 'appealed' && (
                   <Button variant="outline" className="flex-1" disabled>申诉审核中</Button>
                 )}
                 {selectedItem.status === 'resolved' && (
                   <Button variant="outline" className="flex-1">查看修改记录</Button>
                 )}
                 {selectedItem.status === 'failed' && (
                   <Button className="flex-1">重新申诉</Button>
                 )}
               </div>
             </div>
           )}
         </DialogContent>
       </Dialog>
     </div>
   );
};

export default AnalyticsViolationPage;

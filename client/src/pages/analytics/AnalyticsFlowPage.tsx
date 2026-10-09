import { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Info,
  Play,
  Clock,
  Eye,
  Music,
  BookOpen,
  Video as VideoIcon,
  Tv,
  Search,
  Download,
  BarChart3,
  Layers,
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
import { Input } from '@client/src/components/ui/input';
import { Switch } from '@client/src/components/ui/switch';
import { Label } from '@client/src/components/ui/label';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';

// Per-account flow data generation
const generateAccountFlowData = (accounts: FlowItem[], hours: number) => {
  const data = [];
  for (let i = hours; i >= 0; i--) {
    const hour = new Date();
    hour.setHours(hour.getHours() - i);
    const timeStr = `${hour.getHours()}:00`;
    const point: Record<string, string | number> = { time: timeStr };
    accounts.forEach((acc) => {
      // Simulate flow pattern: higher in evening, lower at night
      const h = hour.getHours();
      const basePattern = h >= 18 || h <= 1 ? 1.5 : h >= 12 ? 1.0 : 0.6;
      point[acc.id] = Math.floor(acc.flowRate * basePattern * (0.7 + Math.random() * 0.6));
    });
    data.push(point);
  }
  return data;
};

interface FlowItem {
  id: string;
  title: string;
  platform: string;
  accountName: string;
  color: string;
  plays: number;
  flowRate: number;
  trend: 'up' | 'down' | 'flat';
  sparkline: number[];
}

const generateSparkline = (base: number, variance: number, count: number): number[] => {
  const data: number[] = [];
  let current = base;
  for (let i = 0; i < count; i++) {
    current += Math.random() * variance * 2 - variance * 0.3;
    data.push(Math.max(0, Math.floor(current)));
  }
  return data;
};

const initialFlowItems: FlowItem[] = [
  { id: '1', title: '猫咪日常｜我家主子的一天', platform: '抖音', accountName: '美食探店小队', color: 'hsl(26 90% 49%)', plays: 312450, flowRate: 2580, trend: 'up', sparkline: generateSparkline(2000, 800, 12) },
  { id: '2', title: '三亚5天4晚自由行攻略', platform: '抖音', accountName: '旅行日记Vlog', color: 'hsl(340 85% 55%)', plays: 234560, flowRate: 1890, trend: 'up', sparkline: generateSparkline(1500, 600, 12) },
  { id: '3', title: '北京烤鸭哪家强？5家老字号测评', platform: '抖音', accountName: '美食探店小队', color: 'hsl(26 90% 49%)', plays: 152340, flowRate: 1240, trend: 'up', sparkline: generateSparkline(1000, 400, 12) },
  { id: '4', title: '数码开箱｜最新旗舰手机深度评测', platform: 'B站', accountName: '科技宅频道', color: 'hsl(200 90% 55%)', plays: 145670, flowRate: 980, trend: 'flat', sparkline: generateSparkline(800, 200, 12) },
  { id: '5', title: '平价彩妆红黑榜｜学生党必看', platform: '小红书', accountName: '美妆测评师', color: 'hsl(350 85% 60%)', plays: 0, flowRate: 860, trend: 'up', sparkline: generateSparkline(700, 300, 12) },
  { id: '6', title: '程序员桌面好物分享', platform: 'B站', accountName: '科技宅频道', color: 'hsl(200 90% 55%)', plays: 98760, flowRate: 720, trend: 'down', sparkline: generateSparkline(900, 400, 12) },
  { id: '7', title: '秋季护肤全攻略', platform: '小红书', accountName: '美妆测评师', color: 'hsl(350 85% 60%)', plays: 0, flowRate: 650, trend: 'up', sparkline: generateSparkline(500, 200, 12) },
  { id: '8', title: '新手健身入门｜30天蜕变计划', platform: 'B站', accountName: '科技宅频道', color: 'hsl(200 90% 55%)', plays: 67890, flowRate: 540, trend: 'flat', sparkline: generateSparkline(500, 150, 12) },
  { id: '9', title: '职场新人避坑指南', platform: '视频号', accountName: '职场成长', color: 'hsl(142 45% 45%)', plays: 45230, flowRate: 380, trend: 'up', sparkline: generateSparkline(300, 100, 12) },
  { id: '10', title: '家居收纳技巧｜小户型', platform: '小红书', accountName: '生活种草日记', color: 'hsl(340 85% 45%)', plays: 0, flowRate: 320, trend: 'down', sparkline: generateSparkline(400, 150, 12) },
];

const totalFlowData = [
  { time: '00:00', flow: 1200 },
  { time: '02:00', flow: 680 },
  { time: '04:00', flow: 450 },
  { time: '06:00', flow: 890 },
  { time: '08:00', flow: 2100 },
  { time: '10:00', flow: 3200 },
  { time: '12:00', flow: 4500 },
  { time: '14:00', flow: 3800 },
  { time: '16:00', flow: 3500 },
  { time: '18:00', flow: 4200 },
  { time: '20:00', flow: 5600 },
  { time: '22:00', flow: 4800 },
];

const formatCount = (n: number): string => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
};

const AnalyticsFlowPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState('24h');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [items, setItems] = useState<FlowItem[]>(initialFlowItems);
  const [showCompare, setShowCompare] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(initialFlowItems.slice(0, 4).map((i) => i.id));

  // 模拟流速变化
  useEffect(() => {
    const timer = setInterval(() => {
      setItems((prev) =>
        prev.map((item) => {
          const delta = Math.floor(Math.random() * 100) - 20;
          const newRate = Math.max(0, item.flowRate + delta);
          const newSparkline = [...item.sparkline.slice(1), newRate];
          const trend: 'up' | 'down' | 'flat' =
            delta > 10 ? 'up' : delta < -10 ? 'down' : 'flat';
          return {
            ...item,
            flowRate: newRate,
            plays: item.plays + Math.floor(newRate / 60),
            sparkline: newSparkline,
            trend,
          };
        })
      );
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const totalFlow = items.reduce((sum, item) => sum + item.flowRate, 0);
  const avgFlow = Math.floor(totalFlow / items.length);

  const accountFlowData = useMemo(() => {
    const topAccounts = items.slice(0, 6);
    return generateAccountFlowData(topAccounts, 24);
  }, [items]);

  // Find peak time
  const peakTime = useMemo(() => {
    if (totalFlowData.length === 0) return { time: '', flow: 0 };
    const data = totalFlowData as { time: string; flow: number }[];
    const peak = data.reduce((max, cur) => (cur.flow > max.flow ? cur : max), data[0]);
    return peak;
  }, []);

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <Alert variant="default" className="bg-info/10 border-info/30 text-info">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-info text-xs">
          播放流速数据为每5分钟采样平均值，仅供运营趋势参考 · 数据来源：平台官方开放接口
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">播放流速</h1>
          <p className="text-sm text-muted-foreground mt-1">实时监控作品播放增长速度，捕捉爆款趋势</p>
        </div>
        <div className="flex items-center gap-2">
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
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="时间范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">近1小时</SelectItem>
              <SelectItem value="24h">近24小时</SelectItem>
              <SelectItem value="7d">近7天</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 总览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-ai-section-type="card-stat">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">当前总流速</span>
              <Zap className="w-4 h-4 text-[hsl(26_90%_49%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{formatCount(totalFlow)}</div>
            <div className="text-xs text-[hsl(130_54%_42%)] flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +12.5% 较上小时
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">峰值流速</span>
              <TrendingUp className="w-4 h-4 text-[hsl(130_54%_42%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">5,600</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              今日 20:00
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">作品平均流速</span>
              <Play className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">{formatCount(avgFlow)}</div>
            <div className="text-xs text-muted-foreground">每小时播放增量</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">高速增长作品</span>
              <Zap className="w-4 h-4 text-[hsl(130_54%_42%)]" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">4</div>
            <div className="text-xs text-[hsl(130_54%_42%)]">流速 ＞ 1000/小时</div>
          </CardContent>
        </Card>
      </div>

       {/* 账号对比切换 */}
       <div className="flex items-center justify-between flex-wrap gap-3">
         <div className="flex items-center gap-3">
           <div className="flex items-center gap-2">
             <Switch id="compare-mode" checked={showCompare} onCheckedChange={setShowCompare} />
             <Label htmlFor="compare-mode" className="text-sm">分账号对比</Label>
           </div>
         </div>
         {showCompare && (
           <div className="flex items-center gap-2 flex-wrap">
             <span className="text-xs text-muted-foreground">显示账号：</span>
             {items.slice(0, 6).map((item, i) => (
               <button
                 key={item.id}
                 onClick={() => toggleAccount(item.id)}
                 className={cn(
                   'px-2 py-1 rounded text-xs border transition-colors',
                   selectedAccounts.includes(item.id)
                     ? 'border-primary bg-primary/10 text-primary'
                     : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                 )}
                 style={selectedAccounts.includes(item.id) ? { borderColor: item.color, backgroundColor: item.color + '15', color: item.color } : {}}
               >
                 {item.accountName}
               </button>
             ))}
           </div>
         )}
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* 总览趋势图 */}
         <Card className="lg:col-span-2">
           <CardHeader className="pb-2">
             <div className="flex items-center justify-between">
               <CardTitle className="text-base flex items-center gap-2">
                 {showCompare ? <Layers className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
                 {showCompare ? '分账号流速对比' : '整体流速趋势'}
               </CardTitle>
               <Badge variant="outline" className="text-[10px] h-4 gap-1">
                 <Zap className="w-3 h-3 text-[hsl(130_54%_42%)]" />
                 峰值 {peakTime.time} · {formatCount(peakTime.flow)}
               </Badge>
             </div>
           </CardHeader>
           <CardContent className="pt-2">
             <div className="h-72">
               <ResponsiveContainer width="100%" height="100%">
                 {showCompare ? (
                   <LineChart data={accountFlowData}>
                     <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 89%)" />
                     <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="hsl(218 7% 59%)" />
                     <YAxis tick={{ fontSize: 11 }} stroke="hsl(218 7% 59%)" />
                     <Tooltip
                       contentStyle={{ background: 'white', border: '1px solid hsl(220 14% 89%)', borderRadius: '8px', fontSize: '12px' }}
                     />
                     <Legend wrapperStyle={{ fontSize: '11px' }} />
                     {items.slice(0, 6).filter((item) => selectedAccounts.includes(item.id)).map((item) => (
                       <Line
                         key={item.id}
                         type="monotone"
                         dataKey={item.id}
                         name={item.accountName}
                         stroke={item.color}
                         strokeWidth={2}
                         dot={false}
                       />
                     ))}
                   </LineChart>
                 ) : (
                   <AreaChart data={totalFlowData}>
                     <defs>
                       <linearGradient id="flowGradient" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="hsl(26 90% 49%)" stopOpacity={0.3} />
                         <stop offset="95%" stopColor="hsl(26 90% 49%)" stopOpacity={0} />
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 89%)" />
                     <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="hsl(218 7% 59%)" />
                     <YAxis tick={{ fontSize: 11 }} stroke="hsl(218 7% 59%)" />
                     <Tooltip
                       contentStyle={{ background: 'white', border: '1px solid hsl(220 14% 89%)', borderRadius: '8px', fontSize: '12px' }}
                     />
                     <Area type="monotone" dataKey="flow" name="流速" stroke="hsl(26 90% 49%)" strokeWidth={2} fill="url(#flowGradient)" />
                   </AreaChart>
                 )}
               </ResponsiveContainer>
             </div>
           </CardContent>
         </Card>

        {/* 流速排行 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">流速排行榜</CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-3 max-h-[400px] overflow-y-auto">
            {items.slice(0, 10).map((item, index) => (
              <div key={item.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md transition-colors">
                <div
                  className={cn(
                    'w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0',
                    index === 0 ? 'bg-[hsl(2_84%_62%)]' :
                    index === 1 ? 'bg-[hsl(26_90%_49%)]' :
                    index === 2 ? 'bg-[hsl(46_100%_52%)]' :
                    'bg-muted-foreground/40'
                  )}
                >
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] h-4">{item.platform}</Badge>
                    <span className="text-[10px] text-muted-foreground">{formatCount(item.plays)} 播放</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="text-sm font-semibold text-[hsl(26_90%_49%)]">
                    +{formatCount(item.flowRate)}
                  </div>
                  <div className="w-20 h-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={item.sparkline.map((v, i) => ({ v, i }))}>
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke={item.trend === 'down' ? 'hsl(2 84% 62%)' : 'hsl(130 54% 42%)'}
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnalyticsFlowPage;

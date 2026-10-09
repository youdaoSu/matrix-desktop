import {
  Download,
  TrendingUp,
  TrendingDown,
  MessageSquareText,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { PlatformType, PlatformAccount } from '@shared/api.interface';
import { Card, CardContent } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import {
  Music,
  BookOpen,
  Video,
  Tv,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const platformMeta: Record<PlatformType, { label: string; color: string; icon: any }> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

interface AccountItem extends PlatformAccount {
  groupName: string;
}

interface CreatorDashboardProps {
  account: AccountItem;
}

/* 看板示例数据 */
const appealMetrics = [
  { name: '完播率', value: '8.81%', delta: '+515.97%', up: true },
  { name: '平均播放时长', value: '23秒', delta: '+133.14%', up: true },
  { name: '2s跳出率', value: '33.47%', delta: '-20.33%', up: true },
  { name: '5s完播率', value: '49.17%', delta: '+50.25%', up: true },
  { name: '平均播放占比', value: '12.69%', delta: '+70.13%', up: true },
  { name: '互动率', value: '4.32%', delta: '-2.15%', up: false },
];

const watchTrendData = [
  { time: '00:00', current: 100, peer: 100 },
  { time: '00:24', current: 82, peer: 75 },
  { time: '00:48', current: 68, peer: 58 },
  { time: '01:12', current: 54, peer: 42 },
  { time: '01:36', current: 42, peer: 30 },
  { time: '02:00', current: 33, peer: 22 },
  { time: '02:24', current: 24, peer: 15 },
  { time: '02:48', current: 16, peer: 10 },
];

const trafficSources = [
  { name: '推荐页', percent: 62.3, delta: '+3.2%', up: true },
  { name: '关注页', percent: 15.7, delta: '-1.1%', up: false },
  { name: '搜索', percent: 8.4, delta: '+0.8%', up: true },
  { name: '消息页', percent: 5.2, delta: '+0.3%', up: true },
  { name: '个人主页', percent: 4.1, delta: '-0.5%', up: false },
  { name: '其他', percent: 4.3, delta: '+0.2%', up: true },
];

const otherAppSources = [
  { name: '抖音极速版', percent: 12.5, delta: '+1.2%', up: true },
  { name: '今日头条', percent: 5.8, delta: '-0.3%', up: false },
];

const searchKeywordsSeen = [
  { word: '美食探店', percent: 23.5 },
  { word: '北京美食', percent: 18.2 },
  { word: '网红餐厅', percent: 14.7 },
  { word: '川菜推荐', percent: 11.3 },
  { word: '日料自助', percent: 9.8 },
  { word: '胡同小吃', percent: 7.6 },
];

const searchKeywordsAfter = [
  { word: '餐厅地址', percent: 31.2 },
  { word: '人均消费', percent: 24.5 },
  { word: '营业时间', percent: 16.8 },
  { word: '预约方式', percent: 12.1 },
  { word: '停车攻略', percent: 8.4 },
  { word: '优惠活动', percent: 7.0 },
];

const chapterClicks = [
  { time: '00:15', title: '开场：本期餐厅亮点预告', ctr: '68.5%' },
  { time: '01:02', title: '第一道菜：招牌毛血旺', ctr: '52.3%' },
  { time: '02:18', title: '第二道菜：夫妻肺片', ctr: '41.7%' },
  { time: '03:45', title: '环境与服务点评', ctr: '33.2%' },
  { time: '05:10', title: '总结：性价比与推荐指数', ctr: '28.9%' },
];

const CreatorDashboard = ({ account }: CreatorDashboardProps) => {
  const meta = platformMeta[account.platform];
  const Icon = meta.icon;

  return (
    <div className="space-y-4">
      {/* 看板头部 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: meta.color }}
              >
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{meta.label}创作者中心</h2>
                <p className="text-xs text-muted-foreground">{account.nickname} · 数据概览</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 font-normal text-xs">数据中心</Badge>
              <Badge variant="secondary" className="gap-1 font-normal text-xs">
                <MessageSquareText className="w-3 h-3" />
                评论管理
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 内容吸引力 + 流量来源 + 搜索关键词（左右布局） */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左 & 中：内容吸引力 + 观看趋势 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 内容吸引力 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">内容吸引力</h3>
                <Button variant="outline" size="sm" className="gap-1 h-7">
                  <Download className="w-3.5 h-3.5" />
                  导出
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {appealMetrics.map((m) => (
                  <div
                    key={m.name}
                    className="bg-muted/30 rounded-lg p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-xs text-muted-foreground mb-1">{m.name}</div>
                    <div className="text-xl font-bold text-foreground mb-1">{m.value}</div>
                    <div
                      className={cn(
                        'text-[11px] flex items-center gap-0.5 font-medium',
                        m.up ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]'
                      )}
                    >
                      {m.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      比往期 {m.delta}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 观看趋势图 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">观看趋势</h3>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs h-6 font-normal">留存分析</Badge>
                    <Badge variant="secondary" className="text-xs h-6 font-normal">跳出分析</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    当前作品
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[hsl(26_90%_49%)]" />
                    同类作品
                  </span>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={watchTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 89%)" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(220 9% 46%)" unit="%" />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 6,
                        border: '1px solid hsl(220 14% 89%)',
                      }}
                      formatter={(value: number) => [`${value}%`, '']}
                    />
                    <Line
                      type="monotone"
                      dataKey="current"
                      name="当前作品"
                      stroke="hsl(221 83% 53%)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="peer"
                      name="同类作品"
                      stroke="hsl(26 90% 49%)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 章节点击率 */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">章节点击率</h3>
              <div className="space-y-2">
                {chapterClicks.map((ch, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                  >
                    <span className="text-xs font-mono text-muted-foreground w-14 shrink-0">{ch.time}</span>
                    <span className="text-sm flex-1 truncate">{ch.title}</span>
                    <span className="text-sm font-semibold text-primary w-14 text-right">{ch.ctr}</span>
                    <div className="w-24 bg-muted rounded-full h-1.5 hidden sm:block">
                      <div className="bg-primary h-1.5 rounded-full" style={{ width: ch.ctr }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右：流量来源 + 搜索关键词 */}
        <div className="space-y-4">
          {/* 流量来源 */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">流量来源</h3>
                <span className="text-xs text-muted-foreground">对比 7 日</span>
              </div>
              <div className="space-y-3 mb-4">
                {trafficSources.map((s) => (
                  <div key={s.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-foreground">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{s.percent}%</span>
                        <span
                          className={cn(
                            'flex items-center gap-0.5',
                            s.up ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]'
                          )}
                        >
                          {s.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {s.delta}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full" style={{ width: `${s.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full text-xs text-center text-primary hover:underline py-1">
                展开更多
              </button>
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-2">其他 App 来源</div>
                <div className="space-y-2">
                  {otherAppSources.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.percent}%</span>
                        <span className={cn(s.up ? 'text-[hsl(130_54%_42%)]' : 'text-[hsl(2_84%_62%)]')}>
                          {s.delta}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 搜索关键词 */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">搜索关键词</h3>
                <p className="text-[11px] text-muted-foreground mb-2">用户通过这些词看到作品</p>
                <div className="space-y-1.5">
                  {searchKeywordsSeen.map((k, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="w-4 h-4 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <span className="flex-1 truncate">{k.word}</span>
                      <span className="text-muted-foreground">{k.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-3 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground mb-2">看完作品后常搜的词</p>
                <div className="space-y-1.5">
                  {searchKeywordsAfter.map((k, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="w-4 h-4 rounded bg-[hsl(26_90%_49%)]/10 text-[hsl(26_90%_49%)] flex items-center justify-center text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <span className="flex-1 truncate">{k.word}</span>
                      <span className="text-muted-foreground">{k.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 合规说明 */}
      <div className="text-center text-[11px] text-muted-foreground pt-2 pb-1">
        本看板基于各平台官方开放平台数据接口自研渲染 · 不涉及 Cookie 浏览器、代理 IP 等违规能力
      </div>
    </div>
  );
};

export default CreatorDashboard;

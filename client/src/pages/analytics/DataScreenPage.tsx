import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Film,
  TrendingUp,
  Heart,
  MessageSquare,
  MessageCircle,
  LogOut,
  Music,
  BookOpen,
  Video,
  Tv,
  AlertTriangle,
  ThumbsUp,
  Eye,
  Share2,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { useNavigate } from 'react-router-dom';

// ============ 类型定义 ============
interface PlatformAccount {
  id: string;
  name: string;
  platform: string;
  platformIcon: typeof Music;
  platformColor: string;
  avatar: string;
  isOnline: boolean;
  todayFollowers: number;
  todayPlays: number;
  todayLikes: number;
}

interface FeedEvent {
  id: string;
  type: 'comment' | 'follower' | 'message' | 'publish';
  content: string;
  time: string;
  platform: string;
  color: string;
}

interface RankItem {
  id: string;
  title: string;
  plays: number;
  platform: string;
}

// ============ Mock 数据 ============
const platformAccounts: PlatformAccount[] = [
  { id: '1', name: '美食探店小队', platform: '抖音', platformIcon: Music, platformColor: '#ff2d55', avatar: '美', isOnline: true, todayFollowers: 320, todayPlays: 152340, todayLikes: 8920 },
  { id: '2', name: '美妆测评师', platform: '小红书', platformIcon: BookOpen, platformColor: '#ff2442', avatar: '美', isOnline: true, todayFollowers: 280, todayPlays: 0, todayLikes: 12680 },
  { id: '3', name: '科技宅频道', platform: 'B站', platformIcon: Tv, platformColor: '#00a1d6', avatar: '科', isOnline: false, todayFollowers: 150, todayPlays: 98760, todayLikes: 6240 },
  { id: '4', name: '生活种草日记', platform: '小红书', platformIcon: BookOpen, platformColor: '#ff2442', avatar: '生', isOnline: true, todayFollowers: 190, todayPlays: 0, todayLikes: 9870 },
  { id: '5', name: '旅行日记Vlog', platform: '抖音', platformIcon: Music, platformColor: '#ff2d55', avatar: '旅', isOnline: true, todayFollowers: -45, todayPlays: 234560, todayLikes: 15680 },
  { id: '6', name: '职场成长', platform: '视频号', platformIcon: Video, platformColor: '#07c160', avatar: '职', isOnline: false, todayFollowers: 120, todayPlays: 45230, todayLikes: 3210 },
];

const rankList: RankItem[] = [
  { id: '1', title: '北京烤鸭哪家强？5家老字号深度测评', plays: 312450, platform: '抖音' },
  { id: '2', title: '三亚5天4晚自由行攻略', plays: 234560, platform: '抖音' },
  { id: '3', title: '猫咪日常｜我家主子的一天', plays: 198670, platform: '抖音' },
  { id: '4', title: '平价彩妆红黑榜｜学生党必看', plays: 156800, platform: '小红书' },
  { id: '5', title: '程序员桌面好物分享', plays: 145670, platform: 'B站' },
  { id: '6', title: '数码开箱｜最新旗舰手机深度评测', plays: 128900, platform: 'B站' },
  { id: '7', title: '秋季护肤全攻略', plays: 98760, platform: '小红书' },
  { id: '8', title: '职场新人避坑指南', plays: 76540, platform: '视频号' },
  { id: '9', title: '新手健身入门｜30天蜕变计划', plays: 67890, platform: 'B站' },
  { id: '10', title: '家居收纳技巧｜小户型也能整整齐齐', plays: 54320, platform: '小红书' },
];

const initialFeedEvents: FeedEvent[] = [
  { id: '1', type: 'comment', content: '新评论：「请问价格是多少呀」来自 @阳光少年', time: '刚刚', platform: '抖音', color: '#3b82f6' },
  { id: '2', type: 'follower', content: '新粉丝：@小甜心 关注了 美食探店小队', time: '10秒前', platform: '抖音', color: '#10b981' },
  { id: '3', type: 'message', content: '新私信：「有合作意向」来自 @大海无量', time: '25秒前', platform: '小红书', color: '#f59e0b' },
  { id: '4', type: 'publish', content: '发布成功：「秋季护肤全攻略」已上线', time: '1分钟前', platform: '小红书', color: '#8b5cf6' },
  { id: '5', type: 'comment', content: '新评论：「求链接！！」来自 @爱吃鱼的猫', time: '1分30秒前', platform: '抖音', color: '#3b82f6' },
  { id: '6', type: 'follower', content: '新粉丝：@追梦人 关注了 生活种草日记', time: '2分钟前', platform: '小红书', color: '#10b981' },
  { id: '7', type: 'message', content: '新私信：「售后问题」来自 @清风徐来', time: '2分30秒前', platform: '视频号', color: '#f59e0b' },
  { id: '8', type: 'publish', content: '发布成功：「科技UP主最新视频」已上线', time: '3分钟前', platform: 'B站', color: '#8b5cf6' },
];

// ============ 工具函数 ============
const formatCount = (n: number): string => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
};

const randomJitter = (base: number, pct = 0.02): number => {
  const delta = base * pct * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(base + delta));
};

// ============ SVG 图表组件 ============

// 面积图 - 粉丝增长趋势
const AreaChart: React.FC<{ data: number[]; color: string; width: number; height: number }> = ({ data, color, width, height }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((val, i) => {
    const x = i * stepX;
    const y = height - ((val - min) / range) * (height - 10) - 5;
    return { x, y };
  });

  const areaPath = `M 0 ${height} L ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${width} ${height} Z`;
  const linePath = `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}`;

  return (
    <svg width={width} height={height} className="w-full h-full">
      <defs>
        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaGradient)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.filter((_, i) => i % 5 === 0 || i === points.length - 1).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </svg>
  );
};

// 环形图 - 平台粉丝占比
const DonutChart: React.FC<{ data: { label: string; value: number; color: string }[]; size: number; thickness: number }> = ({ data, size, thickness }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {data.map((item, i) => {
          const dashLength = (item.value / total) * circumference;
          const dashOffset = -offset;
          offset += dashLength;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={thickness}
              strokeDasharray={`${dashLength} ${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-white">{formatCount(total)}</div>
        <div className="text-xs text-white/50">总粉丝</div>
      </div>
    </div>
  );
};

// 折线图 - 互动趋势
const LineChart: React.FC<{ data: { likes: number; comments: number; shares: number }[]; width: number; height: number }> = ({ data, width, height }) => {
  const allVals = data.flatMap((d) => [d.likes, d.comments, d.shares]);
  const max = Math.max(...allVals);
  const min = Math.min(...allVals);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const buildPath = (key: 'likes' | 'comments' | 'shares') => {
    return data
      .map((d, i) => {
        const x = i * stepX;
        const y = height - ((d[key] - min) / range) * (height - 10) - 5;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  return (
    <svg width={width} height={height} className="w-full h-full">
      <path d={buildPath('likes')} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
      <path d={buildPath('comments')} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
      <path d={buildPath('shares')} fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

// 条形排行榜
const BarRankList: React.FC<{ items: RankItem[] }> = ({ items }) => {
  const maxPlay = items[0]?.plays || 1;
  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const pct = (item.plays / maxPlay) * 100;
        const rankColors = ['#ff4d4f', '#fa8c16', '#fadb14', '#52c41a', '#1890ff'];
        const color = idx < 3 ? rankColors[idx] : '#1890ff';
        return (
          <div key={item.id} className="group">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="flex-shrink-0 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center"
                style={{ backgroundColor: idx < 3 ? color : 'rgba(255,255,255,0.1)', color: idx < 3 ? '#000' : 'rgba(255,255,255,0.7)' }}
              >
                {idx + 1}
              </span>
              <span className="flex-1 text-xs text-white/80 truncate">{item.title}</span>
              <span className="flex-shrink-0 text-xs font-mono text-cyan-400">{formatCount(item.plays)}</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden ml-7">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============ 主组件 ============
const DataScreenPage: React.FC = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<'today' | '7d' | '30d'>('today');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const feedRef = useRef<HTMLDivElement>(null);

  // 核心指标数据（带抖动）
  const [metrics, setMetrics] = useState({
    totalFollowers: 199200,
    todayFollowers: 1015,
    followerGrowth: 5.2,
    totalWorks: 328,
    todayPosts: 12,
    totalInteractions: 892500,
    todayInteractions: 12800,
    messageProcessed: 2340,
    pendingMessages: 56,
    commentReplyRate: 87.5,
    pendingComments: 23,
  });

  // 实时动态信息流
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>(initialFeedEvents);

  // 预警信息
  const warnings = useMemo(() => [
    '⚠️ 账号「旅行日记Vlog」今日掉粉 45 人，建议关注内容质量',
    '⚠️ 账号「科技宅频道」授权健康度降至 72%，请重新授权',
    '⚠️ 监控任务「负面评论监控」已连续失败 3 次，请检查',
    '⚠️ 主动私信任务即将达到今日发送上限（87/100）',
    '⚠️ 作品「三亚5天4晚」评论区出现违规关键词，请及时处理',
  ], []);

  // 粉丝增长趋势数据（30天）
  const followerTrend = useMemo(() => {
    const data: number[] = [];
    let base = 150000;
    for (let i = 0; i < 30; i++) {
      base += 1500 + Math.random() * 2000 - 300;
      data.push(Math.floor(base));
    }
    return data;
  }, [timeRange]);

  // 互动趋势数据（7天）
  const interactionTrend = useMemo(() => {
    const data: { likes: number; comments: number; shares: number }[] = [];
    for (let i = 0; i < 7; i++) {
      data.push({
        likes: 5000 + Math.floor(Math.random() * 8000),
        comments: 800 + Math.floor(Math.random() * 1500),
        shares: 300 + Math.floor(Math.random() * 800),
      });
    }
    return data;
  }, [timeRange]);

  // 平台粉丝分布
  const platformDistribution = useMemo(() => [
    { label: '抖音', value: 95100, color: '#ff2d55' },
    { label: '小红书', value: 65400, color: '#ff2442' },
    { label: 'B站', value: 18200, color: '#00a1d6' },
    { label: '视频号', value: 21500, color: '#07c160' },
  ], []);

  // 实时时钟
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 数据每 5 秒刷新（轻微跳动）
  useEffect(() => {
    const timer = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        totalFollowers: prev.totalFollowers + Math.floor(Math.random() * 5),
        todayFollowers: prev.todayFollowers + Math.floor(Math.random() * 3),
        totalInteractions: prev.totalInteractions + Math.floor(Math.random() * 20),
        todayInteractions: prev.todayInteractions + Math.floor(Math.random() * 10),
        messageProcessed: prev.messageProcessed + (Math.random() > 0.5 ? 1 : 0),
        pendingMessages: Math.max(20, prev.pendingMessages + (Math.random() > 0.6 ? 1 : -1)),
        commentReplyRate: Math.min(99, Math.max(80, prev.commentReplyRate + (Math.random() * 0.4 - 0.2))),
        pendingComments: Math.max(10, prev.pendingComments + (Math.random() > 0.6 ? 1 : -1)),
      }));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // 模拟动态信息流新增
  useEffect(() => {
    const templates: Omit<FeedEvent, 'id' | 'time'>[] = [
      { type: 'comment', content: '新评论：「在哪里可以买？」来自 @快乐星球', platform: '抖音', color: '#3b82f6' },
      { type: 'follower', content: '新粉丝：@阳光灿烂 关注了 美妆测评师', platform: '小红书', color: '#10b981' },
      { type: 'message', content: '新私信：「你好请问在吗」来自 @小仙女', platform: '抖音', color: '#f59e0b' },
      { type: 'publish', content: '发布成功：「美食探店第50期」已发布', platform: '抖音', color: '#8b5cf6' },
      { type: 'comment', content: '新评论：「太赞了！」来自 @热爱生活', platform: 'B站', color: '#3b82f6' },
      { type: 'follower', content: '新粉丝：@夜空中最亮的星 关注了 科技宅频道', platform: 'B站', color: '#10b981' },
      { type: 'message', content: '新私信：「合作邀请」来自 @品牌方小助手', platform: '小红书', color: '#f59e0b' },
      { type: 'publish', content: '发布成功：「职场干货第12期」已上线', platform: '视频号', color: '#8b5cf6' },
    ];

    const timer = setInterval(() => {
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      const newEvent: FeedEvent = {
        ...tpl,
        id: `feed-${Date.now()}`,
        time: '刚刚',
      };
      setFeedEvents((prev) => {
        const updated = [newEvent, ...prev];
        return updated.slice(0, 10);
      });
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (d: Date): string => {
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  };

  const formatDate = (d: Date): string => {
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });
  };

  // 预警闪烁状态
  const hasWarning = metrics.todayFollowers < 0 || metrics.pendingMessages > 80;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0d1321] to-[#0a1628] text-white overflow-hidden">
      {/* 背景装饰网格 */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(0, 200, 255, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 200, 255, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }} />
      </div>

      {/* 顶部栏 */}
      <header className="relative z-10 h-16 flex items-center justify-between px-6 border-b border-cyan-500/20 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
                矩效 Matrix · 数据大屏
              </div>
              <div className="text-[10px] text-cyan-400/60">全平台账号矩阵实时监控</div>
            </div>
          </div>
        </div>

        {/* 时间 */}
        <div className="flex items-center gap-6">
          {/* 平台图标矩阵 */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#ff2d55]/20 flex items-center justify-center" title="抖音">
              <Music className="w-4 h-4" style={{ color: '#ff2d55' }} />
            </div>
            <div className="w-8 h-8 rounded-full bg-[#ff2442]/20 flex items-center justify-center" title="小红书">
              <BookOpen className="w-4 h-4" style={{ color: '#ff2442' }} />
            </div>
            <div className="w-8 h-8 rounded-full bg-[#07c160]/20 flex items-center justify-center" title="视频号">
              <Video className="w-4 h-4" style={{ color: '#07c160' }} />
            </div>
            <div className="w-8 h-8 rounded-full bg-[#00a1d6]/20 flex items-center justify-center" title="B站">
              <Tv className="w-4 h-4" style={{ color: '#00a1d6' }} />
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-cyan-300">{formatTime(currentTime)}</div>
            <div className="text-xs text-white/50">{formatDate(currentTime)}</div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
            onClick={() => navigate(-1)}
          >
            <LogOut className="w-4 h-4 mr-1" />
            退出大屏
          </Button>
        </div>
      </header>

      {/* 筛选栏 */}
      <div className="relative z-10 px-6 py-3 flex items-center justify-between border-b border-cyan-500/10">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 mr-2">时间范围：</span>
          {(['today', '7d', '30d'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeRange(t)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                timeRange === t
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              {t === 'today' ? '今日' : t === '7d' ? '近7天' : '近30天'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 mr-2">平台：</span>
          {['all', 'douyin', 'xiaohongshu', 'bilibili', 'wechat'].map((p) => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                platformFilter === p
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              {p === 'all' ? '全部' : p === 'douyin' ? '抖音' : p === 'xiaohongshu' ? '小红书' : p === 'bilibili' ? 'B站' : '视频号'}
            </button>
          ))}
        </div>
        <Badge variant="outline" className="bg-white/5 text-white/40 border-white/10 text-[10px]">
          示例数据演示
        </Badge>
      </div>

      {/* 核心指标区 */}
      <section className="relative z-10 px-6 py-4">
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: '总粉丝数', value: formatCount(metrics.totalFollowers), sub: `+${metrics.todayFollowers} 今日`, icon: Users, color: '#10b981', iconBg: 'rgba(16,185,129,0.15)' },
            { label: '总作品数', value: metrics.totalWorks.toLocaleString(), sub: `+${metrics.todayPosts} 今日发布`, icon: Film, color: '#3b82f6', iconBg: 'rgba(59,130,246,0.15)' },
            { label: '今日新增粉丝', value: `+${metrics.todayFollowers}`, sub: `+${metrics.followerGrowth}% 增长率`, icon: TrendingUp, color: '#06b6d4', iconBg: 'rgba(6,182,212,0.15)' },
            { label: '总互动量', value: formatCount(metrics.totalInteractions), sub: `+${formatCount(metrics.todayInteractions)} 今日`, icon: Heart, color: '#a855f7', iconBg: 'rgba(168,85,247,0.15)' },
            { label: '私信处理量', value: metrics.messageProcessed.toLocaleString(), sub: `${metrics.pendingMessages} 待处理`, icon: MessageSquare, color: '#f97316', iconBg: 'rgba(249,115,22,0.15)', warning: metrics.pendingMessages > 50 },
            { label: '评论回复率', value: `${metrics.commentReplyRate.toFixed(1)}%`, sub: `${metrics.pendingComments} 待回复`, icon: MessageCircle, color: '#ef4444', iconBg: 'rgba(239,68,68,0.15)', warning: metrics.commentReplyRate < 85 },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className={`relative rounded-lg border p-4 backdrop-blur-sm transition-all ${
                  item.warning
                    ? 'border-red-500/60 bg-red-500/10 animate-pulse'
                    : 'border-cyan-500/20 bg-white/[0.02] hover:border-cyan-500/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/50">{item.label}</span>
                  <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: item.iconBg }}>
                    <Icon className="w-4 h-4" style={{ color: item.color }} />
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono mb-1" style={{ color: item.color }}>
                  {item.value}
                </div>
                <div className="text-[10px] text-white/40">{item.sub}</div>
                {item.warning && (
                  <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 主体三栏布局 */}
      <main className="relative z-10 px-6 pb-4 flex gap-4" style={{ height: 'calc(100vh - 240px)' }}>
        {/* 左侧 25% */}
        <div className="w-1/4 space-y-4 flex flex-col">
          {/* 粉丝增长趋势 */}
          <div className="flex-1 rounded-lg border border-cyan-500/20 bg-white/[0.02] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                <div className="w-1 h-4 bg-cyan-400 rounded" />
                粉丝增长趋势
              </h3>
              <span className="text-[10px] text-white/40">近30天</span>
            </div>
            <div className="h-[140px]">
              <AreaChart data={followerTrend} color="#06b6d4" width={300} height={140} />
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-white/40">
              <span>30天前</span>
              <span>今天</span>
            </div>
          </div>

          {/* 平台粉丝占比 */}
          <div className="flex-1 rounded-lg border border-cyan-500/20 bg-white/[0.02] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                <div className="w-1 h-4 bg-purple-400 rounded" />
                平台粉丝占比
              </h3>
            </div>
            <div className="flex items-center justify-center">
              <DonutChart data={platformDistribution} size={140} thickness={16} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {platformDistribution.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] text-white/60">{item.label}</span>
                  <span className="text-[10px] text-white/80 ml-auto font-mono">{formatCount(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 中间 50% */}
        <div className="flex-1 space-y-4 flex flex-col min-w-0">
          {/* 账号矩阵状态 */}
          <div className="rounded-lg border border-cyan-500/20 bg-white/[0.02] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                <div className="w-1 h-4 bg-green-400 rounded" />
                账号矩阵状态
              </h3>
              <span className="text-[10px] text-white/40 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                实时数据
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {platformAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="rounded-lg border border-white/10 bg-white/[0.02] p-3 hover:border-cyan-500/30 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="relative">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: acc.platformColor + '20', color: acc.platformColor }}
                      >
                        {acc.avatar}
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d1321] ${
                          acc.isOnline ? 'bg-green-500' : 'bg-gray-500'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white/90 truncate">{acc.name}</div>
                      <div className="text-[10px] text-white/40 flex items-center gap-1">
                        <acc.platformIcon className="w-2.5 h-2.5" style={{ color: acc.platformColor }} />
                        {acc.platform}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className={`text-xs font-mono font-bold ${acc.todayFollowers >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {acc.todayFollowers >= 0 ? '+' : ''}{acc.todayFollowers}
                      </div>
                      <div className="text-[9px] text-white/40">粉丝</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-cyan-300">
                        {acc.todayPlays > 0 ? formatCount(acc.todayPlays) : '—'}
                      </div>
                      <div className="text-[9px] text-white/40">播放</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-orange-300">
                        {formatCount(acc.todayLikes)}
                      </div>
                      <div className="text-[9px] text-white/40">点赞</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 实时动态信息流 */}
          <div className="flex-1 rounded-lg border border-cyan-500/20 bg-white/[0.02] p-4 backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                <div className="w-1 h-4 bg-orange-400 rounded" />
                实时动态
              </h3>
              <span className="text-[10px] text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                实时推送中
              </span>
            </div>
            <div ref={feedRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
              {feedEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 p-2 rounded-md bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors"
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: event.color + '20' }}
                  >
                    {event.type === 'comment' && <MessageCircle className="w-3 h-3" style={{ color: event.color }} />}
                    {event.type === 'follower' && <Users className="w-3 h-3" style={{ color: event.color }} />}
                    {event.type === 'message' && <MessageSquare className="w-3 h-3" style={{ color: event.color }} />}
                    {event.type === 'publish' && <Film className="w-3 h-3" style={{ color: event.color }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/80">{event.content}</div>
                    <div className="text-[10px] text-white/40 mt-0.5 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {event.time} · {event.platform}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧 25% */}
        <div className="w-1/4 space-y-4 flex flex-col">
          {/* 内容排行榜 */}
          <div className="flex-1 rounded-lg border border-cyan-500/20 bg-white/[0.02] p-4 backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                <div className="w-1 h-4 bg-yellow-400 rounded" />
                内容排行榜 TOP 10
              </h3>
              <span className="text-[10px] text-white/40">播放量</span>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              <BarRankList items={rankList} />
            </div>
          </div>

          {/* 互动趋势 */}
          <div className="flex-1 rounded-lg border border-cyan-500/20 bg-white/[0.02] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                <div className="w-1 h-4 bg-pink-400 rounded" />
                互动趋势
              </h3>
              <span className="text-[10px] text-white/40">近7天</span>
            </div>
            <div className="h-[100px]">
              <LineChart data={interactionTrend} width={280} height={100} />
            </div>
            <div className="flex items-center justify-center gap-4 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-0.5 bg-[#f59e0b]" />
                <span className="text-[10px] text-white/50">点赞</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-0.5 bg-[#3b82f6]" />
                <span className="text-[10px] text-white/50">评论</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-0.5 bg-[#8b5cf6]" />
                <span className="text-[10px] text-white/50">分享</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 底部预警滚动条 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 h-8 bg-red-900/30 border-t border-red-500/30 flex items-center overflow-hidden">
        <div className="flex-shrink-0 px-4 flex items-center gap-2 bg-red-500/20 h-full border-r border-red-500/30">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-xs font-medium text-red-300">数据预警</span>
        </div>
        <div className="flex-1 overflow-hidden whitespace-nowrap">
          <div className="inline-block animate-marquee pl-4">
            {[...warnings, ...warnings].map((w, i) => (
              <span key={i} className="text-xs text-red-300/80 mx-8">
                {w}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 自定义动画样式 */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default DataScreenPage;

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Edit3,
  BookOpen,
  AlertTriangle,
  Rocket,
  Sparkles,
  Users,
  BarChart3,
  Globe,
  Flower2,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';

interface RoadmapPhase {
  version: string;
  title: string;
  status: '当前版本' | '规划中' | '远期';
  icon: React.ElementType;
  color: string;
  features: string[];
}

const phases: RoadmapPhase[] = [
  {
    version: 'V1.0',
    title: '基础框架 + 四大平台 + 核心功能',
    status: '当前版本',
    icon: Rocket,
    color: 'bg-primary text-primary-foreground',
    features: [
      '用户注册 / 登录 / VIP 授权码激活',
      '抖音、小红书、微信视频号、B站 四大平台接入框架',
      '平台账号绑定 / 解绑 / 列表管理',
      '内容素材库、编辑器、定时发布与发布队列',
      '粉丝数据查看与趋势分析',
      '私信统一收件箱与回复',
      '评论集中管理与回复',
      '关键词自动回复规则',
      '数据中心多维度报表',
      '管理后台（用户 / 授权码 / 套餐 / 日志）',
      '文档中心 6 大板块',
    ],
  },
  {
    version: 'V1.5',
    title: 'AI 能力赋能',
    status: '规划中',
    icon: Sparkles,
    color: 'bg-[hsl(270_70%_55%)] text-white',
    features: [
      'AI 文案生成：根据主题自动生成多平台适配文案',
      'AI 标题优化：一键生成多组爆款标题备选',
      'AI 配图建议：根据文案内容推荐封面图与配图风格',
      'AI 脚本生成：短视频脚本自动编写（分镜 + 台词）',
      'AI 评论回复建议：智能生成评论回复话术',
      'AI 私信智能接待：基于大模型的私信智能回复',
      'AI 内容摘要：长内容 / 直播内容自动摘要',
    ],
  },
  {
    version: 'V2.0',
    title: '平台扩展 + 团队协作',
    status: '规划中',
    icon: Users,
    color: 'bg-[hsl(160_60%_45%)] text-white',
    features: [
      '新增快手、微信公众号、知乎、微博平台支持',
      '团队多成员协作，支持多账号协同运营',
      '角色与权限管理（管理员 / 运营 / 编辑 / 只读）',
      '内容审批流程：多级审核后发布',
      '团队任务分配与进度追踪',
      '团队内部评论与 @ 提醒',
      '操作日志与责任追溯',
      '跨账号内容复用与素材共享',
    ],
  },
  {
    version: 'V2.5',
    title: '数据深度分析 + 竞品监控',
    status: '规划中',
    icon: BarChart3,
    color: 'bg-[hsl(220_80%_50%)] text-white',
    features: [
      '竞品账号监控：追踪竞品内容发布与数据表现',
      '竞品分析报告：对比自身与竞品的各项指标',
      '热点追踪与选题库：实时发现全网热点，辅助选题',
      '内容效果归因分析：哪些因素影响内容表现',
      '粉丝画像深度分析：兴趣标签 / 活跃时段 / 消费能力',
      '自定义数据看板：拖拽式搭建个人数据仪表盘',
      '数据大屏：投放 / 汇报场景的全屏数据展示',
      '定期报告自动生成：周报 / 月报自动推送',
    ],
  },
  {
    version: 'V3.0',
    title: '全平台矩阵 + 商业化完善',
    status: '远期',
    icon: Globe,
    color: 'bg-[hsl(26_90%_49%)] text-white',
    features: [
      '覆盖 10+ 主流内容平台的全矩阵管理',
      '直播数据与弹幕互动管理',
      '带货商品与订单数据整合',
      '品牌 / 舆情监控：全网品牌提及与情感分析',
      '评论私信情感分析：自动识别负面情绪优先处理',
      '私域企微社群管理：打通私域流量池',
      'CRM 客户管理与线索转化追踪',
      '在线支付自助开通 VIP（支付宝 / 微信）',
      '发票与合同管理',
    ],
  },
  {
    version: 'V4.0',
    title: '生态开放',
    status: '远期',
    icon: Flower2,
    color: 'bg-[hsl(330_70%_55%)] text-white',
    features: [
      '开放 API：第三方系统可接入远效能力',
      'Webhook 事件推送：数据变更实时回调',
      '插件市场：开发者可开发功能插件',
      '多语言支持：国际化版本',
      '移动端 App：iOS / Android 原生应用',
      '桌面端客户端：Mac / Windows 桌面应用',
      '小程序版本：微信小程序轻量版',
      '生态合作伙伴计划',
    ],
  },
];

const RoadmapPage: React.FC = () => {
  const [showEditTip, setShowEditTip] = useState(false);

  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* 页面标题区 */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <Badge variant="secondary">文档中心</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">后续扩展路线图</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            远效 产品发展规划与能力扩展路线
          </p>
        </div>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditTip(!showEditTip)}
          >
            <Edit3 className="h-4 w-4" />
            编辑文档
          </Button>
          {showEditTip && (
            <div className="absolute right-0 top-10 w-56 rounded-lg border bg-card p-3 text-xs shadow-lg z-10">
              <p className="font-medium">仅管理员可编辑</p>
              <p className="mt-1 text-muted-foreground">
                如需修改文档内容，请联系系统管理员。
              </p>
            </div>
          )}
        </div>
      </div>

      <Separator className="my-6" />

      {/* 版本时间线 */}
      <section className="mb-12">
        <h2 className="mb-6 text-xl font-semibold">版本规划时间线</h2>
        <div className="relative">
          {/* 纵向时间线 */}
          <div className="absolute left-[22px] top-2 bottom-2 w-0.5 bg-border" />

          <div className="space-y-6">
            {phases.map((phase, idx) => (
              <div key={phase.version} className="relative pl-14">
                {/* 节点圆点 */}
                <div
                  className={`absolute left-0 top-1 flex h-11 w-11 items-center justify-center rounded-full ${phase.color} shadow-lg`}
                >
                  <phase.icon className="h-5 w-5" />
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-lg">
                          {phase.version}
                        </CardTitle>
                        <Badge
                          variant={phase.status === '当前版本' ? 'default' : 'outline'}
                          className={phase.status === '当前版本' ? '' : ''}
                        >
                          {phase.status === '当前版本' && (
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                          )}
                          {phase.status === '规划中' && (
                            <Clock className="mr-1 h-3 w-3" />
                          )}
                          {phase.status}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="text-base font-medium text-foreground">
                      {phase.title}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {phase.features.map((f, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm leading-5"
                        >
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 平台扩展路线 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">平台扩展路线</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <Badge className="w-fit bg-success hover:bg-success">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                已支持（4）
              </Badge>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(0_0%_8%)]" />
                  抖音
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(350_85%_60%)]" />
                  小红书
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(142_45%_45%)]" />
                  微信视频号
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(200_90%_55%)]" />
                  B站
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <Badge variant="outline" className="w-fit border-warning/50 text-warning">
                <Clock className="mr-1 h-3 w-3" />
                规划中（4）
              </Badge>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(26_90%_49%)]" />
                  快手
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(142_45%_45%)]" />
                  微信公众号
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(220_60%_50%)]" />
                  知乎
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(0_75%_55%)]" />
                  微博
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <Badge variant="secondary" className="w-fit">
                远期（3）
              </Badge>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(200_90%_55%)]" />
                  TikTok
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(5_80%_55%)]" />
                  YouTube
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(260_70%_55%)]" />
                  Instagram
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 能力扩展路线 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">能力扩展路线</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                'AI 文案 / 标题 / 脚本 / 配图生成',
                '热点追踪与选题库',
                '竞品分析',
                '团队多成员与角色权限 / 审批',
                '客户 CRM 与线索转化',
                '直播数据与弹幕互动',
                '带货商品与订单数据',
                '品牌 / 舆情监控',
                '评论私信情感分析',
                '私域企微社群管理',
                '数据大屏',
                '移动端 / 小程序 / 桌面端',
                '在线支付自助开通',
                '开放 API 与 Webhook',
                '多语言',
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 明确不做的功能 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">明确不做的功能</h2>
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle className="text-base font-semibold">
            以下功能为产品红线，坚决不做
          </AlertTitle>
          <AlertDescription className="text-destructive/90">
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
              <li>
                <strong>爬虫抓取</strong>
                — 不使用任何爬虫技术抓取平台数据，所有数据均通过官方开放 API 获取。
              </li>
              <li>
                <strong>模拟登录</strong>
                — 不使用模拟浏览器、自动化脚本等方式模拟用户登录操作。
              </li>
              <li>
                <strong>账号多开 / 防关联</strong>
                — 不提供设备指纹修改、IP 池、环境隔离等规避平台检测的能力。
              </li>
              <li>
                <strong>批量向陌生人骚扰群发</strong>
                — 不提供批量向非粉丝 / 非互动用户发送私信的营销骚扰功能。
              </li>
              <li>
                <strong>违反各平台开发者协议的任何能力</strong>
                — 严格遵守平台规则，一旦发现平台政策变更，第一时间下线相关功能。
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      </section>

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>说明</AlertTitle>
        <AlertDescription>
          以上信息整理自各平台公开文档，具体以各平台官方最新版本为准。
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default RoadmapPage;

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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Edit3,
  Shield,
  Users,
  Crown,
  Settings,
  Layers,
  Database,
  MessageSquare,
  FileText,
  BarChart3,
  MessageCircle,
  MessageSquareQuote,
  Bot,
  UserCog,
  KeyRound,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  LayoutDashboard,
  UserPlus,
  Package,
  ScrollText,
  Sliders,
  Monitor,
  ListChecks,
} from 'lucide-react';

const OverviewPage: React.FC = () => {
  const [showEditTip, setShowEditTip] = useState(false);

  const userModules = [
    { name: '首页 / 工作台', icon: LayoutDashboard, desc: '公告、数据统计、教程、FAQ、会员对比' },
    { name: '账号管理', icon: Users, desc: '分组树 + 多 Tab 创作者数据看板' },
    { name: '一键发布', icon: FileText, desc: '单条/批量发布、草稿、任务记录、任务统计' },
    { name: '粉丝互动', icon: MessageCircle, desc: '评论 / 私信 / 粉丝 / 自动化 四大分组' },
    { name: '数据中心', icon: BarChart3, desc: '作品监控、播放流速、账号监控、违规草稿' },
    { name: '文档中心', icon: BookOpen, desc: '产品文档与平台接入指南' },
    { name: '设置', icon: Settings, desc: '个人资料、密码、VIP 状态、登录记录' },
  ];

  const adminModules = [
    { name: '运营总览', icon: LayoutDashboard, desc: '全局运营数据看板' },
    { name: '用户管理', icon: Users, desc: '用户列表与状态管理' },
    { name: '授权码管理', icon: KeyRound, desc: 'VIP 卡密生成与发放' },
    { name: '套餐管理', icon: Package, desc: 'VIP 套餐配置' },
    { name: '操作日志', icon: ScrollText, desc: '管理员操作审计' },
    { name: '系统配置', icon: Sliders, desc: '全局参数与开关' },
  ];

  const docSections = [
    { name: '产品框架总览', desc: '产品定位与整体架构' },
    { name: '非功能需求', desc: '性能、安全、可用性等' },
    { name: '扩展路线图', desc: '版本规划与能力扩展' },
    { name: '测试方案', desc: '测试策略与用例' },
    { name: '平台接入指南', desc: '各平台开放能力与资质' },
  ];

  const platforms = [
    { name: '抖音', color: 'bg-[hsl(0_0%_8%)] text-white' },
    { name: '小红书', color: 'bg-[hsl(350_85%_60%)] text-white' },
    { name: '视频号', color: 'bg-[hsl(142_45%_45%)] text-white' },
    { name: 'B站', color: 'bg-[hsl(200_90%_55%)] text-white' },
  ];

  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* 页面标题区 */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <Badge variant="secondary">文档中心</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            产品框架与模块总览
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            远效 — 多平台新媒体账号矩阵管理系统
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
            <div className="absolute right-0 top-10 w-56 rounded-lg border bg-card p-3 text-xs shadow-lg">
              <p className="font-medium">仅管理员可编辑</p>
              <p className="mt-1 text-muted-foreground">
                如需修改文档内容，请联系系统管理员。
              </p>
            </div>
          )}
        </div>
      </div>

      <Separator className="my-6" />

      {/* 产品简介 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">一、产品简介</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm leading-7">
              <strong className="text-primary">远效</strong>
              是一款面向新媒体团队的多平台账号矩阵管理 SaaS
              产品。它将抖音、小红书、微信视频号、B站等主流内容平台的账号、内容、粉丝、私信、评论与自动回复能力整合到统一工作台中，帮助团队提升运营效率、降低管理成本、实现数据驱动决策。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Layers className="h-4 w-4 text-primary" />
                  多平台统一管理
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  一站式接入四大平台，告别多账号切换
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Bot className="h-4 w-4 text-primary" />
                  自动化提效
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  定时发布、自动回复，释放运营人力
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  数据化决策
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  多维度数据报表，洞察内容与粉丝趋势
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 产品定位 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">二、产品定位</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">商业模式</CardTitle>
            <CardDescription>SaaS 订阅制 + 授权码激活</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7">
              采用「用户注册 + VIP 授权码激活」模式，用户注册后通过输入授权码开通对应套餐的 VIP
              权限。授权码由运营方在管理后台生成和发放，支持不同套餐档位与有效期配置。
            </p>
          </CardContent>
        </Card>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <Badge variant="secondary" className="w-fit">
                目标用户 1
              </Badge>
              <CardTitle className="mt-2 text-base">自媒体团队</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              1-10 人的中小型自媒体工作室，需要同时管理多个平台的多个账号。
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <Badge variant="secondary" className="w-fit">
                目标用户 2
              </Badge>
              <CardTitle className="mt-2 text-base">MCN 机构</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              签约大量达人的 MCN，需要批量管理账号、统一内容分发与数据分析。
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <Badge variant="secondary" className="w-fit">
                目标用户 3
              </Badge>
              <CardTitle className="mt-2 text-base">品牌新媒体部门</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              企业品牌社媒团队，多平台矩阵运营，关注品牌声量与用户互动。
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 整体架构图 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">三、整体架构</h2>
        <div className="rounded-xl border bg-card p-6">
          {/* 数据层 */}
          <div className="mb-4 rounded-lg bg-muted/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-primary" />
              数据层
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">PostgreSQL</Badge>
              <Badge variant="outline">文件存储</Badge>
              <Badge variant="outline">消息队列</Badge>
            </div>
          </div>

          {/* 平台适配层 */}
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <Layers className="h-4 w-4" />
              平台适配层（适配器插件化）
            </div>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <span
                  key={p.name}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${p.color}`}
                >
                  {p.name}
                </span>
              ))}
              <Badge variant="outline">扩展接口</Badge>
            </div>
          </div>

          {/* 三大应用端口 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" />
                用户端（9 大模块）
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {userModules.map((m) => (
                  <li key={m.name} className="flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3" />
                    {m.name}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <UserCog className="h-4 w-4" />
                管理后台（6 大模块）
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {adminModules.map((m) => (
                  <li key={m.name} className="flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3" />
                    {m.name}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4" />
                文档中心（6 大板块）
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {docSections.map((s) => (
                  <li key={s.name} className="flex items-center gap-1.5">
                    <ChevronRight className="h-3 w-3" />
                    {s.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 模块导航结构图 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">四、模块导航结构</h2>
        <Card>
          <CardContent className="pt-6">
            <Accordion type="multiple" defaultValue={['user']}>
              <AccordionItem value="user">
                <AccordionTrigger className="text-base font-medium">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    用户端（9 大模块）
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="ml-6 space-y-2 text-sm">
                    {userModules.map((m, i) => (
                      <li key={m.name} className="flex items-start gap-2">
                        <span className="mt-1 text-xs text-muted-foreground">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <span className="font-medium">{m.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            {m.desc}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="admin">
                <AccordionTrigger className="text-base font-medium">
                  <span className="flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-primary" />
                    管理后台（6 大模块）
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="ml-6 space-y-2 text-sm">
                    {adminModules.map((m, i) => (
                      <li key={m.name} className="flex items-start gap-2">
                        <span className="mt-1 text-xs text-muted-foreground">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <span className="font-medium">{m.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            {m.desc}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="docs">
                <AccordionTrigger className="text-base font-medium">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    文档中心（6 大板块）
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="ml-6 space-y-2 text-sm">
                    {docSections.map((s, i) => (
                      <li key={s.name} className="flex items-start gap-2">
                        <span className="mt-1 text-xs text-muted-foreground">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <span className="font-medium">{s.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            {s.desc}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </section>

      {/* 筛选与通用能力 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">五、筛选与通用能力</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Layers className="h-4 w-4 text-primary" />
                  三级联动筛选
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  账号筛选统一采用「平台 → 分组 → 账号」三级联动，各模块复用同一组件，逐级过滤列表与统计数据。
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <ListChecks className="h-4 w-4 text-primary" />
                  列表交互闭环
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  所有列表页统一支持筛选、搜索、分页、批量操作、导出 CSV，操作反馈与状态流转完整。
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Monitor className="h-4 w-4 text-primary" />
                  多分辨率适配
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  全局布局已通过 1366×768 / 1920×1080 等常见分辨率验证，顶部不遮挡、侧边不溢出、响应式自适应。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 用户角色说明 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">六、用户角色</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">普通用户</CardTitle>
              </div>
              <Badge variant="outline" className="w-fit">
                注册未激活
              </Badge>
            </CardHeader>
            <CardContent className="text-sm leading-6">
              注册后未激活 VIP 的用户，仅能访问激活页和个人设置，引导完成授权码激活。
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-warning" />
                <CardTitle className="text-base">VIP 用户</CardTitle>
              </div>
              <Badge className="w-fit bg-warning hover:bg-warning">
                已激活授权码
              </Badge>
            </CardHeader>
            <CardContent className="text-sm leading-6">
              激活授权码后可使用全部用户端功能，套餐不同支持的平台账号数量和功能权限有差异。
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">管理员</CardTitle>
              </div>
              <Badge className="w-fit">独立账号体系</Badge>
            </CardHeader>
            <CardContent className="text-sm leading-6">
              使用管理后台的运营人员，独立账号体系，通过 /admin/login
              登录，负责用户、授权码、套餐等管理。
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 合规声明 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">七、合规声明</h2>
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>严格遵守各平台开放协议</AlertTitle>
          <AlertDescription className="text-success-foreground/90">
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>
                所有平台账号接入均通过<strong>官方开放平台 OAuth 授权</strong>方式完成，不存储用户平台密码。
              </li>
              <li>
                <strong>不使用爬虫、不模拟登录、不使用自动化操作工具</strong>突破平台限制。
              </li>
              <li>
                严格遵守各平台开发者协议与 API 调用频率限制，确保账号安全。
              </li>
              <li>
                用户数据最小化收集，保障用户隐私，支持用户数据删除权。
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      </section>

      <Alert variant="warning" className="mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>免责声明</AlertTitle>
        <AlertDescription>
          以上信息整理自各平台公开文档，具体以各平台官方最新版本为准。
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default OverviewPage;

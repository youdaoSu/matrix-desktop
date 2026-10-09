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
  Gauge,
  Shield,
  CheckCircle2,
  Puzzle,
  Monitor,
  Scale,
  ChevronRight,
} from 'lucide-react';

const NonFunctionalPage: React.FC = () => {
  const [showEditTip, setShowEditTip] = useState(false);

  const sections = [
    {
      id: 'performance',
      title: '一、性能需求',
      icon: Gauge,
      items: [
        {
          name: '页面首屏加载时间',
          value: '≤ 2 秒',
          desc: '在常规网络环境下，首屏内容渲染完成时间不超过 2 秒。',
        },
        {
          name: '常规操作响应时间',
          value: '≤ 1 秒',
          desc: '列表查询、表单提交等常规操作接口响应时间不超过 1 秒（不含第三方平台接口耗时）。',
        },
        {
          name: '单用户多账号支持',
          value: '按套餐上限',
          desc: '基础版最多支持 5 个账号，专业版最多 20 个，企业版支持 100+，按套餐配置上限。',
        },
        {
          name: '消息/评论同步延迟',
          value: '目标 < 30 秒',
          desc: '平台新消息、新评论的同步拉取延迟目标控制在 30 秒以内（受限于各平台 API 频率）。',
        },
        {
          name: '发布队列并发能力',
          value: '支持排队',
          desc: '定时发布采用队列机制，支持大量内容并发排队发布，单账号严格遵守平台频率限制。',
        },
        {
          name: '数据监控刷新（V3）',
          value: '默认 5 秒 / 可调',
          desc: '作品监控默认每 5 秒刷新一次增量数据，用户可配置刷新间隔。支持开始/停止手动控制。',
        },
        {
          name: '创作者看板性能（V3）',
          value: '首屏 ≤ 1.5 秒',
          desc: '多 Tab 创作者数据看板首屏渲染 ≤ 1.5 秒，图表切换平滑无明显卡顿，支持至少 6 个指标卡 + 趋势图 + 流量来源同时加载。',
        },
        {
          name: '作品卡片网格渲染',
          value: '50 张无卡顿',
          desc: '作品监控双列视图下，50 张作品卡片滚动流畅，虚拟列表按需开启。',
        },
        {
          name: '消息 / 评论发送队列',
          value: '异步 + 重试 + 频控',
          desc: '私信、评论发送走异步队列，支持失败自动重试，按账号维度进行频控限流，防止触发平台风控。',
        },
      ],
    },
    {
      id: 'security',
      title: '二、安全需求',
      icon: Shield,
      items: [
        {
          name: '全站 HTTPS',
          value: '强制加密',
          desc: '生产环境全站启用 HTTPS，HTTP 请求自动跳转到 HTTPS，保障传输安全。',
        },
        {
          name: '密码加盐哈希',
          value: 'bcrypt',
          desc: '用户密码使用 bcrypt 加盐哈希存储，盐值随机，不存储明文密码。',
        },
        {
          name: 'JWT 鉴权 + 接口权限校验',
          value: '全接口覆盖',
          desc: '所有业务接口基于 JWT 鉴权，校验用户身份与 VIP 权限，越权访问返回 403。',
        },
        {
          name: '敏感数据加密存储',
          value: 'AES 加密',
          desc: '平台 Access Token、Refresh Token 等敏感凭证使用 AES 加密后存储。',
        },
        {
          name: '防 SQL 注入 / XSS / CSRF',
          value: '多层防护',
          desc: '使用 Drizzle ORM 参数化查询防 SQL 注入；输出转义防 XSS；CSRF Token 校验防跨站请求伪造。',
        },
        {
          name: '越权访问校验',
          value: '行级隔离',
          desc: '所有用户数据均按 user_id 行级隔离，确保用户只能访问自己的账号与数据。',
        },
        {
          name: '操作审计日志',
          value: '管理员全量',
          desc: '管理后台所有操作记录审计日志，包括操作人、操作时间、操作内容、IP 地址。',
        },
        {
          name: '登录失败锁定',
          value: '5 次锁定',
          desc: '连续 5 次登录失败后锁定账号 30 分钟，防止暴力破解。',
        },
      ],
    },
    {
      id: 'availability',
      title: '三、可用性需求',
      icon: CheckCircle2,
      items: [
        {
          name: '系统可用性目标',
          value: '99.9%',
          desc: '年度服务可用性目标 99.9%，年度计划内停机时间不超过 8.76 小时。',
        },
        {
          name: '数据定时备份与恢复',
          value: '每日全量 + 增量',
          desc: '数据库每日全量备份，每小时增量备份，备份文件异地存储，支持按时间点恢复。',
        },
        {
          name: '错误监控与告警',
          value: '多渠道',
          desc: '服务端错误实时监控，5xx 错误率超阈值时通过短信 / 邮件 / 群消息告警。',
        },
        {
          name: '日志收集与分析',
          value: '集中式',
          desc: '全链路日志采集，支持按 traceId 追踪请求链路，方便问题定位。',
        },
        {
          name: '灰度发布机制',
          value: '按比例放量',
          desc: '支持灰度发布，新版本按用户比例逐步放量，出现问题可快速回滚。',
        },
        {
          name: '自动化任务调度',
          value: '可靠调度',
          desc: '主动私信、监控任务等自动化任务支持任务调度、随机间隔、日 / 小时级别频控，服务重启后任务可恢复不丢。',
        },
      ],
    },
    {
      id: 'scalability',
      title: '四、可扩展性',
      icon: Puzzle,
      items: [
        {
          name: '平台「适配器」插件化架构',
          value: '核心不改',
          desc: '新增平台只需实现对应适配器插件，不修改核心业务逻辑，降低扩展成本。',
        },
        {
          name: '模块解耦',
          value: '按领域拆分',
          desc: '前后端均按业务领域模块划分，模块间通过明确接口通信，降低耦合度。',
        },
        {
          name: '配置化功能开关',
          value: 'Feature Flag',
          desc: '重要功能通过配置开关控制启停，便于灰度发布和应急降级。',
        },
        {
          name: 'API 版本管理',
          value: 'URI 版本号',
          desc: 'API 使用 /api/v1、/api/v2 的方式进行版本管理，保证向后兼容。',
        },
      ],
    },
    {
      id: 'compatibility',
      title: '五、兼容性',
      icon: Monitor,
      items: [
        {
          name: '浏览器支持',
          value: '主流最新版',
          desc: '支持 Chrome / Edge / Safari 最新两个正式版本，Firefox 尽力支持。',
        },
        {
          name: '分辨率支持',
          value: '1366×768 及以上',
          desc: '最低适配 1366×768 分辨率，在常见分辨率（1920×1080、2560×1440）下均有良好表现。',
        },
        {
          name: '响应式设计',
          value: '桌面端优先',
          desc: '以桌面端体验为优先，同时适配中等屏幕，不追求移动端小屏完美体验。',
        },
      ],
    },
    {
      id: 'compliance',
      title: '六、合规与隐私',
      icon: Scale,
      items: [
        {
          name: '用户协议与隐私政策',
          value: '必备法律文件',
          desc: '提供完整的用户服务协议和隐私政策，用户注册时需确认同意。',
        },
        {
          name: '数据最小化收集',
          value: '够用即可',
          desc: '只收集业务必需的用户数据，不过度采集个人信息。',
        },
        {
          name: '不存储用户平台密码',
          value: 'OAuth 授权',
          desc: '所有平台账号均通过官方 OAuth 方式授权，系统不存储用户在各平台的账号密码。',
        },
        {
          name: '遵守平台频率限制',
          value: '严格执行',
          desc: '严格遵守各平台开发者协议和 API 调用频率限制，不做任何突破限制的行为。',
        },
        {
          name: '用户数据删除权',
          value: 'GDPR 兼容',
          desc: '用户有权申请删除个人数据，系统提供数据删除流程并在规定时限内完成。',
        },
      ],
    },
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
          <h1 className="text-2xl font-semibold tracking-tight">非功能需求</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            性能、安全、可用性、可扩展性、兼容性与合规要求
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

      {/* 目录导航 */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <s.icon className="h-4 w-4 text-primary" />
                {s.title.replace(/^[一二三四五六七八九十]、/, '')}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 各章节 */}
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="mb-10 scroll-mt-6">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <section.icon className="h-5 w-5 text-primary" />
            {section.title}
          </h2>
          <div className="space-y-3">
            {section.items.map((item, idx) => (
              <Card key={idx}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-primary" />
                        <h3 className="font-medium">{item.name}</h3>
                      </div>
                      <p className="mt-2 ml-6 text-sm leading-6 text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 font-mono">
                      {item.value}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

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

export default NonFunctionalPage;

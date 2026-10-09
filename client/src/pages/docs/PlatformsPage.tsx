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
  CheckCircle2,
  Clock,
  Building2,
  Shield,
  KeyRound,
  FileCheck2,
  Info,
  ExternalLink,
} from 'lucide-react';

interface PlatformInfo {
  name: string;
  nameEn: string;
  brandColor: string;
  status: '框架已完成' | '部分能力可用';
  statusDetail: string;
  subject: string;
  capabilities: string[];
  authMethod: string;
  qualification: string;
  specialNotes?: string;
  warning?: string;
}

const platforms: PlatformInfo[] = [
  {
    name: '抖音',
    nameEn: 'Douyin',
    brandColor: 'bg-[hsl(0_0%_8%)] text-white',
    status: '框架已完成',
    statusDetail: '待配置 AppID / Secret',
    subject:
      '认证企业号及员工号、小程序品牌号；内容发布对主体要求较高：企业注册资本 ≥ 50 万、注册满 1 年，不对个体工商户开放。',
    capabilities: [
      '内容发布（video.create 等接口）',
      '评论管理（item.comment / video.comment）',
      '私信 IM 接待能力',
      '数据开放（用户数据、内容数据、粉丝数据）',
    ],
    authMethod: 'Web 扫码授权 OAuth 2.0',
    qualification:
      '企业主体营业执照、ICP 备案；IM / 私信接待类 SaaS 需额外提交 BRD 审核。',
    specialNotes:
      '评论管理、私信等权限默认关闭，需在开放平台控制台单独申请，部分权限需要人工审核。',
  },
  {
    name: '小红书',
    nameEn: 'Xiaohongshu',
    brandColor: 'bg-[hsl(350_85%_60%)] text-white',
    status: '框架已完成',
    statusDetail: '待配置 AppID / Secret',
    subject:
      '企业开发者 / 软件服务商（中国大陆企业、成立满 1 年、经营范围含技术开发等）；商家自研走 ARK / 千帆体系。',
    capabilities: [
      '内容发布与管理（笔记）',
      '私信消息接收与回复',
      '电商相关能力（以商家与专业号开放范围为准）',
      '数据开放接口',
    ],
    authMethod: 'OAuth 2.0 授权',
    qualification:
      '企业营业执照、ICP 备案、软件著作权等；商家类型需有小红书店铺。',
    specialNotes:
      '不同开发者类型（服务商 / 商家自研）的开放能力和接入流程不同，需根据实际情况选择对应路径。',
  },
  {
    name: '微信视频号',
    nameEn: 'WeChat Channels',
    brandColor: 'bg-[hsl(142_45%_45%)] text-white',
    status: '部分能力可用',
    statusDetail: '内容发布待官方开放',
    subject: '微信认证的公众号 / 小程序主体。',
    capabilities: [
      '商品与橱窗管理（电商场景）',
      '直播数据查询',
      '视频号基础信息',
      '部分粉丝与互动数据',
    ],
    authMethod: '微信公众号 / 小程序授权',
    qualification:
      '微信认证的公众号或小程序主体，完成微信认证（每年 300 元认证费）。',
    warning:
      '截至目前，微信视频号未开放视频内容发布的开放 API，开放接口集中在商品 / 橱窗、直播数据等电商场景。系统内内容发布能力标注为「手动发布 / 跳转引导」，引导用户跳转视频号助手手动完成发布。',
  },
  {
    name: 'B站',
    nameEn: 'Bilibili',
    brandColor: 'bg-[hsl(200_90%_55%)] text-white',
    status: '框架已完成',
    statusDetail: '待配置 AppID / Secret',
    subject: '企业 / 个人开发者均可申请，企业主体能力范围更广。',
    capabilities: [
      'OAuth 账号授权',
      '用户信息获取',
      '视频稿件发布 / 删除 / 查询',
      '专栏（图文）管理',
      '数据开放（播放、点赞、收藏等）',
      '直播能力（直播相关接口需单独报备）',
    ],
    authMethod: 'OAuth 2.0 授权',
    qualification:
      '开发者账号认证；企业开发者需提供营业执照；部分高级接口需单独申请。',
    specialNotes:
      '视频发布采用分片上传方式，视频码率、分辨率等有明确规格要求，上传前需做格式与大小校验。',
  },
];

const unifiedSteps = [
  '以企业主体入驻对应开放平台，完成开发者认证',
  '创建应用，获取 AppID / AppSecret',
  '配置 OAuth 回调地址（Redirect URI）',
  '申请对应 scope 权限包，等待审核通过',
  '在矩效管理后台配置平台 AppID / Secret',
  '测试授权流程与接口调用，确认联调通过',
];

const PlatformsPage: React.FC = () => {
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
          <h1 className="text-2xl font-semibold tracking-tight">各平台接入指南</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            抖音、小红书、微信视频号、B站各平台开放能力与资质要求
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

      {/* 平台快速概览 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">平台接入概览</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {platforms.map((p) => (
            <Card key={p.name}>
              <CardContent className="pt-6">
                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold ${p.brandColor}`}
                >
                  {p.name.charAt(0)}
                </div>
                <div className="font-medium">{p.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.nameEn}
                </div>
                <Badge
                  variant={p.status === '框架已完成' ? 'outline' : 'secondary'}
                  className="mt-3 w-fit border-success/50 text-success"
                >
                  {p.status === '框架已完成' ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  ) : (
                    <Clock className="mr-1 h-3 w-3" />
                  )}
                  {p.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 各平台详细介绍 */}
      <section className="mb-10 space-y-6">
        <h2 className="text-xl font-semibold">各平台详细说明</h2>

        {platforms.map((p) => (
          <Card key={p.name} id={`platform-${p.nameEn.toLowerCase()}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold ${p.brandColor}`}
                  >
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    <CardDescription>{p.nameEn}</CardDescription>
                  </div>
                </div>
                <Badge
                  variant={p.status === '框架已完成' ? 'outline' : 'secondary'}
                  className={
                    p.status === '框架已完成'
                      ? 'border-success/50 text-success'
                      : 'border-warning/50 text-warning bg-warning/10'
                  }
                >
                  {p.status === '框架已完成' ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  ) : (
                    <Clock className="mr-1 h-3 w-3" />
                  )}
                  {p.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {p.warning && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>重要说明</AlertTitle>
                  <AlertDescription className="text-destructive/90">
                    {p.warning}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Building2 className="h-4 w-4 text-primary" />
                    开放主体要求
                  </div>
                  <p className="ml-6 text-sm leading-6 text-muted-foreground">
                    {p.subject}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-primary" />
                    授权方式
                  </div>
                  <p className="ml-6 text-sm leading-6 text-muted-foreground">
                    {p.authMethod}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  可接入能力
                </div>
                <ul className="ml-6 grid grid-cols-1 gap-1 text-sm text-muted-foreground md:grid-cols-2">
                  {p.capabilities.map((cap, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <FileCheck2 className="h-4 w-4 text-primary" />
                  资质要求
                </div>
                <p className="ml-6 text-sm leading-6 text-muted-foreground">
                  {p.qualification}
                </p>
              </div>

              {p.specialNotes && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-warning">
                    <Info className="h-4 w-4" />
                    特殊说明
                  </div>
                  <p className="ml-6 text-sm leading-6 text-muted-foreground">
                    {p.specialNotes}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                接入状态：{p.statusDetail}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 统一接入流程 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">统一接入流程</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {unifiedSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div className="pt-1 text-sm leading-6">
                    {step}
                    {i < unifiedSteps.length - 1 && (
                      <div className="mt-3 h-4 w-px bg-border" />
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-5" />
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                个人开发者主体可申请的能力非常有限，大部分平台的内容发布、私信、评论等核心能力仅对企业主体开放。
              </p>
              <p className="flex items-start gap-2">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                各平台开放政策可能随时调整，接入前请务必查阅各平台官方最新文档，以官方信息为准。
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>免责声明</AlertTitle>
        <AlertDescription>
          以上信息整理自各平台公开文档，具体以各平台官方最新版本为准。
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default PlatformsPage;

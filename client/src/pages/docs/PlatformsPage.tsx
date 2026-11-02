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
  status: '待平台审核' | '能力需确认';
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
    status: '待平台审核',
    statusDetail: '当前仅有 OAuth 接入框架；未配置应用凭据及权限，不能绑定或调用平台业务接口',
    subject:
      '先按抖音开放平台要求完成开发者/机构认证、创建并审核应用。主体和材料要求以应用类型及控制台审核结果为准；不采用未经官方确认的固定注册资本或成立年限门槛。',
    capabilities: [
      '账号授权与用户资料：应用审核、用户同意及对应用户信息权限',
      '视频/图文发布：申请并获批 video.create；用户授权；每次发布须由用户明确感知',
      '评论读取/回复：申请互动管理权限（如 item.comment / video.comment），按账号类型和接口范围审核',
      '企业号私信：申请 im 权限；该权限并非普通登录授权自动包含',
      '粉丝、作品及数据分析：分别申请 data.external.user、data.external.item、fans.data 等权限',
    ],
    authMethod: '开放平台 Web OAuth 2.0；仅适用于已审核应用及已获批 scope',
    qualification:
      '开发者/机构认证资料、应用信息、隐私政策和用途说明；按目标 API 提交权限申请及平台要求的补充材料。',
    specialNotes:
      '授权只代表用户同意，不代表应用已获得接口权限。video.create 默认可能未开通；私信、评论、数据能力须逐项核对权限页。发布操作应有清晰确认，不能后台无感代发。',
  },
  {
    name: '小红书',
    nameEn: 'Xiaohongshu',
    brandColor: 'bg-[hsl(350_85%_60%)] text-white',
    status: '待平台审核',
    statusDetail: '当前未接入小红书官方 OAuth API；需先创建并审核开放平台应用',
    subject:
      '在小红书开放平台提交应用主体、名称、图标、平台类型及用途，审核通过后取得 app_id；服务端 Secret 模式需安全保管 app_secret，公开客户端按官方要求评估 PKCE。',
    capabilities: [
      '基础资料 basic_info：当前公开首期 scope；仍需应用审核和用户授权',
      '笔记读取、发布、粉丝读取：官方 scope 文档标为规划中/敏感权限，不能按已开放能力承诺',
      '评论、私信、电商和数据：须有对应正式 API、应用权限及用户授权；当前远效未接入',
    ],
    authMethod: '小红书官方 OAuth 2.0；Web/桌面扫码授权按官方设备授权流程接入',
    qualification:
      '按应用类型提交主体、产品用途、隐私政策及安全材料；敏感 scope 需额外申请，最终以开放平台审核为准。',
    specialNotes:
      '当前官方文档显示首期仅开放 basic_info；write_notes、read_followers 等属于规划/需审核范围。账号授权不能据此推导出内容发布或私信能力。',
  },
  {
    name: '微信视频号',
    nameEn: 'WeChat Channels',
    brandColor: 'bg-[hsl(142_45%_45%)] text-white',
    status: '能力需确认',
    statusDetail: '远效未接入视频号官方账号授权或内容操作接口',
    subject: '必须按具体微信开放能力确定主体：公众号/小程序/视频号的主体关系、认证和绑定条件并不通用。',
    capabilities: [
      '视频号登录、内容发布、评论、私信和数据：须逐项找到适用于该主体的腾讯官方接口与权限；当前未接入',
      '公众号/小程序已有的微信开放能力不等于视频号账号管理权限',
    ],
    authMethod: '没有可直接套用的通用视频号 OAuth；按具体官方产品和已批准接口接入',
    qualification:
      '先确认产品归属、主体关系及目标接口的官方准入条件；不以公众号或小程序认证替代视频号权限审批。',
    warning:
      '目前没有在远效中配置可验证的视频号官方授权/发布接口。不会使用逆向私有接口、盗用 Cookie 或绕过平台限制；如需发布，可保留用户主动前往官方助手完成操作的引导。',
  },
  {
    name: 'B站',
    nameEn: 'Bilibili',
    brandColor: 'bg-[hsl(200_90%_55%)] text-white',
    status: '待平台审核',
    statusDetail: '当前未接入 B 站开放平台 OAuth 或稿件接口',
    subject: '需在哔哩哔哩开放平台填写身份资料并通过审核后创建应用；可用能力取决于具体应用获批权限。',
    capabilities: [
      '稿件投稿/批量分发：仅在开放平台对应用开通相应稿件接口后接入',
      '用户资料、稿件管理和数据查询：按各 API 文档及应用授权范围逐项确认',
      '评论、私信、专栏和直播：不视为默认权限；需确认官方存在适用接口并单独获批',
    ],
    authMethod: '哔哩哔哩开放平台规定的应用授权流程；以该应用文档为准',
    qualification:
      '完成开发者身份资料审核、应用创建及相关接口权限申请；按平台服务协议处理用户数据和授权撤销。',
    specialNotes:
      '稿件投稿通常涉及视频分片上传、格式校验和平台审核。开放平台协议及应用权限是前提，登录网页或取得本地会话不等于 API 授权。',
  },
];

const unifiedSteps = [
  '先确定每个目标操作对应的官方 API、适用主体和平台条款；没有官方接口的操作不接入',
  '完成平台开发者身份和应用审核，取得该应用专属凭据',
  '登记 HTTPS 回调地址、应用域名和平台要求的隐私政策/用户协议',
  '按最小权限原则逐项申请 OAuth scope / API 权限，等待平台批准',
  '将凭据保存在服务端密钥配置中；桌面客户端不内置可复用的应用密钥',
  '逐平台验证用户授权、令牌刷新/撤销、限流、失败回滚和用户主动确认后再开放操作',
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
                  variant="secondary"
                  className="mt-3 w-fit border-warning/50 bg-warning/10 text-warning"
                >
                  <Clock className="mr-1 h-3 w-3" />
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
                  variant="secondary"
                  className="border-warning/50 bg-warning/10 text-warning"
                >
                  <Clock className="mr-1 h-3 w-3" />
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
                平台准入和权限按应用类型、主体、具体 API 分别审核；不得把某个平台的资质要求套用到其他平台，也不得将账号登录授权当作业务操作权限。
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

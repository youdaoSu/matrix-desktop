import {
  Megaphone,
  Users,
  FileText,
  UserPlus,
  Play,
  Video,
  Crown,
  Check,
  X,
  Bell,
  Rocket,
  TrendingUp,
  Shield,
  AlertCircle,
  MessageSquare,
  Monitor,
} from 'lucide-react';
import { Badge } from '@client/src/components/ui/badge';
import type { Announcement, Notification, NotificationType } from '@shared/api.interface';

// ─── 公告数据 ───────────────────────────────────────────────
export const announcements: Announcement[] = [
  {
    id: 'ann_001',
    title: 'V3.0 全新版本上线，矩阵监控全面升级',
    content:
      '远效 V3.0 正式发布！本次更新带来以下核心功能：\n\n1. **矩阵监控**：支持粉丝增长异常、关键词命中、评论负面情绪实时告警\n2. **多平台聚合**：抖音 / 小红书 / 视频号 / B站 评论与私信统一管理\n3. **自动回复 2.0**：新增关键词模糊匹配、多轮会话、离线回复策略\n4. **数据看板**：账号健康度评分、内容吸引力指数、流量来源分析\n\n立即前往各模块体验新功能，如有问题请联系客服。',
    summary: '矩阵监控全面升级 + 多平台评论私信聚合 + 自动回复 2.0',
    category: 'update',
    isPublished: true,
    sortOrder: 1,
    createdAt: '2026-09-28T10:00:00Z',
    updatedAt: '2026-09-28T10:00:00Z',
  },
  {
    id: 'ann_002',
    title: '小红书视频号账号一键绑定，授权流程全面优化',
    content:
      '小红书和微信视频号授权流程已全面优化：\n\n- 支持扫码一键绑定，无需手动复制链接\n- 授权有效期延长至 30 天\n- 到期前 3 天自动提醒续期\n- 新增授权健康度检测，异常自动告警\n\n前往「账号管理」页面即可绑定新账号。',
    summary: '扫码一键绑定 + 有效期延长至 30 天 + 到期自动提醒',
    category: 'update',
    isPublished: true,
    sortOrder: 2,
    createdAt: '2026-09-25T14:30:00Z',
    updatedAt: '2026-09-25T14:30:00Z',
  },
  {
    id: 'ann_003',
    title: '关于规范使用自动回复功能的合规提示',
    content:
      '尊敬的用户：\n\n为确保各平台账号安全，请严格遵守以下规范：\n\n1. 自动回复仅限已授权的自有矩阵账号使用\n2. 不得设置诱导关注、虚假宣传等违规内容\n3. 私信回复需遵守平台会话窗口限制\n4. 建议开启随机间隔与频控保护\n\n违反平台规则可能导致账号限流或封禁，请合理使用自动化功能。',
    summary: '请合规使用自动化功能，保护账号安全',
    category: 'compliance',
    isPublished: true,
    sortOrder: 3,
    createdAt: '2026-09-20T09:00:00Z',
    updatedAt: '2026-09-20T09:00:00Z',
  },
  {
    id: 'ann_004',
    title: '双节特惠：年卡限时 7 折，永久版直降 300',
    content:
      '🎉 中秋国庆双节特惠活动来袭！\n\n活动时间：9月28日 ~ 10月7日\n\n- 年卡原价 ¥299，活动价 ¥209（7折）\n- 永久版原价 ¥999，活动价 ¥699（直降300）\n- 老用户续费再享 9 折叠加优惠\n\n前往「设置 - VIP 状态」或联系客服即可参与。',
    summary: '年卡 7 折 / 永久版直降 300 / 老用户再享 9 折',
    category: 'activity',
    isPublished: true,
    sortOrder: 4,
    createdAt: '2026-09-28T00:00:00Z',
    updatedAt: '2026-09-28T00:00:00Z',
  },
  {
    id: 'ann_005',
    title: '系统维护通知：10月8日凌晨 2:00-4:00',
    content:
      '为提升系统稳定性，我们将于 2026年10月8日 凌晨 2:00-4:00 进行例行维护。\n\n维护期间：\n- 发布任务将暂停执行，维护完成后自动恢复\n- 数据同步可能延迟，不影响数据完整性\n- 网页端可能短暂无法访问\n\n给您带来的不便敬请谅解。',
    summary: '10月8日凌晨 2:00-4:00 例行维护，发布任务暂停',
    category: 'system',
    isPublished: true,
    sortOrder: 5,
    createdAt: '2026-09-26T16:00:00Z',
    updatedAt: '2026-09-26T16:00:00Z',
  },
];

// 旧的公告简版（兼容现有代码，后续可移除）
export const announcementItems = announcements.slice(0, 3).map((a) => a.title);

// ─── 统计卡 ────────────────────────────────────────────────
export const statCards = [
  {
    label: '账号数',
    value: '8',
    icon: Users,
    color: 'text-primary',
    bg: 'bg-primary/10',
    navigateTo: '/accounts',
  },
  {
    label: '作品总数',
    value: '658',
    icon: FileText,
    color: 'text-[hsl(130_54%_42%)]',
    bg: 'bg-[hsl(130_54%_42%)/10]',
    navigateTo: '/publish/tasks',
  },
  {
    label: '粉丝总数',
    value: '57,925',
    icon: UserPlus,
    color: 'text-[hsl(26_90%_49%)]',
    bg: 'bg-[hsl(26_90%_49%)/10]',
    navigateTo: '/engage/followers',
  },
];

// ─── 通知数据（对齐 Notification 类型） ──────────────────────
const notificationTypeMap: Record<NotificationType, { label: string; icon: typeof Bell; color: string }> = {
  system: { label: '系统', icon: Bell, color: 'text-primary bg-primary/10' },
  publish_result: { label: '发布', icon: Play, color: 'text-[hsl(130_54%_42%)] bg-[hsl(130_54%_42%)/10]' },
  follow_up: { label: '互动', icon: MessageSquare, color: 'text-[hsl(26_90%_49%)] bg-[hsl(26_90%_49%)/10]' },
  auto_message: { label: '互动', icon: MessageSquare, color: 'text-[hsl(26_90%_49%)] bg-[hsl(26_90%_49%)/10]' },
  vip_expire: { label: 'VIP', icon: Crown, color: 'text-[hsl(46_100%_42%)] bg-[hsl(46_100%_42%)/10]' },
  monitor_alert: { label: '监控', icon: Monitor, color: 'text-[hsl(2_84%_62%)] bg-[hsl(2_84%_62%)/10]' },
  follower: { label: '互动', icon: UserPlus, color: 'text-[hsl(26_90%_49%)] bg-[hsl(26_90%_49%)/10]' },
  violation: { label: '监控', icon: AlertCircle, color: 'text-[hsl(2_84%_62%)] bg-[hsl(2_84%_62%)/10]' },
};

export function getNotificationTypeMeta(type: NotificationType) {
  return notificationTypeMap[type] ?? notificationTypeMap.system;
}

export const mockNotifications: Notification[] = [
  {
    id: 'notif_001',
    userId: 'user_1',
    type: 'vip_expire',
    title: 'VIP 会员即将到期',
    content: '您的专业版 VIP 将于 2026-10-03 到期，续费享 8 折优惠',
    isRead: false,
    relatedType: 'vip',
    relatedId: 'plan_pro',
    createdAt: '2026-09-28T09:30:00Z',
  },
  {
    id: 'notif_002',
    userId: 'user_1',
    type: 'publish_result',
    title: '发布任务完成',
    content: '"秋日穿搭分享"已成功发布到抖音、小红书共 3 个账号',
    isRead: false,
    relatedType: 'publish_task',
    relatedId: 'task_001',
    createdAt: '2026-09-28T08:15:00Z',
  },
  {
    id: 'notif_003',
    userId: 'user_1',
    type: 'monitor_alert',
    title: '监控告警：粉丝异常减少',
    content: '抖音账号「穿搭小达人」近 1 小时掉粉 32 人，请关注',
    isRead: false,
    relatedType: 'monitor',
    relatedId: 'monitor_001',
    createdAt: '2026-09-28T07:42:00Z',
  },
  {
    id: 'notif_004',
    userId: 'user_1',
    type: 'follow_up',
    title: '新增评论 12 条',
    content: '您的作品「秋日穿搭分享」收到了 12 条新评论，其中 3 条待回复',
    isRead: false,
    relatedType: 'comment',
    relatedId: 'post_001',
    createdAt: '2026-09-27T22:10:00Z',
  },
  {
    id: 'notif_005',
    userId: 'user_1',
    type: 'follower',
    title: '新增粉丝 86 人',
    content: '过去 24 小时您的矩阵账号共新增粉丝 86 人，较前日增长 12%',
    isRead: true,
    relatedType: 'follower',
    createdAt: '2026-09-27T20:00:00Z',
  },
  {
    id: 'notif_006',
    userId: 'user_1',
    type: 'system',
    title: '系统升级通知',
    content: 'V3.0 版本已上线，新增矩阵监控与自动回复 2.0 功能',
    isRead: true,
    relatedType: 'announcement',
    relatedId: 'ann_001',
    createdAt: '2026-09-27T10:00:00Z',
  },
  {
    id: 'notif_007',
    userId: 'user_1',
    type: 'violation',
    title: '作品违规提醒',
    content: '您发布的「限时福利」因涉嫌营销内容被限流，建议修改后重新发布',
    isRead: false,
    relatedType: 'violation',
    relatedId: 'post_002',
    createdAt: '2026-09-26T16:30:00Z',
  },
  {
    id: 'notif_008',
    userId: 'user_1',
    type: 'auto_message',
    title: '关键词回复命中 45 次',
    content: '今日关键词自动回复共命中 45 次，转化率 28%',
    isRead: true,
    relatedType: 'auto_reply',
    createdAt: '2026-09-26T23:59:00Z',
  },
  {
    id: 'notif_009',
    userId: 'user_1',
    type: 'publish_result',
    title: '发布失败提醒',
    content: '小红书账号「美食探店」发布失败：内容包含敏感词，请修改后重试',
    isRead: true,
    relatedType: 'publish_task',
    relatedId: 'task_002',
    createdAt: '2026-09-26T14:20:00Z',
  },
  {
    id: 'notif_010',
    userId: 'user_1',
    type: 'system',
    title: '账号授权即将过期',
    content: 'B站账号「科技数码君」授权将于 2 天后过期，请及时续期',
    isRead: true,
    relatedType: 'account',
    relatedId: 'acc_005',
    createdAt: '2026-09-25T11:00:00Z',
  },
];

// 通知类型筛选 Tab
export const notificationFilterTabs: { value: 'all' | NotificationType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'system', label: '系统' },
  { value: 'publish_result', label: '发布' },
  { value: 'follow_up', label: '互动' },
  { value: 'monitor_alert', label: '监控' },
  { value: 'vip_expire', label: 'VIP' },
];

// ─── 教程数据 ──────────────────────────────────────────────
export interface TutorialStep {
  title: string;
  description: string;
  imageHint: string;
}

export interface TutorialItem {
  title: string;
  gradient: string;
  steps: TutorialStep[];
}

export interface TutorialSection {
  title: string;
  items: TutorialItem[];
}

export const tutorialSections: TutorialSection[] = [
  {
    title: '新手入门',
    items: [
      {
        title: '远效 产品介绍',
        gradient: 'from-blue-500 to-indigo-600',
        steps: [
          { title: '什么是远效', description: '远效 是一款多平台新媒体账号矩阵管理工具，支持抖音、小红书、视频号、B站四大平台统一管理。', imageHint: '产品首页概览图' },
          { title: '核心功能总览', description: '涵盖账号管理、一键发布、粉丝互动、数据中心四大核心模块，帮您高效运营多平台账号矩阵。', imageHint: '功能模块示意图' },
          { title: '适用人群', description: '适合 MCN 机构、品牌自媒体、个人创作者等需要管理多个账号的用户。', imageHint: '用户画像示意' },
        ],
      },
      {
        title: '三分钟快速注册激活',
        gradient: 'from-orange-400 to-rose-500',
        steps: [
          { title: '注册账号', description: '使用手机号或邮箱注册远效账号，注册成功后自动登录。', imageHint: '注册页面截图' },
          { title: '获取授权码', description: '联系客服购买授权码，或使用试用授权码体验功能。', imageHint: '授权码购买示意' },
          { title: '激活 VIP', description: '进入「设置 - VIP 状态」，输入授权码即可激活，立即解锁全部功能。', imageHint: '激活页面示意' },
        ],
      },
      {
        title: '账号绑定完整演示',
        gradient: 'from-emerald-400 to-teal-600',
        steps: [
          { title: '进入账号管理', description: '点击左侧「账号管理」菜单，进入账号列表页面。', imageHint: '账号管理页面' },
          { title: '添加账号', description: '点击「添加账号」按钮，选择要绑定的平台。', imageHint: '添加账号弹窗' },
          { title: '扫码授权', description: '使用对应平台 APP 扫码，完成授权后即可开始使用。', imageHint: '扫码授权流程' },
          { title: '验证账号状态', description: '授权成功后，账号列表将显示该账号及其基础数据。', imageHint: '账号列表展示' },
        ],
      },
    ],
  },
  {
    title: '发布技巧',
    items: [
      {
        title: '多平台内容一键发布',
        gradient: 'from-indigo-500 to-blue-700',
        steps: [
          { title: '选择发布方式', description: '支持发条单视频、批量发视频、批量发图文三种模式，按需选择。', imageHint: '发布模式选择' },
          { title: '上传素材', description: '上传视频/图片素材，支持拖拽上传和批量选择。', imageHint: '素材上传界面' },
          { title: '编辑内容', description: '填写标题、描述、话题标签，可按平台分别设置。', imageHint: '内容编辑界面' },
          { title: '选择账号并发布', description: '勾选要发布的账号，设置定时或立即发布。', imageHint: '账号选择发布' },
        ],
      },
      {
        title: '定时发布与队列管理',
        gradient: 'from-cyan-500 to-blue-600',
        steps: [
          { title: '设置定时时间', description: '在发布页面选择「定时发布」，设置具体发布时间。', imageHint: '定时设置界面' },
          { title: '查看发布队列', description: '在任务记录中查看所有待发布、发布中、已完成的任务。', imageHint: '任务列表示意' },
          { title: '管理失败任务', description: '发布失败的任务会标红显示，可查看失败原因并重试。', imageHint: '失败任务处理' },
        ],
      },
      {
        title: '素材库使用指南',
        gradient: 'from-pink-500 to-rose-600',
        steps: [
          { title: '上传素材到素材库', description: '支持图片、视频、文案等素材分类管理，方便重复使用。', imageHint: '素材库页面' },
          { title: '素材分组与标签', description: '按项目或主题创建素材分组，添加标签便于搜索。', imageHint: '素材分组示意' },
          { title: '发布时引用素材', description: '创建发布任务时可直接从素材库选择，无需重复上传。', imageHint: '素材引用流程' },
        ],
      },
    ],
  },
  {
    title: '涨粉攻略',
    items: [
      {
        title: '粉丝增长数据分析',
        gradient: 'from-emerald-500 to-green-700',
        steps: [
          { title: '查看粉丝趋势', description: '在粉丝管理页面查看每日新增/取关数据，把握增长趋势。', imageHint: '粉丝趋势图' },
          { title: '分析粉丝画像', description: '了解粉丝性别、年龄、地域分布，优化内容方向。', imageHint: '粉丝画像图' },
          { title: '对比账号表现', description: '多账号横向对比，找出涨粉最快的账号和内容类型。', imageHint: '账号对比图' },
        ],
      },
      {
        title: '评论互动提升技巧',
        gradient: 'from-purple-500 to-violet-700',
        steps: [
          { title: '及时回复评论', description: '评论回复率影响平台推荐权重，建议 2 小时内回复。', imageHint: '评论管理界面' },
          { title: '设置关键词回复', description: '高频问题设置自动回复，提升互动效率和用户体验。', imageHint: '关键词回复设置' },
          { title: '引导关注话术', description: '在回复中自然引导关注，但避免违规诱导。', imageHint: '话术示例' },
        ],
      },
      {
        title: '矩阵账号协同策略',
        gradient: 'from-amber-500 to-orange-700',
        steps: [
          { title: '账号定位差异化', description: '同一矩阵内各账号应有明确定位差异，避免内容同质化。', imageHint: '账号定位矩阵' },
          { title: '内容分发节奏', description: '主账号首发、子账号二创转发，形成内容传播矩阵。', imageHint: '分发时间轴' },
          { title: '跨平台导流', description: '利用各平台优势互相导流，但遵守平台规则。', imageHint: '导流路径示意' },
        ],
      },
    ],
  },
  {
    title: '合规指南',
    items: [
      {
        title: '平台规则必读',
        gradient: 'from-red-500 to-rose-700',
        steps: [
          { title: '抖音社区自律公约', description: '遵守抖音内容规范，禁止低俗、搬运、虚假宣传等违规行为。', imageHint: '规则示意' },
          { title: '小红书社区规范', description: '小红书重视真实分享，禁止硬广、代写、虚假种草。', imageHint: '规则示意' },
          { title: '视频号运营规范', description: '遵守微信视频号运营规范，注意版权和内容合规。', imageHint: '规则示意' },
          { title: 'B站社区规范', description: '尊重 B 站社区文化，避免低质搬运和标题党。', imageHint: '规则示意' },
        ],
      },
      {
        title: '账号安全保护',
        gradient: 'from-slate-600 to-slate-800',
        steps: [
          { title: '开启发布频控', description: '合理设置发布间隔和每日上限，避免触发平台风控。', imageHint: '频控设置' },
          { title: '随机间隔功能', description: '自动回复和主动私信建议开启随机间隔，模拟真实操作。', imageHint: '随机间隔设置' },
          { title: '定期更换 IP 设备', description: '多账号运营建议使用不同设备和网络环境。', imageHint: '安全提示' },
        ],
      },
      {
        title: '违规申诉指南',
        gradient: 'from-zinc-600 to-zinc-800',
        steps: [
          { title: '判断违规类型', description: '先确认是哪类违规：内容违规、操作异常还是账号被封。', imageHint: '违规类型判断' },
          { title: '平台侧申诉', description: '在对应平台的创作者中心提交申诉，提供相关证明材料。', imageHint: '申诉流程' },
          { title: '调整运营策略', description: '申诉后调整内容和操作策略，避免再次触发违规。', imageHint: '策略调整' },
        ],
      },
    ],
  },
];

// ─── FAQ 数据 ──────────────────────────────────────────────
export const faqCategories = [
  {
    value: 'register',
    label: '注册激活',
    items: [
      { q: '如何注册远效 账号？', a: '点击注册按钮，使用手机号或邮箱即可完成注册，注册后需使用授权码激活 VIP 功能。' },
      { q: '授权码如何激活？', a: '登录后进入「设置 - VIP 状态」页面，输入您购买的授权码即可完成激活，激活后立即生效。' },
      { q: '忘记密码怎么办？', a: '在登录页点击「忘记密码」，通过注册手机号或邮箱接收验证码即可重置密码。' },
    ],
  },
  {
    value: 'bind',
    label: '授权绑定',
    items: [
      { q: '支持哪些平台账号绑定？', a: '目前支持抖音、小红书、微信视频号、B站四大主流平台，更多平台正在持续接入中。' },
      { q: '账号绑定安全吗？', a: '我们采用平台官方 OAuth 授权机制，不存储账号密码，授权信息全程加密，您可随时在平台侧取消授权。' },
      { q: '授权过期了怎么办？', a: '授权过期后重新绑定即可，部分平台需要定期刷新授权，系统会在授权即将到期时提醒您。' },
      { q: '一个套餐能绑定几个账号？', a: '不同套餐可绑定账号数不同，月卡最多 5 个、季卡 10 个、年卡 20 个、永久版不限数量。' },
    ],
  },
  {
    value: 'plan',
    label: '套餐相关',
    items: [
      { q: '有哪些套餐可以选择？', a: '我们提供月卡、季卡、年卡、永久版四种套餐，时长越长单价越优惠，永久版一次购买终身使用。' },
      { q: '套餐可以升级吗？', a: '可以升级，升级时按剩余天数折算差价，联系客服或在 VIP 页面直接操作即可。' },
      { q: '购买后可以退款吗？', a: '购买 7 天内如未使用超过 3 次核心功能，可申请无理由退款，详情请阅读服务条款。' },
    ],
  },
  {
    value: 'qualification',
    label: '平台资质',
    items: [
      { q: '远效 有哪些资质？', a: '远效 是正规运营的 SaaS 服务，持有 ICP 备案、软件著作权，严格遵守各平台开放平台规则。' },
      { q: '数据安全有保障吗？', a: '所有数据存储于国内合规云服务，传输全程 TLS 加密，定期安全审计，符合等保三级要求。' },
      { q: '会违反平台规则吗？', a: '我们严格遵守各平台开发者协议，所有功能均基于平台官方开放接口实现，不突破平台限制。' },
    ],
  },
];

// ─── VIP 套餐 ──────────────────────────────────────────────
export const vipPlans = [
  {
    name: '基础版',
    price: '¥39',
    period: '/月',
    accounts: '5个',
    features: { autoReply: true, messageAgg: true, dataMonitor: false, priorityService: false },
  },
  {
    name: '专业版',
    price: '¥99',
    period: '/月',
    accounts: '10个',
    features: { autoReply: true, messageAgg: true, dataMonitor: true, priorityService: false },
    popular: true,
  },
  {
    name: '企业版',
    price: '¥299',
    period: '/月',
    accounts: '不限',
    features: { autoReply: true, messageAgg: true, dataMonitor: true, priorityService: true },
  },
];

// ─── 新手引导步骤 ──────────────────────────────────────────
export interface OnboardingStep {
  title: string;
  description: string;
  target?: string; // CSS selector for highlighted element
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const onboardingSteps: OnboardingStep[] = [
  {
    title: '欢迎使用远效',
    description: '这是您的工作台首页，让我们花 1 分钟快速了解核心功能，帮您更快上手。',
    position: 'bottom',
  },
  {
    title: '第一步：绑定账号',
    description: '前往「账号管理」绑定您的抖音、小红书等平台账号，这是使用所有功能的基础。',
    target: 'nav a[href="/accounts"]',
    position: 'bottom',
  },
  {
    title: '第二步：发布第一条内容',
    description: '在「一键发布」中上传素材，选择账号，即可多平台同时发布，高效便捷。',
    target: 'nav a[href="/publish/create"]',
    position: 'bottom',
  },
  {
    title: '第三步：查看数据',
    description: '「数据中心」提供账号表现、作品数据、粉丝趋势等多维度分析，助您优化运营策略。',
    target: 'nav a[href="/analytics"]',
    position: 'bottom',
  },
  {
    title: '🎉 恭喜完成新手引导',
    description: '您已了解远效 的核心功能。快去绑定账号开始您的矩阵运营之旅吧！随时可在右侧信息卡重新查看引导。',
    position: 'bottom',
  },
];

export { Megaphone, Play, Video, Crown, Check, X, Badge, Bell, Rocket, TrendingUp, Shield, AlertCircle, MessageSquare, Monitor, Users, FileText, UserPlus };

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Edit3,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Server,
  MousePointerClick,
  ShieldCheck,
  Gauge,
  Lock,
  Monitor,
  Link2,
  Users,
  Bug,
  ListChecks,
  Bell,
  Download,
  MessageSquare,
  Layers,
  LayoutDashboard,
  AlertCircle,
  Upload,
  Navigation2,
} from 'lucide-react';

interface TestCase {
  id: string;
  module: string;
  scenario: string;
  precondition: string;
  steps: string;
  expected: string;
  priority: '高' | '中' | '低';
}

const testTypes = [
  {
    name: '单元测试',
    icon: Code2,
    desc: '对函数、组件等最小单元进行测试，保证代码逻辑正确。使用 Jest + React Testing Library。',
  },
  {
    name: '接口 / 集成测试',
    icon: Server,
    desc: '测试后端 API 接口的功能正确性，以及模块间的集成联调。覆盖正常与异常场景。',
  },
  {
    name: '功能测试',
    icon: MousePointerClick,
    desc: '以用户视角验证产品功能是否符合需求规格，覆盖主流程与分支场景。',
  },
  {
    name: '权限与边界测试',
    icon: ShieldCheck,
    desc: '验证越权访问防护、数据行级隔离、参数边界值、异常输入等安全与鲁棒性场景。',
  },
  {
    name: '性能压力测试',
    icon: Gauge,
    desc: '测试系统在高并发、大数据量下的响应表现与稳定性，定位性能瓶颈。',
  },
  {
    name: '安全测试',
    icon: Lock,
    desc: 'SQL 注入、XSS、CSRF、敏感信息泄露、弱口令等安全专项测试。',
  },
  {
    name: '兼容性测试',
    icon: Monitor,
    desc: '在不同浏览器、不同分辨率下验证页面展示与功能正常。',
  },
  {
    name: '平台对接联调',
    icon: Link2,
    desc: '与各平台开放平台的真实接口联调，验证授权、发布、消息等全链路。',
  },
  {
    name: 'UAT 验收测试',
    icon: Users,
    desc: '上线前由业务方 / 真实用户代表进行验收测试，确认产品满足业务需求。',
  },
];

const testCases: TestCase[] = [
  {
    id: 'TC-001',
    module: '注册登录',
    scenario: '新用户正常注册',
    precondition: '邮箱未被注册',
    steps: '打开注册页 → 输入邮箱、密码、确认密码 → 点击注册',
    expected: '注册成功，自动登录并跳转到激活页',
    priority: '高',
  },
  {
    id: 'TC-002',
    module: '注册登录',
    scenario: '密码错误登录失败',
    precondition: '账号已存在',
    steps: '打开登录页 → 输入正确邮箱 + 错误密码 → 点击登录',
    expected: '提示密码错误，连续 5 次后账号锁定 30 分钟',
    priority: '高',
  },
  {
    id: 'TC-003',
    module: '注册登录',
    scenario: '退出登录',
    precondition: '用户已登录',
    steps: '点击头像 → 选择退出登录',
    expected: '清除登录状态，跳转登录页，访问业务接口返回 401',
    priority: '中',
  },
  {
    id: 'TC-004',
    module: '授权码激活',
    scenario: '有效授权码激活 VIP',
    precondition: '用户已登录但未激活 VIP，授权码有效未使用',
    steps: '进入激活页 → 输入授权码 → 点击激活',
    expected: '激活成功，用户升级为 VIP，套餐和到期时间正确',
    priority: '高',
  },
  {
    id: 'TC-005',
    module: '授权码激活',
    scenario: '已使用授权码激活失败',
    precondition: '授权码已被使用',
    steps: '进入激活页 → 输入已使用授权码 → 点击激活',
    expected: '提示授权码已使用，激活失败，用户状态不变',
    priority: '高',
  },
  {
    id: 'TC-006',
    module: '授权码激活',
    scenario: 'VIP 到期后功能受限',
    precondition: '用户 VIP 已过期',
    steps: '登录系统 → 尝试访问各功能模块',
    expected: '自动跳转到激活页，提示 VIP 已过期，仅激活页和个人设置可访问',
    priority: '高',
  },
  {
    id: 'TC-007',
    module: 'VIP 与越权',
    scenario: '超套餐账号数限制',
    precondition: '用户基础版套餐，最多 5 个账号，已绑定 5 个',
    steps: '尝试绑定第 6 个平台账号',
    expected: '提示已达套餐上限，引导升级套餐，绑定失败',
    priority: '高',
  },
  {
    id: 'TC-008',
    module: 'VIP 与越权',
    scenario: '越权访问他人数据',
    precondition: '用户 A 和用户 B 各有自己的账号数据',
    steps: '用户 A 登录后，修改接口参数尝试获取用户 B 的内容列表',
    expected: '返回 403 或空数据，无法访问他人数据',
    priority: '高',
  },
  {
    id: 'TC-009',
    module: '账号绑定',
    scenario: '抖音账号扫码授权绑定',
    precondition: '用户已登录为 VIP，有可用抖音账号',
    steps: '进入平台账号管理 → 点击添加抖音账号 → 扫码授权 → 确认授权',
    expected: '授权成功，账号列表新增该抖音账号，显示正确的账号信息和状态',
    priority: '高',
  },
  {
    id: 'TC-010',
    module: '账号绑定',
    scenario: '解绑平台账号',
    precondition: '用户已绑定至少一个平台账号',
    steps: '在账号列表点击解绑 → 二次确认弹窗 → 确认解绑',
    expected: '账号从列表中移除，相关数据不再展示，Access Token 被清除',
    priority: '中',
  },
  {
    id: 'TC-011',
    module: '内容发布',
    scenario: '立即发布图文内容',
    precondition: '用户已绑定至少一个支持图文发布的平台账号',
    steps: '进入内容管理 → 新建内容 → 填写标题、正文、图片 → 选择平台 → 立即发布',
    expected: '内容提交成功，发布历史中状态为「发布中」，最终变为「已发布」',
    priority: '高',
  },
  {
    id: 'TC-012',
    module: '内容发布',
    scenario: '定时发布视频内容',
    precondition: '用户已绑定支持视频的平台账号',
    steps: '新建内容 → 上传视频 → 设置定时发布时间 → 确认发布',
    expected: '内容进入发布队列，到达指定时间后自动发布，发布后通知用户',
    priority: '高',
  },
  {
    id: 'TC-013',
    module: '私信回复',
    scenario: '在系统内回复私信',
    precondition: '用户有未读私信会话',
    steps: '进入私信管理 → 选择会话 → 输入回复内容 → 发送',
    expected: '消息发送成功，出现在对话记录中，对方可收到回复',
    priority: '高',
  },
  {
    id: 'TC-014',
    module: '评论回复',
    scenario: '回复用户评论',
    precondition: '账号下有用户评论',
    steps: '进入评论管理 → 找到目标评论 → 输入回复 → 提交',
    expected: '回复成功，评论下方显示回复内容，状态更新为已回复',
    priority: '中',
  },
  {
    id: 'TC-015',
    module: '自动回复',
    scenario: '关键词规则命中',
    precondition: '已配置关键词「价格」自动回复「请私信咨询」',
    steps: '粉丝向账号发送包含「价格」的私信',
    expected: '系统自动匹配规则，向粉丝回复「请私信咨询」，自动回复记录 +1',
    priority: '高',
  },
  {
    id: 'TC-016',
    module: '自动回复',
    scenario: '规则停用后不触发',
    precondition: '有关键词规则已被停用',
    steps: '粉丝发送命中该规则关键词的消息',
    expected: '不触发自动回复，规则统计不变',
    priority: '中',
  },
  {
    id: 'TC-017',
    module: '管理后台',
    scenario: '管理员开通新用户 VIP',
    precondition: '管理员已登录，有未激活用户',
    steps: '进入用户管理 → 找到目标用户 → 点击开通 VIP → 选择套餐和时长 → 确认',
    expected: '用户 VIP 状态变更为已激活，到期时间正确，操作日志有记录',
    priority: '高',
  },
  {
    id: 'TC-018',
    module: '管理后台',
    scenario: '管理员停用用户账号',
    precondition: '管理员已登录，有正常用户',
    steps: '进入用户管理 → 找到目标用户 → 点击停用 → 确认',
    expected: '用户状态变为已停用，该用户无法登录，操作日志有记录',
    priority: '高',
  },
  {
    id: 'TC-019',
    module: '管理后台',
    scenario: '生成授权码',
    precondition: '管理员已登录，存在可用套餐',
    steps: '进入授权码管理 → 生成授权码 → 选择套餐、数量、有效期 → 确认',
    expected: '生成指定数量的授权码，状态为未使用，可导出列表',
    priority: '高',
  },
  {
    id: 'TC-020',
    module: '数据中心',
    scenario: '按时间范围查询数据',
    precondition: '用户有历史数据',
    steps: '进入数据中心 → 选择时间范围（近 7 天）→ 切换平台筛选',
    expected: '图表和数据列表按筛选条件更新，数据与时间范围一致',
    priority: '中',
  },
  {
    id: 'TC-021',
    module: '主动私信',
    scenario: '主动私信任务创建与启动',
    precondition: '用户已绑定可发私信的平台账号，粉丝列表有数据',
    steps: '进入自动化 → 主动私信 → 新建任务 → 选择账号、目标粉丝、消息模板、发送时段 → 启动任务',
    expected: '任务创建成功，状态变为「进行中」，任务子项按频控逐步进入发送队列',
    priority: '高',
  },
  {
    id: 'TC-022',
    module: '主动私信',
    scenario: '频控上限触发冷却',
    precondition: '设置每小时上限为 10 条，当前小时已发送 10 条',
    steps: '任务继续运行，尝试发送第 11 条',
    expected: '第 11 条进入等待状态，下一小时整点恢复发送，控制台展示「频控冷却中」',
    priority: '高',
  },
  {
    id: 'TC-023',
    module: '主动私信',
    scenario: '随机间隔在设定区间内',
    precondition: '主动私信任务设置随机间隔 30~90 秒',
    steps: '连续观察 10 条消息的实际发送时间间隔',
    expected: '每条消息间隔均落在 30~90 秒范围内，无固定周期，整体分布随机',
    priority: '中',
  },
  {
    id: 'TC-024',
    module: '监控任务',
    scenario: '监控任务关键词命中',
    precondition: '已创建评论关键词监控任务，匹配模式分别为精确 / 包含 / 模糊',
    steps: '在对应账号下发布含目标关键词的评论，分别测试三种匹配模式',
    expected: '精确匹配仅完全一致时命中；包含匹配在评论文本包含关键词时命中；模糊匹配在语义相近时命中，命中记录可查询',
    priority: '高',
  },
  {
    id: 'TC-025',
    module: '监控任务',
    scenario: '监控触发后执行私信动作',
    precondition: '监控任务配置为「命中关键词 → 自动发送私信模板 A」',
    steps: '触发一条满足条件的评论 / 私信',
    expected: '监控命中记录 +1，自动向目标用户发送私信模板 A，发送状态可在任务详情中查看',
    priority: '高',
  },
  {
    id: 'TC-026',
    module: '主动私信 / 监控',
    scenario: '各失败原因展示与重试',
    precondition: '主动私信或监控动作存在发送失败记录',
    steps: '进入发送任务详情 → 查看失败子项 → 检查失败原因 → 点击重试',
    expected: '失败原因如实展示（如「对方非粉丝」「当日额度已满」「账号授权失效」等），点击单条 / 批量重试后重新进入发送队列',
    priority: '中',
  },
  {
    id: 'TC-027',
    module: 'V3 首页',
    scenario: '主题切换持久化',
    precondition: '用户已登录',
    steps: '首页右侧点击「黑暗」主题 → 刷新页面 → 再点击「明亮」 → 再切「跟随系统」',
    expected: '主题切换立即生效，刷新后保持上次选择；跟随系统随系统主题变化',
    priority: '高',
  },
  {
    id: 'TC-028',
    module: 'V3 首页',
    scenario: '三 Tab 切换与 FAQ 折叠',
    precondition: '用户已登录',
    steps: '依次点击视频教程 / 常见问题 / 会员功能对比 Tab → 在 FAQ 展开多条',
    expected: 'Tab 切换正确显示对应内容；FAQ 点击展开/收起正常；教程卡片点击弹出提示',
    priority: '中',
  },
  {
    id: 'TC-029',
    module: 'V3 账号管理',
    scenario: '左侧分组树折叠与添加分组',
    precondition: '用户已登录且有绑定账号',
    steps: '点击分组标题折叠/展开 → 点击「+ 添加分组」→ 输入分组名确认',
    expected: '分组可正常折叠展开；新分组出现在树中，可在账号菜单中移动到新分组',
    priority: '高',
  },
  {
    id: 'TC-030',
    module: 'V3 账号管理',
    scenario: '多 Tab 创作者看板切换与关闭',
    precondition: '左侧分组树中有多个账号',
    steps: '依次点击 3 个不同账号 → 在右侧 Tab 间切换 → 关闭中间一个 Tab',
    expected: '点击账号在右侧打开对应 Tab；Tab 切换看板内容正确更新；关闭 Tab 后剩余 Tab 正确',
    priority: '高',
  },
  {
    id: 'TC-031',
    module: 'V3 一键发布',
    scenario: '任务记录勾选与批量操作',
    precondition: '任务记录列表中有多条记录',
    steps: '勾选 3 条 → 查看底部已选计数 → 点击「全选」→ 点击「批量重发」',
    expected: '勾选状态正确同步到底部计数；全选选中所有可见项；批量重发后状态变为发布中',
    priority: '高',
  },
  {
    id: 'TC-032',
    module: 'V3 一键发布',
    scenario: '多维度筛选任务记录',
    precondition: '任务记录中有不同平台、状态、类型的数据',
    steps: '依次选择平台=抖音、状态=发布失败、类型=视频 → 查看结果 → 清空筛选',
    expected: '筛选后列表仅显示符合条件的记录；多条件组合生效；清空后恢复全部',
    priority: '中',
  },
  {
    id: 'TC-033',
    module: 'V3 数据中心',
    scenario: '开始监控与停止监控',
    precondition: '已选择监控账号',
    steps: '点击「开始监控」→ 观察数据变化 → 点击「停止监控」',
    expected: '监控中状态为绿色，数据定时刷新且有增量；停止后状态变红，数据停止刷新',
    priority: '高',
  },
  {
    id: 'TC-034',
    module: 'V3 数据中心',
    scenario: '双列/单列切换与排序',
    precondition: '作品监控中有示例数据',
    steps: '点击双列/单列切换按钮 → 切换排序方式',
    expected: '布局在双列网格和单列列表间切换；排序后作品按指定字段重新排列',
    priority: '中',
  },
  {
    id: 'TC-035',
    module: 'V3 导航',
    scenario: '自动化并入粉丝互动',
    precondition: '用户已登录',
    steps: '点击顶部「粉丝互动」→ 查看左侧菜单是否有「自动化」分组 → 点击各子项',
    expected: '顶部无独立「自动化」菜单；粉丝互动左侧含评论/私信/粉丝/自动化四分组；子页面均可正常访问',
    priority: '高',
  },
  // === 通知中心测试用例 ===
  {
    id: 'TC-036',
    module: '通知中心',
    scenario: '系统公告通知展示',
    precondition: '管理后台已发布新公告',
    steps: '用户登录系统 → 点击顶部通知铃铛 → 查看通知列表',
    expected: '铃铛显示未读角标；通知列表中出现最新公告；点击可查看详情',
    priority: '中',
  },
  {
    id: 'TC-037',
    module: '通知中心',
    scenario: '业务通知（发布结果）推送',
    precondition: '用户有正在执行的发布任务',
    steps: '等待发布任务完成 → 查看通知中心',
    expected: '发布完成后收到发布结果通知，包含成功/失败数量和任务名称',
    priority: '高',
  },
  {
    id: 'TC-038',
    module: '通知中心',
    scenario: '标记单条/全部已读',
    precondition: '通知列表中有多条未读通知',
    steps: '点击单条通知标记已读 → 点击「全部已读」',
    expected: '单条点击后未读角标消失；全部已读后铃铛角标清零，列表无未读项',
    priority: '中',
  },
  {
    id: 'TC-039',
    module: '通知中心',
    scenario: '按类型筛选通知',
    precondition: '通知列表中有系统通知和业务通知',
    steps: '切换筛选类型为「系统通知」→ 再切为「业务通知」→ 切回全部',
    expected: '筛选后列表仅显示对应类型通知；切换回全部后显示所有通知',
    priority: '低',
  },
  // === 导出功能测试用例 ===
  {
    id: 'TC-040',
    module: '导出功能',
    scenario: '用户列表导出 CSV',
    precondition: '管理员已登录，用户列表中有数据',
    steps: '进入管理后台→用户管理 → 设置筛选条件 → 点击导出',
    expected: '成功下载 CSV 文件，文件内容与筛选结果一致，包含所有列字段，编码为 UTF-8 BOM',
    priority: '高',
  },
  {
    id: 'TC-041',
    module: '导出功能',
    scenario: '授权码导出',
    precondition: '管理员刚生成一批授权码',
    steps: '在生成结果弹窗中点击导出 → 或在列表页筛选后导出',
    expected: '导出 CSV 包含授权码明文，可被 Excel 正常打开，无乱码',
    priority: '高',
  },
  {
    id: 'TC-042',
    module: '导出功能',
    scenario: '操作日志导出',
    precondition: '操作日志列表有数据且已筛选',
    steps: '设置时间范围和操作类型筛选 → 点击导出 CSV',
    expected: '导出文件包含筛选后的日志记录，字段完整，时间格式正确',
    priority: '中',
  },
  {
    id: 'TC-043',
    module: '导出功能',
    scenario: '大数据量导出',
    precondition: '列表中有超过 1000 条数据',
    steps: '不设置筛选直接点击导出',
    expected: '导出过程有加载提示；最终文件包含全部数据，不丢失行；浏览器不卡顿',
    priority: '中',
  },
  // === 自动评论测试用例 ===
  {
    id: 'TC-044',
    module: '自动评论',
    scenario: '关键词监控触发自动评论',
    precondition: '已创建评论关键词监控任务，触发动作设为自动回复模板A',
    steps: '用小号在视频下发布含目标关键词的评论',
    expected: '监控命中记录+1，系统自动用绑定账号回复模板A内容，回复可在评论区看到',
    priority: '高',
  },
  {
    id: 'TC-045',
    module: '自动评论',
    scenario: '自动评论频控限制',
    precondition: '设置自动评论日上限为 50 条',
    steps: '模拟连续触发 60 条命中评论',
    expected: '前 50 条正常回复，第 51 条起不再自动回复，任务状态显示「今日额度已满」',
    priority: '高',
  },
  {
    id: 'TC-046',
    module: '自动评论',
    scenario: '黑名单用户跳过',
    precondition: '监控任务配置了黑名单用户',
    steps: '黑名单用户发布含关键词的评论',
    expected: '监控识别到黑名单用户，不触发自动评论动作，命中记录标记为「已跳过」',
    priority: '中',
  },
  // === 批量任务测试用例 ===
  {
    id: 'TC-047',
    module: '批量任务',
    scenario: '批量发布视频到多平台',
    precondition: '已绑定 3 个平台账号，有多个视频素材',
    steps: '进入批量发布 → 上传 5 个视频 → 选择 3 个平台账号 → 确认发布',
    expected: '创建 5×3=15 条发布任务；任务记录列表正确显示所有子任务；各子任务按队列依次发布',
    priority: '高',
  },
  {
    id: 'TC-048',
    module: '批量任务',
    scenario: '批量重发失败任务',
    precondition: '任务记录中有 5 条发布失败的记录',
    steps: '勾选 5 条失败记录 → 点击批量重发 → 确认',
    expected: '5 条记录状态变更为「重试中」；重发结果独立统计，不影响原失败原因记录',
    priority: '高',
  },
  {
    id: 'TC-049',
    module: '批量任务',
    scenario: '批量暂停/恢复任务',
    precondition: '有多条进行中的定时发布任务',
    steps: '勾选多条任务 → 点击批量暂停 → 再点击批量恢复',
    expected: '暂停后任务不再执行；恢复后任务从暂停点继续执行，不重复已完成项',
    priority: '中',
  },
  {
    id: 'TC-050',
    module: '批量任务',
    scenario: '批量操作二次确认',
    precondition: '勾选了多条任务记录',
    steps: '点击批量删除 → 弹出确认弹窗 → 确认删除',
    expected: '危险操作需二次确认弹窗；确认后才执行；取消则不改变数据',
    priority: '高',
  },
  // === 数据大屏测试用例 ===
  {
    id: 'TC-051',
    module: '数据大屏',
    scenario: '大屏数据实时刷新',
    precondition: '进入数据大屏页面',
    steps: '停留 5 分钟，观察各图表数据变化',
    expected: '关键指标定时刷新（默认 30 秒）；刷新有动画过渡，不出现页面闪烁',
    priority: '中',
  },
  {
    id: 'TC-052',
    module: '数据大屏',
    scenario: '大屏分辨率适配',
    precondition: '大屏页面',
    steps: '分别在 1920×1080、2560×1440、1366×768 分辨率下查看大屏',
    expected: '各分辨率下图表布局自适应，文字不溢出，图表不变形',
    priority: '中',
  },
  {
    id: 'TC-053',
    module: '数据大屏',
    scenario: '大屏各模块数据一致性',
    precondition: '大屏页面有完整数据',
    steps: '对比大屏总粉丝数与数据中心粉丝报表 → 对比发布量与任务记录统计',
    expected: '大屏数据与各模块详情页数据一致，无统计口径差异',
    priority: '高',
  },
  // === 预警规则测试用例 ===
  {
    id: 'TC-054',
    module: '预警规则',
    scenario: '粉丝骤降预警触发',
    precondition: '已配置「粉丝数 1 小时内下降超过 5%」预警规则',
    steps: '模拟粉丝数据在 1 小时内下降 10%',
    expected: '触发预警通知，推送到通知中心和站内消息，预警记录可在监控页查看',
    priority: '高',
  },
  {
    id: 'TC-055',
    module: '预警规则',
    scenario: '播放量异常预警',
    precondition: '已配置作品播放量增速异常预警',
    steps: '监控某作品播放增速突增（远超历史均值 3 倍）',
    expected: '触发异常预警，可能是爆款也可能是刷量，标记待人工确认',
    priority: '中',
  },
  {
    id: 'TC-056',
    module: '预警规则',
    scenario: '预警去重与抑制',
    precondition: '同一预警规则频繁触发',
    steps: '同一指标在 10 分钟内连续 5 次满足预警条件',
    expected: '相同规则短时间内只推送一次预警通知，避免信息轰炸；冷却期后再次触发才重新推送',
    priority: '中',
  },
  // === 素材上传测试用例 ===
  {
    id: 'TC-057',
    module: '素材上传',
    scenario: '单张图片上传',
    precondition: '用户已登录，在素材库页面',
    steps: '点击上传 → 选择 1 张 JPG 图片（2MB）→ 确认上传',
    expected: '上传进度条正常推进；上传成功后素材列表出现该图片；缩略图正确显示',
    priority: '高',
  },
  {
    id: 'TC-058',
    module: '素材上传',
    scenario: '视频上传与转码',
    precondition: '在素材库页面',
    steps: '上传一个 100MB 的 MP4 视频文件',
    expected: '上传成功后进入转码队列；转码完成后可预览视频；生成封面缩略图',
    priority: '高',
  },
  {
    id: 'TC-059',
    module: '素材上传',
    scenario: '批量上传图片',
    precondition: '在素材库页面',
    steps: '一次选择 20 张图片批量上传',
    expected: '20 张图片并行/队列上传；全部成功后列表新增 20 项；支持单个失败重试',
    priority: '中',
  },
  {
    id: 'TC-060',
    module: '素材上传',
    scenario: '大文件上传限制',
    precondition: '在素材库页面，单个文件限制 500MB',
    steps: '尝试上传一个 600MB 的视频文件',
    expected: '上传前校验提示文件超出大小限制，拒绝上传，给出明确错误信息',
    priority: '高',
  },
  {
    id: 'TC-061',
    module: '素材上传',
    scenario: '格式不支持提示',
    precondition: '在素材库页面',
    steps: '尝试上传一个 .exe 或 .zip 文件',
    expected: '提示不支持的文件格式，列出支持的格式清单，不上传该文件',
    priority: '中',
  },
  // === V4 布局与视觉测试用例 ===
  {
    id: 'TC-062',
    module: '布局与视觉',
    scenario: '顶部不被遮挡',
    precondition: '用户已登录，使用默认布局',
    steps: '依次打开首页、账号管理、一键发布、粉丝互动、数据中心、设置等页面',
    expected: '所有页面的页面标题、提示条、筛选栏均完整可见，不被顶部导航栏遮挡，内容区起始位置正确',
    priority: '高',
  },
  {
    id: 'TC-063',
    module: '布局与视觉',
    scenario: '侧边栏不溢出',
    precondition: '用户已登录',
    steps: '打开账号管理页查看左侧分组树 → 打开粉丝互动页查看左侧分组菜单 → 检查文字和图标显示',
    expected: '左侧分组树、各页面侧边栏文字和图标完整显示，不被屏幕左边缘裁切，无横向滚动条',
    priority: '高',
  },
  {
    id: 'TC-064',
    module: '布局与视觉',
    scenario: '1366×768 分辨率适配',
    precondition: '浏览器窗口调整为 1366×768',
    steps: '浏览各主要页面（首页、账号管理、发布任务记录、评论管理、数据中心）',
    expected: '布局正常，无横向滚动条（表格内滚动除外），关键操作按钮可见，内容不溢出',
    priority: '高',
  },
  {
    id: 'TC-065',
    module: '布局与视觉',
    scenario: '1920×1080 分辨率适配',
    precondition: '浏览器窗口调整为 1920×1080',
    steps: '浏览各主要页面，检查内容区宽度和居中效果',
    expected: '布局正常，内容居中有最大宽度限制，两侧留白均匀，不出现大面积空白或内容拉伸变形',
    priority: '中',
  },
  {
    id: 'TC-066',
    module: '布局与视觉',
    scenario: '主题切换全站生效',
    precondition: '用户已登录，在设置页或首页右侧主题切换',
    steps: '切换为明亮 → 切换为暗黑 → 切换为跟随系统 → 跳转到其他页面验证',
    expected: '所有页面主题立即切换且样式正确，卡片、文字、边框、图表颜色均适配对应主题，刷新后保持',
    priority: '高',
  },
  {
    id: 'TC-067',
    module: '布局与视觉',
    scenario: '响应式窗口缩放',
    precondition: '打开任意列表页面',
    steps: '从 1920px 逐步缩小窗口到 1024px → 再逐步放大回 1920px',
    expected: '布局随窗口宽度变化自适应，不出现内容溢出或大面积空白，表格/卡片等组件正确重排',
    priority: '中',
  },
  {
    id: 'TC-083',
    module: '布局与视觉',
    scenario: '菜单激活态唯一性',
    precondition: '用户已登录，在任意模块页面',
    steps: '依次进入各模块页面 → 检查左侧子菜单高亮项数量 → 在同一模块内切换不同子页',
    expected: '任意页面在左侧子菜单中只有且仅有一个高亮选中项，无残留高亮或多个同时高亮的情况',
    priority: '高',
  },
  {
    id: 'TC-084',
    module: '布局与视觉',
    scenario: '默认子项精确匹配',
    precondition: '用户已登录，存在带默认子页的模块（如数据中心-作品监控）',
    steps: '进入数据中心模块（默认展示作品监控）→ 点击切换到「播放流速」子页 → 观察左侧菜单高亮',
    expected: '进入同模块其他子页时，默认子项不再保持高亮，高亮精确切换到当前所在子菜单项',
    priority: '高',
  },
  // === V4 导航与路由测试用例 ===
  {
    id: 'TC-085',
    module: '导航与路由',
    scenario: '顶部一级菜单唯一高亮',
    precondition: '用户已登录，在任意页面',
    steps: '依次点击顶部各一级菜单（首页、账号管理、一键发布、粉丝互动、数据中心、设置）→ 每次观察顶部选中态',
    expected: '任意时刻顶部导航栏只有一个一级菜单处于选中状态，切换后前一个菜单高亮消失，无多个同时高亮',
    priority: '高',
  },
  {
    id: 'TC-086',
    module: '导航与路由',
    scenario: '子菜单切换跟随',
    precondition: '用户已登录，在有多个子菜单的模块（如一键发布、数据中心）',
    steps: '在一键发布模块依次点击「发条单视频」「批量发视频」「任务记录」「任务统计」→ 观察左侧高亮变化',
    expected: '在同一模块的子菜单之间切换时，高亮正确跟随当前选项，无延迟、无残留高亮、无闪烁',
    priority: '高',
  },
  {
    id: 'TC-087',
    module: '导航与路由',
    scenario: '刷新后选中态一致',
    precondition: '用户已登录，位于某个子页面（如数据中心-播放流速）',
    steps: '停留在当前子页面 → 刷新浏览器 → 观察顶部一级菜单和左侧子菜单的高亮状态',
    expected: '刷新页面后，左侧子菜单和顶部一级菜单的高亮与当前路由一致，与刷新前保持完全相同',
    priority: '高',
  },
  // === V4 三级联动筛选测试用例 ===
  {
    id: 'TC-068',
    module: '三级联动筛选',
    scenario: '平台筛选联动分组',
    precondition: '用户有多个平台账号，分属不同分组',
    steps: '在账号筛选栏选择「抖音」→ 查看分组下拉选项',
    expected: '分组下拉只显示该抖音平台下有账号的分组，无账号的分组不出现',
    priority: '高',
  },
  {
    id: 'TC-069',
    module: '三级联动筛选',
    scenario: '平台+分组联动账号',
    precondition: '用户已选定平台和分组',
    steps: '选定平台=小红书、分组=美妆组 → 查看账号下拉选项',
    expected: '账号下拉只显示该平台+该分组下的账号，其他账号不出现',
    priority: '高',
  },
  {
    id: 'TC-070',
    module: '三级联动筛选',
    scenario: '三级逐级过滤列表',
    precondition: '评论/任务/粉丝等列表页有跨平台跨分组数据',
    steps: '选择平台 → 选择分组 → 选择账号 → 观察列表数据变化',
    expected: '每选一级筛选，数据列表对应过滤，最终只显示所选账号下的评论/任务/粉丝等数据',
    priority: '高',
  },
  {
    id: 'TC-071',
    module: '三级联动筛选',
    scenario: '重置回全部',
    precondition: '已选定平台、分组、账号三级筛选',
    steps: '将平台选择改为「全部平台」',
    expected: '分组和账号自动恢复为全部可选，列表显示全部数据，筛选状态重置正确',
    priority: '高',
  },
  {
    id: 'TC-072',
    module: '三级联动筛选',
    scenario: '统计数字联动更新',
    precondition: '顶部有统计卡（账号数、作品数、粉丝数等）',
    steps: '切换不同的平台/分组/账号筛选组合',
    expected: '筛选后顶部统计卡数字随筛选范围更新，与列表数据口径一致',
    priority: '中',
  },
  {
    id: 'TC-073',
    module: '三级联动筛选',
    scenario: '统一组件复用',
    precondition: '浏览各模块列表页',
    steps: '对比一键发布、评论管理、粉丝管理、数据中心等页面的账号筛选栏',
    expected: '各模块的账号筛选外观和交互一致，均采用「平台→分组→账号」三级联动下拉，样式和操作逻辑统一',
    priority: '中',
  },
  // === V4 数据中心监控测试用例 ===
  {
    id: 'TC-074',
    module: '数据中心监控',
    scenario: '开始监控加载态',
    precondition: '在作品监控页面，尚未启动监控',
    steps: '点击「开始监控」按钮',
    expected: '立即显示加载中状态（骨架屏或加载提示），用户感知操作已响应，不会重复点击',
    priority: '高',
  },
  {
    id: 'TC-075',
    module: '数据中心监控',
    scenario: '监控运行有数据增量',
    precondition: '监控已启动',
    steps: '观察作品卡片数据变化，持续 30 秒以上',
    expected: '展示作品卡片网格，播放/点赞/评论等数据有增量动画效果，数值动态变化',
    priority: '高',
  },
  {
    id: 'TC-076',
    module: '数据中心监控',
    scenario: '停止监控',
    precondition: '监控正在运行中',
    steps: '点击「停止监控」按钮 → 观察状态和数据变化',
    expected: '状态切换为已停止，数据停止增量，按钮文案和状态徽章正确更新',
    priority: '高',
  },
  {
    id: 'TC-077',
    module: '数据中心监控',
    scenario: '三级筛选作品',
    precondition: '作品监控页面有多个平台多个账号的作品',
    steps: '按平台筛选 → 再按分组筛选 → 再按账号筛选',
    expected: '作品列表按平台/分组/账号逐级正确过滤，最终只显示所选账号的作品',
    priority: '中',
  },
  // === V4 交互闭环测试用例 ===
  {
    id: 'TC-078',
    module: '交互闭环',
    scenario: '所有按钮点击有反馈',
    precondition: '浏览各页面',
    steps: '逐个点击页面上的主要按钮（操作按钮、切换按钮、Tab 等）',
    expected: '每个按钮点击后有明确响应（弹窗出现/状态变化/toast 提示/加载态），无点击无反应的死按钮',
    priority: '高',
  },
  {
    id: 'TC-079',
    module: '交互闭环',
    scenario: '批量操作完整闭环',
    precondition: '列表页有多条记录',
    steps: '勾选多条记录 → 点击批量操作按钮 → 在确认弹窗中确认 → 观察列表更新',
    expected: '选择多条→批量操作→确认→列表更新完整走通，操作后列表状态正确，操作结果有提示',
    priority: '高',
  },
  {
    id: 'TC-080',
    module: '交互闭环',
    scenario: '弹窗可正常开关',
    precondition: '页面有 Dialog/Sheet/抽屉等弹窗组件',
    steps: '点击打开按钮 → 弹窗出现 → 点击关闭/遮罩/取消 → 弹窗关闭 → 再次打开',
    expected: '所有 Dialog/Sheet/抽屉可正常打开和关闭，关闭后状态清除，再次打开内容正确',
    priority: '高',
  },
  {
    id: 'TC-081',
    module: '交互闭环',
    scenario: '分页功能生效',
    precondition: '列表页数据量超过一页',
    steps: '切换到第 2 页 → 再切换回第 1 页 → 修改每页条数',
    expected: '列表分页切换正确，每页条数切换生效，当前页高亮和总数显示正确',
    priority: '中',
  },
  {
    id: 'TC-082',
    module: '交互闭环',
    scenario: '导出 CSV 文件',
    precondition: '各列表页有数据',
    steps: '在发布任务、评论管理、粉丝列表、操作日志等页面点击「导出」按钮',
    expected: '可生成并下载 CSV 文件，文件内容与当前筛选结果一致，编码正确可被 Excel 打开',
    priority: '中',
  },
];

const defectLevels = [
  { level: '致命', color: 'bg-destructive text-destructive-foreground', desc: '系统崩溃、数据丢失、核心功能完全不可用、安全漏洞等' },
  { level: '严重', color: 'bg-warning text-warning-foreground', desc: '主要功能异常、重要数据计算错误、性能严重不达标等' },
  { level: '一般', color: 'bg-primary text-primary-foreground', desc: '普通功能缺陷、UI 显示问题、交互不顺畅但不影响核心使用' },
  { level: '轻微', color: 'bg-muted text-muted-foreground', desc: '文字错误、样式小瑕疵、建议优化项等' },
];

const checklist = [
  '所有 P0 功能点已开发完成并通过测试',
  '核心流程（注册 → 激活 → 绑定账号 → 发布内容）端到端跑通',
  '越权访问测试全部通过，数据行级隔离有效',
  '敏感数据加密存储，密码不存储明文',
  '接口错误率低于 0.1%，关键接口响应时间 < 1s',
  '主流浏览器（Chrome / Edge / Safari）兼容性测试通过',
  '管理后台操作日志完整记录所有关键操作',
  '用户协议与隐私政策页面已上线',
  '数据备份机制已配置并验证可恢复',
  '监控告警系统已配置，错误率超阈值可及时通知',
  '各平台 OAuth 回调地址已配置正确',
  '生产环境 HTTPS 证书有效，HTTP 自动跳转 HTTPS',
  '登录失败锁定机制正常工作',
  '发布队列与定时任务在服务重启后可恢复',
  '文档中心内容完整，与产品功能一致',
];

const TestingPage: React.FC = () => {
  const [showEditTip, setShowEditTip] = useState(false);

  return (
    <div className="mx-auto max-w-5xl py-8">
      {/* 页面标题区 */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <Badge variant="secondary">文档中心</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">测试方案与用例</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            测试策略、典型测试用例、缺陷管理与上线验收标准
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

      {/* 测试类型 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">一、测试类型</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {testTypes.map((t) => (
            <Card key={t.name}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <t.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{t.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                {t.desc}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 测试用例分类卡片 */}
      <section className="mb-8">
        <h2 className="mb-4 text-xl font-semibold">二、测试用例分类</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { name: '通知中心', icon: Bell, count: testCases.filter((t) => t.module === '通知中心').length, color: 'text-blue-500' },
            { name: '导出功能', icon: Download, count: testCases.filter((t) => t.module === '导出功能').length, color: 'text-emerald-500' },
            { name: '自动评论', icon: MessageSquare, count: testCases.filter((t) => t.module === '自动评论').length, color: 'text-purple-500' },
            { name: '批量任务', icon: Layers, count: testCases.filter((t) => t.module === '批量任务').length, color: 'text-orange-500' },
            { name: '数据大屏', icon: LayoutDashboard, count: testCases.filter((t) => t.module === '数据大屏').length, color: 'text-pink-500' },
            { name: '预警规则', icon: AlertCircle, count: testCases.filter((t) => t.module === '预警规则').length, color: 'text-red-500' },
          { name: '素材上传', icon: Upload, count: testCases.filter((t) => t.module === '素材上传').length, color: 'text-cyan-500' },
           { name: '布局与视觉', icon: Monitor, count: testCases.filter((t) => t.module === '布局与视觉').length, color: 'text-indigo-500' },
           { name: '导航与路由', icon: Navigation2, count: testCases.filter((t) => t.module === '导航与路由').length, color: 'text-sky-500' },
           { name: '三级联动筛选', icon: Layers, count: testCases.filter((t) => t.module === '三级联动筛选').length, color: 'text-violet-500' },
          { name: '数据中心监控', icon: Gauge, count: testCases.filter((t) => t.module === '数据中心监控').length, color: 'text-teal-500' },
          { name: '交互闭环', icon: MousePointerClick, count: testCases.filter((t) => t.module === '交互闭环').length, color: 'text-amber-500' },
        ].map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.name}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${c.color}`} />
                    <span className="text-sm font-medium">{c.name}</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold">{c.count}</div>
                  <div className="text-xs text-muted-foreground">条测试用例</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 测试用例表格 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">
          三、典型测试用例（{testCases.length} 条）
        </h2>
        <Card>
          <CardContent className="p-0 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">用例编号</TableHead>
                  <TableHead className="w-[100px]">模块</TableHead>
                  <TableHead className="w-[160px]">测试场景</TableHead>
                  <TableHead className="w-[140px]">前置条件</TableHead>
                  <TableHead className="w-[200px]">操作步骤</TableHead>
                  <TableHead>预期结果</TableHead>
                  <TableHead className="w-[60px]">优先级</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testCases.map((tc) => (
                  <TableRow key={tc.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {tc.id}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="w-fit">
                        {tc.module}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{tc.scenario}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tc.precondition}
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                      {tc.steps}
                    </TableCell>
                    <TableCell className="text-xs leading-5">
                      {tc.expected}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          tc.priority === '高'
                            ? 'destructive'
                            : tc.priority === '中'
                              ? 'default'
                              : 'secondary'
                        }
                        className="text-[10px] px-1.5"
                      >
                        {tc.priority}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* 缺陷管理流程 */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">三、缺陷管理流程</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bug className="h-4 w-4 text-destructive" />
                缺陷等级划分
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {defectLevels.map((d) => (
                  <div key={d.level} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${d.color}`}
                    >
                      {d.level}
                    </span>
                    <p className="text-sm text-muted-foreground">{d.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                缺陷生命周期
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm">
                {['新建', '确认', '修复', '验证', '关闭 / 重开'].map(
                  (step, i, arr) => (
                    <React.Fragment key={step}>
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                        {step}
                      </span>
                      {i < arr.length - 1 && (
                        <span className="text-muted-foreground">→</span>
                      )}
                    </React.Fragment>
                  ),
                )}
              </div>
              <Separator className="my-4" />
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">管理工具：</strong>
                  使用项目管理工具进行缺陷跟踪，每条缺陷包含标题、复现步骤、预期结果、实际结果、截图、等级、负责人、状态等信息。
                </p>
                <p>
                  <strong className="text-foreground">修复优先级：</strong>
                  致命 / 严重缺陷必须在 24 小时内响应，一般缺陷按版本规划修复，轻微缺陷集中处理。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 上线验收 Checklist */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">四、上线前验收 Checklist</h2>
        <Card>
          <CardContent className="pt-6">
            <ul className="space-y-3">
              {checklist.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-sm leading-6"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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

export default TestingPage;

# 多平台新媒体账号矩阵管理系统

SaaS 网页应用，集中管理抖音、小红书、微信视频号、B站等平台的账号、内容、粉丝、私信、评论与自动回复。采用「用户注册 + VIP 授权码激活」模式。

## 端口与角色

- **用户端**（/ 前缀）：普通 VIP 用户使用，8 大模块
- **管理后台**（/admin 前缀）：运营者使用，6 大模块
- **文档中心**（/docs 前缀）：登录后可查看，6 个文档页面
- **认证页**（/login, /register, /activate, /forgot-password）：独立布局

## 角色体系

| 角色 | 说明 | 入口 |
|------|------|------|
| 普通用户 | 注册后未激活 VIP → 仅能访问激活页和个人设置 | 用户端 |
| VIP 用户 | 激活授权码后可使用全部用户端功能 | 用户端 |
| 管理员 | 独立账号体系，使用管理后台 | /admin/login |

## 设计规范

### 设计规范

#### 色彩系统
- 主色：`hsl(221 83% 53%)` — 科技蓝，体现 SaaS 专业感
- 成功：`hsl(130 54% 42%)`
- 警告：`hsl(26 90% 49%)`
- 危险：`hsl(2 84% 62%)`
- 背景：`hsl(220 20% 98%)`
- 卡片：`hsl(0 0% 100%)`
- 边框：`hsl(220 14% 89%)`

### 平台品牌色
- 抖音：`hsl(0 0% 8%)`（黑） + `hsl(340 85% 55%)`（品红点缀）
- 小红书：`hsl(350 85% 60%)`（红色）
- 微信视频号：`hsl(142 45% 45%)`（微信绿）
- B站：`hsl(200 90% 55%)`（B站粉蓝）

#### 布局
- 用户端侧边栏 240px 固定宽度，顶部栏 56px
- 管理后台侧边栏 240px，顶部栏 56px
- 文档中心左侧目录 240px，右侧内容区
- 内容区最大宽度 1280px，居中，内边距 24px
- 卡片间距 16px，区块间距 24px

#### 排版
- 标题：text-xl / font-semibold（页面级），text-lg / font-semibold（卡片级）
- 正文：text-sm / leading-5
- 辅助文字：text-xs / text-muted-foreground
- 数字指标：text-2xl / font-bold

#### 组件使用
- 表格：antd-table（@lark-apaas/client-toolkit/antd-table）
- 表单：Shadcn Form + React Hook Form + Zod
- 图表：ReactECharts
- 图标：lucide-react
- 弹窗：shadcn Dialog
- 徽章/状态：Badge + 语义色

## 模块清单

### V3 导航结构（顶部7个一级菜单）
1. 首页（dashboard）- 公告卡 + 3统计卡 + 视频教程/FAQ/会员对比 Tab + 右侧信息卡（主题切换/用户信息/VIP/客服）
2. 账号管理（accounts）- 左侧分组树 + 右侧多 Tab 创作者数据看板（内容吸引力/观看趋势/流量来源/搜索关键词/章节点击率）
3. 一键发布（publish）- 6个子菜单：发条单视频、批量发视频、批量发图文、本地草稿箱、任务记录、任务统计
4. 粉丝互动（engage）- 左侧4分组：评论（4项）、私信（3项）、粉丝（2项）、自动化（6项：关键词回复/欢迎语/离线回复/监控任务/主动私信/消息模板）
5. 数据中心（analytics）- 6个子菜单：作品监控、播放流速、账号监控、通知监控、作品违规、草稿监控
6. 文档中心（docs）
7. 设置（settings）- 个人资料、修改密码、VIP 状态、登录记录

> V3 变化：原「自动化」一级菜单整体并入「粉丝互动」左侧「自动化」分组，顶部菜单由8个精简为7个。

### 管理后台模块

### V3 UI 增强
- 卡片：统一圆角-lg + 柔和阴影（shadow-sm）+ hover 微提升（shadow-md）+ 白色/深色背景
- 状态徽章：成功绿 / 失败红 / 进行中橙 / 等待灰
- 涨跌色：数据增量绿色 +N，减少红色 -N
- 主题：明亮（默认）/ 黑暗 / 跟随系统 三档，ThemeContext + localStorage 持久化
- 强调色：橙色 hsl(26 90% 49%) 用于按钮、链接、高亮（科技蓝为主色的补充强调）
- 示例数据提示：每个功能页顶部橙色提示条，标注「示例数据/演示流程/待授权」

---

## 技术架构

### 管理后台模块
1. 运营总览（admin/dashboard）
2. 用户管理（admin/users）
3. 授权码管理（admin/codes）
4. 套餐管理（admin/plans）
5. 操作日志（admin/logs）
6. 系统配置（admin/settings）

### 文档中心
1. 产品框架总览（docs/overview）
2. 功能需求清单（docs/requirements）
3. 非功能需求（docs/non-functional）
4. 扩展路线图（docs/roadmap）
5. 测试方案（docs/testing）
6. 平台接入指南（docs/platforms）

## 数据库表（核心）

- app_users — 用户表（独立于平台 user_profile）
- vip_plans — 套餐表
- activation_codes — 授权码（卡密）表
- platform_accounts — 平台账号绑定表
- content_posts — 内容发布表
- follower_records — 粉丝记录表
- message_sessions — 私信会话表
- message_items — 私信消息表
- comment_items — 评论表
- auto_reply_rules — 自动回复规则表
- monitor_tasks — 监控任务表（粉丝/私信/评论关键词监控）
- monitor_hit_records — 监控命中记录表
- auto_message_tasks — 主动私信任务表
- auto_message_task_items — 主动私信任务子项表
- message_templates — 消息模板表（含审核状态）
- admin_users — 管理员表
- operation_logs — 操作日志表

## 技术架构

- 前端 React 19 + Router v6，多布局（用户端/管理后台/文档/认证页）
- 后端 NestJS，按模块组织：auth, users, vip, admin, platform, content, messages, comments, analytics
- 数据持久化 PostgreSQL + Drizzle ORM
- 认证：JWT（自有用户体系，不依赖平台 userContext）
- 密码：bcrypt 加盐哈希
- 平台对接：适配器模式，当前为示例数据 + OAuth 占位

## 合规要求

- 所有未真实接通平台能力的页面必须有清晰的「示例数据」「演示流程」标注
- 自动回复模块默认启用关键词回复，群发模块默认禁用并加红色警示
- 文档中心明确说明各平台接入资质要求
- 主动私信、监控、自动回复仅限已授权自有矩阵账号 + 平台允许的会话关系，不突破平台规则
- 随机间隔与频控定位为账号安全保护机制，默认采用保守配置，用户可调高但不可低于平台限制
- 发送失败原因如实展示平台侧限制说明（如「对方非粉丝无法私信」「当日额度已达上限」），不做模糊化处理

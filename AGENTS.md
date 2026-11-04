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

## 本地交付与上传审批（用户要求，2026-10-13）

- 新功能先在本地完成修改、测试、构建和安装，让用户实际体验；不要每完成一个功能就自动上传或发布版本。
- 重启安装前确认没有未保存内容或正在执行的任务，保留账号、登录状态、数据库和业务数据；未经体验确认保留必要的回退安装包。
- 用户已授权在确认没有未保存内容或正在执行的任务后，自行通过正常窗口关闭流程退出矩效再更新，不必每轮重复要求用户退出。无法确认草稿或任务状态、出现关闭确认弹窗或正常关闭未完成时，暂停更新并说明；不得强制结束进程。
- 每次上传都须询问用户，并取得针对本次上传的明确同意。以前的上传授权不适用于后续更新。
- 这项审批同时适用于源码 git push、安装包/报告上传，以及 GitHub Release/tag 的创建或修改。未获本次同意时停留在本地，不主动执行这些远程写入。
- 用户体验满意并明确同意上传后，才上传源码和安装包，校验上传结果；不要擅自删除 GitHub 历史版本。

## 更新备份与存储占用（2026-10-23 整理后约束）

- 2026-11-01 用户明确要求删除不需要的存储占用。后续交付须检查淘汰构建产物，保留当前安装对应包、前一已验证回退包及当前候选；只按明确清单清理旧生成的安装包/解包目录。源码、验证记录、业务备份不混作构建垃圾，不能凭目录大直接删除；保留回退源和相匹配的备份。不要重新积累上百份重复构建。

- 更新备份统一使用 `scripts/backup-user-data-before-rc31.ps1 -TargetRelease rc.N`，沿用默认的诊断日志、浏览器可再生缓存排除规则；不要另写整目录复制命令绕过这些规则。历史文件名中的 rc31 不限制目标版本，使用参数指定实际版本。
- `logs/matrix-server.log` 是持续增长的诊断日志。它及 Chromium 的 `Cache`、`Code Cache`、GPU/着色器缓存曾因每次更新重复复制而多次占满 D 盘，不能放入常规业务备份。确需保留的诊断日志单独压缩归档并完整校验。
- 必须保留数据库、账号、Cookie、Local Storage、IndexedDB、Service Worker 的 CacheStorage、已保存草稿、业务操作记录；不得把这些内容当作普通网页缓存删除。
- 备份前按备份目录实际所在的物理卷计算容量，待复制的数据之外至少留出 30 GiB。应用数据的 C 盘逻辑路径可能映射到 D 盘，不能只按路径盘符判断。容量不足应先报告并处理可再生缓存，不删除业务数据来让备份继续。
- 当前运行日志仍需软件实现大小限制和轮转。单次清理、NTFS 压缩或上述备份排除规则不能当作运行日志已经设置保留上限。不要据此承诺磁盘不会再次增长。

## 账号入口与模块边界（用户要求，2026-10-14）

- 添加、绑定及重新授权账号统一在 `/accounts` 的账号管理页面进行；更多平台目录同样属于账号管理。
- 首页仅显示概览与模块导航，不直接打开官方账号浏览器或触发绑定。
- 功能页只能选择已绑定账号；前台官方页面按所属功能页隔离，不通过共享标签把评论、私信和发布状态互相覆盖。
- 切换普通功能模块只隐藏前台页面，不中断后台发布队列或清除已保存草稿；遇到权限和登录问题引导去账号管理。

### 账号管理合并界面（用户补充要求）

- 账号管理直接进入左侧分组账号、右侧官方页面的工作区，不再暴露独立账号列表和分组页面。
- 分组支持拖动账号、颜色持久化和组内账号批量打开；默认分组不可改名或删除，菜单仅含打开所有账号、设置颜色。
- 所有绑定及设置仍只属于账号管理；首页和其他模块不得借此重新出现全局绑定入口。
- 平台标识使用各平台官网公开引用的品牌 Logo，不使用音符、书本、摄像机或电视等通用图标代替；本人头像与平台角标分别显示，Logo 随包保存。
- 分组设置颜色改变整条分组标题栏的背景，采用参考图的浅色栏位预设；不只改变小圆点，也不把颜色扩散到账号行。颜色应保留到重新启动之后。

## 2026-10-30 RC274 发布结果与用时

- RC274已正常安装并启动，172组回归及16组包内验证通过。D盘备份before-update-rc.274-20261030-014707，数据字节与密钥校验通过。第二十九天已经发布，禁止测试重发。
- 抖音提交后增加同账号独立只读结果页和本人主页；稳定身份、作品等证据成立即结束等待。批量单条结束通知立即核对所属结构化回执，不能用进度通知直接标成功。执行起点独立保存；旧记录缺起点仅标注总用时含排队，实机第二十九天显示1分53秒。隔离回归不等于新作品实发。
- 同目录封面精确同名优先，有限支持封面后缀并拒绝歧义，保留手动选择；只测试读取。第一次候选未安装；第二次回归因Object.hasOwn目标库不支持失败，第三次改兼容调用后通过。详情docs/rc274-publish-result-timing.txt。
- 存储压缩候选仍只是工作区隔离原型，未接入生产。早期基准采样阶段及并发干扰已记录，不得把负堆差或不同阶段字节比宣称实际内存优化；关键词到指定发送账号池仍待接入，禁止向真实用户测试发送。

## 2026-10-30 RC275 互动存储与固定账号池

- RC275已正常安装并启动，174组回归、22组包内验证及33文件工作线程图校验通过。D盘备份before-update-rc.275-20261030-025343，数据字节和原密钥通过。第二十九天实机再次显示总用时含排队1分53秒，没有重发。
- 上条“压缩仅隔离原型”现由本条覆盖：认证压缩YXOP2已交付，仍读YXOP1，解码大小有界；移除无用历史副本。合成混合5000条存储4.48MB降至1.45MB、保留JS堆约减半，但冷重开144→161ms；不是整机或真实平台性能证明。旧程序不识别YXOP2，回退须对应更新前备份。
- 联系人固定1至10个账号池已接入，逐账号目录核验、不同联系人固定分配、预览后启动。关键词自动触发尚未实现，后续继续；不得向真实用户测试发送或失败后换账号重试。
- 首轮Electron验证脚本hash(ASAR)被虚拟文件系统解释为包内根路径而ENOENT，保留错误。改普通Node校验包、真实Electron验证已核对的解包模块后全部通过，产品冻结代码未因测试错误改变。详见docs/rc275-operations-storage-pool.txt。

## 2026-10-30 RC278 已交付与 RC279 候选

- 当前已安装 RC278，183组源回归、32组包内核验通过。备份 before-update-rc.278-20261030-060438，业务数据/原密钥校验通过。第二十九天仍发布成功、总用时含排队1分53秒；旧执行起点未记录，不可重发或补造时间。详见 docs/rc278-delivery.txt。
- 关键词新评论到固定账号池已于 RC276 接入，RC278补单条未发送任务过期/取消后继续监控；重启后暂停。之前“关键词尚未实现”只代表当时阶段。隔离测试不等于已对真人实发，禁止向真实用户测试发送。
- 日志当前已有 desktop/bounded-server-log.cjs 的四段×8MiB轮转，先前“仍需大小限制”不再代表当前状态。RC279候选进一步使用公开采样配置减少持续SQL诊断追踪，保持警告/错误及网页版配置；候选尚待构建、包内验证与安装，不冒充已交付。见 docs/rc279-desktop-trace-candidate.txt。
- RC277加密模块一小时合成观察已于06:31实际完成：719次写入、1444次读回、5次同进程重开一致；06:33独立核验测试父子进程查无、临时目录已移除、退出0，来源模块未变。见 docs/rc277-write-soak-completed.txt。不是全软件或进程重启持久化验收。

## 2026-10-30 RC279 已安装

- 上条RC279候选已完成184组回归及33组包内核验，06:38正常安装启动，业务数据与原密钥校验通过。备份 before-update-rc.279-20261030-063456。详见 docs/rc279-delivery.txt。
- 桌面诊断Span关闭，警告/错误保留且同步/异步异常传播经真实SDK核验。实机各一分钟观察日志新增约2.02MB→0B；只代表观察窗口，不是全软件CPU/内存改善比例，现有4×8MiB轮转仍保留。未发真实测试消息或作品。
- 第二十九天任务仍成功、总用时含排队1分53秒，旧执行起点未知。不要测试重发或修改历史任务状态。全部平台能力仍未完成，功能清单缺口继续保留。

## 2026-10-30 07:14 RC280 实际发送窗口修复已交付

- 185组完整回归、34项实际包检查通过；实际发送前/最终授权按 dispatchedAt 检查滚动1小时/24小时额度，未知尝试计入，等待规则让其他合格规则继续，过期队列取消。51项专门断言及原失败证据保留。
- 正常退出、D盘备份 D:\MatrixUserBackups\before-update-rc.280-20261030-070913、安装后数据/密钥校验通过；实际加载 /assets/index-DUU1OJVZ.js。原第二十九天任务仍发布成功，总用时（含排队）1分53秒，缺失执行起点未伪造。无真实测试发送。
- ASAR a7d7d1cb793f58aeb710ca8dec086f4ed2673d0a47aa68ccc097bafe9d87c365；源码 1cd044fff6c61c295ed79cd77af0cf9f2acccf2cee4aa028c010de13cdd67cfc。详见 docs/rc280-delivery.txt 和 D:/codexworck/软件/matrix-rc280-*.json。11点目标继续，未宣称全平台功能齐全。

## 2026-10-30 07:33 RC281 开发候选：协作历史索引与快照

- 当前安装仍RC280；本批源码尚未构建/安装，package版本待整批提升。新增37项加密临时库性能及不变性检查，两个5000条平方级查找各12,502,500次改为索引；返回副本和跨文件首匹配语义保留。
- 同进程同数据11组交替比较快照50.18→26.93ms、更新353.04→288.14ms；其他负载样本更慢亦保留，不称全软件改善比例。worker61+源185、归档52、关键词77、过期38通过；完整新门禁和实际包未跑。
- 下一步补协作任务超过300条的有界分页/筛选，不把全部历史发到页面；跨页清空选择与发送预览。详见 docs/rc281-performance-candidate.txt、D:/codexworck/软件/matrix-rc281-progress.txt。无真实测试发送。

## 2026-10-30 08:20 RC281 已安装并完成只读验收

- 上条候选已完成187组完整回归、36项实际包检查；正常退出、D盘备份before-update-rc.281-20261030-081341、安装与数据/原密钥校验通过，实际加载/assets/index-v0si_sC_.js。原第二十九天仍成功，执行未记录、总用时含排队1分53秒，没有重发或修改历史时间。
- 协作历史每页100条，状态/发送账号筛选、末页夹取、跨页清空选择与预览、迟到响应隔离已接通。651条临时库64断言、真实React73检查及窄窗口目视通过。5000条存储索引与复制优化37断言通过；11组交替基准50.18→26.93ms读取、353.04→288.14ms更新，仅代表该隔离数据，较慢样本和原失败保留。
- 源码7bb9c2e308c89db8448bbac7ad8a3fc375bfdca6e1cfc65029fd849763352782/825文件；ASAR0f3532a7d71305c9c0741a41f8a71264458fc5ba7b1fe74ff9b2b27cd39dc8c4。详见docs/rc281-delivery.txt。11点目标继续，真实平台批量发送未测试；全平台缺口按功能清单保留，数据中心本身已实现，播放流速/全平台违规源仍待接入。

## 2026-10-30 09:04 RC282 回复历史已交付

- 回复历史每页100条、状态/账号筛选、原文独立返回和原任务ID操作已接通。126项加密库及投影、真实React111、worker74+原组件185、完整188组及实际包37项通过，失败测试夹具记录保留。没有真实测试发送。
- 正常退出、D盘备份before-update-rc.282-20261030-085824、安装后数据/原密钥校验通过，实际加载/assets/index-C68blCNa.js；原第二十九天仍成功、执行未记录、总用时含排队1分53秒。源码6f76cdb7d3b1826e7cdd748f827e61cbcf0000ca6b827a8489a04dc5f3c2814b/827；ASAR8914facf90258070c0aae005133ebdb448630843ba7f06726be94fa5c8c1e67d。详见docs/rc282-delivery.txt。
- 下一项已有证据：最新会话全渠道截300条会让大量评论挤出私信，accountId/threadId键也会合并不同渠道的同编号。两项均经纯投影及实际校验后的加密合成库复现，尚未修复，见D:/codexworck/软件/matrix-rc283-display-*.json。冻结RC282未被审计修改；官网服务readPage已传previewFirst:true。11点目标继续，不把全平台缺口称为完成。

## 2026-10-30 09:47 RC283 私信独立分页已交付

- 上条两项显示缺陷已修复，单聊来信独立100条分页、账号筛选、最新来信和群/本人事件隔离。跨页/账号/新来信替换清理选择与预览，迟到快照不覆盖新页。94项加密库、126项旧回复兼容、真实React149、worker83+原组件185、完整189组及包内38项通过；时序夹具与准备脚本失败如实保留。
- 正常退出/D盘备份before-update-rc.283-20261030-094222/安装/业务数据与原密钥校验通过，实机加载/assets/index-CsWwbcJn.js。第二十九天仍成功、执行未记录、总用时含排队1分53秒，无重发或补造历史时间。源码3bd056b75ba1ba702ba5e2c38073b02fdf9b8b92a248dcc21caed90931ed74dc/828；ASAR9c451adb8a20a3532edc21e74e7d3cf7f469f43eb71c4900f234f88c82600239。
- 详见docs/rc283-delivery.txt及本批外部回执。没有向真实用户测试发送或发布作品。11点目标仍进行，全平台缺口按清单保留，勿称所有功能齐全。

## 2026-10-30 10:26 RC284 预览一致性已交付，持续观察仍运行

- 已复现并修复等待回复预览时修改正文仍恢复旧预览的问题；正文/来信/接收人/账号绑定变化时失效，旧用户结果不带入，普通刷新保留。React162、完整189组及包38项通过，desktop/worker与RC283逐字节一致。独立协作取消165项通过，不将未复现路径说成缺陷。
- 正常退出、D盘备份before-update-rc.284-20261030-101813、安装及业务字节/原密钥校验通过；实际/assets/index-RjJyyiXK.js，原第二十九天成功/执行未记录/总用时含排队113秒。源码df53c011d058ffe397b70c952fb21cd72bac7e37e09c3fd12c1d7c1163c93854/828；ASAR87ea4dd439d8c25423077135c51f817334803f913e254f18e56f7131a761daad。
- 20分钟各5000条历史的React隔离观察会话40786正在运行，fixture65912/43364；已翻到50页，尚未完成。不得改源代码影响指纹、提前宣称长期通过或把含夹具数据的JS堆当整个应用RAM。进度及进程身份在D:/codexworck/软件/matrix-rc284-ui-soak-*.json，真实用户应用主62068不属于测试。详见docs/rc284-delivery.txt。无真实测试发送，11点目标继续。

## 2026-10-30 10:45 RC284 持续观察完成并正常收尾

- 上条观察已完成1200011ms、1077轮、967断言，执行会话40786退出0；54样本、50页深翻、单列表100行上限通过。JS堆包含夹具、步骤时间包含固定等待，不作为整个应用RAM或官网吞吐结论。源指纹仍df53c011d058ffe397b70c952fb21cd72bac7e37e09c3fd12c1d7c1163c93854。
- 原测试65912/43364/50140均退出；原生PS5.1按确切Temp目录、owner标记、创建时间及无链接检查后，仅清理独立profile41文件1760158字节，未发任何进程信号。真实用户62068及原启动时间保持，见matrix-rc284-ui-soak-cleanup*.json；未完成时拒绝清理的负向检查通过。
- 本轮7项要求/6类剩余缺口已成审计草稿，实际16类功能清单逐ID核对；初次18类假设错误保留在说明，不改产品目录。11点前不生成最终回执，不把测试通过称为所有平台功能完成。使用说明docs/rc284-关键词分配使用说明.txt没有实际创建规则或发送。RC284安装与业务数据/原密钥结论不变。

## 2026-10-30 11:00 本轮限时迭代收尾

- 按用户指定11:00截止停止新增迭代。安装保持RC284，源指纹df53c011d058ffe397b70c952fb21cd72bac7e37e09c3fd12c1d7c1163c93854，189组源回归/38项实际包核验和20分钟1077轮观察均通过，原数据/密钥校验结论保持；没有新测试发布或真实用户私信。
- 发布回执既有真实Chromium夹具预定25秒出现成功，实际25.406秒返回；不等于官网网络延迟保证。第二十九天原任务仍按真实可得记录显示成功、总用时含排队113秒，未补造执行起点。关键词配置说明已写入docs。
- 最终回执仅在11:00后生成，7项要求/16类能力和6类剩余缺口一并保存；allFeaturesComplete=false，不把限时迭代结束当全功能验收。归档位置D:/codexworck/软件/远效-RC284-验收材料-20261030，SHA256清单用于逐字节复核。若生成或归档失败，以实际工具回执为准，不重复覆盖已有目录。

## 2026-10-30 RC287 实机标签问题仍在定位

- RC287 已安装，192 组回归与42项包内核验通过，备份 before-update-rc.287-20261030-144125，资料及密钥校验通过。小红书《Ai agent项目推荐》原任务已正常确认发布成功，不得重发。
- B站同名原任务于14:49:33重试一次，程序员仍未形成已选标签，未投稿；冒泡改动没有解决实机问题。前台焦点核验失败的原生输入始终0次，不得称已按回车或取得真实输入结果。
- RC288 候选在完整回归中，增加两条官网标签校验请求的被动有界诊断，只返回HTTP/数值错误码，不记录凭据/原始响应，不重放请求；尚未安装。实机根因与B站投稿仍未完成。详情 docs/rc287-delivery.txt 和工作区 matrix-rc287-live-original-results.json。

## 2026-10-30 RC290 话题选择修复已安装，原任务已发布

- RC288同域相对地址遗漏经夹具复现后退役，未安装。RC289已实际安装并诊断：B站“程序员”普通标签检查HTTP200/code0/data.code0，话题检查HTTP200/code0/data.code-1。原任务16:29:39重试一次，代理用官网正常话题搜索选中精确同名已有话题后，读回程序员/前端web开发/agent/校招，再点击一次继续；原《Ai agent项目推荐》已发布成功。小红书同名原任务也已成功，不得重发。25分34秒含诊断暂停，不是上传性能。
- B站原追评已发表，ID318643865905；置顶仍待核对，最后记录为详情12006。额外只读核对控件不可见而未执行，输入0；没有重发评论、没有另发置顶，不把旧回执写成新查询。此前另一视频已置顶的评论322266422400不是本条，禁止混用。
- RC290新增bilibili-topics.cjs并接入标签同步；只走已有精确同名话题的正常控件，等待两个检查的先后竞态，保留原标签。模糊/重名/创建/活动/已有其他话题/遮挡/输入变化均停止，不点协议、不绕过验证。45项话题夹具、72项标签及完整194套回归通过；首次夹具错误预期失败保留。新自动路径尚未额外真实投稿，RC289实机成功不能冒充RC290自动实机验收。
- 冻结源码840项/a042635077199a0b158c3df04578bee8bab6f6b12403dc3a7cc116dcb9b2d04d；实际NSIS包43项检查（含8组包内原生）、126个桌面模块与34个工作线程依赖核验通过，1692个运行时文件未变。ASAR8082b6e4049a26871674af827df54abb3e0787e076a662a135e90384f905c872。
- 正常退出、规范D盘备份before-update-rc.290-20261030-173702（23840文件/560953996字节），安装后冷态资料逐字节与原密钥均通过。RC290进程43528正常启动，本地页面/实际前端/图标200，发布进度无活动任务；未强退或改登录。详情docs/rc290-topic-selection.txt及工作区matrix-rc290-*回执。

## 2026-10-30 RC291 原追评置顶完成与任务排序交付

- 原《Ai agent项目推荐》评论318643865905/BV1Qzxv6XEkH已成功置顶：用户置前后执行一次只读核对，原评论各身份字段匹配、状态17；随后只执行一次原任务“仅处理置顶”，读回明确官方置顶标记。没有重发视频/评论，没有混用昨晚322266422400。旧的12006为新评论确认后重复详情读取导致流程中止，原先未发出置顶POST。
- RC291取消同次新追评已完整核对后的冗余详情查询；完整原评论身份、空置顶位、提交前账号重核、单次POST及官方标记确认均保留。历史评论仍需新查询；不凭缓存放行，未知/其他置顶/验证拒绝仍停止。新增“继续置顶”行内入口，不创建追评。当前原评论真实成功来自RC290显式流程，新自动衔接只经隔离夹具，不冒充额外真实投稿验收。
- 任务记录默认按createdAt真实时间倒序，状态更新不再按updatedAt重排；主动勾选正在发布置顶仍保留该分组优先。真实React覆盖跨时区时间顺序、旧任务追评后顺序不变和行内原评论操作。355项追评检查、194组完整回归、43项包核验通过。
- 冻结源码652dfa71a3b6b4e47acfea23229004a4405ca6e00cb0be831772f0dbd6465b54/840项；ASARd8edf06d8c7a3acec19e6b44a096429fa59395fc198e2b952f70857633009e47。正常退出、规定备份before-update-rc.291-20261030-183521（23937文件/561633846字节），安装后冷态业务资料及原密钥校验通过。RC291进程38520正常启动，新前端/assets/index-BmNMJd9x.js实际加载；重启后原任务仍显示置顶已确认。详见docs/rc291-pin-and-task-order.txt及matrix-rc291-*回执。

## 2026-10-30 RC292 自动结果与新追评置顶衔接已安装

- 用户确认RC291后新视频《互联网大厂谈薪冷知识（给够了吗？）》出错。原评论322370152304在19:13:11首次置顶返回-404，19:14:23显式处理后成功；和旧318643865905不同，禁止重发或混用。小红书该视频自动60秒观察54次最后wrong_page，独立作品列表随后确认成功；此项有实际回执，非猜测。
- 小红书提交后接入独立同会话本人主页/作品列表读取，立即返回明确成功或有证据的待审核。B站已配置自动置顶可处理完整身份匹配的状态17原评论；新评论置顶明确-404后3/7/15秒有界重核续办，最多三轮，始终检查空置顶位/原评论/当前账号。失联、验证码、登录、限流、权限错误不重试写入；不重发评论或覆盖别的置顶。code0标记延迟仅1/2秒补读，总操作预算不变。
- 初轮194组通过后新增实机-404续办修正，再跑最终195组全过；44项包校验通过。841项源摘要69602e9591392f1da9c23fdcc400afbc631d13de54bdf9ad92f7ba8ad1269fea；ASAR99b174e6c95d39793f9146dc54afe57f8c4d0ef560fa7eac6573f39f928f3e53。首轮报告保留，不冒充最终源。
- 正常退出/D盘规范备份before-update-rc.292-20261030-195657/安装完成，24316文件562652801字节与原密钥校验通过。20:00:45主66960正常启动，本地页面/实际前端/图标200；前端未改仍index-BmNMJd9x.js，桌面三个模块已核对实际包字节。原新B站任务仍发布成功、追评已发表、置顶已确认。没有新的测试发布/追评/置顶，自动新链路仍须未来正常业务观察，不能承诺首发永久零错误。详见docs/rc292-automatic-results-and-pin.txt。

## 2026-10-31 RC293 互动入口与后台监控已交付

- 自动评论、自动私信、批量任务原先仅进入人工待办，现接入共享AccountOperationsPage/Hengyuan引擎，旧人工待办保留独立路径。抖音普通评论规则由后台协调器独立读取，与关键词分配共用每账号一个分页计划；不依赖访问评论管理。规则模式需明确启用，打开页面不会开始真实发送。
- 新监控状态区分评论读取、私信连接、渠道发送模式和全局暂停。保留身份、去重、额度、时段、4.5秒发送间隔和未知结果不重发；读取异常暂停普通评论自动模式。监控计划仅复制规则/模式，未测全软件性能，不能宣称理论最大性能。
- 196组完整回归、45项包核验通过；源码843项/b917382fd3f1a4e900a0805bbb8896b8018780b99ad0677cf98738df65b124bb。真实React198、协调61及新原生IPC/工作线程闭环通过，发送端是隔离夹具；35个物理worker依赖含新增监控模块已验证。
- 正常退出/D盘备份before-update-rc.293-20261031-003117（24196文件/564736886字节）/安装后资料和原密钥通过。ASAR186a686352752e55cacd7a26a161524943f7a1e412ed4552e5b1a33c1307aefc；00:35:03主69584启动，新index-B7GIb0bP.js实际加载。原生7次导航确认三个入口及监控页，未创建真实规则、未发送测试评论/私信、未截图。未来真实业务仍需观察；不称全平台全部验收。详见docs/rc293-delivery.txt和工作区matrix-rc293-*。

## 2026-10-31 RC294 原界面恢复安装与持续迭代

- 用户澄清只要功能，不要把原界面替换成账号运营界面。三个粉丝互动入口恢复原搜索/表格/20条分页/弹窗布局，复用RC293控制器与后台。账号运营原入口及人工待办保留；没有将旧待办变成发送任务。后续改动必须保持原UI风格。
- React240项、完整196组、包内45项通过，126桌面模块/35worker文件与RC293一致。源码844/78c4808f0632fc7a8d63bc30a087987848c0d7ffbce622d1983e2d8528e57620；ASARf4975d013f81c4de15d23a3642a08f7af0e866ce068cdf4d19d25d8cda2fa237。备份before-update-rc.294-20261031-012126，23486文件564503854字节，安装后原数据/密钥通过。01:25:06主69900，新index-G080QQla.js实际加载。
- 实机UI验收未全部通过：首轮表格/监控弹窗已进入，底部返回按钮在屏幕外；可见Close无障碍调用范围异常，一次已核对窗口/前台/位置的角部点击未确认关闭。随后一次Escape探针在前台校验失败时输入0，停止。四轮原报告和只读几何证据保留，不冒充完整实机验收，不反复盲点；没有真实规则修改/测试发送/真实截图。见docs/rc294-original-interface.txt。
- 新用户要求持续迭代至北京时间2026-10-31上午11:00，goal active。下一批RC295仅调查：真实临时加密库复现200条评论128入库/72丢失/同时snapshot被拒；自有worker重建复现heartbeat true但账号0。外部ObservationQueue原型230检查通过，尚未接入产品/构建/安装。原型及两份失败证据见工作区matrix-rc295-*和candidate-notes；不得提前宣布修复。

## 2026-10-31 RC295 候选事件接收与配置恢复

- RC294 已安装，原表格恢复；真实 UI 自动验收仍有前台/关闭探针未确认项，不宣称全部通过。
- RC295 已复现旧 200 条突发事件仅入库 128 条并挤出快照，新增有界顺序接收；实际隔离线程现 200/200、队列单元 230 项通过。另修正新线程无账号却报告心跳成功的问题，现要求前端重新配置。
- 写入期间终止自建线程另复现残留/不完整锁，尚未修复；恢复通过仅指写完后终止并重建，不允许清用户存档锁或宣称所有崩溃恢复通过。
- 第一轮完整回归第 59 项因测试旧心跳跨工作区生命周期失败，原报告保留 matrix-rc295-regression-first-failure.json；修正测试关闭时结束旧心跳后独立 146 项通过。198 项完整回归重跑中，尚未打包/安装 RC295。源码此时冻结，完整结果以实际报告为准。详见 docs/rc295-background-intake.txt。

## 2026-10-31 RC295 已冻结打包、未安装

- 198 项完整回归与实际安装包 47 项通过；包内突发实测 200/200，2.318 秒单次样本，未操作真实平台。源码 c938d1d701e60497ab03bb05c274a4db854804120beb364ba9406e562aa56d78 / 847；ASAR 6a4c25715c5f9054a3c1eddd9500682902e7654be5c6f2e5f36a269549a66a7c。
- 冻结副本 D:\codexworck\软件\matrix-rc295-frozen-source 与回归逐文件一致；RC295 source-preflight 现验证冻结副本，允许原工作树推进下一批，不代表安装已完成。实际仍 RC294 / 69900，监控弹窗后的发布状态不可读，未退出更新；用户已收到可选关闭弹窗请求，不重复问草稿许可。
- 写入中断空锁在隔离线程精确复现：独占创建后、写入锁信息前终止，原数据字节保持，重开失败。外部原子发布锁原型 16 项通过，尚未接入产品；不得清除无法确认归属的用户锁。详见 matrix-rc296-lock-before.json、matrix-rc296-atomic-lock-prototype.json 和 docs/rc295-background-intake.txt。

## 2026-10-31 RC296 线程锁与弹窗候选已核验，未安装

- 保留原粉丝互动表格；长弹窗改内容区滚动/固定返回按钮，并修正完整主题颜色被重复 hsl 包裹的问题。真实 React 271 项及三种尺寸原生指针关闭通过；仅合成截图，首轮视觉发现透明背景后修正复验。
- 新 AtomicThreadLock 完整写 owner/fsync 后独占 hard link 发布；仅主进程收到 worker exit 才记录退休线程 PID/threadId/leaseId，新 worker 可回收精确匹配旧锁。父目录 junction 允许，最终目录链接/未知旧锁拒绝；数据和密钥格式不变。19 项锁测试/17 项实际 IPC 加密 worker 中断恢复通过，不代表断电或任意多进程并发。
- 200 项完整回归与 49 项实际包核验通过；850 输入 a0d8f81121f543a47db662b9fc351e9df2e88877a2100d2f823b4e4809b98bd0，ASAR ad541f53e297c2f068d457bea8f59cec22428e59ddda5d34fb99609a6ff6f138。候选 release-rc296，真实安装仍 RC294/69900；监控弹窗后的任务状态尚未可确认，未退出、备份或安装新候选。不强退，不重复问草稿许可。
- 下一轮性能证据：5,000 合成历史追加 100 事件约 10.52 秒，100 次存档重写/200 次 fsync，重复观察零存档写入；仅单次隔离样本。计划研究有界小批量入库并核对去重、规则与账号隔离，尚未实现，不把测量当优化已交付。
- 上午11:00目标仍 active；详见 docs/rc296-thread-recovery-and-dialog.txt 及工作区 matrix-rc296-*、matrix-rc297-ingest-baseline.json。没有真实消息、发布或重发测试。

## 2026-10-31 RC297 小批量入库候选已核验，未安装

- 新ingestMany一次锁/一次加密写入，每批最多16/512KiB，重复零写，失败不落部分状态；观察队列只合并连续评论16/256KiB，保留账号/顺序/关闭边界。启用关键词分配时仍逐条入库后分配，避免跨文件语义改变；私信保持原路径，不加快平台发送。
- 201项完整回归、50项包核验通过。851项输入35eaa5b2897771bc878bf655310049793d8e27fe0f8910fb3b6bd2f76057f33b；ASAR33b04f3fc752fa02a40e2b7da2490ca3497c2fb3d920d2521a3dc64710744a62。包内200/200约0.311秒，坏消息邻居保留/重建恢复通过；5000合成历史追加100从100次写/10.520秒降至7次/0.806秒，仅单次隔离样本，不作整机倍数保证。
- 56项原子语义、243项队列、实际关键词监控205项通过。真实平台请求0。20分钟包内两账号持续观察将独立运行，实际结果以报告与driver收尾为准；不提前宣称长稳或全软件完成。
- 实际安装仍294/69900，任务状态读取仍未定位，未退出更新；原295/296候选保持。新UI沿用296原表格及弹窗修正，不换成恒源UI。上午11:00目标仍active；详见docs/rc297-bounded-ingest.txt。

## 2026-10-31 RC298 可信退休线程临时文件收尾候选

- RC297的20分钟包内合成观察已完成：120轮/7680新记录+7680重复/3次正常worker重开，数据一致、退出0并清理；不是真实平台实发或稳态内存证明。
- RC298先复现fsync/close后rename前中断遗留加密临时存档1237字节和锁临时文件87字节，旧正式档案保持。现新命名含pid/threadId/leaseId，独占锁内且正式加密档案验证通过后，仅清主进程已确认exit的线程两个精确路径；旧随机/未知/跨进程归属不明文件保留，不重放临时消息。
- 6种真实worker中断边界各23项、42项存档/临时文件归属通过，正式档案损坏或缺失不清理，硬链接/目录链接拒绝。预先存在的临时文件创建失败不会被finally删除；不把这些合成结果当断电与所有文件库故障验收。
- 203组完整源回归、前后端构建与52项实际包核验通过；853输入c5e95e05c146e911eda19b4084846702b1fd2d8923f6dc1deefc9d895286f82c；ASAR537d28e297caa296eabfcc4b4165d4f1511225d73f69a39c36ec6c9788891e65。新UI仍index-D_iH8qac.js，原表格风格未改。实际安装仍294，04:05读取发布状态失败，未退出/备份/安装；不是策略拒绝，不重复问草稿许可。
- 后续已实际复现observe每页硬截前200：合成350新评论只入200，同页重放仍200且无警告；RC299尚未接入。须研究本地有界背压/明确接收结果，不靠扩大平台请求或发送频率。证据matrix-rc299-intake-before.json，详见docs/rc298-retired-scratch-recovery.txt。上午11:00目标仍active。

## 2026-10-31 RC299 评论分页接收候选通过，未安装

- 修复每次observe仅截取前200条的问题：每批16条确认后继续，保留512项/4MiB队列上限、8页生产者和12秒本地接收限时；取消/换号/关闭/失败明确partial，监控暂停并保留原分页，不自动补发未知结果。
- 206组完整源码回归、完整构建、55项包内核验通过；源码856项 f3ae64efacb8ada9e7b8439b6b014f9d961eeb9bea511419afadff9477c3b168，ASAR 16757303a8185eca699e2cc8b1cb05c88b9e97e01e7e88be9008c02ee33fe690。前端JS与RC298候选逐字节一致（不是与实机RC294一致）；误选RC294基线的首次断言失败已保留。
- 最新候选 release-rc299/YuanXiao-2.10.0-rc.299-Setup.exe，冻结副本 matrix-rc299-frozen-source；安装未执行。实机仍RC294/69900，监控弹窗后的发布状态不可读，普通及包含隐藏节点的只读探测均未确认状态；不强退，不重复问草稿许可。
- 新确认的下一批性能缺口：未启用关键词时仍按条读取消息档案；每批查询规则启用状态会复制100条命中历史。两份RC300合成证据已保留，尚非性能修复。详见 docs/rc299-confirmed-page-intake.txt。

## 2026-10-31 RC300 关键词空闲成本候选通过，未安装

- 轻量hasArmedRules替换规则查询时的完整快照；未启用规则的观察提前返回，启用后的来源/绑定/限额检查保持。100次查询不再复制10000条命中记录；512次未启用观察的Node文件读取从512次/9608192字节降为0，不等于物理磁盘或整机提速倍数。
- 207组完整源码回归、构建、56项包内核验通过；857输入f7bb1e3564ff5ccf6e7d202dadae50f1e11aad20cac7ca8cb4ff8d4eb5602825，ASAR0f3f10a7266beefa8aa5b67b52a70fd74fb73d83e9697a3763ebafc46b20dddd。万条合成评论全部确认并在正常worker重开后保留，末页快照133.25ms，测试进程峰值RSS183.17MiB；未向平台实发。
- 198个前端源码与RC299冻结候选一致，构建JS仍index-D_iH8qac.js，不冒充与实机RC294逐字节一致。当前安装仍RC294/69900，05:31只读发布状态检查仍失败，未强退/备份/安装；不是策略拒绝，不重复问草稿许可。
- 最新候选release-rc300/YuanXiao-2.10.0-rc.300-Setup.exe；详情docs/rc300-keyword-idle-cost.txt。继续上午11:00目标，批量整理后续改进，注意D盘约33.46GiB及备份后30GiB保留门槛，避免无必要重复打包。

## 2026-10-31 RC301 时间校验源码通过，尚未打包

- CPU采样确认整库时间解析是本轮热点。提取validated-time纯函数，单次_validate内最多复用256值/32日期，结束后释放；原字段校验/错误信息保持，不跨读取复用。
- 新96项断言、与冻结RC300旧解析器22186组输入差分、完整208组源码回归通过；万条主IPC/加密worker接收和正常重开保留通过。微基准20批由约3012ms变1622ms，仅为不同次本地测量，不能当整机提速倍数。
- RC301尚未构建/打包/安装；最新已核验安装包仍RC300。依赖图37模块，新文件由现有解包通配规则覆盖。详见docs/rc301-scoped-time-validation.txt。
- 新只读检查确认监控弹窗按钮可用但远效不在前台，坐标被其他窗口遮挡；正常置前返回false，没有点击/强退/安装。helper两次生成边界断言失败及一次重复结果保护均保留；不是平台审批拦截，不猜原因。实机RC294/69900保留，继续上午11:00目标。

## 2026-10-31 RC302 空闲调度与密钥异常清理候选通过

- 未启用关键词规则时不再每秒读取策略或扫描命中历史；2000命中/512消息合成样本的100次检查从100次文件读取/1793600字节降为0。启用后的新鲜策略与来源/限额检查保留，不提高平台发送频率。针对性654项通过，不作整机倍数保证。
- 复现线程构造失败（新/既有密钥）、加密失败、合成临时文件同名冲突时临时Buffer未清零，且冲突会删除非本次创建文件。现密钥获取在登录撤销检查后，失败及线程构造结束均清零所拥有Buffer，临时清理有创建标记；22项通过，持久密钥不改。不证明真实环境发生过泄漏或随机碰撞，不保证JS字符串/引擎副本被抹除。
- 首轮208组报告保留为regression-first，最终209组源码回归、完整构建与58项包核验通过。860输入120f6ea21f911257dcdd750ee7ff7b1c855a87918c81ce7b8e84aa3f58e2d87c；ASAR330b62f1d771f86e316c2e2ab7c876330a1378429635df0d9f0d568b5aedd81e。198前端文件及index-D_iH8qac.js与RC300候选一致，不与实机294混同；37worker依赖核对通过。包协调64620/原生驱动48040已退出查无。
- 实际仍RC294/69900。UIA只读未找到按钮，发布状态读取仍报No unique own publishing header；未强退、备份或安装，不是策略拒绝。最新候选release-rc302，D盘余约32.57GiB，继续遵守备份后30GiB门槛并批量整理后续变更。
- 冻结RC301万条记录两小时观察已于06:09:27开始，预计08:09:27结束，进程44096/工具会话68779仍在运行；不是已完成。一次只读进程身份探针因PS7已解出的UTC DateTime被再次Parse而丢时区误报，原失败及纠正保留，实际PID/路径/创建时间匹配；不是应用时间错误。源码摘要仍a24d4950...，不把观察时间归RC302。
- 下一批已独立复现启动超时10秒后第13秒仍等待；仅结束自有无响应测试线程收尾，未动应用。原型8项通过，约10.02秒返回并可用原密钥重开，尚未接入RC302。详见docs/rc302-keyword-idle-tick.txt及matrix-worker-startup-timeout-before.json、matrix-startup-failure-prototype.txt。上午11:00目标仍active。

## 2026-10-31 08:20 RC303生命周期候选与独立长测完成

- RC303补启动失败先撤销未就绪worker、最新配置意图检查、旧workspace读不能重新打开旧后台，以及同owner启动期间必须等ready。实际复现/失败保留，16/25/38项定向检查纳入最终213组全过（642.077秒），865输入摘要4d718aebb40aea0df7d0aa8e4a34b33b5806af40afcc9fce1d4fbae6cfafa11d。
- Electron33.4.11隐藏窗口原始心跳最大61秒超过45秒租约；本批增加随后台生命周期引用计数的timer lease并恢复原设置。最终源码及实际ASAR各440秒/30次，最大约15秒，均正常关闭/恢复节流、无平台/网络动作。63项包核验通过，37worker依赖/1692运行时文件保留；198前端文件与RC302候选一致，不冒充与实机294一致。
- 首次包探针在watchdog前用Electron patched fs读取ASAR，独立复现ENOENT，父进程超时；错误回执保留。改original-fs流式摘要、启动watchdog及最终报告断言，同一成品复验通过，没有重构建或改产品。仅正常点了自有测试错误框确定；随后进程已退出，未执行手动进程信号；两个自有临时目录按真实路径/无链接逐项核对后清理。生成器已改用修正模板。
- 成品release-rc303，ASAR ad39ff44e6730a15a27478f2350a62bddf16cb5c0712f73c1a86ae77506996ce，Setup f5763d9f29a1f8ea0761308cd9297c6e179f1ccc3171beb725e4733d5f4de150；未签名、未安装、未上传。实机仍294/69900，发布状态控件仍不可读，未强退/备份/重启。这是技术性读取限制，不是策略拒绝。
- 冻结RC301两小时观察已完成：7201276ms、360轮、2555检查、万条合成记录，重复接收未改变存档字节，正常关闭重开记录保留，44096已退出。摘要/报告matrix-rc301-soak-final-summary.json；不是303长测或真实平台/全应用性能证明。
- 后续仅隔离实验：主进程IPC触发心跳并保留后台节流，尚未接入产品，工具会话16828。11:00目标继续active。详见docs/rc303-operations-lifecycle.txt。

## 2026-10-31 09:10 RC304后台心跳候选完成

- 主进程请求心跳已从隔离实验接入RC304，保留renderer计时器用于恢复并合并10秒内重复触发。新客户端成功配置后恢复后台节流，旧客户端继续使用303租约；共用既有5秒调度，独立workspace弱引用限频。通知只携带workspace ID，不延长鉴权租约，45秒无有效回应仍停止；原界面布局/样式和平台请求频率未变。
- 216组源码回归、客户端类型检查、完整构建及66项实际包检查通过。869输入26a72341096eb2557a61a36e6c2a53bfae23b2f5c5b0a5d984b84943820329e6；ASAR03fa779e8343d5038179c384ade5524a02605e70ad04b6cc30cecb8a35aa7536；Setup6731c77fab863161df17c02f7f810acb88e2d8a6faa798d31c36564f98e1e560。37worker依赖和1692运行时文件保留；198前端文件只改返回null的Runtime与类型声明，不把编译JS说成与303逐字节相同。
- 真实源码/预加载440秒29次最大20.29秒；实际ASAR/预加载440秒29次最大20.03秒，均保持节流、正常收尾。独立560秒夹具中断自己的IPC60秒：3次失败、原worker按租约停止、自动恢复后9次成功、2worker正常关闭、原密钥保持。不是实际平台网络故障或OS睡眠验证。
- 原生contextBridge测试60次账号配置切换、含重新挂载共62次配置，始终仅1个监听，卸载/退出后0个，旧事件忽略；预加载附加仅测试用计数入口。计时器对比303冻结源码与304：440秒中每秒计时器440→301次，五分钟后141→2次；不等同全应用CPU、电池或平台吞吐改进。
- 首次原生测试漏了假窗口的isDestroyed，被既有主窗口检查拒绝；失败与原夹具保留，仅补齐测试对象，未放宽产品保护。所有新测试无真实账号/发送/发布/置顶动作。实机仍294/69900，09点只读仍No unique own publishing header；未强退、备份或安装，不是策略审批拒绝。D盘余30.81GiB，后续停止重复打包，备份后30GiB门槛保留。
- 冻结候选后继续持续后台观察，11:00目标仍active；详见docs/rc304-background-heartbeat.txt与matrix-rc304各报告。剩余平台适配/未验证能力仍按shared/feature-delivery.ts明示，不称所有功能都已完成。

## 2026-10-31 RC305 单调时钟与候选核验

- 原生存活租约和工作线程内发送间隔改用 performance.now；复现墙上时钟前跳导致健康线程被错误替换，保持45秒租约与4.5秒内部最小间隔。日历计划与持久时间戳未改，没有改变系统时钟。
- 217组源码、67项实际包核验全部通过；870输入指纹7a77d15e27abc46d2e33885553f5e6fa342d890c1315741c413133314b115744。包内440秒29次心跳、最大间隔19.473秒；560秒合成中断恢复、原密钥保留通过。RC304的90分钟观察仍独立进行，不能算作RC305长测。
- 最终候选D:/codexworck/yuanxiao-rc305-final，ASAR698d7bbc...、Setupa50cbeb4...。原E盘为可移动盘，精确核验后仅停止自有未完成打包进程46052，产物/失败记录保留；C盘余量检查拒绝后，重新核算D盘余量再构建。没有停止用户程序。备份安装另行记录。
- Electron44独立核验：官方摘要匹配，六组原生测试通过；原离屏UI断言因440请求返回441失败保留，普通隐藏窗口的同一271项断言通过；合成safeStorage跨33/44/33通过。未升级产品运行库，未验真实Cookie迁移或全平台流程。
- 自有时钟测试临时目录yx-operations-clock-rCP0gi的清理被工具笼统blocked by policy拒绝，具体原因不明；未换工具重试，目录保留。当前approval_policy=never不能弹出有效审批。应用数据未触碰，独立测试继续。详见docs/rc305-monotonic-runtime.txt及工作区matrix-rc305-*回执。

## 2026-10-31 RC305 已安装与实机复核

- 10:35:47实际启动RC305/主71260；正常退出294后，D:/MatrixUserBackups/before-update-rc.305-20261031-103134冷备24721文件/568002610字节，安装后逐文件和原密钥校验通过。HTML/实际index-CZPZImIe.js/图标200及摘要匹配。
- 原自动评论、自动私信、批量任务三表格与监控弹窗返回列表实际通过；11次导航、0发送、0规则变更、0截图。首轮外部脚本仍要求顶部Close在屏幕内而失败；只读确认底部返回按钮可见，修正脚本后通过，不改写原失败。
- RC304独立90分钟360次心跳完成，固定4个组件179资源样本，额外GPU71880排除。当前包在Electron44独立440秒29次心跳也通过；均正常结束，原生PIDs查无。产品运行库仍33，不把独立兼容性审计等同升级。
- 实机主进程CPU持续偏高，原因尚未确认；13样本观察于10:55结束。回首页无障碍调用未真正切换，仍在批量任务表格，不能据此前后变化归因页面轮询。没有强制退出用户程序或修改真实发送规则。完整结果在11:00后生成最终交付记录，不把本轮截止当全软件验收完成。

## 2026-10-31 RC306至RC308 私信初始化修复已安装

- RC306补陌生人participants昵称与严格UID关联、已存消息/people索引补secUid；RC307安全错误码定位四账号transport/ERR_INVALID_CHAR。118项允许Cookie字段只读检查无非法值；独立真实Electron33.4.11确认app.setName('远效')使session默认User-Agent包含中文，传Node请求头即失败，不是已确认的登录失效。
- RC308将实际UA非ASCII字符作UTF-8百分号编码，ASCII/Chrome/Electron版本原样保留，HTTP网页本人/联系人与WS统一使用；不改Cookie、身份核对、设备编号、频率或密钥。真实原生UA回归30项、完整219组及实际包71项通过。首次夹具失败保留；无真实测试发送。
- RC308 ASAR0c48f5adec957b0dd47a437c0a0b521ca36701e3ad1dab4e91b98aa13984fd15，源码872项75424851b72c98c642f0dc525d9e83718d8e06ac812fa5d49458c8b390e60cfa。正常退出307后备份D:/MatrixUserBackups/before-update-rc.308-20261031-151104并安装，原生用户视图业务字节/密钥与HTML/实际JS/图标校验通过。主76664，运行库33未升级。工具与原生用户保护文件视图不同造成的首次指纹断言失败保留，没有修改密钥。
- 最新实机四账号实时通道已连接，有官方push-message-saved。可瑞吉昵称1238/1917提升至1964/2038，2043会话28675消息，剩74缺联系人资料编号；另三账号昵称29/29、207/207、200/200。没有发送测试消息；推送数据落盘不等于全量历史/全链路收发已验收。
- 肆宇历史返回平台码2并保留断点暂停，具体拒绝原因未确定；另有一次history/type-error重接入记录未定位完整栈，CPU/内存偏高也尚未修根因。当前任务不是重开已结束的11:00定时目标。此前yx-operations-clock-rCP0gi清理拒绝未重试。详情docs/rc308-inbox-names.txt及工作区matrix-rc308-*证据，冻结候选快照不随本记录追加改写。

## 2026-10-31 RC309 主号监控与回复组成功额度候选

- 新增可选per-account-success模式；新建规则默认开启，旧规则无此字段仍按原规则尝试次数限流，必须编辑保存才迁移。每账号独立滚动分钟额度（逐号1至20）/24小时成功上限，队列保留1至168小时且长于时段，默认60分钟5条/24小时20条/保留48小时。新增纯配额投影account-operations-keyword-quota.cjs，Worker依赖38项且显式asarUnpack。
- 仅持久sent+receipt+claimedAt按实际完成/人工核实时间计成功；明确not-sent释放，unknown/已领取未完成/缺回执跨时段和重启持续预占。已有全局尝试次数与允许时段继续有效，等待这些条件恢复时不领取发送；平台拒绝/验证仍暂停。不会换号重试同一接收人。名额满后新命中入队，队首满额账号不阻塞其他账号；过期取消，原2000命中容量上限保留。
- 重启仍暂停，但保存成功额度和原分配；重新启用后仅恢复未领取、未过期、同规则版本/账号绑定/原消息及任务摘要的队列。修改规则/绑定不恢复旧发送。导出字段完整，导入按新账号映射senderLimits并保持关闭，不导入历史发送任务。UI集成原“自动私信 → 关键词分配”，显示逐号成功/未知占用/剩余/队列/预计恢复。
- 初步74项真实加密存档/合成时钟、15项真实React和205项真实Electron Worker/IPC隔离检查通过，0真实平台发送；两轮完整回归驱动因复查暂停队列计数及全局窗口等待被主动停止，记录保留，不视作通过。最终完整回归/构建/包检查/安装以matrix-rc309-*报告为准，此条写入时尚未安装。候选构建到C:/codex-build/yuanxiao-rc309-final以保留D盘业务备份余量；备份仍必须走既定脚本及30GiB门槛。

## RC309 安装与验收范围补记

2026-10-31 RC309 实际交付记录
完整回归221组通过，完整构建及实际包内72组检查通过，Worker物理依赖38项一致。专项成功配额74项、React配置15项、真实Electron Worker/IPC合成205项通过；均不代表向真实接收人发送验收。
实际安装2.10.0-rc.309，ASAR 9dfcbb33545ead80175453cf4a76ddb64b331cfd87be7aa350644dcefbae42ea。冻结源码875文件，摘要e8eba187504fc32bd6a69a794fd81b63d2193c2c2071f564da0790977ced56e9；冻结树保留安装前状态，不改写旧报告。
D盘备份：D:\MatrixUserBackups\before-update-rc.309-20261031-204200。冷态用户数据逐字节一致、原密钥一致；正常Explorer启动主进程54120。本机HTML、实际新JS index-C0L1erdp.js、图标200，品牌远效，startup-proof通过。没有强制退出用户应用，没有修改或启用用户规则，没有真实平台发送。
安装后的Windows无障碍导航首次未及时找到“自动私信”；只读入口探针父进程60秒超时，稍后子回执确认唯一可见入口，原超时保留。第二次导航到了关键词分配操作，但三个新字段仍未被原生读取确认；最后只读扫描53节点、字段0。因此只确认隔离React UI测试通过，不声称安装后真实配置控件或真实发送已验收。工具脚本失败与迟到结果均保留，没有重复启用、发送或重启。
安装与启动、失败探针、最后交付状态见工作区matrix-rc309-complete.json、matrix-rc309-startup-proof.json、matrix-rc309-quota-ui*.json、matrix-rc309-quota-fields.json和matrix-rc309-delivery.json。私信历史读取、缺少资料编号等既有问题未在本轮宣称全部修复。
## 2026-10-31 RC310 弹窗与更多工具候选
已复现RC309构建CSS双重位移，候选修复单一translate/max-width；更多工具统一菜单样式，旧关键词/欢迎/模板可创建停用自动私信计划；离线文案不冒充关闭应用后运行。原配置保留、精确账号绑定、创建默认停用，未真实发送。完整回归及打包安装未完成，详见docs/rc310-dialog-position.txt。

## 2026-10-31 RC310 已安装及实机界面确认（覆盖上条候选阶段）
223组完整回归及73项实际安装包检查通过。首轮第106组旧账号页夹具在暂停请求发出后、React回执提交前断言失败，原失败保留；等待真实暂停文案及继续按钮并加入50ms回执延迟后，113项专项和223组全回归通过。源879文件，摘要7100dc14cabf330d0d6261962f0efe08dc30184d3bb8d085862848b48cf9ea75；冻结源码C:\codex-build\yuanxiao-rc310-source。131桌面模块、38文件互动Worker图未变。
实际2.10.0-rc.310，ASAR 8446504ff65c8b372c6f102b8763a80f5ebaddc36a5fa4e8957fc6d84c11bca0。备份D:\MatrixUserBackups\before-update-rc.310-20261031-223725：26046文件569831829字节；冷态数据逐字节及原密钥一致。正常退出/Explorer启动59556，新JS index-B70slz5N.js、HTML及图标200，无强停。安装后真实无障碍确认弹窗居中、底部可见且正常关闭；七条更多工具行高60物理像素，与同机普通菜单几何一致。没有发送测试消息、启用规则或截图。
新增菜单及文案计划联动，精确账号ID匹配、默认停用、重复点击及上下文变更保护；复用原引擎。离线仍为文案库，操作待办人工确认，不称全部自动化或真实平台发送验收。详情docs/rc310-dialog-position.txt及工作区matrix-rc310-delivery.json。旧RC309失败回执不改；本轮旧版关闭探针未找到可见返回按钮未操作，后续独立发布状态检查通过。D盘安装后约29.98GiB，后续备份必须重新容量检查，未降低30GiB预留门槛，未清理旧备份。

## 2026-11-01 RC311 installed; RC312 image I/O candidate

- RC311 installed after normal shutdown and D:/MatrixUserBackups/before-update-rc.311-20261101-020955 (26331 files / 571677030 bytes). File hashes and original protected key verified; native startup version, HTML, JS and icon passed. Source 228 suites and package 77 checks passed. See docs/rc311-performance.txt. Persistent real interaction-loading lag is not yet accepted as fixed.
- RC312 candidate replaces UI-facing image cache synchronous disk I/O with a bounded async queue, retaining encrypted file compatibility, identity guards, fsync-before-ack and original-file preservation. Native DPAPI restart and targeted tests pass; full regression is running, no RC312 build/install yet. See docs/rc312-image-io.txt, including earlier ineffective Python alias replacement and fixture timing failure. Do not claim those earlier runs covered the new async callers.
- Live RC311 performance panel was read through explicit existing controls, without settings/rule changes or sends. It reports 12 pages, 11 hidden windows, 2 unthrottled pages, main CPU 8.28% (Electron normalized), main private memory 1025.27 MiB. Not evidence of a specific leak or complete CPU fix. Initial native probe expected combined static text and failed; a scoped follow-up read handled split accessible text and obtained the existing result.

## 2026-11-01 RC312 installed (supersedes candidate status above)

229 source suites and 82 package checks passed. Frozen source C:/codex-build/yuanxiao-rc312-source, source hash 6c66110885a93f7197bb1c79a8e21d46de9db8fb2a70aad7c6eb43407aacae08. Normal shutdown, backup D:/MatrixUserBackups/before-update-rc.312-20261101-025625, byte verification and original key verification completed. Installed ASAR d3d3bd6a03e46065d72a11981429df0f3e51ba5bf85b33c22e6ce039f41e8f18; native startup version/HTML/bundle/icon passed. No real publishing or messages. CPU/mouse responsiveness is not yet fully accepted. A separate serialization-yield prototype showed no material benefit (678.31 vs 675.20 ms, max gap 41.88 vs 42.18 ms); not integrated. Isolated CPU-sampling fixture now passes with normal exit and closed local inspector; first missing-require failure retained. No real-app profiling performed at this entry.

## 2026-11-01 RC312 live CPU profile and retired artifacts

Subsequent real profiling completed: normal close of 70624 after canonical no-active-publishing check; Explorer launch of same RC312 as 69860 with temporary local inspector. Two scoped navigation actions reached Inbox Aggregation; no sends, rules, screenshots or permanent launch/settings changes. 15.210 s / 1443 samples: serialize 15.08%, GC 6.57%, buffer.write 6.25%, prepareEngine 4.26%. Local inspector closed and absence of listener independently checked. This establishes a serialization/allocation hotspot, not complete mouse-lag resolution. See workspace matrix-rc312-live-profile-notes.txt and derived-only report.

User-authorized generated-artifact cleanup now totals 103582933693 logical bytes / 661 exact targets. Retired C-drive RC309/310 installers and unpacked binaries additionally removed; their frozen source and evidence retained. RC311 rollback and current RC312 artifacts remain, all business backups retained, installed archive unchanged. Details workspace matrix-storage-cleanup-20261101.txt. Retention rule is not an implemented automatic cleanup feature.

## 2026-11-01 RC313 inbox candidate, full regression in progress

Two desktop modules now reuse bounded compressed immutable record blocks and slice async map copy/equality. Exact decoded JSON, existing gzip envelope, native DPAPI, fsync-before-ACK and atomic rollback preserved. No platform request-frequency increase. Encoder 23, copy semantics 24, async archive 64 assertions passed. Native four-page sample 954.22 to 295.32 ms; four-account sample 2309.24 to 821.05 ms, sampled process RSS peak 722665472 to 282914816 bytes. Concurrent maximum timer gap still 82.82 ms; not a full real mouse-lag fix claim. See docs/rc313-inbox-segments.txt.
231-suite full source gate is running; RC313 not built or installed at this entry. Current RC312 PID69860 was normally closed after canonical no-active-publishing verification; physical free memory subsequently 9.59 GiB. Independent gated build waits for regression and three >=5 GiB samples. No forced exit, real messages, user rules or profile keys changed. First segment fast-path cache-budget review issue fixed before integration; mixed-map regression retained.

RC313 source gate subsequently passed all 231 suites including both type checks, 888 files / baedb831109273423ee8208c0c1f16a768ec8c857fef9c06edc2dead89db6463. Backend/frontend build completed and electron-builder is preparing C:/codex-build/yuanxiao-rc313-final after the three-sample memory gate. Package 85-check verification, source freezing, backup/update and real aggregation-page acceptance have not yet completed. Gated-package process session 31167 was verified live; do not restart solely because a polling window ends. RC312 remains installed but normally closed for this build.

## 2026-11-01 RC313 installed and native performance follow-up

- RC313 installed after 231 source suites / 85 actual package checks; source 888 files, baedb831109273423ee8208c0c1f16a768ec8c857fef9c06edc2dead89db6463. Archive 9a83e58ab95193393554ccdb76d015a6dd1fecda98e1a16f796a6a0f74f931af. Canonical backup D:\MatrixUserBackups\before-update-rc.313-20261101-035257; data/key verified and normal Explorer launch. No platform test sends.
- Native aggregate navigation passed; account totals 336/5884/6232 confirmed. Original split-accessible-count probe failure preserved, corrected v2 passed. Native actions 5-6 ms are not paint/mouse latency.
- Live snapshot still has 18 hidden windows / rendering private memory 6015.6 MiB / main Electron CPU 10.1%; workload differs from baseline. Overall performance NOT accepted; continue toward Nov 1 11:00 deadline.
- Retired RC311 generated binaries only, 933157488 bytes, current313/rollback312/source/evidence/data/backups retained. Overall cleanup 104516091181 logical bytes / 664 targets; not a runtime memory reduction. Details docs/rc313-inbox-segments.txt and workspace matrix-rc313-delivery-summary.json.

## 2026-11-01 RC314 sender-index candidate (not installed)

- RC313 live main-process CPU sample retained in matrix-rc313-cpu-live.json; inspector 49313 closed. 1464 samples / 15.156288 seconds, idle 68.93%, copyRecords 3.10%, name refresh 2.48%, GC 1.23%. Different live workload from RC312; no equivalent-benchmark claim.
- RC314 changes only inbox engine/index runtime: unique sender pairs, cached identity candidates and current committed thread memberships during in-flight profile updates. Profile cadence, limits, identity-conflict behavior, durable ACK/storage and sends unchanged. New 699 checks plus existing 132/23/921 checks passed. Synthetic 30k messages/40 thread-only updates: 1200000 identifier reads -> 0; observed 262.05 -> 8.47 ms, not whole-app latency.
- Baseline snapshot execution lacked protobufjs/vendor proto; comparison used unchanged frozen index with hash-matched shared dependencies. Early invalid group-ID fixture failure corrected; no product validation relaxed. See docs/rc314-sender-index.txt.
- RC313 process 65980 normally closed after canonical no-active-publishing check for regression/build; no force exit. Full 232-suite regression and gated package verification are in progress, sessions 77810 / 33530. RC314 not installed; do not claim complete performance acceptance. Hidden reader resource use and user deadline Nov 1 11:00 remain active.

## 2026-11-01 RC314 installed; performance still open

- RC314 installed after 232 source suites / 86 actual package checks. Source 889 files / fddfe9ca835009214f367a9220ef76776aeb84231f22543e1248e82d2ee9a558; archive 37175d284f8518680409e37dc02aad571b89a9c0a920a3daf7af14073bec6b33. Canonical backup D:\MatrixUserBackups\before-update-rc.314-20261101-045516; all backed-up files and original key verified. Normal startup and four aggregate routes passed, account cache counts 336/5884/6232 retained. No platform sends.
- Native performance: 18 hidden windows / 8 unthrottled, renderer private 5377.2 MiB, main Electron CPU 10.13%. Separate 5.03-second quiet main-process sample: 200.54% of one logical core / 907.25 MiB private. Different live workloads; no whole-app improvement or lag acceptance claim. Native action timings include accessibility overhead.
- Retired only RC312 generated binaries: 933164552 bytes / 3 targets. Keep RC314/RC313 binaries, all frozen sources/evidence and user backups. Cumulative logical cleanup 105449255733 bytes / 667 targets. No user data or backup deletion.
- RC315 synthetic identity-lease baseline confirms idle public page remains unthrottled during unrelated creator work; no real CPU attribution yet. Proposal and baseline in workspace matrix-rc315-identity-activity-baseline.json and matrix-rc315-reader-activity-plan.txt. No RC315 product changes yet. Current main process 49548, no open inspector. Goal continues until Nov 1 11:00.

## 2026-11-01 RC315 passive identity candidate and thread evidence

- RC315 candidate changes only browser/creator reader runtime: creator requests suspendIdleIdentity, initial proof remains active, later execute scopes refcount activity with avatars, default follower lease behavior and DOM/cookies/cursors retained. 52 synthetic lifecycle, 13 actual sandboxed Electron, 332 existing browser and 113 actual creator checks passed. Synthetic native profile removed after normal exit. No platform sends.
- Full source gate expects 234 suites; actual package checks expect 88 including new synthetic lifecycle and actual packaged native continuation. Running sessions 3418 (regression) and 19901 (gated package). RC315 is NOT installed. RC314 PID49548 normally closed after canonical no-active-publishing check for this build.
- RC314 5.006-second thread sample: main process 137.65% of one logical core; CrBrowserMain 27.47%; two ThreadPoolForegroundWorker threads 58.05% and 33.71%. Thread query handles checked ownership/read-only, no thread priorities or states changed. This identifies busy threads, not their task/root cause.
- Experimental Chromium tracer failed ONLY in three owned fixtures: 62844 V8 HandleScope error; 61576 at getTraceBufferUsage, exit -1073741819; 56120 after stopRecording, exit -36861/crashpad not connected. No actual installed app tracing; explicit fixture-only guard now blocks live use. These are native diagnostic failures, not policy denials. Processes and their direct children were independently absent at05:27. Logs and matrix-rc315-task-tracing-status.txt retain failures. Do not use this tracer against business sessions.
- Next useful evidence: validated Node inspector allocation/GC sampling may distinguish archive/object churn from native task work; this has NOT been implemented or tested. Broader CPU/memory and user deadline Nov1 11:00 remain open. Keep installed314/rollback313 binaries and all backups; prior logical cleanup105449255733 bytes.

## 2026-11-01 RC315 installed; allocation hotspot measured

- RC315 installed after234 source suites/88 actual package checks; source891 files/73fd6bde138c92c21107d524972f4da629e514faa7be47d6925081aefd30e5dc; archive 62e8b4081069de70db209b46b519acfc65eba2c566b748f8cde93b73237f2fed. Backup D:\MatrixUserBackups\before-update-rc.315-20261101-053847 (26663 files/521592026 bytes), all hashes/original key verified. Native startup and four aggregate switches passed; accounts336/5884/6232 retained; no platform sends.
- Unthrottled pages8->4 observed,18 hidden windows retained. UI observation intervals2914/8023/10745/4497ms include accessibility traversal, not paint latency. Quiet main5.024s:185.97% of one core/private859.23MiB. Main Electron metric9.64%, renderer private6116.02MiB. Different live workload/uptime; no overall performance acceptance.
- New bounded allocation sampler passed actual Electron33.4.11 fixture, including transient collected allocations and caller attribution, normal exit and inspector closure. In actual RC315 after a fresh launch and20s warmup,15s estimated1032444240 bytes allocated. Top protect220520028, zlib createFromString129333492, encode70452596, copyRecords54132628/47730860/30022308. HeapUsed152899628->125526752; this is allocation churn, not proof of a memory leak. No object contents/heap snapshot/forced GC saved. Current main49656; inspector49315 closed by sampler and independently absent.
- Experimental native Chromium trace remains unusable/live-blocked after isolated failures (see previous note). Startup thread ranking helper initially sorted Hashtables incorrectly; original startup-thread report is NOT a hottest-thread ranking. Main process CPU343.45% was separate and valid. Later quiet helper corrected rows to PSCustomObject and checks thread creation times.
- Removed only retired RC313 generated binaries933170877 bytes/3targets after native checks; retain315 and314, all frozen sources/evidence/backups. Total logical cleanup106382426610 bytes/670 targets. Dated delivery summary carries exact proofs.
- Next priority is reducing full-archive copy/compress/encrypt work on every history/cursor commit. Evaluate bounded read-only history batching without early acknowledgement, or an isolated segmented-persistence prototype with atomic-manifest/crash/replay/rollback tests before any format migration. Current runtime/data format still315; no316 edits or rollout. Preserve privacy, owner checks, durable cursor/ACK and live push semantics. Goal remains Nov1 11:00, not complete.

## 2026-11-01 06:15 additional storage cleanup and uninstalled checkpoint candidate

- User requests removal of unnecessary disk usage. Retired release-rc302/303/304 generated installers/blockmaps/win-unpacked removed: 9 targets / 2759071695 logical bytes. PS5.1 exact-root/version/no-reparse/no-running-executable/unchanged-metadata guards and current archive hash checked. Wrong-root Plan intentionally rejected; no deletion there. Keep current315 and rollback314 binaries, all sources/evidence and business backups. Cumulative cleanup109141498305 bytes/679 targets; logical sizes, not an invariant free-disk delta. Evidence: workspace matrix-retired-302-304-{plan,result}.json and matrix-storage-cleanup-latest-20261101.json. Automatic cleanup is NOT installed.
- Metadata-only archive observation measured28 replacements of a4.7MB archive in15.266s, with essentially unchanged size; replacement counts are lower bounds. Actual315 allocation evidence remains valid; still not overall performance acceptance.
- UNINSTALLED candidate in desktop/douyin-inbox-engine.cjs batches only unchanged terminal receive-only history completion markers (8 or1500ms, final flush); real new/changed messages remain immediate durable commits. Matching cursor/latestIndex guard prevents deferred flush clearing a newer gap. Failed flush is not automatically retried in finally. Data format unchanged. Existing inbox218 and priority tests plus new qa-inbox-catchup-checkpoints.cjs61 assertions passed, including actual disposable file store/reopen, disk failure, partial failure, close, stale versions, changed messages and concurrent gap. No full release gate, version bump, build or install yet; installed runtime remains315. No actual messages sent.
- Additional exact legacy generated binaries under release/release-preview/release-next removed:6 targets/1633290091 bytes; PS5.1/no-link/running-executable/metadata/archive checks passed. Total now110774788396 logical bytes/685targets. Latest workspace cleanup TXT/JSON includes both passes. Installed directory about0.76GB, no data/backups deleted. Business backups contain compressed directories:58.885GiB logical inventory is NOT physical allocation. Keep315/314; after each future successful delivery remove only superseded generated binaries with the same guards, never sources/evidence/user data as build trash. This is a maintenance rule, not automatic cleanup installed in the app.

## 2026-11-01 RC316 installed; checkpoint writes reduced, performance still open

- 235 source suites/89 actual packaged checks passed. Frozen source892 files/0daaa97d8d837e47659abbceb5e26194aa80f90435348a239e83ca08c1323bfb; installed ASAR971617bce328e26521db1cbb74b4938d4a2a3295f033237576444e807dbe4123. New61-check fixture explicitly executed from actual ASAR. Only runtime change is douyin-inbox-engine.cjs; worker graph and data format unchanged.
- Normal close/update/startup passed; canonical D:\MatrixUserBackups\before-update-rc.316-20261101-064241 has26927 files/521978715 bytes, all data/original key verified. Four aggregate routes and336/5884/6232 account cache counts passed. No sends/rule changes/screenshots.
- Actual20s warmup/15s sampled transient allocations1032444240->475751012 bytes; live network workload differs, not retained-memory or whole-app acceptance. Archive0 observed replacements28->11/15.266s; counts lower bounds and other archives vary. Inspector49316 closed and listener absent. Original resource probe failed to load Get-FileHash in Node-spawned PS5.1; failure retained. V2 imports native Utility explicitly, Node CheckOnly and later15.049s read-only sampling passed: main152.31% of one logical core/private783.24MiB, exact-app matched total283.26%/6255.69MiB. CPU window differs from allocation window. MainPID64180 at delivery; verify identity before future operations.
- Deleted only retiredRC314 generated binaries933172330 bytes/3 targets after native acceptance; retain316/315, all sources/evidence/backups. Cumulative logical cleanup111707960726 bytes/688 targets; installed directory759836199 bytes. Wrong-root cleanup check intentionally rejected with no action; not a policy denial. No automatic cleaner installed.
- Full performance is NOT accepted. Background19 pages/18 hidden windows remain, mainCPU still high. Continue evidence-based optimization until Nov1 11:00. Read-only next leads: page-action-journal cold scans after invalidation appear in allocation callers; backup helper filters after recursive traversal (backup-time overhead, not proven app lag). Do not destroy resumable collector pages or change durable message/owner/ACK semantics to claim speed. Details docs/rc316-catchup-checkpoints.txt and workspace matrix-rc316-delivery-summary.json; frozen snapshot is unchanged and its installed:false records freeze-time only.


## 2026-11-01 07:35 canonical context correction and RC317 candidate

- Same absolute journal path returned531282 bytes/Oct23 from tool shell versus3238658 bytes/Nov1 from Explorer-launched canonical reader; underlying cause unconfirmed. Earlier RC315/316 archive replacement comparison is NOT canonical write-rate proof. Original reports preserved;316 delivery summary now links correction. Canonical316 metadata-only15.207s replacement counts10/8/0/9 have no canonical315 comparator. Actual PID inspector/UI metrics remain valid within their sampling limitations.
- New bounded CPU/page-metadata sampler passed real Electron fixture with two sandboxed hidden pages. Actual316 PID77944 after20s warmup/15s: JS idle81.36%,18 pages including11 hidden creator pages/~2546.59MiB associated private memory,4 self pages/~1607.20MiB. No URLs/DOM/message contents saved. Inspector49317 closed and subsequent independent listener query returned none (PowerShell query exit1 from no match, not policy rejection). This is not all-app CPU/mouse latency acceptance.
- Candidate317 only retires terminal historical creator catalog pages after cache/continuation/replay commit. Keeps unfinished catalog and historical comment/reply DOM, owner work IDs, latest-comment pages. New47-check lifecycle/commit suite; actual sandboxed creator242, interactions257, passive identity52 passed. Full236 suites currently running(session88251);91 packaged checks required including new real ASAR native creator fixture. No package/install yet.
- Installed316 PID77944 normally closed after canonical no-active-publishing verification to free build memory; no force termination, data or account actions. Current source version317, installed archive still316/971617bc..., frozen316 unchanged. Goal Nov1 11:00 remains active; no broad performance acceptance.


## 2026-11-01 08:20 RC317 delivered; terminal catalog memory release

- Full236 source suites/91 actual package checks passed;893 files/0fe95bc1f4e43bd960aad451e494945792a2f74f0f7d0e8bebd1dc8a052455e1, ASARe24a4806ff8234caad3068057c2c54dc3c32dc519e85c8add344716a491bdef4. Frozen C:\codex-build\yuanxiao-rc317-source. Only runtime creator-reader/interactions changed: retire terminal catalog only after durable cache/continuation/replay commit; retain unfinished catalog and comment/reply DOM/owner sets.
- First package wrapper failed before native fixture: Electron patched fs treated raw ASAR as virtual directory, ENOENT then owned-fixture timeout. Logs retained; use original-fs for raw hash only and explicit guard-failure exit. Same package then passed242 native assertions standalone and in full91 proof. No product changes for this harness fix. No policy denial or force termination of user app.
- Canonical backup D:\MatrixUserBackups\before-update-rc.317-20261101-080625,27370files/520253766bytes; all data/original key verified. Actual startup and4routes passed (2241/6946/8476/3578ms including accessibility overhead);336/5884/6232 cache counts retained. No sends/rule changes/screenshots.
- Same20s warmup/15s sampler: creator pages11->7, associated private2546.59->1165.61MiB; total metrics6566.82->5688.37MiB. Other workloads differ; self pages grew1607.20->1811.11MiB and transient other page appeared. JS idle81.36%->75.65%, so NOT overall CPU or mouse latency acceptance. Current main77180; inspector49318 closed and independent listener absent. Per-category process memory may overlap across groups.
- Deleted only retired315 generated binaries933173170bytes/3targets after native checks, preserved317/316 and all backups/source. Cumulative logical cleanup112641133896bytes/691targets. Installed directory759837222bytes. Actual current archive and target absence independently verified; no automatic cleaner installed.
- Earlier direct-tool archive rate comparison remains noncanonical; context correction retained. Continue performance goal until Nov1 11:00. Next useful work: steady foreground responsiveness/event-loop evidence and remaining hidden self/live-page lifecycle, without dropping unfinished pagination or weakening durable ACK/owner safeguards. Frozen snapshot's installed:false is freeze-time only.

## 2026-11-01 08:55 RC317 timing evidence and RC318 journal candidate

- RC317 now runs as PID59656 after a normal guarded diagnostic restart. Four aggregate routes passed; 45s timing-only sample observed renderer p95 3.9ms/max265.7ms and four long tasks max266ms. Main loop p95 41.88ms/max102.63ms at20ms resolution; utilization unavailable. Accessibility probing was concurrent, so this is not sustained mouse-response acceptance. Inspector49319 closed and independently absent. Parent PS driver failed its child ExitCode check despite successful child stdout/JSON and empty stderr; cause unconfirmed, original failure preserved in matrix-rc318-run-ui-delay-log.txt, independent findings in matrix-rc318-ui-delay-audit.txt.
- Timing fixture initially used incorrect Electron argv indices with --inspect; first own hidden fixture was normally closed via its exact HWND, second quit normally, corrected fixture passed synthetic130ms renderer/90ms main stalls and cleanup. No real user app force termination or business sends. Old CPU/pages sampler fixture shares that argument indexing issue and has not yet been corrected; actual installed PID profile evidence does not use those fixture args.
- Candidate318 changes only page-action-journal.cjs: reverse64KiB fixed-extent lookup for newest receipt/last80 history, preserving owner match, chronological output, revision/identity checks, bounded cache, append format and full list semantics. New55 assertions plus existing cache24/page-actions51/followup202 passed. Synthetic12000 rows/24append-find queries: median25.657->5.761ms, reads87895065->1572864bytes. This is not whole-app acceptance. Full237-suite gate running session10379; no318 build/install yet.
- First new fixture attempted replacement of its open temporary journal and fs.renameSync returned EPERM(-4048). Cause unconfirmed; original source/failure preserved, fixture directory verified removed. No retry of rejected operation or alternate tool/policy; live-file replacement remains unverified. No effective approval entry in this session. Other authorized independent tests continue. Source docs/rc318-journal-tail.txt details scope.

RC318 full237-suite regression subsequently passed at09:04,894files/source431bad81a7d13460e45cda25d17cd3bf1f140ec0356cfb00f6bf51c50e1c9da4. Source gate session10379 exited0. PID59656 normally closed after canonical no-active-publishing check; installed317 archive unchanged. Gated build session13371 verified live, passed three>=5GiB memory samples and completed frontend/backend build; electron-builder is packaging C:/codex-build/yuanxiao-rc318-final. Actual package verification93checks, frozen source, backup/update and live acceptance remain pending. Build helper preflight currently verifies working source; it switches to frozen source only after verified package freezing. No318 install yet.

CPU/pages fixture argv corrected independently to explicit tail profile argument with path assertion; corrected realElectron fixture passed and exited normally, inspector closed. Earlier fixed-PID live profiles unaffected. First timing fixture's remaining442-byte source archived and owned temp folder removed nonrecursively; prior cleanup command's redundant Split-Path -LiteralPath/-Parent check emitted a parameter error, despite subsequent exact-target/single-file checks and deletion. Do not call the entire initial cleanup command error-free; independent parent/path/absence/archive verification is matrix-rc318-owned-fixture-cleanup-audit.json. No user data or processes removed. Installed software remains normally closed for this build.

## 2026-11-01 09:24 RC318 installed and retired RC316 binaries removed
RC318 source237 suites and actual package93 checks passed; frozen source431bad81a7d13460e45cda25d17cd3bf1f140ec0356cfb00f6bf51c50e1c9da4, installed ASAR4a03c591e242fe974c8c7f6da450b0bb70d5c1ac5d4865930e11e0cca4cb40ab. Canonical backup before-update-rc.318-20261101-091402 has27971 files/522832489 bytes; all unchanged after installation, original key unchanged. Normal mainPID62008, startup and four aggregate routes/account switching passed; accessibility timing includes probe overhead and is not mouse responsiveness proof. Evidence matrix-rc318-delivery-summary.json.
Retired316 only three generated binary targets removed933175670 bytes, current318/rollback317/source/evidence/user backups retained. Cumulative logical removal113574309566 bytes/694 targets; installed759838934 bytes. No automatic cleaner; logical sizes are not guaranteed physical free-space gains.
New isolated exactElectron33 fixture found backgroundThrottling=true alone did not stop initially-hidden default painting: baseline idle3s722 frames/121 timers; explicit hide idle0/3, active resume362/60, cursor/DOM retained. View visibility alternatives did not help. paintWhenInitiallyHidden=false suppressed active frames too and is rejected. These are synthetic observations, not a shipped fix. First paint experiment failed its active-frame assertion; Electron app.quit exit0 did not indicate success. Failure retained, revised parent requires structured measurementComplete. Live profile not touched. Next candidate should verify guarded hide on idle in reader-activity.cjs with real native reader lifecycle/continued RAF and preserved DOM; never hide visible user pages/publishers/IM. No source implementation yet.
Open-file rename EPERM remains unverified and unretried. Original RC317 timing parent exit-check failure remains preserved; valid child timing is narrower evidence. No real sends/publishes/rule modifications or screenshots in this iteration. Performance goal remains active until11:00 Beijing; system stutter is not yet accepted as resolved.

## 2026-11-01 09:40 RC319 candidate and RC318 timing baseline
Installed318 was normally closed (PID21476) after no-active-publishing proof for build; no force termination. New reader-activity helper re-hides only already-hidden idle read-only collectors and invalidates its activity cache on native errors. Same session/DOM/scroll/continuation retained; visible user windows, publishers and IM excluded. Synthetic62 and real sandboxed native46 assertions passed. Exact installed318 baseline failed the intended idle-paint assertion (292frames/48timers in1.2s), new code idle0/2; parent now requires structured positive proof even if Electron app.quit returns0. No platform requests or user profile in fixture.
RC318 actual45s/30s warmup route sample passed including parentdriver this time: main CPU96.766s total user+system over45.007s wall (215.00% of one core), loop p95 38.535ms/max90.309ms at20ms resolution; visible renderer timer p95 3ms/max201ms;5long tasks/max191ms. Inspector49320 closed and listener independently absent. Sources/evidence matrix-rc319-before-ui-delay-live.json and navigation/launch reports. Accessibility actions may affect timing; not a controlled network workload or whole-system mouse measurement.
Source version319, full237 suites running session10524; gated build/package session69934 waits for passed source and three >=5GiB samples. Expected93 actual package checks, frozen319 source and install are still pending. Helpers validated with PS5.1/ASCII/CRLF. Installed318 hash remains4a03c591e242fe974c8c7f6da450b0bb70d5c1ac5d4865930e11e0cca4cb40ab; current318/rollback317 artifacts retained. No319 installation or actual stutter resolution yet. Prior open-file rename EPERM remains unretried.

2026-11-01 09:51 phase: full237 suites passed at01:47:24.492Z,894files/source a2bc0c6d51fb5f014a025d76bfe61b524cfa8898968c55a3dc4dc61fc9b28a32. Full frontend/backend and NSIS build completed after three >=5GiB memory samples. Package verification session69934 remains live; required93 checks, frozen source and installation not yet complete. Current installed318 remains normally closed.

## 2026-11-01 10:17 RC319 delivered; live timing and quiet observation
Full237 source suites/93 actual package checks passed;894files/source a2bc0c6d51fb5f014a025d76bfe61b524cfa8898968c55a3dc4dc61fc9b28a32, ASAR388750efc2b03a7435fdb29e90c1dd2c1ef5ed5903cd62ff6ebf0baa3a6dd464. Frozen C:\codex-build\yuanxiao-rc319-source. Installed10:02, canonical backup before-update-rc.319-20261101-095729 contains28167files/524092036bytes; all unchanged after install, original key unchanged. Actual startup/four routes/account switching passed, caches336/5884/6232 retained. Installer/update session56836 and build69934 completed0.
Actual packaged reader native fixture46 assertions: idle0frames/1timer per1.2s, active123/122frames per0.5s with same DOM/session/scroll/cursor. Earlier318 baseline failed the new idle-paint assertion as intended; parent exit1 and profile removed. No platform requests.
Same45s/30s warmup with native accessibility navigation: before mainCPU215.0017% of one core, after194.5878%; main loop p95 38.535->37.093ms, UI timer p95 3->2ms/max201->183.8ms; longtask max191->196ms. BUT accessibility traversal itself contributes substantial native CPU; live network/pages differ(15->13), so not controlled whole-computer causality or a resolved-stutter claim. Without UI actions, separate20s sample mainCPU66.6022% of one core/private733.45MiB. Both inspector49320/49321 closed and independently no listener. Current main40568, creationUTC02:06:04.4483919. Previous64024 closed normally for diagnostic launch; no forced exit.
Read-only main-process watch session80843 currently live,15min/15s, output matrix-rc319-resource-watch-steady.json only at completion, expected around10:23. Do not restart based on absent final report. User optional feedback pending: now fluid/brief stall/persistent mouse stall. Further useful measurement: light DOM navigation of only local3210 app nav links, avoiding heavy MSAA tree reads; no implementation yet. Source UserLayout nav uses label and remembered route, so top fans link may point to last engagement route. Any probe must allow only read-only engage paths and inspect nav/aside anchors, not message content or platform webviews. Wait current watch before another normal diagnostic restart.
Retired317 generated binaries removed933176880bytes/3targets after startup/native checks. Keep319/current318 rollback and all source/evidence/user backups. Cumulative logical cleanup114507486446bytes/697targets; installed759839313bytes. Actual paths absent and current hash checked by matrix-rc319-delivery-summary.json and storage-latest report. No automatic cleaner. Logical sizes not physical free-space guarantees.
Prior open-file rename EPERM remains unverified/unretried. No sends/publishes/rule changes/screenshots. Performance goal remains active until11:00; overall mouse responsiveness is not yet accepted.

## 2026-11-01 10:35 RC319 light navigation and completed resource observation

Installed319 remains unchanged (ASAR 388750efc2b03a7435fdb29e90c1dd2c1ef5ed5903cd62ff6ebf0baa3a6dd464). Actual local DOM navigation passed all4 link actions across messages/comments/followers, inspecting only built-in nav/aside anchors. Uses desktop HashRouter; original BrowserRouter-only diagnostic failed twice, both failures retained. Fixed helper passed actual sandboxed Electron path/hash navigation, unapproved route/overlay rejection and structured error persistence. No platform scripts/content/screenshots/sends. Diagnostic ports49322/49323/49324 all closed and independently absent. Normal app restarts only; current main43444, creationUTC2026-11-01T02:31:50.0552199Z. Source/runtime/package unchanged, no new release or full-regression rerun needed for these external probes.
Actual45s/warm30 sample: main CPU188.42% of one core; renderer timer p950.30ms/max201.20ms, 4 longtasks/max210ms. Navigation two-frame intervals8-19.8ms are NOT remote content-ready times; first top link restored messages aggregate, second selects the same page. Frame sample count6000 is capped and not a full45s frame distribution. Main CPU remains high after startup; no causal comparison with earlier UIA workload or whole-mouse acceptance claim.
Prior main40568 watch ended normally10:23:44 after900007ms/61samples: private579.96->482.94MiB, peak784.08, weighted CPU54.74% of one core. It sampled main only, not process family. New read-only15min/15s watch on43444/session89282 started around10:34; output only at completion around10:49. Do not restart based on absent final report. Wait/poll the existing session; no process stops or app actions by watcher.
Storage totals unchanged:114507486446 logical bytes/697 targets removed, installed759839313 bytes, retain current319/rollback318 plus all source/evidence/business backups. Not equivalent physical-free-space gain; no automatic cleaner installed. Prior open-file rename EPERM remains unretried. User feedback pending; goal remains active until11:00.

## 2026-11-01 11:00 bounded performance iteration ended

Requested observation window has ended. Current installed RC319 / main PID44548 / ASAR388750efc2b03a7435fdb29e90c1dd2c1ef5ed5903cd62ff6ebf0baa3a6dd464 unchanged;237 source suites and93 actual-package checks passed, canonical backup and original-key/data verification retained. Final report: D:/codexworck/软件/matrix-performance-iteration-20261101-1100.json and .txt. This records completion of the requested timed iteration, NOT full performance acceptance.
User now reports brief switching stutter then recovery. Paired45s real local navigation and100 WM_NULL probes completed: native p95 7.8806ms/max38.8079ms; renderer max timer delay329.3ms and4 longtasks/max323ms. Main sampled CPU187.15% of one core includes active timing/RAF instrumentation and startup workload; not a quiet baseline. Exact root of remaining renderer stalls is unverified. Microsoft WM_NULL documentation supports no-op responsiveness checks; this is not end-to-end physical mouse measurement.
All three read-only main-process observations completed (61/61/17 samples; two independent15min periods and one4min period), all owned fixture processes normally exited, diagnostic ports49320-49325 absent. Current app remains running; no further restart/update scheduled. Last endpoint check initially failed due to PS7 JSON automatic DateTime conversion versus a formatted string; actual UTC ticks/exe/archive rechecked unchanged. Failure retained in endpoint proof, not an app identity change or policy denial.
Whole-software performance acceptance remains false: short switching stalls, startup/resource peaks, real mouse latency, and previous unretried open-file rename EPERM remain documented. No platform sends/publishes/rule changes/screenshots/forced app exits in this final observation phase. Storage remains114507486446 logical bytes/697 generated targets cleaned; retain319/318 and all source/evidence/user backups.

## 2026-11-02 一键评论源码候选，未安装
已加入已发布作品上的指定同平台账号/评论集/随机固定预览/串行队列/加密持久化与防重复；12组核心、26控件、7界面、277原运营、202追评检查及类型/前端构建通过。实际仍RC319；0真实评论发送，完整桌面发行回归与实发校准待完成。详见docs/one-click-comments-20261102.md。不要把本次源码功能当已安装或三个平台全部实发通过。


## 2026-11-02 本人粉丝分批私信候选（未安装）
新增 own-fan 任务来源、原生全历史联系证据、加密分批计划及现有自动私信/批量任务入口。支持本人抖音主号，固定本轮最多500位、每批1–50位、逐条/批间间隔、暂停续跑；存储失败和未知回执暂停，重启不自动发送。沿用现有官网适配和共享账本，不复制原生私信存档。详见 docs/own-fan-batches-20261102.md 与 E:\远效\开发记录\own-fan-batches-20261102。58项新逻辑、14项新真实React、277项既有UI、客户端类型与前端构建通过；最终12组隔离回归exit0。未安装/未真实发消息，运行版本仍RC319；上一轮一键评论候选保留。打包必须包含新增物理worker依赖 own-fan-batch-plan.cjs；不得把源码候选说成已交付运行版本。


## 2026-11-02 RC320 已安装
本人粉丝分批私信与前轮一键评论已打包到 RC320，安装位置 E:\远效\程序。242组源码回归、96组实际安装包检查及39个物理worker依赖校验通过；源码909文件/7572bede425d660bfcbca0f6637385f821c7c48f72edef3795595975c228d972，安装ASAR94cc3deb6dae50fe974fb3ab5b10a2a4523ff11c08898dbeb1f7f9763f0f126b。冷备份 E:\远效\备份\before-update-rc.320-20261102-194725，16700文件/505378246字节，安装前后内容和原固定密钥指纹一致。首次归档测试缺新增关闭桩已修并保留失败；两次内存预检不足5GiB未构建，正常关闭无发布任务的旧程序后按原门槛构建成功。
安装启动后用户明确确认是本人手动关闭，保持关闭未重开；本轮无真实评论/私信发送、未启动新计划，真实平台端到端验收仍待。本人粉丝分批当前仅抖音主号，每轮最多500位缓存粉丝、每批1–50位、可调逐条/批间间隔，完整历史证据与平台回执才可发送/计数，未知暂停且重启需继续。原账号资料仍在 C 盘，不使用 E 盘诊断副本。记录 E:\远效\开发记录\rc320-20261102；准备脚本仅供回溯，勿重复执行。

## 2026-11-03 RC321 账号与计划界面重构候选（尚未安装）
账号管理新增主账号与协作分工独立页，官网连接/分工沿用同一组件与存储；新建计划统一类型选择与共用开关/额度，模板只传入停用草稿，不在外部创建计划。计划列表纳入本人粉丝分批、协作关键词及新增关注规则；平台标识补全。未更改原生发送器、配额/身份/去重逻辑、现有账号或真实规则。
首轮242组通过，912文件源3703d1ecb5783438ec89d036afdee1522cfe1520340e19b41d952ced2f344993与source-snapshot仅代表补用户草稿隔离前版本；追加草稿owner绑定和315项React检查后正在做最终全量回归。首轮证据不得当最终包验收。记录E:\远效\开发记录\rc321-20261103。RC320进程62124在只读确认无发布任务后正常退出，无强杀；固定原密钥与所有数据未改。
当前可用内存未过既有5GiB打包门槛，用户表示会释放其他程序内存；未擅自关其他程序或降低门槛。首个自有等待构建进程11828仅在无子进程/无build.log时停止，用于追加owner检查；非用户程序，也非策略拒绝。最后安装仍RC320。最终回归、包与安装回执出来前不可称已交付RC321。

2026-11-03 RC321最终源码验收：追加模板草稿owner绑定后的完整242组再次全部通过，真实React主界面315项、文案31项、连接26项及本人粉丝15项均通过，零真实平台发送。最终912文件/2cbde70d1ad02c0e48c9407a09d9c1a83453d337102c7e06049739b058ad0b66已复制到开发记录rc321-20261103/source-snapshot-final并逐文件SHA核对，full-regression-final-passed.json与verified-source-final-manifest.json为最终依据。
最后内存预检1.725GiB<既有5GiB；第二个自有空闲构建等待器58796在无子进程/无build.log时停止。未开始构建、未安装、未替换原安装，安装仍RC320。installation-pending-memory.json记录资源条件。没有后台构建继续等待，用户程序没有强杀；原RC320已正常关闭。下次内存满足后先核对最终源码指纹，再使用已完成PS5.1语法/UTF8 BOM/CRLF检查的rc321构建、包检查、备份与安装脚本。原固定密钥校验保持，不要直接把候选源码当已交付版本。

2026-11-03继续推进：用户明确允许暂时卸载Ollama加载模型，已使用原ollama stop卸载qwen3.5:4b-q8_0，未删模型/关闭服务；模型随后被外部调用重新加载，未捕获调用方，不推断来源。用户又明确允许独立低内存构建（2GiB阶段前门槛、Node堆1280MiB、BelowNormal串行、失败停止），原5GiB脚本保持。新脚本matrix-rc321-low-memory-build.ps1的PS5.1解析、BOM/CRLF通过。前两次低于2GiB在预检退出，未编译，原日志保留；观察内存回升3.86GiB后第三次已进入完整前后端/NSIS构建。尚未完成包核验或安装，不能按过程日志声称RC321交付。源码最终912文件/2cbde70d...0b66未改，242组回归仍有效。


## 2026-11-03 RC321 已安装并验证正常启动

上方候选/等待内存记录由本条更新。用户明确批准独立低内存构建：阶段前可用内存2GiB、Node堆1280MiB、BelowNormal串行；原5GiB脚本保留。两次预检失败后第三次完整构建exit0，保留全部日志；不宣称运行中始终保持2GiB。仅按授权卸载Ollama加载模型，未删模型或停服务；外部重载调用方未确认。
最终源码912文件/2cbde70d1ad02c0e48c9407a09d9c1a83453d337102c7e06049739b058ad0b66，242组回归、96组实际包核验和39物理worker依赖通过；ASAR56ae28d734ace60d5cad96a7d12c703a124975d56e4a6d98616c4123fd859962。冷备份E:\远效\备份\before-update-rc.321-20261103-161456，14823文件/505016448字节，安装前后数据逐字节和原固定密钥校验一致。RC321主进程50464正常响应，本地3210属于其子进程；实际提供index-ITl7ZRhj.js与已安装资源摘要一致。PID仅本次观察，后续须重新确认，勿按旧PID操作。
账号设置归账号管理/主账号与协作分工；自动化配置归新建计划，文案仅传停用草稿，标注共用额度范围。真实React行为已验，未做真实粉丝发送、启用计划/改角色或远端上传。活跃资料仍为原C盘账号库，禁止使用E盘诊断副本。记录E:\远效\开发记录\rc321-20261103/delivery.json与delivery.md；原pending记录保留为历史。
旧RC319仅3项生成产物按确切路径/无链接/进程和快捷方式无引用/全文件摘要两次核验清理933179464逻辑字节；保留当前321和回退320、所有源码/证据/备份。首轮外部PS语法检查参数错误未执行清理，独立PS5.1文件检查后通过，失败记录保留。

## 2026-11-03 RC322 评论管理入口候选，尚未安装

本轮按已说明的单账号流程迁移：评论管理选择本人作品、人工正文、预览后确认一条评论；任务记录改为带原回执和账号跳转。不增加账号组轮发、随机评论或点赞；原评论集/历史保留并更新入口说明。复用原加密队列、官方执行器和准确回执，新增 cached-work/receipt 来源核验；切换账号/作品及迟到响应隔离，结果读取失败仍保留已受理状态。小红书/B站需由已核实发布任务进入，不根据标题猜作品编号。
11项来源/账本、12项真实React、63项评论页面切换检查通过，客户端类型通过，无真实平台评论/私信发送。完整244组回归在152组全部通过后因可用内存曾降至约80MiB主动中断，只停止重新核实的自有QA进程，未停用户其他程序；原日志/未完成报告保留，不算完整通过。最后补了旧入口文案，候选916文件/5554274bbbe2cee02150e1cad3b0a6b8be3501506c8ecd20fdbd27f6e072f64a，后续仍须完整回归。
RC321在真实只读确认无发布任务后正常关闭，未强退；安装和账号资料未改。用户已表示释放内存。记录E:\远效\开发记录\rc322-20261103，source-preflight仍要求完整244组通过及源码不变；2GiB/1280MiB/BelowNormal流程保持，未降门槛。当前没有322包、未安装/推送。原活跃C盘资料与E盘诊断副本的区别继续严格遵守。

## 2026-11-04 互动模块内存风险修复候选，未安装

用户要求完善内存泄漏风险。保留RC322已有修改，新增账号/会话失效缓存与调度键清理、Provider卸载释放及迟到回执隔离；普通切页保留缓存/分页，在途任务保留占位至finally。图片队列支持AbortSignal，私信和互动图片卸载即移除未开始的闭包/监听，既有IPC不假称取消。逐条UTF-8计量替代整表JSON+编码副本，减少临时元组数组；记录载荷32MiB单份/128MiB总预算，超限暂停而不删除本地存档，不是应用堆上限。
4组轻量专项分别534/24/83/171断言通过，含实际Provider确定性hook夹具30次会话更换及卸载迟到失败；非真实React浏览器/长测。两helper独立strict类型0诊断。首轮队列误保留shift后调用的TypeError及夹具缺括号SyntaxError已修并保留失败记录。两新专项已加入发行回归，旧244组门槛/916文件摘要不能用于当前源码，需要更新候选清单并完整重跑。
可用内存多次0.18–0.51GiB，轻量Node按128MiB堆串行验证；未跑完整客户端类型、Electron/真实React回归、完整构建/安装或进程族长测，原2GiB构建条件不变。未关闭用户程序、读写账号库或真实发送。详见docs/memory-risk-hardening-20261104.md及E:\远效\开发记录\memory-risk-20261104\verification.json，安装保持原版；整体无泄漏/性能验收仍未完成。

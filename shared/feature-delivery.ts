export type DeliveryState = 'available' | 'partial' | 'pending';
export interface FeatureDelivery { id: string; group: string; name: string; state: DeliveryState; scope: string; limitation: string; to: string }
// Implementation inventory, not a promise that every platform/account request
// succeeds. Keep permissions and live verification distinct from source code.
export const featureDeliveries: readonly FeatureDelivery[] = [
  { id: 'accounts', group: '账号', name: '账号绑定与隔离工作区', state: 'available', scope: '四个核心平台；更多平台独立浏览器入口', limitation: '验证码由本人完成；网页登录不是开放平台授权。', to: '/accounts' },
  { id: 'publish', group: '发布', name: '视频发布与结果核对', state: 'available', scope: '抖音、小红书、视频号、B站；本机任务与官方结果回执', limitation: '平台确认已提交或进入待审核即记为发布成功；结果未确认时不标成功，最终审核结果另行核对。', to: '/publish/tasks' },
  { id: 'image', group: '发布', name: '图文发布', state: 'partial', scope: '抖音、小红书', limitation: '视频号、B站图文尚未接通当前发布适配器。', to: '/publish/batch-image' },
  { id: 'followup', group: '发布', name: '追评与独立置顶', state: 'partial', scope: 'B站、小红书、视频号的已有作品与追评适配', limitation: 'B站原追评置顶已实机核验；置顶与追评分别确认，其他平台仍以各自适配和官方回执为准。', to: '/publish/tasks' },
  { id: 'schedule', group: '发布', name: '本机定时与批量队列', state: 'partial', scope: '桌面保持运行、会话有效时的本机队列', limitation: '不等同于云端离线调度；平台权限或官方验证仍会暂停任务。', to: '/publish/batch-video' },
  { id: 'comments', group: '互动', name: '评论读取、聚合与人工回复', state: 'partial', scope: '抖音作品评论与B站互动适配', limitation: '受官方可访问范围影响，其他平台及通用批量回复未全部接通。', to: '/engage/comments-agg' },
  { id: 'inbox', group: '互动', name: '私信聚合与历史缓存', state: 'partial', scope: '抖音；跨账号时间排序、最新消息优先、本机历史', limitation: '其他平台和部分消息类型未完全支持；不把控制记录当聊天气泡。', to: '/engage/messages-agg' },
  { id: 'followers', group: '互动', name: '粉丝自动分页、头像与详情', state: 'partial', scope: '抖音可访问名单、同账号会话与断点缓存', limitation: '名单条数与主页计数可能不同；没有全量证据不标完整，不伪造关注时间。', to: '/engage/followers' },
  { id: 'observations', group: '互动', name: '粉丝变化记录', state: 'partial', scope: '已有粉丝快照、首次/最近采集时间', limitation: '首次采集不是首次关注；不从不完整名单推断取关。', to: '/engage/follower-monitor' },
  { id: 'rules', group: '自动化', name: '旧版关键词、欢迎语与离线回复配置', state: 'partial', scope: '旧版规则配置、模板与人工回复建议', limitation: '此页不会自动发送；配置不会自动迁入账号运营，需分别配置。', to: '/automation/keywords' },
  { id: 'account-operations', group: '自动化', name: '账号运营与互动规则', state: 'partial', scope: '抖音、小红书的账号运营与联系人任务；抖音新评论关键词监控及固定账号池分配', limitation: '功能按账号和渠道分别启用；关键词规则重启后暂停，失败不换号重发。隔离测试不代表官网实机已全部验证。', to: '/engage/account-operations' },
  { id: 'monitor', group: '自动化', name: '同步监控与本机采集统计', state: 'available', scope: '当前绑定的抖音缓存、同步状态与统计CSV', limitation: '只读监控；不会自动发送消息或把后台网页改成已读。', to: '/automation/monitor' },
  { id: 'analytics', group: '数据', name: '真实记录统计与账号计数核对', state: 'available', scope: '业务数据库、当前桌面缓存、本人主页计数分开显示', limitation: '不是所有平台的实时经营报表；未采集不显示为 0。', to: '/analytics' },
  { id: 'velocity', group: '数据', name: '作品播放流速', state: 'partial', scope: '抖音本人创作者响应的播放快照、区间增量与CSV', limitation: '至少两个有效时间点才计算；官网未返回播放数不按零处理，其他平台待接入。', to: '/analytics/flow' },
  { id: 'moderation', group: '数据', name: '作品审核记录', state: 'partial', scope: '原发布任务官方回执汇总、待审核与未通过区分', limitation: '不包含全平台历史处罚；发布成功不等于最终审核通过，无本地记录不等于无违规。', to: '/analytics/violation' },
  { id: 'work-actions', group: '发布', name: '作品置顶、删除前作与删除源文件', state: 'pending', scope: '当前任务控件未接通这些自动操作', limitation: '不通过仅修改本地状态假装执行，也不会自动删除素材。', to: '/publish/create' },
];
export const deliveryLabels: Record<DeliveryState, string> = { available: '已实现', partial: '部分实现', pending: '待接入' };

import React, { useState } from 'react';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Edit3, BookOpen, AlertTriangle, CheckCircle2, Clock, Ban, Database } from 'lucide-react';

type Priority = 'P0' | 'P1' | 'P2';
type Status = '已实现框架与示例数据' | '示例数据/待平台凭证' | '不支持（违规）' | '待开发';

interface RequirementItem {
  module: string;
  feature: string;
  priority: Priority;
  status: Status;
  remark: string;
}

const PriorityBadge: React.FC<{ priority: Priority }> = ({ priority }) => {
  const map = {
    P0: 'bg-destructive text-destructive-foreground',
    P1: 'bg-warning text-warning-foreground',
    P2: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${map[priority]}`}
    >
      {priority}
      <span className="ml-1 text-[10px] font-normal opacity-80">
        {priority === 'P0' ? '必做' : priority === 'P1' ? '重要' : '增强'}
      </span>
    </span>
  );
};

const StatusBadge: React.FC<{ status: Status }> = ({ status }) => {
  if (status === '已实现框架与示例数据') {
    return (
      <Badge variant="outline" className="border-success/50 text-success whitespace-nowrap">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        已实现框架
      </Badge>
    );
  }
  if (status === '示例数据/待平台凭证') {
    return (
      <Badge variant="outline" className="border-primary/50 text-primary whitespace-nowrap">
        <Database className="mr-1 h-3 w-3" />
        待平台凭证
      </Badge>
    );
  }
  if (status === '不支持（违规）') {
    return (
      <Badge variant="outline" className="border-destructive/50 text-destructive whitespace-nowrap">
        <Ban className="mr-1 h-3 w-3" />
        不支持
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Clock className="mr-1 h-3 w-3" />
      待开发
    </Badge>
  );
};

const requirementsData: Record<string, RequirementItem[]> = {
  account: [
    { module: '账户与 VIP', feature: '用户注册（邮箱/手机号）', priority: 'P0', status: '已实现框架与示例数据', remark: '自有用户体系，JWT 鉴权' },
    { module: '账户与 VIP', feature: '用户登录/登出', priority: 'P0', status: '已实现框架与示例数据', remark: '支持记住登录状态' },
    { module: '账户与 VIP', feature: '授权码激活 VIP', priority: 'P0', status: '已实现框架与示例数据', remark: '卡密制，激活后绑定套餐' },
    { module: '账户与 VIP', feature: '密码找回', priority: 'P1', status: '已实现框架与示例数据', remark: '邮箱验证码流程（前端框架）' },
    { module: '账户与 VIP', feature: 'VIP 到期提醒', priority: 'P1', status: '已实现框架与示例数据', remark: '到期前 7 天 / 3 天 / 1 天提醒' },
    { module: '账户与 VIP', feature: '个人资料与密码修改', priority: 'P1', status: '已实现框架与示例数据', remark: '头像、昵称、密码修改' },
    { module: '账户与 VIP', feature: '多套餐权益区分', priority: 'P1', status: '已实现框架与示例数据', remark: '月度/季度/年度/企业版多档套餐' },
    { module: '账户与 VIP', feature: '登录设备管理', priority: 'P2', status: '已实现框架与示例数据', remark: '查看登录记录、下线设备' },
  ],
  dashboard: [
    { module: '工作台', feature: '公告卡（可配置）', priority: 'P0', status: '已实现框架与示例数据', remark: '由管理后台公告配置维护' },
    { module: '工作台', feature: '核心数据统计卡', priority: 'P0', status: '已实现框架与示例数据', remark: '账号数、作品总数、粉丝总数' },
    { module: '工作台', feature: '视频教程专区', priority: 'P1', status: '已实现框架与示例数据', remark: '按分区展示教程卡片' },
    { module: '工作台', feature: '常见问题 FAQ', priority: 'P1', status: '已实现框架与示例数据', remark: '折叠问答，按分类组织' },
    { module: '工作台', feature: '会员功能对比表', priority: 'P1', status: '已实现框架与示例数据', remark: '各套餐功能与额度横向对比' },
    { module: '工作台', feature: '主题切换（明/暗/跟随系统）', priority: 'P0', status: '已实现框架与示例数据', remark: '全站主题切换，本地持久化' },
    { module: '工作台', feature: '右侧用户信息卡', priority: 'P1', status: '已实现框架与示例数据', remark: '头像、昵称、手机邮箱、退出登录' },
    { module: '工作台', feature: '会员状态卡', priority: 'P1', status: '已实现框架与示例数据', remark: '到期时间、续费入口' },
    { module: '工作台', feature: '联系客服卡', priority: 'P2', status: '已实现框架与示例数据', remark: '客服二维码、视频号教程二维码' },
    { module: '工作台', feature: '数据趋势图表', priority: 'P1', status: '已实现框架与示例数据', remark: '近 7 天 / 30 天粉丝增长趋势' },
    { module: '工作台', feature: '顶部布局与多分辨率适配（V4）', priority: 'P0', status: '已实现框架与示例数据', remark: '修复顶部遮挡问题，支持 1366×768 / 1920×1080 等常见分辨率' },
  ],
  accounts: [
    { module: '平台账号管理', feature: '抖音账号绑定', priority: 'P0', status: '示例数据/待平台凭证', remark: 'OAuth 扫码授权，需抖音开放平台凭证' },
    { module: '平台账号管理', feature: '小红书账号绑定', priority: 'P0', status: '示例数据/待平台凭证', remark: 'OAuth 授权，需小红书开放平台凭证' },
    { module: '平台账号管理', feature: '视频号账号绑定', priority: 'P1', status: '示例数据/待平台凭证', remark: '微信授权，需视频号助手凭证' },
    { module: '平台账号管理', feature: 'B站账号绑定', priority: 'P1', status: '示例数据/待平台凭证', remark: 'OAuth 授权，需 B 站开放平台凭证' },
    { module: '平台账号管理', feature: '账号列表与状态', priority: 'P0', status: '已实现框架与示例数据', remark: '展示绑定状态、授权有效期' },
    { module: '平台账号管理', feature: '账号解绑', priority: 'P0', status: '已实现框架与示例数据', remark: '二次确认后解绑' },
    { module: '平台账号管理', feature: '左侧分组树（V3）', priority: 'P0', status: '已实现框架与示例数据', remark: '可折叠分组，账号行内操作菜单' },
    { module: '平台账号管理', feature: '分组增删改', priority: 'P1', status: '已实现框架与示例数据', remark: '添加/编辑/删除分组' },
    { module: '平台账号管理', feature: '多 Tab 创作者看板（V3）', priority: 'P0', status: '示例数据/待平台凭证', remark: '点击账号在右侧 Tab 打开创作者数据看板' },
    { module: '平台账号管理', feature: '内容吸引力指标', priority: 'P1', status: '示例数据/待平台凭证', remark: '完播率、平均播放时长、2s 跳出率等' },
    { module: '平台账号管理', feature: '观看趋势曲线图', priority: 'P1', status: '示例数据/待平台凭证', remark: '当前作品 vs 同类作品对比' },
    { module: '平台账号管理', feature: '流量来源分析', priority: 'P1', status: '示例数据/待平台凭证', remark: '推荐页/关注页/搜索/消息页占比' },
    { module: '平台账号管理', feature: '搜索关键词分析', priority: 'P2', status: '示例数据/待平台凭证', remark: '看到作品的词 + 看完常搜的词' },
    { module: '平台账号管理', feature: '章节点击率', priority: 'P2', status: '示例数据/待平台凭证', remark: '各时间点章节点击率分布' },
    { module: '平台账号管理', feature: '授权到期提醒', priority: 'P1', status: '示例数据/待平台凭证', remark: '授权即将到期时提醒续期' },
    { module: '平台账号管理', feature: '账号额度控制', priority: 'P1', status: '已实现框架与示例数据', remark: '按套餐限制可绑定账号数' },
    { module: '平台账号管理', feature: '平台→分组→账号三级联动筛选（V4）', priority: 'P0', status: '已实现框架与示例数据', remark: '统一筛选组件，各模块复用，逐级过滤列表与统计数据' },
  ],
  publish: [
    { module: '一键发布', feature: '发条单视频（V3）', priority: 'P0', status: '已实现框架与示例数据', remark: '4 步发布向导：选账号→填内容→差异化→发布设置' },
    { module: '一键发布', feature: '批量发视频（V3）', priority: 'P1', status: '已实现框架与示例数据', remark: '多视频素材 + 多账号批量编排' },
    { module: '一键发布', feature: '批量发图文（V3）', priority: 'P1', status: '已实现框架与示例数据', remark: '多图文素材批量发布' },
    { module: '一键发布', feature: '本地草稿箱（V3）', priority: 'P0', status: '已实现框架与示例数据', remark: '草稿列表、继续编辑、删除' },
    { module: '一键发布', feature: '任务记录主界面（V3）', priority: 'P0', status: '已实现框架与示例数据', remark: '列表+多维度筛选+勾选+批量操作' },
    { module: '一键发布', feature: '批量重发/暂停/删除', priority: 'P0', status: '已实现框架与示例数据', remark: '底部批量操作栏，全选/已选计数' },
    { module: '一键发布', feature: '发布状态与失败原因', priority: 'P0', status: '示例数据/待平台凭证', remark: '需接通平台发布 API 后才返回真实失败原因' },
    { module: '一键发布', feature: '追评状态管理', priority: 'P1', status: '示例数据/待平台凭证', remark: '追评已发布/失败/重发' },
    { module: '一键发布', feature: '任务统计（V3）', priority: 'P1', status: '已实现框架与示例数据', remark: '成功率、失败原因分布、平台对比' },
    { module: '一键发布', feature: '任务设置', priority: 'P2', status: '已实现框架与示例数据', remark: '默认发布参数、频控、追评默认值' },
    { module: '一键发布', feature: '素材库', priority: 'P0', status: '已实现框架与示例数据', remark: '图文 / 视频素材分类管理' },
    { module: '一键发布', feature: '列表交互闭环（V4）', priority: 'P0', status: '已实现框架与示例数据', remark: '筛选、搜索、分页、批量操作、导出 CSV 完整交互链路' },
  ],
  content: [
    { module: '内容管理', feature: '素材库', priority: 'P0', status: '已实现框架与示例数据', remark: '图文 / 视频素材管理' },
    { module: '内容管理', feature: '内容编辑器', priority: 'P0', status: '已实现框架与示例数据', remark: '支持多平台内容编排' },
    { module: '内容管理', feature: '一键发布到多平台', priority: 'P0', status: '示例数据/待平台凭证', remark: '选择平台后批量发布' },
    { module: '内容管理', feature: '定时发布', priority: 'P1', status: '已实现框架与示例数据', remark: '指定发布时间，队列执行' },
    { module: '内容管理', feature: '发布队列', priority: 'P1', status: '已实现框架与示例数据', remark: '查看待发布内容和执行状态' },
    { module: '内容管理', feature: '发布历史', priority: 'P0', status: '已实现框架与示例数据', remark: '历史发布记录与数据' },
    { module: '内容管理', feature: '内容模板', priority: 'P2', status: '已实现框架与示例数据', remark: '保存常用内容模板' },
    { module: '内容管理', feature: '草稿箱', priority: 'P1', status: '已实现框架与示例数据', remark: '未完成内容自动保存' },
    { module: '内容管理', feature: '发布失败重试', priority: 'P1', status: '示例数据/待平台凭证', remark: '失败内容可手动重试' },
    { module: '内容管理', feature: '内容分类标签', priority: 'P2', status: '已实现框架与示例数据', remark: '按主题 / 系列分类管理' },
  ],
  followers: [
    { module: '粉丝管理', feature: '粉丝列表', priority: 'P0', status: '已实现框架与示例数据', remark: '各平台粉丝列表展示' },
    { module: '粉丝管理', feature: '粉丝画像', priority: 'P1', status: '已实现框架与示例数据', remark: '性别、年龄、地域分布' },
    { module: '粉丝管理', feature: '粉丝增长趋势', priority: 'P0', status: '已实现框架与示例数据', remark: '日 / 周 / 月增长曲线' },
    { module: '粉丝管理', feature: '粉丝互动数据', priority: 'P1', status: '已实现框架与示例数据', remark: '点赞、评论、转发统计' },
    { module: '粉丝管理', feature: '多平台粉丝对比', priority: 'P1', status: '已实现框架与示例数据', remark: '跨平台粉丝数据对比' },
    { module: '粉丝管理', feature: '粉丝导出', priority: 'P2', status: '已实现框架与示例数据', remark: '导出粉丝数据报表（CSV）' },
    { module: '粉丝管理', feature: '粉丝分层与标签', priority: 'P2', status: '已实现框架与示例数据', remark: '按活跃度等维度分层' },
  ],
  messages: [
    { module: '私信管理', feature: '统一收件箱', priority: 'P0', status: '已实现框架与示例数据', remark: '多平台私信聚合展示' },
    { module: '私信管理', feature: '私信回复', priority: 'P0', status: '示例数据/待平台凭证', remark: '需接通平台私信 API' },
    { module: '私信管理', feature: '会话列表', priority: 'P0', status: '已实现框架与示例数据', remark: '按最新消息排序' },
    { module: '私信管理', feature: '未读消息标记', priority: 'P1', status: '已实现框架与示例数据', remark: '未读 / 已读状态切换' },
    { module: '私信管理', feature: '快捷回复 / 话术库', priority: 'P1', status: '已实现框架与示例数据', remark: '常用语快捷发送' },
    { module: '私信管理', feature: '消息搜索', priority: 'P2', status: '已实现框架与示例数据', remark: '按关键词搜索私信' },
    { module: '私信管理', feature: '按平台筛选', priority: 'P1', status: '已实现框架与示例数据', remark: '分平台查看私信' },
    { module: '私信管理', feature: '用户信息卡片', priority: 'P2', status: '已实现框架与示例数据', remark: '展示对话用户的粉丝信息' },
  ],
  comments: [
    { module: '评论管理', feature: '全平台评论汇总', priority: 'P0', status: '已实现框架与示例数据', remark: '所有账号的评论集中展示' },
    { module: '评论管理', feature: '评论回复', priority: 'P0', status: '示例数据/待平台凭证', remark: '直接回复评论，需平台评论 API' },
    { module: '评论管理', feature: '评论筛选', priority: 'P1', status: '已实现框架与示例数据', remark: '按平台 / 账号 / 时间筛选' },
    { module: '评论管理', feature: '评论点赞', priority: 'P2', status: '示例数据/待平台凭证', remark: '对评论进行点赞操作' },
    { module: '评论管理', feature: '评论删除 / 屏蔽', priority: 'P2', status: '示例数据/待平台凭证', remark: '管理负面评论' },
    { module: '评论管理', feature: '待回复评论', priority: 'P1', status: '已实现框架与示例数据', remark: '重点展示未回复评论' },
    { module: '评论管理', feature: '批量回复', priority: 'P1', status: '已实现框架与示例数据', remark: '批量回复框架（待平台凭证）' },
  ],
  'auto-reply': [
    { module: '自动回复', feature: '关键词回复规则', priority: 'P0', status: '已实现框架与示例数据', remark: '匹配关键词自动回复' },
    { module: '自动回复', feature: '规则增删改', priority: 'P0', status: '已实现框架与示例数据', remark: '可视化规则管理' },
    { module: '自动回复', feature: '规则启用 / 停用', priority: 'P0', status: '已实现框架与示例数据', remark: '单条规则开关控制' },
    { module: '自动回复', feature: '被关注自动回复（欢迎语）', priority: 'P1', status: '已实现框架与示例数据', remark: '新粉丝关注时触发' },
    { module: '自动回复', feature: '离线回复', priority: 'P1', status: '已实现框架与示例数据', remark: '离线时段自动回复' },
    { module: '自动回复', feature: '超时回复', priority: 'P2', status: '已实现框架与示例数据', remark: '用户消息超时时自动回复' },
    { module: '自动回复', feature: '监控任务', priority: 'P1', status: '已实现框架与示例数据', remark: '粉丝 / 私信 / 评论关键词监控 + 自动动作' },
    { module: '自动回复', feature: '回复模板', priority: 'P2', status: '已实现框架与示例数据', remark: '消息模板管理' },
    { module: '自动回复', feature: '回复模板变量', priority: 'P2', status: '待开发', remark: '支持昵称等变量' },
    { module: '自动回复', feature: '回复效果统计', priority: 'P1', status: '已实现框架与示例数据', remark: '触发次数、转化率统计' },
    { module: '自动回复', feature: '私信群发（默认禁用）', priority: 'P2', status: '不支持（违规）', remark: '红色警示，违反平台规则，仅作合规说明' },
    { module: '自动回复', feature: '规则优先级排序', priority: 'P2', status: '已实现框架与示例数据', remark: '多条规则按优先级匹配' },
  ],
  automation: [
    { module: '自动化', feature: '主动私信（频控 + 随机间隔）', priority: 'P1', status: '示例数据/待平台凭证', remark: '按小时 / 日频控，发送间隔支持随机区间' },
    { module: '自动化', feature: '关键词回复', priority: 'P0', status: '已实现框架与示例数据', remark: '私信关键词匹配自动回复' },
    { module: '自动化', feature: '欢迎语', priority: 'P1', status: '已实现框架与示例数据', remark: '新粉丝关注 / 新会话触发欢迎语' },
    { module: '自动化', feature: '离线回复', priority: 'P1', status: '已实现框架与示例数据', remark: '离线时段自动回复' },
    { module: '自动化', feature: '监控任务', priority: 'P1', status: '已实现框架与示例数据', remark: '粉丝 / 私信 / 评论关键词监控 + 自动动作' },
    { module: '自动化', feature: '消息模板（审核状态）', priority: 'P2', status: '已实现框架与示例数据', remark: '模板草稿 / 审核中 / 已通过 / 已驳回状态流转' },
  ],
  engage: [
    { module: '粉丝互动', feature: '操作账号可选', priority: 'P0', status: '已实现框架与示例数据', remark: '回复评论 / 私信时可切换发送账号' },
    { module: '粉丝互动', feature: '失败原因展示', priority: 'P0', status: '示例数据/待平台凭证', remark: '发送失败时展示平台返回的失败原因' },
    { module: '粉丝互动', feature: '打开 TA 私信', priority: 'P0', status: '已实现框架与示例数据', remark: '从评论 / 粉丝列表直接跳转私信对话' },
    { module: '粉丝互动', feature: '评论聚合视图', priority: 'P1', status: '已实现框架与示例数据', remark: '多账号评论统一聚合展示与筛选' },
    { module: '粉丝互动', feature: '私信聚合视图', priority: 'P1', status: '已实现框架与示例数据', remark: '多账号私信会话统一聚合' },
    { module: '粉丝互动', feature: '粉丝管理', priority: 'P0', status: '已实现框架与示例数据', remark: '粉丝列表、标签、分组' },
  ],
  analytics: [
    { module: '数据中心', feature: '作品监控（V4 增强）', priority: 'P0', status: '已实现框架与示例数据', remark: '作品卡片网格，监控启停，加载态骨架屏，数据增量动画，三级筛选' },
    { module: '数据中心', feature: '播放流速（V3）', priority: 'P1', status: '已实现框架与示例数据', remark: '实时播放增长曲线 + 流速排行' },
    { module: '数据中心', feature: '账号监控（V3）', priority: 'P1', status: '已实现框架与示例数据', remark: '各账号粉丝增量、授权健康度' },
    { module: '数据中心', feature: '通知监控（V3）', priority: 'P2', status: '已实现框架与示例数据', remark: '各平台系统通知聚合' },
    { module: '数据中心', feature: '作品违规（V3）', priority: 'P1', status: '已实现框架与示例数据', remark: '违规作品列表、违规原因、处理建议' },
    { module: '数据中心', feature: '草稿监控（V3）', priority: 'P2', status: '已实现框架与示例数据', remark: '各平台草稿同步状态' },
    { module: '数据中心', feature: '双列/单列切换', priority: 'P1', status: '已实现框架与示例数据', remark: '作品卡片网格布局切换' },
    { module: '数据中心', feature: '多维度筛选', priority: 'P1', status: '已实现框架与示例数据', remark: '按分组、账号、标题、增量流速筛选' },
    { module: '数据中心', feature: '内容数据报表', priority: 'P0', status: '已实现框架与示例数据', remark: '播放 / 点赞 / 评论 / 分享' },
    { module: '数据中心', feature: '粉丝数据报表', priority: 'P0', status: '已实现框架与示例数据', remark: '粉丝增长、粉丝画像' },
    { module: '数据中心', feature: '多平台数据对比', priority: 'P1', status: '已实现框架与示例数据', remark: '跨平台横向对比' },
    { module: '数据中心', feature: '自定义时间范围', priority: 'P1', status: '已实现框架与示例数据', remark: '按日期范围筛选数据' },
    { module: '数据中心', feature: '内容效果排行', priority: 'P1', status: '已实现框架与示例数据', remark: 'TOP 内容排行榜' },
    { module: '数据中心', feature: '数据大屏', priority: 'P2', status: '已实现框架与示例数据', remark: '全平台数据可视化大屏' },
  ],
  admin: [
    { module: '管理后台', feature: '管理员登录', priority: 'P0', status: '已实现框架与示例数据', remark: '独立账号体系' },
    { module: '管理后台', feature: '运营总览', priority: 'P1', status: '已实现框架与示例数据', remark: '全局运营数据看板，8 大指标 + 图表' },
    { module: '管理后台', feature: '用户管理', priority: 'P0', status: '已实现框架与示例数据', remark: '用户列表、详情、VIP 管理、批量操作' },
    { module: '管理后台', feature: '授权码管理', priority: 'P0', status: '已实现框架与示例数据', remark: '批量生成、发放、核销授权码' },
    { module: '管理后台', feature: '套餐管理', priority: 'P0', status: '已实现框架与示例数据', remark: 'VIP 套餐配置、排序、启停' },
    { module: '管理后台', feature: '操作日志', priority: 'P1', status: '已实现框架与示例数据', remark: '管理员/用户操作审计、筛选、导出' },
    { module: '管理后台', feature: '系统配置', priority: 'P1', status: '已实现框架与示例数据', remark: '平台凭证、功能开关、敏感词、公告、基础配置、管理员' },
    { module: '管理后台', feature: '敏感词库', priority: 'P1', status: '已实现框架与示例数据', remark: '分级敏感词管理、批量导入导出' },
    { module: '管理后台', feature: '公告管理', priority: 'P2', status: '已实现框架与示例数据', remark: '公告发布、分类、排序' },
    { module: '管理后台', feature: '管理员权限分级', priority: 'P2', status: '已实现框架与示例数据', remark: '超级管理员 / 运营 / 客服' },
    { module: '管理后台', feature: '用户手动开通 / 停用', priority: 'P1', status: '已实现框架与示例数据', remark: '管理员手动调整用户状态' },
    { module: '管理后台', feature: '数据统计报表', priority: 'P2', status: '已实现框架与示例数据', remark: '平台级运营数据报表 + 导出' },
    { module: '管理后台', feature: '导出功能', priority: 'P2', status: '已实现框架与示例数据', remark: '前端 CSV 导出（用户/授权码/日志等）' },
  ],
  docs: [
    { module: '文档中心', feature: '产品文档查看', priority: 'P1', status: '已实现框架与示例数据', remark: '6 大文档板块' },
    { module: '文档中心', feature: '文档导航与搜索', priority: 'P2', status: '待开发', remark: '关键词搜索文档内容' },
    { module: '文档中心', feature: '文档编辑（管理员）', priority: 'P2', status: '待开发', remark: '管理员可在线编辑文档' },
  ],
  notify: [
    { module: '通知中心', feature: '系统通知', priority: 'P1', status: '已实现框架与示例数据', remark: '系统公告、版本更新通知' },
    { module: '通知中心', feature: '业务通知', priority: 'P1', status: '已实现框架与示例数据', remark: '发布结果、粉丝增长、评论提醒' },
    { module: '通知中心', feature: '通知已读/未读', priority: 'P2', status: '已实现框架与示例数据', remark: '标记已读、全部已读' },
    { module: '通知中心', feature: '通知分类筛选', priority: 'P2', status: '已实现框架与示例数据', remark: '按类型/时间筛选通知' },
  ],
};

const moduleTabs = [
  { value: 'account', label: '账户与 VIP' },
  { value: 'dashboard', label: '首页 / 工作台' },
  { value: 'accounts', label: '账号管理' },
  { value: 'publish', label: '一键发布' },
  { value: 'content', label: '内容管理' },
  { value: 'followers', label: '粉丝管理' },
  { value: 'messages', label: '私信管理' },
  { value: 'comments', label: '评论管理' },
  { value: 'auto-reply', label: '自动回复' },
  { value: 'automation', label: '自动化' },
  { value: 'engage', label: '粉丝互动' },
  { value: 'analytics', label: '数据中心' },
  { value: 'admin', label: '管理后台' },
  { value: 'notify', label: '通知中心' },
  { value: 'docs', label: '文档中心' },
];

const RequirementsPage: React.FC = () => {
  const [showEditTip, setShowEditTip] = useState(false);

  const totalCount = Object.values(requirementsData).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  const p0Count = Object.values(requirementsData).reduce(
    (sum, arr) => sum + arr.filter((r) => r.priority === 'P0').length,
    0,
  );
  const frameworkCount = Object.values(requirementsData).reduce(
    (sum, arr) => sum + arr.filter((r) => r.status === '已实现框架与示例数据').length,
    0,
  );

  return (
    <div className="mx-auto max-w-5xl py-8">
      {/* 页面标题区 */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <Badge variant="secondary">文档中心</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">功能需求清单</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            全模块功能点明细，共 {totalCount} 项功能需求
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

      {/* 统计概览 */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-2xl font-bold">{totalCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">总功能点</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-2xl font-bold text-destructive">{p0Count}</div>
          <div className="mt-1 text-xs text-muted-foreground">P0 必做</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-2xl font-bold text-success">{frameworkCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">已实现框架</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-2xl font-bold text-primary">{moduleTabs.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">功能模块</div>
        </div>
      </div>

      {/* V3 功能概览 */}
      <Alert className="mb-6 border-primary/30 bg-primary/5">
        <BookOpen className="h-4 w-4 text-primary" />
        <AlertTitle>V3 · 管理后台全模块补齐</AlertTitle>
        <AlertDescription className="mt-2 space-y-1 text-xs leading-5">
          <p>
            <strong className="text-foreground">运营总览</strong>：8 大指标卡 + 用户增长趋势 + VIP 分布 + 平台分布 + 操作日志 + 注册用户
          </p>
          <p>
            <strong className="text-foreground">用户管理</strong>：筛选 + 批量操作 + 详情抽屉（4 Tab）+ 开通/延长 VIP + 重置密码
          </p>
          <p>
            <strong className="text-foreground">授权码管理</strong>：统计卡 + 批量生成 + 筛选 + 批量操作 + 导出 CSV
          </p>
          <p>
            <strong className="text-foreground">套餐管理</strong>：CRUD + 启停 + 排序 + 删除确认
          </p>
          <p>
            <strong className="text-foreground">操作日志</strong>：多维度筛选 + 详情弹窗 + 分页 + 导出
          </p>
          <p>
            <strong className="text-foreground">系统配置</strong>：6 大 Tab（平台凭证/功能开关/敏感词/公告/基础配置/管理员）
          </p>
        </AlertDescription>
      </Alert>

      {/* Tabs + 表格 */}
      <div className="rounded-xl border bg-card">
        <Tabs defaultValue="account" className="w-full">
          <div className="border-b px-4 pt-3 overflow-x-auto">
            <TabsList className="mb-0 w-max">
              {moduleTabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs">
                   {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {moduleTabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="m-0 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">模块</TableHead>
                    <TableHead>功能点</TableHead>
                    <TableHead className="w-[120px]">优先级</TableHead>
                    <TableHead className="w-[140px]">当前状态</TableHead>
                    <TableHead className="w-[240px]">备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requirementsData[t.value]?.map(
                    (item: RequirementItem, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.module}
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.feature}
                        </TableCell>
                        <TableCell>
                          <PriorityBadge priority={item.priority} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.remark}
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* 状态图例 */}
      <div className="mt-8 rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">状态图例说明</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-success">已实现框架与示例数据</div>
              <div className="mt-1 text-xs text-muted-foreground">
                不依赖外部平台 API 的前端交互与自有后端逻辑已完成框架搭建，使用示例数据演示完整流程，接通数据库后即可落库运行。
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Database className="mt-0.5 h-5 w-5 text-primary flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-primary">示例数据 / 待平台凭证</div>
              <div className="mt-1 text-xs text-muted-foreground">
                需接通抖音 / 小红书 / 视频号 / B站等平台开放 API 才能运行的能力，当前以示例数据演示交互流程，配置平台凭证后切换为真实数据。
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <Ban className="mt-0.5 h-5 w-5 text-destructive flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-destructive">不支持（违规）</div>
              <div className="mt-1 text-xs text-muted-foreground">
                涉及违反平台规则的功能（如爬虫、模拟登录、多开防关联、非合规群发等），明确不提供支持，仅作合规风险提示。
              </div>
            </div>
          </div>
        </div>
      </div>

      <Alert variant="warning" className="mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>说明</AlertTitle>
        <AlertDescription>
          以上信息整理自各平台公开文档，具体以各平台官方最新版本为准。标注「待平台凭证」的功能需在管理后台配置对应平台的 AppID / AppSecret 后方可启用。
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default RequirementsPage;

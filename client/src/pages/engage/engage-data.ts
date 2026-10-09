import { Music, BookOpen, Video, Tv } from 'lucide-react';
import type {
  PlatformType,
  CommentItem,
  AutoReplyRule,
  MessageSession,
  MessageItem,
  QuickReply,
  FollowerRecord,
  MonitorTask,
  MonitorHitRecord,
  AutoMessageTask,
  AutoMessageTaskItem,
  SendFailReason,
} from '@shared/api.interface';

// ==================== platformMeta ====================
export const platformMeta: Record<
  PlatformType,
  { label: string; color: string; icon: typeof Music }
> = {
  douyin: { label: '抖音', color: 'hsl(0 0% 8%)', icon: Music },
  xiaohongshu: { label: '小红书', color: 'hsl(350 85% 60%)', icon: BookOpen },
  wechat: { label: '视频号', color: 'hsl(142 45% 45%)', icon: Video },
  bilibili: { label: 'B站', color: 'hsl(200 90% 55%)', icon: Tv },
};

// ==================== mockAccounts ====================
// 12个账号，每平台3个，使用 Record 便于按 id 查找
export interface MockAccount {
  id: string;
  platform: PlatformType;
  nickname: string;
  avatarUrl: string;
  groupName: string;
}

export const mockAccounts: Record<string, MockAccount> = {
  // 抖音
  '1': { id: '1', platform: 'douyin', nickname: '美食探店小队', avatarUrl: '', groupName: '美食组' },
  '2': { id: '2', platform: 'douyin', nickname: '旅行日记', avatarUrl: '', groupName: '生活组' },
  '3': { id: '3', platform: 'douyin', nickname: '数码测评君', avatarUrl: '', groupName: '科技组' },
  // 小红书
  '4': { id: '4', platform: 'xiaohongshu', nickname: '生活种草日记', avatarUrl: '', groupName: '生活组' },
  '5': { id: '5', platform: 'xiaohongshu', nickname: '美妆小课堂', avatarUrl: '', groupName: '生活组' },
  '6': { id: '6', platform: 'xiaohongshu', nickname: '家居美学馆', avatarUrl: '', groupName: '生活组' },
  // 微信视频号
  '7': { id: '7', platform: 'wechat', nickname: '职场成长笔记', avatarUrl: '', groupName: '科技组' },
  '8': { id: '8', platform: 'wechat', nickname: '亲子时光', avatarUrl: '', groupName: '生活组' },
  '9': { id: '9', platform: 'wechat', nickname: '健康养生堂', avatarUrl: '', groupName: '生活组' },
  // B站
  '10': { id: '10', platform: 'bilibili', nickname: '科技宅频道', avatarUrl: '', groupName: '科技组' },
  '11': { id: '11', platform: 'bilibili', nickname: '游戏空间站', avatarUrl: '', groupName: '科技组' },
  '12': { id: '12', platform: 'bilibili', nickname: '知识共享家', avatarUrl: '', groupName: '科技组' },
};

// ==================== mockAccountList & mockAccountGroups ====================
import type { PlatformAccount, AccountGroup } from '@shared/api.interface';

export const mockAccountList: PlatformAccount[] = Object.values(mockAccounts).map((a, i) => ({
  id: a.id,
  platform: a.platform,
  platformUserId: `pu_${a.id}`,
  nickname: a.nickname,
  avatarUrl: a.avatarUrl,
  accountRemark: '',
  groupName: a.groupName,
  authStatus: 'authorized' as const,
  authExpiresAt: '2027-09-28 00:00',
  followersCount: 10000 + i * 2300,
  followingCount: 200 + i * 50,
  likesCount: 50000 + i * 8000,
  postsCount: 120 + i * 30,
  healthStatus: 'normal' as const,
  createdAt: '2026-01-15 10:00',
}));

const uniqueGroupNames = Array.from(new Set(Object.values(mockAccounts).map((a) => a.groupName)));
export const mockAccountGroups: AccountGroup[] = uniqueGroupNames.map((name, i) => ({
  id: `g${i + 1}`,
  userId: 'u1',
  groupName: name,
  sortOrder: i + 1,
  isDefault: i === 0,
  accountCount: Object.values(mockAccounts).filter((a) => a.groupName === name).length,
  createdAt: '2026-01-01 00:00',
}));

// ==================== Sensitive Words ====================
export const sensitiveWords: string[] = [
  '加微信',
  '加好友',
  '微信号',
  '私聊',
  '免费领取',
  '点击链接',
  '购买链接',
  '刷单',
  '返利',
  '现金红包',
  '代运营',
  '涨粉',
  '点赞赚钱',
  '兼职',
  '加群',
];

function checkSensitive(text: string): boolean {
  return sensitiveWords.some((w) => text.includes(w));
}

// ==================== mockComments ====================
const commentContents: Array<{
  platform: PlatformType;
  accountId: string;
  postTitle: string;
  commenter: string;
  content: string;
  isReplied?: boolean;
  replyContent?: string;
  replyAccountId?: string;
  repliedAt?: string;
  replyFailReason?: SendFailReason;
  likeCount: number;
  replyCount: number;
  commentedAt: string;
}> = [
  // 抖音 - 美食探店小队
  { platform: 'douyin', accountId: '1', postTitle: '成都火锅探店vlog', commenter: '小美食家', content: '这家店看着好好吃啊，求具体地址！人均大概多少呀？想周末和朋友一起去～', likeCount: 28, replyCount: 0, commentedAt: '2026-09-28 15:30' },
  { platform: 'douyin', accountId: '1', postTitle: '成都火锅探店vlog', commenter: '吃货张三', content: '去过了，真的超辣！不太能吃辣的建议点微辣就好', likeCount: 15, replyCount: 0, commentedAt: '2026-09-28 14:45' },
  { platform: 'douyin', accountId: '1', postTitle: '北京胡同美食', commenter: '老北京人儿', content: '这家店我从小吃到大，味道一直没变', likeCount: 67, replyCount: 0, commentedAt: '2026-09-26 12:30' },
  { platform: 'douyin', accountId: '1', postTitle: '广州早茶文化', commenter: '早茶爱好者', content: '请问这家店在什么位置呀？想去试试', isReplied: true, replyContent: '在荔湾区上下九那边哦，导航搜店名就能找到～', replyAccountId: '1', repliedAt: '2026-09-28 09:30', likeCount: 12, replyCount: 1, commentedAt: '2026-09-28 08:15' },
  { platform: 'douyin', accountId: '1', postTitle: '重庆小面测评', commenter: '辣妹子', content: '重庆小面真的绝了，看着就流口水！', likeCount: 34, replyCount: 0, commentedAt: '2026-09-27 21:00' },
  { platform: 'douyin', accountId: '1', postTitle: '上海本帮菜', commenter: '美食推广达人', content: '想合作推广的加微信 foodie123，免费领取优惠券！', likeCount: 3, replyCount: 0, commentedAt: '2026-09-27 18:20' },
  { platform: 'douyin', accountId: '1', postTitle: '西安美食攻略', commenter: '面食爱好者', content: '肉夹馍看着太香了，求购买链接！', likeCount: 22, replyCount: 0, commentedAt: '2026-09-26 16:40' },
  { platform: 'douyin', accountId: '1', postTitle: '武汉过早文化', commenter: '热干面粉丝', content: '武汉的过早真的太丰富了，羡慕！', isReplied: true, replyContent: '哈哈武汉人表示每天过早都不重样～', replyAccountId: '1', repliedAt: '2026-09-25 10:15', likeCount: 45, replyCount: 1, commentedAt: '2026-09-25 09:30' },
  // 抖音 - 旅行日记
  { platform: 'douyin', accountId: '2', postTitle: '云南大理旅行攻略', commenter: '旅行爱好者', content: '请问洱海附近有推荐的民宿吗，预算500以内的', likeCount: 12, replyCount: 0, commentedAt: '2026-09-26 18:50' },
  { platform: 'douyin', accountId: '2', postTitle: '三亚五日游攻略', commenter: '海边晒太阳', content: '蜈支洲岛值得去吗？看评价说人很多', likeCount: 19, replyCount: 0, commentedAt: '2026-09-25 11:00' },
  { platform: 'douyin', accountId: '2', postTitle: '西藏自驾之旅', commenter: '自由行者', content: '请问去西藏需要准备什么特别的东西吗？', isReplied: true, replyContent: '主要是防晒和高反药哦，提前一周喝红景天～', replyAccountId: '2', repliedAt: '2026-09-24 16:00', likeCount: 56, replyCount: 2, commentedAt: '2026-09-24 14:20' },
  { platform: 'douyin', accountId: '2', postTitle: '日本樱花季', commenter: '樱花少女', content: '太美了！请问几月去最好呀', likeCount: 33, replyCount: 0, commentedAt: '2026-09-23 20:15' },
  { platform: 'douyin', accountId: '2', postTitle: '新疆独库公路', commenter: '自驾游达人', content: '想组队的加微信 travel_buddy，一起拼车！', likeCount: 8, replyCount: 0, commentedAt: '2026-09-23 15:40' },
  // 抖音 - 数码测评君
  { platform: 'douyin', accountId: '3', postTitle: '最新旗舰手机对比', commenter: '参数党', content: '请问骁龙版和天玑版哪个续航更好？', isReplied: true, replyContent: '实测骁龙版续航略好一点，差距不大～', replyAccountId: '3', repliedAt: '2026-09-28 11:20', likeCount: 24, replyCount: 1, commentedAt: '2026-09-28 10:05' },
  { platform: 'douyin', accountId: '3', postTitle: '无线耳机横评', commenter: '音质发烧友', content: '降噪效果最好的是哪款？求推荐', likeCount: 18, replyCount: 0, commentedAt: '2026-09-27 22:30' },
  // 小红书
  { platform: 'xiaohongshu', accountId: '4', postTitle: '秋季护肤好物分享', commenter: '精致生活家', content: '第一款面霜我也在用，真的超补水！想问下敏感肌可以用吗？', isReplied: true, replyContent: '可以的呢，我闺蜜就是敏感肌，用着完全没问题～', replyAccountId: '4', repliedAt: '2026-09-28 10:20', likeCount: 56, replyCount: 2, commentedAt: '2026-09-28 09:15' },
  { platform: 'xiaohongshu', accountId: '4', postTitle: '秋季护肤好物分享', commenter: '种草达人', content: '求链接求链接！', isReplied: true, replyContent: '评论区置顶有哦～', replyAccountId: '4', repliedAt: '2026-09-27 11:30', likeCount: 23, replyCount: 1, commentedAt: '2026-09-27 10:45' },
  { platform: 'xiaohongshu', accountId: '4', postTitle: '平价口红测评', commenter: '口红控', content: '03号色真的绝了，黄皮姐妹闭眼入！', isReplied: true, replyContent: '是的是的，我已经回购第二支了哈哈哈', replyAccountId: '4', repliedAt: '2026-09-25 16:40', likeCount: 89, replyCount: 3, commentedAt: '2026-09-25 15:20' },
  { platform: 'xiaohongshu', accountId: '4', postTitle: '平价口红测评', commenter: '美妆代购', content: '代购加微信 makeup_deal，全场5折免费领取小样！', likeCount: 2, replyCount: 0, commentedAt: '2026-09-24 18:00' },
  { platform: 'xiaohongshu', accountId: '5', postTitle: '夏日清爽妆容教程', commenter: '化妆小白', content: '请问粉底液是什么色号呀？', isReplied: true, replyContent: '用的是自然色哦，黄二白很合适～', replyAccountId: '5', repliedAt: '2026-09-26 14:30', likeCount: 31, replyCount: 1, commentedAt: '2026-09-26 13:10' },
  { platform: 'xiaohongshu', accountId: '5', postTitle: '夏日清爽妆容教程', commenter: '爱美的小仙女', content: '教程太棒了！跟着画了朋友们都说好看～', likeCount: 42, replyCount: 0, commentedAt: '2026-09-25 20:15' },
  { platform: 'xiaohongshu', accountId: '6', postTitle: '北欧风家居改造', commenter: '租房改造达人', content: '请问那个沙发在哪里买的呀？好喜欢！', likeCount: 27, replyCount: 0, commentedAt: '2026-09-28 16:40' },
  { platform: 'xiaohongshu', accountId: '6', postTitle: '小户型收纳技巧', commenter: '收纳控', content: '收纳盒链接有吗？求分享～', isReplied: true, replyContent: '已经放在主页店铺啦，去看看吧～', replyAccountId: '6', repliedAt: '2026-09-27 09:50', likeCount: 38, replyCount: 2, commentedAt: '2026-09-27 08:30' },
  { platform: 'xiaohongshu', accountId: '6', postTitle: '小户型收纳技巧', commenter: '居家小能手', content: '学会了！回家就整理起来', likeCount: 16, replyCount: 0, commentedAt: '2026-09-26 21:20' },
  // 微信视频号
  { platform: 'wechat', accountId: '7', postTitle: '职场沟通技巧', commenter: '职场小白', content: '受益匪浅，谢谢分享！请问有没有相关的书籍推荐呀', likeCount: 15, replyCount: 0, commentedAt: '2026-09-27 16:00' },
  { platform: 'wechat', accountId: '7', postTitle: '升职加薪秘诀', commenter: '努力搬砖', content: '请问刚入职的新人应该怎么规划职业发展呢', replyFailReason: 'need_mutual_follow', likeCount: 8, replyCount: 0, commentedAt: '2026-09-25 19:10' },
  { platform: 'wechat', accountId: '7', postTitle: '时间管理方法论', commenter: '效率达人', content: '番茄工作法真的好用，推荐大家试试！', likeCount: 22, replyCount: 0, commentedAt: '2026-09-28 10:30' },
  { platform: 'wechat', accountId: '7', postTitle: '简历优化指南', commenter: '求职者小李', content: '想请教一下转行简历怎么写比较好？', isReplied: true, replyContent: '转行简历重点突出可迁移技能和相关项目经验哦～', replyAccountId: '7', repliedAt: '2026-09-26 15:00', likeCount: 19, replyCount: 1, commentedAt: '2026-09-26 14:20' },
  { platform: 'wechat', accountId: '7', postTitle: '职场避坑指南', commenter: '招聘顾问王', content: '找工作的朋友加微信 job_helper，内推大厂岗位！', likeCount: 1, replyCount: 0, commentedAt: '2026-09-24 11:50' },
  { platform: 'wechat', accountId: '8', postTitle: '亲子阅读打卡', commenter: '宝妈小明', content: '请问适合3岁宝宝的绘本书单有吗？', isReplied: true, replyContent: '有的呢，我主页有整理好的书单～', replyAccountId: '8', repliedAt: '2026-09-28 14:15', likeCount: 34, replyCount: 2, commentedAt: '2026-09-28 13:00' },
  { platform: 'wechat', accountId: '8', postTitle: '辅食制作全攻略', commenter: '新手妈妈', content: '请问6个月宝宝第一口辅食吃什么比较好？', likeCount: 28, replyCount: 0, commentedAt: '2026-09-27 17:30' },
  { platform: 'wechat', accountId: '9', postTitle: '秋季养生食疗', commenter: '养生达人', content: '秋季润肺吃什么最好呢？求推荐', likeCount: 17, replyCount: 0, commentedAt: '2026-09-28 08:45' },
  { platform: 'wechat', accountId: '9', postTitle: '中医按摩穴位', commenter: '腰酸背痛党', content: '颈椎不好的人多揉揉哪个穴位呀？', isReplied: true, replyContent: '风池穴和肩井穴效果都不错～', replyAccountId: '9', repliedAt: '2026-09-27 19:40', likeCount: 41, replyCount: 1, commentedAt: '2026-09-27 18:20' },
  // B站
  { platform: 'bilibili', accountId: '10', postTitle: '最新旗舰手机对比评测', commenter: '程序员小王', content: 'up主能不能出一期续航详细测评啊，我特别关心续航表现', likeCount: 42, replyCount: 0, commentedAt: '2026-09-27 20:30' },
  { platform: 'bilibili', accountId: '10', postTitle: '程序员副业指南', commenter: '代码搬运工', content: 'UP主说的那个接单平台是什么呀，能私信发一下吗', isReplied: true, replyContent: '已经发你私信啦，注意查收～', replyAccountId: '10', repliedAt: '2026-09-26 15:20', likeCount: 31, replyCount: 1, commentedAt: '2026-09-26 14:00' },
  { platform: 'bilibili', accountId: '10', postTitle: '机械键盘入坑指南', commenter: '键盘爱好者', content: '请问HHKB值得入手吗？一直在纠结', likeCount: 25, replyCount: 0, commentedAt: '2026-09-25 23:10' },
  { platform: 'bilibili', accountId: '10', postTitle: '显示器选购攻略', commenter: '装机爱好者', content: '4K和2K日常使用差距大吗？', isReplied: true, replyContent: '写代码差距不大，看视频和修图差距明显～', replyAccountId: '10', repliedAt: '2026-09-24 12:30', likeCount: 37, replyCount: 1, commentedAt: '2026-09-24 11:00' },
  { platform: 'bilibili', accountId: '10', postTitle: '显卡性能排行', commenter: '矿卡贩子', content: '买显卡加微信 gpu_dealer，低价批发！', likeCount: 0, replyCount: 0, commentedAt: '2026-09-23 16:40' },
  { platform: 'bilibili', accountId: '11', postTitle: '年度最佳RPG游戏', commenter: '游戏玩家001', content: '这款游戏剧情真的神作！通关了还意犹未尽', likeCount: 58, replyCount: 0, commentedAt: '2026-09-28 19:20' },
  { platform: 'bilibili', accountId: '11', postTitle: '独立游戏推荐', commenter: '独立游戏爱好者', content: '推荐的几个都玩过了，质量真的高！', likeCount: 33, replyCount: 0, commentedAt: '2026-09-27 21:45' },
  { platform: 'bilibili', accountId: '11', postTitle: '电竞装备推荐', commenter: '上分选手', content: '请问鼠标用的是什么型号？', isReplied: true, replyContent: '用的是GPW二代，轻量无敌～', replyAccountId: '11', repliedAt: '2026-09-26 22:10', likeCount: 27, replyCount: 2, commentedAt: '2026-09-26 21:30' },
  { platform: 'bilibili', accountId: '12', postTitle: 'Python入门教程', commenter: '编程小白', content: '讲得太好了！终于搞懂循环是怎么回事了', likeCount: 72, replyCount: 0, commentedAt: '2026-09-28 11:30' },
  { platform: 'bilibili', accountId: '12', postTitle: '数据分析实战', commenter: '转行选手', content: '请问学完这个能找到数据分析的工作吗？', likeCount: 19, replyCount: 0, commentedAt: '2026-09-27 15:20' },
  { platform: 'bilibili', accountId: '12', postTitle: '机器学习基础', commenter: 'AI爱好者', content: '求推荐深度学习的入门书籍！', isReplied: true, replyContent: '花书和西瓜书都很经典，可以从花书开始～', replyAccountId: '12', repliedAt: '2026-09-25 13:40', likeCount: 44, replyCount: 3, commentedAt: '2026-09-25 12:10' },
  { platform: 'bilibili', accountId: '12', postTitle: '算法面试题精讲', commenter: '刷题狂人', content: 'UP主讲的思路太清晰了，比自己看书强多了', likeCount: 61, replyCount: 0, commentedAt: '2026-09-24 20:55' },
  // 补充更多评论，确保50+
  { platform: 'douyin', accountId: '1', postTitle: '天津美食打卡', commenter: '包子爱好者', content: '狗不理现在还值得去吗？听说都是游客去', likeCount: 14, replyCount: 0, commentedAt: '2026-09-24 13:25' },
  { platform: 'douyin', accountId: '2', postTitle: '杭州西湖游玩指南', commenter: '江南烟雨', content: '西湖真的太美了，春夏秋冬各有韵味', likeCount: 38, replyCount: 0, commentedAt: '2026-09-23 09:50' },
  { platform: 'xiaohongshu', accountId: '4', postTitle: '早C晚A护肤公式', commenter: '成分党', content: '请问A醇需要建立耐受吗？怎么建立？', isReplied: true, replyContent: '需要的哦，从低浓度开始，每周2-3次逐步增加～', replyAccountId: '4', repliedAt: '2026-09-23 20:00', likeCount: 47, replyCount: 2, commentedAt: '2026-09-23 18:30' },
  { platform: 'xiaohongshu', accountId: '5', postTitle: '伪素颜妆容', commenter: '学生党', content: '这个妆太自然了！上学画完全没问题', likeCount: 52, replyCount: 0, commentedAt: '2026-09-22 21:10' },
  { platform: 'wechat', accountId: '8', postTitle: '宝宝睡眠训练', commenter: '熬夜妈妈', content: '请问怎么让宝宝睡整觉啊？快熬不住了', likeCount: 26, replyCount: 0, commentedAt: '2026-09-28 02:30' },
  { platform: 'wechat', accountId: '9', postTitle: '运动健身入门', commenter: '健身小白', content: '请问新手去健身房应该从哪里开始练起？', isReplied: true, replyContent: '建议从固定器械开始，先学习正确动作模式～', replyAccountId: '9', repliedAt: '2026-09-27 10:30', likeCount: 21, replyCount: 1, commentedAt: '2026-09-27 09:15' },
  { platform: 'bilibili', accountId: '10', postTitle: '笔记本电脑推荐', commenter: '大学新生', content: '请问计算机专业买什么笔记本比较好？预算6000', likeCount: 35, replyCount: 0, commentedAt: '2026-09-22 14:40' },
  { platform: 'bilibili', accountId: '11', postTitle: '独立游戏推荐', commenter: '游戏推广号', content: '游戏推广加微信 game_promo，免费领取激活码！', likeCount: 1, replyCount: 0, commentedAt: '2026-09-22 10:20' },
  { platform: 'douyin', accountId: '3', postTitle: '智能家居入门', commenter: '科技控', content: '请问入门级智能家居套装有推荐吗？想先试试', isReplied: true, replyContent: '可以从智能灯和智能插座开始，成本低体验好～', replyAccountId: '3', repliedAt: '2026-09-28 16:00', likeCount: 20, replyCount: 1, commentedAt: '2026-09-28 14:50' },
  { platform: 'xiaohongshu', accountId: '6', postTitle: '绿植养护指南', commenter: '植物杀手', content: '我养什么死什么，有没有好养活的绿植推荐？', likeCount: 18, replyCount: 0, commentedAt: '2026-09-25 17:20' },
  { platform: 'wechat', accountId: '7', postTitle: '副业赚钱思路', commenter: '副业小白', content: '请问有什么适合上班族的副业吗？求带！', replyFailReason: 'frequency_limit', likeCount: 12, replyCount: 0, commentedAt: '2026-09-23 22:40' },
];

export const mockComments: CommentItem[] = commentContents.map((c, i) => ({
  id: `c${i + 1}`,
  platform: c.platform,
  accountId: c.accountId,
  postId: `p${i + 1}`,
  postTitle: c.postTitle,
  commenterNickname: c.commenter,
  commenterAvatarUrl: '',
  content: c.content,
  likeCount: c.likeCount,
  replyCount: c.replyCount,
  isReplied: !!c.isReplied,
  replyContent: c.replyContent,
  replyAccountId: c.replyAccountId,
  repliedAt: c.repliedAt,
  replyFailReason: c.replyFailReason,
  isSensitive: checkSensitive(c.content),
  status: 'active',
  commentedAt: c.commentedAt,
}));

// ==================== mockAutoCommentRules ====================
export const mockAutoCommentRules: AutoReplyRule[] = [
  {
    id: 'r1',
    ruleType: 'keyword',
    ruleName: '地址询问自动回复',
    platform: 'douyin',
    accountId: '1',
    keywords: ['地址', '在哪里', '位置', '怎么走'],
    matchMode: 'contains',
    replyContent: '您好～店铺地址在成都市锦江区春熙路，导航搜索「辣味天堂」即可找到！{表情}',
    replyType: 'text',
    priority: 1,
    isEnabled: true,
    hitCount: 156,
    createdAt: '2026-09-01 10:00',
  },
  {
    id: 'r2',
    ruleType: 'keyword',
    ruleName: '价格询问回复',
    platform: 'douyin',
    accountId: '1',
    keywords: ['多少钱', '价格', '人均', '费用'],
    matchMode: 'contains',
    replyContent: '人均大概80-120元哦，看个人食量～性价比很高的！',
    replyType: 'text',
    priority: 2,
    isEnabled: true,
    hitCount: 98,
    createdAt: '2026-09-02 14:30',
  },
  {
    id: 'r3',
    ruleType: 'keyword',
    ruleName: '链接索要回复',
    platform: 'xiaohongshu',
    accountId: '4',
    keywords: ['链接', '求链接', '在哪买', '购买'],
    matchMode: 'contains',
    replyContent: '宝贝链接在我的小红书主页店铺里哦～点击头像进入查看{表情}',
    replyType: 'text',
    priority: 1,
    isEnabled: true,
    hitCount: 234,
    createdAt: '2026-09-03 09:00',
  },
  {
    id: 'r4',
    ruleType: 'keyword',
    ruleName: '敏感肌护肤咨询',
    platform: 'xiaohongshu',
    accountId: '4',
    keywords: ['敏感肌', '泛红', '过敏'],
    matchMode: 'contains',
    replyContent: '敏感肌建议先在耳后试用哦，我自己是混敏皮，用着完全没问题～',
    replyType: 'text',
    priority: 3,
    isEnabled: false,
    hitCount: 45,
    createdAt: '2026-09-05 16:20',
  },
  {
    id: 'r5',
    ruleType: 'keyword',
    ruleName: 'B站立意三连求',
    platform: 'bilibili',
    accountId: '12',
    keywords: ['三连', '点赞', '支持'],
    matchMode: 'fuzzy',
    replyContent: '感谢支持！觉得有用的话别忘了三连哦～{表情}',
    replyType: 'text',
    priority: 5,
    isEnabled: true,
    hitCount: 312,
    createdAt: '2026-09-08 11:00',
  },
  {
    id: 'r6',
    ruleType: 'welcome',
    ruleName: '新粉丝欢迎语',
    platform: 'wechat',
    accountId: '7',
    keywords: [],
    matchMode: 'contains',
    replyContent: '感谢关注！我是职场成长笔记，每周分享职场干货～',
    replyType: 'text',
    priority: 10,
    isEnabled: true,
    hitCount: 89,
    createdAt: '2026-09-10 08:00',
  },
];

// ==================== mockSessions ====================
const sessionData: Array<{
  platform: PlatformType;
  accountId: string;
  nickname: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  isPinned?: boolean;
}> = [
  { platform: 'douyin', accountId: '1', nickname: '小美食家', lastMessage: '这家店看着好好吃啊，求具体地址！', lastMessageAt: '2026-09-28 15:30', unreadCount: 2, isPinned: true },
  { platform: 'xiaohongshu', accountId: '4', nickname: '精致生活家', lastMessage: '第一款面霜我也在用，真的超补水！', lastMessageAt: '2026-09-28 10:15', unreadCount: 1, isPinned: true },
  { platform: 'douyin', accountId: '2', nickname: '旅行爱好者', lastMessage: '请问洱海附近有推荐的民宿吗', lastMessageAt: '2026-09-28 09:45', unreadCount: 0 },
  { platform: 'wechat', accountId: '7', nickname: '职场小白', lastMessage: '受益匪浅，谢谢分享！', lastMessageAt: '2026-09-27 16:00', unreadCount: 0 },
  { platform: 'bilibili', accountId: '10', nickname: '程序员小王', lastMessage: 'up主能不能出一期续航详细测评啊', lastMessageAt: '2026-09-27 20:30', unreadCount: 3 },
  { platform: 'xiaohongshu', accountId: '5', nickname: '化妆小白', lastMessage: '请问粉底液是什么色号呀？', lastMessageAt: '2026-09-26 13:10', unreadCount: 0 },
  { platform: 'douyin', accountId: '3', nickname: '参数党', lastMessage: '请问骁龙版和天玑版哪个续航更好？', lastMessageAt: '2026-09-28 10:05', unreadCount: 1 },
  { platform: 'wechat', accountId: '8', nickname: '宝妈小明', lastMessage: '请问适合3岁宝宝的绘本书单有吗？', lastMessageAt: '2026-09-28 13:00', unreadCount: 2 },
  { platform: 'bilibili', accountId: '12', nickname: '编程小白', lastMessage: '讲得太好了！终于搞懂循环了', lastMessageAt: '2026-09-28 11:30', unreadCount: 0 },
  { platform: 'xiaohongshu', accountId: '6', nickname: '租房改造达人', lastMessage: '请问那个沙发在哪里买的呀？', lastMessageAt: '2026-09-28 16:40', unreadCount: 5 },
  { platform: 'douyin', accountId: '1', nickname: '吃货张三', lastMessage: '去过了，真的超辣！', lastMessageAt: '2026-09-28 14:45', unreadCount: 0 },
  { platform: 'wechat', accountId: '9', nickname: '养生达人', lastMessage: '秋季润肺吃什么最好呢？', lastMessageAt: '2026-09-28 08:45', unreadCount: 1 },
  { platform: 'bilibili', accountId: '11', nickname: '游戏玩家001', lastMessage: '这款游戏剧情真的神作！', lastMessageAt: '2026-09-28 19:20', unreadCount: 4 },
  { platform: 'xiaohongshu', accountId: '4', nickname: '口红控', lastMessage: '03号色真的绝了，黄皮姐妹闭眼入！', lastMessageAt: '2026-09-25 15:20', unreadCount: 0 },
  { platform: 'douyin', accountId: '2', nickname: '自由行者', lastMessage: '请问去西藏需要准备什么？', lastMessageAt: '2026-09-24 14:20', unreadCount: 0 },
  { platform: 'wechat', accountId: '7', nickname: '效率达人', lastMessage: '番茄工作法真的好用', lastMessageAt: '2026-09-28 10:30', unreadCount: 0 },
  { platform: 'bilibili', accountId: '10', nickname: '键盘爱好者', lastMessage: '请问HHKB值得入手吗？', lastMessageAt: '2026-09-25 23:10', unreadCount: 1 },
  { platform: 'xiaohongshu', accountId: '5', nickname: '爱美的小仙女', lastMessage: '教程太棒了！跟着画了朋友们都说好看', lastMessageAt: '2026-09-25 20:15', unreadCount: 0 },
  { platform: 'douyin', accountId: '3', nickname: '音质发烧友', lastMessage: '降噪效果最好的是哪款？', lastMessageAt: '2026-09-27 22:30', unreadCount: 2 },
  { platform: 'wechat', accountId: '8', nickname: '新手妈妈', lastMessage: '请问6个月宝宝第一口辅食吃什么？', lastMessageAt: '2026-09-27 17:30', unreadCount: 3 },
  { platform: 'bilibili', accountId: '12', nickname: '转行选手', lastMessage: '请问学完这个能找到数据分析的工作吗？', lastMessageAt: '2026-09-27 15:20', unreadCount: 1 },
  { platform: 'xiaohongshu', accountId: '6', nickname: '收纳控', lastMessage: '收纳盒链接有吗？求分享～', lastMessageAt: '2026-09-27 08:30', unreadCount: 0 },
];

export const mockSessions: MessageSession[] = sessionData.map((s, i) => ({
  id: `s${i + 1}`,
  platform: s.platform,
  accountId: s.accountId,
  sessionPlatformId: `sid_${i + 100}`,
  userNickname: s.nickname,
  userAvatarUrl: '',
  lastMessage: s.lastMessage,
  lastMessageAt: s.lastMessageAt,
  unreadCount: s.unreadCount,
  isPinned: !!s.isPinned,
  status: 'active',
}));

// ==================== generateSessionMessages ====================
const messageTemplates = [
  { direction: 'inbound' as const, content: '你好呀，请问一下你们家的产品怎么买呀？' },
  { direction: 'outbound' as const, content: '您好呀～感谢关注！具体可以看我主页的介绍哦' },
  { direction: 'inbound' as const, content: '好的，我去看看～还有个问题想请教一下' },
  { direction: 'outbound' as const, content: '您说，能帮到的我一定帮{表情}' },
  { direction: 'inbound' as const, content: '请问敏感肌可以用吗？我皮肤比较容易过敏' },
  { direction: 'outbound' as const, content: '可以的呢，成分很温和，我闺蜜也是敏感肌用着没问题' },
  { direction: 'inbound' as const, content: '太好了！那我先下单试试，谢谢啦～' },
  { direction: 'outbound' as const, content: '不客气～有任何问题随时来找我哦！祝您购物愉快' },
  { direction: 'inbound' as const, content: '在吗在吗？有个急事想问问' },
  { direction: 'outbound' as const, content: '在的，您请说～' },
  { direction: 'inbound' as const, content: '请问这个活动什么时候结束呀？' },
  { direction: 'outbound' as const, content: '活动到本月底结束哦，需要的话尽快下单哈' },
];

export function generateSessionMessages(sessionId: string, count: number): MessageItem[] {
  const result: MessageItem[] = [];
  const baseHour = 9;
  for (let i = 0; i < Math.min(count, messageTemplates.length); i++) {
    const tmpl = messageTemplates[i];
    const hour = baseHour + Math.floor(i / 2);
    const minute = (i * 13) % 60;
    result.push({
      id: `${sessionId}-m${i + 1}`,
      sessionId,
      direction: tmpl.direction,
      msgType: 'text',
      content: tmpl.content,
      senderAccountId: tmpl.direction === 'outbound' ? '1' : undefined,
      isRead: i < Math.min(count, messageTemplates.length) - 1,
      sentAt: `2026-09-28 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    });
  }
  return result;
}

// ==================== quickReplyGroups ====================
export const quickReplyGroups: Record<string, QuickReply[]> = {
  '问候语': [
    { id: 'qr1', category: '问候语', title: '欢迎语', content: '您好呀～感谢关注！有什么可以帮您的？{表情}', sortOrder: 1 },
    { id: 'qr2', category: '问候语', title: '早上好', content: '早上好～新的一天也要元气满满哦！', sortOrder: 2 },
    { id: 'qr3', category: '问候语', title: '晚安', content: '晚安啦～祝您有个好梦！', sortOrder: 3 },
    { id: 'qr4', category: '问候语', title: '节日问候', content: '节日快乐！感谢您一直以来的支持～', sortOrder: 4 },
    { id: 'qr5', category: '问候语', title: '感谢关注', content: '感谢您的关注！后续会分享更多优质内容，请多指教～', sortOrder: 5 },
  ],
  '产品咨询': [
    { id: 'qr6', category: '产品咨询', title: '价格说明', content: '亲，价格在商品详情页有标注哦，活动期间有优惠～', sortOrder: 1 },
    { id: 'qr7', category: '产品咨询', title: '发货时间', content: '下单后48小时内发货，快递一般3-5天到～', sortOrder: 2 },
    { id: 'qr8', category: '产品咨询', title: '退换货政策', content: '支持7天无理由退换哦，质量问题包运费～', sortOrder: 3 },
    { id: 'qr9', category: '产品咨询', title: '尺码建议', content: '建议按平时穿的尺码选，具体可以参考尺码表哦～', sortOrder: 4 },
    { id: 'qr10', category: '产品咨询', title: '成分说明', content: '成分都是经过检测的，温和不刺激，敏感肌也可以用～', sortOrder: 5 },
    { id: 'qr11', category: '产品咨询', title: '使用方法', content: '使用方法很简单的，清洁后取适量均匀涂抹即可～', sortOrder: 6 },
  ],
  '售后服务': [
    { id: 'qr12', category: '售后服务', title: '物流查询', content: '您的快递已发出，预计3天左右送达，单号已私信您～', sortOrder: 1 },
    { id: 'qr13', category: '售后服务', title: '售后申请', content: '有任何问题都可以联系我们的客服处理哦，一定给您满意的答复！', sortOrder: 2 },
    { id: 'qr14', category: '售后服务', title: '退款进度', content: '退款已提交，预计3-5个工作日原路退回，请留意账户消息～', sortOrder: 3 },
    { id: 'qr15', category: '售后服务', title: '差评安抚', content: '非常抱歉给您带来不好的体验，您的问题我们非常重视，方便私信说下具体情况吗？', sortOrder: 4 },
    { id: 'qr16', category: '售后服务', title: '问题反馈', content: '感谢您的反馈！您的建议对我们很重要，已记录并会认真改进～', sortOrder: 5 },
  ],
  '互动话术': [
    { id: 'qr17', category: '互动话术', title: '求关注', content: '喜欢的话记得点关注哦，后续更多精彩内容等着你～', sortOrder: 1 },
    { id: 'qr18', category: '互动话术', title: '求点赞', content: '觉得有用的话点个赞支持一下吧～你的支持是我更新的动力！', sortOrder: 2 },
    { id: 'qr19', category: '互动话术', title: '引导私信', content: '有什么问题可以私信我哦，看到都会回复的～', sortOrder: 3 },
    { id: 'qr20', category: '互动话术', title: '感谢支持', content: '感谢支持！你的鼓励是我最大的动力，会继续努力的！', sortOrder: 4 },
    { id: 'qr21', category: '互动话术', title: '评论回复', content: '感谢你的评论～说得太对了！', sortOrder: 5 },
    { id: 'qr22', category: '互动话术', title: '答疑结尾', content: '以上就是我的回答啦，还有其他问题随时问我～', sortOrder: 6 },
    { id: 'qr23', category: '互动话术', title: '邀约互动', content: '大家觉得怎么样呢？欢迎在评论区留言讨论～', sortOrder: 7 },
  ],
  '默认分组': [
    { id: 'qr24', category: '默认分组', title: '收到', content: '好的，收到～', sortOrder: 1 },
    { id: 'qr25', category: '默认分组', title: '稍等', content: '稍等一下哦，我去确认一下马上回复您～', sortOrder: 2 },
    { id: 'qr26', category: '默认分组', title: '好的', content: '好的呢，没问题～', sortOrder: 3 },
    { id: 'qr27', category: '默认分组', title: '谢谢', content: '谢谢支持！', sortOrder: 4 },
    { id: 'qr28', category: '默认分组', title: '不客气', content: '不客气～能帮到你就好！', sortOrder: 5 },
  ],
  '活动通知': [
    { id: 'qr29', category: '活动通知', title: '活动预告', content: '好消息！本周末有专属活动，关注我第一时间获取福利～', sortOrder: 1 },
    { id: 'qr30', category: '活动通知', title: '限时优惠', content: '限时优惠进行中，不要错过哦！活动截止到本月底～', sortOrder: 2 },
    { id: 'qr31', category: '活动通知', title: '粉丝福利', content: '粉丝专属福利来了！私信我领取专属优惠券～', sortOrder: 3 },
    { id: 'qr32', category: '活动通知', title: '抽奖通知', content: '参与活动即有机会抽奖哦，奖品丰厚，快来参加吧！', sortOrder: 4 },
  ],
};

// ==================== mockAutoMessageTasks ====================
export const mockAutoMessageTasks: AutoMessageTask[] = [
  {
    id: 't1',
    taskName: '新粉丝欢迎礼',
    senderAccountId: '1',
    senderAccountNickname: '美食探店小队',
    msgType: 'text',
    content: '感谢关注！回复【地址】获取最新店铺地址，回复【菜单】查看招牌菜品～',
    totalCount: 520,
    successCount: 498,
    failCount: 22,
    status: 'running',
    frequencyLimitHour: 120,
    frequencyLimitDay: 800,
    minIntervalSeconds: 20,
    maxIntervalSeconds: 60,
    startedAt: '2026-09-25 09:00',
    createdAt: '2026-09-24 18:00',
  },
  {
    id: 't2',
    taskName: 'VIP粉丝专属福利',
    senderAccountId: '4',
    senderAccountNickname: '生活种草日记',
    msgType: 'link',
    content: '亲爱的VIP粉丝，专属福利链接已送达，点击查看详情～',
    linkTitle: 'VIP专属福利',
    linkUrl: 'https://example.com/vip',
    totalCount: 320,
    successCount: 300,
    failCount: 20,
    status: 'running',
    frequencyLimitHour: 80,
    frequencyLimitDay: 500,
    minIntervalSeconds: 30,
    maxIntervalSeconds: 90,
    startedAt: '2026-09-27 10:00',
    createdAt: '2026-09-26 14:30',
  },
  {
    id: 't3',
    taskName: '新品上市通知',
    senderAccountId: '5',
    senderAccountNickname: '美妆小课堂',
    msgType: 'image',
    content: '新品上市！限时优惠，点击查看～',
    mediaUrl: '',
    totalCount: 1200,
    successCount: 856,
    failCount: 44,
    status: 'paused',
    frequencyLimitHour: 100,
    frequencyLimitDay: 600,
    minIntervalSeconds: 25,
    maxIntervalSeconds: 75,
    startedAt: '2026-09-26 08:00',
    createdAt: '2026-09-25 20:00',
  },
  {
    id: 't4',
    taskName: '节日祝福',
    senderAccountId: '10',
    senderAccountNickname: '科技宅频道',
    msgType: 'text',
    content: '中秋快乐！感谢一路的支持与陪伴～',
    totalCount: 2800,
    successCount: 2688,
    failCount: 112,
    status: 'completed',
    frequencyLimitHour: 200,
    frequencyLimitDay: 1500,
    minIntervalSeconds: 10,
    maxIntervalSeconds: 30,
    startedAt: '2026-09-17 08:00',
    completedAt: '2026-09-17 22:00',
    createdAt: '2026-09-16 10:00',
  },
  {
    id: 't5',
    taskName: '课程推广',
    senderAccountId: '12',
    senderAccountNickname: '知识共享家',
    msgType: 'article',
    content: 'Python数据分析实战课程限时优惠中，系统学习快速上手！',
    totalCount: 600,
    successCount: 0,
    failCount: 0,
    status: 'draft',
    frequencyLimitHour: 60,
    frequencyLimitDay: 400,
    minIntervalSeconds: 40,
    maxIntervalSeconds: 120,
    createdAt: '2026-09-28 10:00',
  },
  {
    id: 't6',
    taskName: '粉丝回访',
    senderAccountId: '7',
    senderAccountNickname: '职场成长笔记',
    msgType: 'text',
    content: 'Hi～最近工作还顺利吗？有什么职场困惑可以随时和我聊聊哦',
    totalCount: 450,
    successCount: 180,
    failCount: 15,
    status: 'stopped',
    frequencyLimitHour: 50,
    frequencyLimitDay: 300,
    minIntervalSeconds: 45,
    maxIntervalSeconds: 90,
    startedAt: '2026-09-20 09:00',
    createdAt: '2026-09-19 16:00',
  },
  {
    id: 't7',
    taskName: '直播间预告',
    senderAccountId: '2',
    senderAccountNickname: '旅行日记',
    msgType: 'text',
    content: '今晚8点直播！带你云游大理，点击预约不迷路～',
    totalCount: 890,
    successCount: 854,
    failCount: 36,
    status: 'completed',
    frequencyLimitHour: 150,
    frequencyLimitDay: 1000,
    minIntervalSeconds: 15,
    maxIntervalSeconds: 45,
    startedAt: '2026-09-27 14:00',
    completedAt: '2026-09-27 20:00',
    createdAt: '2026-09-26 12:00',
  },
  {
    id: 't8',
    taskName: '老粉回馈',
    senderAccountId: '11',
    senderAccountNickname: '游戏空间站',
    msgType: 'image',
    content: '感谢老粉一路支持！专属兑换码：OLD_FAN_666',
    totalCount: 350,
    successCount: 120,
    failCount: 8,
    status: 'running',
    frequencyLimitHour: 40,
    frequencyLimitDay: 200,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    startedAt: '2026-09-28 08:00',
    createdAt: '2026-09-27 22:00',
  },
];

// ==================== mockAutoMsgTaskItems ====================
export const mockAutoMsgTaskItems: AutoMessageTaskItem[] = []; // 页面内动态生成

// ==================== mockFollowers ====================
const followerFirstNames = ['小', '大', '老', '阿', '超级', '快乐', '阳光', '温柔', '可爱', '努力', '梦想', '自由', '幸福', '甜蜜', '安静'];
const followerLastNames = ['美食家', '旅行家', '摄影师', '设计师', '程序员', '博主', '达人', '小仙女', '小哥哥', '小姐姐', '同学', '老师', '朋友', '宝贝', '达人', '少年', '少女', '王', '李', '张'];
const tagsPool = ['活跃粉丝', 'VIP粉丝', '高价值', '新粉丝', '沉默粉丝', '互动达人', '评论达人', '点赞狂魔', '转化用户', '潜在客户'];
const groupsPool = ['VIP粉丝', '活跃群', '默认分组'];
const genders = ['男', '女'];
const locations = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '西安', '南京', '重庆', '苏州', '长沙', '郑州', '青岛', '厦门'];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const followerList: FollowerRecord[] = [];
const platforms: PlatformType[] = ['douyin', 'xiaohongshu', 'wechat', 'bilibili'];
const accountIdsByPlatform: Record<PlatformType, string[]> = {
  douyin: ['1', '2', '3'],
  xiaohongshu: ['4', '5', '6'],
  wechat: ['7', '8', '9'],
  bilibili: ['10', '11', '12'],
};

for (let i = 0; i < 100; i++) {
  const platform = platforms[i % 4];
  const accountIds = accountIdsByPlatform[platform];
  const accountId = accountIds[i % 3];
  const firstName = followerFirstNames[i % followerFirstNames.length];
  const lastName = followerLastNames[Math.floor(i / followerFirstNames.length) % followerLastNames.length];
  const nickname = `${firstName}${lastName}${i + 1}`;
  const day = 28 - Math.floor(i / 5);
  const hour = 8 + (i * 3) % 12;
  const minute = (i * 7) % 60;
  const numTags = Math.floor(Math.random() * 3) + 1;
  const followerTags = pickRandom(tagsPool, numTags);

  followerList.push({
    id: `f${i + 1}`,
    platform,
    accountId,
    followerPlatformId: `uid_${10000 + i}`,
    nickname,
    avatarUrl: '',
    followedAt: `2026-09-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    isMutual: i % 4 === 0,
    isPrivate: i % 7 === 0,
    tags: followerTags,
    remark: i % 10 === 0 ? `重要客户${i}` : '',
    groupName: groupsPool[i % 3],
    gender: genders[i % 2],
    location: locations[i % locations.length],
    status: 'active',
  });
}

export const mockFollowers: FollowerRecord[] = followerList;

export const allFollowerTags: string[] = tagsPool;

// ==================== followerProfileStats ====================
export const followerProfileStats = {
  gender: [
    { name: '女性', value: 58 },
    { name: '男性', value: 42 },
  ],
  age: [
    { name: '18-24岁', value: 25 },
    { name: '25-30岁', value: 38 },
    { name: '31-40岁', value: 24 },
    { name: '41岁以上', value: 13 },
  ],
  locationTop10: [
    { name: '广东', value: 158 },
    { name: '浙江', value: 132 },
    { name: '江苏', value: 118 },
    { name: '北京', value: 95 },
    { name: '上海', value: 88 },
    { name: '四川', value: 72 },
    { name: '湖北', value: 65 },
    { name: '福建', value: 58 },
    { name: '山东', value: 52 },
    { name: '河南', value: 48 },
  ],
  source: [
    { name: '自然关注', value: 45 },
    { name: '视频推荐', value: 28 },
    { name: '评论引流', value: 15 },
    { name: '互相关注', value: 7 },
    { name: '其他', value: 5 },
  ],
};

// ==================== mockMonitorTasks ====================
export const mockMonitorTasks: MonitorTask[] = [
  {
    id: 'mt1',
    taskName: '新粉丝自动欢迎',
    monitorType: 'new_follower',
    monitoredAccountIds: ['1', '2'],
    keywords: [],
    matchMode: 'contains',
    actionType: 'reply_message',
    actionAccountId: '1',
    actionContent: '感谢关注！我是美食探店小队，回复【地址】获取最新店铺地址～',
    actionMediaType: 'text',
    actionDelaySeconds: 60,
    isEnabled: true,
    hitCount: 234,
    frequencyLimitHour: 120,
    frequencyLimitDay: 800,
    minIntervalSeconds: 20,
    maxIntervalSeconds: 60,
    createdAt: '2026-09-01 10:00',
  },
  {
    id: 'mt2',
    taskName: '私信价格关键词监控',
    monitorType: 'message_keyword',
    monitoredAccountIds: ['4', '5'],
    keywords: ['价格', '多少钱', '优惠', '折扣', '怎么买', '链接'],
    matchMode: 'contains',
    actionType: 'reply_message',
    actionAccountId: '4',
    actionContent: '亲，价格在商品详情页有标注哦，活动期间有优惠～点击主页店铺查看',
    actionMediaType: 'text',
    actionDelaySeconds: 120,
    isEnabled: true,
    hitCount: 156,
    frequencyLimitHour: 60,
    frequencyLimitDay: 500,
    minIntervalSeconds: 30,
    maxIntervalSeconds: 90,
    createdAt: '2026-09-05 14:30',
  },
  {
    id: 'mt3',
    taskName: '评论地址关键词监控',
    monitorType: 'comment_keyword',
    monitoredAccountIds: ['1'],
    keywords: ['地址', '在哪里', '位置', '怎么走', '导航'],
    matchMode: 'contains',
    actionType: 'reply_comment',
    actionAccountId: '1',
    actionContent: '您好～店铺地址在成都市锦江区春熙路，导航搜索「辣味天堂」即可找到！',
    actionMediaType: 'text',
    actionDelaySeconds: 300,
    isEnabled: true,
    hitCount: 98,
    frequencyLimitHour: 30,
    frequencyLimitDay: 200,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    createdAt: '2026-09-08 09:00',
  },
  {
    id: 'mt4',
    taskName: 'B站新粉丝欢迎',
    monitorType: 'new_follower',
    monitoredAccountIds: ['10', '12'],
    keywords: [],
    matchMode: 'contains',
    actionType: 'reply_message',
    actionAccountId: '10',
    actionContent: '感谢关注！我是科技宅频道，每周更新数码测评和技术干货～',
    actionMediaType: 'text',
    actionDelaySeconds: 300,
    isEnabled: true,
    hitCount: 187,
    frequencyLimitHour: 80,
    frequencyLimitDay: 600,
    minIntervalSeconds: 40,
    maxIntervalSeconds: 120,
    createdAt: '2026-09-10 16:00',
  },
  {
    id: 'mt5',
    taskName: '视频号求职关键词',
    monitorType: 'message_keyword',
    monitoredAccountIds: ['7'],
    keywords: ['求职', '找工作', '内推', '简历', '面试'],
    matchMode: 'contains',
    actionType: 'reply_message',
    actionAccountId: '7',
    actionContent: '您好呀～求职相关的内容可以看我主页的「职场系列」合集，有简历优化和面试技巧的干货哦！',
    actionMediaType: 'text',
    actionDelaySeconds: 180,
    isEnabled: false,
    hitCount: 45,
    frequencyLimitHour: 40,
    frequencyLimitDay: 300,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    createdAt: '2026-09-12 11:00',
  },
  {
    id: 'mt6',
    taskName: '评论敏感词监控',
    monitorType: 'comment_keyword',
    monitoredAccountIds: ['1', '4', '10'],
    keywords: sensitiveWords.slice(0, 8),
    matchMode: 'contains',
    actionType: 'reply_comment',
    actionAccountId: '1',
    actionContent: '',
    actionMediaType: 'text',
    actionDelaySeconds: 0,
    isEnabled: true,
    hitCount: 23,
    frequencyLimitHour: 100,
    frequencyLimitDay: 800,
    minIntervalSeconds: 10,
    maxIntervalSeconds: 30,
    createdAt: '2026-09-15 08:00',
  },
  {
    id: 'mt7',
    taskName: '小红书新粉欢迎',
    monitorType: 'new_follower',
    monitoredAccountIds: ['4', '5', '6'],
    keywords: [],
    matchMode: 'contains',
    actionType: 'reply_message',
    actionAccountId: '4',
    actionContent: '谢谢关注呀～我是生活种草日记，分享美妆穿搭和家居好物，有问题随时私信我哦！',
    actionMediaType: 'text',
    actionDelaySeconds: 120,
    isEnabled: true,
    hitCount: 312,
    frequencyLimitHour: 100,
    frequencyLimitDay: 700,
    minIntervalSeconds: 25,
    maxIntervalSeconds: 75,
    createdAt: '2026-09-03 12:00',
  },
];

// ==================== mockMonitorHitRecords ====================
const hitTemplate: Array<{
  taskId: string;
  taskName: string;
  monitorType: MonitorTask['monitorType'];
  triggeredAccountId: string;
  hitKeyword?: string;
  targetNickname: string;
  sourceContent?: string;
  actionStatus: 'pending' | 'success' | 'failed';
  actionFailReason?: string;
  createdAt: string;
  executedAt?: string;
}> = [
  { taskId: 'mt1', taskName: '新粉丝自动欢迎', monitorType: 'new_follower', triggeredAccountId: '1', targetNickname: '美食新人', actionStatus: 'success', createdAt: '2026-09-28 15:30', executedAt: '2026-09-28 15:31' },
  { taskId: 'mt2', taskName: '私信价格关键词监控', monitorType: 'message_keyword', triggeredAccountId: '4', hitKeyword: '价格', targetNickname: '购物达人', sourceContent: '请问这个产品价格是多少呀？', actionStatus: 'success', createdAt: '2026-09-28 14:20', executedAt: '2026-09-28 14:22' },
  { taskId: 'mt3', taskName: '评论地址关键词监控', monitorType: 'comment_keyword', triggeredAccountId: '1', hitKeyword: '地址', targetNickname: '小美食家', sourceContent: '这家店看着好好吃啊，求具体地址！', actionStatus: 'success', createdAt: '2026-09-28 15:35', executedAt: '2026-09-28 15:40' },
  { taskId: 'mt4', taskName: 'B站新粉丝欢迎', monitorType: 'new_follower', triggeredAccountId: '10', targetNickname: '数码新粉', actionStatus: 'success', createdAt: '2026-09-28 13:45', executedAt: '2026-09-28 13:50' },
  { taskId: 'mt2', taskName: '私信价格关键词监控', monitorType: 'message_keyword', triggeredAccountId: '5', hitKeyword: '优惠', targetNickname: '省钱小能手', sourceContent: '最近有没有什么优惠活动呀？', actionStatus: 'success', createdAt: '2026-09-28 12:10', executedAt: '2026-09-28 12:12' },
  { taskId: 'mt7', taskName: '小红书新粉欢迎', monitorType: 'new_follower', triggeredAccountId: '4', targetNickname: '种草新人', actionStatus: 'failed', actionFailReason: 'frequency_limit', createdAt: '2026-09-28 11:30' },
  { taskId: 'mt6', taskName: '评论敏感词监控', monitorType: 'comment_keyword', triggeredAccountId: '1', hitKeyword: '加微信', targetNickname: '推广账号01', sourceContent: '合作加微信 xxx123', actionStatus: 'pending', createdAt: '2026-09-28 10:45' },
  { taskId: 'mt3', taskName: '评论地址关键词监控', monitorType: 'comment_keyword', triggeredAccountId: '1', hitKeyword: '在哪里', targetNickname: '路痴一枚', sourceContent: '请问具体在哪里呀？找不到', actionStatus: 'success', createdAt: '2026-09-28 09:20', executedAt: '2026-09-28 09:25' },
  { taskId: 'mt1', taskName: '新粉丝自动欢迎', monitorType: 'new_follower', triggeredAccountId: '2', targetNickname: '旅行爱好者007', actionStatus: 'success', createdAt: '2026-09-28 08:55', executedAt: '2026-09-28 08:56' },
  { taskId: 'mt4', taskName: 'B站新粉丝欢迎', monitorType: 'new_follower', triggeredAccountId: '12', targetNickname: '编程小白', actionStatus: 'success', createdAt: '2026-09-27 22:15', executedAt: '2026-09-27 22:20' },
  { taskId: 'mt2', taskName: '私信价格关键词监控', monitorType: 'message_keyword', triggeredAccountId: '4', hitKeyword: '链接', targetNickname: '剁手党', sourceContent: '购买链接有吗？发一下', actionStatus: 'failed', actionFailReason: 'content_blocked', createdAt: '2026-09-27 20:30' },
  { taskId: 'mt7', taskName: '小红书新粉欢迎', monitorType: 'new_follower', triggeredAccountId: '5', targetNickname: '美妆小白', actionStatus: 'success', createdAt: '2026-09-27 18:40', executedAt: '2026-09-27 18:42' },
  { taskId: 'mt6', taskName: '评论敏感词监控', monitorType: 'comment_keyword', triggeredAccountId: '4', hitKeyword: '免费领取', targetNickname: '羊毛党', sourceContent: '免费领取小样加微信...', actionStatus: 'pending', createdAt: '2026-09-27 16:25' },
  { taskId: 'mt3', taskName: '评论地址关键词监控', monitorType: 'comment_keyword', triggeredAccountId: '1', hitKeyword: '位置', targetNickname: '游客小王', sourceContent: '位置在哪呀？下周过去玩', actionStatus: 'success', createdAt: '2026-09-27 14:10', executedAt: '2026-09-27 14:15' },
  { taskId: 'mt1', taskName: '新粉丝自动欢迎', monitorType: 'new_follower', triggeredAccountId: '1', targetNickname: '吃货新星', actionStatus: 'success', createdAt: '2026-09-27 11:30', executedAt: '2026-09-27 11:31' },
];

export const mockMonitorHitRecords: MonitorHitRecord[] = hitTemplate.map((h, i) => ({
  id: `mhr${i + 1}`,
  taskId: h.taskId,
  taskName: h.taskName,
  monitorType: h.monitorType,
  triggeredAccountId: h.triggeredAccountId,
  hitKeyword: h.hitKeyword,
  targetUserPlatformId: `target_${i + 100}`,
  targetUserNickname: h.targetNickname,
  targetUserAvatarUrl: '',
  sourceContent: h.sourceContent,
  actionType: h.monitorType === 'comment_keyword' ? 'reply_comment' : 'reply_message',
  actionStatus: h.actionStatus,
  actionFailReason: h.actionFailReason,
  createdAt: h.createdAt,
  executedAt: h.executedAt,
}));

// ==================== groupList ====================
export interface MockGroup {
  id: string;
  groupName: string;
}

export const groupList: MockGroup[] = [
  { id: 'g_food', groupName: '美食组' },
  { id: 'g_life', groupName: '生活组' },
  { id: 'g_tech', groupName: '科技组' },
];

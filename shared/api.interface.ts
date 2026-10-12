export type PlatformType = 'douyin' | 'xiaohongshu' | 'wechat' | 'bilibili';

export type VipStatus = 'inactive' | 'active' | 'expired';

export type UserStatus = 'active' | 'disabled';

export interface AppUser {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  nickname?: string;
  avatarUrl?: string;
  vipPlanId?: string;
  vipPlanName?: string;
  vipExpiresAt?: string;
  vipStatus: VipStatus;
  maxAccounts: number;
  status: UserStatus;
  lastLoginAt?: string;
  createdAt: string;
}

export interface VipPlan {
  id: string;
  name: string;
  code: string;
  durationDays: number;
  maxAccounts: number;
  price: string;
  description?: string;
  status: string;
  sortOrder: number;
}

export interface ActivationCode {
  id: string;
  code: string;
  planId: string;
  planName?: string;
  durationDays: number;
  maxAccounts: number;
  status: 'unused' | 'used' | 'disabled';
  userId?: string;
  username?: string;
  activatedAt?: string;
  batchNo?: string;
  remark?: string;
  createdAt: string;
}

export interface PlatformAccount {
  id: string;
  platform: PlatformType;
  platformUserId?: string;
  nickname?: string;
  avatarUrl?: string;
  accountRemark?: string;
  groupName?: string;
  tags?: string[];
  authStatus: 'pending' | 'authorized' | 'expired' | 'error';
  authExpiresAt?: string;
  followersCount: number;
  followingCount: number;
  likesCount: number;
  postsCount: number;
  healthStatus: 'normal' | 'warning' | 'error';
  createdAt: string;
  connectorMode?: 'oauth' | 'desktop';
  connectorSessionId?: string;
}

export interface ContentPost {
  id: string;
  platform: PlatformType;
  accountId: string;
  accountNickname?: string;
  title?: string;
  content?: string;
  coverUrl?: string;
  tags?: string[];
  mediaType: 'text' | 'image' | 'video';
  mediaUrls?: string[];
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'reviewing';
  scheduledAt?: string;
  publishedAt?: string;
  failReason?: string;
  playCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  collectCount: number;
  autoFollowUp: boolean;
  followUpContent?: string;
  followUpDelaySeconds: number;
  followUpStatus: 'none' | 'pending' | 'success' | 'failed';
  followUpFailReason?: string;
  createdAt: string;
}

export interface FollowerRecord {
  id: string;
  platform: PlatformType;
  accountId: string;
  followerPlatformId: string;
  nickname?: string;
  avatarUrl?: string;
  followedAt?: string;
  isMutual: boolean;
  isPrivate: boolean;
  tags?: string[];
  remark?: string;
  groupName?: string;
  gender?: string;
  location?: string;
  status: string;
}

export interface MessageSession {
  id: string;
  platform: PlatformType;
  accountId: string;
  sessionPlatformId: string;
  userNickname?: string;
  userAvatarUrl?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  isPinned: boolean;
  status: string;
}

export type SendFailReason =
  | 'frequency_limit'
  | 'need_mutual_follow'
  | 'private_account'
  | 'out_of_window'
  | 'content_blocked'
  | 'auth_error'
  | 'unknown';

export interface MessageItem {
  id: string;
  sessionId: string;
  direction: 'inbound' | 'outbound';
  msgType: 'text' | 'image' | 'video' | 'link' | 'article';
  content?: string;
  mediaUrl?: string;
  senderAccountId?: string;
  isRead: boolean;
  sentAt: string;
  failReason?: SendFailReason;
}

export interface CommentItem {
  id: string;
  platform: PlatformType;
  accountId: string;
  postId?: string;
  postTitle?: string;
  commenterNickname?: string;
  commenterAvatarUrl?: string;
  content: string;
  likeCount: number;
  replyCount: number;
  isReplied: boolean;
  replyContent?: string;
  replyAccountId?: string;
  repliedAt?: string;
  replyFailReason?: string;
  isSensitive: boolean;
  status: string;
  commentedAt: string;
}

export interface AutoReplyRule {
  id: string;
  ruleType: 'welcome' | 'keyword' | 'offline' | 'timeout';
  ruleName: string;
  platform?: PlatformType;
  accountId?: string;
  keywords?: string[];
  matchMode: 'exact' | 'contains' | 'fuzzy';
  replyContent?: string;
  replyType: 'text' | 'image';
  replyMediaUrl?: string;
  priority: number;
  isEnabled: boolean;
  hitCount: number;
  createdAt: string;
}

export interface QuickReply {
  id: string;
  category: string;
  title: string;
  content: string;
  sortOrder: number;
}

export interface MessageTemplate {
  id: string;
  templateType: 'text' | 'image' | 'article' | 'link';
  templateName: string;
  platform?: PlatformType;
  title?: string;
  content?: string;
  mediaUrl?: string;
  linkUrl?: string;
  auditStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  platformTemplateId?: string;
  isEnabled: boolean;
  createdAt: string;
}

export type MonitorType = 'new_follower' | 'message_keyword' | 'comment_keyword';
export type MonitorActionType = 'reply_message' | 'reply_comment';

export interface MonitorTask {
  id: string;
  taskName: string;
  monitorType: MonitorType;
  monitoredAccountIds: string[];
  keywords: string[];
  matchMode: 'exact' | 'contains' | 'fuzzy';
  actionType: MonitorActionType;
  actionAccountId?: string;
  actionContent?: string;
  actionMediaUrl?: string;
  actionMediaType: 'text' | 'image' | 'link';
  actionDelaySeconds: number;
  isEnabled: boolean;
  hitCount: number;
  frequencyLimitHour: number;
  frequencyLimitDay: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  createdAt: string;
}

export interface MonitorHitRecord {
  id: string;
  taskId: string;
  taskName?: string;
  monitorType: MonitorType;
  triggeredAccountId: string;
  triggeredAccountNickname?: string;
  hitKeyword?: string;
  targetUserPlatformId: string;
  targetUserNickname?: string;
  targetUserAvatarUrl?: string;
  sourceContent?: string;
  actionType: MonitorActionType;
  actionStatus: 'pending' | 'success' | 'failed';
  actionFailReason?: string;
  executedAt?: string;
  createdAt: string;
}

export type AutoMsgTaskStatus = 'draft' | 'running' | 'paused' | 'completed' | 'stopped';
export type AutoMsgItemStatus = 'pending' | 'sending' | 'success' | 'failed' | 'skipped';

export interface AutoMessageTask {
  id: string;
  taskName: string;
  senderAccountId: string;
  senderAccountNickname?: string;
  msgType: 'text' | 'image' | 'link' | 'article';
  content?: string;
  mediaUrl?: string;
  linkTitle?: string;
  linkUrl?: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  status: AutoMsgTaskStatus;
  frequencyLimitHour: number;
  frequencyLimitDay: number;
  minIntervalSeconds: number;
  maxIntervalSeconds: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface AutoMessageTaskItem {
  id: string;
  taskId: string;
  targetPlatformId: string;
  targetNickname?: string;
  targetAvatarUrl?: string;
  status: AutoMsgItemStatus;
  failReason?: SendFailReason;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
}

export interface OperationLog {
  id: string;
  operatorType: 'admin' | 'user';
  operatorName?: string;
  action: string;
  targetType?: string;
  detail?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  username: string;
  nickname?: string;
  role: string;
  status: string;
  mustChangePwd: boolean;
  lastLoginAt?: string;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AppUser;
}

export interface AdminLoginResponse {
  token: string;
  user: AdminUser;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  phone?: string;
}

export interface ActivateCodeRequest {
  code: string;
}

export interface DashboardStats {
  totalAccounts: number;
  platformStats: { platform: PlatformType; count: number }[];
  todayNewFollowers: number;
  pendingMessages: number;
  pendingComments: number;
  todayPosts: number;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeVipUsers: number;
  todayNewUsers: number;
  expiringSoon: number;
  totalCodes: number;
  usedCodes: number;
  totalAccounts: number;
}

export const FAIL_REASON_LABELS: Record<SendFailReason, string> = {
  frequency_limit: '发送过于频繁（触发频控）',
  need_mutual_follow: '需双方互关才能发送私信',
  private_account: '对方为隐私账号',
  out_of_window: '不在平台允许的会话窗口内',
  content_blocked: '内容被平台拦截',
  auth_error: '账号授权异常',
  unknown: '未知错误',
};

export type NotificationType = 'system' | 'publish_result' | 'follow_up' | 'auto_message' | 'vip_expire' | 'monitor_alert' | 'follower' | 'violation';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content?: string;
  isRead: boolean;
  relatedType?: string;
  relatedId?: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  summary?: string;
  category: 'system' | 'update' | 'activity' | 'compliance';
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SensitiveWord {
  id: string;
  word: string;
  category: string;
  level: 'warn' | 'block';
  isEnabled: boolean;
  createdAt: string;
}

export interface SystemSetting {
  id: string;
  settingKey: string;
  settingValue?: string;
  settingType: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  updatedAt: string;
}

export type MediaAssetType = 'image' | 'video' | 'audio' | 'document';

export interface MediaAsset {
  id: string;
  userId: string;
  assetType: MediaAssetType;
  title: string;
  fileUrl: string;
  fileSize: number;
  fileFormat?: string;
  width?: number;
  height?: number;
  duration?: number;
  category?: string;
  tags: string[];
  description?: string;
  createdAt: string;
}

export interface AccountGroup {
  id: string;
  userId: string;
  groupName: string;
  sortOrder: number;
  isDefault: boolean;
  accountCount?: number;
  createdAt: string;
}

export interface PlatformAccountDetail extends PlatformAccount {
  groupId?: string;
  remark?: string;
  tags: string[];
  authScope?: string[];
  bindTime?: string;
  lastSyncAt?: string;
  totalPlayCount?: number;
  totalLikeCount?: number;
  totalCommentCount?: number;
  totalShareCount?: number;
  avgPlayDuration?: number;
  avgCompletionRate?: number;
  weeklyGrowth?: number;
}

export interface ListQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  platform?: PlatformType;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const FAIL_REASON_LEVELS: Record<SendFailReason, 'warning' | 'error' | 'info'> = {
  frequency_limit: 'warning',
  need_mutual_follow: 'error',
  private_account: 'error',
  out_of_window: 'warning',
  content_blocked: 'error',
  auth_error: 'error',
  unknown: 'warning',
};

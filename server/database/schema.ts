/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { bigint, boolean, foreignKey, index, integer, jsonb, numeric, pgTable, text, time, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const accountGroups = pgTable("account_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  groupName: varchar("group_name", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  color: varchar("color", { length: 7 }).notNull().default('#64748b'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_account_groups_user_id").on(table.userId),
]);

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  assetType: varchar("asset_type", { length: 20 }).notNull().default('image'),
  title: varchar("title", { length: 200 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: bigint("file_size", { mode: 'number' }).notNull().default(0),
  fileFormat: varchar("file_format", { length: 20 }),
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"),
  category: varchar("category", { length: 50 }),
  tags: text("tags").array().notNull().default([]),
  description: text("description"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_media_assets_user_id").on(table.userId),
  index("idx_media_assets_type").on(table.assetType),
  index("idx_media_assets_category").on(table.category),
]);

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  settingKey: varchar("setting_key", { length: 100 }).notNull().unique(),
  settingValue: text("setting_value"),
  settingType: varchar("setting_type", { length: 20 }).notNull().default('string'),
  description: varchar("description", { length: 255 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("system_settings_setting_key_key").on(table.settingKey),
]);

export const sensitiveWords = pgTable("sensitive_words", {
  id: uuid("id").primaryKey().defaultRandom(),
  word: varchar("word", { length: 100 }).notNull().unique(),
  category: varchar("category", { length: 30 }).notNull().default('general'),
  level: varchar("level", { length: 20 }).notNull().default('warn'),
  isEnabled: boolean("is_enabled").notNull().default(true),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("sensitive_words_word_key").on(table.word),
  index("idx_sensitive_words_enabled").on(table.isEnabled),
]);

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  summary: varchar("summary", { length: 500 }),
  category: varchar("category", { length: 30 }).notNull().default('system'),
  isPublished: boolean("is_published").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_announcements_published").on(table.isPublished),
  index("idx_announcements_created").on(table.createdAt),
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 30 }).notNull().default('system'),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content"),
  isRead: boolean("is_read").notNull().default(false),
  relatedType: varchar("related_type", { length: 50 }),
  relatedId: uuid("related_id"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_notifications_user_id").on(table.userId),
  index("idx_notifications_is_read").on(table.isRead),
]);

export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  platform: varchar("platform", { length: 20 }),
  templateType: varchar("template_type", { length: 30 }).notNull().default('text'),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  title: varchar("title", { length: 200 }),
  content: text("content"),
  mediaUrl: text("media_url"),
  linkUrl: text("link_url"),
  auditStatus: varchar("audit_status", { length: 20 }).notNull().default('draft'),
  platformTemplateId: varchar("platform_template_id", { length: 100 }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_message_templates_user_id").on(table.userId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "message_templates_user_id_fkey",
  }).onDelete("cascade"),
]);

export const autoMessageTaskItems = pgTable("auto_message_task_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull(),
  userId: uuid("user_id").notNull(),
  targetPlatformId: varchar("target_platform_id", { length: 100 }).notNull(),
  targetNickname: varchar("target_nickname", { length: 200 }),
  targetAvatarUrl: text("target_avatar_url"),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  failReason: varchar("fail_reason", { length: 200 }),
  scheduledAt: customTimestamptz("scheduled_at", { precision: 6 }),
  sentAt: customTimestamptz("sent_at", { precision: 6 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_auto_message_task_items_task_id").on(table.taskId),
  index("idx_auto_message_task_items_status").on(table.status),
  foreignKey({
    columns: [table.taskId],
    foreignColumns: [autoMessageTasks.id],
    name: "auto_message_task_items_task_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "auto_message_task_items_user_id_fkey",
  }).onDelete("cascade"),
]);

export const autoMessageTasks = pgTable("auto_message_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  taskName: varchar("task_name", { length: 200 }).notNull(),
  senderAccountId: uuid("sender_account_id").notNull(),
  msgType: varchar("msg_type", { length: 20 }).notNull().default('text'),
  content: text("content"),
  mediaUrl: text("media_url"),
  linkTitle: varchar("link_title", { length: 200 }),
  linkUrl: text("link_url"),
  totalCount: integer("total_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failCount: integer("fail_count").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default('draft'),
  frequencyLimitHour: integer("frequency_limit_hour").notNull().default(30),
  frequencyLimitDay: integer("frequency_limit_day").notNull().default(200),
  minIntervalSeconds: integer("min_interval_seconds").notNull().default(30),
  maxIntervalSeconds: integer("max_interval_seconds").notNull().default(90),
  startedAt: customTimestamptz("started_at", { precision: 6 }),
  completedAt: customTimestamptz("completed_at", { precision: 6 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_auto_message_tasks_user_id").on(table.userId),
  index("idx_auto_message_tasks_status").on(table.status),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "auto_message_tasks_user_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.senderAccountId],
    foreignColumns: [platformAccounts.id],
    name: "auto_message_tasks_sender_account_id_fkey",
  }).onDelete("cascade"),
]);

export const monitorHitRecords = pgTable("monitor_hit_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  taskId: uuid("task_id").notNull(),
  monitorType: varchar("monitor_type", { length: 30 }).notNull(),
  triggeredAccountId: uuid("triggered_account_id").notNull(),
  hitKeyword: varchar("hit_keyword", { length: 200 }),
  targetUserPlatformId: varchar("target_user_platform_id", { length: 100 }),
  targetUserNickname: varchar("target_user_nickname", { length: 200 }),
  targetUserAvatarUrl: text("target_user_avatar_url"),
  sourceContent: text("source_content"),
  actionType: varchar("action_type", { length: 30 }).notNull(),
  actionStatus: varchar("action_status", { length: 20 }).notNull().default('pending'),
  actionFailReason: varchar("action_fail_reason", { length: 200 }),
  executedAt: customTimestamptz("executed_at", { precision: 6 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_monitor_hit_records_user_id").on(table.userId),
  index("idx_monitor_hit_records_task_id").on(table.taskId),
  index("idx_monitor_hit_records_created").on(table.createdAt),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "monitor_hit_records_user_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.taskId],
    foreignColumns: [monitorTasks.id],
    name: "monitor_hit_records_task_id_fkey",
  }).onDelete("cascade"),
]);

export const monitorTasks = pgTable("monitor_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  taskName: varchar("task_name", { length: 200 }).notNull(),
  monitorType: varchar("monitor_type", { length: 30 }).notNull(),
  monitoredAccountIds: uuid("monitored_account_ids").array().notNull().default([]),
  keywords: text("keywords").array().notNull().default([]),
  matchMode: varchar("match_mode", { length: 20 }).notNull().default('contains'),
  actionType: varchar("action_type", { length: 30 }).notNull().default('reply_message'),
  actionAccountId: uuid("action_account_id"),
  actionContent: text("action_content"),
  actionMediaUrl: text("action_media_url"),
  actionMediaType: varchar("action_media_type", { length: 20 }).default('text'),
  actionDelaySeconds: integer("action_delay_seconds").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  hitCount: integer("hit_count").notNull().default(0),
  frequencyLimitHour: integer("frequency_limit_hour").notNull().default(20),
  frequencyLimitDay: integer("frequency_limit_day").notNull().default(100),
  minIntervalSeconds: integer("min_interval_seconds").notNull().default(30),
  maxIntervalSeconds: integer("max_interval_seconds").notNull().default(90),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_monitor_tasks_user_id").on(table.userId),
  index("idx_monitor_tasks_enabled").on(table.isEnabled),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "monitor_tasks_user_id_fkey",
  }).onDelete("cascade"),
]);

export const quickReplies = pgTable("quick_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  category: varchar("category", { length: 50 }).notNull().default('default'),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_quick_replies_user_id").on(table.userId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "quick_replies_user_id_fkey",
  }),
]);

export const autoReplyRules = pgTable("auto_reply_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  accountId: uuid("account_id"),
  platform: varchar("platform", { length: 20 }),
  ruleType: varchar("rule_type", { length: 30 }).notNull(),
  ruleName: varchar("rule_name", { length: 100 }).notNull(),
  keywords: text("keywords").array(),
  matchMode: varchar("match_mode", { length: 20 }).notNull().default('exact'),
  replyContent: text("reply_content"),
  replyType: varchar("reply_type", { length: 20 }).notNull().default('text'),
  replyMediaUrl: text("reply_media_url"),
  timeStart: time("time_start"),
  timeEnd: time("time_end"),
  priority: integer("priority").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  hitCount: integer("hit_count").notNull().default(0),
  effectiveFrom: customTimestamptz("effective_from", { precision: 6 }),
  effectiveTo: customTimestamptz("effective_to", { precision: 6 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_auto_reply_rules_user_id").on(table.userId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "auto_reply_rules_user_id_fkey",
  }),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [platformAccounts.id],
    name: "auto_reply_rules_account_id_fkey",
  }),
]);

export const commentItems = pgTable("comment_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  accountId: uuid("account_id").notNull(),
  postId: uuid("post_id"),
  platform: varchar("platform", { length: 20 }).notNull(),
  commentPlatformId: varchar("comment_platform_id", { length: 100 }),
  commenterNickname: varchar("commenter_nickname", { length: 200 }),
  commenterAvatarUrl: text("commenter_avatar_url"),
  content: text("content").notNull(),
  likeCount: integer("like_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  parentCommentId: uuid("parent_comment_id"),
  isReplied: boolean("is_replied").notNull().default(false),
  replyContent: text("reply_content"),
  repliedAt: customTimestamptz("replied_at", { precision: 6 }),
  isSensitive: boolean("is_sensitive").notNull().default(false),
  status: varchar("status", { length: 20 }).notNull().default('published'),
  commentedAt: customTimestamptz("commented_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  replyAccountId: uuid("reply_account_id"),
  replyFailReason: varchar("reply_fail_reason", { length: 200 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_comment_items_account_id").on(table.accountId),
  index("idx_comment_items_post_id").on(table.postId),
  index("idx_comment_items_replied").on(table.accountId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "comment_items_user_id_fkey",
  }),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [platformAccounts.id],
    name: "comment_items_account_id_fkey",
  }),
  foreignKey({
    columns: [table.postId],
    foreignColumns: [contentPosts.id],
    name: "comment_items_post_id_fkey",
  }),
  foreignKey({
    columns: [table.replyAccountId],
    foreignColumns: [platformAccounts.id],
    name: "comment_items_reply_account_id_fkey",
  }),
]);

export const messageItems = pgTable("message_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull(),
  userId: uuid("user_id").notNull(),
  accountId: uuid("account_id").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  messagePlatformId: varchar("message_platform_id", { length: 100 }),
  direction: varchar("direction", { length: 10 }).notNull(),
  msgType: varchar("msg_type", { length: 20 }).notNull().default('text'),
  content: text("content"),
  mediaUrl: text("media_url"),
  isRead: boolean("is_read").notNull().default(false),
  sentAt: customTimestamptz("sent_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  senderAccountId: uuid("sender_account_id"),
  failReason: varchar("fail_reason", { length: 200 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_message_items_session_id").on(table.sessionId),
  index("idx_message_items_sent_at").on(table.sentAt),
  foreignKey({
    columns: [table.sessionId],
    foreignColumns: [messageSessions.id],
    name: "message_items_session_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "message_items_user_id_fkey",
  }),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [platformAccounts.id],
    name: "message_items_account_id_fkey",
  }),
  foreignKey({
    columns: [table.senderAccountId],
    foreignColumns: [platformAccounts.id],
    name: "message_items_sender_account_id_fkey",
  }),
]);

export const messageSessions = pgTable("message_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  accountId: uuid("account_id").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  sessionPlatformId: varchar("session_platform_id", { length: 100 }).notNull(),
  userNickname: varchar("user_nickname", { length: 200 }),
  userAvatarUrl: text("user_avatar_url"),
  lastMessage: text("last_message"),
  lastMessageAt: customTimestamptz("last_message_at", { precision: 6 }),
  unreadCount: integer("unread_count").notNull().default(0),
  isPinned: boolean("is_pinned").notNull().default(false),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("message_sessions_account_id_session_platform_id_key").on(table.accountId, table.sessionPlatformId),
  index("idx_message_sessions_account_id").on(table.accountId),
  index("idx_message_sessions_unread").on(table.accountId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "message_sessions_user_id_fkey",
  }),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [platformAccounts.id],
    name: "message_sessions_account_id_fkey",
  }),
]);

export const followerRecords = pgTable("follower_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  accountId: uuid("account_id").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  followerPlatformId: varchar("follower_platform_id", { length: 100 }).notNull(),
  nickname: varchar("nickname", { length: 200 }),
  avatarUrl: text("avatar_url"),
  followedAt: customTimestamptz("followed_at", { precision: 6 }),
  isMutual: boolean("is_mutual").notNull().default(false),
  tags: text("tags").array(),
  remark: varchar("remark", { length: 200 }),
  groupName: varchar("group_name", { length: 100 }),
  gender: varchar("gender", { length: 10 }),
  location: varchar("location", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("follower_records_account_id_follower_platform_id_key").on(table.accountId, table.followerPlatformId),
  index("idx_follower_records_account_id").on(table.accountId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "follower_records_user_id_fkey",
  }),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [platformAccounts.id],
    name: "follower_records_account_id_fkey",
  }),
]);

export const contentPosts = pgTable("content_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  accountId: uuid("account_id").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  title: varchar("title", { length: 500 }),
  content: text("content"),
  coverUrl: text("cover_url"),
  tags: text("tags").array(),
  mediaType: varchar("media_type", { length: 20 }).notNull().default('text'),
  mediaUrls: text("media_urls").array(),
  platformPostId: varchar("platform_post_id", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default('draft'),
  scheduledAt: customTimestamptz("scheduled_at", { precision: 6 }),
  publishedAt: customTimestamptz("published_at", { precision: 6 }),
  failReason: text("fail_reason"),
  playCount: integer("play_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  shareCount: integer("share_count").notNull().default(0),
  collectCount: integer("collect_count").notNull().default(0),
  extraData: jsonb("extra_data"),
  autoFollowUp: boolean("auto_follow_up").notNull().default(false),
  followUpContent: text("follow_up_content"),
  followUpDelaySeconds: integer("follow_up_delay_seconds").notNull().default(60),
  followUpStatus: varchar("follow_up_status", { length: 20 }).default('none'),
  followUpFailReason: varchar("follow_up_fail_reason", { length: 200 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_content_posts_user_id").on(table.userId),
  index("idx_content_posts_status").on(table.status),
  index("idx_content_posts_scheduled").on(table.scheduledAt),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "content_posts_user_id_fkey",
  }),
  foreignKey({
    columns: [table.accountId],
    foreignColumns: [platformAccounts.id],
    name: "content_posts_account_id_fkey",
  }),
]);

export const platformAccounts = pgTable("platform_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  platform: varchar("platform", { length: 20 }).notNull(),
  platformUserId: varchar("platform_user_id", { length: 100 }),
  nickname: varchar("nickname", { length: 200 }),
  avatarUrl: text("avatar_url"),
  accountRemark: varchar("account_remark", { length: 200 }),
  groupName: varchar("group_name", { length: 100 }),
  authStatus: varchar("auth_status", { length: 20 }).notNull().default('pending'),
  authExpiresAt: customTimestamptz("auth_expires_at", { precision: 6 }),
  followersCount: integer("followers_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  likesCount: integer("likes_count").notNull().default(0),
  postsCount: integer("posts_count").notNull().default(0),
  healthStatus: varchar("health_status", { length: 20 }).notNull().default('normal'),
  // OAuth tokens are encrypted before storage. Ciphertext can exceed 255 characters.
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  rawData: jsonb("raw_data"),
  groupId: uuid("group_id"),
  remark: varchar("remark", { length: 200 }),
  tags: text("tags").array().notNull().default([]),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_platform_accounts_user_id").on(table.userId),
  index("idx_platform_accounts_platform").on(table.platform),
  index("idx_platform_accounts_group_id").on(table.groupId),
  uniqueIndex("uq_platform_accounts_owner_platform_user").on(table.userId, table.platform, table.platformUserId),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "platform_accounts_user_id_fkey",
  }),
]);

export const operationLogs = pgTable("operation_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  operatorType: varchar("operator_type", { length: 20 }).notNull().default('admin'),
  operatorId: uuid("operator_id").notNull(),
  operatorName: varchar("operator_name", { length: 100 }),
  action: varchar("action", { length: 50 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: uuid("target_id"),
  detail: text("detail"),
  ipAddress: varchar("ip_address", { length: 45 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 100 }),
  role: varchar("role", { length: 20 }).notNull().default('admin'),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  mustChangePwd: boolean("must_change_pwd").notNull().default(true),
  lastLoginAt: customTimestamptz("last_login_at", { precision: 6 }),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("admin_users_username_key").on(table.username),
]);

export const activationCodes = pgTable("activation_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  planId: uuid("plan_id").notNull(),
  durationDays: integer("duration_days").notNull(),
  maxAccounts: integer("max_accounts").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('unused'),
  userId: uuid("user_id"),
  activatedAt: customTimestamptz("activated_at", { precision: 6 }),
  batchNo: varchar("batch_no", { length: 50 }),
  remark: varchar("remark", { length: 255 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("activation_codes_code_key").on(table.code),
  foreignKey({
    columns: [table.planId],
    foreignColumns: [vipPlans.id],
    name: "activation_codes_plan_id_fkey",
  }),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [appUsers.id],
    name: "activation_codes_user_id_fkey",
  }),
]);

export const vipPlans = pgTable("vip_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  durationDays: integer("duration_days").notNull().default(30),
  maxAccounts: integer("max_accounts").notNull().default(3),
  price: numeric("price").notNull().default('0'),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  sortOrder: integer("sort_order").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("vip_plans_code_key").on(table.code),
]);

export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  authVersion: integer("auth_version").notNull().default(0),
  nickname: varchar("nickname", { length: 100 }),
  avatarUrl: text("avatar_url"),
  vipPlanId: uuid("vip_plan_id"),
  vipExpiresAt: customTimestamptz("vip_expires_at", { precision: 6 }),
  vipStatus: varchar("vip_status", { length: 20 }).notNull().default('inactive'),
  maxAccounts: integer("max_accounts").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  lastLoginAt: customTimestamptz("last_login_at", { precision: 6 }),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("app_users_username_key").on(table.username),
]);

// Recovery codes are HMAC digests only; no plaintext code/password is stored.
export const passwordRecoveryChallenges = pgTable('password_recovery_challenges', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id'),
  accountKey: varchar('account_key', { length: 64 }).notNull(),
  targetKey: varchar('target_key', { length: 64 }).notNull(),
  ipKey: varchar('ip_key', { length: 64 }).notNull(),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  authVersion: integer('auth_version').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  sendState: varchar('send_state', { length: 12 }).notNull().default('pending'),
  createdAt: customTimestamptz('created_at', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: customTimestamptz('expires_at', { precision: 3 }).notNull(),
  consumedAt: customTimestamptz('consumed_at', { precision: 3 }),
});

// table aliases
export const accountGroupsTable = accountGroups;
export const activationCodesTable = activationCodes;
export const adminUsersTable = adminUsers;
export const announcementsTable = announcements;
export const appUsersTable = appUsers;
export const autoMessageTaskItemsTable = autoMessageTaskItems;
export const autoMessageTasksTable = autoMessageTasks;
export const autoReplyRulesTable = autoReplyRules;
export const commentItemsTable = commentItems;
export const contentPostsTable = contentPosts;
export const followerRecordsTable = followerRecords;
export const mediaAssetsTable = mediaAssets;
export const messageItemsTable = messageItems;
export const messageSessionsTable = messageSessions;
export const messageTemplatesTable = messageTemplates;
export const monitorHitRecordsTable = monitorHitRecords;
export const monitorTasksTable = monitorTasks;
export const notificationsTable = notifications;
export const operationLogsTable = operationLogs;
export const platformAccountsTable = platformAccounts;
export const quickRepliesTable = quickReplies;
export const sensitiveWordsTable = sensitiveWords;
export const systemSettingsTable = systemSettings;
export const vipPlansTable = vipPlans;

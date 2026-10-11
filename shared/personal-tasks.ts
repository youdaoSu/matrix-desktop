import type { PlatformType } from './api.interface';

export type PersonalTaskKind = 'publish' | 'comment' | 'message' | 'review';
export type PersonalTaskStatus = 'pending' | 'done' | 'cancelled';
export interface PersonalTask {
  id: string;
  accountId: string | null;
  accountNickname?: string;
  platform: PlatformType;
  kind: PersonalTaskKind;
  title: string;
  content: string;
  status: PersonalTaskStatus;
  dueAt: string | null;
  note: string;
  completedAt: string | null;
  createdAt: string;
}
export interface PersonalTaskInput {
  requestId: string;
  accountIds: string[];
  kind: PersonalTaskKind;
  title: string;
  content?: string;
  dueAt?: string | null;
}
export const taskKindLabels: Record<PersonalTaskKind, string> = {
  publish: '发表待办', comment: '评论回复待办', message: '私信回复待办', review: '账号检查待办',
};
export const taskStatusLabels: Record<PersonalTaskStatus, string> = {
  pending: '待本人处理', done: '本人已确认处理', cancelled: '已取消',
};

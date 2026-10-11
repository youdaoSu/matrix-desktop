export const publishSyncFields = ['title', 'body', 'topics', 'comment'] as const;
export type PublishSyncField = typeof publishSyncFields[number];
export interface PublishConfig {
  title: string; body: string; topics: string[]; comment: string;
  options: { category?: string; visibility?: string; originality?: string };
  covers?: { id: string; name: string; index: number }[];
  schedule?: { mode: 'now' | 'official' | 'local'; at?: string };
  pinComment?: boolean;
}
export function parseTopics(text: string): string[] {
  return [...new Set(text.split(/[\s#,，;；、]+/u).map(value => value.trim()).filter(Boolean))];
}
export function syncPublishConfig(common: PublishConfig, previous: PublishConfig | undefined, fields: readonly PublishSyncField[]): PublishConfig {
  const result: PublishConfig = previous ? { ...previous, topics: [...previous.topics], options: { ...previous.options } } : { title: '', body: '', topics: [], comment: '', options: {} };
  for (const key of fields) {
    if (key === 'topics') result.topics = [...common.topics]; else result[key] = common[key];
  }
  result.covers = common.covers?.map(cover => ({ ...cover }));
  result.schedule = common.schedule ? { ...common.schedule } : undefined;
  result.pinComment = common.pinComment;
  return result;
}
export function validatePublishConfig(config: PublishConfig): string | null {
  if (!config.title.trim() && !config.body.trim()) return '请填写标题或简介';
  if (config.title.length > 500 || config.body.length > 20000 || config.comment.length > 2000) return '标题、简介或追评内容过长';
  if (config.topics.length > 15 || config.topics.some(topic => topic.length > 40)) return '最多 15 个话题，每个不超过 40 字';
  if (config.schedule && config.schedule.mode !== 'now' && (!config.schedule.at || !Number.isFinite(Date.parse(config.schedule.at)) || Date.parse(config.schedule.at) <= Date.now())) return '请选择有效的未来发布时间';
  return null;
}

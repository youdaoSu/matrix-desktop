export const publishSyncFields = ['title', 'body', 'topics', 'comment'] as const;
export type PublishSyncField = typeof publishSyncFields[number];
export interface PublishConfig {
  title: string; body: string; topics: string[]; comment: string;
  options: { category?: string; visibility?: string; originality?: string };
}
export function parseTopics(text: string): string[] {
  return [...new Set(text.split(/[\s#,，;；、]+/u).map(value => value.trim()).filter(Boolean))];
}
export function syncPublishConfig(common: PublishConfig, previous: PublishConfig | undefined, fields: readonly PublishSyncField[]): PublishConfig {
  const result: PublishConfig = previous ? { ...previous, topics: [...previous.topics], options: { ...previous.options } } : { title: '', body: '', topics: [], comment: '', options: {} };
  for (const key of fields) {
    if (key === 'topics') result.topics = [...common.topics]; else result[key] = common[key];
  }
  return result;
}
export function validatePublishConfig(config: PublishConfig): string | null {
  if (!config.title.trim() && !config.body.trim()) return '请填写标题或简介';
  if (config.title.length > 500 || config.body.length > 20000 || config.comment.length > 2000) return '标题、简介或追评内容过长';
  if (config.topics.length > 15 || config.topics.some(topic => topic.length > 40)) return '最多 15 个话题，每个不超过 40 字';
  return null;
}

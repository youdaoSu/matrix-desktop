import type { PublishConfig } from './publish-config';
import { titleFromPublishFilename } from './publish-filename';

export interface PublishExtractionOptions { cover: boolean; title: boolean; body: boolean; topics: boolean }
export const defaultPublishExtraction = (): PublishExtractionOptions => ({ cover: true, title: true, body: true, topics: true });
export function normalizePublishExtraction(value: unknown): PublishExtractionOptions {
  const input = value && typeof value === 'object' ? value as Partial<PublishExtractionOptions> : {};
  return Object.fromEntries(Object.entries(defaultPublishExtraction()).map(([key, fallback]) => [key, typeof input[key as keyof PublishExtractionOptions] === 'boolean' ? input[key as keyof PublishExtractionOptions] : fallback])) as unknown as PublishExtractionOptions;
}
// Only explicit #topics, not prose, Markdown headings, URL fragments or code.
// Invalid/overflow topics stay in the description; never silently lose text.
export function extractPublishTopics(text: string) {
  const topics: string[] = [], warnings: string[] = [];
  let fenced = false;
  const body = text.split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced || /^\s{4}|^\s*#{1,6}\s/.test(line)) return line;
    return line.replace(/(^|[\s#，,。；;！？!?（(【\[])#([^#\s，,。；;！？!?）)】\]<>`]+)/gu, (whole, prefix: string, raw: string) => {
      const topic = raw.replace(/[.。:：]+$/u, '');
      if (!topic || topic.length > 40 || !topics.includes(topic) && topics.length >= 15) {
        if (!warnings.length) warnings.push('部分话题超过15个或40字，已留在简介中，请手动调整');
        return whole;
      }
      if (!topics.includes(topic)) topics.push(topic);
      return prefix === '#' ? '' : prefix;
    }).replace(/[ \t]+$/u, '');
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { body, topics, warnings };
}
export interface PublishExtractionData { body?: string; cover?: { id: string; name: string; index: number }; notices?: string[] }
export function applyPublishExtraction(current: PublishConfig, baseline: PublishConfig, filename: string, data: PublishExtractionData, options: PublishExtractionOptions): PublishConfig {
  const next = { ...current };
  if (options.title && !baseline.title.trim() && !current.title.trim()) next.title = titleFromPublishFilename(filename);
  const mayFillBody = options.body && !baseline.body.trim() && !current.body.trim() && data.body !== undefined;
  const mayFillTopics = options.topics && !baseline.topics.length && !current.topics.length;
  const source = baseline.body.trim() ? baseline.body : mayFillBody ? data.body! : '';
  const extracted = extractPublishTopics(source);
  if (mayFillBody) next.body = mayFillTopics ? extracted.body : data.body!;
  if (mayFillTopics) next.topics = extracted.topics;
  if (options.cover && !baseline.covers?.length && !current.covers?.length && data.cover) next.covers = [data.cover];
  return next;
}

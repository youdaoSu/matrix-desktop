import capabilities from '../desktop/publish-capabilities.json';

// This describes Matrix's implemented adapters, not every feature a platform
// offers. Keep draft saving unrestricted; enforce at publication admission.
export function publishMediaSupportError(platform: string, mediaType: string): string | undefined {
  const adapter = capabilities[platform as keyof typeof capabilities];
  if (!adapter || !['video', 'image'].includes(mediaType)) return '该素材类型尚未接通此一键发布流程';
  if (!adapter.mediaTypes.includes(mediaType)) return `${adapter.label}当前一键发布仅适配视频，暂不支持图文；尚未创建发布任务`;
}

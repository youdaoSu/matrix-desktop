import { publishSyncFields, syncPublishConfig, type PublishConfig } from './publish-config';
import type { PlatformType } from './api.interface';
import { publishPlatformFields } from './publish-platform-fields';

// An explicit sync replaces common fields; admission alone still preserves a
// user's right-hand overrides. Never invent required platform-only settings.
export function syncPublishToPlatform(platform: PlatformType, common: PublishConfig, previous?: PublishConfig, preserve: ReadonlySet<string> = new Set()): PublishConfig {
  const result = syncPublishConfig(common, previous, publishSyncFields.filter(field => !preserve.has(field)), preserve);
  const options = platform === 'bilibili' ? ['originality', 'category'] : ['visibility'];
  if (!preserve.has('options')) for (const key of options as (keyof PublishConfig['options'])[]) {
    if (common.options[key] !== undefined) result.options[key] = common.options[key];
  }
  if (!preserve.has('extras')) {
    const supported = new Set(publishPlatformFields[platform].fields.map(field => field.label));
    for (const [key, value] of Object.entries(common.extras || {})) if (supported.has(key)) result.extras = { ...result.extras, [key]: value };
  }
  return result;
}

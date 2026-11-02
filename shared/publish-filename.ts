// Filename only; no metadata service, credential/path persistence or AI guess.
export function titleFromPublishFilename(value: unknown): string {
  if (typeof value !== 'string') return '';
  return (value.split(/[\\/]/).pop() || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\.(mp4|mov|mkv|webm|png|jpe?g|webp)$/i, '').trim();
}

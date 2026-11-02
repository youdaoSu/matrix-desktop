// Preserve the first complete Unicode character when a platform has no image.
export function interactionAvatarInitial(name: string): string {
  const text = name.trim();
  return Array.from(text)[0] || '?';
}

// Shared by images, stickers and avatars. Canceled views skip before IPC;
// two admitted previews only, no unbounded network burst after scrolling.
const tasks: Array<() => Promise<void>> = [];
let active = 0;
function drain() {
  while (active < 2 && tasks.length) {
    active++;
    void tasks.shift()!().catch(() => {}).finally(() => { active--; drain(); });
  }
}
export function enqueueImagePreview(task: () => Promise<void>) {
  if (tasks.length >= 256) return false;
  tasks.push(task); drain(); return true;
}

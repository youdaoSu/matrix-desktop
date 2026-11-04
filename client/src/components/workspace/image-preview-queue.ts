// Shared by images, stickers and avatars. Canceled views skip before IPC;
// two admitted previews only, no unbounded network burst after scrolling.
type Preview = { run: () => Promise<void>; detach: () => void };
const tasks: Preview[] = [];
let active = 0;
function drain() {
  while (active < 2 && tasks.length) {
    active++;
    const task = tasks.shift()!; task.detach();
    // Also release capacity when a caller throws before returning a Promise.
    void Promise.resolve().then(task.run).catch(() => {}).finally(() => { active--; drain(); });
  }
}
export function enqueueImagePreview(task: () => Promise<void>, signal?: AbortSignal) {
  if (signal?.aborted || tasks.length >= 256) return false;
  const cancel = () => { const index = tasks.indexOf(entry); if(index >= 0) tasks.splice(index,1); entry.detach(); };
  const entry: Preview = { run: () => signal?.aborted ? Promise.resolve() : task(), detach: () => signal?.removeEventListener('abort',cancel) };
  signal?.addEventListener('abort',cancel,{once:true});
  tasks.push(entry); drain(); return true;
}

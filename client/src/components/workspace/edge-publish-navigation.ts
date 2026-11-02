// A native Navigate acknowledgement means "requested", not "loaded". Keep
// strict identity checks in the main process; do not call the entry adapter on
// the stale login document. The caller retains completed events by request ID
// so a later title/layout status cannot erase an already observed completion.
export async function waitForEdgeNavigation(
  requestId: string | undefined,
  completed: (id: string) => { navigationRequestId?: string; navigationComplete?: boolean; error?: string } | undefined,
  check: () => void,
  sleep: (ms: number) => Promise<void>,
  polls = 150,
) {
  if (!requestId) throw Error('原生页面未返回导航标识，请使用完整匹配的远效更新');
  for (let attempt = 0; attempt < polls; attempt++) {
    check();
    const status = completed(requestId);
    if (status?.navigationRequestId === requestId && status.navigationComplete) {
      if (status.error) throw Error(status.error);
      return;
    }
    await sleep(200);
  }
  check();
  throw Error('视频号官方首页导航超时，尚未上传或提交；请检查网络及官方登录状态');
}

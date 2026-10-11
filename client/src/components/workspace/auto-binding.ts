// Shared by automatic polling and the manual retry button: at most one save per tab.
export function createAutoBinding<T>(options: {
  detect(): Promise<MatrixDesktopLoginResult | MatrixDesktopErrorResult>;
  persist(login: MatrixDesktopLoginResult): Promise<T>;
  isCurrent(): boolean;
  detected(login: MatrixDesktopLoginResult): void;
  saved(login: MatrixDesktopLoginResult, account: T): void;
  failed(message: string): void;
  saving(value: boolean): void;
  waiting?(message: string): void;
}) {
  let inFlight = false, completed = false, paused = false, disposed = false;
  return {
    dispose() { disposed = true; },
    async run(automatic = true) {
      if (disposed || inFlight || completed || (automatic && paused) || !options.isCurrent()) return;
      inFlight = true;
      let saving = false;
      try {
        const result = await options.detect();
        if (disposed || !options.isCurrent()) return;
        if ('error' in result) {
          options.waiting?.(result.pendingProfile ? result.error : '');
          if (!automatic) options.failed(result.error);
          return;
        }
        if (!result.nickname?.trim()) { options.waiting?.('已登录，正在读取账号昵称…'); return; }
        options.waiting?.('');
        options.detected(result);
        saving = true; options.saving(true);
        const account = await options.persist(result);
        completed = true;
        if (!disposed && options.isCurrent()) options.saved(result, account);
      } catch (failure: any) {
        // A quota, server or save error must not hammer the API every two seconds.
        if (saving) paused = true;
        if (!disposed && options.isCurrent() && (saving || !automatic)) options.failed(failure?.response?.data?.error?.message || failure?.response?.data?.message || failure?.message || '账号绑定失败，请重试');
      } finally { inFlight = false; if (saving && !disposed) options.saving(false); }
    },
  };
}

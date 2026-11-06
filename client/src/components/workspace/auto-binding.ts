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
  confirmationMilliseconds?: number;
  now?(): number;
}) {
  let inFlight = false, completed = false, paused = false, disposed = false;
  let stableProfile = '', stableSince = 0, sawLoginAfterFailure = false;
  let retryAt = 0;
  const now = options.now || Date.now;
  const confirmation = options.confirmationMilliseconds ?? 3000;
  return {
    dispose() { disposed = true; },
    async run(automatic = true) {
      if (disposed || inFlight || completed || !options.isCurrent()) return;
      if (now() < retryAt) return;
      if (!automatic && paused) { paused = false; stableProfile = ''; }
      inFlight = true;
      let saving = false;
      try {
        const result = await options.detect();
        if (disposed || !options.isCurrent()) return;
        if ('error' in result) {
          stableProfile = ''; stableSince = 0;
          if (result.rateLimited) {
            retryAt = Number.isSafeInteger(result.retryAt) && result.retryAt! > now() ? result.retryAt! : now() + 60 * 60000;
            options.waiting?.(result.error);
            options.failed(result.error);
            return;
          }
          // A profile/network error is not evidence that the official login page returned.
          if (paused && result.loginRequired === true) sawLoginAfterFailure = true;
          options.waiting?.(result.pendingProfile || result.loginLoop ? result.error : '');
          if (!automatic) options.failed(result.error);
          return;
        }
        if (!result.nickname?.trim()) { stableProfile = ''; stableSince = 0; options.waiting?.('已登录，正在读取账号昵称…'); return; }
        if (paused) {
          if (!sawLoginAfterFailure) return;
          paused = false; sawLoginAfterFailure = false;
        }
        const identity = JSON.stringify([result.platform, result.sessionId, result.nickname.trim()]);
        if (stableProfile !== identity) { stableProfile = identity; stableSince = now(); }
        const remaining = confirmation - (now() - stableSince);
        if (remaining > 0) { options.detected(result); options.waiting?.(`已登录并识别本人信息，${Math.ceil(remaining / 1000)} 秒后自动绑定…`); return; }
        options.waiting?.('');
        options.detected(result);
        saving = true; options.saving(true);
        const account = await options.persist(result);
        completed = true;
        if (!disposed && options.isCurrent()) options.saved(result, account);
      } catch (failure: any) {
        // A quota, server or save error must not hammer the API on every poll.
        if (saving) { paused = true; stableProfile = ''; sawLoginAfterFailure = false; }
        if (!disposed && options.isCurrent() && (saving || !automatic)) options.failed(failure?.response?.data?.error?.message || failure?.response?.data?.message || failure?.message || '账号绑定失败，请重试');
      } finally { inFlight = false; if (saving && !disposed) options.saving(false); }
    },
  };
}

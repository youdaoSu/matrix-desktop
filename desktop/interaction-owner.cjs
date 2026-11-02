const { createOperationBudget } = require('./operation-budget.cjs');

// Short-lived proof from the official OWN profile. A partition or a matching
// nickname alone is not proof that private interaction records belong to a bind.
function createInteractionOwnerVerifier({ inspectAccountHealth, now = Date.now }) {
  const proofs = new Map(), pending = new Map();
  return async (event, input, ctx) => {
    const account = ctx.auth?.account, owner = ctx.auth?.userId;
    if (!owner || account?.id !== input.accountId || account.platform !== input.platform || account.connectorSessionId !== input.sessionId) throw Error('互动读取账号与绑定会话不一致，未读取');
    const bound = account.nativeAccountKey;
    if (!bound) throw Error('绑定尚未留存稳定的平台账号ID，请在账号管理完成自动核验；不会按同名账号读取私信');
    const key = [owner, account.id, input.platform, input.sessionId, bound].join(':');
    if (ctx.observedNativeAccountKey) {
      if (ctx.observedNativeAccountKey !== bound) { proofs.delete(key); throw Error('官网平台账号ID与绑定ID不同，已停止互动读取'); }
      proofs.set(key, now()); return ctx;
    }
    const previous = proofs.get(key);
    if (previous !== undefined && now() >= previous && now() - previous < 45000) return ctx;
    if (!inspectAccountHealth) throw Error('当前页面未显示本人账号ID，暂时无法安全读取互动数据');
    if (!pending.has(key)) {
      const work = (async () => {
        const state = await inspectAccountHealth(event, { accessToken: input.accessToken, accountId: input.accountId });
        if (state.state !== 'normal' || state.accountId !== account.id || state.sessionId !== input.sessionId || state.nativeAccountKey !== bound) throw Error(state.message || state.error || '尚未确认当前官方会话属于同一平台账号ID，保留旧数据，稍后自动重试');
        proofs.set(key, now());
        for (const [old, checkedAt] of proofs) if (now() - checkedAt >= 45000) proofs.delete(old);
        while (proofs.size > 200) proofs.delete(proofs.keys().next().value);
      })().finally(() => pending.delete(key));
      pending.set(key, work);
    }
    await createOperationBudget(12000).run(() => pending.get(key), '核验互动数据所属账号ID', 12000);
    return ctx;
  };
}
module.exports = { createInteractionOwnerVerifier };

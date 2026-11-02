const { createOperationBudget } = require('./operation-budget.cjs');
const { publicPageAction } = require('./page-action-lookup.cjs');
const safeError=error=>{const text=String(error?.message||'');return text.length<=500&&/[\u4e00-\u9fff]/.test(text)&&!/cookie|token|password|authorization|csrf|secret|密码|验证码/i.test(text)?text.replace(/https?:\/\/[^\s<>"']+/gi,'[网址已移除]'):'官方作品编号读取未完成；原发布状态保留，不会重发';};

function workReference(platform, value) {
  if (platform === 'wechat') return value?.workReferenceSource === 'official_work_card' && /^[1-9]\d{9,24}$/.test(value.workId || '') && value.workUrl === 'https://channels.weixin.qq.com/platform/post/list' ? { workId: value.workId, workUrl: value.workUrl, workReferenceSource: 'official_work_card' } : undefined;
  if (value?.workReferenceSource !== 'official_title_link') return;
  const formats = { bilibili: ['www.bilibili.com', /^\/video\/(BV[0-9A-Za-z]{10})\/?$/], douyin: ['www.douyin.com', /^\/video\/([1-9]\d{9,24})\/?$/], xiaohongshu: ['www.xiaohongshu.com', /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/] };
  try { const url = new URL(value.workUrl), format = formats[platform], match = format && url.hostname === format[0] && format[1].exec(url.pathname); if (url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && match?.[1] === value.workId) return { workId: value.workId, workUrl: url.origin + url.pathname, workReferenceSource: 'official_title_link' }; } catch {}
}

// A read-only enrichment, independent of the submission result. No submit,
// comment, upload or automatic retry capability is supplied to this module.
function createPublishReferenceCollector({ getWindow, authenticate, journal, openContext, timeoutMs = 45000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const pending = new Map();
  return async (event, input) => {
    let auth, original, context, ended = false;
    const budget = createOperationBudget(timeoutMs);
    try {
      const win = getWindow(); if (!win || event.sender.id !== win.webContents.id) throw Error('仅允许远效主窗口读取作品编号');
      auth = await budget.run(() => authenticate(input?.accessToken), '确认作品编号所属用户', 8000);
      original = journal.find(auth.userId, input?.receiptId);
      if (!original || original.ownerId !== auth.userId || original.kind !== 'publish' || !(original.status === 'confirmed' || Number.isFinite(Date.parse(original.acceptedAt||'')))) throw Error('没有属于当前用户的已发布或已接收投稿记录，未读取编号');
      const old = workReference(original.platform, original.evidence);
      if (old && (original.nativeAccountKey || original.referenceAttestation)) return { receipt: publicPageAction(original) };
      const lock = auth.userId + ':' + original.id;
      if (pending.has(lock)) return await pending.get(lock);
      const task = (async () => {
        const owned = await budget.run(() => authenticate(input.accessToken, original.accountId), '读取编号所属绑定账号', 8000), account = owned.account;
        const fresh = async () => {
          if (ended) throw Error('作品编号读取已结束');
          const current = await budget.run(() => authenticate(input.accessToken, original.accountId), '再次核对作品所属账号', 8000);
          if (current.userId !== auth.userId || current.account?.platform !== account.platform || current.account.connectorSessionId !== account.connectorSessionId || current.account.nativeAccountKey !== account.nativeAccountKey) throw Error('读取编号期间绑定账号已变化，未保存');
          return current;
        };
        const currentRecord = () => {
          const latest = journal.find(auth.userId, original.id);
          if (!latest || latest.ownerId !== auth.userId || latest.accountId !== original.accountId || latest.attemptId !== original.attemptId || latest.platform !== original.platform) throw Error('原作品执行记录已变化，未保存编号');
          return latest;
        };
        const note = (state, message, extra = {}) => { const latest = currentRecord(); const saved = { ...latest, referenceCollection: { state, message, checkedAt: new Date().toISOString(), ...extra } }; journal.write(saved); return { receipt: publicPageAction(saved) }; };
        try {
          if (owned.userId !== auth.userId || !account || account.id !== original.accountId || account.platform !== original.platform || !account.connectorSessionId || !account.nativeAccountKey) throw Error('当前绑定缺少稳定本人ID，尚未读取作品编号；请先恢复账号登录');
          if (original.nativeAccountKey && original.nativeAccountKey !== account.nativeAccountKey || original.sessionId && original.sessionId !== account.connectorSessionId && original.nativeAccountKey !== account.nativeAccountKey) throw Error('原回执与当前绑定不是同一稳定账号，未读取其他账号作品');
          context = await budget.run(() => openContext(event, input, account).then(value => { if (ended) { value.close(); throw Error('编号连接已结束'); } return value; }), '打开独立官方作品编号页', 30000);
          let last = '尚未读取到完整官方作品卡片';
          for (let attempt = 0; attempt < 8; attempt++) {
            await fresh();
            const result = await budget.run(() => context.readWork(original), '读取本条官方作品卡片编号', 6000);
            const reference = workReference(original.platform, result?.evidence);
            if ((result?.matched || result?.rejected || result?.pendingReview) && reference) {
              await budget.run(() => context.assertOwner(), '保存编号前核对官方本人ID', 10000); await fresh();
              const latest = currentRecord(), previous = workReference(latest.platform, latest.evidence);
              if (previous && previous.workId !== reference.workId || latest.evidence?.workId && latest.evidence.workId !== reference.workId) return note('conflict', '同一回执出现不同作品编号，原编号保留，未关联追评');
              const at = new Date().toISOString(), saved = { ...latest, evidence: { ...latest.evidence, ...reference }, referenceCollection: { state: 'confirmed', message: '已从本人官方作品卡片读取并保存准确编号', checkedAt: at }, referenceAttestation: { source: 'official_owned_work_id', workId: reference.workId, nativeAccountKey: account.nativeAccountKey, sessionId: account.connectorSessionId, observedAt: at }, referenceObservation: { publishedAt: result.evidence.publishedAt, statusText: result.evidence.statusText, pageUrl: result.evidence.pageUrl }, checkpoint: 'work_reference_saved' };
              journal.write(saved); return { receipt: publicPageAction(saved) };
            }
            last = result?.reason === 'ambiguous' ? '官网作品或编号不唯一，未猜测编号' : result?.reason === 'time_mismatch' ? '官网同名作品的时间与原提交不一致，未关联' : result?.reason === 'wrong_page' ? '官方作品页尚未就绪或登录已失效，稍后自动补取' : result?.matched || result?.pendingReview ? '已找到本条作品，但官网卡片尚未显示可用编号，稍后自动补取' : '本次已加载的官方列表尚未定位到原作品，稍后自动补取';
            if (['ambiguous', 'time_mismatch', 'missing_reference', 'not_published', 'visibility_mismatch'].includes(result?.reason)) break;
            await budget.run(() => sleep(500), '等待官方作品编号显示', 1000);
          }
          await fresh(); return note('pending', last);
        } catch (error) {
          // A late failure must never erase a number collected concurrently.
          const latest = currentRecord(); if (workReference(latest.platform, latest.evidence)) return { receipt: publicPageAction(latest) };
          return note('pending', safeError(error));
        } finally { ended = true; context?.close(); }
      })();
      pending.set(lock, task); try { return await task; } finally { pending.delete(lock); }
    } catch (error) { return { error: '作品编号读取未开始：' + safeError(error) }; }
  };
}
module.exports = { createPublishReferenceCollector, workReference };

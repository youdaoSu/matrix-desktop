// An elapsed-time boundary, not a retry mechanism. A timed-out platform action
// must not be replayed merely because its reply was lost.
function createOperationBudget(timeoutMs, now = Date.now) {
  const deadline = now() + timeoutMs;
  let expired = false;
  const check = () => { if (expired || now() >= deadline) { expired = true; throw Error('官方页面操作超时，已停止本次操作；不会重复执行'); } };
  return {
    check,
    async run(action, label = '检查官方页面', limitMs = 12000) {
      check(); let timer;
      try {
        const result = await Promise.race([Promise.resolve().then(() => { check(); return action(); }), new Promise((_, reject) => {
          timer = setTimeout(() => { expired = true; reject(Error(`${label}超时，已停止本次操作；不会重复执行`)); }, Math.min(limitMs, deadline - now()));
        })]);
        check(); return result;
      } finally { clearTimeout(timer); }
    },
  };
}
module.exports = { createOperationBudget };

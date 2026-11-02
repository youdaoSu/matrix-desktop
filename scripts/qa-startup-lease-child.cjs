// Fresh-process synchronization fixture. No service/database or real profile.
const { withStartupLease } = require('../desktop/startup-lease.cjs');
const scope = process.argv[2];
if (!scope || !process.send) throw Error('Only run through the startup lease QA parent');
withStartupLease(scope, async () => {
  process.send({ type: 'acquired' });
  await new Promise(resolve => process.once('message', message => { if (message?.type === 'release') resolve(); }));
}, { timeoutMs: 5000 }).then(() => { process.send({ type: 'released' }); process.disconnect(); }).catch(error => { process.send({ type: 'failed', message: error.message }); process.disconnect(); process.exitCode = 1; });

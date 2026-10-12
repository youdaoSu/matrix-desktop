const assert = require('node:assert/strict');
const { localServiceCsrf } = require('../desktop/local-service-session.cjs');
(async () => {
  let rows = [{ name: 'suda-csrf-token', domain: '127.0.0.1', path: '/', secure: true, session: true, value: 'fixture-only' }], query;
  const session = { cookies: { get: async filter => { query = filter; return rows; } } };
  assert.equal(await localServiceCsrf(session, 'http://127.0.0.1:3210'), 'fixture-only');
  assert.deepEqual(query, { domain: '127.0.0.1', name: 'suda-csrf-token' });
  await assert.rejects(localServiceCsrf(session, 'https://example.com'));
  const base = rows[0];
  for (const patch of [{ domain: 'example.com' }, { path: '/app/' }, { name: 'other' }, { value: '' }, { session: false, expirationDate: 1 }]) {
    rows = [{ ...base, ...patch }]; await assert.rejects(localServiceCsrf(session, 'http://127.0.0.1:3210'));
  }
  rows = [base, base]; await assert.rejects(localServiceCsrf(session, 'http://127.0.0.1:3210'));
  rows = []; await assert.rejects(localServiceCsrf(session, 'http://127.0.0.1:3210'));
  console.log(JSON.stringify({ localServiceCsrfChecks: 10, secretsPrinted: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });

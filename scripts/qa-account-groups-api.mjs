// Account/group mutation tests are restricted to the disposable regression database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.argv[2];
if (base !== 'http://127.0.0.1:3291') throw Error('Disposable account/group QA server required');
const page = await fetch(base + '/app/'), csrf = /suda-csrf-token=([^;]+)/.exec(page.headers.get('set-cookie') || '')?.[1];
const headers = { 'Content-Type': 'application/json', cookie: 'suda-csrf-token=' + csrf, 'x-suda-csrf-token': csrf };
const loginResponse = await fetch(base + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: 'demo', password: 'user123456' }) });
const login = (await loginResponse.json()).data; if (!login?.token) throw Error('Disposable user missing');
headers.Authorization = 'Bearer ' + login.token;
let checks = 0;
async function api(method, url, body, status = method === 'POST' && !url.endsWith('move-accounts') ? 201 : 200) {
  const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(response.status, status, method + ' ' + url + ' status'); checks++;
  const payload = await response.json(); return payload.data;
}
const run = randomUUID(); let account, custom, duplicate, groupedAccount;
try {
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => api('GET', '/api/platform/groups')));
  for (const groups of concurrent) assert.equal(groups.filter(g => g.isDefault).length, 1); checks++;
  const defaultGroup = concurrent[0].find(g => g.isDefault);
  const oldColor = defaultGroup.color;
  await api('PUT', '/api/platform/groups/' + defaultGroup.id, { color: '#EF476F' });
  assert.equal((await api('GET', '/api/platform/groups')).find(g => g.id === defaultGroup.id).color, '#ef476f'); checks++;
  await api('PUT', '/api/platform/groups/' + defaultGroup.id, { color: 'url(javascript:bad)' }, 400);
  await api('PUT', '/api/platform/groups/' + defaultGroup.id, { groupName: '不能改默认' }, 400);
  await api('PUT', '/api/platform/groups/' + defaultGroup.id, { sortOrder: 99 }, 400);
  await api('DELETE', '/api/platform/groups/' + defaultGroup.id, undefined, 400);
  account = await api('POST', '/api/platform/accounts/desktop', { platform: 'douyin', connectorSessionId: randomUUID(), nickname: 'QA group isolated ' + run });
  assert.equal(account.groupId, defaultGroup.id); assert.equal(account.groupName, defaultGroup.groupName); checks+=2;
  custom = await api('POST', '/api/platform/groups', { groupName: 'QA group ' + run });
  duplicate = await api('POST', '/api/platform/groups', { groupName: 'QA other ' + run });
  groupedAccount = await api('POST', '/api/platform/accounts/desktop', { platform: 'xiaohongshu', connectorSessionId: randomUUID(), nickname: 'QA selected group ' + run, groupId: custom.id });
  assert.equal(groupedAccount.groupId, custom.id); checks++;
  const groupedRebind = await api('POST', '/api/platform/accounts/desktop', { platform: 'xiaohongshu', connectorSessionId: groupedAccount.connectorSessionId, nickname: 'QA selected group rebound ' + run, groupId: defaultGroup.id });
  assert.equal(groupedRebind.id, groupedAccount.id); assert.equal(groupedRebind.groupId, custom.id); checks += 2;
  const invalidBind = { platform: 'douyin', connectorSessionId: randomUUID(), nickname: 'QA refused group ' + run };
  await api('POST', '/api/platform/accounts/desktop', { ...invalidBind, groupId: '../foreign-group' }, 400);
  for (const groupId of ['', null, 0, false, {}]) await api('POST', '/api/platform/accounts/desktop', { ...invalidBind, groupId }, 400);
  await api('POST', '/api/platform/accounts/desktop', { ...invalidBind, groupId: randomUUID() }, 404);
  // An existing account group owned by another disposable user is not a binding target.
  const secondUsername = 'qa_groups_' + run.replaceAll('-', '');
  const publicHeaders = { ...headers }; delete publicHeaders.Authorization;
  const registered = await fetch(base + '/api/auth/register', { method: 'POST', headers: publicHeaders, body: JSON.stringify({ username: secondUsername, password: 'QaGroups123!', nickname: 'QA isolated group owner' }) });
  assert.equal(registered.status, 201); checks++;
  const secondLogin = await fetch(base + '/api/auth/login', { method: 'POST', headers: publicHeaders, body: JSON.stringify({ username: secondUsername, password: 'QaGroups123!' }) });
  const second = (await secondLogin.json()).data;
  if (second?.token) {
    const secondGroups = await fetch(base + '/api/platform/groups', { headers: { ...headers, Authorization: 'Bearer ' + second.token } }).then(r => r.json());
    assert.ok(secondGroups.data?.[0]?.id); checks++;
    await api('POST', '/api/platform/accounts/desktop', { ...invalidBind, groupId: secondGroups.data[0].id }, 404);
  } else throw Error('Second disposable user missing for group ownership test');
  await api('PUT', '/api/platform/groups/' + duplicate.id, { groupName: custom.groupName }, 409);
  const moved = await api('POST', '/api/platform/groups/move-accounts', { accountIds: [account.id], groupId: custom.id }); assert.equal(moved.moved, 1); checks++;
  const rebound = await api('POST', '/api/platform/accounts/desktop', { platform: 'douyin', connectorSessionId: account.connectorSessionId, nickname: 'QA renamed ' + run });
  assert.equal(rebound.groupId, custom.id); checks++;
  await api('POST', '/api/platform/groups/move-accounts', { accountIds: [account.id, randomUUID()], groupId: defaultGroup.id }, 404);
  assert.equal((await api('GET', '/api/platform/accounts/' + account.id + '/detail')).groupId, custom.id); checks++;
  await api('POST', '/api/platform/groups/move-accounts', { accountIds: [account.id], groupId: randomUUID() }, 404);
  await api('DELETE', '/api/platform/groups/' + custom.id); custom = undefined;
  const recovered = await api('GET', '/api/platform/accounts/' + account.id + '/detail'); assert.equal(recovered.groupId, defaultGroup.id); assert.equal(recovered.groupName, defaultGroup.groupName); checks+=2;
  await api('PUT', '/api/platform/groups/' + defaultGroup.id, { color: oldColor });
  console.log(JSON.stringify({ accountGroupApiChecks: checks, concurrentDefaultGroups: 1, failedMixedMoveAtomic: true, realUserDataTouched: false }));
} finally {
  if (groupedAccount) await api('DELETE', '/api/platform/accounts/' + groupedAccount.id);
  if (account) await api('DELETE', '/api/platform/accounts/' + account.id);
  if (custom) await api('DELETE', '/api/platform/groups/' + custom.id);
  if (duplicate) await api('DELETE', '/api/platform/groups/' + duplicate.id);
}

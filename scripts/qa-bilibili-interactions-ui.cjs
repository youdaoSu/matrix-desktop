// Invoked inside the offline disposable Chromium interaction QA runner.
async function runBilibiliInteractionUiTests(host) {
  const path = require('node:path'), React = require('react'), { createRoot } = require('react-dom/client'), assert = require('node:assert/strict');
  const { loadTs } = require('./qa-load-typescript.cjs'), root = path.resolve(__dirname, '..'), cache = new Map();
  const stub = (file, exports) => cache.set(path.join(root, file), { exports });
  let owner = 'qa-bili-owner', token = 'qa-bili-token', opened = 0, calls = [], failure = false, checks = 0, exported = 0;
  const a = { id: 'qa-bili-a', nickname: 'QA B站甲', platform: 'bilibili', connectorSessionId: 'qa-bili-session-a', nativeAccountKey: '42' }, b = { ...a, id: 'qa-bili-b', nickname: 'QA B站乙', connectorSessionId: 'qa-bili-session-b', nativeAccountKey: '43' };
  const accounts = [a, b, { ...a, id: 'qa-douyin', platform: 'douyin', nickname: '不可混入' }];
  const workspace = { jobsLocked: false, openAccount: () => { opened++; } };
  const previousDesktop = window.matrixDesktop;
  stub('client/src/api/index.ts', { getUser: () => ({ id: owner }), getAuthToken: () => token });
  stub('client/src/components/workspace/OfficialWorkspace.tsx', { useOfficialWorkspace: () => workspace });
  stub('client/src/components/workspace/publish-preferences.ts', { loadPublishAccounts: async () => accounts });
  stub('client/src/components/workspace/AccountAvatar.tsx', { AccountAvatar: ({ account }) => React.createElement('span', null, account.nickname) });
  stub('client/src/components/workspace/InteractionUi.tsx', { InteractionEmpty: ({ children }) => React.createElement('p', null, children), exportInteractionRecords: () => exported++ });
  let read = async input => {
    calls.push(input); if (failure) return { error: 'QA平台拒绝读取，旧记录保留' };
    return { accountId: input.accountId, sessionId: accounts.find(row => row.id === input.accountId).connectorSessionId, platform: 'bilibili', kind: input.kind, records: [{ platformId: input.cursor ? 'qa-second' : 'qa-first', author: 'QA真实结构摘要', content: 'QA隔离数据', unreadState: 'unread', unreadCount: 3 }], source: 'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions', capturedAt: new Date().toISOString(), complete: Boolean(input.cursor), nextCursor: input.cursor ? undefined : 'qa-only-cursor', coverage: '仅摘要' };
  };
  window.matrixDesktop = { bilibiliInteractions: input => read(input) };
  const { BilibiliInteractionFeed } = loadTs('client/src/components/workspace/BilibiliInteractionFeed.tsx', cache);
  const panel = document.createElement('div'); host.append(panel); const component = createRoot(panel);
  let kind = 'messages', selected = null;
  const render = () => component.render(React.createElement(BilibiliInteractionFeed, { key: owner + ':' + token + ':' + kind, kind, account: selected }));
  const pause = () => new Promise(resolve => setTimeout(resolve, 15));
  const until = async (predicate, label) => { for (let n = 0; n < 250; n++) { if (predicate()) return; await pause(); } throw Error(label + '\n' + panel.innerText); };
  const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
  const text = () => panel.innerText, rows = () => panel.querySelectorAll('.matrix-live-records article');
  const buttons = label => [...panel.querySelectorAll('button')].filter(button => button.textContent === label);
  try {
    render(); await until(() => rows().length === 4 && text().includes('本轮可访问分页已读完'), 'automatic native page feed');
    eq(calls.map(input => input.accountId).sort(), [a.id, a.id, b.id, b.id]); eq(opened, 0); eq(text().includes('完整聊天历史'), true); eq(text().includes('平台未读 3'), true); eq(text().includes('不可混入'), false);
    selected = a; render(); await until(() => rows().length === 2, 'same-platform account display filter'); eq(calls.length, 4);
    buttons('导出已读取记录')[0].click(); eq(exported, 1);
    failure = true; buttons('重新读取')[0].click(); await until(() => text().includes('QA平台拒绝读取'), 'precise failure'); eq(rows().length, 2); eq(opened, 0);
    workspace.jobsLocked = true; render(); await until(() => buttons('重新读取').every(button => button.disabled), 'publisher pause'); const before = calls.length; buttons('重新读取')[0].click(); await pause(); eq(calls.length, before);
    workspace.jobsLocked = false; selected = null; kind = 'comments'; failure = false; render(); await until(() => text().includes('等待本人作品BV号'), 'comments require exact work id'); eq(rows().length, 0); eq(calls.length, before);
    let release; kind = 'messages'; owner = 'qa-new-owner'; token = 'qa-new-token'; read = input => new Promise(resolve => { release = () => resolve({ accountId: input.accountId, sessionId: a.connectorSessionId, platform: 'bilibili', kind: input.kind, records: [{ platformId: 'late', author: '不能泄漏', content: '迟到数据' }], source: 'https://api.bilibili.com/qa', capturedAt: new Date().toISOString(), complete: true }); });
    render(); await until(() => release, 'delayed source'); owner = 'qa-third-owner'; token = 'qa-third-token'; kind = 'comments'; render(); await until(() => text().includes('等待本人作品BV号'), 'owner switch'); release(); await pause(); eq(text().includes('不能泄漏'), false); eq(rows().length, 0); eq(opened, 0);
    return { bilibiliInteractionReactChecks: checks, nativeFeedPopulatedFromPagedFixtures: true, avatarFiltersDisplayOnly: true, noOfficialWindowOrConversationOpened: true, lateOtherOwnerIgnored: true, realPlatformRequests: 0 };
  } finally { component.unmount(); panel.remove(); window.matrixDesktop = previousDesktop; }
}
module.exports = { runBilibiliInteractionUiTests };

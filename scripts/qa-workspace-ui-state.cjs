// Real React state restoration in an offline disposable profile. UI preferences
// only: no browser conversation, read acknowledgement, send or task execution.
async function runWorkspaceUiStateTests(container) {
  const assert = require('node:assert/strict'), React = require('react'), { createRoot } = require('react-dom/client'), path = require('node:path');
  const { loadTs } = require('./qa-load-typescript.cjs'), root = path.resolve(__dirname, '..');
  const originalStorage = window.localStorage, values = new Map(); let blocked = false, owner = 'qa-ui-owner', token = 'qa-ui-token', checks = 0;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (blocked) throw Error('QA storage full'); values.set(key, String(value)); }, removeItem: key => values.delete(key) };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  const host = document.createElement('div'); container.append(host); const component = createRoot(host);
  const pause = () => new Promise(resolve => setTimeout(resolve, 15));
  const until = async (fn, label) => { for (let n = 0; n < 100; n++) { if (fn()) return; await pause(); } throw Error('UI state fixture timeout: ' + label); };
  const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
  const key = (name, id = owner) => `matrix-ui:v1:${id}:${name}`;
  let staleSetPlatform, actions;
  function runtime() {
    const cache = new Map(); cache.set(path.join(root, 'client/src/api/index.ts'), { exports: { getUser: () => owner ? { id: owner } : null, getAuthToken: () => token } });
    const ui = loadTs('client/src/components/workspace/WorkspaceUiState.ts', cache), interaction = loadTs('client/src/components/workspace/InteractionState.ts', cache);
    const accounts = [{ id: 'qa-d', platform: 'douyin', connectorSessionId: 'qa-d-session' }, { id: 'qa-b', platform: 'bilibili', connectorSessionId: 'qa-b-session' }];
    let currentAccounts = accounts;
    function Panel({ name }) {
      const [platform, setPlatform] = interaction.useInteractionPlatform();
      const [search, setSearch] = ui.useWorkspacePreference(`interaction.${name}.${platform}.search`, '', ui.uiText);
      const [unread, setUnread] = ui.useWorkspacePreference(`interaction.${name}.${platform}.unread`, false, ui.uiBoolean);
      const [account, setAccount] = interaction.useInteractionAccount(platform, name, currentAccounts, true);
      if (name === 'comments') actions = { setPlatform, setSearch, setUnread, setAccount, accounts, replaceAccounts: next => { currentAccounts = next; } };
      return React.createElement('div', { 'data-qa-ui-panel': name, 'data-platform': platform, 'data-search': search, 'data-unread': String(unread), 'data-account': account?.id || 'all' });
    }
    return { ui, Panel };
  }
  const panel = name => host.querySelector(`[data-qa-ui-panel="${name}"]`);
  let current = runtime();
  const render = (onlyComments = false) => component.render(React.createElement(React.Fragment, null, React.createElement(current.Panel, { name: 'comments' }), !onlyComments && React.createElement(current.Panel, { name: 'messages' })));
  const remount = async (freshRuntime = false) => { component.render(null); await pause(); if (freshRuntime) current = runtime(); render(); await until(() => panel('messages'), 'remount'); };
  try {
    render(); await until(() => panel('comments'), 'initial'); eq(panel('comments').dataset.platform, 'douyin'); eq(panel('messages').dataset.platform, 'douyin');
    actions.setPlatform('bilibili'); await until(() => panel('messages').dataset.platform === 'bilibili', 'shared platform');
    eq(panel('comments').dataset.platform, 'bilibili'); eq(JSON.parse(values.get(key('interaction.platform'))), 'bilibili');
    actions.setSearch('QA B站搜索'); actions.setUnread(true); actions.setAccount(actions.accounts[1]);
    await until(() => panel('comments').dataset.account === 'qa-b', 'account selection');
    eq(panel('messages').dataset.account, 'all'); eq(panel('messages').dataset.search, '');
    actions.setPlatform('douyin'); await until(() => panel('comments').dataset.platform === 'douyin', 'per-platform isolation'); eq(panel('comments').dataset.search, ''); eq(panel('comments').dataset.unread, 'false'); eq(panel('comments').dataset.account, 'all');
    actions.setAccount(actions.accounts[0]); actions.setPlatform('bilibili'); await until(() => panel('comments').dataset.account === 'qa-b', 'platform restores own account');
    eq(panel('comments').dataset.search, 'QA B站搜索'); eq(panel('comments').dataset.unread, 'true');
    await remount(); eq(panel('messages').dataset.platform, 'bilibili'); eq(panel('comments').dataset.account, 'qa-b');
    await remount(true); eq(panel('messages').dataset.platform, 'bilibili'); eq(panel('comments').dataset.search, 'QA B站搜索'); eq(panel('comments').dataset.account, 'qa-b');
    // Same account ID with a replacement connector may not revive the old selection.
    actions.replaceAccounts([{ ...actions.accounts[1], connectorSessionId: 'qa-rebound' }]); render(); await until(() => panel('comments').dataset.account === 'all', 'rebound invalidation'); await pause(); eq(JSON.parse(values.get(key('interaction.comments.bilibili.account'))), null);
    actions.replaceAccounts(actions.accounts); actions.setAccount(actions.accounts[1]); render(); await until(() => panel('comments').dataset.account === 'qa-b', 'select again');
    actions.replaceAccounts([]); render(); await until(() => panel('comments').dataset.account === 'all', 'deleted account invalidation'); await pause(); eq(JSON.parse(values.get(key('interaction.comments.bilibili.account'))), null);
    staleSetPlatform = actions.setPlatform; owner = 'qa-ui-other'; token = 'qa-ui-other-token'; window.dispatchEvent(new Event('matrix:auth-updated'));
    await until(() => panel('messages').dataset.platform === 'douyin', 'other owner default'); eq(panel('comments').dataset.search, ''); staleSetPlatform('wechat'); await pause(); eq(panel('messages').dataset.platform, 'douyin'); eq(values.has(key('interaction.platform')), false);
    actions.setPlatform('wechat'); await until(() => panel('comments').dataset.platform === 'wechat', 'other owner choice');
    owner = 'qa-ui-owner'; token = 'qa-ui-new-token'; window.dispatchEvent(new Event('matrix:auth-updated')); await until(() => panel('comments').dataset.platform === 'bilibili', 'original owner restored'); eq(panel('comments').dataset.search, 'QA B站搜索');
    // A separate window's storage change is shared without writing to the platform.
    values.set(key('interaction.platform'), JSON.stringify('wechat')); window.dispatchEvent(new StorageEvent('storage', { key: key('interaction.platform') })); await until(() => panel('messages').dataset.platform === 'wechat', 'storage event'); eq(panel('comments').dataset.platform, 'wechat');
    values.set(key('interaction.platform'), '{broken'); await remount(true); eq(panel('comments').dataset.platform, 'douyin');
    values.set(key('interaction.platform'), JSON.stringify('not-a-platform')); await remount(true); eq(panel('comments').dataset.platform, 'douyin');
    blocked = true; actions.setPlatform('bilibili'); await until(() => panel('messages').dataset.platform === 'bilibili', 'storage failure memory fallback'); await remount(); eq(panel('comments').dataset.platform, 'bilibili'); blocked = false;
    eq(current.ui.uiDate('2026-02-31'), false); eq(current.ui.uiDate('2026-99-99'), false); eq(current.ui.uiDate('2026-10-20'), true); eq(current.ui.uiDate(''), true); eq(current.ui.uiPage(-1), false); eq(current.ui.uiPage(999999999), false); eq(current.ui.uiText('x'.repeat(501)), false);
    owner = ''; token = ''; window.dispatchEvent(new Event('matrix:auth-updated')); await until(() => panel('comments').dataset.platform === 'douyin', 'logout'); actions.setPlatform('wechat'); await pause(); eq(panel('comments').dataset.platform, 'douyin');
    eq([...values.keys()].some(item => item.startsWith('matrix-ui:v1::')), false);
    eq([...values.values()].some(item => item.includes('qa-ui-token') || item.includes('qa-ui-new-token')), false);
    return { workspaceUiPersistenceChecks: checks, sharedInteractionPlatform: true, restartAndOwnerIsolation: true, accountRebindAndRemovalInvalidateSelection: true, onlyDisplayPreferencesRestored: true, realPlatformActions: 0 };
  } finally { component.unmount(); host.remove(); Object.defineProperty(window, 'localStorage', { value: originalStorage, configurable: true }); }
}
module.exports = { runWorkspaceUiStateTests };

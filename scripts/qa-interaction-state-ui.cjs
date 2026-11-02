// Real React interaction workbench, isolated in-memory APIs/storage only.
// No official conversation, real local snapshot, or outbound message is touched.
async function runInteractionStateUiTests() {
  const assert = require('node:assert/strict'), React = require('react'), path = require('node:path');
  const {createRoot} = require('react-dom/client'), {loadTs} = require('./qa-load-typescript.cjs');
  const root = path.resolve(__dirname, '..'), cache = new Map(), overrides = new Map();
  const stub = (file, exports) => cache.set(path.join(root, file), {exports});
  let owner = 'qa-interaction-owner', token = 'qa-interaction-token', reads = 0, listReads = 0, opened = 0, checks = 0, mountId = 0;
  const values = new Map(), storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key)};
  const previousStorage = Object.getOwnPropertyDescriptor(window, 'localStorage'), previousDesktop = window.matrixDesktop;
  Object.defineProperty(window, 'localStorage', {value: storage, configurable: true});
  const preferences = {retainInteractionSnapshots: true};
  const account = {id: 'qa-a', platform: 'douyin', nickname: 'QA account A', connectorSessionId: 'qa-only-session-a'};
  const second = {...account, id: 'qa-b', nickname: 'QA account B', connectorSessionId: 'qa-only-session-b'};
  const source = 'https://www.douyin.com/qa-visible-conversations', capturedAt = '2026-10-18T18:00:00.000Z';
  const data = (author = 'QA visible contact', content = 'QA last visible preview') => ({records: [{platformId: 'qa-conversation', author, content, unreadState: 'unread', unreadCount: 3}], source, capturedAt});
  const key = (id = account.id, kind = 'messages') => `matrix-interaction-v1:${owner}:${id}:${kind}`;
  const seed = () => storage.setItem(key(), JSON.stringify({...data(), records: [{...data().records[0], note: 'original note', handled: false}]}));
  let readHandler = async () => data(), listHandler = async () => [account, second];
  stub('client/src/api/index.ts', {getUser: () => ({id: owner}), getAuthToken: () => token});
  stub('client/src/contexts/AppPreferences.ts', {useAppPreferences: () => preferences});
  stub('client/src/components/workspace/publish-preferences.ts', {loadPublishAccounts: async options => {listReads++; assert.ok(options.signal instanceof AbortSignal); return listHandler(options);}});
  stub('client/src/components/workspace/OfficialWorkspace.tsx', {platformLabels: {douyin: '抖音'}, useOfficialWorkspace: () => ({page: id => () => ({accountId: id, webContentsId: id === account.id ? 12 : 13}), openAccount: async () => {opened++;}})});
  stub('client/src/components/workspace/DouyinCommentAction.tsx', {DouyinCommentAction: () => {throw Error('No message fixture may mount a comment action');}});
  window.matrixDesktop = {officialData: async input => {assert.equal(input.command, 'read-interactions'); assert.equal(input.kind, 'messages'); reads++; return readHandler(input);}};
  const {OfficialInteractionManager} = loadTs('client/src/components/workspace/OfficialInteractionManager.tsx', cache, overrides);
  const component = createRoot(document.getElementById('root')), pause = () => new Promise(resolve => setTimeout(resolve, 12));
  const until = async (predicate, label = '') => {for (let n = 0; n < 160; n++) {if (predicate()) return; await pause();} throw Error('Interaction fixture timed out ' + label + ': ' + document.body.innerText.slice(0, 700));};
  const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
  const readButton = () => button('读取当前可见记录') || button('读取中…');
  const note = () => document.querySelector('article input[placeholder^="本地备注"]');
  const handled = () => document.querySelector('article input[type="checkbox"]');
  const change = (element, value) => {Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', {bubbles: true}));};
  let props;
  const render = () => component.render(React.createElement(OfficialInteractionManager, {key: mountId, ...props}));
  const mount = async (selectedAccount = account) => {const previous = readButton(); mountId++; props = {account: selectedAccount, kind: 'messages'}; render(); await until(() => (!previous || !previous.isConnected) && (selectedAccount ? readButton() : document.querySelector('select')), 'mounted'); await pause();};
  const beginHeldRead = async () => {let release; const before = reads; readHandler = () => new Promise(resolve => release = resolve); readButton().click(); await until(() => release && reads === before + 1, 'read pending'); return release;};
  const originalTimer = global.setTimeout;
  try {
    seed(); await mount(); await until(note); assert.equal(listReads, 0, 'A supplied bound account must not cause redundant account-list queries'); checks++;
    let release = await beginHeldRead();
    change(note(), 'latest note while reading'); handled().click(); await pause(); release(data('QA updated contact', 'new visible preview'));
    await until(() => !readButton().disabled && document.body.textContent.includes('QA updated contact'));
    assert.equal(note().value, 'latest note while reading'); assert.equal(handled().checked, true); assert.equal(document.querySelector('article').getAttribute('data-snapshot-unread'), 'unread'); assert.match(document.querySelector('article').textContent, /平台未读 3/); checks += 4;
    let pending = [], beforeReads = reads; readHandler = () => new Promise(resolve => pending.push(resolve));
    readButton().click(); readButton().click(); await until(() => pending.length); assert.equal(reads, beforeReads + 1); checks++;
    button('停止等待读取').click(); await until(() => !readButton().disabled); assert.equal(note().value, 'latest note while reading'); pending[0](data('QA cancelled late result')); await pause(); assert.ok(!document.body.textContent.includes('QA cancelled late result')); assert.equal(handled().checked, true); checks += 3;
    let expire; global.setTimeout = (fn, milliseconds, ...args) => {if (milliseconds === 20000) expire = fn; return originalTimer(fn, milliseconds, ...args);};
    release = await beginHeldRead(); await until(() => expire); expire(); await until(() => !readButton().disabled); assert.match(document.body.textContent, /等待超过20秒/); release(data('QA timeout late result')); await pause(); assert.ok(!document.body.textContent.includes('QA timeout late result')); assert.equal(note().value, 'latest note while reading'); checks += 3;
    global.setTimeout = originalTimer;
    release = await beginHeldRead(); storage.removeItem(key()); window.dispatchEvent(new Event('matrix:interaction-snapshots-cleared')); await until(() => !note() && !readButton().disabled); release(data('QA cleared late result')); await pause(); assert.equal(note(), null); assert.ok(!document.body.textContent.includes('QA cleared late result')); checks += 2;
    readHandler = async () => data(); readButton().click(); await until(note); assert.match(document.querySelector('article').textContent, /平台未读 3/); checks++;
    window.dispatchEvent(new CustomEvent('matrix:interaction-snapshots-cleared', {detail: {key: key(second.id)}})); await pause(); assert.ok(note(), 'Clearing another account must not erase this unsaved snapshot'); checks++;
    release = await beginHeldRead(); button('清除本地快照').click(); await until(() => button('确认清除本地快照')); button('确认清除本地快照').click(); await until(() => !note() && !readButton().disabled); release(data('QA explicit clear late result')); await pause(); assert.equal(note(), null); assert.equal(storage.getItem(key()), null); checks += 2;
    seed(); await mount(); await until(note); release = await beginHeldRead(); preferences.retainInteractionSnapshots = false; render(); await until(() => !note() && !readButton().disabled); release(data('QA privacy preference late result')); await pause(); assert.equal(note(), null); assert.ok(storage.getItem(key()), 'Disabling retention must not delete an existing file implicitly'); checks += 2;
    readHandler = async () => data(); readButton().click(); await until(note); assert.equal(button('保存本地快照').disabled, true); checks++;
    change(note(), 'newer temporary note'); await pause(); preferences.retainInteractionSnapshots = true; render(); await until(() => !button('保存本地快照').disabled); assert.equal(note().value, 'newer temporary note'); checks++;
    await mount(); await until(note); release = await beginHeldRead(); props = {account: second, kind: 'messages'}; render(); await until(() => !note() && readButton() && !readButton().disabled); release(data('QA previous account result')); await pause(); assert.ok(!document.body.textContent.includes('QA previous account result')); checks++;
    listHandler = async () => [account, second]; await mount(null); await until(() => document.querySelector('select').options.length === 3);
    let select = document.querySelector('select'); select.value = account.id; select.dispatchEvent(new Event('change', {bubbles: true})); await until(readButton);
    listHandler = async () => [{...account, nickname: 'QA newly renamed'}, second]; window.dispatchEvent(new Event('matrix:accounts-updated')); await until(() => document.querySelector('select').textContent.includes('QA newly renamed')); assert.equal(document.querySelector('select').value, account.id); checks++;
    listHandler = async () => [second]; window.dispatchEvent(new Event('matrix:accounts-updated')); await until(() => document.querySelector('select').value === '' && !readButton()); assert.ok(!document.body.textContent.includes('QA newly renamed')); checks++;
    let releaseList; listHandler = () => new Promise(resolve => releaseList = resolve); await mount(null); await until(() => releaseList); owner = 'qa-other-owner'; token = 'qa-other-token'; listHandler = async () => [second]; render(); await until(() => document.querySelector('select').textContent.includes('QA account B')); releaseList([account]); await pause(); assert.ok(!document.querySelector('select').textContent.includes('QA account A')); checks++;
    assert.equal(opened, 0); checks++;
    return {interactionStateReactChecks: checks,actualWorkbench:true,latestLocalNotesRetained:true,duplicateReadBlocked:true,timeoutAndCancelBounded:true,lateClearedOrForeignOwnerResultsIgnored:true,accountUpdatesAndUnbindReflected:true,unreadUnchangedByLocalActions:true,realPlatformActions:false};
  } finally {global.setTimeout = originalTimer; component.unmount(); window.matrixDesktop = previousDesktop; if (previousStorage) Object.defineProperty(window, 'localStorage', previousStorage); else delete window.localStorage;}
}
module.exports = {runInteractionStateUiTests};

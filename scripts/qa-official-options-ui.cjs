// Actual option dialog and lifecycle, inert in-memory official-data boundary.
async function runOfficialOptionsUiTests() {
  const assert = require('node:assert/strict'), React = require('react'), path = require('node:path');
  const {createRoot} = require('react-dom/client'), {loadTs} = require('./qa-load-typescript.cjs');
  const root = path.resolve(__dirname, '..'), cache = new Map(), stub = (file, exports) => cache.set(path.join(root, file), {exports});
  let owner = 'qa-option-owner', token = 'qa-option-token', props, calls = [], selections = [], opened = [], checks = 0;
  let pageInput = {platform: 'xiaohongshu', accountId: 'qa-a', sessionId: 'qa-session-a', webContentsId: 12};
  const account = {id: 'qa-a', platform: 'xiaohongshu', connectorSessionId: 'qa-session-a', nickname: 'QA A'};
  let handler = async input => input.command === 'options' ? {nonce: 'qa-nonce', items: [{index: 0, label: 'QA unique item'}], source: 'https://creator.xiaohongshu.com/publish/publish', capturedAt: new Date().toISOString()} : {applied: true};
  const previousDesktop = window.matrixDesktop;
  stub('client/src/api/index.ts', {getUser: () => ({id: owner}), getAuthToken: () => token});
  stub('client/src/components/workspace/OfficialWorkspace.tsx', {useOfficialWorkspace: () => ({page: () => () => ({...pageInput}), openAccount: async (account, intent) => opened.push({id: account.id, intent})})});
  window.matrixDesktop = {officialData: async input => {calls.push(input); return handler(input);}};
  const {OfficialOptionPicker} = loadTs('client/src/components/workspace/OfficialOptionPicker.tsx', cache);
  const component = createRoot(document.getElementById('root')), pause = () => new Promise(resolve => setTimeout(resolve, 12));
  const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
  const until = async (fn, label = '') => {for (let n = 0; n < 150; n++) {if (fn()) return; await pause();} throw Error('Official option UI timeout ' + label + ': ' + document.body.innerText.slice(0, 500));};
  const render = () => component.render(React.createElement(OfficialOptionPicker, props));
  const open = async () => {button('选择官方' + props.field).click(); await until(() => button('读取当前候选项'));};
  const read = async () => {button('读取当前候选项').click(); await until(() => button('QA unique item'));};
  props = {account, field: '合集', onSelect: label => selections.push({owner, accountId: props.account.id, label})};
  const originalTimer = global.setTimeout;
  try {
    render(); await until(() => button('选择官方合集')); await open(); await read(); assert.equal(selections.length, 0); button('QA unique item').click(); await until(() => selections.length === 1); assert.equal(calls.at(-1).nonce, 'qa-nonce'); assert.equal(calls.at(-1).field, '合集'); assert.equal(selections[0].accountId, account.id); checks += 4;
    await read(); props = {...props, account: {...account, id: 'qa-b', nickname: 'QA B', connectorSessionId: 'qa-session-b'}}; pageInput = {...pageInput, accountId: 'qa-b', sessionId: 'qa-session-b'}; render(); await until(() => !document.querySelector('[role="dialog"]')); await open(); assert.equal(button('QA unique item'), undefined); checks++;
    await read(); props = {...props, field: '音乐'}; render(); await until(() => button('选择官方音乐') && !document.querySelector('[role="dialog"]')); await open(); assert.equal(button('QA unique item'), undefined); checks++;
    await read(); const beforeSwitch = calls.length; pageInput = {...pageInput, webContentsId: 0, edgeGuestId: 'qa-new-native-guest'}; button('QA unique item').click(); await until(() => document.body.textContent.includes('子页面或登录会话已切换')); assert.equal(calls.length, beforeSwitch); assert.equal(selections.length, 1); checks += 2;
    await read(); const oldCount = calls.length; pageInput = {...pageInput, edgeGuestId: 'qa-another-native-guest'}; button('QA unique item').click(); await until(() => !button('QA unique item')); assert.equal(calls.length, oldCount); checks++;
    let release; handler = () => new Promise(resolve => release = resolve); button('读取当前候选项').click(); await until(() => release && button('停止等待')); button('停止等待').click(); await until(() => button('读取当前候选项')?.disabled === false); release({nonce: 'late', items: [{index: 0, label: 'QA late cancelled item'}]}); await pause(); assert.equal(button('QA late cancelled item'), undefined); assert.equal(selections.length, 1); checks += 2;
    let expire; global.setTimeout = (fn, ms, ...args) => {if (ms === 20000) expire = fn; return originalTimer(fn, ms, ...args);};
    handler = () => new Promise(resolve => release = resolve); release = undefined; button('读取当前候选项').click(); await until(() => release && expire); expire(); await until(() => button('读取当前候选项')?.disabled === false); assert.match(document.body.textContent, /等待超过20秒/); release({nonce: 'late', items: [{index: 0, label: 'QA timed out item'}]}); await pause(); assert.equal(button('QA timed out item'), undefined); checks += 2;
    global.setTimeout = originalTimer;
    handler = async () => ({nonce: 'fresh', items: [{index: 0, label: 'QA unique item'}]}); await read();
    let selectRelease; handler = input => {assert.equal(input.command, 'select-option'); return new Promise(resolve => selectRelease = resolve);};
    const beforeSelect = calls.length; button('QA unique item').click(); await until(() => selectRelease); button('停止等待').click(); await until(() => button('读取当前候选项')?.disabled === false); selectRelease({applied: true}); await pause(); assert.equal(selections.length, 1); assert.equal(calls.length, beforeSelect + 1); assert.match(document.body.textContent, /不会自动再次点击/); checks += 3;
    handler = () => new Promise(resolve => release = resolve); release = undefined; button('读取当前候选项').click(); await until(() => release); props = {...props, disabled: true}; render(); await until(() => !document.querySelector('[role="dialog"]')); release({items: [{index: 0, label: 'QA disabled late item'}]}); await pause(); assert.equal(button('QA disabled late item'), undefined); assert.equal(selections.length, 1); checks += 2;
    props = {...props, disabled: false}; render(); await until(() => !button('选择官方音乐').disabled); await open(); button('打开账号发布页').click(); await until(() => opened.length); assert.equal(opened[0].intent, 'publish'); assert.equal(opened[0].id, 'qa-b'); checks += 2;
    await open(); handler = () => new Promise(resolve => release = resolve); release = undefined; button('读取当前候选项').click(); await until(() => release); owner = 'qa-other-owner'; token = 'qa-other-token'; render(); await until(() => !document.querySelector('[role="dialog"]')); release({items: [{index: 0, label: 'QA prior owner item'}]}); await pause(); assert.equal(button('QA prior owner item'), undefined); assert.equal(selections.length, 1); checks += 2;
    return {officialOptionReactChecks: checks,actualDialog:true,accountFieldSessionAndNativeGuestScoped:true,cancelAndTimeoutCannotApplyLateSelection:true,uncertainSelectionNotRetried:true,disabledAndForeignOwnerResultsIgnored:true,opensPublishNotAccountBinding:true,realOfficialActions:false};
  } finally {global.setTimeout = originalTimer; component.unmount(); window.matrixDesktop = previousDesktop;}
}
module.exports = {runOfficialOptionsUiTests};

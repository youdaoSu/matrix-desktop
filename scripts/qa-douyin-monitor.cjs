const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { registerDouyinInteraction } = require('../desktop/douyin-interaction.cjs');
const compiled = ts.transpile(fs.readFileSync(require.resolve('../shared/douyin-monitor.ts'), 'utf8'), { module: ts.ModuleKind.CommonJS });
const exportsObject = {};
new Function('exports', compiled)(exportsObject);
const captured = '2026-10-12T12:00:00Z', now = Date.parse(captured);
for (const [text, expected] of [['刚刚', now], ['2分钟前·上海', now - 120000], ['2小时前', now - 7200000], ['1天前', now - 86400000], ['2026-10-11 09:30', Date.parse('2026-10-11T09:30:00+08:00')], ['时间未识别', undefined]]) {
  assert.equal(exportsObject.displayedCommentTime(text, captured), expected);
}
assert.equal(exportsObject.displayedCommentTime('刚刚', 'invalid'), undefined);
(async () => {
  const handlers = {}, commands = [];
  let url = 'https://www.douyin.com/user/self';
  const guest = { id: 1, getURL: () => url, loadURL: async value => { url = value; }, executeJavaScriptInIsolatedWorld: async (_world, scripts) => {
    const code = scripts[0].code;
    const [command] = JSON.parse('[' + code.slice(code.lastIndexOf('})("') + 3, code.lastIndexOf('); } catch')) + ']');
    commands.push(command);
    if (command === 'works') return { nickname: 'QA owner', urls: ['https://www.douyin.com/video/123456'], ended: true };
    if (command === 'comments') return { records: [{ author: 'QA reader', content: 'comment' }], ended: true, source: url, capturedAt: captured };
    return { opened: true };
  } };
  registerDouyinInteraction({ ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, context: async () => ({ guest, auth: { userId: 'QA', account: { nickname: 'QA owner' } } }), sleep: async () => {} });
  const scan = input => handlers['matrix:douyin-comment-scan']({}, { platform: 'douyin', accountId: 'owned-account', ...input });
  assert.ok((await scan({ operation: 'scan', videoUrl: 'https://www.douyin.com/video/123456' })).error);
  assert.equal((await scan({ operation: 'inventory' })).urls.length, 1);
  assert.equal((await scan({ operation: 'scan', videoUrl: 'https://www.douyin.com/video/123456' })).records.length, 1);
  const original = url;
  assert.ok((await scan({ operation: 'scan', videoUrl: 'https://www.douyin.com/video/987654' })).error);
  assert.equal(url, original);
  assert.ok((await scan({ operation: 'scan', accountId: 'another-account', videoUrl: original })).error);
  assert.ok(commands.every(command => ['works', 'scroll-comments', 'comments'].includes(command)));
  console.log(JSON.stringify({ commentTimeAssertions: 7, monitorOwnershipAndReadOnlyAssertions: 7, externalPlatformWrites: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });

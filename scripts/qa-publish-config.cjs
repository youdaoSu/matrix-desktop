const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), Module = require('node:module');
function load(file) { const m = new Module(file); m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file); return m.exports; }
const { syncPublishConfig } = load('shared/publish-config.ts');
const { publishPlatformFields, validatePlatformConfig } = load('shared/publish-platform-fields.ts');
const common = { title: '通用', body: '通用简介', topics: ['日常'], comment: '', options: {}, covers: [{ id: 'common', name: 'common.png', index: 1 }], schedule: { mode: 'now' } };
const own = { ...common, title: '独立标题', options: { category: '生活' }, extras: { 音乐: '指定曲目' }, covers: [{ id: 'own', name: 'own.png', index: 1 }], schedule: { mode: 'local', at: '2099-01-01T12:00' } };
const result = syncPublishConfig(common, own, ['body'], new Set(['covers', 'schedule']));
assert.equal(result.title, '独立标题'); assert.equal(result.covers[0].id, 'own'); assert.equal(result.schedule.mode, 'local');
assert.equal(result.extras.音乐, '指定曲目'); assert.equal(result.options.category, '生活');
result.extras.音乐 = '修改副本'; assert.equal(own.extras.音乐, '指定曲目');
assert.equal(syncPublishConfig(common, own, ['title']).covers[0].id, 'common');
for (const platform of Object.keys(publishPlatformFields)) {
  const schema = publishPlatformFields[platform];
  assert.equal(validatePlatformConfig(platform, common), null);
  assert.ok(validatePlatformConfig(platform, { ...common, title: '长'.repeat(schema.titleLimit + 1) }));
  assert.equal(new Set(schema.fields.map(field => field.label)).size, schema.fields.length);
}
assert.ok(validatePlatformConfig('bilibili', { ...common, options: { originality: '转载' } }));
assert.equal(validatePlatformConfig('bilibili', { ...common, options: { originality: '转载' }, extras: { 转载来源: 'https://example.org/owned-original' } }), null);
assert.ok(validatePlatformConfig('douyin', { ...common, extras: { 音乐: 'x'.repeat(1001) } }));
console.log(JSON.stringify({ platformConfigAssertions: 22, platforms: 4 }));
const values = new Map(); global.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
let user = 'qa-owner-a', pages = [];
const preferencesModule = new Module('preferences-fixture');
preferencesModule.require = name => { if (name !== '@/api') throw Error('Unexpected import'); return {
  getUser: () => ({ id: user }), axiosForBackend: { get: async (_, input) => { pages.push(input.params.page); return { data: { data: { total: 102, items: Array.from({ length: input.params.page === 1 ? 100 : 2 }, (_, i) => ({ id: `${input.params.page}-${i}` })) } } }; } },
}; };
preferencesModule._compile(ts.transpileModule(fs.readFileSync('client/src/components/workspace/publish-preferences.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, 'preferences-fixture.cjs');
const preferences = preferencesModule.exports;
preferences.savePublishPreferences({ remember: true, lists: [{ id: 'qa-list', name: 'QA', ids: ['owned-account'] }], configs: { 'owned-account': { options: { visibility: '仅自己可见' }, extras: { 音乐: 'QA' } } } });
assert.equal(preferences.readPublishPreferences().lists.length, 1);
user = 'qa-owner-b'; assert.equal(preferences.readPublishPreferences().lists.length, 0); assert.equal(preferences.readPublishPreferences().remember, false);
user = 'qa-owner-a'; assert.equal(preferences.readPublishPreferences().configs['owned-account'].extras.音乐, 'QA');
values.set('matrix-publish-preferences:qa-owner-a', '{invalid'); assert.equal(preferences.readPublishPreferences().remember, false);
preferences.loadPublishAccounts().then(accounts => { assert.equal(accounts.length, 102); assert.deepEqual(pages, [1, 2]); console.log(JSON.stringify({ preferenceIsolationAndPaginationChecks: 7 })); }).catch(error => { console.error(error); process.exitCode = 1; });

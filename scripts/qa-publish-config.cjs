const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), Module = require('node:module');
function load(file) { const m = new Module(file); m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file); return m.exports; }
const { syncPublishConfig } = load('shared/publish-config.ts');
const { titleFromPublishFilename } = load('shared/publish-filename.ts');
for(const [value,title] of [['视频.mp4','视频'],['C:\\中文 空格\\第12.1天.MOV','第12.1天'],['/中文/封面.PNG','封面'],[' .mp4 ',''],[undefined,''],['含\u0000字符.webm','含字符']])assert.equal(titleFromPublishFilename(value),title);
const { publishPlatformFields, validatePlatformConfig, publishTitleNotice, withPublishPlatformDefaults, bilibiliDeclarationValue, bilibiliCreationDeclarations } = load('shared/publish-platform-fields.ts');
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
  assert.equal(validatePlatformConfig(platform, { ...common, title: '长'.repeat(schema.titleLimit + 1) }), null);
  assert.match(publishTitleNotice(platform, '长'.repeat(schema.titleLimit + 1)), /参考值.*不在本地拦截或截断/);
  assert.match(validatePlatformConfig(platform, { ...common, title: '长'.repeat(501) }), /500/);
  assert.equal(new Set(schema.fields.map(field => field.label)).size, schema.fields.length);
}
assert.ok(validatePlatformConfig('bilibili', { ...common, options: { originality: '转载' } }));
assert.equal(validatePlatformConfig('bilibili', { ...common, options: { originality: '转载' }, extras: { 转载来源: 'https://example.org/owned-original' } }), null);
assert.ok(validatePlatformConfig('douyin', { ...common, extras: { 音乐: 'x'.repeat(1001) } }));
assert.equal(publishPlatformFields.bilibili.descriptionLimit,2000);
assert.equal(validatePlatformConfig('bilibili',{...common,body:'字'.repeat(2000)}),null);
assert.match(validatePlatformConfig('bilibili',{...common,body:'字'.repeat(2001)}),/2000/);
assert.match(validatePlatformConfig('bilibili',{...common,extras:{创作声明:'未核实选项'}}),/创作声明/);
assert.equal(validatePlatformConfig('bilibili',{...common,extras:{创作声明:'含AI生成内容'}}),null);
let defaultChecks = 0;
for (const declaration of [undefined, '', '  ']) {
  const original = { ...common, extras: { ...(declaration === undefined ? {} : { 创作声明: declaration }), 参与话题: 'QA' } };
  const snapshot = JSON.stringify(original), prepared = withPublishPlatformDefaults('bilibili', original);
  assert.equal(prepared.extras.创作声明, '内容无需标注');
  assert.equal(prepared.extras.参与话题, 'QA');
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(withPublishPlatformDefaults('bilibili', prepared), prepared);
  const repost = { ...original, options: { originality: '转载' } };
  assert.equal(bilibiliDeclarationValue(repost), '内容为转载');
  defaultChecks += 5;
}
for (const declaration of [...bilibiliCreationDeclarations, '未核实选项']) {
  const explicit = { ...common, extras: { 创作声明: declaration } };
  assert.equal(withPublishPlatformDefaults('bilibili', explicit), explicit);
  assert.equal(bilibiliDeclarationValue(explicit, ''), '内容无需标注');
  defaultChecks += 2;
}
for (const platform of ['douyin','xiaohongshu','wechat']) {
  assert.equal(withPublishPlatformDefaults(platform, common), common); defaultChecks++;
}
console.log(JSON.stringify({visibleCreationDeclarationDefaultChecks:defaultChecks,explicitChoicesPreserved:true,rawPreflightStillRequiresDeclaration:true,defaultDoesNotClassifyMedia:true}));
const wechatConfig={...common,title:'完整标题超过十六字依然保留在描述中1826'};
assert.equal(validatePlatformConfig('wechat',wechatConfig),null);
assert.equal(validatePlatformConfig('wechat',{...wechatConfig,extras:{短标题:'短'.repeat(16)}}),null);
assert.match(validatePlatformConfig('wechat',{...wechatConfig,extras:{短标题:'长'.repeat(17)}}),/16/);
assert.match(validatePlatformConfig('wechat',{...wechatConfig,body:'文'.repeat(1999)}),/合计/);
assert.equal(wechatConfig.title,'完整标题超过十六字依然保留在描述中1826');
assert.equal(wechatConfig.body,common.body);
console.log(JSON.stringify({ platformConfigAssertions: 28, platforms: 4, wechatTitleAndDescriptionNotTruncated:true }));
const values = new Map(); global.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
let user = 'qa-owner-a', pages = [];
const preferencesModule = new Module('preferences-fixture');
preferencesModule.require = name => { if (name !== '@/api') throw Error('Unexpected import'); return {
  getUser: () => ({ id: user }), getAuthToken: () => 'qa-only-token', axiosForBackend: { get: async (_, input) => { pages.push(input.params.page); return { data: { data: { total: 102, items: Array.from({ length: input.params.page === 1 ? 100 : 2 }, (_, i) => ({ id: `${input.params.page}-${i}` })) } } }; } },
}; };
preferencesModule._compile(ts.transpileModule(fs.readFileSync('client/src/components/workspace/publish-preferences.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, 'preferences-fixture.cjs');
const preferences = preferencesModule.exports;
preferences.savePublishPreferences({ remember: true, lists: [{ id: 'qa-list', name: 'QA', ids: ['owned-account'] }], configs: { 'owned-account': { options: { visibility: '仅自己可见' }, extras: { 音乐: 'QA' } } } });
assert.equal(preferences.readPublishPreferences().lists.length, 1);
user = 'qa-owner-b'; assert.equal(preferences.readPublishPreferences().lists.length, 0); assert.equal(preferences.readPublishPreferences().remember, false);
user = 'qa-owner-a'; assert.equal(preferences.readPublishPreferences().configs['owned-account'].extras.音乐, 'QA');
values.set('matrix-publish-preferences:qa-owner-a', '{invalid'); assert.equal(preferences.readPublishPreferences().remember, false);
preferences.loadPublishAccounts().then(accounts => { assert.equal(accounts.length, 102); assert.deepEqual(pages, [1, 2]); console.log(JSON.stringify({ preferenceIsolationAndPaginationChecks: 7 })); }).catch(error => { console.error(error); process.exitCode = 1; });

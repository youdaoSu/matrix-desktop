const assert = require('node:assert/strict');
const { registerPageActions } = require('../desktop/page-actions.cjs');
const handlers = {}, records = [];
const isolated = {};
let allowed = true, loggedIn = true, identity = 'QA author', nativeKey,dialogResult = 1, clicks = 0, outcome = 'confirmed', failWrite = false, beforeClickReject=false, lostSubmitReply=false;
let preValidationError,postValidationError,accepted=false,dialogs=0;
const guest = { id: 22, hostWebContents: { id: 11 }, session: isolated, isDestroyed: () => false, getURL: () => 'https://creator.douyin.com/creator-micro/content/post/video', executeJavaScriptInIsolatedWorld: async (_world, scripts) => {
  const code = scripts[0].code;
  if(code.includes('function publishValidation')){const message=code.includes('"phase":"after_submit"')?postValidationError:preValidationError;return{version:1,inspected:true,errors:message?[{field:'创作声明',message,code:'required',source:'official_inline_validation'}]:[]};}
  if (code.endsWith(')') && code.includes(')("inspect",')) return { pageUrl: guest.getURL(), fields: [{ label: '标题', value: 'QA only' }], candidates: [{ index: 0, label: '发布', context: 'QA only' }] };
  if (code.includes(')("submit",') || code.includes(')("submit-checked",')) { if(beforeClickReject)return{clicked:false,rejectedBeforeClick:true,error:'提交按钮被弹窗遮挡'}; if(lostSubmitReply)throw Error('transport lost'); clicks++; return { clicked: true }; }
  return { status: outcome, accepted, message: outcome === 'confirmed' ? '发布成功' : outcome === 'failed' ? '发布失败' : '结果待核对' };
} };
registerPageActions({ ipcMain: { handle: (name, handler) => { handlers[name] = handler; } }, dialog: { showMessageBox: async () => {dialogs++;return { response: dialogResult };} }, webContents: { fromId: id => id === 22 ? guest : null }, session: { fromPartition: name => name === 'persist:matrix-douyin-aaaaaaaaaaaaaaaa' ? isolated : {} }, getWindow: () => ({ webContents: { id: 11 } }), platforms: { douyin: { domain: 'douyin.com', label: '抖音' } }, inspectPlatformSession: async () => ({ authenticated: loggedIn, profile: { nickname: identity,...(nativeKey?{ownIdentity:{key:nativeKey}}:{}) } }), authenticate: async (_token, accountId) => { if (!allowed) throw new Error('Unauthorized'); return { userId: 'qa-user', account: { id: accountId, platform: 'douyin', connectorSessionId: 'aaaaaaaaaaaaaaaa',nativeAccountKey:nativeKey } }; }, journal: { write: r => { if (failWrite) throw new Error('Disk full'); records.push({ ...r }); }, list: () => records }, sleep: async () => {} });
const event = { sender: { id: 11 } }, input = { platform: 'douyin', accountId: 'qa-account', sessionId: 'aaaaaaaaaaaaaaaa', webContentsId: 22, accessToken: 'qa-only', kind: 'publish' };
const inspect = changes => handlers['matrix:inspect-page-action'](event, { ...input, ...changes });
const submit = (plan, changes) => handlers['matrix:submit-page-action'](event, { ...input, nonce: plan.nonce, index: 0, ...changes });
(async () => {
  let checks = 0;
  assert.ok((await handlers['matrix:inspect-page-action']({ sender: { id: 99 } }, input)).error); checks++;
  allowed = false; assert.ok((await inspect()).error); allowed = true; checks++;
  loggedIn = false; assert.ok((await inspect()).error); loggedIn = true; checks++;
  assert.ok((await inspect({ sessionId: 'other-session-0000' })).error); checks++;
  assert.ok((await inspect({ kind: 'delete' })).error); checks++;
  let plan = await inspect(); assert.ok(plan.nonce); assert.equal(clicks, 0); checks++;
  assert.ok((await submit(plan, { index: 99 })).error); assert.equal(clicks, 0); checks++;
  dialogResult = 0;
  for(const kind of ['comments','messages','withdraw']){const other=await inspect({kind});assert.equal((await submit(other)).cancelled,true);assert.equal(clicks,0);checks+=2;}
  assert.equal(dialogs,3);checks++;plan=await inspect();
  dialogResult = 1; identity = 'Changed account'; assert.ok((await submit(plan)).error); assert.equal(clicks, 0); identity = 'QA author'; checks++;
  plan = await inspect(); const beforeDialogs=dialogs;const result = await submit(plan); assert.equal(result.receipt.status, 'confirmed'); assert.equal(clicks, 1); assert.equal(records[0].status, 'submitting'); assert.equal(records[1].status, 'unknown'); assert.equal(records[1].checkpoint,'click_acknowledged');assert.equal(records[1].clicked,true);assert.equal(records[2].status,'confirmed');assert.equal(dialogs,beforeDialogs,'Publishing must not ask for a second confirmation');checks+=5;
  assert.ok((await submit(plan)).error); assert.equal(clicks, 1); checks++;
  outcome = 'unknown'; plan = await inspect(); assert.equal((await submit(plan)).receipt.status, 'unknown'); checks++;
  outcome = 'failed'; plan = await inspect(); assert.equal((await submit(plan)).receipt.status, 'failed'); checks++;
  plan = await inspect(); const before = clicks; failWrite = true; const unsaved=await submit(plan);assert.ok(unsaved.error);assert.equal(unsaved.mayHaveSubmitted,false);assert.equal(clicks, before); failWrite = false; checks+=2;
  beforeClickReject=true;plan=await inspect();const rejected=await submit(plan);assert.equal(rejected.receipt.status,'failed');assert.equal(rejected.receipt.clicked,false);assert.equal(rejected.mayHaveSubmitted,false);assert.equal(clicks,before);checks+=4;beforeClickReject=false;
  lostSubmitReply=true;plan=await inspect();const lost=await submit(plan);assert.equal(lost.mayHaveSubmitted,true);assert.equal(records.at(-1).status,'unknown');assert.notEqual(records.at(-1).clicked,false);checks+=3;lostSubmitReply=false;
  const first = await inspect(), second = await inspect(); assert.ok((await submit(first)).error); assert.ok(second.nonce); checks++;
  allowed = false; assert.ok((await handlers['matrix:list-page-actions'](event, { accessToken: 'invalid' })).error); checks++;
  allowed=true;outcome='confirmed';nativeKey='stable-platform-id';identity='Original display';plan=await inspect();identity='Renamed display';assert.equal((await submit(plan)).receipt.status,'confirmed');checks++;
  plan=await inspect();const beforeChangedId=clicks;nativeKey='another-platform-id';assert.ok((await submit(plan)).error);assert.equal(clicks,beforeChangedId);checks+=2;
  nativeKey='stable-platform-id';const beforeRequired=clicks,recordsBeforeRequired=records.length;
  preValidationError='创作声明：请先选择符合实际内容的声明';assert.match((await inspect()).error,/创作声明/);assert.equal(clicks,beforeRequired);assert.equal(records.length,recordsBeforeRequired);checks+=3;
  preValidationError=undefined;plan=await inspect();preValidationError='标题：请补全官方必填项';const failedFinalCheck=await submit(plan);assert.match(failedFinalCheck.error,/标题/);assert.equal(failedFinalCheck.mayHaveSubmitted,false);assert.equal(clicks,beforeRequired);checks+=3;
  preValidationError=undefined;outcome='unknown';postValidationError='请选择正确分区';plan=await inspect();const inlineRejected=await submit(plan);assert.equal(inlineRejected.receipt.status,'failed');assert.equal(inlineRejected.receipt.resultSource,'official_form_validation');assert.equal(inlineRejected.receipt.clicked,true);assert.match(inlineRejected.receipt.evidence.notice,/请选择正确分区/);checks+=4;
  accepted=true;plan=await inspect();const acceptedResult=await submit(plan);assert.equal(acceptedResult.receipt.status,'confirmed');assert.ok(acceptedResult.receipt.acceptedAt);assert.equal(acceptedResult.receipt.resultSource,'official_acceptance_notice');assert.equal(acceptedResult.receipt.verification.state,'processing');checks+=4;accepted=false;postValidationError=undefined;
  console.log(JSON.stringify({ pageActionGuards: checks, realPlatformActionsPerformed: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });

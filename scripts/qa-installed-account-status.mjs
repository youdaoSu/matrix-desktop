// Local, read-only installation audit. Never bind accounts, retry, publish,
// send messages, alter account status, or export any authentication material.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const mode = process.argv[2];
const targetRelease = process.argv[3] || 'rc.31', previousRelease = process.argv[4] || 'rc.29';
assert.match(targetRelease, /^rc\.\d+$/); assert.match(previousRelease, /^rc\.\d+$/);
const auditStem = 'logs/installed-' + targetRelease.replace('.', '');
assert.ok(['before', 'after', 'close'].includes(mode));
const targets = await fetch((await import('./local-installed-debug.mjs')).installedDebugUrl, { signal: AbortSignal.timeout(3000) }).then(r => r.json());
const target = targets.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:3210/app/'));
assert.ok(target, 'Installed local application not found');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let seq = 0; const pending = new Map();
socket.addEventListener('message', event => {
  const m = JSON.parse(event.data), p = pending.get(m.id); if (!p) return;
  clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 20000);
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description?.slice(0, 220) || 'Installed audit failed'); return r.result?.value;
};
const context = `function context(kind){const el=document.querySelector('.matrix-shell');if(!el)throw Error('Matrix login not restored');let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];for(;f;f=f.return){const v=f.memoizedProps?.value;if(kind==='workspace'&&typeof v?.openAccount==='function')return v;if(kind==='queue'&&typeof v?.queue?.start==='function')return v;}throw Error('Application still loading');}`;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function snapshot() {
  // Account management intentionally loads accounts only inside its own module.
  // A fresh launch opens the dashboard; navigate before waiting for this list.
  if (mode === 'after') await evaluate("location.hash='#/accounts';true");
  for (let i = 0; i < 150; i++) {
    const loaded = await evaluate(`(()=>{try{${context};return context('workspace').accounts.length>=5&&!!context('queue').queue;}catch{return false;}})()`);
    if (loaded) break;
    if (i === 149) throw Error('Installed account list did not finish loading');
    await new Promise(r => setTimeout(r, 150));
  }
  return evaluate(`(async()=>{${context};const w=context('workspace'),q=context('queue').queue,owner=JSON.parse(localStorage.getItem('matrix_user')||sessionStorage.getItem('matrix_user'));const token=localStorage.getItem('matrix_token')||sessionStorage.getItem('matrix_token');if(!owner?.id||!token)throw Error('Login not preserved');const csrf=decodeURIComponent(document.cookie.split('; ').find(v=>v.startsWith('suda-csrf-token='))?.slice(16)||'');const response=await fetch('/api/platform/groups',{headers:{Authorization:'Bearer '+token,'x-suda-csrf-token':csrf}});if(!response.ok)throw Error('Groups unavailable: '+response.status);const groups=(await response.json()).data;const settings=await window.matrixDesktop.systemSettings({command:'read'});return {version:settings.version,ownerId:owner.id,running:q.running,active:q.jobs.filter(j=>['scheduled','queued','preparing','uploading','filling','reviewing','confirming','submitting'].includes(j.stage)).length,accounts:w.accounts.map(a=>({id:a.id,platform:a.platform,nickname:a.nickname,avatarUrl:a.avatarUrl,connectorSessionId:a.connectorSessionId,authStatus:a.authStatus,healthStatus:a.healthStatus,groupId:a.groupId,accountRemark:a.accountRemark})).sort((a,b)=>a.id.localeCompare(b.id)),groups:groups.map(g=>({id:g.id,groupName:g.groupName,color:g.color,isDefault:g.isDefault})).sort((a,b)=>a.id.localeCompare(b.id)),tasks:q.jobs.map(j=>({id:j.id,accountId:j.accountId,stage:j.stage,submission:j.submission,attemptNumber:j.attemptNumber,config:j.config,recoveryId:j.recoveryId})).sort((a,b)=>a.id.localeCompare(b.id)),drafts:Object.keys(localStorage).filter(k=>/^matrix-/.test(k)&&/draft/i.test(k)&&!/(token|cookie|secret)/i.test(k)).sort().map(k=>({key:k,value:localStorage.getItem(k)}))};})()`);
}
try {
  let state = await snapshot();
  assert.equal(state.running, false, 'Queue is running; no restart allowed'); assert.equal(state.active, 0, 'Active task present; no restart allowed');
  state.drafts = state.drafts.map(item => ({ key: item.key, digest: hash(item.value) }));
  state.tasks = state.tasks.map(({ config, ...item }) => ({ ...item, configDigest: hash(config ?? null) }));
  fs.mkdirSync('logs', { recursive: true });
  if (mode === 'before') {
    assert.equal(state.version, '2.10.0-' + previousRelease);
    assert.ok(state.accounts.length > 0); assert.ok(state.groups.length > 0);
    assert.equal(new Set(state.tasks.map(t => t.id)).size, state.tasks.length);
    fs.writeFileSync(auditStem + '-before.json', JSON.stringify(state, null, 2));
    console.log(JSON.stringify({ version: state.version, accounts: state.accounts.length, groups: state.groups.length, records: state.tasks.length, active: 0, safeToClose: true }));
  } else if (mode === 'close') {
    await evaluate('window.close();true').catch(() => {});
    console.log(JSON.stringify({ gracefulCloseRequested: true, queueWasIdle: true }));
  } else {
    const before = JSON.parse(fs.readFileSync(auditStem + '-before.json', 'utf8'));
    assert.equal(state.version, '2.10.0-' + targetRelease); assert.equal(state.ownerId, before.ownerId);
    assert.deepEqual(state.accounts, before.accounts); assert.deepEqual(state.groups, before.groups); assert.deepEqual(state.drafts, before.drafts);
    assert.deepEqual(state.tasks.map(({ stage, submission, ...rest }) => rest), before.tasks.map(({ stage, submission, ...rest }) => rest));
    assert.equal(state.tasks.filter(t => t.stage === 'confirmed').length, before.tasks.filter(t => t.stage === 'confirmed').length);
    await evaluate("location.hash='#/accounts';true");
    let rows;
    for (let i = 0; i < 100; i++) {
      rows = await evaluate("[...document.querySelectorAll('[data-manager-account]')].map(r=>{const a=r.querySelector('.matrix-account-avatar'),m=a?.querySelector('.matrix-account-session-mark'),p=a?.querySelector(':scope > img');return{id:r.dataset.managerAccount,state:a?.dataset.accountAvailability,mark:m?.textContent,grayscale:a?.classList.contains('is-unavailable'),photoLoaded:!!p?.complete&&p.naturalWidth>0,brandLoaded:!!r.querySelector('[data-platform-logo] img')?.naturalWidth}})");
      if (rows.length === before.accounts.length && rows.every(r => r.state && r.photoLoaded && r.brandLoaded)) break;
      await new Promise(r => setTimeout(r, 150));
    }
    assert.equal(rows.length, before.accounts.length);
    for (const row of rows) { assert.ok(['normal','offline','abnormal','banned','unknown'].includes(row.state)); assert.equal(row.mark, row.state === 'normal' ? '✓' : row.state === 'unknown' ? '?' : '×'); assert.equal(row.grayscale, row.state !== 'normal'); assert.ok(row.brandLoaded); }
    const report = { installedVersion: state.version, sameAppUser: true, accountsPreserved: state.accounts.length, groupsPreserved: state.groups.length, recordsPreserved: state.tasks.length, savedDraftsUnchanged: true, connectorSessionsUnchanged: true, originalTasksNotRestarted: true, historicalSuccessCountUnchanged: true, observedAvatarStates: rows.map(({ id, state, mark, photoLoaded }) => ({ id, state, mark, photoLoaded })), externalPublishOrMessagingActions: false };
    fs.writeFileSync(auditStem + '-account-status.json', JSON.stringify(report, null, 2));
    // Screenshot is optional evidence: never turn a compositor timeout into an
    // unsafe account repair, restart, or change to genuine account statuses.
    if (!process.argv.includes('--skip-screenshot')) try { await call('Page.bringToFront'); const shot = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(auditStem + '-account-status.png', Buffer.from(shot.data, 'base64')); } catch { report.screenshotUnavailable = true; }
    console.log(JSON.stringify(report));
  }
} finally { socket.close(); }

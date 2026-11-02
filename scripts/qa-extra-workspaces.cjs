const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {publicUrl,catalog,registerExtraWorkspaces}=require('../desktop/extra-workspaces.cjs');
let checks=0;
assert.equal(catalog.length,29);checks++;
assert.equal(new Set(catalog.map(item=>item.id)).size,29);checks++;
for(const url of ['http://example.com','https://127.0.0.1','https://10.0.0.1','https://192.168.0.1','https://172.16.0.1','https://[::1]','https://host.local','https://user:pass@example.com','https://example.com/?token=abc','https://example.com:8443']){assert.throws(()=>publicUrl(url));checks++;}
for(const item of catalog.filter(item=>item.url)){assert.equal(publicUrl(item.url).protocol,'https:');checks++;}
const userData=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-extra-workspace-qa-')),handlers=new Map(),sender={id:1};
registerExtraWorkspaces({ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},getWindow:()=>({isDestroyed:()=>false,webContents:sender}),authenticate:async token=>{if(!['owner-a','owner-b'].includes(token))throw Error('no auth');return {userId:token};},userData,prepareSession:item=>({partition:'fixture-'+item.sessionId,url:item.url})});
const call=input=>handlers.get('matrix:extra-workspaces')({sender},{accessToken:'owner-a',...input});
(async()=>{
  const first=await call({command:'add',provider:'kuaishou',name:'快手甲',remark:'fixture'});assert.ok(first.item?.id);assert.equal(first.item.loginStatus,'not_verified');checks+=2;
  assert.equal((await call({command:'list'})).items.length,1);checks++;
  assert.equal((await call({command:'list',accessToken:'owner-b'})).items.length,0);checks++;
  assert.match((await call({command:'open',id:first.item.id,accessToken:'owner-b'})).error,/不属于/);checks++;
  const opened=await call({command:'open',id:first.item.id});assert.ok(opened.session.partition.endsWith(first.item.sessionId));checks++;
  const custom=await call({command:'add',provider:'custom',name:'我的官方站',url:'https://www.example.com/'});assert.ok(custom.item?.id);checks++;
  assert.match((await call({command:'add',provider:'custom',name:'unsafe',url:'https://localhost/'})).error,/HTTPS/);checks++;
  assert.match((await call({command:'add',provider:'douyin',name:'fake'})).error,/专门适配/);checks++;
  assert.match((await call({command:'add',provider:'pinduoduo',name:'fake'})).error,/专门适配/);checks++;
  assert.ok((await call({command:'add',provider:'kuaishou',name:''})).error);checks++;
  assert.ok((await handlers.get('matrix:extra-workspaces')({sender:{id:2}},{command:'list',accessToken:'owner-a'})).error);checks++;
  const record=fs.readFileSync(path.join(userData,'additional-platform-workspaces.json'),'utf8');assert.ok(!record.includes('accessToken'));checks++;
  fs.writeFileSync(path.join(userData,'additional-platform-workspaces.json'),'malformed fixture');
  assert.match((await call({command:'list'})).error,/未覆盖原数据/);assert.equal(fs.readFileSync(path.join(userData,'additional-platform-workspaces.json'),'utf8'),'malformed fixture');checks+=2;
  console.log(JSON.stringify({extraWorkspaceChecks:checks,catalogEntries:catalog.length,coreEntries:catalog.filter(item=>item.core).length,workspaceEntries:catalog.filter(item=>!item.core&&!item.pending).length,pendingEntries:catalog.filter(item=>item.pending).length,realAccountsModified:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});

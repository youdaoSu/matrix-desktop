const assert=require('node:assert/strict');
const {createBilibiliProfileReader}=require('../desktop/bilibili-profile.cjs');
(async()=>{
  let checks=0,clock=100000,windows=0,destroyed=0,currentUrl='https://account.bilibili.com/account/home',name='我的B站',loginVisible=false,reads=0;
  let cookies=[{name:'SESSDATA',value:'fixture-session-a',expirationDate:1000}];const accountSession={cookies:{get:async()=>cookies}};
  const read=createBilibiliProfileReader({now:()=>clock,sleep:ms=>ms===10000?new Promise(()=>{}):Promise.resolve(),createWindow:session=>{
    assert.equal(session,accountSession);windows++;return {isDestroyed:()=>false,destroy:()=>destroyed++,webContents:{setWindowOpenHandler(){},on(){},loadURL:async url=>{assert.equal(url,'https://account.bilibili.com/account/home');},getURL:()=>currentUrl}};
  },readProfile:async()=>{reads++;return {nickname:name,loginVisible,avatarUrl:'https://i0.hdslb.com/bfs/face/fixture.jpg',pageUrl:currentUrl};}});
  assert.equal(await read(accountSession,[]),undefined);checks++;
  assert.equal(await read(accountSession,[{name:'SESSDATA',value:'expired',expirationDate:1}]),undefined);checks++;
  assert.equal((await read(accountSession,cookies)).nickname,'我的B站');checks++;assert.equal(destroyed,1);checks++;
  await read(accountSession,cookies);assert.equal(windows,1);checks++;
  clock+=61000;await read(accountSession,cookies);assert.equal(windows,2);checks++;
  cookies=[{name:'SESSDATA',value:'fixture-session-b',expirationDate:1000}];name='换号后的本人';assert.equal((await read(accountSession,cookies)).nickname,name);assert.equal(windows,3);checks+=2;
  clock+=61000;currentUrl='https://space.bilibili.com/some-public-creator';assert.equal(await read(accountSession,cookies),undefined);checks++;
  currentUrl='https://account.bilibili.com/account/home';loginVisible=true;assert.equal(await read(accountSession,cookies),undefined);checks++;
  loginVisible=false;name='';assert.equal(await read(accountSession,cookies),undefined);checks++;
  assert.equal(destroyed,windows);checks++;
  console.log(JSON.stringify({bilibiliProfileChecks:checks,readOnlyOfficialPersonalCenter:true,realAccountsModified:false,reads}));
})().catch(error=>{console.error(error);process.exitCode=1;});

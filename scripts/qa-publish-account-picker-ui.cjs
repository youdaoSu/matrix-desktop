// Mounted in the offline editor fixture only. No backend, profiles or platforms.
async function runPublishAccountPickerUiTests() {
  const assert=require('node:assert/strict'),path=require('node:path'),React=require('react');
  const {createRoot}=require('react-dom/client'),{loadTs}=require('./qa-load-typescript.cjs');
  const root=path.resolve(__dirname,'..'),cache=new Map(),overrides=new Map(),stub=(file,exports)=>cache.set(path.join(root,file),{exports});
  stub('client/src/components/workspace/OfficialWorkspace.tsx',{platformLabels:{douyin:'抖音',xiaohongshu:'小红书',wechat:'视频号',bilibili:'B站'}});
  stub('client/src/components/workspace/AccountAvatar.tsx',{AccountAvatar:()=>null});
  stub('client/src/components/workspace/PlatformLogo.tsx',{PlatformLogo:()=>null});
  stub('client/src/components/workspace/publish-preferences.ts',{readPublishPreferences:()=>({lists:[{id:'qa-all',name:'QA all accounts',ids:['douyin','xiaohongshu','wechat','bilibili']}]}),savePublishPreferences:()=>{}});
  overrides.set('sonner',{toast:{error:message=>{throw Error(message);},success:()=>{}}});
  const {PublishAccountPicker}=loadTs('client/src/components/workspace/PublishAccountPicker.tsx',cache,overrides);
  const accounts=['douyin','xiaohongshu','wechat','bilibili'].map(platform=>({id:platform,platform,nickname:'QA '+platform,authStatus:'authorized',connectorSessionId:'qa-only-'+platform}));
  const container=document.getElementById('root'),component=createRoot(container),pause=()=>new Promise(resolve=>setTimeout(resolve,15));
  const until=async predicate=>{for(let n=0;n<150;n++){if(predicate())return;await pause();}throw Error('Account picker UI fixture timed out');};
  let confirmed,closed=0,checks=0;
  const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
  const checkbox=id=>document.querySelector(`[data-publish-account="${id}"] [role="checkbox"]`);
  const mount=async(mediaType,selected=[])=>{component.render(React.createElement(PublishAccountPicker,{key:mediaType,accounts,selected,mediaType,onConfirm:ids=>{confirmed=ids;},onClose:()=>closed++}));await until(()=>document.body.textContent.includes(mediaType==='image'?'图文':'视频')&&checkbox('wechat'));};
  try {
    await mount('image',['bilibili','wechat','xiaohongshu']);
    assert.equal(checkbox('bilibili').disabled,true);assert.equal(checkbox('wechat').disabled,true);assert.equal(checkbox('douyin').disabled,false);assert.equal(checkbox('xiaohongshu').disabled,false);checks+=4;
    assert.ok(document.querySelector('[data-publish-account="bilibili"]').textContent.includes('当前仅适配视频'));assert.equal(checkbox('bilibili').getAttribute('data-state'),'unchecked');checks+=2;
    const group=document.querySelector('[aria-label="选择分组默认分组"]');group.click();await until(()=>checkbox('douyin').getAttribute('data-state')==='checked');button('确定').click();await until(()=>confirmed);assert.deepEqual([...confirmed].sort(),['douyin','xiaohongshu']);assert.equal(closed,1);checks+=2;
    button('常用列表').click();await until(()=>button('加入已选'));
    document.querySelector('[aria-label="清空已选账号"]').click();await pause();button('加入已选').click();await pause();confirmed=undefined;button('确定').click();await until(()=>confirmed);assert.deepEqual([...confirmed].sort(),['douyin','xiaohongshu']);checks++;
    await mount('video');await until(()=>checkbox('wechat')?.disabled===false);for(const id of ['douyin','xiaohongshu','wechat','bilibili'])assert.equal(checkbox(id).disabled,false);checks+=4;
    return{publishAccountPickerReactChecks:checks,imageUnsupportedTargetsDisabled:true,bulkAndSavedListsRespectAdapterCapability:true,videoTargetsRetained:true,realPlatformActions:false};
  }finally{component.unmount();}
}
module.exports={runPublishAccountPickerUiTests};

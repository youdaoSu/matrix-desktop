const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createPublishMediaStore } = require('../desktop/publish-media.cjs');
const { registerPersonalAssist } = require('../desktop/personal-assist.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-publish-media-qa-'));
const image = { isEmpty: () => false, getSize: () => ({ width: 640, height: 480 }), resize() { return this; }, toJPEG: () => Buffer.from([255,216,255,217]) };
let frameDecodes=0;
const nativeImage = { createFromPath: () => image, createThumbnailFromPath: async () => image, createFromBuffer: () => {frameDecodes++;return image;} };
(async () => {
  let checks = 0;
  const media = { mediaType:'video', paths:[path.join(root,'video.mp4')], files:[{name:'video.mp4',size:10,modified:1}] };
  const cover = { mediaType:'image', paths:[path.join(root,'cover.jpg')], files:[{name:'cover.jpg',size:10,modified:1}] };
  let store = createPublishMediaStore(root, nativeImage);
  const saved = await store.save('owner-a',media,[{index:1,selection:cover}]);
  assert.ok(saved.recoveryId); assert.match(saved.thumbnail,/^data:image\/jpeg;base64,/); assert.ok(!JSON.stringify(saved).includes(root)); checks += 3;
  store = createPublishMediaStore(root,nativeImage);
  assert.deepEqual(store.read('owner-a',saved.recoveryId).media,media); assert.throws(()=>store.read('owner-b',saved.recoveryId)); assert.throws(()=>store.read('owner-a','../../secret')); checks += 3;
  let modified = 1, owner = 'owner-a';
  const handlers = {}, dialog = { showOpenDialog: async () => ({ canceled:false,filePaths:media.paths }) };
  const setup = () => registerPersonalAssist({ ipcMain:{handle:(name,fn)=>handlers[name]=fn},dialog,getWindow:()=>({webContents:{id:11}}),webContents:{},session:{},platforms:{},inspectPlatformSession:async()=>({}),authenticate:async token=>{if(token!=='test-token')throw Error('unauthorized');return {userId:owner}},mediaStore:store,statFile:()=>({isFile:()=>true,size:10,mtimeMs:modified}) });
  setup();
  const invoke = (name,input,sender=11)=>handlers[name]({sender:{id:sender}},input);
  const picked = (await invoke('matrix:choose-media',{mediaType:'video'})).selection;
  const request = {accessToken:'test-token',selectionId:picked.id,covers:[]};
  assert.ok((await invoke('matrix:remember-publish-media',request,99)).error); assert.ok((await invoke('matrix:remember-publish-media',{...request,accessToken:'wrong'})).error); checks += 2;
  const durable = await invoke('matrix:remember-publish-media',request); assert.ok(durable.recoveryId); checks++;
  setup(); // Restart: the selections map is new, the native store remains.
  const restore = {accessToken:'test-token',recoveryId:durable.recoveryId};
  const restored = await invoke('matrix:restore-publish-media',restore);
  assert.ok(restored.selection); assert.notEqual(restored.selection.id,picked.id); assert.equal(restored.selection.files[0].name,'video.mp4'); assert.ok(!JSON.stringify(restored).includes(root)); checks += 4;
  owner='owner-b'; const foreign=await invoke('matrix:restore-publish-media',restore);assert.ok(foreign.error);assert.equal(foreign.selection,undefined); owner='owner-a';
  modified=2; const changed=await invoke('matrix:restore-publish-media',restore);assert.ok(changed.error);assert.equal(changed.code,'PUBLISH_MEDIA_RESELECT_REQUIRED');checks += 4;
  const missing=await invoke('matrix:restore-publish-media',{...restore,recoveryId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'});assert.equal(missing.code,'PUBLISH_MEDIA_RESELECT_REQUIRED');assert.equal(missing.selection,undefined);checks+=2;
  for(const denied of [await invoke('matrix:restore-publish-media',{...restore,accessToken:'wrong'}),await invoke('matrix:restore-publish-media',restore,99),await invoke('matrix:restore-publish-media',{...restore,recoveryId:'../../secret'})]){assert.ok(denied.error);assert.equal(denied.code,undefined);checks+=2;}
  modified=1;
  const withCover=await store.save('owner-a',media,[{index:1,selection:{...cover,files:[{...cover.files[0],modified:99}]}}]);
  const customRequest={...restore,recoveryId:withCover.recoveryId};
  assert.equal((await invoke('matrix:restore-publish-media',customRequest)).code,'PUBLISH_MEDIA_RESELECT_REQUIRED');
  const automatic=await invoke('matrix:restore-publish-media',{...customRequest,skipCovers:true});
  assert.equal(automatic.selection.files[0].name,'video.mp4');assert.deepEqual(automatic.covers,[]);
  assert.equal(store.read('owner-a',withCover.recoveryId).covers.length,1,'Switching this retry must not mutate durable references of past attempts');checks+=4;
  modified=2;assert.equal((await invoke('matrix:restore-publish-media',{...customRequest,skipCovers:true})).code,'PUBLISH_MEDIA_RESELECT_REQUIRED');checks++;
  for(const denied of [await invoke('matrix:restore-publish-media',{...customRequest,skipCovers:true,accessToken:'wrong'}),await invoke('matrix:restore-publish-media',{...customRequest,skipCovers:true},99),await invoke('matrix:restore-publish-media',{...customRequest,skipCovers:'true'})]){assert.ok(denied.error);assert.equal(denied.selection,undefined);checks+=2;}
  modified=1;
  const jpeg=Buffer.from([255,216,255,192,0,17,8,1,224,2,128,3,1,17,0,2,17,0,3,17,0,255,217]),dataUrl='data:image/jpeg;base64,'+jpeg.toString('base64');
  const frame=store.captureFrame('owner-a',dataUrl,1.25);assert.equal(frame.mediaType,'image');assert.equal(fs.readFileSync(frame.paths[0]).length,4);assert.ok(frame.paths[0].startsWith(root+path.sep));checks+=3;
  const beforeDecode=frameDecodes;
  const huge=Buffer.from(jpeg);huge.writeUInt16BE(5000,9);
  for(const [data,at]of [['data:image/png;base64,AAAA',0],['file:///private',0],[dataUrl,-1],[dataUrl,Infinity],['data:image/jpeg;base64,'+huge.toString('base64'),0],['data:image/jpeg;base64,'+'A'.repeat(6000001),0]]){assert.throws(()=>store.captureFrame('owner-a',data,at));checks++;}
  assert.equal(frameDecodes,beforeDecode);checks++;
  const frameVideo=(await invoke('matrix:choose-media',{mediaType:'video'})).selection;
  const frameInput={accessToken:'test-token',selectionId:frameVideo.id,dataUrl,at:2};
  const captured=await invoke('matrix:capture-publish-frame',frameInput);assert.equal(captured.selection.mediaType,'image');assert.equal(captured.selection.files.length,1);assert.ok(!JSON.stringify(captured).includes(root));assert.ok(!JSON.stringify(captured).includes(dataUrl));checks+=4;
  for(const denied of [await invoke('matrix:capture-publish-frame',frameInput,99),await invoke('matrix:capture-publish-frame',{...frameInput,accessToken:'wrong'}),await invoke('matrix:capture-publish-frame',{...frameInput,selectionId:'not-owned'})]){assert.ok(denied.error);assert.equal(denied.selection,undefined);checks+=2;}
  modified=2;assert.ok((await invoke('matrix:capture-publish-frame',frameInput)).error);checks++;
  console.log(JSON.stringify({ publishMediaRecoveryChecks:checks,pathsOrCredentialsExposed:false,externalPlatformActions:false }));
})().catch(error=>{console.error(error);process.exitCode=1});

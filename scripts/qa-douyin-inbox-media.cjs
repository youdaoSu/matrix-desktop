// Synthetic encrypted image containers and isolated native IPC only.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const media=require('../desktop/douyin-inbox-media.cjs'),{registerDouyinInbox}=require('../desktop/douyin-inbox.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},reject=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zy8QAAAAASUVORK5CYII=','base64'),key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([iv,cipher.update(png),cipher.final(),cipher.getAuthTag()]);
const raw=JSON.stringify({resource_url:{skey:key.toString('hex'),origin_url_list:['https://p1.byteimg.com/origin'],thumb_url_list:['https://p1.byteimg.com/thumb']}}),descriptor=media.imageAttachment(raw,27);
(async()=>{
 eq(media.IMAGE_ACCEPT.includes('image/avif'),false);for(const format of ['webp','png','jpeg','gif'])eq(media.IMAGE_ACCEPT.includes('image/'+format),true);
 const emojiUrl='https://sf3-cdn-tos.douyinstatic.com/obj/ies-douyin-opencn/emoji/qa-3x.png';eq(media.mediaUrl(emojiUrl),emojiUrl);eq(require('../desktop/douyin-inbox-content.cjs').displayContent(JSON.stringify({url:emojiUrl}),5).mediaUrl,emojiUrl);for(const bad of [emojiUrl.replace('.png','.js'),emojiUrl.replace('/emoji/','/private/'),emojiUrl.replace('douyinstatic.com','douyinstatic.com.evil.invalid')])eq(media.mediaUrl(bad),undefined);
 eq(descriptor.urls,['https://p1.byteimg.com/thumb','https://p1.byteimg.com/origin']);eq(media.decodeImage(encrypted,key.toString('hex')),png);eq(media.decodeImage(png),png);eq(media.mime(png),'image/png');
 const coverRaw=JSON.stringify({resource_url:{url_list:['https://p1.byteimg.com/not-cover']},cover_url:{thumb_url_list:['https://p1.byteimg.com/card-thumb'],origin_url_list:['https://p1.byteimg.com/card-origin']},aweme_id:'7676793092176410191',content_title:'QA作品标题'});
 for(const type of [8,77,16,75,105]){
  const cover=media.imageAttachment(coverRaw,type);eq(cover.urls,['https://p1.byteimg.com/card-thumb','https://p1.byteimg.com/card-origin']);eq(cover.key,undefined);eq(cover.fingerprint===media.imageAttachment(coverRaw,27).fingerprint,false);
  const projected=require('../desktop/douyin-inbox-content.cjs').displayContent(coverRaw,type);eq(projected.contentKind,'card');eq(cover.urls.includes(projected.cardCoverUrl),true);
  for(const status of [1,2,3,4]){assert.throws(()=>media.imageAttachment(coverRaw,type,status),/不是可访问/);checks++;}
 }
 eq(media.imageAttachment(JSON.stringify({cover:'https://p1.byteimg.com/cover'}),8).urls,['https://p1.byteimg.com/cover']);
 for(const body of [{cover_url:'https://private.test/cover'},{cover_url:'https://p1.byteimg.com.evil.invalid/cover'},{cover_url:'http://p1.byteimg.com/cover'},{cover_url:'https://user:secret@p1.byteimg.com/cover'},{link_url:'https://p1.byteimg.com/cover'},{aweme_id:'7676793092176410191'},{resource_url:{url_list:['https://p1.byteimg.com/not-cover']}}]){assert.throws(()=>media.imageAttachment(JSON.stringify(body),8),/未提供/);checks++;}
 for(const type of [26,25,6,1001,7]){assert.throws(()=>media.imageAttachment(coverRaw,type),/不是可访问/);checks++;}
 for(const status of [1,2,3,4]){assert.throws(()=>media.imageAttachment(raw,27,status),/不可访问|不是可访问/);checks++;}
 for(const url of ['http://p1.byteimg.com/a','https://127.0.0.1/a','https://p1.byteimg.com.evil.test/a','https://user:secret@p1.byteimg.com/a','https://p1.byteimg.com:444/a','file:///private'])eq(media.mediaUrl(url),undefined);
 for(const bytes of [Buffer.from('<html>not an image</html>'),encrypted.subarray(0,27),Buffer.concat([encrypted.subarray(0,-1),Buffer.from([encrypted.at(-1)^1])])]){assert.throws(()=>media.decodeImage(bytes,key.toString('hex')),/解密|格式/);checks++;}
 await reject(()=>media.loadImage({urls:['https://private.test/a']},async()=>{},()=>{throw Error('Network must not run');}),/不属于/);
 let calls=0,guards=0;let result=await media.loadImage(descriptor,async()=>{guards++;},async()=>{calls++;return encrypted;});eq(result.dataUrl,'data:image/png;base64,'+png.toString('base64'));eq(guards,2);eq(calls,1);
 calls=0;result=await media.loadImage(descriptor,async()=>{},async()=>{if(++calls===1)throw Object.assign(Error('图片读取返回 HTTP 404'),{status:404});return encrypted;});eq(calls,2);eq(result.bytes,png.length);
 calls=0;await reject(()=>media.loadImage(descriptor,async()=>{},async()=>{calls++;throw Object.assign(Error('图片读取返回 HTTP 403'),{status:403});}),/403/);eq(calls,1);
 await reject(()=>media.loadImage(descriptor,async()=>{throw Error('账号已切换');},async()=>{throw Error('Network must not run');}),/账号已切换/);
 // Real native service authorization, exact archived message reference and
 // encrypted persistent display cache; no caller URL/key reaches network.
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-media-native-'));
 let handler,loaderCalls=0,authSession=crypto.randomUUID(),release,hold=false,activeRaw=raw,expectedDescriptor=descriptor,cardStatus=0;
 const cards=[8,77,16,75,105].map((messageType,index)=>({conversationId:'900',conversationType:2,conversationShortId:'901',serverMessageId:String(903+index),sender:'200',messageType,content:coverRaw,indexInConversation:String(2+index),version:'2'}));
 const account={id:crypto.randomUUID(),platform:'douyin',connectorSessionId:authSession,nativeAccountKey:'qa-own'},win={webContents:{id:1},isDestroyed:()=>false};
 const service=registerDouyinInbox({ipcMain:{handle:(_name,fn)=>handler=fn},getWindow:()=>win,authenticate:async()=>({userId:'qa-owner',account:{...account,connectorSessionId:authSession}}),session:{fromPartition:()=>({})},safeStorage:{isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from('TEST_ONLY:'+value),decryptString:bytes=>bytes.toString().slice(10)},userData:directory,
  transportFactory:async()=>({ownUid:'100',close(){},connect:async()=>()=>{},read:async kind=>kind==='init'?{hasMore:false,cursor:'0',conversations:[{conversationId:'900',conversationType:2,conversationShortId:'901',conversationCoreInfo:{name:'QA群'}}],messages:[{conversationId:'900',conversationType:2,conversationShortId:'901',serverMessageId:'902',sender:'200',secSender:'MS4wQaPeer',messageType:27,content:activeRaw,indexInConversation:'1',version:'1'},...cards.map(m=>({...m,status:cardStatus,version:cardStatus?'3':'2'}))]}:{hasMore:false,cursor:'0',messages:[]}}),
  imageLoader:async(d,guard)=>{loaderCalls++;eq(d.fingerprint,expectedDescriptor.fingerprint);await guard();if(hold)await new Promise(resolve=>release=resolve);await guard();return {dataUrl:'data:image/png;base64,'+png.toString('base64'),bytes:png.length};}});
 try{
 const input={command:'watch',accountId:account.id,accessToken:'qa-token'},event={sender:win.webContents};let r;
 for(let n=0;n<100;n++){r=await handler(event,input);if(r.status?.messageCount===6)break;await new Promise(resolve=>setTimeout(resolve,5));}eq(r.status.messageCount,6);
 const attachment={...input,command:'attachment',threadId:'900',messageId:'902'};
 r=await handler(event,attachment);eq(r.attachment.dataUrl.startsWith('data:image/png;'),true);eq(r.threads,undefined);eq(JSON.stringify(r).includes(key.toString('hex')),false);
 await handler(event,attachment);eq(loaderCalls,1);
 for(const extra of [{url:'https://p1.byteimg.com/a'},{key:'secret'},{threadId:'wrong'},{messageId:'999'}]){r=await handler(event,{...attachment,...extra});eq(r.attachment,undefined);eq(typeof r.error,'string');}eq(loaderCalls,1);
 r=await handler({sender:{}},attachment);eq(r.attachment,undefined);eq(loaderCalls,1);
 await handler(event,{...input,command:'stop'});await handler(event,input);r=await handler(event,attachment);eq(r.attachment.bytes,png.length);eq(loaderCalls,1);eq(fs.readdirSync(path.join(directory,'douyin-inbox-images')).filter(file=>file.endsWith('.bin')).length,1);
 await handler(event,{...input,command:'stop'});activeRaw=raw.replaceAll('/origin','/origin-new').replaceAll('/thumb','/thumb-new');expectedDescriptor=media.imageAttachment(activeRaw,27);hold=true;await handler(event,input);for(let n=0;n<150;n++){r=await handler(event,{...input,command:'messages',threadId:'900'});if(r.messages?.[0]?.mediaUrl?.endsWith('/origin-new'))break;await new Promise(resolve=>setTimeout(resolve,5));}eq(r.messages[0].mediaUrl.endsWith('/origin-new'),true);
 const pending=handler(event,attachment);for(let n=0;n<100&&!release;n++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(release);checks++;authSession=crypto.randomUUID();release();r=await pending;eq(r.attachment,undefined);eq(typeof r.error,'string');eq(fs.readdirSync(path.join(directory,'douyin-inbox-images')).filter(file=>file.endsWith('.bin')).length,1);
 // Covers use the same authenticated archive command and encrypted cache,
 // not the renderer's URL. All five existing card types share one proven cover.
 hold=false;expectedDescriptor=media.imageAttachment(coverRaw,8);await handler(event,{...input,command:'stop'});
 for(let n=0;n<100;n++){r=await handler(event,input);if(r.status?.messageCount===6)break;await new Promise(resolve=>setTimeout(resolve,5));}
 const beforeCover=loaderCalls;
 for(const card of cards){r=await handler(event,{...attachment,messageId:card.serverMessageId});eq(r.attachment?.dataUrl,'data:image/png;base64,'+png.toString('base64'));eq(JSON.stringify(r).includes('/card-origin'),false);}
 eq(loaderCalls,beforeCover+1);eq(fs.readdirSync(path.join(directory,'douyin-inbox-images')).filter(file=>file.endsWith('.bin')).length,2);
 await handler(event,{...input,command:'stop'});await handler(event,input);r=await handler(event,{...attachment,messageId:'903'});eq(r.attachment?.bytes,png.length);eq(loaderCalls,beforeCover+1);
 // A withdrawal must block even a previously cached cover, without another GET.
 cardStatus=3;await handler(event,{...input,command:'stop'});await handler(event,input);
 for(let n=0;n<100;n++){r=await handler(event,{...input,command:'messages',threadId:'900'});if(r.messages?.find(m=>m.id==='903')?.status===3)break;await new Promise(resolve=>setTimeout(resolve,5));}eq(r.messages.find(m=>m.id==='903').text,'消息已撤回');
 r=await handler(event,{...attachment,messageId:'903'});eq(r.attachment,undefined);eq(typeof r.error,'string');eq(loaderCalls,beforeCover+1);
 }finally{service.close();assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));fs.rmSync(directory,{recursive:true});}
 console.log(JSON.stringify({checks,authenticatedArchiveImageOnly:true,aesGcmAuthenticated:true,plaintextAndEncryptedPreviews:true,redirectsAndForeignUrlsRejected:true,permissionDenialNotRetried:true,nativeImageCache:true,accountSwitchDiscardsLateImage:true,realPlatformRequests:0,sends:0,markRead:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});

// Supplied display-resource shapes and disposable encrypted cache only.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {projectCommentMedia:project}=require('../desktop/douyin-creator-preload.cjs');
const {commentImages}=require('../desktop/douyin-interaction-media.cjs');
const {comment}=require('../desktop/douyin-interactions.cjs');
const {createInteractionCache}=require('../desktop/douyin-interaction-cache.cjs');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const url='https://p1.byteimg.com/qa-comment.gif',thumb='https://p1.byteimg.com/qa-thumb.jpg';
const shapes=[{image_list:[{origin_url:{url_list:[url]}}]},{imageList:[{originUrl:{urlList:[url]}}]},{image_list:[{url_list:url}]},{image_list:[{url:{urlList:[url]}}]},{sticker:{origin_url:{url_list:[url]},skey:'PRIVATE_NOT_EXPORTED'}},{stickers:[{animateUrl:url}]},{sticker_info:{url:url}},{stickerInfo:JSON.stringify({staticUrl:url})},{emoji:{url_list:[url]}},{emoji_info:{image_url:url}},{emojiInfo:{imageUrl:{url_list:[url]}}}];
for(const shape of shapes){const result=project({text:'[图片表情]',...shape});eq(result,{image_list:[{url_list:[url]}]});eq(commentImages(shape),[{urls:[url]}]);eq(JSON.stringify(vm.runInNewContext('('+project.toString()+')('+JSON.stringify(shape)+')',{URL})),JSON.stringify(result));}
eq(project({image_list:[{origin_url:{url_list:[url]},thumb_url:{url_list:[thumb]}}],sticker:{url:url}}),{image_list:[{url_list:[url,thumb]}]});
eq(project({stickers:[{url},{url},{url}]}).image_list.length,3);
eq(project({image_list:Array.from({length:20},(_,i)=>({url:url+'?n='+i}))}).image_list.length,9);
for(const bad of ['javascript:alert(1)','data:image/png;base64,xx','file:///private','https://user:PRIVATE@p1.byteimg.com/a'])eq(project({sticker:{url:bad}}),{});
const hint=project({text:'[图片表情]',sticker:{id:'PRIVATE_ID',skey:'PRIVATE_KEY'},arbitrary:{url}});eq(hint.image_list,undefined);eq(hint.imageReadHint.includes('sticker=object'),true);eq(/PRIVATE|https:/.test(JSON.stringify(hint)),false);
const normalized=comment({cid:'11',aweme_id:'12',text:'[图片表情]',user:{uid:'13',nickname:'QA'},...project({sticker:{url}})},{id:'12',title:'QA work'});eq(normalized.images,[{urls:[url]}]);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'matrix-comment-media-qa-'));
try{
 let writes=0;const config={directory,scope:'qa/account/session/comments',protect:value=>{writes++;return Buffer.from(value);},unprotect:bytes=>bytes.toString()},cache=createInteractionCache(config);
 const page={kind:'comments',records:[normalized],complete:false};cache.merge(page);const light={...normalized};delete light.images;
 cache.merge({...page,records:[light]});eq(cache.findRecord('11','12').images,[{urls:[url]}]);eq(writes,1);eq(createInteractionCache(config).findRecord('11','12').images,[{urls:[url]}]);
 cache.merge({...page,records:[{...light,workId:'99'}]});eq(cache.findRecord('11','99').images,undefined);
 cache.merge({...page,records:[{...light,platformUserId:'99'}]});eq(cache.findRecord('11','12').images,undefined);
 cache.merge(page);cache.merge({...page,records:[{...light,content:'QA changed text'}]});eq(cache.findRecord('11','12').images,undefined);
 cache.merge(page);cache.merge({...page,records:[{...light,images:[]}]});eq(cache.findRecord('11','12').images,[]);
 console.log(JSON.stringify({commentMediaChecks:checks,suppliedUrlVariantsOnly:true,stickerIdsNeverReconstructed:true,serializationIntoSandboxVerified:true,missingFieldDoesNotEraseAttachment:true,changedBodyAuthorWorkAndExplicitRemovalHonored:true,realPlatformRequests:0,realProfileTouched:false}));
}finally{assert.equal(path.dirname(directory),os.tmpdir());assert(path.basename(directory).startsWith('matrix-comment-media-qa-'));fs.rmSync(directory,{recursive:true,force:true});}

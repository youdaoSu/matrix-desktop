// Synthetic display/order/receipt data only. No real profiles, sends or reads.
const assert=require('node:assert/strict'),{loadTs}=require('./qa-load-typescript.cjs');
const {workOrder}=require('../desktop/douyin-work-order.cjs'),{readPage,initial}=require('../desktop/douyin-interactions.cjs');
const {displayContent}=require('../desktop/douyin-inbox-content.cjs'),{reason,sendReceipt}=require('../desktop/douyin-inbox-send.cjs'),codec=require('../desktop/douyin-inbox-codec.cjs');
const {orderDouyinWorks}=loadTs('shared/douyin-work-order.ts'),{normalizeEmojiCatalog,inlineEmojiTokens,needsInlineEmoji}=loadTs('client/src/components/workspace/douyin-inline-emoji.ts');
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},display=value=>displayContent(JSON.stringify(value),1001);
(async()=>{
 const {interactionAvatarInitial}=loadTs('shared/interaction-avatar.ts');
 for(const [name,expected]of [['😀测试','😀'],['🍀名字','🍀'],['中文','中'],['A测试','A'],['  😀空白','😀'],['','?'],['  ','?']])eq(interactionAvatarInitial(name),expected);
 const iso='2026-10-23T01:00:00.000Z',seconds=Date.parse(iso)/1000;
 for(const raw of [seconds,String(seconds),seconds*1000,String(seconds*1000)])eq(workOrder({create_time:raw}).publishedAt,iso);
 for(const raw of [null,'garbage','1e9',-1,Infinity,0,4102444800000])eq(workOrder({create_time:raw}).publishedAt,undefined);
 for(const raw of [true,1,'1']){eq(workOrder({is_top:raw},2).pinned,true);eq(workOrder({is_top:raw},2).pinnedOrder,2);}
 for(const raw of [false,0,'0'])eq(workOrder({is_top:raw},2).pinned,false);
 for(const raw of ['false',{},null,undefined,2])eq(workOrder({is_top:raw},2).pinned,undefined);
 const works=[{platformId:'old',title:'旧',publishedAt:'2026-10-01T00:00:00Z'},{platformId:'pin2',title:'置顶乙',pinned:true,pinnedOrder:1,publishedAt:iso},{platformId:'new',title:'新',publishedAt:iso},{platformId:'pin1',title:'置顶甲',pinned:true,pinnedOrder:0,publishedAt:'2020-01-01T00:00:00Z'},{platformId:'unknown',title:'不猜日期'}],copy=structuredClone(works);
 eq(orderDouyinWorks(works).map(w=>w.platformId),['pin1','pin2','new','old','unknown']);eq(works,copy);
 const homepage=works.map((work,index)=>({...work,homepageRank:4-index,homepageOrderAt:iso}));eq(orderDouyinWorks(homepage).map(work=>work.platformId),['unknown','pin1','new','pin2','old']);
 eq(orderDouyinWorks([...homepage,{platformId:'just-published',title:'QA',publishedAt:'2026-10-24T00:00:00Z',pinned:false}]).map(work=>work.platformId),['pin1','pin2','just-published','new','old','unknown']);
 eq(orderDouyinWorks(homepage).map(work=>work.platformId),['unknown','pin1','new','pin2','old']);
 eq(workOrder({homepage_rank:2,homepage_order_at:iso}).homepageRank,2);eq(workOrder({homepage_rank:100,homepage_order_at:iso}).homepageRank,undefined);
 eq(orderDouyinWorks([{platformId:'1',title:'2026最新'},{platformId:'9',title:'1999旧'}]).map(w=>w.platformId),['1','9']);
 const own='9007199254740993',work='900719925474001',client={ownUid:own,readWeb:async()=>({aweme_list:[{aweme_id:work,desc:'QA',author:{uid:own},create_time:seconds,is_top:1}],has_more:false,max_cursor:'0'})};
 let page=await readPage(client,initial('comments'));eq(page.works[0].publishedAt,iso);eq(page.works[0].pinned,true);eq(page.works[0].pinnedOrder,0);
 client.readLatest=async()=>({comments:[],has_more:false,cursor:'0'});const state={...initial('comments'),workEnded:true,seenWorks:[work],headWorks:[{id:work,title:'QA',historyComplete:true}],inventoryAt:0,headAt:1};
 page=await readPage(client,state,{previewFirst:true,now:()=>100000});eq(page.works[0].publishedAt,iso);eq(page.works[0].pinned,true);
 for(const container of ['content','msg_content','template_info','templateInfo','push_detail']){
   eq(display({[container]:{tips:'{{1}} 加入',template:[{key:1,name:'QA昵称'}]}}).text,'QA昵称 加入');
   eq(display({[container]:JSON.stringify({text:'QA嵌套系统正文'})}).text,'QA嵌套系统正文');
 }
 eq(display({tips:'{1} 邀请 {{2}}',template:{1:{name:'QA甲'},2:{name:'QA乙'}}}).text,'QA甲 邀请 QA乙');
 eq(display({content:JSON.stringify({token:'PRIVATE_TOKEN',unknown:'PRIVATE_TEXT'})}).text,'系统提示');
 eq(JSON.stringify(display({content:JSON.stringify({token:'PRIVATE_TOKEN'})})).includes('PRIVATE_TOKEN'),false);
 eq(display({text:'QA原正文',tips:'不覆盖'}).text,'QA原正文');eq(display({aweType:100145}).text,'系统提示');
 eq(displayContent(JSON.stringify({content:{tips:'PRIVATE_HIDDEN'}}),1001,3).text,'消息已撤回');
 const {imageAttachment}=require('../desktop/douyin-inbox-media.cjs');
 for(const type of [1,1001])for(const field of ['stickers','joker_stickers']){
   const raw=JSON.stringify({[field]:[{static_url:{url_list:['https://p1.byteimg.com/qa-sticker']}}]});const projected=displayContent(raw,type);eq(projected.contentKind,'emoji');eq(projected.mediaUrl,'https://p1.byteimg.com/qa-sticker');eq(projected.textIsMediaLabel,true);eq(imageAttachment(raw,type).urls,['https://p1.byteimg.com/qa-sticker']);
   eq(displayContent(raw,type,3).contentKind,'system');assert.throws(()=>imageAttachment(raw,type,3));checks++;
 }
 assert.throws(()=>imageAttachment(JSON.stringify({tips:'QA system',url:'https://p1.byteimg.com/not-sticker'}),1001));checks++;
 const map=normalizeEmojiCatalog([{name:'[赞]',img:'qa-thumb'},{name:'玫瑰',img:'qa-rose'},{name:'隐藏',img:'qa',hide:true},{name:'坏路径',img:'../private'},{name:'坏URL',img:'https://evil.invalid/p.png'}]);
 // hide belongs to the official picker, not historical shortcode rendering.
 eq(Object.keys(map),['[赞]','[玫瑰]','[隐藏]']);eq(map['[赞]'],'https://sf3-cdn-tos.douyinstatic.com/obj/ies-douyin-opencn/emoji/qa-thumb-3x.png');
 eq(normalizeEmojiCatalog([{name:'星星眼',img:'https://p3-pc-sign.douyinpic.com/obj/qa?x-signature=public'}])['[星星眼]'],'https://p3-pc-sign.douyinpic.com/obj/qa?x-signature=public');
 eq(Object.keys(normalizeEmojiCatalog([{name:'冲突',img:'one'},{name:'冲突',img:'two'}])),[]);
 eq(inlineEmojiTokens('QA[赞][赞][赞]文字[玫瑰]'),['QA','[赞]','[赞]','[赞]','文字','[玫瑰]']);eq(needsInlineEmoji('[赞]'),true);eq(needsInlineEmoji('[图片表情]'),false);eq(needsInlineEmoji('纯文字 👍'),false);eq(needsInlineEmoji('[不闭合'),false);
 eq(Object.keys(normalizeEmojiCatalog({stickers:[]})),[]);eq(Object.keys(normalizeEmojiCatalog(Array(2001).fill({name:'赞',img:'x'}))),[]);
 eq(reason(JSON.stringify({status_msg:'QA官方说明'})),'QA官方说明');eq(reason(JSON.stringify({status_msg:{msg_content:JSON.stringify({tips:'QA审核说明'})}})),'QA审核说明');
 for(const raw of [JSON.stringify({tips:'token=PRIVATE'}),JSON.stringify({status_msg:{authorization:'PRIVATE'}}),JSON.stringify({tips:'https://secret.invalid/'})])eq(reason(raw),'');
 const requestId='11111111-1111-4111-8111-111111111111';const bytes=codec.encode('Response',{cmd:100,sequenceId:'9',statusCode:0,body:{sendMessageBody:{clientMessageId:requestId,status:3,checkCode:'8611'}}});
 const receipt=sendReceipt(bytes,9,requestId);eq(receipt.state,'failed');eq(receipt.message.includes('8611'),true);eq(receipt.message.includes('不会自动重发'),true);
 const {systemShape}=require('../desktop/douyin-inbox-content.cjs');const shape=systemShape(JSON.stringify({aweType:100140,tips:'',template:[{key:'PRIVATE_NAME',default_pattern:'PRIVATE_BODY'}],active_users:[{nickname:'PRIVATE_NAME'}],private_token:'PRIVATE_TOKEN'}));eq(shape.includes('tips=string'),true);eq(shape.includes('lengths{tips=0}'),true);eq(shape.includes('default_pattern=12'),true);eq(/PRIVATE_NAME|PRIVATE_BODY|PRIVATE_TOKEN/.test(shape),false);
 console.log(JSON.stringify({displayFeedbackChecks:checks,pinnedAndTimeOrder:true,noInventedDateOrSystemEvent:true,inlineEmojiCatalogValidated:true,officialAuditRefusalPreserved:true,realPlatformRequests:0,realBusinessWrites:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
